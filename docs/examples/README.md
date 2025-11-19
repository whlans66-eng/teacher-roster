# RBAC 權限控制範例與規劃

## 📚 文件說明

本目錄包含完整的 RBAC（角色基礎訪問控制）規劃文檔和可執行的範例程式碼，幫助您理解和實作不同角色看到不同畫面的功能。

## 🔔 重要：選擇適合您的方案

本專案提供兩種 RBAC 實作方案：

### 📦 方案 A：簡化版（推薦，快速上手）
**適合**：保持現有 GitHub Pages + Google Apps Script 架構
- ⏱️ 實施時間：3-4 小時
- 💰 成本：免費
- 🔧 複雜度：低
- 📖 文檔：[RBAC-GOOGLE-APPS-SCRIPT.md](../RBAC-GOOGLE-APPS-SCRIPT.md)

### 🏢 方案 B：企業版（完整功能）
**適合**：需要 Azure AD 單一登入和企業級功能
- ⏱️ 實施時間：2-3 週
- 💰 成本：伺服器成本
- 🔧 複雜度：高
- 📖 文檔：[企業版方案](../enterprise-solution/)

> 💡 **建議**：如果您不需要 Azure AD 和 Docker，請使用方案 A（簡化版）

---

## 📁 文件清單

### 1. 📄 規劃文檔
- **`RBAC-PLANNING.md`** - 完整的 RBAC 系統規劃文檔
  - 角色定義（訪客、學員、教師、管理者）
  - 功能權限對照表
  - 畫面差異化設計
  - 前端實現策略
  - 後端實現策略
  - 實施步驟建議

### 2. 💻 前端範例

#### `auth-helpers.js` - 權限控制輔助函數庫
核心功能模組，包含：
- ✅ 認證狀態管理（登入/登出/恢復狀態）
- ✅ 權限檢查函數（hasRole, hasPermission, canEdit 等）
- ✅ 角色等級比較
- ✅ UI 輔助函數（顯示/隱藏元素）
- ✅ 頁面訪問控制

**使用方式**：
```html
<!-- 在所有頁面引入 -->
<script src="auth-helpers.js"></script>

<script>
// 檢查頁面訪問權限
if (!checkPageAccess()) {
  return; // 已導向登入頁
}

// 檢查角色
if (hasRole('admin', 'teacher')) {
  // 顯示編輯按鈕
}

// 檢查是否可以編輯
if (canEdit({ type: 'teacher', userId: teacher.userId })) {
  // 顯示編輯功能
}
</script>
```

#### `teacher-card-example.html` - 教師卡片權限示範
互動式範例，展示不同角色看到的教師卡片差異：

| 角色 | 看到的內容 |
|------|----------|
| **訪客** | 姓名、照片、3 個標籤 |
| **學員** | 完整資料 + 聯絡資訊 + [查看詳情] 按鈕 |
| **教師** | 完整資料 + 自己的卡片有 [編輯] 按鈕 |
| **管理者** | 完整資料 + 所有卡片都有 [編輯] [刪除] 按鈕 |

**如何使用**：
1. 在瀏覽器中開啟 `teacher-card-example.html`
2. 使用上方的「角色切換器」切換不同角色
3. 觀察教師卡片的顯示差異

**關鍵技術**：
- 條件渲染（根據角色動態生成 HTML）
- 權限檢查函數應用
- 資料過濾（訪客只看到部分標籤）

#### `login-page-example.html` - 登入頁面範例
完整的登入介面，包含：
- ✅ 登入表單（用戶名/密碼）
- ✅ 角色選擇器（示範用）
- ✅ 測試帳號快速填入
- ✅ 錯誤訊息顯示
- ✅ 載入狀態動畫
- ✅ 登入成功後根據角色導向不同頁面

**測試帳號**：
```
學員：student001 / password123
教師：teacher001 / password123
管理者：admin / admin123
```

**登入流程**：
1. 用戶輸入帳號密碼
2. 呼叫登入 API
3. 驗證成功後，儲存 Token 和用戶資訊到 localStorage
4. 根據角色導向對應的首頁：
   - 學員 → 我的課表
   - 教師 → 我的資料
   - 管理者 → 教師管理

### 3. 🔧 後端範例

#### `backend-rbac-example.gs` - Google Apps Script RBAC 實作
完整的後端權限控制範例，包含：

**認證功能**：
- ✅ 登入/登出
- ✅ Token 產生和驗證
- ✅ Session 管理

