# RBAC 權限控制規劃 - Google Apps Script 簡化版

版本：v2.0.0
更新日期：2025-11-19
適用架構：GitHub Pages + Google Apps Script + Google Sheets

---

## 📌 系統架構

```
前端 (GitHub Pages)
    ↓ HTTPS REST API
Google Apps Script (API 層)
    ↓ SpreadsheetApp
Google Sheets (資料層)
```

**特點**：
- ✅ 零伺服器成本
- ✅ 簡單易維護
- ✅ 無需 Docker、Azure AD
- ✅ 使用 Google 生態系統

---

## 一、角色定義

### 1.1 訪客 (visitor)
- **使用對象**：未登入用戶、外部訪客
- **主要目的**：瀏覽公開資訊
- **登入需求**：不需要（前端自動設為訪客）

### 1.2 學員 (student)
- **使用對象**：修課學生
- **主要目的**：查看課程、填寫問卷
- **登入需求**：學號 + 密碼（儲存在 Google Sheets）

### 1.3 教師 (teacher)
- **使用對象**：專任、兼任、外聘教師
- **主要目的**：管理個人資料、查看授課資訊
- **登入需求**：帳號 + 密碼（儲存在 Google Sheets）

### 1.4 管理者 (admin)
- **使用對象**：系統管理員、課務組人員
- **主要目的**：完整系統管理
- **登入需求**：帳號 + 密碼（儲存在 Google Sheets）

---

## 二、Google Sheets 資料表結構

### 2.1 新增 users 表

在您的 Google Sheets 新增一個工作表 `users`：

| 欄位 | 類型 | 說明 | 範例 |
|------|------|------|------|
| id | 文字 | 用戶 ID（自動產生） | user_001 |
| username | 文字 | 用戶名（唯一） | teacher001 |
| password | 文字 | 密碼（SHA-256 雜湊） | 5e884898da28047... |
| full_name | 文字 | 全名 | 王大明 |
| email | 文字 | Email | wang@example.com |
| role | 文字 | 角色 | teacher |
| teacher_id | 文字 | 關聯的教師 ID（可空） | 1 |
| is_active | 布林 | 是否啟用 | TRUE |
| created_at | 日期 | 建立時間 | 2025-11-19 |

### 2.2 新增 sessions 表

在您的 Google Sheets 新增一個工作表 `sessions`：

| 欄位 | 類型 | 說明 | 範例 |
|------|------|------|------|
| session_id | 文字 | Session ID | sess_abc123... |
| user_id | 文字 | 用戶 ID | user_001 |
| token | 文字 | Token（唯一） | tr_1732012345_xyz |
| expires_at | 日期時間 | 過期時間 | 2025-11-20 12:00:00 |
| created_at | 日期時間 | 建立時間 | 2025-11-19 12:00:00 |

---

## 三、權限對照表（簡化版）

### 3.1 教師管理

| 功能 | 訪客 | 學員 | 教師 | 管理者 |
|------|:----:|:----:|:----:|:------:|
| 瀏覽教師列表（基本資訊） | ✅ | ✅ | ✅ | ✅ |
| 查看教師詳細資料 | ❌ | ✅ | ✅ (僅自己) | ✅ |
| 編輯教師資料 | ❌ | ❌ | ✅ (僅自己) | ✅ |
| 刪除教師 | ❌ | ❌ | ❌ | ✅ |

### 3.2 課程管理

| 功能 | 訪客 | 學員 | 教師 | 管理者 |
|------|:----:|:----:|:----:|:------:|
| 瀏覽課程列表 | ✅ | ✅ | ✅ | ✅ |
| 查看課程詳細資訊 | ❌ | ✅ | ✅ | ✅ |
| 編輯課程 | ❌ | ❌ | ❌ | ✅ |

### 3.3 派課管理

| 功能 | 訪客 | 學員 | 教師 | 管理者 |
|------|:----:|:----:|:----:|:------:|
| 查看課表 | ❌ | ✅ | ✅ (僅自己) | ✅ |
| 編輯派課 | ❌ | ❌ | ❌ | ✅ |

### 3.4 問卷管理

| 功能 | 訪客 | 學員 | 教師 | 管理者 |
|------|:----:|:----:|:----:|:------:|
| 填寫問卷（透過連結） | ✅ | ✅ | ✅ | ✅ |
| 查看問卷結果 | ❌ | ❌ | ✅ (僅自己) | ✅ |
| 建立問卷 | ❌ | ❌ | ❌ | ✅ |

