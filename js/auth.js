// Basic front-end authentication helper
// Reads mock auth data stored by login.html and provides utility helpers
(function() {
  const AUTH_KEY = 'authData';
  const LOGIN_PATH = 'login.html';

  function parseAuthData(raw) {
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (data && data.username && data.role && data.timestamp) {
        return data;
      }
      return null;
    } catch (error) {
      console.warn('無法解析登入資訊，已清除。', error);
      clearAuthData();
      return null;
    }
  }

  function getAuthData() {
    const fromLocal = parseAuthData(localStorage.getItem(AUTH_KEY));
    const fromSession = parseAuthData(sessionStorage.getItem(AUTH_KEY));
    return fromLocal || fromSession;
  }

  function clearAuthData() {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
  }

  function isLoginPage() {
    return window.location.pathname.endsWith(LOGIN_PATH);
  }

  function ensureAuthenticated() {
    if (isLoginPage()) return;

    const authData = protectPage();
    if (!authData) return;

    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - authData.timestamp > sevenDays) {
      clearAuthData();
      redirectToLogin();
    }
  }

  function protectPage(allowedRoles = null) {
    const authData = getAuthData();

    if (!authData) {
      redirectToLogin();
      return null;
    }

    if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
      if (!allowedRoles.includes(authData.role)) {
        alert('您沒有權限存取此頁面，請使用具有適當權限的帳號登入。');
        logout();
        return null;
      }
    }

    return authData;
  }

  function redirectToLogin() {
    const currentPath = window.location.pathname.split('/').pop();
    if (currentPath !== LOGIN_PATH) {
      window.location.href = LOGIN_PATH;
    }
  }

  function logout() {
    clearAuthData();
    redirectToLogin();
  }

  window.Auth = {
    getAuthData,
    clearAuthData,
    ensureAuthenticated,
    protectPage,
    logout
  };

  // 向全域導出，供舊版腳本直接呼叫
  window.protectPage = protectPage;

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    ensureAuthenticated();
  } else {
    document.addEventListener('DOMContentLoaded', ensureAuthenticated);
  }
})();