**權限檢查**：
- ✅ `hasPermission()` - 檢查是否有特定權限
- ✅ `requirePermission()` - 要求特定權限（沒有則拋出錯誤）
- ✅ `requireRole()` - 要求特定角色
- ✅ `hasRoleLevel()` - 檢查角色等級

**資料過濾**：
- ✅ 根據角色返回不同的資料
- ✅ 訪客只能看基本資訊（email 模糊化、標籤限制）
- ✅ 教師只能查詢/編輯自己的資料

**API 端點範例**：
```javascript
// GET /?action=login&username=xxx&password=xxx
// 登入並取得 Token

// GET /?action=list&table=teachers&token=xxx
// 根據角色返回過濾後的教師列表

// POST /?action=save&table=teachers&data=[...]&token=xxx
// 儲存資料（教師只能編輯自己的資料）
```

---

## 🚀 快速開始

### 方案 A：查看前端示範（無需設定）

1. 直接在瀏覽器中開啟範例文件：
   ```bash
   # 開啟教師卡片示範
   open teacher-card-example.html

   # 開啟登入頁面示範
   open login-page-example.html
   ```

2. 範例會使用模擬資料，無需連接後端 API

### 方案 B：整合到現有專案

#### 步驟 1：前端整合

1. **複製權限控制函數庫**：
   ```bash
   cp auth-helpers.js ../../../frontend/js/
   ```

2. **在所有 HTML 頁面引入**：
   ```html
   <script src="js/auth-helpers.js"></script>
   ```

3. **在每個頁面開始時檢查權限**：
   ```html
   <script>
   document.addEventListener('DOMContentLoaded', function() {
     // 檢查頁面訪問權限
     if (!checkPageAccess()) {
       return; // 已導向登入頁
     }

     // 繼續頁面初始化...
   });
   </script>
   ```

4. **使用權限檢查函數控制 UI**：
   ```javascript
   // 範例：教師列表頁面
   function renderTeacherCard(teacher) {
     const html = `
       <div class="teacher-card">
         <h3>${teacher.name}</h3>

         ${canViewDetails('teacher') ? `
           <button onclick="viewDetails()">查看詳情</button>
         ` : ''}

         ${canEdit({ type: 'teacher', userId: teacher.userId }) ? `
           <button onclick="edit()">編輯</button>
         ` : ''}

         ${canDelete('teacher') ? `
           <button onclick="deleteTeacher()">刪除</button>
         ` : ''}
       </div>
     `;
     return html;
   }
   ```

#### 步驟 2：後端整合（Google Apps Script）

1. **在 Google Sheets 新增表格**：
   - `users`（用戶表）
   - `sessions`（會話表）

   **users 表結構**：
   ```
   id | username | email | password_hash | full_name | role | is_active | created_at
   ```

   **sessions 表結構**：
   ```
   session_id | user_id | token | expires_at | created_at
   ```

2. **複製後端範例程式碼**：
   ```bash
   # 開啟 Google Apps Script 編輯器
   # 複製 backend-rbac-example.gs 的內容
   # 貼上到您的 Google Apps Script 專案
   ```

3. **修改設定**：
   ```javascript
   // 替換為您的 Google Sheets ID
   const SHEET_ID = 'YOUR_SHEET_ID';
   ```

4. **部署為 Web App**：
   - 點擊「部署」→「新部署」
   - 選擇「網頁應用程式」
   - 執行身分：我
   - 存取權：任何人
   - 複製 Web App URL

5. **更新前端 API 設定**：
   ```javascript
   // 在 frontend/js/config.js
   const API_BASE_URL = 'YOUR_WEB_APP_URL';
   ```

---

## 📊 角色與權限總覽

### 角色定義

| 角色 | 等級 | 說明 | 典型用戶 |
|------|------|------|---------|
| **訪客** (visitor) | 0 | 只能查看公開資訊 | 未登入用戶、外部訪客 |
| **學員** (student) | 1 | 可查看課程、填寫問卷 | 修課學生 |
| **教師** (teacher) | 2 | 可管理自己的資料和課程 | 授課教師 |
| **管理者** (admin) | 3 | 完整系統權限 | 系統管理員、課務組 |

### 權限矩陣（簡化版）

