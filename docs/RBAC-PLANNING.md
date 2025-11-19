# RBAC 權限規劃文檔

版本：v1.1.0
更新日期：2025-11-19

## 🔔 重要：選擇適合您的方案

本系統提供**兩種 RBAC 實作方案**：

### 📦 方案 A：簡化版（推薦，快速上手）
- ⏱️ **實施時間**：3-4 小時
- 💰 **成本**：免費
- 🏗️ **架構**：GitHub Pages + Google Apps Script
- 📖 **文檔**：[RBAC-GOOGLE-APPS-SCRIPT.md](RBAC-GOOGLE-APPS-SCRIPT.md)

### 🏢 方案 B：企業版（Azure AD + Docker + MySQL）
- ⏱️ **實施時間**：2-3 週
- 💰 **成本**：需要伺服器
- 🏗️ **架構**：Node.js + MySQL + Azure AD SSO
- 📖 **文檔**：[企業版方案](enterprise-solution/)

> 💡 **建議**：如果您使用 GitHub Pages + Google Apps Script 架構，請選擇方案 A

---

## 一、角色定義

### 1.1 訪客 (Visitor)
- **使用對象**：未登入用戶、外部訪客
- **主要目的**：瀏覽公開資訊
- **登入需求**：不需要（匿名訪問）

### 1.2 學員 (Student)
- **使用對象**：修課學生
- **主要目的**：查看課程資訊、填寫教學問卷
- **登入需求**：Azure AD SSO（公司 Outlook 帳號）
- **角色分配**：根據部門自動分配（部門包含「學員」或「學生」關鍵字）

### 1.3 教師 (Teacher)
- **使用對象**：專任、兼任、外聘教師
- **主要目的**：管理個人資料、查看授課資訊
- **登入需求**：
  - 內部教師：Azure AD SSO（公司 Outlook 帳號）
  - 外聘教師：Azure AD 訪客帳號或手動建立帳號
- **角色分配**：根據部門自動分配（部門包含「教師」或「講師」關鍵字）

### 1.4 管理者 (Admin)
- **使用對象**：系統管理員、課務組人員
- **主要目的**：完整系統管理
- **登入需求**：Azure AD SSO（公司 Outlook 帳號）
- **角色分配**：根據部門自動分配（部門包含「課務組」、「教務處」或「系統管理」關鍵字）

---

## 二、功能權限對照表

### 2.1 教師管理功能

| 功能 | 訪客 | 學員 | 教師 | 管理者 |
|------|:----:|:----:|:----:|:------:|
| 瀏覽教師列表（基本資訊） | ✅ | ✅ | ✅ | ✅ |
| 查看教師詳細資料 | ❌ | ✅ | ✅ (僅自己) | ✅ |
| 查看教師聯絡資訊 | ❌ | ✅ | ✅ (僅自己) | ✅ |
| 新增教師 | ❌ | ❌ | ❌ | ✅ |
| 編輯教師資料 | ❌ | ❌ | ✅ (僅自己) | ✅ |
| 刪除教師 | ❌ | ❌ | ❌ | ✅ |
| 上傳教師照片 | ❌ | ❌ | ✅ (僅自己) | ✅ |

### 2.2 課程管理功能

| 功能 | 訪客 | 學員 | 教師 | 管理者 |
|------|:----:|:----:|:----:|:------:|
| 瀏覽課程列表 | ✅ | ✅ | ✅ | ✅ |
| 查看課程詳細資訊 | ❌ | ✅ | ✅ | ✅ |
| 新增課程 | ❌ | ❌ | ❌ | ✅ |
| 編輯課程 | ❌ | ❌ | ❌ | ✅ |
| 刪除課程 | ❌ | ❌ | ❌ | ✅ |

### 2.3 派課管理功能

| 功能 | 訪客 | 學員 | 教師 | 管理者 |
|------|:----:|:----:|:----:|:------:|
| 查看課表 | ❌ | ✅ | ✅ (僅自己) | ✅ |
| 查看派課詳情 | ❌ | ❌ | ✅ (僅自己) | ✅ |
| 新增派課 | ❌ | ❌ | ❌ | ✅ |
| 編輯派課 | ❌ | ❌ | ❌ | ✅ |
| 刪除派課 | ❌ | ❌ | ❌ | ✅ |
| 匯出課表 | ❌ | ❌ | ✅ (僅自己) | ✅ |

### 2.4 問卷管理功能

