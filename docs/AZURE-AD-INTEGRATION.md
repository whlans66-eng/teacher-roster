# Azure AD 整合規劃 - RBAC 擴充方案

## 概述

本文檔說明如何將 Azure AD（Microsoft Entra ID）單一登入（SSO）整合到教師花名冊系統的 RBAC 架構中。

### 核心需求
- ✅ 使用公司 Azure AD 帳號登入（Outlook 帳號）
- ✅ 自動同步用戶資訊（姓名、Email、部門）
- ✅ 訪客可以匿名訪問公開資訊或使用訪客帳號
- ✅ 內部員工自動分配角色（學員、教師、管理者）

---

## 一、架構設計

### 1.1 認證流程

```
用戶訪問系統
    ↓
判斷：是否為公司員工？
    ↓                    ↓
  是（員工）          否（訪客）
    ↓                    ↓
導向 Azure AD      允許匿名訪問
    ↓                 或訪客登入
OAuth 2.0 認證
    ↓
取得用戶資訊
    ↓
查詢/建立用戶記錄
    ↓
分配角色
    ↓
產生 JWT Token
    ↓
進入系統
```

### 1.2 用戶類型

| 類型 | 認證方式 | 角色分配 | 範例 |
|------|---------|---------|------|
| **公司員工** | Azure AD SSO | 根據部門/職位自動分配 | 教師、課務組 |
| **外部講師** | Azure AD 訪客帳號 | 手動分配為教師 | 外聘講師 |
| **學員** | Azure AD SSO | 自動分配為學員 | 修課學生 |
| **訪客** | 匿名訪問 | visitor 角色 | 未登入用戶 |

---

## 二、Azure AD 設定步驟

### 2.1 在 Azure Portal 註冊應用程式

1. **登入 Azure Portal**
   - https://portal.azure.com

2. **註冊應用程式**
   - 前往「Microsoft Entra ID」→「應用程式註冊」
   - 點擊「新增註冊」
   - 填寫資訊：
     - 名稱：`Teacher Roster System`
     - 支援的帳戶類型：`僅此組織目錄中的帳戶`
     - 重新導向 URI：
       - Web：`https://your-domain.com/auth/callback`
       - （開發環境）`http://localhost:3000/auth/callback`

3. **設定 API 權限**
   - Microsoft Graph API 權限：
     - `User.Read`（讀取用戶基本資料）
     - `User.ReadBasic.All`（讀取所有用戶基本資料）
     - `email`（讀取 email）
     - `profile`（讀取個人資料）
     - `openid`（OpenID Connect）
   - 點擊「授予管理員同意」

4. **建立用戶端密碼**
   - 「憑證及秘密」→「新增用戶端密碼」
   - 記下密碼值（只會顯示一次）

5. **記錄重要資訊**
   ```
   應用程式 (用戶端) ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   目錄 (租用戶) ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   用戶端密碼: xxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### 2.2 設定用戶角色映射規則

在 Azure AD 中設定群組或屬性，用於角色分配：

**選項 A：使用 Azure AD 群組**
```
群組名稱              → 系統角色
---------------------------------
TR-Admin             → admin
TR-Teacher           → teacher
TR-Student           → student
（未加入任何群組）     → visitor
```

**選項 B：使用部門屬性**
```
部門 (Department)     → 系統角色
---------------------------------
課務組                → admin
教務處                → admin
教師                  → teacher
學員                  → student
（其他）              → visitor
```

---

## 三、後端實作（Node.js + Express）

### 3.1 安裝依賴套件

```bash
npm install passport passport-azure-ad jsonwebtoken
```

### 3.2 設定 Azure AD 策略

**`backend/src/config/azure-ad.ts`**

```typescript
import { BearerStrategy } from 'passport-azure-ad';

