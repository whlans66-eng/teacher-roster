# 架構遷移指南：靜態 HTML → React + Vite

> 本文件是這次架構重建的唯一依據。動手改任何 `src/` 底下的檔案前請先讀完「架構規則」一節。

---

## 一、為什麼要改

| 項目 | 舊架構 | 問題 |
|---|---|---|
| 頁面 | 8 個 HTML，最大的 `teacher-management.html` 243KB | 標記、樣式、邏輯全部內嵌在同一個檔案，無法複用、無法測試 |
| API | `js/api.js` 56KB，`class TeacherRosterAPI` 掛在 `window` | 資料存取、同步、編輯鎖、AI 對話四種責任混在一起 |
| 狀態 | 各頁自己讀 `sessionStorage`、自己判斷登入 | 判斷邏輯八份、且結果不一致 |
| 樣式 | `shared/ui.css` 已有完整 design token | 只涵蓋按鈕層，版型與卡片各頁自己寫 |

目標架構完全比照 `src_1.zip` 那份參考實作的分層方式。

---

## 二、新舊檔案對應

### 共用層（已完成）

| 舊檔 | 新檔 | 用途 |
|---|---|---|
| `js/azureConfig.js`（空白模板）+ `js/api.js:7` `API_CONFIG` | `src/config.js` | API 位址、MSAL 設定、逾時、上傳限制 |
| `js/api.js:231-364`（`_get`/`_post`）、`:188-227`（上傳） | `src/services/apiClient.js` | 唯一的 fetch 包裝：逾時、token、錯誤正規化、multipart |
| —（新增） | `src/services/apiErrors.js` | `ApiError` / `AuthError` / 全域身分失效通報 |
| —（新增，暫時性） | `src/services/gasAdapter.js` | REST 路徑 → GAS `action` 參數的轉接層 |
| `js/auth.js` + `js/msalAuth.js` + `js/api.js:18-27,:372-381` | `src/services/authService.js` + `src/state/AuthContext.jsx` | 登入、token、登出、權限狀態 |
| `js/api.js:423`（`loadArrayFromStorage`）+ 各頁散落的 localStorage | `src/services/localStore.js` | 本機模式資料表存取 |
| `js/security.js:9-46` + 各頁重複的格式化函式 | `src/utils/format.js` | 跳脫、URL 安全、日期、數字 |
| 八個 HTML 各自的導覽列與登入擋頁 | `src/components/AppShell.jsx` | 版型外框、導覽、五種守衛狀態 |
| 57 個 `alert()`、30 個 `confirm()`、1 個 `prompt()` | `src/state/ToastContext.jsx` | 全域訊息與確認對話框 |
| `shared/ui.css` | `src/assets/css/app.css` | 設計系統（原封不動搬入） |

### 領域層（依業務拆分）

| 舊檔位置 | 新檔 |
|---|---|
| `js/api.js:456-732`（`DataSyncManager`） | `src/services/syncApi.js` + `src/state/DataContext.jsx` |
| `js/api.js:392`（`normalizeTeacherRecord`）+ 教師相關方法 | `src/services/teachersApi.js` |
| `backend/permissionsApi.js` 的前端對應 | `src/services/permissionsApi.js` |
| `js/api.js:402` + `integrated-features.js` | `src/services/assignmentsApi.js`（Phase 3） |
| `maritime-courses.html` 的課程 CRUD | `src/services/coursesApi.js`（Phase 4） |
| `js/api.js:1196-1813`（`AIChatManager`） | `src/services/aiApi.js` + `src/state/AiChatContext.jsx`（Phase 5） |

### 刻意刪除

| 舊檔 | 原因 |
|---|---|
| `js/api.js:741-963`（`SessionManager`）、`:969-1125`（`EditLockManager`） | 在線人數心跳與編輯鎖依賴「長駐的全域腳本頁面」，React 路由切換後語意不成立。並行控制改由後端樂觀鎖負責。 |
| `teacher-management.html` 內三份重複的月曆／派課／海事課程檢視 | 已被 `#calendar` / `#courses` / `#maritime` 以外的主 Tab 取代，內容與 `course-management.html` 重複。**注意：這三個 hash 仍可由書籤直接開啟**，切換時需加 hash 轉址。 |
| `js/api.js:214`（`uploadDataUrl`） | 無任何呼叫端，且 base64 會讓 payload 膨脹約 33%。改用 multipart。 |