| 功能 | 訪客 | 學員 | 教師 | 管理者 |
|------|:----:|:----:|:----:|:------:|
| 瀏覽教師列表 | ✅ (基本) | ✅ | ✅ | ✅ |
| 查看教師詳細資料 | ❌ | ✅ | ✅ | ✅ |
| 編輯教師資料 | ❌ | ❌ | ✅ (僅自己) | ✅ |
| 刪除教師 | ❌ | ❌ | ❌ | ✅ |
| 查看課表 | ❌ | ✅ | ✅ (僅自己) | ✅ |
| 建立派課 | ❌ | ❌ | ❌ | ✅ |
| 填寫問卷 | ✅ | ✅ | ✅ | ✅ |
| 查看問卷結果 | ❌ | ❌ | ✅ (僅自己) | ✅ |
| 用戶管理 | ❌ | ❌ | ❌ | ✅ |

完整權限列表請參考 [RBAC-PLANNING.md](RBAC-PLANNING.md)

---

## 🎯 核心概念

### 1. 前端權限控制

**原理**：根據當前用戶角色，動態控制 UI 元素的顯示和功能

**實現方式**：
- 條件渲染（JavaScript template literals）
- CSS 類切換（show/hide）
- HTML data 屬性（`data-require-role`）

**範例**：
```javascript
// 方法 1：條件渲染
${hasRole('admin') ? `<button>刪除</button>` : ''}

// 方法 2：CSS 控制
showElementForRoles('.admin-panel', ['admin']);

// 方法 3：HTML 屬性
<button data-require-role="admin,teacher">編輯</button>
```

### 2. 後端權限控制

**原理**：驗證 Token → 取得角色 → 檢查權限 → 過濾資料

**流程**：
```
請求 → verifyToken() → 取得角色 → requirePermission() → 處理資料
```

**關鍵函數**：
```javascript
// 驗證 Token 並取得用戶資訊
const authInfo = verifyToken(token);

// 檢查權限
requirePermission(authInfo, 'teacher.edit');

// 根據角色過濾資料
if (authInfo.role === 'visitor') {
  // 返回簡化版資料
} else {
  // 返回完整資料
}
```

### 3. 資料過濾

**訪客看到的教師資料**：
```javascript
{
  id: "1",
  name: "王大明",
  photoUrl: "...",
  tags: ["船舶操縱", "GMDSS", "海事英文"]  // 只顯示 3 個
}
```

**學員看到的教師資料**：
```javascript
{
  id: "1",
  name: "王大明",
  email: "wang@example.com",
  teacherType: "專任",
  photoUrl: "...",
  experiences: [...],
  certificates: [...],
  tags: [...]  // 所有標籤
}
```

**管理者看到的教師資料**：
```javascript
{
  // 所有欄位，包含：
  id, name, email, phone,
  teacherType, workLocation,
  photoUrl, experiences,
  certificates, subjects, tags,
  created_by, updated_by, version
}
```

---

## 🔒 安全建議

### 前端安全

1. **不要只依賴前端權限控制**
   - ❌ 錯誤：只在前端隱藏按鈕
   - ✅ 正確：前端隱藏 + 後端驗證

2. **敏感資訊不要傳到前端**
   - ❌ 錯誤：傳完整資料到前端再用 CSS 隱藏
   - ✅ 正確：後端過濾後只傳需要的資料

3. **Token 安全儲存**
   - ✅ 使用 localStorage 或 sessionStorage
   - ✅ 設定過期時間
   - ❌ 不要儲存在 Cookie（除非使用 HttpOnly）

### 後端安全

1. **密碼加密**
   ```javascript
   // ❌ 錯誤：明文儲存
   password: "123456"

   // ✅ 正確：使用 bcrypt 加密
   password_hash: "$2a$10$..."
   ```

2. **Token 驗證**
   ```javascript
   // 每次請求都要驗證
   const authInfo = verifyToken(token);

   // 檢查過期
   if (expiresAt < new Date()) {
     throw new Error('Token 已過期');
   }
   ```

3. **防止權限提升**
   ```javascript
   // ❌ 錯誤：允許用戶自己設定角色
   user.role = params.role;

   // ✅ 正確：只有管理者可以修改角色
   if (authInfo.role !== 'admin') {
     throw new Error('權限不足');
   }
   ```

---

## 📝 實施檢查清單

### 前端實施

- [ ] 複製 `auth-helpers.js` 到專案
- [ ] 在所有頁面引入 `auth-helpers.js`
- [ ] 建立登入頁面
- [ ] 實作登入/登出功能
- [ ] 在每個頁面加入 `checkPageAccess()`
- [ ] 修改導航選單（根據角色顯示不同項目）
- [ ] 修改教師卡片（根據角色顯示不同內容）
- [ ] 修改教師詳情頁（根據角色控制編輯按鈕）
- [ ] 修改課表頁面（教師只看到自己的課表）
- [ ] 修改問卷頁面（教師只看到自己的問卷結果）
- [ ] 測試各角色的 UI 差異