| 功能 | 訪客 | 學員 | 教師 | 管理者 |
|------|:----:|:----:|:----:|:------:|
| 填寫問卷（透過連結） | ✅ | ✅ | ✅ | ✅ |
| 查看問卷列表 | ❌ | ❌ | ❌ | ✅ |
| 建立問卷 | ❌ | ❌ | ❌ | ✅ |
| 編輯問卷範本 | ❌ | ❌ | ❌ | ✅ |
| 查看問卷結果 | ❌ | ❌ | ✅ (僅自己的課程) | ✅ |
| 匯出問卷結果 | ❌ | ❌ | ✅ (僅自己的課程) | ✅ |
| 刪除問卷 | ❌ | ❌ | ❌ | ✅ |

### 2.5 系統管理功能

| 功能 | 訪客 | 學員 | 教師 | 管理者 |
|------|:----:|:----:|:----:|:------:|
| 用戶管理 | ❌ | ❌ | ❌ | ✅ |
| 角色權限設定 | ❌ | ❌ | ❌ | ✅ |
| 系統設定 | ❌ | ❌ | ❌ | ✅ |
| 查看操作日誌 | ❌ | ❌ | ❌ | ✅ |
| 資料備份/還原 | ❌ | ❌ | ❌ | ✅ |

---

## 三、畫面差異化設計

### 3.1 導航選單 (Navigation Menu)

#### 訪客 (未登入)
```
- 首頁
- 教師列表（僅顯示姓名、專長）
- 課程列表（僅顯示課程名稱）
- [登入按鈕]
```

#### 學員 (已登入)
```
- 首頁
- 教師列表（可查看詳細資料）
- 課程列表（可查看課程詳情）
- 我的課表
- 我的問卷
- 個人設定
- [登出]
```

#### 教師 (已登入)
```
- 首頁
- 我的資料
  - 基本資料
  - 經歷與證照
  - 專長領域
- 我的課表
- 我的問卷結果
- 個人設定
- [登出]
```

#### 管理者 (已登入)
```
- 首頁
- 教師管理
  - 教師列表
  - 新增教師
- 課程管理
  - 課程列表
  - 新增課程
- 派課管理
  - 派課列表
  - 新增派課
  - 時間衝突檢查
- 問卷管理
  - 問卷範本
  - 問卷列表
  - 問卷結果分析
- 系統管理
  - 用戶管理
  - 角色權限
  - 操作日誌
  - 系統設定
- [登出]
```

### 3.2 教師列表頁面差異

#### 訪客看到的內容
```html
[教師卡片]
- 照片（縮圖）
- 姓名
- 專長標籤（最多 3 個）
- [無法點擊查看詳情]
```

#### 學員看到的內容
```html
[教師卡片]
- 照片
- 姓名
- 教師類型（專任/兼任/外聘）
- 專長標籤（全部）
- [點擊查看詳情] ← 可查看經歷、證照
```

#### 教師看到的內容
```html
[教師列表]
- 可查看所有教師基本資訊
- 可查看自己的完整資料
- 自己的卡片顯示 [編輯] 按鈕
```

#### 管理者看到的內容
```html
[教師列表]
- 所有教師卡片都有 [編輯] [刪除] 按鈕
- 頂部有 [新增教師] 按鈕
- 可查看所有教師完整資料
- 可篩選、排序、搜尋
```

### 3.3 教師詳情頁面差異

#### 訪客
```
→ 導向登入頁面
```

#### 學員
```
顯示：
- 基本資料（姓名、照片、類型、地點）
- 教學經歷
- 證照資格
- 專長領域
隱藏：
- Email
- 電話
- 編輯功能
```

#### 教師（查看自己）
```
顯示：
- 所有資料（包含聯絡資訊）
- [編輯資料] 按鈕
- [上傳照片] 按鈕
```

#### 教師（查看他人）
```
與學員相同
```

#### 管理者
```
顯示：
- 所有資料（包含聯絡資訊）
- [編輯] [刪除] 按鈕
- 建立者/更新者資訊
- 版本號（樂觀鎖）
```

---

## 四、前端實現策略

### 4.1 認證狀態管理

建議使用全域狀態管理（或 localStorage）：