---

## 四、後端實作（Google Apps Script）

### 4.1 更新 backend-api.gs

在現有的 `backend-api.gs` 加入以下功能：

#### 4.1.1 設定區

```javascript
// ========================================
// 設定
// ========================================

const SHEET_ID = '1CPhI67yZt1W6FLV9Q02gjyJsdTP79pgUAc27ZZw3nJ4';
const SS = SpreadsheetApp.openById(SHEET_ID);

// 工作表
const SHEETS = {
  teachers: SS.getSheetByName('teachers'),
  courseAssignments: SS.getSheetByName('courseAssignments'),
  maritimeCourses: SS.getSheetByName('maritimeCourses'),
  surveyTemplates: SS.getSheetByName('surveyTemplates'),
  surveys: SS.getSheetByName('surveys'),
  surveyResponses: SS.getSheetByName('surveyResponses'),
  users: SS.getSheetByName('users'),           // 新增
  sessions: SS.getSheetByName('sessions')      // 新增
};

// 角色權限定義
const ROLE_PERMISSIONS = {
  visitor: ['teacher.view_basic', 'course.view_basic'],
  student: ['teacher.view', 'course.view', 'assignment.view', 'survey.respond'],
  teacher: ['teacher.view', 'teacher.update_own', 'course.view', 'assignment.view_own', 'survey.view_own'],
  admin: ['*']  // 所有權限
};
```

#### 4.1.2 登入功能

```javascript
/**
 * 處理登入
 * GET /?action=login&username=xxx&password=xxx
 */
function handleLogin(params) {
  const username = params.username;
  const password = params.password;

  if (!username || !password) {
    throw new Error('請提供用戶名和密碼');
  }

  // 查詢用戶
  const usersSheet = SHEETS.users;
  const usersData = usersSheet.getDataRange().getValues();
  const headers = usersData[0];
  const users = usersData.slice(1);

  // 欄位索引
  const idx = {
    id: headers.indexOf('id'),
    username: headers.indexOf('username'),
    password: headers.indexOf('password'),
    full_name: headers.indexOf('full_name'),
    email: headers.indexOf('email'),
    role: headers.indexOf('role'),
    teacher_id: headers.indexOf('teacher_id'),
    is_active: headers.indexOf('is_active')
  };

  // 尋找用戶
  const userRow = users.find(row => row[idx.username] === username);

  if (!userRow) {
    throw new Error('用戶名或密碼錯誤');
  }

  // 檢查是否啟用
  if (!userRow[idx.is_active]) {
    throw new Error('此帳號已被停用');
  }

  // 驗證密碼（使用 SHA-256 雜湊）
  const passwordHash = hashPassword(password);
  if (passwordHash !== userRow[idx.password]) {
    throw new Error('用戶名或密碼錯誤');
  }

  // 產生 Token
  const token = generateToken();
  const sessionId = Utilities.getUuid();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小時

  // 儲存 Session
  SHEETS.sessions.appendRow([
    sessionId,
    userRow[idx.id],
    token,
    expiresAt,
    new Date()
  ]);

  // 返回用戶資訊和 Token
  return jsonResponse({
    ok: true,
    data: {
      user: {
        id: userRow[idx.id],
        username: userRow[idx.username],
        email: userRow[idx.email],
        full_name: userRow[idx.full_name],
        role: userRow[idx.role],
        teacher_id: userRow[idx.teacher_id],
        permissions: ROLE_PERMISSIONS[userRow[idx.role]] || []
      },
      token: token,
      expiresAt: expiresAt
    }
  });
}

/**
 * 處理登出
 * POST /?action=logout&token=xxx
 */
function handleLogout(token) {
  if (!token) {
    return jsonResponse({ ok: true, message: '已登出' });
  }

  // 刪除 Session
  const sessionsSheet = SHEETS.sessions;
  const sessionsData = sessionsSheet.getDataRange().getValues();

  for (let i = 1; i < sessionsData.length; i++) {
    if (sessionsData[i][2] === token) {  // token 在第 3 欄 (index 2)
      sessionsSheet.deleteRow(i + 1);
      break;
    }
  }

  return jsonResponse({ ok: true, message: '已登出' });
}

/**
 * 產生 Token
 */
function generateToken() {
  const timestamp = new Date().getTime();
  const random = Math.random().toString(36).substring(2);
  return 'tr_' + timestamp + '_' + random;
}

/**
 * 密碼雜湊（SHA-256）
 */
function hashPassword(password) {
  const rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  );

  // 轉換為 hex 字串
  return rawHash.map(byte => {
    const hex = (byte & 0xFF).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}
```

