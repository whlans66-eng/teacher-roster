/**
 * AuthContext.jsx — 全域身分與權限狀態
 *
 * 對應舊檔：js/auth.js 的 protectPage / ensureAuthenticated + 各頁自己寫的
 * 登入檢查。舊版每個 HTML 都要自己判斷一次，判斷結果還不一致。
 *
 * 這裡是全站唯一知道「你是誰、你能做什麼」的地方。頁面只讀 useAuth()，
 * 不自己查 storage、不自己打 /permissions/check。
 *
 * ── 五個守衛狀態 ───────────────────────────────────────────────────────
 *   loading          初始化中
 *   auth-error       驗證流程本身壞了（設定錯誤、後端無回應）
 *   not-logged-in    沒登入
 *   not-authorized   登入了但帳號不在允許名單
 *   session-expired  ← 參考實作沒有，本專案加的
 *
 * 第五個是必要的：舊版在請求層偵測到逾期就直接 alert + 轉頁，使用者正在
 * 編輯的內容會當場消失。改成一個蓋在當前路由上的對話框後，路由被保留，
 * 重新登入後可以回到原處。
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authMode, isLocal } from '../config.js';
import { callApi, setTokenProvider } from '../services/apiClient.js';
import { setAuthErrorHandler } from '../services/apiErrors.js';
import {
  acquireToken,
  initializeAuth,
  loginWithCredentials,
  loginWithHint,
  logout as logoutService
} from '../services/authService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);

  // 用 ref 存一份 account，讓 tokenProvider 不必在每次 account 變動時重建
  const accountRef = useRef(null);
  accountRef.current = account;

  /* ── token 供應：注入給 apiClient，避免 services 反向依賴 state ── */
  useEffect(() => {
    setTokenProvider(async () => acquireToken(accountRef.current, false));
  }, []);

  /* ── 身分失效：任何一支服務打到逾期 token 都會走到這裡 ── */
  useEffect(() => {
    setAuthErrorHandler(() => {
      // 已登入才算「逾期」；本來就沒登入的話讓 not-logged-in 守衛處理
      if (accountRef.current) setSessionExpired(true);
    });
    return () => setAuthErrorHandler(null);
  }, []);

  /* ── 啟動時還原登入狀態 ── */
  useEffect(() => {
    let active = true;

    async function run() {
      try {
        const result = await initializeAuth();
        if (!active) return;

        setAccount(result.account);

        if (result.permissions) {
          // gas 模式：權限由登入回傳的角色直接推導，不需要額外請求
          setPermissions(result.permissions);
        } else if (result.account || result.token) {
          // entra 模式：權限是後端的事，問 /permissions/check
          const data = await callApi('/permissions/check');
          if (!active) return;
          setPermissions(data);
          // SSO 訪客登入時前端不知道自己是誰，用後端回傳的 email 補上
          if (result.account?.isSsoGuest && data?.email) {
            setAccount({ username: data.email, name: data.email, isSsoGuest: true });
          }
        }
      } catch (err) {
        if (active) setError(err?.message || '身分驗證失敗');
      } finally {
        if (active) setReady(true);
      }
    }

    void run();
    return () => {
      active = false;
    };
  }, []);

  /* ── 對外動作 ── */

  const login = useCallback(async (credentials = {}) => {
    setError('');
    if (authMode === 'gas') {
      const result = await loginWithCredentials(credentials.username, credentials.password);
      setAccount(result.account);
      setPermissions(result.permissions);
      setSessionExpired(false);
      return result;
    }
    // entra 模式會離開頁面去 Microsoft 登入，回來時走 initializeAuth
    return loginWithHint(credentials.email || '');
  }, []);

  const logout = useCallback(async () => {
    await logoutService(account);
    setAccount(null);
    setPermissions(null);
    setSessionExpired(false);
  }, [account]);

  const refreshPermissions = useCallback(async () => {
    if (isLocal || authMode === 'gas') return permissions;
    const data = await callApi('/permissions/check');
    setPermissions(data);
    return data;
  }, [permissions]);

  const value = useMemo(
    () => ({
      // 原始狀態
      account,
      permissions,
      ready,
      error,
      sessionExpired,
      isLocal,
      authMode,

      // 推導出來的布林值——頁面一律用這些判斷，不要自己讀 permissions
      isAllowed: !!permissions?.allowed,
      isAdmin: !!permissions?.isAdmin,
      isSuperAdmin: !!permissions?.isSuperAdmin,
      // 舊後端允許 teacher 編輯訓練排程，但不能改教師與課程主檔
      // （backend-api.gs:292）。這裡照實反映該行為。
      canEditSchedule: !!(permissions?.isAdmin || permissions?.canEditSchedule),

      // 動作
      login,
      logout,
      refreshPermissions,
      dismissSessionExpired: () => setSessionExpired(false)
    }),
    [account, permissions, ready, error, sessionExpired, login, logout, refreshPermissions]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth 必須在 AuthProvider 內使用');
  return value;
}
