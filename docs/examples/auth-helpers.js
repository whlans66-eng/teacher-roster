/**
 * 前端權限控制輔助函數
 * 用於實作 RBAC（角色基礎訪問控制）
 *
 * 使用方式：
 * 1. 在登入後呼叫 setAuthState(user, token)
 * 2. 在需要權限檢查的地方使用 hasRole() 或 canEdit() 等函數
 * 3. 在登出時呼叫 clearAuthState()
 */

// ============================================
// 一、認證狀態管理
// ============================================

const AuthState = {
  isAuthenticated: false,
  user: null,
  role: null,  // 'visitor', 'student', 'teacher', 'admin'
  permissions: [],
  token: null
};

/**
 * 設定認證狀態（登入後呼叫）
 * @param {Object} user - 用戶物件
 * @param {string} user.id - 用戶 ID
 * @param {string} user.username - 用戶名
 * @param {string} user.email - Email
 * @param {string} user.role - 角色
 * @param {Array} user.permissions - 權限陣列
 * @param {string} token - JWT Token
 */
function setAuthState(user, token) {
  AuthState.isAuthenticated = true;
  AuthState.user = user;
  AuthState.role = user.role;
  AuthState.permissions = user.permissions || [];
  AuthState.token = token;

  // 儲存到 localStorage
  localStorage.setItem('authToken', token);
  localStorage.setItem('userRole', user.role);
  localStorage.setItem('userId', user.id);
  localStorage.setItem('userInfo', JSON.stringify(user));

  console.log('[Auth] 登入成功，角色:', user.role);
}

/**
 * 清除認證狀態（登出時呼叫）
 */
function clearAuthState() {
  AuthState.isAuthenticated = false;
  AuthState.user = null;
  AuthState.role = null;
  AuthState.permissions = [];
  AuthState.token = null;

  localStorage.removeItem('authToken');
  localStorage.removeItem('userRole');
  localStorage.removeItem('userId');
  localStorage.removeItem('userInfo');

  console.log('[Auth] 已登出');
}

/**
 * 從 localStorage 恢復認證狀態（頁面載入時呼叫）
 */
function restoreAuthState() {
  const token = localStorage.getItem('authToken');
  const userInfo = localStorage.getItem('userInfo');

  if (token && userInfo) {
    try {
      const user = JSON.parse(userInfo);
      AuthState.isAuthenticated = true;
      AuthState.user = user;
      AuthState.role = user.role;
      AuthState.permissions = user.permissions || [];
      AuthState.token = token;

      console.log('[Auth] 恢復登入狀態，角色:', user.role);
      return true;
    } catch (error) {
      console.error('[Auth] 恢復登入狀態失敗:', error);
      clearAuthState();
      return false;
    }
  }

  return false;
}

/**
 * 取得當前角色
 * @returns {string} 角色名稱（'visitor', 'student', 'teacher', 'admin'）
 */
function getCurrentRole() {
  return AuthState.role || localStorage.getItem('userRole') || 'visitor';
}

/**
 * 取得當前用戶 ID
 * @returns {string|null}
 */
function getCurrentUserId() {
  return AuthState.user?.id || localStorage.getItem('userId') || null;
}

/**
 * 取得 Token（用於 API 請求）
 * @returns {string|null}
 */
function getAuthToken() {
  return AuthState.token || localStorage.getItem('authToken') || null;
}

// ============================================
// 二、權限檢查函數
// ============================================

/**
 * 檢查是否已登入
 * @returns {boolean}
 */
function isAuthenticated() {
  return AuthState.isAuthenticated || !!localStorage.getItem('authToken');
}

/**
 * 檢查是否有特定角色（至少符合其中一個）
 * @param {...string} roles - 角色名稱
 * @returns {boolean}
 *
 * @example
 * if (hasRole('admin', 'teacher')) {
 *   // 顯示編輯按鈕
 * }
 */
function hasRole(...roles) {
  const currentRole = getCurrentRole();
  return roles.includes(currentRole);
}

/**
 * 檢查是否有特定權限
 * @param {string} permission - 權限名稱（如 'teacher.edit'）
 * @returns {boolean}
 */
function hasPermission(permission) {
  // 管理者有所有權限
  if (getCurrentRole() === 'admin') {
    return true;
  }

  return AuthState.permissions.includes(permission);
}

/**
 * 檢查是否可以編輯特定資源
 * @param {Object} resource - 資源物件
 * @param {string} resource.type - 資源類型（'teacher', 'course', 'assignment'）
 * @param {string} resource.userId - 資源所屬用戶 ID
 * @returns {boolean}
 *
 * @example
 * if (canEdit({ type: 'teacher', userId: teacher.userId })) {
 *   // 顯示編輯按鈕
 * }
 */