```javascript
// auth-state.js
const AuthState = {
  isAuthenticated: false,
  user: null,
  role: null,  // 'visitor', 'student', 'teacher', 'admin'
  permissions: [],
  token: null
};

function setAuthState(user, token) {
  AuthState.isAuthenticated = true;
  AuthState.user = user;
  AuthState.role = user.role;
  AuthState.permissions = user.permissions;
  AuthState.token = token;
  localStorage.setItem('authToken', token);
  localStorage.setItem('userRole', user.role);
}

function clearAuthState() {
  AuthState.isAuthenticated = false;
  AuthState.user = null;
  AuthState.role = null;
  AuthState.permissions = [];
  AuthState.token = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('userRole');
}

function getCurrentRole() {
  return AuthState.role || localStorage.getItem('userRole') || 'visitor';
}
```

### 4.2 權限檢查輔助函數

```javascript
// auth-helpers.js

// 檢查是否有特定角色
function hasRole(...roles) {
  const currentRole = getCurrentRole();
  return roles.includes(currentRole);
}

// 檢查是否有特定權限
function hasPermission(permission) {
  return AuthState.permissions.includes(permission);
}

// 檢查是否可以編輯特定資源
function canEdit(resource) {
  const role = getCurrentRole();

  // 管理者可以編輯所有東西
  if (role === 'admin') return true;

  // 教師只能編輯自己的資料
  if (role === 'teacher' && resource.type === 'teacher') {
    return resource.userId === AuthState.user.id;
  }

  return false;
}

// 檢查是否可以查看詳細資料
function canViewDetails(resourceType) {
  const role = getCurrentRole();

  if (role === 'visitor') return false;

  // 學員、教師、管理者可以查看詳細資料
  return ['student', 'teacher', 'admin'].includes(role);
}
```

### 4.3 UI 元件條件渲染

```javascript
// 範例：教師卡片元件
function renderTeacherCard(teacher) {
  const role = getCurrentRole();
  const isOwnProfile = AuthState.user?.id === teacher.userId;

  return `
    <div class="teacher-card">
      <img src="${teacher.photoUrl}" alt="${teacher.name}">
      <h3>${teacher.name}</h3>

      <!-- 標籤：所有人都能看到 -->
      <div class="tags">
        ${teacher.tags.slice(0, role === 'visitor' ? 3 : 999).map(tag =>
          `<span class="tag">${tag}</span>`
        ).join('')}
      </div>

      <!-- 教師類型：登入後可見 -->
      ${role !== 'visitor' ? `
        <span class="teacher-type">${teacher.teacherType}</span>
      ` : ''}

      <!-- 查看詳情按鈕：學員以上可見 -->
      ${canViewDetails('teacher') ? `
        <button onclick="viewTeacherDetails('${teacher.id}')">
          查看詳情
        </button>
      ` : ''}

      <!-- 編輯按鈕：管理者或本人可見 -->
      ${canEdit({ type: 'teacher', userId: teacher.userId }) ? `
        <button onclick="editTeacher('${teacher.id}')">
          編輯
        </button>
      ` : ''}

      <!-- 刪除按鈕：僅管理者可見 -->
      ${hasRole('admin') ? `
        <button onclick="deleteTeacher('${teacher.id}')" class="danger">
          刪除
        </button>
      ` : ''}
    </div>
  `;
}
```

### 4.4 導航選單動態生成

```javascript
// navigation.js
function renderNavigation() {
  const role = getCurrentRole();

  const menuItems = {
    visitor: [
      { label: '首頁', url: '/index.html' },
      { label: '教師列表', url: '/teachers.html' },
      { label: '課程列表', url: '/courses.html' },
      { label: '登入', url: '/login.html', class: 'btn-primary' }
    ],

    student: [
      { label: '首頁', url: '/index.html' },
      { label: '教師列表', url: '/teachers.html' },
      { label: '課程列表', url: '/courses.html' },
      { label: '我的課表', url: '/my-schedule.html' },
      { label: '我的問卷', url: '/my-surveys.html' },
      { label: '個人設定', url: '/settings.html' },
      { label: '登出', url: '#', onclick: 'logout()', class: 'btn-secondary' }
    ],

    teacher: [
      { label: '首頁', url: '/index.html' },
      { label: '我的資料', url: '/my-profile.html' },
      { label: '我的課表', url: '/my-schedule.html' },
      { label: '問卷結果', url: '/my-survey-results.html' },
      { label: '個人設定', url: '/settings.html' },
      { label: '登出', url: '#', onclick: 'logout()' }
    ],

    admin: [
      { label: '首頁', url: '/index.html' },
      { label: '教師管理', url: '/admin/teachers.html' },
      { label: '課程管理', url: '/admin/courses.html' },
      { label: '派課管理', url: '/admin/assignments.html' },
      { label: '問卷管理', url: '/admin/surveys.html' },
      { label: '系統管理', url: '/admin/system.html' },
      { label: '登出', url: '#', onclick: 'logout()' }
    ]
  };

  const items = menuItems[role] || menuItems.visitor;

  return `
    <nav class="main-nav">
      <ul>
        ${items.map(item => `
          <li>
            <a href="${item.url}"
               ${item.onclick ? `onclick="${item.onclick}"` : ''}
               ${item.class ? `class="${item.class}"` : ''}>
              ${item.label}
            </a>
          </li>
        `).join('')}
      </ul>
    </nav>
  `;
}
```