---

## 三、架構規則

違反這五條就是在重蹈舊架構的覆轍。

1. **頁面與元件永遠不准直接 `fetch()`**。一律經過 `services/`，由 `services/` 呼叫 `callApi()`。
2. **只有 `apiClient.js` 知道傳輸細節**。逾時、驗證標頭、錯誤信封都收在那裡，所以換後端時上層一行都不用動。
3. **丟出 Error 一律代表「壞掉了」**。儲存衝突、AI 限流這類正常業務結果用**回傳值**表達，不丟錯。
4. **設計 token 的唯一真實來源是 `src/assets/css/app.css`**。`tailwind.config.js` 的色票是指向那裡的 CSS 變數，永遠不會脫鉤。
   - 禁止寫 `bg-slate-800`、`text-gray-700`、`rounded-lg` 這類原始調色盤 utility——那是參考專案的配色，不是本專案的。
   - Tailwind 只用來排版（flex / grid / gap / 間距 / 尺寸）。
5. **`.btn` / `.tag` / `.input` 的 class 字串只能出現在 `src/components/ui/`**。其他地方一律用 `<Button>` / `<Tag>` / `<Input>`。

### 圖示：留在 Phosphor，不改用 lucide-react

參考實作用的是 `lucide-react`，本專案**刻意不跟進**。原因是 `app.css` 的圖示尺寸規範寫成後代選擇器（`.btn i`、`.btn .ph` 等），而 lucide 渲染出來的是 `<svg class="lucide">`，一條都對不上——換過去不會報錯，只會讓全站 400 多處圖示靜靜地變成 lucide 的 24px 預設值。加上 `ph-file-pdf`、`ph-chalkboard-teacher` 等約十個圖示在 lucide 沒有合適對應。

Phosphor 改從 npm 載入（不再用 CDN），內網不需要連外。

### 字體

舊版八個頁面共有四種不同的 font stack，且 Inter 來自 Google Fonts CDN——內網很可能擋掉。已統一收斂為一組系統字體堆疊（`--ui-font-sans`），不依賴任何外部請求。若確定要用 Inter，請把 woff2 放進 `src/assets/` 自行托管。

---

## 四、雙後端切換

這是整個遷移最關鍵的機制。

```
config.js  backend: 'gas'  ←─ 現在
                    'rest' ←─ 內網上線後
```

| | `gas`（現在） | `rest`（內網） |
|---|---|---|
| 後端 | Google Apps Script（`backend-api.gs`） | Azure Functions（`backend/`，**程式碼已在本 repo**） |
| 資料庫 | Google Sheets | SQL Server（`backend/sys_database.js`） |
| 登入 | 帳號密碼 → 後端在 CacheService 種 `sess_<token>` | Microsoft Entra ID → JWT |
| token 傳遞 | query param `?token=` | `Authorization: Bearer` |
| token 驗證 | 查 cache（`backend-api.gs:90-102`） | JWKS 公鑰驗簽（`backend/sys_tokenValidator.js`） |
| 權限來源 | 登入回傳的 role（`admin` / `teacher`） | `GET /permissions/check` |

> ⚠️ **兩者不能混用**。GAS 裡沒有任何一行 JWT／JWKS 的程式碼，把 Entra 的 token 丟給它必定失敗。所以 `authService` 依 `authMode` 分流，`AuthContext` 以上完全無感。

### 內網切換檢查清單

- [ ] `config.js` 的 `backend` 改成 `'rest'`
- [ ] 填 `rest.apiBaseUrl`（Azure Functions 的 `/api` 位址）
- [ ] 填 `msal` 四個值：`clientId`、`authority`、`redirectUri`、`scopes`
      （`redirectUri` 必須與 Azure App Registration 登記的**完全一致**，含結尾斜線與子目錄，否則登入會被拒）
- [ ] 後端補上教師／課程／排程的端點（目前 `backend/` 只有 `ping` 與 `permissions/*`）
- [ ] 資料從 Google Sheets 遷移到 SQL Server
- [ ] 刪掉 `src/services/gasAdapter.js` 與 `config.js` 的 `gas` 區塊
- [ ] `app.html` 改名為 `index.html`，舊版 HTML 頁面下架

