/**
 * permissionsApi.js — 使用者權限（白名單）的領域模組
 *
 * 對應舊檔：js/msalAuth.js 的 checkPermissions (:133)。
 * 舊版只有「問後端我能不能進來」這一半；「誰可以進來」從來沒有前端介面，
 * 一律要人工改資料庫。本模組補齊另一半，支撐 /users 管理畫面。
 *
 * 後端契約（backend/permissionsApi.js、backend/sys_permissions.js）：
 *   GET    /permissions/check  → { email, allowed, isAdmin, isSuperAdmin }
 *   GET    /permissions        → { data: { superAdmins, admins, allowedUsers } }  僅 superAdmin
 *   POST   /permissions        ← { superAdmins, admins, allowedUsers } 整份覆蓋，僅 superAdmin
 *   POST   /permissions/user   ← { email, role }   superAdmin/admin 角色需 superAdmin；allowedUser 需 admin
 *   DELETE /permissions/user   ← { email, role }   移除最後一位 superAdmin 會被後端擋下
 *
 * ── 三種執行模式 ───────────────────────────────────────────────────────
 * 這些路由只存在於內網的 Azure Functions，舊的 Google Apps Script 後端沒有，
 * 所以本模組依 isLocal / CONFIG.backend 分流，而不是假裝端點一直都在：
 *
 *   local（isLocal）      讀寫 localStorage，離線也能開發 /users 畫面。
 *   gas（backend:'gas'）  讀取類函式由「目前登入者的舊角色」推導（見
 *                         authService.js 的 permissionsFromLegacyRole），
 *                         寫入類函式一律丟出中文錯誤說明需要內網後端。
 *                         不打 callApi，因為 gasAdapter 沒有也不該有這些路由。
 *   rest（backend:'rest'）真的呼叫上面五條路由。
 *
 * ── 資料模型的一個已知特性 ─────────────────────────────────────────────
 * 後端 permissions 資料表是 (email, role) 一列一筆，同一個 email 理論上可以
 * 同時存在多列。本模組的正規化一律把同一個人收斂到「最高的那一個角色」
 * （superAdmin > admin > allowedUser），送出去的整份 payload 也保證如此。
 */

import { CONFIG, isLocal } from '../config.js';
import { callApi } from './apiClient.js';
import { ApiError } from './apiErrors.js';
import { initializeAuth } from './authService.js';
import { LOCAL_TABLES, readLocalTable, writeLocalTable } from './localStore.js';

/* ────────────────────────── 角色定義 ────────────────────────── */

/**
 * 正式的角色清單，順序即優先權（越前面越大）。
 * value 與 bucket 必須與後端一致，label 給畫面用。
 */
export const ROLES = [
  {
    value: 'superAdmin',
    bucket: 'superAdmins',
    label: '超級管理員',
    description: '可管理所有使用者與權限設定'
  },
  {
    value: 'admin',
    bucket: 'admins',
    label: '管理員',
    description: '可管理一般使用者，並編輯所有資料'
  },
  {
    value: 'allowedUser',
    bucket: 'allowedUsers',
    label: '一般使用者',
    description: '可登入系統並檢視資料'
  }
];

/** 只有這三個角色字串會被後端接受（backend/permissionsApi.js:212） */
const ROLE_VALUES = ROLES.map((role) => role.value);

/** 三個 bucket 的鍵名，依優先權排序 */
const BUCKETS = ROLES.map((role) => role.bucket);

/** 取得角色的中文名稱；未知角色原樣回傳，不讓畫面炸掉 */
export function roleLabel(value) {
  return ROLES.find((role) => role.value === value)?.label || String(value || '');
}

/* ────────────────────────── 共用訊息 ────────────────────────── */

const NO_BACKEND_MESSAGE =
  '使用者管理需要內網後端（Azure Functions）。目前連線的是舊版 Google Apps Script 後端，' +
  '沒有權限管理端點；請於 config.js 將 backend 切換為 rest 後再操作。';

const LOCKOUT_MESSAGE =
  '至少需要保留一位超級管理員，否則所有人都會被永久鎖在系統外，只能請資料庫管理員手動救援。';

/** 本機開發模式的假身分，與 authService.js 的 LOCAL_ACCOUNT 對應 */
const LOCAL_DEV_EMAIL = 'local-dev@example.com';

/** /users 畫面可用來判斷要不要顯示「唯讀」提示 */
export function isUserManagementAvailable() {
  return isLocal || CONFIG.backend === 'rest';
}

/** 不可用時要顯示給使用者看的原因 */
export const USER_MANAGEMENT_HINT = NO_BACKEND_MESSAGE;

/* ────────────────────────── 正規化 ────────────────────────── */

function emptyPayload() {
  return { superAdmins: [], admins: [], allowedUsers: [] };
}