### 4.5 頁面載入時的權限檢查

```javascript
// page-guard.js

// 設定每個頁面所需的最低角色
const PAGE_REQUIREMENTS = {
  '/index.html': null,  // 公開頁面
  '/teachers.html': null,  // 公開頁面
  '/courses.html': null,  // 公開頁面
  '/login.html': null,

  '/my-schedule.html': 'student',  // 需要學員以上權限
  '/my-surveys.html': 'student',
  '/my-profile.html': 'teacher',  // 需要教師以上權限
  '/my-survey-results.html': 'teacher',

  '/admin/teachers.html': 'admin',  // 需要管理者權限
  '/admin/courses.html': 'admin',
  '/admin/assignments.html': 'admin',
  '/admin/surveys.html': 'admin',
  '/admin/system.html': 'admin'
};

// 角色等級
const ROLE_LEVELS = {
  'visitor': 0,
  'student': 1,
  'teacher': 2,
  'admin': 3
};

// 在每個頁面開始時檢查權限
function checkPageAccess() {
  const currentPath = window.location.pathname;
  const requiredRole = PAGE_REQUIREMENTS[currentPath];

  // 公開頁面，不需檢查
  if (!requiredRole) return true;

  const currentRole = getCurrentRole();
  const currentLevel = ROLE_LEVELS[currentRole] || 0;
  const requiredLevel = ROLE_LEVELS[requiredRole] || 0;

  // 權限不足，導向登入頁
  if (currentLevel < requiredLevel) {
    alert('您沒有權限訪問此頁面，請先登入');
    window.location.href = '/login.html?redirect=' + encodeURIComponent(currentPath);
    return false;
  }

  return true;
}

// 在每個頁面的 <script> 中加入
// checkPageAccess();
```

---

## 五、後端實現策略

### 5.1 Google Apps Script 方案（短期）

#### 步驟 1：新增認證相關表格

在 Google Sheets 新增以下工作表：

**users 表**
```
| id | username | email | password_hash | full_name | role | is_active | created_at |
```

**sessions 表**
```
| session_id | user_id | token | expires_at | created_at |
```

#### 步驟 2：實作認證 API

在 `backend-api.gs` 新增：

```javascript
// 登入
function handleLogin(params) {
  const { username, password } = params;

  // 查詢用戶
  const users = SHEETS.users.getDataRange().getValues();
  const userRow = users.find(row => row[1] === username);

  if (!userRow) {
    throw new Error('用戶不存在');
  }

  // 驗證密碼（簡化版，實際應使用 bcrypt）
  if (userRow[3] !== hashPassword(password)) {
    throw new Error('密碼錯誤');
  }

  // 產生 Token（簡化版，實際應使用 JWT）
  const token = generateToken();
  const sessionId = Utilities.getUuid();

  // 儲存 Session
  SHEETS.sessions.appendRow([
    sessionId,
    userRow[0],  // user_id
    token,
    new Date(Date.now() + 24 * 60 * 60 * 1000),  // 24小時後過期
    new Date()
  ]);

  return {
    token: token,
    user: {
      id: userRow[0],
      username: userRow[1],
      email: userRow[2],
      fullName: userRow[4],
      role: userRow[5]
    }
  };
}

// 驗證 Token 並取得用戶角色
function _checkTokenAndGetRole(token) {
  if (!token) return 'visitor';

  const sessions = SHEETS.sessions.getDataRange().getValues();
  const session = sessions.find(row => row[2] === token);

  if (!session) return 'visitor';

  // 檢查是否過期
  if (new Date(session[3]) < new Date()) {
    return 'visitor';
  }

  // 取得用戶角色
  const users = SHEETS.users.getDataRange().getValues();
  const user = users.find(row => row[0] === session[1]);

  return user ? user[5] : 'visitor';  // user[5] 是 role 欄位
}

// 檢查權限
function _requireRole(token, ...allowedRoles) {
  const role = _checkTokenAndGetRole(token);

  if (!allowedRoles.includes(role)) {
    throw new Error('權限不足');
  }

  return role;
}
```