// Azure AD 設定
export const azureAdConfig = {
  identityMetadata: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0/.well-known/openid-configuration`,
  clientID: process.env.AZURE_CLIENT_ID!,
  clientSecret: process.env.AZURE_CLIENT_SECRET!,
  redirectUrl: process.env.AZURE_REDIRECT_URL || 'http://localhost:3000/auth/callback',

  // OAuth 2.0 設定
  responseType: 'code id_token',
  responseMode: 'form_post',
  scope: ['openid', 'profile', 'email', 'User.Read'],

  // Token 驗證設定
  validateIssuer: true,
  issuer: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
  passReqToCallback: false,
  loggingLevel: 'info' as const
};

// Passport Bearer Strategy（用於驗證 API 請求）
export const bearerStrategy = new BearerStrategy(
  {
    identityMetadata: azureAdConfig.identityMetadata,
    clientID: azureAdConfig.clientID,
    validateIssuer: true,
    issuer: azureAdConfig.issuer,
    passReqToCallback: false,
    loggingLevel: 'warn' as const
  },
  (token: any, done: any) => {
    // Token 驗證成功，返回用戶資訊
    return done(null, token, token);
  }
);
```

**環境變數 `.env`**

```bash
# Azure AD 設定
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_REDIRECT_URL=http://localhost:3000/auth/callback

# JWT 設定
JWT_SECRET=your-jwt-secret-key
JWT_EXPIRES_IN=24h
```

### 3.3 實作認證路由

**`backend/src/routes/auth.ts`**

```typescript
import express from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { azureAdConfig } from '../config/azure-ad';
import { getUserByEmail, createUser, assignRoleByDepartment } from '../services/user.service';

const router = express.Router();

/**
 * Azure AD 登入
 * 導向 Microsoft 登入頁面
 */
router.get('/login/azure', (req, res) => {
  const authUrl = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/authorize?` +
    `client_id=${azureAdConfig.clientID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(azureAdConfig.redirectUrl)}` +
    `&response_mode=query` +
    `&scope=${encodeURIComponent(azureAdConfig.scope.join(' '))}` +
    `&state=${generateState()}`; // CSRF 保護

  res.redirect(authUrl);
});

/**
 * Azure AD 回調
 * 處理 OAuth 授權碼，取得 Access Token
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({ error: '缺少授權碼' });
    }

    // TODO: 驗證 state（CSRF 保護）

    // 1. 用授權碼換取 Access Token
    const tokenResponse = await axios.post(
      `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: azureAdConfig.clientID,
        client_secret: azureAdConfig.clientSecret!,
        code: code as string,
        redirect_uri: azureAdConfig.redirectUrl,
        grant_type: 'authorization_code',
        scope: azureAdConfig.scope.join(' ')
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const { access_token, id_token } = tokenResponse.data;

    // 2. 用 Access Token 取得用戶資訊
    const userInfoResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const azureUser = userInfoResponse.data;

    // 3. 取得用戶的部門資訊（用於角色分配）
    let department = null;
    try {
      const orgResponse = await axios.get('https://graph.microsoft.com/v1.0/me?$select=department,jobTitle', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      department = orgResponse.data.department;
    } catch (error) {
      console.warn('無法取得部門資訊:', error);
    }

    // 4. 查詢或建立用戶記錄
    let user = await getUserByEmail(azureUser.mail || azureUser.userPrincipalName);

    if (!user) {
      // 新用戶，建立記錄
      user = await createUser({
        email: azureUser.mail || azureUser.userPrincipalName,
        username: azureUser.userPrincipalName.split('@')[0],
        full_name: azureUser.displayName,
        azure_id: azureUser.id,
        department: department,
        is_active: true
      });

      // 根據部門自動分配角色
      await assignRoleByDepartment(user.id, department);
    }

    // 5. 取得用戶角色和權限
    const userWithRoles = await getUserWithRoles(user.id);

    // 6. 產生系統 JWT Token
    const systemToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: userWithRoles.role,
        permissions: userWithRoles.permissions
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // 7. 導向前端並帶上 Token
    res.redirect(`${process.env.FRONTEND_URL}/auth/success?token=${systemToken}`);

  } catch (error) {
    console.error('Azure AD 回調錯誤:', error);
    res.redirect(`${process.env.FRONTEND_URL}/auth/error?message=登入失敗`);
  }
});

/**
 * 訪客登入（匿名訪問）
 */