---

## 五、部署

開發期間 React 版入口刻意命名為 **`app.html`** 而非 `index.html`，因為舊版 `index.html` 仍是線上首頁，遷移期間兩者必須並存。

```bash
npm install
npm run dev      # http://localhost:5173/app.html（本機模式，不需登入，資料走 localStorage）
npm run build    # 產出 dist/
npm run preview
```

`vite.config.js` 設定 `base: './'`，因此可以部署在內網的任意子目錄（例如 `https://intranet/maritrain/`）而不需要改設定。

路由用 `HashRouter` 而非 `BrowserRouter`：內網若部署在子目錄且沒有 URL rewrite 規則，`BrowserRouter` 會在重新整理時 404。

---

## 六、分階段計畫

| 階段 | 內容 | 狀態 |
|---|---|---|
| **Phase 1** | 建置設定、共用層、UI 元件庫、`AppShell`、儀表板、教師列表與檢視、權限管理 | ✅ 本次完成 |
| **Phase 2** | 教師新增／編輯表單、統計、出勤管理、檔案上傳、衝突對話框 | 待辦 |
| **Phase 3** | 訓練排程 `/schedule`：月曆、工時分析、派課 CRUD、`utils/scheduling.js` | 待辦 |
| **Phase 4** | 海事課程 `/courses`：瀏覽、詳情、CRUD、統計、Excel/PDF/PPT 匯出 | 待辦 |
| **Phase 5** | AI 顧問 `/courses/ai` | 待辦 |
| **Phase 6** | 教材庫、船員入口，然後下架所有舊版 HTML 與 `js/` | 待辦 |

**Phase 1 刻意不包含教師編輯表單**。舊版那張表單根本沒有資料模型——DOM 就是模型，送出時再從 DOM 把值刮回來（`teacher-management.html:2489-2540`）。重新設計那個 draft 物件本身就是一整個階段的工作量，硬塞進 Phase 1 會淹掉地基。

---

## 七、待業務決定的問題

這些從程式碼裡看不出答案，需要人決定：

1. **內網還連得到 `script.google.com` 嗎？** 若內網擋外網，舊後端會直接不回應。
2. **內網網址是什麼**（含子目錄）？Entra 登入必須事先登記這個位址，否則每次登入都會被拒。
3. **出勤（`teacherLeaves`）紀錄從來沒有存進共用資料庫**——只存在各人自己的瀏覽器裡，清掉就沒了。要改成集中儲存嗎？
4. **智慧派課的評分排序功能**目前是關閉且隱藏的（畫面上的控制項被移除了）。要恢復還是正式移除？
5. **問卷功能沒有任何建立問卷的管理介面**，船員只會看到空清單。要做還是不做？
6. **`teacher` 角色在訓練排程頁有完整編輯權，在其他頁只能看**（`backend-api.gs:292`）。這是刻意的還是漏洞？
7. **船員入口與其專屬登入頁沒有任何地方連過去**。還在用嗎？
8. 🔴 **`backend-api.gs:1241` 的初始化程式碼種下預設帳號 `admin` / `admin123`，明碼寫在 public repo 裡。** 若線上系統沒改過密碼，請優先處理。

---

## 八、專案結構

```
teacher-roster/
├── app.html                    Vite 入口（切換後改名為 index.html）
├── vite.config.js              base:'./'，入口指向 app.html
├── tailwind.config.js          主題由 app.css 的 CSS 變數驅動
├── postcss.config.js           必須含 postcss-import，否則 app.css 會被 preflight 蓋掉
├── src/
│   ├── main.jsx                Provider 巢狀 + 路由
│   ├── config.js               唯一設定入口
│   ├── styles.css              tailwind base → app.css → components → utilities
│   ├── assets/css/app.css      設計系統（= shared/ui.css）
│   ├── services/               唯一能碰網路的一層
│   ├── state/                  全域狀態
│   ├── components/ui/          唯一能寫 .btn/.tag/.input 的地方
│   ├── pages/                  只組畫面
│   └── utils/                  純函式
│
├── backend/                    內網 Azure Functions（已存在，非本次範圍）
├── backend-api.gs              舊版 Google Apps Script（Phase 6 下架）
├── js/ *.html                  舊版前端（Phase 6 下架）
└── archived/                   歷史版本
```
