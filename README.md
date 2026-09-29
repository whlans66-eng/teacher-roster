# 🎓 教師排課管理系統 (WHL MARITRAIN)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Google Apps Script](https://img.shields.io/badge/Google_Apps_Script-Powered-blue.svg)](https://developers.google.com/apps-script)
[![GitHub Pages](https://img.shields.io/badge/Deployed-GitHub_Pages-success.svg)](https://whlans66-eng.github.io/teacher-roster/)

## 📋 目錄

- [專案簡介](#專案簡介)
- [系統特色](#系統特色)
- [技術架構](#技術架構)
- [快速開始](#快速開始)
- [功能說明](#功能說明)
- [開發指南](#開發指南)
- [部署說明](#部署說明)
- [未來升級計劃](#未來升級計劃)

---

## 📖 專案簡介

教師排課管理系統是一個基於 **Google 生態系統**的現代化 Web 應用程式，用於管理教育機構的教師資訊、課程安排和派課調度。

**🌐 線上系統**：https://whlans66-eng.github.io/teacher-roster/

### 核心價值

- ✅ **零維運成本**：完全基於 Google 免費服務
- ✅ **自動備份**：Google Sheets 自動版本控制
- ✅ **快速部署**：修改後即時生效
- ✅ **高可用性**：99.9% Google 服務 SLA

---

## 🌟 系統特色

### 目前實作的功能

- ✅ **教師管理**
  - 教師資料 CRUD（新增、查詢、修改、刪除）
  - 照片上傳（Google Drive）
  - 經歷、證照、專長管理
  - 教師類型分類（專任、兼任、外聘）

- ✅ **課程管理**
  - 航海課程資料庫
  - 課程分類管理
  - 授課方式（實體、線上、混合）
  - 課程搜尋與篩選

- ✅ **派課管理**
  - 課程派課記錄
  - 教師課表查看
  - 派課狀態管理
  - 時間衝突檢查

- ✅ **問卷系統**
  - 問卷範本管理
  - 問卷建立與分享
  - 問卷回覆收集
  - 滿意度調查

- ✅ **帳號與權限管理**
  - 管理者專用帳號管理頁（`admin.html`）
  - 帳號 CRUD：新增、改名、換角色、重設密碼、刪除
  - 四種角色：管理者、教師、船員、訪客
  - 各頁面可進入的角色集中定義於 `js/auth.js` 的 `PAGE_ACCESS`
  - 右上角帳號入口與登出

---

## 🏗️ 技術架構

### 目前架構（運行中）

```
┌─────────────────────────────────────────┐
│  前端 (GitHub Pages)                    │
│  - HTML5 + CSS3 + Vanilla JavaScript   │
│  - 響應式設計                           │
│  - 無框架依賴                           │
│  https://whlans66-eng.github.io/...    │
└────────────┬────────────────────────────┘
             │
             │ HTTPS REST API
             │ Token 認證
             │
┌────────────▼────────────────────────────┐
│  後端 API (Google Apps Script)         │
│  - 無伺服器架構                         │
│  - 自動擴展                             │
│  - doGet/doPost 處理器                  │
│  script.google.com/macros/s/.../exec   │
└────────────┬────────────────────────────┘
             │
             │ Sheets API
             │ Drive API
             │
┌────────────▼────────────────────────────┐
│  資料儲存 (Google Services)            │
│  📊 Google Sheets（資料庫）             │
│     - teachers（教師）                  │
│     - courseAssignments（派課）         │
│     - maritimeCourses（課程）           │
│     - surveyTemplates（問卷範本）       │
│     - surveys（問卷）                   │
│     - surveyResponses（問卷回覆）       │
│                                         │
│  📁 Google Drive（檔案儲存）            │
│     - 教師照片                          │
│     - 上傳文件                          │
└─────────────────────────────────────────┘
```

### 技術棧

| 層級 | 技術 | 說明 |
|------|------|------|
| **前端** | HTML5 + CSS3 + JavaScript | 純前端實作，無需建置工具 |
| **API 層** | Google Apps Script | 無伺服器後端，自動擴展 |
| **資料庫** | Google Sheets | 結構化資料儲存 |
| **檔案儲存** | Google Drive | 圖片和文件上傳 |
| **託管** | GitHub Pages | 靜態網站免費託管 |
| **版本控制** | Git + GitHub | 程式碼版本管理 |

---

## 🚀 快速開始

### 前置需求

- Google 帳號
- Git
- 程式碼編輯器（推薦 VS Code）
- 現代瀏覽器

### 本地開發

#### 1. Clone 專案

```bash
git clone https://github.com/whlans66-eng/teacher-roster.git
cd teacher-roster
```

#### 2. 本地預覽

**方法 A: VS Code Live Server**
```bash
# 安裝 Live Server 擴充套件
# 右鍵 index.html → Open with Live Server
```

**方法 B: Python**
```bash
python -m http.server 8000
# 開啟 http://localhost:8000
```

**方法 C: Node.js**
```bash
npx http-server -p 8000
# 開啟 http://localhost:8000
```

#### 3. 測試 API 連線

開啟瀏覽器 Console (F12)：

```javascript
await api.ping()
// 預期回應：{ ok: true, server: "Google Apps Script" }
```

---

## 📚 功能說明

### 教師管理

- 新增、編輯、刪除教師資料
- 上傳教師照片
- 記錄教學經歷、專業證照
- 設定授課科目和專長領域
- 教師類型分類（專任/兼任/外聘）

### 課程管理

- 維護航海課程資料庫
- 課程分類和編號
- 課程描述和關鍵字
- 授課方式設定（實體/線上/混合）

### 派課管理

- 建立課程派課記錄
- 指定教師和上課時間
- 派課狀態追蹤（已確認/待確認/已取消）
- 查看教師課表
- 避免時間衝突

### 問卷系統

- 建立問卷範本
- 產生問卷連結
- 收集學員回饋
- 查看統計結果

---

## 👨‍💻 開發指南

### 專案結構

```
teacher-roster/
├── index.html              # 主頁面
├── teacher-management.html # 教師管理頁面
├── course-management.html  # 課程管理頁面
├── maritime-courses.html   # 海事課程頁面
├── js/
│   └── api.js             # API 通訊層
├── backend-api.gs         # Google Apps Script 後端
├── backend/               # 未來升級：Node.js 後端
├── database/              # 未來升級：MySQL 資料庫
└── README.md
```

### API 使用範例

```javascript
// 讀取教師列表
const teachers = await api.list('teachers');

// 新增教師
await api.save('teachers', [
  {
    id: '1',
    name: '王老師',
    email: 'wang@example.com',
    teacherType: '專任',
    subjects: ['數學', '物理']
  }
]);

// 上傳檔案
const file = document.getElementById('fileInput').files[0];
const result = await api.uploadFile(file);
console.log(result.url); // Google Drive URL
```

### 詳細文檔

請參考 [細部開發手冊](./DEVELOPMENT_MANUAL.md) 獲取完整的開發指南，包含：

- 系統架構詳解
- Google Apps Script 部署教學
- Google Sheets 資料庫設計
- API 端點完整文檔
- 前端開發最佳實踐
- 常見問題排解

---

## 🌐 部署說明

### 我需要重新佈署嗎？

- **前端（HTML/JS/CSS）改動**：只要重新推送到 GitHub Pages 或你的靜態主機即可，**不需要**重新發布 Google Apps Script。
- **`js/api.js` 內的 `API_CONFIG` 調整**：屬於前端設定，更新前端部署就能生效。如果更換了 `baseUrl` 或 `token`，請同步後端設定。
- **`backend-api.gs` 或 Apps Script 代碼改動**：需要在 Apps Script 後台重新 **Deploy → New version → Execute as: Me → Who has access: Anyone** 取得新 Web App URL，並更新到前端的 `API_CONFIG.baseUrl`。
- **Google Sheets / Drive 結構變更**：若後端有依賴欄位或資料夾 ID，請先更新後端程式並重新部署，再更新前端設定。

### 前端部署（GitHub Pages）

```bash
# 1. 推送到 GitHub
git add .
git commit -m "update: 更新前端"
git push origin main

# 2. 啟用 GitHub Pages
# Settings → Pages → Source: main branch

# 3. 等待部署完成（1-5 分鐘）
# 訪問 https://whlans66-eng.github.io/teacher-roster/
```

### 後端部署（Google Apps Script）

1. 開啟 [Google Apps Script](https://script.google.com)
2. 建立新專案，貼上 `backend-api.gs`
3. 修改設定：
   - `TOKEN`：自訂安全令牌
   - `SHEET_ID`：Google Sheets ID
   - `FOLDER_ID`：Google Drive 資料夾 ID
4. 部署為 Web App
5. 複製 URL 到 `js/api.js`

詳細步驟請參考 [開發手冊](./DEVELOPMENT_MANUAL.md#5-google-apps-script-後端開發)

---

## 🔮 未來升級計劃

專案已準備好升級到更強大的企業級架構：

### 計劃中的技術棧

| 項目 | 目前 | 計劃升級 |
|------|------|----------|
| **前端** | HTML/CSS/JS | React + TypeScript + Vite |
| **後端** | Google Apps Script | Node.js + Express + TypeScript |
| **資料庫** | Google Sheets | MySQL 8.0 / Azure Database |
| **認證** | Token | JWT + bcrypt |
| **權限** | 基本 | RBAC（角色權限控制）|
| **部署** | GitHub Pages + GAS | Docker / Azure App Service |

### 升級優勢

- ✅ **RBAC 權限系統**：4 種角色，33+ 種細緻權限
- ✅ **樂觀鎖**：防止併發衝突
- ✅ **操作日誌**：完整審計追蹤
- ✅ **安全防護**：Rate Limiting、Helmet、XSS/SQL Injection 防護
- ✅ **更好效能**：資料庫索引、連線池、快取機制

### 升級準備

專案已包含升級所需的所有程式碼：

```
✅ backend/              # Node.js + Express 後端（已完成）
✅ database/             # MySQL 資料庫結構（已完成）
✅ docker-compose.yml    # Docker 部署配置
✅ AZURE_SETUP.md       # Azure 部署指南
✅ 資料遷移工具          # 從 Sheets 遷移到 MySQL
```

當需要升級時，只需：

```bash
# 遷移資料
node database/migrate-from-sheets.js

# 啟動新架構
docker-compose up -d
```

### 何時該升級？

考慮升級的時機：

- 用戶數量超過 100 人
- 需要更複雜的權限控制
- 需要操作日誌和審計功能
- 效能成為瓶頸
- 需要更好的併發控制

---

## 📞 支援與貢獻

### 取得幫助

- 📖 閱讀 [開發手冊](./DEVELOPMENT_MANUAL.md)
- 🐛 回報問題：[GitHub Issues](https://github.com/whlans66-eng/teacher-roster/issues)
- 💬 討論：[GitHub Discussions](https://github.com/whlans66-eng/teacher-roster/discussions)

### 貢獻指南

歡迎提交 Pull Request！

1. Fork 專案
2. 建立功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交變更 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

---

## 📄 授權

MIT License - 詳見 [LICENSE](./LICENSE) 檔案

---

## 🙏 致謝

本專案使用以下技術和服務：

- [Google Apps Script](https://developers.google.com/apps-script) - 無伺服器後端
- [Google Sheets](https://www.google.com/sheets/about/) - 資料儲存
- [Google Drive](https://www.google.com/drive/) - 檔案儲存
- [GitHub Pages](https://pages.github.com/) - 靜態網站託管

---

**Built with ❤️ for Education**

📍 目前運行版本：v1.0.0 (Google 生態系統)
🚀 計劃升級版本：v2.0.0 (企業級三層架構)