#### 4.1.3 Token 驗證

```javascript
/**
 * 驗證 Token 並取得用戶資訊
 */
function verifyToken(token) {
  if (!token) {
    // 未提供 Token，視為訪客
    return {
      role: 'visitor',
      username: 'guest',
      userId: null,
      teacherId: null,
      permissions: ROLE_PERMISSIONS.visitor
    };
  }

  // 查詢 Session
  const sessionsSheet = SHEETS.sessions;
  const sessionsData = sessionsSheet.getDataRange().getValues();
  const headers = sessionsData[0];
  const sessions = sessionsData.slice(1);

  const idx = {
    session_id: headers.indexOf('session_id'),
    user_id: headers.indexOf('user_id'),
    token: headers.indexOf('token'),
    expires_at: headers.indexOf('expires_at')
  };

  const session = sessions.find(row => row[idx.token] === token);

  if (!session) {
    throw new Error('無效的 Token，請重新登入');
  }

  // 檢查是否過期
  const expiresAt = new Date(session[idx.expires_at]);
  if (expiresAt < new Date()) {
    throw new Error('Token 已過期，請重新登入');
  }

  // 取得用戶資訊
  const userId = session[idx.user_id];
  const usersSheet = SHEETS.users;
  const usersData = usersSheet.getDataRange().getValues();
  const userHeaders = usersData[0];
  const users = usersData.slice(1);

  const userIdx = {
    id: userHeaders.indexOf('id'),
    username: userHeaders.indexOf('username'),
    email: userHeaders.indexOf('email'),
    full_name: userHeaders.indexOf('full_name'),
    role: userHeaders.indexOf('role'),
    teacher_id: userHeaders.indexOf('teacher_id'),
    is_active: userHeaders.indexOf('is_active')
  };

  const user = users.find(row => row[userIdx.id] === userId);

  if (!user || !user[userIdx.is_active]) {
    throw new Error('用戶不存在或已被停用');
  }

  return {
    userId: user[userIdx.id],
    username: user[userIdx.username],
    email: user[userIdx.email],
    full_name: user[userIdx.full_name],
    role: user[userIdx.role],
    teacherId: user[userIdx.teacher_id],
    permissions: ROLE_PERMISSIONS[user[userIdx.role]] || []
  };
}
```

#### 4.1.4 權限檢查

```javascript
/**
 * 檢查是否有特定權限
 */
function hasPermission(authInfo, permission) {
  // 管理者有所有權限
  if (authInfo.role === 'admin') {
    return true;
  }

  // 檢查權限列表
  return authInfo.permissions.includes(permission) ||
         authInfo.permissions.includes('*');
}

/**
 * 要求特定角色（沒有則拋出錯誤）
 */
function requireRole(authInfo, ...roles) {
  if (!roles.includes(authInfo.role)) {
    throw new Error('權限不足：需要 ' + roles.join(' 或 ') + ' 角色');
  }
  return true;
}
```

#### 4.1.5 更新主要端點處理

