// 全站共用的前端認證／權限層
// 讀取 login.html 寫入的 authData，提供角色判斷、頁面守衛與右上角帳號選單
(function() {
  const AUTH_KEY = 'authData';
  const LOGIN_PATH = 'login.html';
  const HOME_PATH = 'index.html';
  const SESSION_TIMEOUT = 6 * 60 * 60 * 1000; // 6 小時，與 GAS SESSION_TTL 一致

  // 角色定義：必須與 backend-api.gs 的 USER_ROLES 一致
  const ROLES = {
    admin:   { label: '管理者', color: '#007aff' },
    teacher: { label: '教師',   color: '#6d28d9' },
    crew:    { label: '船員',   color: '#0f766e' },
    guest:   { label: '訪客',   color: '#6e6e73' }
  };

  // 每個頁面允許進入的角色。頁面不需要各自硬寫一份，改這裡就好。
  const PAGE_ACCESS = {
    'index.html':              ['admin', 'teacher', 'crew', 'guest'],
    'admin.html':              ['admin'],
    'teacher-management.html': ['admin', 'teacher'],
    'course-management.html':  ['admin', 'teacher'],
    'maritime-courses.html':   ['admin', 'teacher'],
    'teaching-materials.html': ['admin', 'teacher', 'crew', 'guest'],
    'crew-portal.html':        ['admin', 'crew']
  };

  let deniedScreenShown = false;

  function currentPage() {
    return window.location.pathname.split('/').pop() || HOME_PATH;
  }

  function isLoginPage() {
    const page = currentPage();
    return page === LOGIN_PATH || page === 'crew-login.html';
  }

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
    sessionStorage.removeItem('currentUser');
  }

  /**
   * 寫進 innerHTML 前一律跳脫。
   * displayName 來自管理者可自由填寫的 full_name，不跳脫就是注入點。
   */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeRole(role) {
    const r = String(role || '').trim();
    return ROLES[r] ? r : '';
  }

  function getRole() {
    const authData = getAuthData();
    return authData ? normalizeRole(authData.role) : '';
  }

  function getRoleLabel(role) {
    const r = normalizeRole(role || getRole());
    return r ? ROLES[r].label : '未知角色';
  }

  function getRoleColor(role) {
    const r = normalizeRole(role || getRole());
    return r ? ROLES[r].color : ROLES.guest.color;
  }

  function isAdmin() {
    return getRole() === 'admin';
  }

  function displayName(authData) {
    const data = authData || getAuthData();
    if (!data) return '使用者';
    return data.displayName || data.full_name || data.username || '使用者';
  }

  /**
   * 這個角色能不能進某一頁
   * @param {string} page 例如 'admin.html'；省略則用目前頁面
   * @param {string} role 省略則用目前登入角色
   */
  function canAccess(page, role) {
    const target = page || currentPage();
    const allowed = PAGE_ACCESS[target];
    if (!allowed) return true; // 未列管的頁面不擋
    return allowed.indexOf(normalizeRole(role || getRole())) >= 0;
  }

  /**
   * 目前角色可以進入的頁面清單
   */
  function accessiblePages(role) {
    const r = normalizeRole(role || getRole());
    return Object.keys(PAGE_ACCESS).filter(page => PAGE_ACCESS[page].indexOf(r) >= 0);
  }

  function redirectToLogin() {
    if (currentPage() !== LOGIN_PATH) {
      window.location.href = LOGIN_PATH;
    }
  }

  function logout() {
    clearAuthData();
    redirectToLogin();
  }

  /**
   * 權限不足時顯示的畫面
   *
   * 舊版在這裡是 alert() + logout()，等於把使用者直接踢出系統 —— 一個 guest 帳號
   * 只要點錯一張卡片就要重新登入。改為就地顯示說明，登入狀態保留，讓使用者自己選
   * 要回首頁還是換帳號。
   */
  function showAccessDenied(role) {
    if (deniedScreenShown) return;
    deniedScreenShown = true;

    const label = getRoleLabel(role);
    const canGoHome = canAccess(HOME_PATH, role);

    const overlay = document.createElement('div');
    overlay.className = 'auth-denied';
    overlay.innerHTML = `
      <div class="auth-denied-card">
        <div class="auth-denied-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h2>此功能需要其他權限</h2>
        <p>您目前的身分是「${label}」，沒有開放使用這個頁面。<br>需要存取權請聯絡系統管理者。</p>
        <div class="auth-denied-actions">
          ${canGoHome ? `<a class="btn btn-primary" href="${HOME_PATH}">回到首頁</a>` : ''}
          <button type="button" class="btn btn-secondary" data-auth-switch>切換帳號</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .auth-denied {
        position: fixed; inset: 0; z-index: 99999;
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
        background: rgba(245, 245, 247, 0.92);
        -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', sans-serif;
      }
      .auth-denied-card {
        background: #fff; border-radius: 20px; padding: 40px 32px;
        max-width: 420px; width: 100%; text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.14);
      }
      .auth-denied-icon {
        width: 64px; height: 64px; margin: 0 auto 20px;
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        background: #f2f2f7; color: #6e6e73;
      }
      .auth-denied-card h2 {
        margin: 0 0 10px; font-size: 21px; font-weight: 700; color: #1d1d1f;
        letter-spacing: -0.02em;
      }
      .auth-denied-card p {
        margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #6e6e73;
      }
      .auth-denied-actions {
        display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
      }
      /* 沒有引入 shared/ui.css 的頁面也要能看 */
      .auth-denied .btn {
        display: inline-flex; align-items: center; justify-content: center;
        padding: 10px 20px; border: 1px solid transparent; border-radius: 12px;
        font-size: 15px; font-weight: 600; text-decoration: none; cursor: pointer;
        font-family: inherit;
      }
      .auth-denied .btn-primary { background: #007aff; color: #fff; }
      .auth-denied .btn-secondary { background: #f2f2f7; color: #1d1d1f; }
    `;

    document.head.appendChild(style);
    const mount = () => {
      document.body.appendChild(overlay);
      overlay.querySelector('[data-auth-switch]').addEventListener('click', logout);
    };
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);
  }

  /**
   * 頁面守衛
   * @param {Array<string>|null} allowedRoles 省略時自動採用 PAGE_ACCESS 的設定
   * @returns {Object|null} 通過時回傳 authData，否則回傳 null
   */
  function protectPage(allowedRoles = null) {
    const authData = getAuthData();

    if (!authData) {
      redirectToLogin();
      return null;
    }

    if (Date.now() - authData.timestamp > SESSION_TIMEOUT) {
      clearAuthData();
      redirectToLogin();
      return null;
    }

    const allowed = Array.isArray(allowedRoles) && allowedRoles.length > 0
      ? allowedRoles
      : PAGE_ACCESS[currentPage()];

    if (Array.isArray(allowed) && allowed.indexOf(normalizeRole(authData.role)) < 0) {
      showAccessDenied(authData.role);
      return null;
    }

    return authData;
  }

  function ensureAuthenticated() {
    if (isLoginPage()) return;
    protectPage();
  }

  // ==================== 右上角帳號選單 ====================

  function injectAccountMenuStyles() {
    if (document.getElementById('auth-account-menu-styles')) return;
    const style = document.createElement('style');
    style.id = 'auth-account-menu-styles';
    style.textContent = `
      .account-menu { position: relative; display: inline-block; font-family: inherit; }
      .account-menu-trigger {
        display: flex; align-items: center; gap: 10px;
        padding: 6px 12px 6px 6px; border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 999px; background: rgba(255, 255, 255, 0.9);
        cursor: pointer; font-family: inherit; transition: background 0.2s ease;
      }
      .account-menu-trigger:hover { background: #fff; }
      .account-menu-avatar {
        width: 30px; height: 30px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-size: 13px; font-weight: 700; flex-shrink: 0;
      }
      .account-menu-text { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.2; }
      .account-menu-name { font-size: 13px; font-weight: 600; color: #1d1d1f; }
      .account-menu-role { font-size: 11px; font-weight: 600; }
      .account-menu-panel {
        position: absolute; top: calc(100% + 8px); right: 0; z-index: 1000;
        min-width: 220px; padding: 8px; border-radius: 16px;
        background: #fff; border: 1px solid rgba(0, 0, 0, 0.08);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14);
        opacity: 0; visibility: hidden; transform: translateY(-6px);
        transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s;
      }
      .account-menu.open .account-menu-panel { opacity: 1; visibility: visible; transform: translateY(0); }
      .account-menu-header { padding: 10px 12px 12px; border-bottom: 1px solid rgba(0, 0, 0, 0.06); margin-bottom: 6px; }
      .account-menu-header strong { display: block; font-size: 14px; color: #1d1d1f; }
      .account-menu-header span { display: block; margin-top: 2px; font-size: 12px; color: #6e6e73; }
      .account-menu-item {
        display: flex; align-items: center; gap: 10px; width: 100%;
        padding: 10px 12px; border: none; border-radius: 10px;
        background: transparent; color: #1d1d1f;
        font-family: inherit; font-size: 14px; font-weight: 500;
        text-align: left; text-decoration: none; cursor: pointer;
      }
      .account-menu-item:hover { background: #f5f5f7; }
      .account-menu-item.danger { color: #ff3b30; }
      .account-menu-item.danger:hover { background: rgba(255, 59, 48, 0.1); }
      .account-menu-item svg { flex-shrink: 0; }
    `;
    document.head.appendChild(style);
  }

  /**
   * 掛上右上角帳號入口（頭像／姓名／角色 + 帳號管理 + 登出）
   * @param {HTMLElement|string} target 容器或其選擇器；省略時自動固定在右上角
   */
  function mountAccountMenu(target) {
    const authData = getAuthData();
    if (!authData) return null;

    injectAccountMenuStyles();

    let container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container) {
      container = document.createElement('div');
      container.style.cssText = 'position:fixed;top:20px;right:24px;z-index:900;';
      document.body.appendChild(container);
    }

    const role = normalizeRole(authData.role);
    const name = escapeHtml(displayName(authData));
    const account = escapeHtml(authData.username);
    const initial = escapeHtml(displayName(authData).charAt(0).toUpperCase());

    const wrapper = document.createElement('div');
    wrapper.className = 'account-menu';
    wrapper.innerHTML = `
      <button type="button" class="account-menu-trigger" aria-haspopup="true" aria-expanded="false">
        <span class="account-menu-avatar" style="background:${getRoleColor(role)}">${initial}</span>
        <span class="account-menu-text">
          <span class="account-menu-name">${name}</span>
          <span class="account-menu-role" style="color:${getRoleColor(role)}">${getRoleLabel(role)}</span>
        </span>
      </button>
      <div class="account-menu-panel" role="menu">
        <div class="account-menu-header">
          <strong>${name}</strong>
          <span>${account} · ${getRoleLabel(role)}</span>
        </div>
        ${role === 'admin' ? `
        <a class="account-menu-item" href="admin.html" role="menuitem">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          帳號管理
        </a>` : ''}
        <button type="button" class="account-menu-item danger" data-auth-logout role="menuitem">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          登出
        </button>
      </div>
    `;

    container.appendChild(wrapper);

    const trigger = wrapper.querySelector('.account-menu-trigger');
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      const open = wrapper.classList.toggle('open');
      trigger.setAttribute('aria-expanded', String(open));
    });
    wrapper.querySelector('[data-auth-logout]').addEventListener('click', logout);
    document.addEventListener('click', event => {
      if (!wrapper.contains(event.target)) {
        wrapper.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        wrapper.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    return wrapper;
  }

  window.Auth = {
    ROLES,
    PAGE_ACCESS,
    getAuthData,
    clearAuthData,
    ensureAuthenticated,
    protectPage,
    logout,
    getRole,
    getRoleLabel,
    getRoleColor,
    isAdmin,
    displayName,
    canAccess,
    accessiblePages,
    mountAccountMenu,
    escapeHtml
  };

  // 向全域導出，供舊版腳本直接呼叫
  window.protectPage = protectPage;

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    ensureAuthenticated();
  } else {
    document.addEventListener('DOMContentLoaded', ensureAuthenticated);
  }
})();