function canEdit(resource) {
  const role = getCurrentRole();
  const currentUserId = getCurrentUserId();

  // 管理者可以編輯所有東西
  if (role === 'admin') {
    return true;
  }

  // 教師只能編輯自己的資料
  if (role === 'teacher' && resource.type === 'teacher') {
    return resource.userId === currentUserId;
  }

  return false;
}

/**
 * 檢查是否可以查看詳細資料
 * @param {string} resourceType - 資源類型
 * @returns {boolean}
 */
function canViewDetails(resourceType) {
  const role = getCurrentRole();

  // 訪客不能查看詳細資料
  if (role === 'visitor') {
    return false;
  }

  // 學員、教師、管理者可以查看詳細資料
  return ['student', 'teacher', 'admin'].includes(role);
}

/**
 * 檢查是否可以刪除資源
 * @param {string} resourceType - 資源類型
 * @returns {boolean}
 */
function canDelete(resourceType) {
  // 只有管理者可以刪除
  return getCurrentRole() === 'admin';
}

/**
 * 檢查是否可以建立資源
 * @param {string} resourceType - 資源類型
 * @returns {boolean}
 */
function canCreate(resourceType) {
  const role = getCurrentRole();

  // 管理者可以建立所有類型
  if (role === 'admin') {
    return true;
  }

  // 特定角色可以建立特定資源
  const createPermissions = {
    'survey_response': ['visitor', 'student', 'teacher', 'admin']  // 所有人都能填問卷
  };

  return createPermissions[resourceType]?.includes(role) || false;
}

// ============================================
// 三、角色等級比較
// ============================================

const ROLE_LEVELS = {
  'visitor': 0,
  'student': 1,
  'teacher': 2,
  'admin': 3
};

/**
 * 檢查當前角色等級是否大於等於指定角色
 * @param {string} requiredRole - 所需角色
 * @returns {boolean}
 *
 * @example
 * if (hasRoleLevel('student')) {
 *   // student, teacher, admin 都會通過
 * }
 */
function hasRoleLevel(requiredRole) {
  const currentRole = getCurrentRole();
  const currentLevel = ROLE_LEVELS[currentRole] || 0;
  const requiredLevel = ROLE_LEVELS[requiredRole] || 0;

  return currentLevel >= requiredLevel;
}

// ============================================
// 四、UI 輔助函數
// ============================================

/**
 * 根據權限顯示或隱藏元素
 * @param {string} selector - CSS 選擇器
 * @param {string[]} allowedRoles - 允許的角色陣列
 *
 * @example
 * showElementForRoles('.admin-panel', ['admin']);
 * showElementForRoles('.edit-button', ['admin', 'teacher']);
 */
function showElementForRoles(selector, allowedRoles) {
  const elements = document.querySelectorAll(selector);
  const currentRole = getCurrentRole();

  elements.forEach(element => {
    if (allowedRoles.includes(currentRole)) {
      element.style.display = '';
    } else {
      element.style.display = 'none';
    }
  });
}

/**
 * 根據權限啟用或禁用元素
 * @param {string} selector - CSS 選擇器
 * @param {string[]} allowedRoles - 允許的角色陣列
 */
function enableElementForRoles(selector, allowedRoles) {
  const elements = document.querySelectorAll(selector);
  const currentRole = getCurrentRole();

  elements.forEach(element => {
    element.disabled = !allowedRoles.includes(currentRole);
  });
}

/**
 * 為元素添加角色標記（data attribute）
 * 可配合 CSS 實現權限控制
 *
 * @example
 * HTML: <button data-require-role="admin,teacher">編輯</button>
 * CSS: [data-require-role]:not([data-role-granted]) { display: none; }
 */
function markElementsWithRole() {
  const currentRole = getCurrentRole();
  const elements = document.querySelectorAll('[data-require-role]');

  elements.forEach(element => {
    const requiredRoles = element.getAttribute('data-require-role').split(',');

    if (requiredRoles.includes(currentRole)) {
      element.setAttribute('data-role-granted', 'true');
    } else {
      element.removeAttribute('data-role-granted');
    }
  });
}

// ============================================
// 五、頁面訪問控制
// ============================================

/**
 * 設定每個頁面所需的最低角色
 */
const PAGE_REQUIREMENTS = {
  // 公開頁面
  '/index.html': null,
  '/teachers.html': null,
  '/courses.html': null,
  '/login.html': null,

  // 學員頁面
  '/my-schedule.html': 'student',
  '/my-surveys.html': 'student',

  // 教師頁面
  '/my-profile.html': 'teacher',
  '/my-survey-results.html': 'teacher',

  // 管理者頁面
  '/admin/teachers.html': 'admin',
  '/admin/courses.html': 'admin',
  '/admin/assignments.html': 'admin',
  '/admin/surveys.html': 'admin',
  '/admin/system.html': 'admin'
};