router.post('/login/guest', (req, res) => {
  // 產生訪客 Token
  const guestToken = jwt.sign(
    {
      userId: null,
      role: 'visitor',
      permissions: ['teacher.view_basic', 'course.view_basic']
    },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );

  res.json({
    ok: true,
    data: {
      user: {
        role: 'visitor',
        full_name: '訪客',
        permissions: ['teacher.view_basic', 'course.view_basic']
      },
      token: guestToken
    }
  });
});

/**
 * 登出
 */
router.post('/logout', (req, res) => {
  // Azure AD 登出 URL
  const logoutUrl = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/logout?` +
    `post_logout_redirect_uri=${encodeURIComponent(process.env.FRONTEND_URL!)}`;

  res.json({
    ok: true,
    logoutUrl: logoutUrl
  });
});

// 輔助函數
function generateState(): string {
  return Math.random().toString(36).substring(2, 15);
}

async function getUserWithRoles(userId: string) {
  // 查詢用戶的角色和權限（實際實作請參考您的資料庫結構）
  // 這裡簡化處理
  return {
    role: 'teacher', // 從資料庫查詢
    permissions: ['teacher.view', 'teacher.update_own'] // 從資料庫查詢
  };
}

export default router;
```

### 3.4 角色自動分配服務

**`backend/src/services/user.service.ts`**

```typescript
import { pool } from '../config/database';

/**
 * 根據部門自動分配角色
 */
export async function assignRoleByDepartment(userId: string, department: string | null) {
  const roleMapping: Record<string, string> = {
    '課務組': 'admin',
    '教務處': 'admin',
    '系統管理': 'admin',
    '教師': 'teacher',
    '講師': 'teacher',
    '學員': 'student',
    '學生': 'student'
  };

  // 預設角色
  let roleName = 'student';

  // 根據部門分配角色
  if (department) {
    for (const [deptKeyword, role] of Object.entries(roleMapping)) {
      if (department.includes(deptKeyword)) {
        roleName = role;
        break;
      }
    }
  }

  // 查詢角色 ID
  const [roles] = await pool.execute(
    'SELECT id FROM roles WHERE name = ?',
    [roleName]
  );

  if (Array.isArray(roles) && roles.length > 0) {
    const roleId = (roles[0] as any).id;

    // 分配角色
    await pool.execute(
      'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE role_id = role_id',
      [userId, roleId]
    );

    console.log(`用戶 ${userId} 已分配角色: ${roleName} (部門: ${department})`);
  }
}

/**
 * 根據 Email 查詢用戶
 */
export async function getUserByEmail(email: string) {
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE email = ? LIMIT 1',
    [email]
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * 建立新用戶
 */
export async function createUser(userData: {
  email: string;
  username: string;
  full_name: string;
  azure_id: string;
  department: string | null;
  is_active: boolean;
}) {
  const [result] = await pool.execute(
    `INSERT INTO users (email, username, full_name, azure_id, department, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      userData.email,
      userData.username,
      userData.full_name,
      userData.azure_id,
      userData.department,
      userData.is_active
    ]
  );

  return {
    id: (result as any).insertId,
    ...userData
  };
}
```

---

## 四、前端實作

### 4.1 登入頁面（支援 Azure AD 和訪客）

**`frontend/login.html`**

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>登入 - 教師花名冊系統</title>
  <style>
    /* ... 樣式省略，參考 login-page-example.html ... */

    .login-method {
      text-align: center;
      margin-bottom: 20px;
    }

    .btn-azure {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 14px;
      background: #0078d4;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
      margin-bottom: 15px;
    }

    .btn-azure:hover {
      background: #106ebe;
    }

    .divider {
      text-align: center;
      margin: 20px 0;
      position: relative;
    }

    .divider::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      width: 100%;
      height: 1px;
      background: #ddd;
    }

    .divider span {
      background: white;
      padding: 0 15px;
      position: relative;
      color: #999;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="login-header">
      <h1>🎓 教師花名冊系統</h1>
      <p>Teacher Roster Management System</p>
    </div>

    <div class="login-body">
      <!-- Azure AD 登入 -->
      <div class="login-method">
        <button class="btn-azure" onclick="loginWithAzure()">
          <svg width="20" height="20" viewBox="0 0 23 23" fill="none">
            <path d="M0 0h23v23H0z" fill="#f25022"/>
            <path d="M11.5 0H23v11.5H11.5z" fill="#7fba00"/>
            <path d="M0 11.5h11.5V23H0z" fill="#00a4ef"/>
            <path d="M11.5 11.5H23V23H11.5z" fill="#ffb900"/>
          </svg>
          使用公司帳號登入 (Microsoft)
        </button>
      </div>

      <div class="divider">
        <span>或</span>
      </div>

      <!-- 訪客登入 -->
      <div class="login-method">
        <button class="btn-guest" onclick="loginAsGuest()">
          👤 以訪客身分瀏覽
        </button>
      </div>

      <div class="login-hint">
        <p style="font-size: 13px; color: #666; text-align: center; margin-top: 20px;">
          💡 公司員工請使用 Outlook 帳號登入<br>
          訪客僅能查看公開資訊
        </p>
      </div>
    </div>
  </div>

  <script src="js/auth-helpers.js"></script>
  <script>
    // API 設定
    const API_BASE_URL = 'http://localhost:3001/api';

    /**
     * Azure AD 登入
     */
    function loginWithAzure() {
      // 導向後端的 Azure AD 登入端點
      window.location.href = API_BASE_URL + '/auth/login/azure';
    }

    /**
     * 訪客登入
     */
    async function loginAsGuest() {
      try {
        const response = await fetch(API_BASE_URL + '/auth/login/guest', {
          method: 'POST'
        });

        const result = await response.json();

        if (result.ok) {
          // 儲存訪客 Token
          setAuthState(result.data.user, result.data.token);

          // 導向首頁
          window.location.href = '/index.html';
        }
      } catch (error) {
        console.error('訪客登入錯誤:', error);
        alert('登入失敗，請稍後再試');
      }
    }

    // 檢查是否已登入
    if (restoreAuthState()) {
      const role = getCurrentRole();
      if (role !== 'visitor') {
        // 已登入，導向首頁
        window.location.href = '/index.html';
      }
    }
  </script>
</body>
</html>
```