/** 去空白 + 轉小寫，與後端 sys_permissions.js 的存法一致 */
function normalizeEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

/**
 * 寬鬆的信箱格式檢查：只要求 a@b，不強制頂級網域。
 * 內網信箱可能長得像 user@intranet，硬套嚴格規則會擋掉合法帳號。
 */
function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+$/.test(value);
}

/**
 * 把任意形狀的權限資料整理成正規的三陣列。
 *   1. 去空白、轉小寫
 *   2. 去除重複
 *   3. 同一個人只留最高的角色（superAdmin > admin > allowedUser）
 *
 * 讀進來與送出去都會經過這一關，所以畫面上看到的與存進資料庫的一致。
 */
export function normalizePermissionsPayload(payload) {
  const result = emptyPayload();
  const seen = new Set();

  BUCKETS.forEach((bucket) => {
    const list = Array.isArray(payload?.[bucket]) ? payload[bucket] : [];
    list.forEach((entry) => {
      const email = normalizeEmail(entry);
      if (!email || seen.has(email)) return;
      seen.add(email);
      result[bucket].push(email);
    });
  });

  return result;
}

/** 檢查角色字串合法，否則丟出中文錯誤 */
function assertRole(role) {
  if (!ROLE_VALUES.includes(role)) {
    throw new ApiError(`無效的角色「${String(role ?? '')}」，僅允許：${ROLE_VALUES.join('、')}`);
  }
  return role;
}

/** 檢查信箱有值且格式看起來正確，回傳正規化後的值 */
function assertEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new ApiError('請輸入使用者信箱');
  if (!isEmailLike(normalized)) throw new ApiError(`信箱格式不正確：${normalized}`);
  return normalized;
}

/**
 * 送出整份權限前的最後把關。
 * 回傳正規化後的 payload；有問題就丟錯，絕不讓壞資料上網路。
 */
function assertSafePayload(payload) {
  const normalized = normalizePermissionsPayload(payload);

  BUCKETS.forEach((bucket) => {
    normalized[bucket].forEach((email) => {
      if (!isEmailLike(email)) {
        throw new ApiError(`信箱格式不正確：${email}`);
      }
    });
  });

  // 這是整個模組最重要的一條規則：零個超級管理員 = 永久鎖死
  if (normalized.superAdmins.length === 0) {
    throw new ApiError(LOCKOUT_MESSAGE);
  }

  return normalized;
}

/* ────────────────────── 本機模式的儲存 ────────────────────── */

function readLocalPermissions() {
  const stored = readLocalTable(LOCAL_TABLES.permissions, null);
  if (!stored) {
    // 第一次開發時給一份種子資料，讓畫面有東西可看，也滿足「至少一位超管」
    const seed = { superAdmins: [LOCAL_DEV_EMAIL], admins: [], allowedUsers: [] };
    writeLocalTable(LOCAL_TABLES.permissions, seed);
    return seed;
  }
  return normalizePermissionsPayload(stored);
}

function writeLocalPermissions(payload) {
  const normalized = normalizePermissionsPayload(payload);
  writeLocalTable(LOCAL_TABLES.permissions, normalized);
  return normalized;
}

/* ────────────────────── gas 模式的推導 ────────────────────── */

/**
 * 舊後端沒有權限資料表，唯一能誠實說出口的只有「你自己是誰」。
 * initializeAuth() 在 gas 模式只讀 storage，不會發出任何請求。
 */
async function readLegacySession() {
  try {
    const { account, permissions } = await initializeAuth();
    return {
      email: normalizeEmail(account?.username || permissions?.email || ''),
      allowed: !!permissions?.allowed,
      isAdmin: !!permissions?.isAdmin,
      isSuperAdmin: !!permissions?.isSuperAdmin
    };
  } catch {
    // 尚未登入或 storage 被鎖住：回一個沒有任何權限的身分，別讓畫面崩潰
    return { email: '', allowed: false, isAdmin: false, isSuperAdmin: false };
  }
}

/** 把舊角色攤成三陣列的形狀，讓 /users 畫面不必為 gas 模式寫另一套渲染 */
function payloadFromLegacySession(session) {
  const payload = emptyPayload();
  if (!session.email) return payload;

  if (session.isSuperAdmin) payload.superAdmins.push(session.email);
  else if (session.isAdmin) payload.admins.push(session.email);
  else if (session.allowed) payload.allowedUsers.push(session.email);

  return payload;
}

/** 寫入類函式在 gas 模式的統一出口 */
function refuseWriteOnLegacyBackend() {
  throw new ApiError(NO_BACKEND_MESSAGE);
}

/* ────────────────────────── 對外 API ────────────────────────── */

