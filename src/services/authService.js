/**
 * authService.js — 身分驗證（雙模式）
 *
 * 對應舊檔：js/auth.js + js/msalAuth.js + login.html 內嵌的登入邏輯
 *
 * ── 為什麼是雙模式 ─────────────────────────────────────────────────────
 * 舊後端（GAS）只認自己發的 session token：帳密登入後在 CacheService 種一個
 * sess_<token>（backend-api.gs:86），之後每個請求把它當 query param 帶上，
 * 由 _getSession 查表驗證（backend-api.gs:90-102）。GAS 裡沒有任何一行
 * JWT／JWKS／issuer 的程式碼，所以把 Entra 的 token 丟給它必定失敗。
 *
 * 新後端（backend/ 的 Azure Functions）則相反：用 jsonwebtoken + jwks-rsa
 * 驗 Microsoft Entra ID 的 JWT（backend/sys_tokenValidator.js），權限由
 * GET /permissions/check 回傳。
 *
 * 兩者不可能同時成立，因此本檔依 config.js 的 authMode 分流。
 * 對 AuthContext 以上的程式碼來說，兩種模式的回傳形狀完全一樣。
 *
 * ── 逾時處理的改變 ─────────────────────────────────────────────────────
 * 舊版有兩個互相打架的時鐘：前端在登入時記一個固定 timestamp 然後自行倒數
 * 6 小時（js/auth.js:43），後端的 TTL 卻是每次請求都會延長。這裡一律以
 * 後端為準——不自己倒數，收到 AuthError 才判定逾期。
 */

import { CONFIG, authMode, isLocal } from '../config.js';
import { callApi } from './apiClient.js';
import { AuthError } from './apiErrors.js';

const AUTH_KEY = 'authData';
const SSO_TOKEN_KEY = 'sso_jwt';

/** 本機開發模式的假身分，讓開發者不必登入就能跑畫面 */
const LOCAL_ACCOUNT = { username: 'local-dev', name: '本機開發者', role: 'admin' };
const LOCAL_PERMISSIONS = { allowed: true, isAdmin: true, isSuperAdmin: true, email: 'local-dev' };

/* ────────────────────────────── 儲存 ────────────────────────────── */

// 本機模式用 localStorage（重開瀏覽器仍在），線上用 sessionStorage（關掉即失效）
function storage() {
  return isLocal ? localStorage : sessionStorage;
}

function readStorage(key) {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    storage().setItem(key, value);
  } catch {
    // 無痕模式或瀏覽器限制，忽略
  }
}

function removeStorage(key) {
  try {
    storage().removeItem(key);
    // 舊版同時寫過 localStorage，一併清掉避免殘留
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    // 忽略
  }
}

function readAuthData() {
  try {
    const raw = readStorage(AUTH_KEY) || localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ──────────────────────── 角色 → 權限對照 ──────────────────────── */

/**
 * 舊後端的角色只有 admin / teacher 兩種（backend-api.gs:1241-1242），
 * 新架構統一用 allowed / isAdmin / isSuperAdmin 三個布林值表達。
 *
 * ⚠️ 已知不一致：後端允許 teacher 寫入 courseAssignments，只擋 teachers 與
 * maritimeCourses（backend-api.gs:292）。也就是說 teacher 在「訓練排程」頁
 * 其實有完整編輯權，但在其他頁只能看。這是舊系統既有的行為，這裡照實反映，
 * 沒有偷偷收緊或放寬——要不要改是業務決定。
 */
export function permissionsFromLegacyRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return {
    allowed: normalized === 'admin' || normalized === 'teacher',
    isAdmin: normalized === 'admin',
    isSuperAdmin: normalized === 'admin',
    canEditSchedule: normalized === 'admin' || normalized === 'teacher',
    role: normalized
  };
}

/* ────────────────────────── MSAL（entra 模式）────────────────────── */

let msalInstance = null;

async function getMsal() {
  if (!CONFIG.msal.clientId || !CONFIG.msal.authority) {
    throw new AuthError('config.js 的 msal 設定尚未填寫（clientId / authority）');
  }
  if (!msalInstance) {
    // 動態載入：gas 模式下完全不需要 MSAL，別讓它進入首屏 bundle
    const { PublicClientApplication } = await import('@azure/msal-browser');
    msalInstance = new PublicClientApplication({
      auth: {
        clientId: CONFIG.msal.clientId,
        authority: CONFIG.msal.authority,
        redirectUri: CONFIG.msal.redirectUri
      },
      cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false }
    });
    await msalInstance.initialize();
  }
  return msalInstance;
}

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** 取回有效的 SSO token（由外部系統以 ?token= 帶入），過期則清掉 */
export function getSsoToken() {
  const token = readStorage(SSO_TOKEN_KEY);
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload || (payload.exp && Date.now() / 1000 > payload.exp)) {
    removeStorage(SSO_TOKEN_KEY);
    return null;
  }
  return token;
}