### 4.2 Azure AD 回調處理頁面

**`frontend/auth/success.html`**

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>登入成功</title>
</head>
<body>
  <div style="text-align: center; padding: 50px;">
    <h2>登入成功，正在導向...</h2>
    <div class="loading-spinner"></div>
  </div>

  <script src="../js/auth-helpers.js"></script>
  <script>
    // 從 URL 取得 Token
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
      // 解析 JWT Token 取得用戶資訊（簡化版，實際應呼叫 API）
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));

        const user = {
          id: payload.userId,
          email: payload.email,
          role: payload.role,
          permissions: payload.permissions,
          full_name: payload.full_name || payload.email
        };

        // 儲存認證狀態
        setAuthState(user, token);

        // 根據角色導向
        const roleHomePage = {
          'admin': '/admin/teachers.html',
          'teacher': '/my-profile.html',
          'student': '/my-schedule.html'
        };

        const homePage = roleHomePage[user.role] || '/index.html';

        setTimeout(() => {
          window.location.href = homePage;
        }, 1000);

      } catch (error) {
        console.error('Token 解析錯誤:', error);
        window.location.href = '/login.html?error=invalid_token';
      }
    } else {
      window.location.href = '/login.html?error=missing_token';
    }
  </script>
</body>
</html>
```

---

## 五、資料庫結構調整

### 5.1 更新 users 表（加入 Azure AD 欄位）

```sql
ALTER TABLE users
ADD COLUMN azure_id VARCHAR(255) UNIQUE COMMENT 'Azure AD 用戶 ID',
ADD COLUMN department VARCHAR(100) COMMENT '部門',
ADD COLUMN job_title VARCHAR(100) COMMENT '職稱',
ADD COLUMN last_sync_at TIMESTAMP NULL COMMENT '最後同步時間';