/**
 * 取得完整白名單。
 *
 * @returns {Promise<{superAdmins: string[], admins: string[], allowedUsers: string[]}>}
 *          三個陣列皆為已去重、已小寫、同一人只出現一次的信箱。
 */
export async function getPermissions() {
  if (isLocal) {
    return readLocalPermissions();
  }

  if (CONFIG.backend !== 'rest') {
    // 舊後端沒有名單，只能誠實回報「目前登入者」這一筆
    return payloadFromLegacySession(await readLegacySession());
  }

  const result = await callApi('/permissions');
  return normalizePermissionsPayload(result?.data || result);
}

/**
 * 整份覆蓋白名單（僅 superAdmin 可用）。
 *
 * 送出前會正規化並擋掉「零個超級管理員」的自殺式設定。
 *
 * @param {{superAdmins?: string[], admins?: string[], allowedUsers?: string[]}} payload
 * @returns {Promise<{superAdmins: string[], admins: string[], allowedUsers: string[]}>}
 *          實際存進去的內容，畫面可直接拿去更新狀態。
 */
export async function updatePermissions(payload) {
  const safe = assertSafePayload(payload);

  if (isLocal) {
    return writeLocalPermissions(safe);
  }

  if (CONFIG.backend !== 'rest') {
    return refuseWriteOnLegacyBackend();
  }

  await callApi('/permissions', { method: 'POST', body: safe });
  return safe;
}

/**
 * 新增單一使用者權限。
 *
 * 後端是 (email, role) 一列一筆，所以這裡只送一個角色；
 * 本機模式則直接套用「一人一角色」規則，把較低的角色移掉。
 *
 * @param {string} email
 * @param {'superAdmin'|'admin'|'allowedUser'} role
 * @returns {Promise<{email: string, role: string}>}
 */
export async function addUser(email, role) {
  const safeEmail = assertEmail(email);
  const safeRole = assertRole(role);

  if (isLocal) {
    const current = readLocalPermissions();
    const bucket = ROLES.find((item) => item.value === safeRole).bucket;
    // 先把人從所有 bucket 移除，再放進目標 bucket，確保只屬於一個角色
    const next = emptyPayload();
    BUCKETS.forEach((key) => {
      next[key] = current[key].filter((item) => item !== safeEmail);
    });
    next[bucket] = [...next[bucket], safeEmail];
    writeLocalPermissions(next);
    return { email: safeEmail, role: safeRole };
  }

  if (CONFIG.backend !== 'rest') {
    return refuseWriteOnLegacyBackend();
  }

  await callApi('/permissions/user', {
    method: 'POST',
    body: { email: safeEmail, role: safeRole }
  });
  return { email: safeEmail, role: safeRole };
}

/**
 * 移除單一使用者的某個角色。
 *
 * 後端會擋下「移除最後一位超級管理員」（backend/permissionsApi.js:257）；
 * 本機模式沒有後端，因此在這裡自己擋一次，行為保持一致。
 *
 * @param {string} email
 * @param {'superAdmin'|'admin'|'allowedUser'} role
 * @returns {Promise<{email: string, role: string}>}
 */
export async function removeUser(email, role) {
  const safeEmail = assertEmail(email);
  const safeRole = assertRole(role);

  if (isLocal) {
    const current = readLocalPermissions();
    const bucket = ROLES.find((item) => item.value === safeRole).bucket;
    const next = { ...current, [bucket]: current[bucket].filter((item) => item !== safeEmail) };
    if (next.superAdmins.length === 0) {
      throw new ApiError(LOCKOUT_MESSAGE);
    }
    writeLocalPermissions(next);
    return { email: safeEmail, role: safeRole };
  }

  if (CONFIG.backend !== 'rest') {
    return refuseWriteOnLegacyBackend();
  }

  await callApi('/permissions/user', {
    method: 'DELETE',
    body: { email: safeEmail, role: safeRole }
  });
  return { email: safeEmail, role: safeRole };
}

/**
 * 查詢「目前登入者」的權限。
 *
 * 回傳形狀與後端 GET /permissions/check 完全相同，不多不少四個欄位。
 *
 * @returns {Promise<{email: string, allowed: boolean, isAdmin: boolean, isSuperAdmin: boolean}>}
 */
export async function checkPermissions() {
  if (isLocal) {
    // 本機開發一律當成超級管理員，與 authService.js 的 LOCAL_PERMISSIONS 一致
    return { email: LOCAL_DEV_EMAIL, allowed: true, isAdmin: true, isSuperAdmin: true };
  }

  if (CONFIG.backend !== 'rest') {
    return readLegacySession();
  }

  const result = await callApi('/permissions/check');
  return {
    email: normalizeEmail(result?.email),
    allowed: !!result?.allowed,
    isAdmin: !!result?.isAdmin,
    isSuperAdmin: !!result?.isSuperAdmin
  };
}