/* ────────────────────────────── 對外 API ────────────────────────── */

/**
 * 啟動時還原登入狀態。
 * @returns {Promise<{account, permissions, token}>}
 */
export async function initializeAuth() {
  if (isLocal) {
    return { account: LOCAL_ACCOUNT, permissions: LOCAL_PERMISSIONS, token: 'local-dev-token' };
  }

  if (authMode === 'gas') {
    const authData = readAuthData();
    if (!authData?.token) return { account: null, permissions: null, token: null };
    return {
      account: { username: authData.username, name: authData.name || authData.username, role: authData.role },
      permissions: permissionsFromLegacyRole(authData.role),
      token: authData.token
    };
  }

  // ── entra 模式 ──────────────────────────────────────────────────
  // 外部系統可用 ?token=<加密 token> 導進來，換成本站的 SSO JWT
  const params = new URLSearchParams(window.location.search);
  const incoming = params.get('token');
  if (incoming) {
    const data = await callApi('/auth/sso', { method: 'POST', body: { token: incoming } }).catch(() => null);
    if (data?.token) {
      writeStorage(SSO_TOKEN_KEY, data.token);
      history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
    }
  }

  const ssoToken = getSsoToken();
  if (ssoToken) {
    return {
      account: { username: 'sso-user', name: 'SSO 使用者', isSsoGuest: true },
      permissions: null, // 由 AuthContext 打 /permissions/check 取得
      token: ssoToken
    };
  }

  const msal = await getMsal();
  const redirectResponse = await msal.handleRedirectPromise();
  const account = redirectResponse?.account || msal.getAllAccounts()[0] || null;
  if (account) msal.setActiveAccount(account);

  return {
    account,
    permissions: null,
    token: account ? await acquireToken(account, false) : null
  };
}

/** 取得目前有效的 token（apiClient 每次請求前都會呼叫） */
export async function acquireToken(account, forceRefresh = false) {
  if (isLocal) return 'local-dev-token';

  if (authMode === 'gas') {
    return readAuthData()?.token || null;
  }

  const ssoToken = getSsoToken();
  if (ssoToken) return ssoToken;
  if (!account) return null;

  try {
    const msal = await getMsal();
    const response = await msal.acquireTokenSilent({
      scopes: CONFIG.msal.scopes,
      account,
      forceRefresh
    });
    return response?.idToken || response?.accessToken || null;
  } catch {
    return null;
  }
}

/**
 * 帳密登入（僅 gas 模式）。成功後把 token 寫進 sessionStorage。
 * 沿用舊版的 authData 格式，讓尚未遷移的舊頁面仍能共用同一個登入狀態。
 */
export async function loginWithCredentials(username, password) {
  if (authMode !== 'gas') {
    throw new AuthError('目前設定為 Entra 登入模式，不接受帳號密碼');
  }
  const cleanUsername = String(username || '').trim();
  if (!cleanUsername || !password) throw new AuthError('請輸入帳號與密碼');

  const result = await callApi('/auth/login', {
    method: 'POST',
    body: { username: cleanUsername, password }
  });

  const user = result?.data?.user || result?.user;
  const token = result?.data?.token || result?.token;
  if (!token) throw new AuthError('登入失敗：後端未回傳 token');

  const authData = {
    username: user?.username || cleanUsername,
    name: user?.name || user?.username || cleanUsername,
    role: user?.role || 'teacher',
    token,
    timestamp: Date.now()
  };
  writeStorage(AUTH_KEY, JSON.stringify(authData));

  return {
    account: { username: authData.username, name: authData.name, role: authData.role },
    permissions: permissionsFromLegacyRole(authData.role),
    token
  };
}

/** Entra 登入（僅 rest 模式），走 redirect flow */
export async function loginWithHint(email = '') {
  if (authMode !== 'entra') {
    throw new AuthError('目前設定為帳號密碼登入模式');
  }
  const msal = await getMsal();
  const normalized = String(email || '').trim().toLowerCase();
  await msal.loginRedirect({
    scopes: CONFIG.msal.scopes,
    ...(normalized ? { loginHint: normalized } : {})
  });
}

/** 登出：兩種模式共用 */
export async function logout(account) {
  removeStorage(AUTH_KEY);
  removeStorage(SSO_TOKEN_KEY);

  try {
    sessionStorage.clear();
    if (isLocal) localStorage.clear();
  } catch {
    // 忽略
  }

  if (authMode === 'entra' && msalInstance) {
    await msalInstance.logoutRedirect({
      account,
      postLogoutRedirectUri: CONFIG.msal.redirectUri
    });
    return;
  }

  // gas 模式沒有後端登出端點，清掉本地狀態即可；
  // 導頁交給 React Router，這裡不碰 window.location。
}