-- 為 Azure ID 建立索引
CREATE INDEX idx_azure_id ON users(azure_id);
```

### 5.2 角色映射規則表（可選）

```sql
CREATE TABLE department_role_mapping (
  id INT AUTO_INCREMENT PRIMARY KEY,
  department_pattern VARCHAR(100) NOT NULL COMMENT '部門關鍵字',
  role_id INT NOT NULL COMMENT '對應的角色 ID',
  priority INT DEFAULT 0 COMMENT '優先級（數字越大優先級越高）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部門角色映射規則';

-- 插入預設映射規則
INSERT INTO department_role_mapping (department_pattern, role_id, priority) VALUES
('課務組', (SELECT id FROM roles WHERE name = 'admin'), 100),
('教務處', (SELECT id FROM roles WHERE name = 'admin'), 100),
('系統管理', (SELECT id FROM roles WHERE name = 'admin'), 100),
('教師', (SELECT id FROM roles WHERE name = 'teacher'), 50),
('講師', (SELECT id FROM roles WHERE name = 'teacher'), 50),
('學員', (SELECT id FROM roles WHERE name = 'student'), 10),
('學生', (SELECT id FROM roles WHERE name = 'student'), 10);
```

---

## 六、部署清單

### 6.1 Azure AD 設定

- [ ] 在 Azure Portal 註冊應用程式
- [ ] 設定 API 權限（User.Read, email, profile, openid）
- [ ] 建立用戶端密碼
- [ ] 設定重新導向 URI
- [ ] 授予管理員同意
- [ ] 建立 Azure AD 群組（可選）
- [ ] 設定群組成員

### 6.2 後端設定

- [ ] 安裝 Azure AD 相關套件
- [ ] 設定環境變數（Tenant ID, Client ID, Secret）
- [ ] 實作 Azure AD 認證路由
- [ ] 實作角色自動分配邏輯
- [ ] 更新資料庫結構（加入 azure_id 欄位）
- [ ] 測試 Azure AD 登入流程

### 6.3 前端設定

- [ ] 更新登入頁面（加入 Azure AD 登入按鈕）
- [ ] 建立 Azure AD 回調處理頁面
- [ ] 保留訪客登入選項
- [ ] 測試登入流程

### 6.4 測試

- [ ] 測試公司員工登入（Azure AD）
- [ ] 測試角色自動分配
- [ ] 測試訪客登入
- [ ] 測試權限控制
- [ ] 測試登出流程

---

## 七、訪客處理方案

### 方案 A：完全匿名訪問

訪客不需要登入，直接瀏覽公開資訊：

```javascript
// 前端檢查
if (!isAuthenticated()) {
  // 未登入，設定為訪客
  AuthState.role = 'visitor';
}
```

**優點**：使用門檻低
**缺點**：無法追蹤訪客行為

### 方案 B：簡易訪客登入

訪客點擊「訪客登入」取得短期 Token：

```javascript
// 後端產生 1 小時有效的訪客 Token
const guestToken = jwt.sign(
  { role: 'visitor' },
  JWT_SECRET,
  { expiresIn: '1h' }
);
```

**優點**：可追蹤訪客行為（IP、瀏覽記錄）
**缺點**：多一個登入步驟

### 方案 C：Azure AD 訪客帳號（推薦）

在 Azure AD 中建立訪客帳號：

1. Azure Portal → Microsoft Entra ID → 用戶 → 新增訪客用戶
2. 填寫訪客 Email
3. 系統自動分配 visitor 角色

**優點**：統一認證、可管理
**缺點**：需要 Email

---

## 八、常見問題

### Q1: 如何處理沒有 Outlook 帳號的外部講師？

**方案 1：Azure AD 訪客帳號**
```
1. 在 Azure AD 建立訪客用戶
2. 輸入外部講師的 Email
3. 講師會收到邀請郵件
4. 點擊連結後可使用自己的 Microsoft 帳號或其他方式登入
```

**方案 2：手動建立帳號**
```
1. 在系統中手動建立用戶記錄
2. 分配「教師」角色
3. 提供臨時密碼
4. 講師首次登入時修改密碼
```

### Q2: 如何同步 Azure AD 的用戶變更？

**方案 1：即時同步（推薦）**
```typescript
// 每次登入時同步用戶資訊
const azureUser = await getAzureUserInfo(accessToken);

await updateUser(user.id, {
  full_name: azureUser.displayName,
  department: azureUser.department,
  job_title: azureUser.jobTitle,
  last_sync_at: new Date()
});
```

**方案 2：定期同步**
```typescript
// 使用 Microsoft Graph API 定期同步所有用戶
// 可使用 node-cron 每天執行一次
```

### Q3: 如何處理角色變更？

當員工從「學員」升級為「教師」時：

**自動方式**：
1. 在 Azure AD 更新用戶的部門或群組
2. 下次登入時自動更新角色

**手動方式**：
1. 管理者在系統中手動修改角色
2. 角色變更立即生效

---

## 九、安全建議

### 9.1 Token 安全

```typescript
// ✅ 好的做法
- 使用 HTTPS
- JWT Secret 使用強密碼（至少 32 字元）
- 設定合理的過期時間（24小時）
- 實作 Token 刷新機制
- 登出時清除 Token

// ❌ 避免
- 不要在 URL 中傳遞 Token（除了回調頁面）
- 不要在 localStorage 儲存敏感資訊
```

### 9.2 Azure AD 安全

```typescript
// ✅ 好的做法
- 啟用條件式存取（Conditional Access）
- 啟用多重要素驗證（MFA）
- 定期審查 API 權限
- 使用最小權限原則

// ❌ 避免
- 不要要求過多的 API 權限
- 不要將 Client Secret 提交到版本控制
```

### 9.3 CORS 設定

```typescript
// 限制允許的來源
const corsOptions = {
  origin: [
    'https://your-domain.com',
    'http://localhost:3000' // 僅開發環境
  ],
  credentials: true
};

app.use(cors(corsOptions));
```

---

## 十、遷移步驟

### 從現有系統遷移到 Azure AD

**階段 1：準備（1 週）**
1. 設定 Azure AD 應用程式
2. 建立測試環境
3. 更新資料庫結構

**階段 2：開發（2-3 週）**
1. 實作 Azure AD 認證
2. 實作角色自動分配
3. 更新前端登入流程

**階段 3：測試（1 週）**
1. 內部測試
2. 邀請部分用戶測試
3. 修正問題

**階段 4：部署（1 週）**
1. 部署到生產環境
2. 通知所有用戶
3. 監控並解決問題

**階段 5：優化（持續）**
1. 收集用戶反饋
2. 優化登入流程
3. 調整角色映射規則

---

## 相關資源

- [Microsoft Entra ID 文檔](https://learn.microsoft.com/zh-tw/entra/identity/)
- [Microsoft Graph API](https://learn.microsoft.com/zh-tw/graph/)
- [passport-azure-ad](https://github.com/AzureAD/passport-azure-ad)
- [OAuth 2.0 授權碼流程](https://learn.microsoft.com/zh-tw/entra/identity-platform/v2-oauth2-auth-code-flow)

---

## 總結

整合 Azure AD 後的優勢：

✅ **單一登入（SSO）**：員工使用公司帳號登入，無需記憶額外密碼
✅ **自動同步**：用戶資訊自動同步，減少管理負擔
✅ **安全性高**：利用 Azure AD 的安全機制（MFA、條件式存取）
✅ **角色自動分配**：根據部門自動分配角色，減少手動設定
✅ **訪客支援**：保留訪客登入選項，方便外部人員訪問

整合 Azure AD 後，您的系統將更加安全、易用且易於管理！