```javascript
/**
 * 處理 GET 請求
 */
function doGet(e) {
  try {
    const params = e.parameter;
    const action = params.action;

    // 公開端點
    if (action === 'ping') {
      return jsonResponse({ ok: true, message: 'pong' });
    }

    if (action === 'login') {
      return handleLogin(params);
    }

    // 需要認證的端點
    const token = params.token;
    const authInfo = verifyToken(token);

    Logger.log('[Auth] 用戶: ' + authInfo.username + ', 角色: ' + authInfo.role);

    // 根據 action 分發請求
    switch (action) {
      case 'logout':
        return handleLogout(token);

      case 'me':
        return jsonResponse({ ok: true, data: authInfo });

      case 'list':
        return handleList(params, authInfo);

      case 'get':
        return handleGetOne(params, authInfo);

      default:
        throw new Error('Unknown action: ' + action);
    }

  } catch (error) {
    Logger.log('[Error] ' + error.message);
    return jsonResponse({
      ok: false,
      error: error.message
    });
  }
}

/**
 * 處理列表查詢（含權限過濾）
 */
function handleList(params, authInfo) {
  const table = params.table;

  if (!table || !SHEETS[table]) {
    throw new Error('無效的表格名稱');
  }

  // 根據表格類型檢查權限並過濾資料
  switch (table) {
    case 'teachers':
      return handleListTeachers(authInfo);

    case 'courseAssignments':
      return handleListAssignments(authInfo);

    default:
      // 其他表格，至少需要登入
      if (authInfo.role === 'visitor') {
        throw new Error('請先登入');
      }
      return jsonResponse({
        ok: true,
        data: getTableData(table)
      });
  }
}

/**
 * 處理教師列表（根據角色過濾）
 */
function handleListTeachers(authInfo) {
  const data = getTableData('teachers');
  const role = authInfo.role;

  // 根據角色過濾資料
  const filteredData = data.map(teacher => {
    if (role === 'visitor') {
      // 訪客只能看到基本資訊
      return {
        id: teacher.id,
        name: teacher.name,
        teacherType: teacher.teacherType,
        photoUrl: teacher.photoUrl,
        tags: teacher.tags ? teacher.tags.slice(0, 3) : []
      };
    } else if (role === 'student') {
      // 學員可以看到完整資料（但不含敏感資訊）
      const { id, name, email, teacherType, workLocation, photoUrl,
              experiences, certificates, subjects, tags } = teacher;
      return { id, name, email, teacherType, workLocation, photoUrl,
               experiences, certificates, subjects, tags };
    } else {
      // 教師和管理者可以看到所有資料
      return teacher;
    }
  });

  return jsonResponse({
    ok: true,
    data: filteredData,
    role: role
  });
}

/**
 * 處理派課列表（根據角色過濾）
 */
function handleListAssignments(authInfo) {
  // 訪客無法查看派課
  if (authInfo.role === 'visitor') {
    throw new Error('請先登入以查看課表');
  }

  const data = getTableData('courseAssignments');

  // 教師只能看到自己的派課
  if (authInfo.role === 'teacher' && authInfo.teacherId) {
    const filteredData = data.filter(item => {
      return item.teacherId === authInfo.teacherId;
    });

    return jsonResponse({ ok: true, data: filteredData });
  }

  // 學員和管理者可以看到所有派課
  return jsonResponse({ ok: true, data: data });
}
```

#### 4.1.6 處理儲存（含權限檢查）

```javascript
/**
 * 處理 POST 請求
 */
function doPost(e) {
  try {
    const params = e.parameter;
    const action = params.action;
    const token = params.token;

    // 驗證 Token
    const authInfo = verifyToken(token);

    Logger.log('[Auth] 用戶: ' + authInfo.username + ', 角色: ' + authInfo.role);

    // 根據 action 分發請求
    switch (action) {
      case 'save':
        return handleSave(params, authInfo);

      case 'delete':
        return handleDelete(params, authInfo);

      default:
        throw new Error('Unknown action: ' + action);
    }

  } catch (error) {
    Logger.log('[Error] ' + error.message);
    return jsonResponse({
      ok: false,
      error: error.message
    });
  }
}

/**
 * 處理儲存
 */
function handleSave(params, authInfo) {
  const table = params.table;
  const dataJson = params.data;

  if (!table || !dataJson) {
    throw new Error('缺少參數：table 和 data');
  }

  // 根據表格類型檢查權限
  switch (table) {
    case 'teachers':
      return handleSaveTeacher(dataJson, authInfo);

    case 'courseAssignments':
      requireRole(authInfo, 'admin');  // 只有管理者可以派課
      break;

    case 'surveyResponses':
      // 所有人都可以填寫問卷
      break;

    default:
      requireRole(authInfo, 'admin');  // 其他操作需要管理者權限
  }

  // 解析並儲存資料
  const data = JSON.parse(dataJson);
  saveTableData(table, data);

  return jsonResponse({ ok: true, message: '儲存成功' });
}

/**
 * 處理教師資料儲存
 */
function handleSaveTeacher(dataJson, authInfo) {
  const data = JSON.parse(dataJson);

  // 教師只能編輯自己的資料
  if (authInfo.role === 'teacher') {
    // 檢查是否只編輯自己的資料
    const hasOtherTeachers = data.some(teacher => {
      return teacher.id && teacher.id !== authInfo.teacherId;
    });

    if (hasOtherTeachers) {
      throw new Error('您只能編輯自己的資料');
    }
  } else if (authInfo.role !== 'admin') {
    throw new Error('權限不足：無法編輯教師資料');
  }

  // 儲存資料
  saveTableData('teachers', data);

  return jsonResponse({ ok: true, message: '儲存成功' });
}

/**
 * 處理刪除
 */
function handleDelete(params, authInfo) {
  // 只有管理者可以刪除
  requireRole(authInfo, 'admin');

  const table = params.table;
  const id = params.id;

  if (!table || !id) {
    throw new Error('缺少參數：table 和 id');
  }

  deleteTableRow(table, id);

  return jsonResponse({ ok: true, message: '刪除成功' });
}
```

