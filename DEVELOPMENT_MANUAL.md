# 📘 教師排課管理系統 - 細部開發手冊

> **版本**: v1.0.0 (Google 生態系統版本)
> **最後更新**: 2025-11-18
> **適用對象**: 前端開發者、Google Apps Script 開發者、系統管理員

---

## 📑 目錄

1. [專案概述](#1-專案概述)
2. [系統架構](#2-系統架構)
3. [開發環境設定](#3-開發環境設定)
4. [前端開發指南](#4-前端開發指南)
5. [Google Apps Script 後端開發](#5-google-apps-script-後端開發)
6. [Google Sheets 資料庫設計](#6-google-sheets-資料庫設計)
7. [API 開發規範](#7-api-開發規範)
8. [部署指南](#8-部署指南)
9. [常見問題排解](#9-常見問題排解)
10. [開發工作流程](#10-開發工作流程)
11. [未來升級計劃](#11-未來升級計劃)

---

## 1. 專案概述

### 1.1 系統簡介

教師排課管理系統（WHL MARITRAIN）是一個基於 Google 生態系統的現代化 Web 應用程式，用於管理教育機構的教師資訊、課程安排和派課調度。

**核心價值**：
- 完全基於 Google 雲端服務（零維運成本）
- 即時協作與資料同步
- 無需自建伺服器或資料庫
- 自動備份與版本控制

### 1.2 技術棧

| 層級 | 技術 | 說明 |
|------|------|------|
| **前端** | HTML5 + CSS3 + Vanilla JavaScript | 純前端實作，無需框架 |
| **API 層** | Google Apps Script (GAS) | 無伺服器後端 |
| **資料庫** | Google Sheets | 結構化資料儲存 |
| **檔案儲存** | Google Drive | 教師照片、文件上傳 |
| **託管** | GitHub Pages | 靜態網站託管 |
| **版本控制** | Git + GitHub | 程式碼版本管理 |

### 1.3 系統特色

- ✅ **零維運成本**：完全基於 Google 免費服務
- ✅ **即時同步**：多人協作，資料即時更新
- ✅ **自動備份**：Google Sheets 自動版本控制
- ✅ **易於維護**：無需管理伺服器或資料庫
- ✅ **快速部署**：修改即時生效
- ✅ **高可用性**：99.9% Google 服務可用性保證

---

## 2. 系統架構

### 2.1 架構圖

```
┌─────────────────────────────────────────────────────────────┐
│                 前端層 (GitHub Pages)                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  靜態網頁                                             │  │
│  │  - index.html (主頁面)                                │  │
│  │  - js/api.js (API 通訊層)                             │  │
│  │  - CSS (樣式)                                         │  │
│  │  URL: https://whlans66-eng.github.io/teacher-roster  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────┬───────────────────────────────────────────────┘
              │
              │ HTTPS REST API
              │ Token Authentication
              │
┌─────────────▼───────────────────────────────────────────────┐
│           API 層 (Google Apps Script)                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Web App Endpoint                                     │  │
│  │  - backend-api.gs                                     │  │
│  │  - doGet() / doPost() 處理器                          │  │
│  │  - Token 驗證                                         │  │
│  │  - 資料轉換與驗證                                     │  │
│  │  URL: script.google.com/macros/s/{SCRIPT_ID}/exec    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────┬───────────────────────────────────────────────┘
              │
              │ Google Sheets API
              │ SpreadsheetApp
              │
┌─────────────▼───────────────────────────────────────────────┐
│              資料層 (Google Sheets)                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Spreadsheet ID: 1CPhI67yZt1W6FLV9Q02gjyJsdTP79p...  │  │
│  │                                                       │  │
│  │  📊 資料表：                                          │  │
│  │  1. teachers (教師資料)                               │  │
│  │  2. courseAssignments (課程派課)                      │  │
│  │  3. maritimeCourses (航海課程)                        │  │
│  │  4. surveyTemplates (問卷範本)                        │  │
│  │  5. surveys (問卷)                                    │  │
│  │  6. surveyResponses (問卷回覆)                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Google Drive 資料夾                                  │  │
│  │  Folder ID: 1coJ2wsBu7I4qvM5eyViIu16POgEQL71n        │  │
│  │  - 教師照片                                           │  │
│  │  - 上傳文件                                           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 資料流程

#### 請求流程範例：取得教師列表

```
1. 用戶操作
   └─> 瀏覽器載入 index.html

2. 前端發起請求
   └─> api.js: api.list('teachers')
   └─> GET https://script.google.com/.../exec?action=list&table=teachers&token=tr_demo_12345

3. Google Apps Script 處理
   └─> backend-api.gs: doGet(e)
   └─> _checkToken() 驗證 Token
   └─> _readTable('teachers') 讀取資料
   └─> SpreadsheetApp.openById(SHEET_ID)
   └─> 讀取 'teachers' 工作表

4. Google Sheets 回傳資料
   └─> 轉換為 JSON 格式
   └─> 陣列欄位解析 (experiences, subjects)
   └─> 日期格式化

5. 回應前端
   └─> { ok: true, table: 'teachers', data: [...] }
   └─> 前端更新 UI
```

---

## 3. 開發環境設定

### 3.1 系統需求

#### 必要工具

```bash
# 基本工具
- Git >= 2.30
- 任一程式碼編輯器 (VS Code 推薦)
- 現代瀏覽器 (Chrome/Firefox/Edge)
- Google 帳號

# 可選工具
- Node.js >= 18 (用於本地測試伺服器)
- Python 3 (用於本地測試伺服器)
```

#### VS Code 推薦擴充套件

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ritwickdey.liveserver",
    "wix.vscode-import-cost"
  ]
}
```

### 3.2 專案初始化

#### 步驟 1: Clone 專案

```bash
# 使用 HTTPS
git clone https://github.com/whlans66-eng/teacher-roster.git
cd teacher-roster

# 或使用 SSH
git clone git@github.com:whlans66-eng/teacher-roster.git
cd teacher-roster
```

#### 步驟 2: 查看專案結構

```
teacher-roster/
├── index.html              # 主頁面
├── js/
│   └── api.js             # API 通訊層
├── backend-api.gs         # Google Apps Script 後端
├── database/              # 未來 MySQL 升級用
├── backend/               # 未來 Node.js 升級用
└── README.md              # 專案說明
```

#### 步驟 3: 本地測試

**方法 A: 使用 VS Code Live Server**

1. 安裝 Live Server 擴充套件
2. 右鍵點擊 `index.html` → "Open with Live Server"
3. 瀏覽器自動開啟 `http://localhost:5500`

**方法 B: 使用 Python**

```bash
# Python 3
python -m http.server 8000

# 開啟瀏覽器
# http://localhost:8000
```

**方法 C: 使用 Node.js**

```bash
# 安裝 http-server
npm install -g http-server

# 啟動伺服器
http-server -p 8000

# 開啟瀏覽器
# http://localhost:8000
```

### 3.3 驗證設定

開啟瀏覽器開發者工具 (F12)，檢查：

```javascript
// 在 Console 輸入
await api.ping()

// 預期回應
{
  ok: true,
  timestamp: "2025-11-18T10:30:00.000Z",
  server: "Google Apps Script"
}
```

---

## 4. 前端開發指南

### 4.1 前端技術

- **純 JavaScript**：無框架依賴
- **ES6+ 語法**：使用現代 JavaScript 特性
- **Fetch API**：AJAX 請求
- **LocalStorage**：客戶端資料快取

### 4.2 專案結構

```
index.html          # 主頁面
├── CSS (內嵌)      # 樣式定義
├── HTML            # 頁面結構
└── JavaScript      # 業務邏輯

js/api.js           # API 通訊層
├── API_CONFIG      # API 配置
├── TeacherRosterAPI # API 類別
└── Methods         # API 方法
```

### 4.3 API 使用範例

#### 基本配置

```javascript
// js/api.js
const API_CONFIG = {
  baseUrl: 'https://script.google.com/macros/s/AKfycbw.../exec',
  token: 'tr_demo_12345',
  timeout: 30000
};

const api = new TeacherRosterAPI(API_CONFIG);
```

#### 讀取資料

```javascript
// 讀取所有教師
const teachers = await api.list('teachers');
console.log(teachers);
// [{ id: '1', name: '王老師', email: 'wang@example.com', ... }]

// 讀取所有表格
const allData = await api.listAll();
console.log(allData);
// {
//   teachers: [...],
//   courseAssignments: [...],
//   maritimeCourses: [...]
// }
```

#### 儲存資料

```javascript
// 新增或更新教師
const teachers = [
  {
    id: '1',
    name: '王老師',
    email: 'wang@example.com',
    teacherType: '專任',
    workLocation: '台北',
    subjects: ['數學', '物理'],
    experiences: ['10年教學經驗'],
    certificates: ['教師證']
  }
];

await api.save('teachers', teachers);
```

#### 上傳檔案

```javascript
// 方法 1: 從 File Input
const fileInput = document.getElementById('photoInput');
const file = fileInput.files[0];
const result = await api.uploadFile(file);
console.log(result.url);
// https://drive.google.com/uc?export=view&id=...

// 方法 2: 從 Data URL
const dataUrl = 'data:image/png;base64,iVBORw0KG...';
const result = await api.uploadFileFromDataUrl(dataUrl, 'photo.png');
```

### 4.4 錯誤處理

```javascript
try {
  const teachers = await api.list('teachers');
  console.log('成功:', teachers);
} catch (error) {
  console.error('錯誤:', error.message);
  alert('讀取失敗：' + error.message);
}
```

### 4.5 前端開發最佳實踐

#### 1. 使用 async/await

```javascript
// ✅ 正確
async function loadTeachers() {
  try {
    const teachers = await api.list('teachers');
    displayTeachers(teachers);
  } catch (error) {
    showError(error);
  }
}

// ❌ 避免
function loadTeachers() {
  api.list('teachers').then(teachers => {
    displayTeachers(teachers);
  }).catch(error => {
    showError(error);
  });
}
```

#### 2. 快取資料

```javascript
// 使用 LocalStorage 快取
function cacheData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function getCachedData(key) {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : null;
}

// 使用範例
async function loadTeachers() {
  const cached = getCachedData('teachers');
  if (cached) {
    displayTeachers(cached);
  }

  const teachers = await api.list('teachers');
  cacheData('teachers', teachers);
  displayTeachers(teachers);
}
```

#### 3. 顯示載入狀態

```javascript
async function loadData() {
  showLoading(true);
  try {
    const data = await api.listAll();
    displayData(data);
  } catch (error) {
    showError(error);
  } finally {
    showLoading(false);
  }
}
```

---

## 5. Google Apps Script 後端開發

### 5.1 GAS 簡介

Google Apps Script 是基於 JavaScript 的雲端腳本平台，可以：
- 存取 Google Sheets、Drive、Gmail 等服務
- 部署為 Web App（REST API）
- 無需伺服器，自動擴展

### 5.2 後端檔案結構

```javascript
// backend-api.gs
const TOKEN = 'tr_demo_12345';                          // 安全令牌
const SHEET_ID = '1CPhI67yZt1W6FLV9Q02gjyJsdTP79p...';  // Sheets ID
const FOLDER_ID = '1coJ2wsBu7I4qvM5eyViIu16POgEQL71n';  // Drive 資料夾

const SHEETS_CONFIG = {                                 // 資料表配置
  teachers: {
    name: 'teachers',
    header: ['id','name','email','teacherType', ...]
  },
  // ... 其他表格
};

function doGet(e) { /* GET 請求處理 */ }
function doPost(e) { /* POST 請求處理 */ }
```

### 5.3 部署 Google Apps Script

#### 步驟 1: 建立新專案

1. 開啟 [Google Apps Script](https://script.google.com)
2. 點擊「新專案」
3. 命名為「教師排課系統 API」

#### 步驟 2: 貼上程式碼

1. 刪除預設的 `function myFunction() {}`
2. 複製 `backend-api.gs` 的內容
3. 貼上到編輯器

#### 步驟 3: 修改設定

```javascript
// 修改這三個設定值
const TOKEN = '你的安全令牌';              // 自訂安全令牌
const SHEET_ID = '你的 Google Sheets ID'; // 從 Sheets URL 取得
const FOLDER_ID = '你的 Google Drive 資料夾 ID'; // 從 Drive URL 取得
```

**如何取得 Sheets ID？**
```
Google Sheets URL:
https://docs.google.com/spreadsheets/d/1CPhI67yZt1W6FLV9Q02gjyJsdTP79pgUAc27ZZw3nJ4/edit

SHEET_ID 就是中間那串：
1CPhI67yZt1W6FLV9Q02gjyJsdTP79pgUAc27ZZw3nJ4
```

**如何取得 Folder ID？**
```
Google Drive 資料夾 URL:
https://drive.google.com/drive/folders/1coJ2wsBu7I4qvM5eyViIu16POgEQL71n

FOLDER_ID 就是最後那串：
1coJ2wsBu7I4qvM5eyViIu16POgEQL71n
```

#### 步驟 4: 部署為 Web App

1. 點擊「部署」→「新增部署」
2. 選擇類型：「網路應用程式」
3. 設定：
   - **執行身分**：我
   - **具有存取權的使用者**：任何人
4. 點擊「部署」
5. 複製「網路應用程式 URL」

#### 步驟 5: 更新前端配置

將剛才複製的 URL 貼到 `js/api.js`：

```javascript
const API_CONFIG = {
  baseUrl: '貼上你的 Web App URL',
  token: '與後端相同的 TOKEN',
  timeout: 30000
};
```

### 5.4 API 端點說明

#### GET /exec?action=ping

測試連線

**請求：**
```
GET https://script.google.com/.../exec?action=ping&token=tr_demo_12345
```

**回應：**
```json
{
  "ok": true,
  "timestamp": "2025-11-18T10:30:00.000Z",
  "server": "Google Apps Script"
}
```

#### GET /exec?action=list&table=teachers

讀取特定表格

**請求：**
```
GET https://script.google.com/.../exec?action=list&table=teachers&token=tr_demo_12345
```

**回應：**
```json
{
  "ok": true,
  "table": "teachers",
  "data": [
    {
      "id": "1",
      "name": "王老師",
      "email": "wang@example.com",
      "subjects": ["數學", "物理"]
    }
  ]
}
```

#### GET /exec?action=listall

讀取所有表格

**請求：**
```
GET https://script.google.com/.../exec?action=listall&token=tr_demo_12345
```

**回應：**
```json
{
  "ok": true,
  "data": {
    "teachers": [...],
    "courseAssignments": [...],
    "maritimeCourses": [...]
  }
}
```

#### POST /exec

儲存資料

**請求：**
```javascript
POST https://script.google.com/.../exec
Content-Type: application/json

{
  "action": "save",
  "table": "teachers",
  "token": "tr_demo_12345",
  "data": [...]
}
```

**回應：**
```json
{
  "ok": true,
  "table": "teachers",
  "count": 10
}
```

#### POST /exec (上傳檔案)

**請求：**
```javascript
POST https://script.google.com/.../exec
Content-Type: multipart/form-data

FormData:
  action: uploadfile
  token: tr_demo_12345
  file: [binary data]
```

**回應：**
```json
{
  "ok": true,
  "id": "1a2b3c4d5e6f...",
  "url": "https://drive.google.com/uc?export=view&id=1a2b3c4d5e6f...",
  "name": "photo.jpg",
  "size": 102400,
  "mime": "image/jpeg"
}
```

### 5.5 後端開發最佳實踐

#### 1. Token 驗證

```javascript
function _checkToken(tok) {
  if (TOKEN && String(tok).trim() !== TOKEN) {
    throw new Error('Invalid token');
  }
}

// 在每個請求開始時呼叫
function doGet(e) {
  _checkToken(e.parameter.token);
  // ...
}
```

#### 2. 錯誤處理

```javascript
function doGet(e) {
  try {
    // 處理請求
    return _json({ ok: true, data: ... });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}
```

#### 3. 資料驗證

```javascript
function _writeTable(tableName, dataArray) {
  // 驗證表格名稱
  const config = SHEETS_CONFIG[tableName];
  if (!config) {
    throw new Error('Unknown table: ' + tableName);
  }

  // 驗證資料格式
  if (!Array.isArray(dataArray)) {
    throw new Error('Data must be an array');
  }

  // 寫入資料
  // ...
}
```

#### 4. 效能優化

```javascript
// ✅ 一次讀取所有資料
const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

// ❌ 避免迴圈逐行讀取
for (let i = 2; i <= lastRow; i++) {
  const row = sheet.getRange(i, 1, 1, lastCol).getValues();
}
```

---

## 6. Google Sheets 資料庫設計

### 6.1 資料表結構

#### 表格 1: teachers (教師資料)

| 欄位 | 類型 | 說明 | 範例 |
|------|------|------|------|
| id | String | 教師 ID | "1", "2", "3" |
| name | String | 姓名 | "王老師" |
| email | String | Email | "wang@example.com" |
| teacherType | String | 教師類型 | "專任", "兼任", "外聘" |
| workLocation | String | 工作地點 | "台北校區" |
| photoUrl | String | 照片 URL | "https://drive.google.com/..." |
| experiences | JSON Array | 經歷 | ["10年教學經驗", "曾任..."] |
| certificates | JSON Array | 證照 | ["教師證", "專業證照"] |
| subjects | JSON Array | 授課科目 | ["數學", "物理"] |
| tags | JSON Array | 標籤 | ["優良教師", "資深"] |

#### 表格 2: courseAssignments (課程派課)

| 欄位 | 類型 | 說明 | 範例 |
|------|------|------|------|
| id | String | 派課 ID | "1" |
| teacherId | String | 教師 ID | "1" |
| name | String | 課程名稱 | "微積分(一)" |
| date | String | 日期 | "2025-11-18" |
| time | String | 時間 | "09:00-12:00" |
| type | String | 類型 | "正課", "補課" |
| status | String | 狀態 | "已確認", "待確認" |
| note | String | 備註 | "教室 A101" |

#### 表格 3: maritimeCourses (航海課程)

| 欄位 | 類型 | 說明 | 範例 |
|------|------|------|------|
| id | String | 課程 ID | "1" |
| name | String | 課程名稱 | "基本安全訓練" |
| category | String | 類別代碼 | "01" |
| method | String | 授課方式 | "實體", "線上", "混合" |
| description | String | 課程說明 | "STCW基本安全訓練..." |
| keywords | JSON Array | 關鍵字 | ["安全", "STCW"] |

#### 表格 4: surveyTemplates (問卷範本)

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | String | 範本 ID |
| name | String | 範本名稱 |
| description | String | 說明 |
| questions | JSON Array | 問題列表 |
| createdAt | String | 建立時間 |
| updatedAt | String | 更新時間 |

#### 表格 5: surveys (問卷)

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | String | 問卷 ID |
| templateId | String | 範本 ID |
| courseId | String | 課程 ID |
| courseName | String | 課程名稱 |
| courseDate | String | 課程日期 |
| teacherId | String | 教師 ID |
| teacherName | String | 教師姓名 |
| status | String | 狀態 |
| shareUrl | String | 分享連結 |
| createdAt | String | 建立時間 |
| expiresAt | String | 到期時間 |

#### 表格 6: surveyResponses (問卷回覆)

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | String | 回覆 ID |
| surveyId | String | 問卷 ID |
| respondentName | String | 填答者姓名 |
| respondentEmail | String | 填答者 Email |
| answers | JSON Array | 回答內容 |
| submittedAt | String | 提交時間 |

### 6.2 JSON 欄位格式

在 Google Sheets 中，陣列欄位儲存為 JSON 字串：

```javascript
// experiences 欄位儲存格內容
["10年教學經驗","曾任某大學講師","專業證照多張"]

// subjects 欄位儲存格內容
["數學","物理","微積分"]

// questions 欄位儲存格內容
[
  {"id":"q1","type":"rating","text":"教學滿意度","required":true},
  {"id":"q2","type":"text","text":"建議事項","required":false}
]
```

### 6.3 建立 Google Sheets 資料庫

#### 步驟 1: 建立新試算表

1. 開啟 [Google Sheets](https://sheets.google.com)
2. 建立新試算表
3. 命名為「教師排課系統資料庫」

#### 步驟 2: 建立工作表

手動建立以下工作表（或讓 GAS 自動建立）：

1. teachers
2. courseAssignments
3. maritimeCourses
4. surveyTemplates
5. surveys
6. surveyResponses

#### 步驟 3: 設定標題列

以 `teachers` 為例：

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| id | name | email | teacherType | workLocation | photoUrl | experiences | certificates | subjects | tags |

**格式建議：**
- 標題列：粗體、藍色背景、白色文字
- 凍結第一列：檢視 → 凍結 → 1 列

#### 步驟 4: 資料驗證（可選）

為某些欄位設定資料驗證：

```
teacherType: 下拉選單 → 專任, 兼任, 外聘
method: 下拉選單 → 實體, 線上, 混合
status: 下拉選單 → 已確認, 待確認, 已取消
```

### 6.4 資料庫管理最佳實踐

#### 1. 備份策略

Google Sheets 會自動版本控制，但建議：

```
檔案 → 建立副本 → 命名：「教師排課系統_備份_20251118」
```

#### 2. 權限設定

```
共用 → 設定權限：
- 管理員：編輯者
- 開發者：編輯者
- 一般使用者：檢視者（透過前端操作）
```

#### 3. 資料清理

定期清理無效資料：

```javascript
// 在 GAS 中執行
function cleanupOldSurveys() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('surveys');
  const values = sheet.getDataRange().getValues();

  // 刪除過期問卷
  for (let i = values.length - 1; i >= 1; i--) {
    const expiresAt = new Date(values[i][10]); // expiresAt 欄位
    if (expiresAt < new Date()) {
      sheet.deleteRow(i + 1);
    }
  }
}
```

---

## 7. API 開發規範

### 7.1 請求格式

#### GET 請求

```
GET {baseUrl}?action={action}&table={table}&token={token}

範例：
GET https://script.google.com/.../exec?action=list&table=teachers&token=tr_demo_12345
```

#### POST 請求

```javascript
POST {baseUrl}
Content-Type: application/json

{
  "action": "save",
  "table": "teachers",
  "token": "tr_demo_12345",
  "data": [...]
}
```

### 7.2 回應格式

#### 成功回應

```json
{
  "ok": true,
  "data": {...}
}
```

#### 錯誤回應

```json
{
  "ok": false,
  "error": "Invalid token"
}
```

### 7.3 錯誤代碼

| 錯誤訊息 | 原因 | 解決方法 |
|---------|------|---------|
| Invalid token | Token 錯誤 | 檢查前後端 TOKEN 是否一致 |
| Unknown table | 表格不存在 | 檢查 SHEETS_CONFIG |
| Unknown action | Action 不正確 | 檢查支援的 action |
| No file found | 檔案上傳失敗 | 檢查檔案格式和大小 |

### 7.4 安全性規範

#### 1. Token 驗證

```javascript
// 所有請求都必須包含 token
const response = await api.list('teachers');  // 自動附帶 token
```

#### 2. CORS 處理

Google Apps Script Web App 會自動處理 CORS，無需額外設定。

#### 3. 速率限制

Google Apps Script 限制：
- 每天 20,000 次 URL Fetch 呼叫
- 每分鐘 100 次執行

建議前端實作快取以減少請求次數。

---

## 8. 部署指南

### 8.1 前端部署（GitHub Pages）

#### 步驟 1: 推送程式碼到 GitHub

```bash
git add .
git commit -m "feat: update frontend"
git push origin main
```

#### 步驟 2: 啟用 GitHub Pages

1. 開啟 GitHub Repository
2. Settings → Pages
3. Source: Deploy from a branch
4. Branch: main, 資料夾: / (root)
5. Save

#### 步驟 3: 等待部署

```
GitHub 會自動部署，通常需要 1-5 分鐘
完成後會顯示：
Your site is published at https://whlans66-eng.github.io/teacher-roster/
```

#### 步驟 4: 測試網站

開啟部署的 URL，測試功能是否正常。

### 8.2 後端部署（Google Apps Script）

#### 重新部署步驟

1. 修改 `backend-api.gs`
2. 儲存專案 (Ctrl+S)
3. 部署 → 管理部署項目
4. 編輯現有部署 → 新版本
5. 部署

**注意**：每次修改後都需要建立新版本才會生效！

### 8.3 自訂網域（可選）

#### GitHub Pages 自訂網域

1. 購買網域（如 teacher-roster.com）
2. DNS 設定：
   ```
   A Record:
   185.199.108.153
   185.199.109.153
   185.199.110.153
   185.199.111.153

   CNAME Record:
   www → whlans66-eng.github.io
   ```
3. GitHub Settings → Pages → Custom domain
4. 輸入網域 → Save
5. 勾選 Enforce HTTPS

---

## 9. 常見問題排解

### 9.1 前端問題

#### Q: 無法讀取資料？

**A: 檢查以下項目：**

1. 檢查 Console 是否有錯誤訊息
2. 確認 `API_CONFIG.baseUrl` 正確
3. 確認 `API_CONFIG.token` 與後端一致
4. 測試 API：`await api.ping()`

#### Q: CORS 錯誤？

**A: Google Apps Script 部署設定：**

確認部署時選擇「具有存取權的使用者」為「任何人」

### 9.2 後端問題

#### Q: Token 驗證失敗？

**A: 檢查：**

```javascript
// backend-api.gs
const TOKEN = 'tr_demo_12345';

// js/api.js
const API_CONFIG = {
  token: 'tr_demo_12345'  // 必須一致
};
```

#### Q: 資料寫入失敗？

**A: 檢查 Google Sheets 權限：**

1. 開啟 Google Sheets
2. 共用 → 進階
3. 確認 Google Apps Script 有編輯權限

#### Q: 檔案上傳失敗？

**A: 檢查 Google Drive 資料夾：**

1. 確認 FOLDER_ID 正確
2. 確認資料夾權限設定為「知道連結的使用者可檢視」
3. 檢查檔案大小（限制 50MB）

### 9.3 Google Sheets 問題

#### Q: 資料格式錯誤？

**A: JSON 欄位格式：**

```javascript
// ✅ 正確
["項目1", "項目2", "項目3"]

// ❌ 錯誤
項目1, 項目2, 項目3
"項目1", "項目2"
```

#### Q: 日期格式問題？

**A: 統一使用 YYYY-MM-DD：**

```javascript
// backend-api.gs 會自動處理
function _formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

---

## 10. 開發工作流程

### 10.1 Git 分支策略

```
main (生產)
  └─ dev (開發)
       ├─ feature/teacher-management
       ├─ feature/survey-system
       └─ bugfix/date-format
```

### 10.2 開發流程

#### 1. 建立功能分支

```bash
git checkout -b feature/new-feature
```

#### 2. 開發與測試

```bash
# 修改程式碼
# 本地測試（Live Server）
# 測試 API
```

#### 3. 提交變更

```bash
git add .
git commit -m "feat: 新增教師評分功能"
```

**Commit 訊息格式：**
```
<type>: <subject>

type:
- feat: 新功能
- fix: 錯誤修正
- docs: 文件更新
- style: 格式調整
- refactor: 重構
- test: 測試
```

#### 4. 推送與合併

```bash
git push origin feature/new-feature

# 在 GitHub 建立 Pull Request
# Code Review
# 合併到 main
```

### 10.3 版本發布

```bash
# 更新版本號
# 建立 Tag
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0

# GitHub Pages 會自動重新部署
```

---

## 11. 未來升級計劃

### 11.1 計劃中的升級

目前專案已準備好升級到更強大的三層式架構：

#### 升級後的架構

| 項目 | 目前 | 升級後 |
|------|------|--------|
| **前端** | HTML/CSS/JS | React + TypeScript + Vite |
| **後端** | Google Apps Script | Node.js + Express + TypeScript |
| **資料庫** | Google Sheets | MySQL 8.0 / Azure Database |
| **認證** | Token | JWT + bcrypt |
| **權限** | 無 | RBAC (角色權限控制) |
| **部署** | GitHub Pages | Docker / Azure App Service |

#### 升級優勢

✅ **更強大的功能**：
- RBAC 權限系統（4種角色，33+種權限）
- 樂觀鎖防併發衝突
- 完整操作日誌
- Rate Limiting、Helmet 安全防護

✅ **更好的效能**：
- 資料庫索引優化
- 連線池管理
- Redis 快取（可選）

✅ **更易維護**：
- TypeScript 類型安全
- 單元測試、整合測試
- API 文件自動生成

### 11.2 升級準備

專案已包含升級所需的所有程式碼：

```
teacher-roster/
├── backend/              # ✅ Node.js 後端（已完成）
│   ├── src/
│   │   ├── config/      # 資料庫配置
│   │   ├── middleware/  # 認證、權限、日誌
│   │   ├── routes/      # API 路由
│   │   └── server.ts    # 主入口
│   └── Dockerfile       # Docker 部署
├── database/             # ✅ MySQL 資料庫（已完成）
│   ├── init/
│   │   ├── 01_schema.sql      # 資料表結構
│   │   └── 02_seed_data.sql   # 測試資料
│   └── migrate-from-sheets.js # 從 Sheets 遷移工具
├── docker-compose.yml    # ✅ Docker 部署配置
└── AZURE_SETUP.md       # ✅ Azure 部署指南
```

### 11.3 資料遷移

當準備升級時，使用提供的遷移工具：

```bash
# 從 Google Sheets 遷移到 MySQL
node database/migrate-from-sheets.js
```

遷移腳本會自動：
1. 從 Google Sheets 讀取資料
2. 轉換資料格式
3. 寫入 MySQL 資料庫
4. 處理重複資料

### 11.4 何時該升級？

考慮升級的時機：

- ✅ 用戶數量超過 100 人
- ✅ 需要更複雜的權限控制
- ✅ 需要操作日誌和審計功能
- ✅ 效能成為瓶頸
- ✅ 需要更好的併發控制
- ✅ 需要整合其他系統

---

## 附錄 A：開發檢查清單

### 前端開發檢查清單

- [ ] 程式碼已格式化
- [ ] Console 無錯誤訊息
- [ ] 本地測試通過
- [ ] API 呼叫正常
- [ ] 錯誤處理完善
- [ ] 載入狀態提示
- [ ] 行動裝置測試
- [ ] 多瀏覽器測試

### 後端開發檢查清單

- [ ] Token 驗證啟用
- [ ] 錯誤處理完善
- [ ] 資料驗證完整
- [ ] 效能優化（批次讀寫）
- [ ] 測試所有 API 端點
- [ ] 文件已更新
- [ ] 部署新版本
- [ ] 測試線上環境

### 部署檢查清單

- [ ] 程式碼已推送到 GitHub
- [ ] GitHub Pages 部署成功
- [ ] Google Apps Script 已重新部署
- [ ] API URL 正確
- [ ] Token 已設定
- [ ] 線上測試通過
- [ ] 功能完整
- [ ] 文件已更新

---

## 附錄 B：常用指令速查

### Git

```bash
# 建立新分支
git checkout -b feature/new-feature

# 提交變更
git add .
git commit -m "feat: add new feature"

# 推送分支
git push origin feature/new-feature

# 合併分支
git checkout main
git merge feature/new-feature

# 查看狀態
git status

# 查看提交歷史
git log --oneline
```

### 本地測試伺服器

```bash
# Python
python -m http.server 8000

# Node.js
npx http-server -p 8000

# PHP
php -S localhost:8000
```

---

## 附錄 C：參考資源

### 官方文件

- [Google Apps Script 文件](https://developers.google.com/apps-script)
- [Google Sheets API](https://developers.google.com/sheets/api)
- [Google Drive API](https://developers.google.com/drive)
- [GitHub Pages 文件](https://docs.github.com/pages)

### 教學資源

- [JavaScript MDN](https://developer.mozilla.org/zh-TW/docs/Web/JavaScript)
- [Fetch API](https://developer.mozilla.org/zh-TW/docs/Web/API/Fetch_API)
- [Google Apps Script 教學](https://www.youtube.com/results?search_query=google+apps+script+tutorial)

### 工具

- [VS Code](https://code.visualstudio.com/)
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/)
- [Git](https://git-scm.com/)

---

**文件版本**: v1.0.0 (Google 生態系統版本)
**最後更新**: 2025-11-18
**維護者**: Development Team
**授權**: MIT License

---

## 🎯 快速開始

如果這是你第一次使用本系統，請按照以下順序閱讀：

1. ✅ [專案概述](#1-專案概述) - 了解系統架構
2. ✅ [開發環境設定](#3-開發環境設定) - 設定開發環境
3. ✅ [前端開發指南](#4-前端開發指南) - 學習前端開發
4. ✅ [Google Apps Script 後端開發](#5-google-apps-script-後端開發) - 部署後端
5. ✅ [部署指南](#8-部署指南) - 上線部署

有問題？查看 [常見問題排解](#9-常見問題排解) 或開啟 GitHub Issue！