/**
 * 檢查當前頁面訪問權限
 * 在每個頁面載入時呼叫
 *
 * @returns {boolean} 是否有權限訪問
 *
 * @example
 * // 在每個頁面的 <script> 中加入
 * document.addEventListener('DOMContentLoaded', function() {
 *   if (!checkPageAccess()) {
 *     return; // 已導向登入頁，不繼續執行
 *   }
 *   // 繼續頁面初始化...
 * });
 */
function checkPageAccess() {
  // 先恢復認證狀態
  restoreAuthState();

  const currentPath = window.location.pathname;
  const requiredRole = PAGE_REQUIREMENTS[currentPath];

  // 公開頁面，不需檢查
  if (!requiredRole) {
    return true;
  }

  const currentRole = getCurrentRole();

  // 使用角色等級檢查
  if (!hasRoleLevel(requiredRole)) {
    alert('您沒有權限訪問此頁面，請先登入');
    const redirectUrl = encodeURIComponent(currentPath);
    window.location.href = `/login.html?redirect=${redirectUrl}`;
    return false;
  }

  return true;
}

// ============================================
// 六、初始化
// ============================================

/**
 * 頁面載入時自動執行
 */
document.addEventListener('DOMContentLoaded', function() {
  // 恢復認證狀態
  restoreAuthState();

  // 標記元素的角色權限
  markElementsWithRole();

  // 更新 UI（顯示用戶資訊）
  updateUserDisplay();
});

/**
 * 更新 UI 顯示用戶資訊
 */
function updateUserDisplay() {
  const userNameElements = document.querySelectorAll('[data-user-name]');
  const userRoleElements = document.querySelectorAll('[data-user-role]');

  if (AuthState.user) {
    userNameElements.forEach(el => {
      el.textContent = AuthState.user.full_name || AuthState.user.username;
    });

    userRoleElements.forEach(el => {
      const roleNames = {
        'visitor': '訪客',
        'student': '學員',
        'teacher': '教師',
        'admin': '管理者'
      };
      el.textContent = roleNames[AuthState.role] || AuthState.role;
    });
  }
}

// ============================================
// 七、登入/登出功能
// ============================================

/**
 * 登入函數（範例）
 * @param {string} username - 用戶名
 * @param {string} password - 密碼
 * @returns {Promise<boolean>}
 */
async function login(username, password) {
  try {
    // 呼叫 API 進行登入
    const response = await fetch(API_BASE_URL + '?action=login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const result = await response.json();

    if (result.ok && result.data) {
      // 設定認證狀態
      setAuthState(result.data.user, result.data.token);

      // 檢查是否有 redirect 參數
      const urlParams = new URLSearchParams(window.location.search);
      const redirect = urlParams.get('redirect');

      if (redirect) {
        window.location.href = redirect;
      } else {
        // 根據角色導向不同頁面
        const roleHomePage = {
          'admin': '/admin/teachers.html',
          'teacher': '/my-profile.html',
          'student': '/my-schedule.html'
        };

        window.location.href = roleHomePage[result.data.user.role] || '/index.html';
      }

      return true;
    } else {
      alert('登入失敗: ' + (result.error || '未知錯誤'));
      return false;
    }
  } catch (error) {
    console.error('登入錯誤:', error);
    alert('登入失敗，請稍後再試');
    return false;
  }
}

/**
 * 登出函數
 */
async function logout() {
  if (confirm('確定要登出嗎？')) {
    try {
      // 可選：呼叫後端登出 API
      // await fetch(API_BASE_URL + '?action=logout', {
      //   method: 'POST',
      //   headers: { 'Authorization': 'Bearer ' + getAuthToken() }
      // });

      clearAuthState();
      window.location.href = '/login.html';
    } catch (error) {
      console.error('登出錯誤:', error);
      // 即使 API 失敗，也清除本地狀態
      clearAuthState();
      window.location.href = '/login.html';
    }
  }
}

// ============================================
// 八、匯出（如果使用模組系統）
// ============================================

// 如果使用 ES6 模組
// export {
//   setAuthState,
//   clearAuthState,
//   restoreAuthState,
//   getCurrentRole,
//   getCurrentUserId,
//   getAuthToken,
//   isAuthenticated,
//   hasRole,
//   hasPermission,
//   canEdit,
//   canViewDetails,
//   canDelete,
//   canCreate,
//   hasRoleLevel,
//   showElementForRoles,
//   enableElementForRoles,
//   checkPageAccess,
//   login,
//   logout
// };