---

## 五、前端實作

### 5.1 更新登入頁面

建立 `login.html`：

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>登入 - 教師花名冊系統</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div class="login-container">
    <div class="login-header">
      <h1>🎓 教師花名冊系統</h1>
      <p>Teacher Roster Management System</p>
    </div>

    <div class="login-body">
      <!-- 錯誤訊息 -->
      <div class="error-message" id="error-message" style="display: none;"></div>

      <!-- 登入表單 -->
      <form id="login-form">
        <div class="form-group">
          <label for="username">用戶名</label>
          <input type="text" id="username" name="username"
                 placeholder="請輸入用戶名" required>
        </div>

        <div class="form-group">
          <label for="password">密碼</label>
          <input type="password" id="password" name="password"
                 placeholder="請輸入密碼" required>
        </div>

        <button type="submit" class="btn-login">登入</button>
      </form>

      <div class="login-footer">
        <button class="btn-guest" onclick="continueAsGuest()">
          以訪客身分繼續瀏覽
        </button>
      </div>
    </div>
  </div>

  <script src="js/config.js"></script>
  <script src="js/auth-helpers.js"></script>
  <script>
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', async function(e) {
      e.preventDefault();

      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;

      try {
        // 呼叫登入 API
        const result = await api.login(username, password);

        if (result.ok) {
          // 儲存認證狀態
          setAuthState(result.data.user, result.data.token);

          // 導向對應頁面
          const roleHomePage = {
            'admin': 'admin.html',
            'teacher': 'my-profile.html',
            'student': 'my-schedule.html'
          };

          window.location.href = roleHomePage[result.data.user.role] || 'index.html';
        } else {
          showError(result.error || '登入失敗');
        }
      } catch (error) {
        showError('登入失敗：' + error.message);
      }
    });

    function showError(message) {
      errorMessage.textContent = message;
      errorMessage.style.display = 'block';
    }

    function continueAsGuest() {
      // 清除認證狀態（設為訪客）
      clearAuthState();
      window.location.href = 'index.html';
    }
  </script>
</body>
</html>
```

### 5.2 更新 API 通訊層

在 `js/api.js` 加入登入相關方法：

```javascript
// API 基礎設定
const API_BASE_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';