### 後端實施

- [ ] 在 Google Sheets 建立 `users` 和 `sessions` 表
- [ ] 建立初始管理員帳號
- [ ] 複製 `backend-rbac-example.gs` 程式碼
- [ ] 修改 `SHEET_ID` 設定
- [ ] 部署為 Web App
- [ ] 測試登入 API
- [ ] 測試 Token 驗證
- [ ] 在所有 API 端點加入權限檢查
- [ ] 實作資料過濾邏輯
- [ ] 測試各角色的 API 訪問權限

### 測試

- [ ] 測試訪客訪問各頁面（應導向登入頁）
- [ ] 測試學員登入後看到的內容
- [ ] 測試教師登入後只能編輯自己的資料
- [ ] 測試教師只能看到自己的課表/問卷
- [ ] 測試管理者的所有權限
- [ ] 測試 Token 過期處理
- [ ] 測試錯誤處理（無效 Token、權限不足等）

---

## 🆘 常見問題

### Q1: 如何新增一個新角色？

1. **更新角色定義**（`backend-rbac-example.gs`）：
   ```javascript
   const ROLE_PERMISSIONS = {
     // ...現有角色
     course_manager: {  // 新角色：課程管理員
       level: 2.5,
       permissions: [
         'course.view',
         'course.create',
         'course.update',
         'course.delete'
       ]
     }
   };
   ```

2. **更新角色等級**（`auth-helpers.js`）：
   ```javascript
   const ROLE_LEVELS = {
     'visitor': 0,
     'student': 1,
     'teacher': 2,
     'course_manager': 2.5,  // 新增
     'admin': 3
   };
   ```

3. **更新 UI**（導航選單、登入頁等）

### Q2: 如何為現有表格添加權限控制？

1. **定義權限**：
   ```javascript
   'mytable.view',      // 查看
   'mytable.view_all',  // 查看所有
   'mytable.view_own',  // 查看自己的
   'mytable.create',    // 建立
   'mytable.update',    // 更新
   'mytable.update_own',// 更新自己的
   'mytable.delete'     // 刪除
   ```

2. **在 API 端點加入檢查**：
   ```javascript
   case 'mytable':
     requirePermission(authInfo, 'mytable.view_all', 'mytable.view');
     // 處理資料...
   ```

3. **實作資料過濾**（如果需要）

### Q3: 前端和後端的權限檢查有什麼區別？

| 層面 | 前端權限檢查 | 後端權限檢查 |
|------|-------------|-------------|
| **目的** | 提升用戶體驗 | 確保安全性 |
| **實現** | JavaScript 條件判斷 | API Token 驗證 |
| **可靠性** | 可被繞過（用戶可以修改 JS） | 可靠的安全屏障 |
| **必要性** | 可選（但強烈建議） | **必須** |

**重要**：永遠不要只依賴前端權限控制！

### Q4: 如何測試 RBAC 系統？

使用範例中的測試帳號：

```javascript
// 測試腳本範例
async function testRBAC() {
  // 1. 測試訪客
  console.log('測試訪客權限...');
  clearAuthState();
  // 嘗試訪問受保護的頁面 → 應導向登入頁

  // 2. 測試學員
  console.log('測試學員權限...');
  await login('student001', 'password123');
  // 檢查能看到的內容...

  // 3. 測試教師
  console.log('測試教師權限...');
  await login('teacher001', 'password123');
  // 檢查只能編輯自己的資料...

  // 4. 測試管理者
  console.log('測試管理者權限...');
  await login('admin', 'admin123');
  // 檢查能執行所有操作...
}
```

---

## 📖 延伸閱讀

- [RBAC-PLANNING.md](../RBAC-PLANNING.md) - 完整規劃文檔
- [API.md](../API.md) - API 文件
- [README.md](../../../README.md) - 專案總覽

---

## 💡 下一步

1. **立即體驗**：開啟 `teacher-card-example.html` 和 `login-page-example.html` 查看示範

2. **閱讀規劃**：仔細閱讀 `RBAC-PLANNING.md` 了解完整架構

3. **選擇方案**：
   - 快速上線 → 使用 Google Apps Script 方案
   - 長期發展 → 遷移到 Node.js + MySQL

4. **開始實施**：按照上方的檢查清單逐步實作

---

## 🙋 需要協助？

如有任何問題，請參考：
- 完整規劃文檔：`RBAC-PLANNING.md`
- 範例程式碼：本目錄中的所有文件
- 專案文檔：`/docs/` 目錄

祝您實作順利！🎉
