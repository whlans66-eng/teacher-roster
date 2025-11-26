// ==================== 驗證保護模組 ====================
// 此模組用於保護頁面，確保只有登入的使用者才能訪問

/**
 * 檢查使用者登入狀態
 * @returns {Object|null} 使用者資料或 null
 */
function checkAuth() {
  const authData = localStorage.getItem('authData') || sessionStorage.getItem('authData');

  if (!authData) {
    return null;
  }

  try {
    const { username, role, timestamp } = JSON.parse(authData);
    const expiryTime = 7 * 24 * 60 * 60 * 1000; // 7 天

    // 檢查是否過期
    if (Date.now() - timestamp < expiryTime) {
      return { username, role };
    } else {
      // 過期，清除登入狀態
      logout();
      return null;
    }
  } catch (error) {
    console.error('檢查登入狀態失敗:', error);
    return null;
  }
}

/**
 * 要求登入（重定向到登入頁面）
 */
function requireLogin() {
  const currentPage = window.location.pathname;
  sessionStorage.setItem('redirectAfterLogin', currentPage);
  window.location.href = '/login.html';
}

/**
 * 保護頁面（在頁面載入時呼叫）
 * @param {Array} allowedRoles - 允許訪問的角色列表，例如 ['admin', 'teacher']
 */
function protectPage(allowedRoles = []) {
  const user = checkAuth();

  if (!user) {
    // 未登入，重定向到登入頁面
    requireLogin();
    return false;
  }

  // 檢查角色權限
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    alert('❌ 您沒有權限訪問此頁面');
    window.location.href = '/index.html';
    return false;
  }

  return true;
}

/**
 * 登出
 */
function logout() {
  localStorage.removeItem('authData');
  sessionStorage.removeItem('authData');
  sessionStorage.removeItem('currentUser');
  window.location.href = '/login.html';
}

/**
 * 取得當前使用者資訊
 * @returns {Object|null}
 */
function getCurrentUser() {
  const userDataString = sessionStorage.getItem('currentUser');
  if (!userDataString) {
    return checkAuth();
  }

  try {
    return JSON.parse(userDataString);
  } catch (error) {
    console.error('解析使用者資料失敗:', error);
    return null;
  }
}

/**
 * 顯示登出按鈕（在頁面上添加登出按鈕）
 */
function addLogoutButton() {
  const user = getCurrentUser();
  if (!user) return;

  // 檢查是否已經有登出按鈕
  if (document.getElementById('logoutBtn')) return;

  // 創建登出按鈕
  const logoutBtn = document.createElement('button');
  logoutBtn.id = 'logoutBtn';
  logoutBtn.innerHTML = `
    <span style="margin-right: 8px;">👤 ${user.displayName || user.username}</span>
    <span>登出</span>
  `;
  logoutBtn.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
    transition: all 0.3s ease;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  logoutBtn.onmouseover = () => {
    logoutBtn.style.transform = 'translateY(-2px)';
    logoutBtn.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.5)';
  };

  logoutBtn.onmouseout = () => {
    logoutBtn.style.transform = 'translateY(0)';
    logoutBtn.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.4)';
  };

  logoutBtn.onclick = () => {
    if (confirm('確定要登出嗎？')) {
      logout();
    }
  };

  document.body.appendChild(logoutBtn);
}

// 自動在頁面載入時添加登出按鈕
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname !== '/login.html') {
      addLogoutButton();
    }
  });
} else {
  if (window.location.pathname !== '/login.html') {
    addLogoutButton();
  }
}
