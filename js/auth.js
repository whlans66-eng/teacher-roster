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

  // ── 頁面登記與預設權限 ──
  //
  // 「哪個角色能進哪一頁」現在是資料，不是程式：真正生效的是後端 pageAccess 表，
  // 管理者在「帳號管理 → 頁面權限」自己勾，這裡只留兩樣東西——
  //
  //   PAGE_REGISTRY：站上有哪些頁、怎麼稱呼、要不要出現在首頁與導覽列。
  //                  新增頁面在這裡加一筆，後端 PAGE_ACCESS_DEFAULTS 也要加同一個鍵。
  //   PAGE_DEFAULTS：後端讀不到時的備援值，必須與後端 PAGE_ACCESS_DEFAULTS 一致。
  //
  // 各頁呼叫 protectPage() 時不要再自己傳一份陣列，否則矩陣改了也不會生效。
  const PAGE_REGISTRY = [
    { page: 'index.html',              label: '首頁',     icon: 'ph-house',                desc: '模組入口，所有登入者的起點',           nav: false },
    { page: 'teacher-management.html', label: '師資管理', icon: 'ph-user-list',            desc: '師資名單、證照與經歷',                 nav: true  },
    { page: 'course-management.html',  label: '訓練排程', icon: 'ph-calendar',             desc: '安排課程、行事曆',                     nav: true  },
    { page: 'maritime-courses.html',   label: '智慧派課', icon: 'ph-anchor',               desc: '海事專業課程管理與分析',               nav: true  },
    { page: 'teaching-materials.html', label: '教材管理', icon: 'ph-books',                desc: '書籍、影片與數位資源',                 nav: true  },
    { page: 'crew-portal.html',        label: '船員入口', icon: 'ph-identification-badge', desc: '課表、留言與問卷（船員視角）',         nav: true  },
    { page: 'admin.html',              label: '帳號管理', icon: 'ph-lock-key',             desc: '帳號、角色、選單與頁面權限',           nav: true  },
    { page: 'fix-sync-issue.html',     label: '同步修復工具', icon: 'ph-wrench',           desc: '會清空瀏覽器快取的維修工具，沒有入口', nav: false }
  ];

  const PAGE_DEFAULTS = {
    'index.html':              ['admin', 'teacher', 'crew', 'guest'],
    'admin.html':              ['admin'],
    'teacher-management.html': ['admin', 'teacher'],
    'course-management.html':  ['admin', 'teacher'],
    'maritime-courses.html':   ['admin', 'teacher'],
    'teaching-materials.html': ['admin', 'teacher', 'crew', 'guest'],
    'crew-portal.html':        ['crew'],
    'fix-sync-issue.html':     ['admin']
  };

  // 無論矩陣怎麼勾，管理者一定保有這幾頁（後端也擋）。管理畫面用來鎖住勾選框。
  const PAGE_LOCKED = {
    'index.html': ['admin'],
    'admin.html': ['admin']
  };

  // 主導覽的模組清單，直接從登記表產生；能不能看到由權限矩陣決定
  const NAV_ITEMS = PAGE_REGISTRY.filter(it => it.nav)
    .map(it => ({ page: it.page, label: it.label, icon: it.icon }));

  // ── 權限矩陣的快取 ──
  // 頁面守衛在 <script> 載入當下就要同步判斷，所以矩陣放 localStorage：
  //   1. 登入時後端隨登入結果一併帶回，寫進快取
  //   2. 每頁載入後背景向後端重抓一次（有節流），有變就更新並通知畫面
  //   3. 都拿不到就用 PAGE_DEFAULTS
  const ACCESS_KEY = 'pageAccessTable';
  const ACCESS_TS_KEY = 'pageAccessAt';
  const ACCESS_REFRESH_MS = 60 * 1000;   // 超過一分鐘就背景重抓

  function normalizeAccess(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out = {};
    let any = false;
    Object.keys(PAGE_DEFAULTS).forEach(page => {
      const src = raw[page];
      if (!Array.isArray(src)) { out[page] = PAGE_DEFAULTS[page].slice(); return; }
      any = true;
      const roles = src.map(r => String(r || '').trim()).filter(r => !!ROLES[r]);
      (PAGE_LOCKED[page] || []).forEach(r => { if (roles.indexOf(r) < 0) roles.push(r); });
      out[page] = Object.keys(ROLES).filter(r => roles.indexOf(r) >= 0);
    });
    return any ? out : null;
  }

  function readAccessCache() {
    try { return normalizeAccess(JSON.parse(localStorage.getItem(ACCESS_KEY) || 'null')); }
    catch (e) { return null; }
  }

  function writeAccessCache(table) {
    try {
      localStorage.setItem(ACCESS_KEY, JSON.stringify(table));
      localStorage.setItem(ACCESS_TS_KEY, String(Date.now()));
    } catch (e) { /* 配額滿或無痕模式，不影響功能 */ }
  }

  function accessCacheAge() {
    const ts = Number(localStorage.getItem(ACCESS_TS_KEY) || 0);
    return ts ? Date.now() - ts : Infinity;
  }

  let pageAccess = readAccessCache() || normalizeAccess(PAGE_DEFAULTS);
  let accessSource = readAccessCache() ? 'cache' : 'builtin';
  let accessLoading = null;

  /**
   * 換上一份新的矩陣（登入、背景重抓、管理頁存檔後呼叫）
   * 有變更時發出 auth:pageaccess 事件，首頁卡片與導覽列據此重畫。
   * @returns {boolean} 內容是否有變
   */
  function applyPageAccess(raw, source) {
    const clean = normalizeAccess(raw);
    if (!clean) return false;
    const changed = JSON.stringify(clean) !== JSON.stringify(pageAccess);
    pageAccess = clean;
    accessSource = source || 'backend';
    writeAccessCache(clean);
    if (changed) {
      refreshNavLinks();
      // 目前這一頁剛被收回權限：就地顯示說明，不要等下次重新整理才發現
      if (!isLoginPage() && getAuthData() && !canAccess()) showAccessDenied(getRole());
      try { document.dispatchEvent(new CustomEvent('auth:pageaccess', { detail: { access: clean } })); }
      catch (e) { /* 舊瀏覽器沒有 CustomEvent，略過 */ }
    }
    return changed;
  }

  /**
   * 向後端要最新的矩陣；失敗就沿用現有的
   * @param {boolean} force 忽略節流強制重抓
   */
  function refreshPageAccess(force) {
    if (accessLoading) return accessLoading;
    if (!force && accessSource === 'cache' && accessCacheAge() < ACCESS_REFRESH_MS) {
      return Promise.resolve(pageAccess);
    }
    if (typeof api === 'undefined' || !api || typeof api.listPageAccess !== 'function') {
      return Promise.resolve(pageAccess);
    }
    accessLoading = api.listPageAccess()
      .then(table => { applyPageAccess(table, 'backend'); return pageAccess; })
      .catch(() => pageAccess)
      .then(t => { accessLoading = null; return t; });
    return accessLoading;
  }

  /** 目前生效的矩陣（複本，改了不影響內部狀態） */
  function getPageAccess() {
    return JSON.parse(JSON.stringify(pageAccess));
  }

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
  // 不需要登入就能開的頁（登入畫面本身）。
  // 除了這些，只要是站上的頁面就一定要在 PAGE_REGISTRY / PAGE_DEFAULTS 裡登記。
  const PUBLIC_PAGES = ['login.html', 'crew-login.html'];

  function canAccess(page, role) {
    const target = page || currentPage();
    if (PUBLIC_PAGES.indexOf(target) >= 0) return true;
    // 以前這裡是 `if (!allowed) return true;（未列管的頁面不擋）`——
    // 等於任何忘記登記的頁面預設全開。fix-sync-issue.html 就是這樣
    // 變成任何人都打得開，而那頁可以清空整個 localStorage。
    // 改成沒登記就擋；要開放就先在 PAGE_REGISTRY / PAGE_DEFAULTS 登記這一頁。
    if (!Object.prototype.hasOwnProperty.call(pageAccess, target)) return false;
    const allowed = pageAccess[target];
    if (!Array.isArray(allowed) || allowed.length === 0) return false;
    return allowed.indexOf(normalizeRole(role || getRole())) >= 0;
  }

  /**
   * 目前角色可以進入的頁面清單
   */
  function accessiblePages(role) {
    const r = normalizeRole(role || getRole());
    return Object.keys(pageAccess).filter(page => pageAccess[page].indexOf(r) >= 0);
  }

  function redirectToLogin(target) {
    const dest = target || LOGIN_PATH;
    if (currentPage() !== dest) {
      window.location.href = dest;
    }
  }

  /**
   * 登出
   * @param {string} [target] 導回哪個登入頁；船員入口要回 crew-login.html
   */
  function logout(target) {
    clearAuthData();
    redirectToLogin(target);
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
   * @param {Array<string>|null} allowedRoles 省略時自動採用權限矩陣的設定
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
      : pageAccess[currentPage()];

    if (Array.isArray(allowed) && allowed.indexOf(normalizeRole(authData.role)) < 0) {
      showAccessDenied(authData.role);
      return null;
    }

    return authData;
  }

  function ensureAuthenticated() {
    if (isLoginPage()) return;
    const authData = protectPage();
    if (!authData) return;
    requirePasswordChange();
    // 管理者剛改過矩陣的話，這一頁就會拿到新的；必須換密碼時後端會拒絕，靜默略過
    if (!authData.mustChangePassword) refreshPageAccess(false);
  }

  // ==================== 強制更換密碼 ====================

  let passwordScreenShown = false;

  /**
   * 管理者建立或重設密碼後，本人首次登入必須先換掉才能使用系統
   * 這一層放在共用 auth 裡，所有頁面都適用，不需各頁自己處理
   */
  function requirePasswordChange() {
    const authData = getAuthData();
    if (!authData || !authData.mustChangePassword) return false;
    if (passwordScreenShown || isLoginPage()) return false;
    passwordScreenShown = true;

    const style = document.createElement('style');
    style.textContent = `
      .auth-pwd {
        position: fixed; inset: 0; z-index: 99998;
        display: flex; align-items: center; justify-content: center; padding: 24px;
        background: rgba(245, 245, 247, 0.94);
        -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', sans-serif;
      }
      .auth-pwd-card {
        background: #fff; border-radius: 20px; padding: 36px 32px;
        max-width: 420px; width: 100%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.14);
      }
      .auth-pwd-card h2 {
        margin: 0 0 8px; font-size: 21px; font-weight: 700; color: #1d1d1f;
        letter-spacing: -0.02em;
      }
      .auth-pwd-card > p {
        margin: 0 0 22px; font-size: 14px; line-height: 1.6; color: #6e6e73;
      }
      .auth-pwd-field { margin-bottom: 14px; }
      .auth-pwd-field label {
        display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #1d1d1f;
      }
      .auth-pwd-field input {
        width: 100%; padding: 11px 14px; box-sizing: border-box;
        border: 1px solid rgba(0, 0, 0, 0.12); border-radius: 12px;
        font-family: inherit; font-size: 15px; color: #1d1d1f; outline: none;
      }
      .auth-pwd-field input:focus { border-color: #007aff; }
      .auth-pwd-hint { margin-top: 6px; font-size: 12px; color: #86868b; }
      .auth-pwd-error {
        display: none; margin-bottom: 14px; padding: 11px 14px; border-radius: 12px;
        background: rgba(255, 59, 48, 0.1); color: #c81e14; font-size: 13.5px; line-height: 1.5;
      }
      .auth-pwd-error.show { display: block; }
      .auth-pwd-actions { display: flex; gap: 10px; margin-top: 20px; }
      .auth-pwd-btn {
        flex: 1; padding: 11px 18px; border: none; border-radius: 12px;
        font-family: inherit; font-size: 15px; font-weight: 600; cursor: pointer;
        background: #007aff; color: #fff;
      }
      .auth-pwd-btn:disabled { background: #d2d2d7; cursor: not-allowed; }
      .auth-pwd-btn.ghost { flex: 0 0 auto; background: #f2f2f7; color: #1d1d1f; }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'auth-pwd';
    overlay.innerHTML = `
      <div class="auth-pwd-card" role="dialog" aria-modal="true">
        <h2>請先更換密碼</h2>
        <p>目前的密碼是由管理者代為設定的。為了帳號安全，請設定一組只有您知道的新密碼。</p>
        <div class="auth-pwd-error" data-pwd-error></div>
        <div class="auth-pwd-field">
          <label for="authPwdCurrent">目前密碼</label>
          <input type="password" id="authPwdCurrent" autocomplete="current-password">
        </div>
        <div class="auth-pwd-field">
          <label for="authPwdNew">新密碼</label>
          <input type="password" id="authPwdNew" autocomplete="new-password">
          <div class="auth-pwd-hint">至少 10 個字元，不可包含帳號名稱</div>
        </div>
        <div class="auth-pwd-field">
          <label for="authPwdConfirm">再次輸入新密碼</label>
          <input type="password" id="authPwdConfirm" autocomplete="new-password">
        </div>
        <div class="auth-pwd-actions">
          <button type="button" class="auth-pwd-btn" data-pwd-submit>設定新密碼</button>
          <button type="button" class="auth-pwd-btn ghost" data-pwd-logout>登出</button>
        </div>
      </div>
    `;

    const mount = () => {
      document.body.appendChild(overlay);
      const errorBox = overlay.querySelector('[data-pwd-error]');
      const submitBtn = overlay.querySelector('[data-pwd-submit]');

      const fail = msg => {
        errorBox.textContent = msg;
        errorBox.classList.add('show');
      };

      overlay.querySelector('[data-pwd-logout]').addEventListener('click', logout);
      submitBtn.addEventListener('click', async () => {
        errorBox.classList.remove('show');
        const current = overlay.querySelector('#authPwdCurrent').value;
        const next = overlay.querySelector('#authPwdNew').value;
        const confirm = overlay.querySelector('#authPwdConfirm').value;

        if (!current) return fail('請輸入目前密碼');
        if (next.length < 10) return fail('新密碼至少需 10 個字元');
        if (next !== confirm) return fail('兩次輸入的新密碼不一致');
        if (next === current) return fail('新密碼不可與目前密碼相同');

        submitBtn.disabled = true;
        submitBtn.textContent = '設定中…';
        try {
          if (typeof api === 'undefined' || !api.changeOwnPassword) {
            throw new Error('此頁面未載入 API 模組，請回首頁再試');
          }
          const result = await api.changeOwnPassword(current, next);

          // 後端改完密碼會撤銷其他 Session 並發新 token，這裡一併更新
          const data = getAuthData() || {};
          data.mustChangePassword = false;
          if (result && result.token) data.token = result.token;
          data.timestamp = Date.now();
          const store = localStorage.getItem(AUTH_KEY) ? localStorage : sessionStorage;
          store.setItem(AUTH_KEY, JSON.stringify(data));

          overlay.remove();
          passwordScreenShown = false;
        } catch (error) {
          fail(error && error.message ? error.message : '設定失敗，請稍後再試');
          submitBtn.disabled = false;
          submitBtn.textContent = '設定新密碼';
        }
      });
    };

    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });
    return true;
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
            <rect x="3" y="11" width="18" height="11" rx="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            <circle cx="12" cy="16" r="1.6"></circle>
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

  // ==================== 共用主導覽列 ====================

  function injectNavStyles() {
    if (document.getElementById('auth-nav-styles')) return;
    const style = document.createElement('style');
    style.id = 'auth-nav-styles';
    style.textContent = `
      :root { --app-nav-h: 0px; }
      .app-nav {
        background: #ffffff;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        position: sticky; top: 0; z-index: 50;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', sans-serif;
      }
      .app-nav-inner {
        max-width: 1280px; margin: 0 auto; padding: 0 16px;
        display: flex; align-items: center; gap: 12px; min-height: 56px;
      }
      .app-nav-home {
        display: inline-flex; align-items: center; gap: 6px;
        color: #6b7280; text-decoration: none; font-size: 14px; font-weight: 500;
        flex-shrink: 0; padding: 8px 10px; border-radius: 8px;
      }
      .app-nav-home:hover { color: #1f2937; background: #f9fafb; }
      .app-nav-links {
        display: flex; align-items: center; gap: 4px;
        flex: 1; justify-content: center; flex-wrap: wrap;
      }
      .app-nav-link {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 16px; border-radius: 8px;
        font-size: 14px; font-weight: 500; text-decoration: none;
        color: #6b7280; border: 1px solid transparent; white-space: nowrap;
        transition: background 0.2s ease, color 0.2s ease;
      }
      .app-nav-link:hover { background: #f9fafb; color: #374151; }
      .app-nav-link.active {
        background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; font-weight: 600;
      }
      .app-nav-right { flex-shrink: 0; display: flex; align-items: center; }
      @media (max-width: 820px) {
        .app-nav-links { justify-content: flex-start; }
        .app-nav-link span { display: none; }
        .app-nav-link { padding: 8px 10px; }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 把導覽列實際高度寫進 --app-nav-h
   *
   * 導覽列是 sticky top:0，頁面自己的 header（教材管理的 topbar、
   * 帳號管理的 page-header）也是 sticky top:0，兩條會疊在一起而
   * 把頁面標題吃掉。各頁改用 top: var(--app-nav-h) 接在導覽列下面，
   * 這裡負責提供正確的高度（視窗變窄時連結會換行，高度會變）。
   */
  function trackNavHeight(nav) {
    const apply = () => {
      const h = nav.offsetHeight || 0;
      document.documentElement.style.setProperty('--app-nav-h', h + 'px');
    };
    apply();
    if (typeof ResizeObserver === 'function') new ResizeObserver(apply).observe(nav);
    else window.addEventListener('resize', apply);
    // 圖示字型載入後高度可能再變一次
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(apply).catch(() => {});
  }

  /**
   * 掛上全站共用的主導覽列
   *
   * 每一頁都顯示首頁有的模組選項，但只列出這個帳號進得去的
   *（依權限矩陣過濾）—— 原本三個頁面各自寫死三個連結，
   * 既缺教材與帳號管理，也不分角色。
   *
   * @param {HTMLElement|string} target 容器；省略則插在 body 最前面
   */
  function renderNavLinks(role) {
    const current = currentPage();
    return NAV_ITEMS.filter(it => canAccess(it.page, role)).map(it => `
            <a class="app-nav-link${it.page === current ? ' active' : ''}" href="${it.page}">
              <i class="ph ${it.icon}"></i><span>${escapeHtml(it.label)}</span>
            </a>`).join('');
  }

  /** 權限矩陣更新後，把已掛上的導覽列連結就地換掉（不重掛帳號選單） */
  function refreshNavLinks() {
    const links = document.querySelector('.app-nav .app-nav-links');
    if (!links) return;
    links.innerHTML = renderNavLinks(getRole());
  }

  function mountNav(target) {
    const authData = getAuthData();
    if (!authData || isLoginPage()) return null;
    if (document.querySelector('.app-nav')) return null;   // 避免重複掛載

    injectNavStyles();

    const nav = document.createElement('nav');
    nav.className = 'app-nav';
    nav.innerHTML = `
      <div class="app-nav-inner">
        <a class="app-nav-home" href="${HOME_PATH}">
          <i class="ph ph-house" style="font-size:18px"></i><span>首頁</span>
        </a>
        <div class="app-nav-links">${renderNavLinks(normalizeRole(authData.role))}</div>
        <div class="app-nav-right" data-nav-account></div>
      </div>
    `;

    const mount = () => {
      const container = typeof target === 'string' ? document.querySelector(target) : target;
      if (container) container.appendChild(nav);
      else document.body.insertBefore(nav, document.body.firstChild);
      mountAccountMenu(nav.querySelector('[data-nav-account]'));
      trackNavHeight(nav);
    };

    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });
    return nav;
  }

  window.Auth = {
    ROLES,
    PAGE_REGISTRY,
    PAGE_DEFAULTS,
    PAGE_LOCKED,
    getPageAccess,
    applyPageAccess,
    refreshPageAccess,
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
    mountNav,
    NAV_ITEMS,
    requirePasswordChange,
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