#### 步驟 3：在現有 API 加入權限檢查

```javascript
function doGet(e) {
  try {
    const params = e.parameter;
    const action = params.action;
    const token = params.token;

    if (action === 'ping') {
      return jsonResponse({ ok: true, message: 'pong' });
    }

    if (action === 'login') {
      // 登入不需要 token
      const result = handleLogin(params);
      return jsonResponse({ ok: true, data: result });
    }

    // 取得當前用戶角色
    const role = _checkTokenAndGetRole(token);

    if (action === 'list') {
      const table = params.table;

      // 權限檢查範例
      if (table === 'teachers') {
        // 所有人都可以查看教師列表（但返回的資料不同）
        const data = listTable(table);

        // 根據角色過濾資料
        if (role === 'visitor') {
          // 訪客只能看到基本資訊
          data.forEach(teacher => {
            delete teacher.email;
            delete teacher.phone;
            teacher.tags = teacher.tags.slice(0, 3);  // 只顯示 3 個標籤
          });
        }

        return jsonResponse({ ok: true, data: data, role: role });
      }

      if (table === 'courseAssignments') {
        // 只有登入用戶可以查看派課
        if (role === 'visitor') {
          throw new Error('請先登入');
        }

        const data = listTable(table);

        // 教師只能看到自己的派課
        if (role === 'teacher') {
          const userId = _getUserIdFromToken(token);
          return jsonResponse({
            ok: true,
            data: data.filter(item => item.teacherId === userId)
          });
        }

        // 管理者可以看到所有派課
        return jsonResponse({ ok: true, data: data });
      }
    }

    if (action === 'save') {
      // 儲存需要特定權限
      const table = params.table;

      if (table === 'teachers') {
        // 檢查是否為管理者
        _requireRole(token, 'admin');
      }

      // ... 原有的儲存邏輯
    }

    return jsonResponse({ ok: false, error: 'Unknown action' });

  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}
```

### 5.2 Node.js + MySQL 方案（長期）

您的專案已經有完整的 RBAC 實作！位於：
- 資料庫結構：`/database/init/01_schema.sql`
- 種子資料：`/database/init/02_seed_data.sql`
- 認證中介層：`/backend/src/middleware/auth.ts`

只需要：
1. 在資料庫種子資料中加入 `student` 角色
2. 完善其他 API 路由
3. 部署到生產環境

---

## 六、實施步驟建議

### 方案 A：快速實作（1-2 週）

基於 Google Apps Script 實作基礎 RBAC：

**Week 1**
- [ ] Day 1-2：建立 users 和 sessions 表格
- [ ] Day 3-4：實作登入/登出 API
- [ ] Day 5：實作權限檢查函數

**Week 2**
- [ ] Day 1-2：修改前端，加入登入頁面
- [ ] Day 3-4：實作角色檢查和 UI 差異化
- [ ] Day 5：測試和修正

### 方案 B：完整升級（2-4 週）

遷移到 Node.js + MySQL：

**Week 1**
- [ ] 在資料庫種子資料中加入 student 角色和權限
- [ ] 完善 courses, assignments, surveys 路由
- [ ] 實作用戶管理 CRUD API

**Week 2**
- [ ] 部署 Docker 環境
- [ ] 測試資料遷移腳本
- [ ] 遷移現有資料

**Week 3-4**
- [ ] 前端改造，連接新 API
- [ ] 實作前端權限控制
- [ ] 整合測試
- [ ] 生產環境部署

---

## 七、建議

1. **短期建議**：先在 Google Apps Script 上實作基礎 RBAC，快速上線
2. **長期建議**：規劃遷移到 Node.js + MySQL，獲得更好的效能和安全性
3. **優先級**：先實作登入功能和角色判斷，UI 差異化可以分階段進行
4. **安全性**：
   - 密碼必須加密（bcrypt）
   - 使用 HTTPS
   - Token 設定過期時間
   - 重要操作需要二次確認

---

## 八、相關文件

- 資料庫 Schema：`/database/init/01_schema.sql`
- 種子資料：`/database/init/02_seed_data.sql`
- 認證中介層：`/backend/src/middleware/auth.ts`
- 教師路由範例：`/backend/src/routes/teachers.ts`
- API 文件：`/docs/API.md`
