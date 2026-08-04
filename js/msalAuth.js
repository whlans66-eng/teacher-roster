/**
 * Azure AD (Microsoft Entra ID) 前端認證模組
 * 使用 MSAL.js 2.x 進行 OAuth 2.0 授權碼流程 (PKCE)
 *
 * 流程：
 *   1. 前端用 MSAL.js 將使用者導向 Microsoft 登入
 *   2. 登入成功後取得 Access Token
 *   3. 前端帶 Bearer Token 打 Azure Function
 *   4. Azure Function 驗證 Token + 查 SQL 白名單
 *
 * 環境變數（由頁面或設定檔注入 AZURE_CONFIG）：
 *   - AZURE_CLIENT_ID:   Azure AD App Registration 的 Client ID
 *   - AZURE_TENANT_ID:   租戶 ID
 *   - AZURE_REDIRECT_URI: 登入後導回的 URI
 *   - AZURE_API_BASE_URL: Azure Function 的 API base URL
 */

(function () {
  'use strict';

  // ==================== 設定 ====================

  const CONFIG = window.AZURE_CONFIG || {};
  const CLIENT_ID = CONFIG.clientId || '';
  const TENANT_ID = CONFIG.tenantId || '';
  const REDIRECT_URI = CONFIG.redirectUri || window.location.origin + '/';
  const API_BASE_URL = CONFIG.apiBaseUrl || '';

  const AUTH_KEY = 'azureAuthData';
  const LOGIN_PATH = 'login.html';

  // MSAL 設定
  let msalInstance = null;

  function getMsalConfig() {
    return {
      auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        redirectUri: REDIRECT_URI,
        postLogoutRedirectUri: REDIRECT_URI,
        navigateToLoginRequestUrl: true
      },
      cache: {
        cacheLocation: 'localStorage',
        storeAuthStateInCookie: false
      }
    };
  }

  // ==================== 初始化 ====================

  function ensureMsalLoaded() {
    if (typeof msal === 'undefined' || !msal.PublicClientApplication) {
      throw new Error('MSAL.js 尚未載入，請確認已引入 msal-browser CDN');
    }
  }

  function getMsalInstance() {
    if (msalInstance) return msalInstance;
    ensureMsalLoaded();
    msalInstance = new msal.PublicClientApplication(getMsalConfig());
    return msalInstance;
  }

  async function initialize() {
    const instance = getMsalInstance();
    const response = await instance.handleRedirectPromise();
    if (response) {
      saveAuthData(response);
    }
    return instance;
  }

  // ==================== 登入 / 登出 ====================

  async function loginRedirect() {
    const instance = getMsalInstance();
    const loginRequest = {
      scopes: [`api://${CLIENT_ID}/access_as_user`],
      prompt: 'select_account'
    };
    await instance.loginRedirect(loginRequest);
  }

  async function loginPopup() {
    const instance = getMsalInstance();
    const loginRequest = {
      scopes: [`api://${CLIENT_ID}/access_as_user`],
      prompt: 'select_account'
    };
    const response = await instance.loginPopup(loginRequest);
    saveAuthData(response);
    return response;
  }

  function logout() {
    clearAuthData();
    const instance = getMsalInstance();
    instance.logoutRedirect({
      postLogoutRedirectUri: REDIRECT_URI
    });
  }

  // ==================== Token 管理 ====================

  async function getAccessToken() {
    const instance = getMsalInstance();
    const accounts = instance.getAllAccounts();
    if (accounts.length === 0) {
      return null;
    }

    const tokenRequest = {
      scopes: [`api://${CLIENT_ID}/access_as_user`],
      account: accounts[0]
    };

    try {
      const response = await instance.acquireTokenSilent(tokenRequest);
      return response.accessToken;
    } catch (error) {
      if (error.name === 'InteractionRequiredAuthError') {
        await instance.acquireTokenRedirect(tokenRequest);
        return null;
      }
      throw error;
    }
  }

  // ==================== 權限檢查 ====================

  async function checkPermissions() {
    const token = await getAccessToken();
    if (!token) return null;

    const response = await fetch(`${API_BASE_URL}/api/permissions/check`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401) return null;
      throw new Error('權限檢查失敗');
    }

    return await response.json();
  }

  // ==================== API 呼叫 ====================

  async function apiFetch(path, options = {}) {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('未登入，無法取得 Token');
    }

    const url = `${API_BASE_URL}${path}`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401) {
      clearAuthData();
      window.location.href = LOGIN_PATH;
      throw new Error('Token 已過期，請重新登入');
    }

    return response;
  }

  // ==================== 本地狀態 ====================

  function saveAuthData(response) {
    const data = {
      email: response.account?.username || '',
      name: response.account?.name || '',
      timestamp: Date.now()
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(data));
  }

  function getAuthData() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function clearAuthData() {
    localStorage.removeItem(AUTH_KEY);
  }

  function isAuthenticated() {
    const instance = getMsalInstance();
    return instance.getAllAccounts().length > 0;
  }

  function getCurrentAccount() {
    const instance = getMsalInstance();
    const accounts = instance.getAllAccounts();
    return accounts.length > 0 ? accounts[0] : null;
  }

  // ==================== 頁面保護 ====================

  async function protectPageAzure(allowedCheck) {
    await initialize();

    if (!isAuthenticated()) {
      window.location.href = LOGIN_PATH;
      return null;
    }

    if (typeof allowedCheck === 'function') {
      const permissions = await checkPermissions();
      if (!permissions || !allowedCheck(permissions)) {
        alert('您沒有權限存取此頁面');
        logout();
        return null;
      }
      return permissions;
    }

    return getAuthData();
  }

  // ==================== 匯出 ====================

  window.AzureAuth = {
    initialize,
    loginRedirect,
    loginPopup,
    logout,
    getAccessToken,
    checkPermissions,
    apiFetch,
    getAuthData,
    isAuthenticated,
    getCurrentAccount,
    protectPageAzure,
    get config() {
      return { CLIENT_ID, TENANT_ID, REDIRECT_URI, API_BASE_URL };
    }
  };
})();