const api = {
  /**
   * 登入
   */
  async login(username, password) {
    const url = `${API_BASE_URL}?action=login&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const response = await fetch(url);
    return await response.json();
  },

  /**
   * 登出
   */
  async logout() {
    const token = getAuthToken();
    if (!token) return { ok: true };

    const url = `${API_BASE_URL}?action=logout&token=${token}`;
    const response = await fetch(url, { method: 'POST' });
    const result = await response.json();

    // 清除本地狀態
    clearAuthState();

    return result;
  },

  /**
   * 取得當前用戶資訊
   */
  async me() {
    const token = getAuthToken();
    const url = `${API_BASE_URL}?action=me&token=${token}`;
    const response = await fetch(url);
    return await response.json();
  },

  /**
   * 列表查詢（加入 Token）
   */
  async list(table) {
    const token = getAuthToken() || '';
    const url = `${API_BASE_URL}?action=list&table=${table}&token=${token}`;
    const response = await fetch(url);
    return await response.json();
  },

  /**
   * 儲存資料（加入 Token）
   */
  async save(table, data) {
    const token = getAuthToken();
    if (!token) throw new Error('請先登入');

    const formData = new URLSearchParams();
    formData.append('action', 'save');
    formData.append('table', table);
    formData.append('data', JSON.stringify(data));
    formData.append('token', token);

    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      body: formData
    });

    return await response.json();
  }
};
```

### 5.3 使用 auth-helpers.js

複製之前建立的 `docs/examples/auth-helpers.js` 到 `js/auth-helpers.js`，無需修改，直接使用！

---

## 六、建立測試帳號

### 6.1 在 Google Sheets 建立測試帳號

在 `users` 工作表新增以下測試帳號：

| id | username | password | full_name | email | role | teacher_id | is_active |
|----|----------|----------|-----------|-------|------|------------|-----------|
| user_001 | admin | (密碼雜湊) | 管理員 | admin@example.com | admin | | TRUE |
| user_002 | teacher001 | (密碼雜湊) | 王大明 | wang@example.com | teacher | 1 | TRUE |
| user_003 | student001 | (密碼雜湊) | 學員張三 | student@example.com | student | | TRUE |

### 6.2 產生密碼雜湊

使用 Google Apps Script 產生密碼雜湊：

```javascript
function generatePasswordHash() {
  const password = 'password123';  // 修改為您要的密碼
  const hash = hashPassword(password);
  Logger.log('密碼雜湊: ' + hash);
}
```

執行這個函數，取得雜湊值後填入 `users` 表的 `password` 欄位。

---

## 七、實施步驟

### 步驟 1：建立資料表（15 分鐘）
- [ ] 在 Google Sheets 新增 `users` 工作表
- [ ] 在 Google Sheets 新增 `sessions` 工作表
- [ ] 建立測試帳號（admin, teacher, student）

### 步驟 2：更新後端（30 分鐘）
- [ ] 複製上面的程式碼到 `backend-api.gs`
- [ ] 測試登入 API
- [ ] 測試 Token 驗證

### 步驟 3：更新前端（30 分鐘）
- [ ] 建立 `login.html`
- [ ] 更新 `js/api.js`
- [ ] 複製 `auth-helpers.js`

### 步驟 4：修改現有頁面（1 小時）
- [ ] 在所有頁面加入權限檢查
- [ ] 根據角色顯示/隱藏功能
- [ ] 測試不同角色的訪問

### 步驟 5：測試（30 分鐘）
- [ ] 測試訪客訪問
- [ ] 測試學員登入
- [ ] 測試教師登入（只能編輯自己的資料）
- [ ] 測試管理者登入（所有權限）

**總時程**：約 3-4 小時

---

## 八、安全建議（簡化版）

### 8.1 密碼安全
- ✅ 使用 SHA-256 雜湊儲存密碼
- ✅ 不要在前端顯示密碼
- ⚠️ 提醒：SHA-256 不是最安全的，但對於簡單系統已足夠

### 8.2 Token 安全
- ✅ 設定 24 小時過期時間
- ✅ 登出時刪除 Session
- ✅ 使用 HTTPS (GitHub Pages 自動提供)

### 8.3 權限控制
- ✅ 後端必須檢查權限（不能只在前端檢查）
- ✅ 根據角色過濾資料
- ✅ 教師只能編輯自己的資料

---

## 九、常見問題

### Q1: 如何新增用戶？
在 Google Sheets 的 `users` 表手動新增一行，或讓管理者在系統中新增。

### Q2: 如何重設密碼？
管理者可以在 `users` 表更新密碼雜湊值。

### Q3: Token 過期怎麼辦？
用戶需要重新登入。可以加入「記住我」功能延長過期時間。

### Q4: 如何讓教師帳號連結到教師資料？
在 `users` 表的 `teacher_id` 欄位填入對應的教師 ID（來自 `teachers` 表的 `id`）。

---

## 十、與完整版的差異

| 功能 | 簡化版 (本方案) | 完整版 (Azure AD + MySQL) |
|------|----------------|---------------------------|
| **認證方式** | Google Sheets 儲存帳密 | Azure AD SSO |
| **資料庫** | Google Sheets | MySQL |
| **部署** | 無需伺服器 | 需要 Docker + 伺服器 |
| **成本** | 免費 | 伺服器成本 |
| **設定複雜度** | 低（3-4 小時） | 高（2-3 週） |
| **適用規模** | 小型（< 1000 用戶） | 大型（任意規模） |
| **安全性** | 基本 | 企業級 |
| **單一登入** | 無 | 有（Azure AD） |
| **角色自動分配** | 手動 | 自動（根據部門） |

---

## 相關文件

- [前端範例](examples/auth-helpers.js) - 前端權限控制函數庫
- [教師卡片範例](examples/teacher-card-example.html) - UI 差異化示範
- [登入頁面範例](examples/login-page-example.html) - 登入介面範例

---

**總結**：這個簡化版方案保持您現有的 Google Apps Script 架構，無需 Docker 或 Azure AD，3-4 小時就能完成基本的 RBAC 功能！
