# 🎓 教師排課管理系統 - 三層式架構版本

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-blue.svg)](https://www.mysql.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

## 📋 目錄

- [專案簡介](#專案簡介)
- [核心功能](#核心功能)
- [技術架構](#技術架構)
- [快速開始](#快速開始)
- [API 文件](#api-文件)
- [安全性](#安全性)
- [資料遷移](#資料遷移)
- [部署指南](#部署指南)

---

## 📖 專案簡介

這是一個專業的三層式教師排課管理系統，從原本的 Google Sheets + Apps Script 架構升級而來。

### 升級重點

| 項目 | 舊架構 | 新架構 |
|------|--------|--------|
| **前端** | 純 HTML + localStorage | React + TypeScript + Zustand |
| **後端** | Google Apps Script | Node.js + Express + TypeScript |
| **資料庫** | Google Sheets | MySQL 8.0 或 Azure Database |
| **認證** | 硬編碼 Token | JWT + bcrypt |
| **權限** | 無 | RBAC (角色權限控制) |
| **安全性** | Token 暴露在前端 | 所有敏感資訊在後端 + SSL |
| **併發控制** | 無 | 樂觀鎖 (version 欄位) |
| **操作日誌** | 無 | 完整的 audit_logs |
| **部署** | 手動更新 | Docker / Azure App Service |

---

## 🎯 核心功能

### ✅ 已實作

- **認證系統**
  - ✅ JWT Token 認證
  - ✅ bcrypt 密碼加密
  - ✅ 登入/註冊/登出
  - ✅ Token 自動過期和刷新

- **權限管理 (RBAC)**
  - ✅ 4 種角色：admin, manager, teacher, viewer
  - ✅ 33+ 種細緻權限
  - ✅ 動態權限檢查
  - ✅ 角色繼承機制

- **教師管理**
  - ✅ CRUD 操作
  - ✅ 樂觀鎖防衝突
  - ✅ 照片上傳
  - ✅ 經歷、證照管理

- **課程管理**
  - ✅ 課程 CRUD
  - ✅ 課程分類
  - ✅ 授課方式（線上/線下/混合）

- **派課管理**
  - ✅ 派課 CRUD
  - ✅ 衝堂檢查
  - ✅ 月度時數統計
  - ✅ 狀態管理

- **操作日誌**
  - ✅ 所有操作自動記錄
  - ✅ IP 和 User Agent 追蹤
  - ✅ 詳細的操作內容 (JSON)

- **安全性**
  - ✅ 限流保護 (Rate Limiting)
  - ✅ Helmet 安全標頭
  - ✅ CORS 控制
  - ✅ SQL Injection 防護
  - ✅ XSS 防護

### 🚧 待完成

- 問卷系統完整實作
- 前端 React 應用
- 檔案上傳功能
- Email 通知
- 統計報表

---

## 🏗️ 技術架構

```
┌─────────────────────────────────────────┐
│  前端 (React + TypeScript + Vite)       │
│  - Zustand 狀態管理                      │
│  - Axios API 請求                        │
│  - TailwindCSS UI                        │
│  Port: 5173                              │
└─────────────┬───────────────────────────┘
              │ HTTP/HTTPS
              │ Bearer Token in Header
              ↓
┌─────────────────────────────────────────┐
│  後端 API (Node.js + Express + TS)      │
│  - JWT 認證                              │
│  - RBAC 權限檢查                         │
│  - 操作日誌記錄                          │
│  - 輸入驗證 (express-validator)         │
│  Port: 3001                              │
└─────────────┬───────────────────────────┘
              │ MySQL2 Connection Pool
              ↓
┌─────────────────────────────────────────┐
│  資料庫 (MySQL 8.0)                     │
│  - 13 張資料表                           │
│  - 外鍵約束                              │
│  - 索引優化                              │
│  - JSON 欄位支援                         │
│  Port: 3306                              │
└─────────────────────────────────────────┘
```

---

## 🚀 快速開始

### 前置需求

- **Docker** 和 **Docker Compose** (推薦)
- 或者：
  - Node.js 18+
  - MySQL 8.0+
  - npm 9+

### 方法一：使用 Docker (推薦) ⭐

```bash
# 1. Clone 專案
git clone <your-repo-url>
cd teacher-roster

# 2. 修改環境變數（重要！）
cp .env.example .env
# 編輯 .env 修改密碼和 JWT Secret

# 3. 啟動所有服務
docker-compose up -d

# 4. 查看日誌
docker-compose logs -f backend

# 5. 停止服務
docker-compose down
```

### 方法二：本地開發

```bash
# 1. 安裝後端依賴
cd backend
npm install

# 2. 設定環境變數
cp ../.env.example ../.env
# 編輯 .env

# 3. 啟動 MySQL（需要先手動安裝 MySQL）
# 執行 database/init/*.sql 初始化資料庫

# 4. 啟動後端
npm run dev

# 後端會在 http://localhost:3001 啟動
```

---

## 🔐 安全性

### 環境變數保護

**⚠️ 絕對不要將 .env 檔案提交到 Git！**

```bash
# 生成強密碼
openssl rand -base64 32

# 生成 JWT Secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 預設帳號

系統會自動建立以下測試帳號（**生產環境請刪除**）：

| 用戶名 | 密碼 | 角色 | 權限 |
|--------|------|------|------|
| admin | Admin123!@# | 系統管理員 | 所有權限 |
| manager | Manager123!@# | 課程管理員 | 管理教師、課程、派課 |
| teacher1 | Teacher123!@# | 教師 | 查看和編輯自己的資料 |

### 密碼要求

- 最少 8 字元
- 建議包含大小寫字母、數字和特殊符號

---

## 📚 API 文件

### 基本格式

所有 API 請求需要在 Header 中包含：

```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

### 認證 API

#### POST /api/auth/register
註冊新用戶

**請求：**
```json
{
  "username": "testuser",
  "email": "test@example.com",
  "password": "SecurePass123!",
  "fullName": "測試用戶"
}
```

**回應：**
```json
{
  "success": true,
  "message": "註冊成功",
  "data": { "userId": 4 }
}
```

#### POST /api/auth/login
用戶登入

**請求：**
```json
{
  "username": "admin",
  "password": "Admin123!@#"
}
```

**回應：**
```json
{
  "success": true,
  "message": "登入成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "admin",
      "email": "admin@teacher-roster.local",
      "roles": [{ "name": "admin", "displayName": "系統管理員" }]
    }
  }
}
```

#### GET /api/auth/me
取得當前用戶資訊（需認證）

**回應：**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "email": "admin@teacher-roster.local",
    "roles": ["admin"],
    "permissions": ["teacher.view", "teacher.create", ...]
  }
}
```

### 教師 API

#### GET /api/teachers
取得教師列表（需權限：teacher.view_all）

**查詢參數：**
- `search` - 搜尋姓名或郵箱
- `teacherType` - 教師類型 (full_time, part_time, adjunct)
- `isActive` - 是否在職 (true/false)
- `page` - 頁碼（預設 1）
- `limit` - 每頁筆數（預設 20）

**回應：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "王老師",
      "email": "wang@example.com",
      "teacher_type": "full_time",
      "experiences": ["10年教學經驗"],
      "subjects": ["數學", "物理"]
    }
  ],
  "pagination": { "page": 1, "limit": 20 }
}
```

#### POST /api/teachers
新增教師（需權限：teacher.create）

**請求：**
```json
{
  "name": "李老師",
  "email": "li@example.com",
  "teacherType": "full_time",
  "workLocation": "台北校區",
  "subjects": ["英文", "文學"],
  "experiences": ["5年教學經驗"],
  "certificates": ["TEFL證照"]
}
```

#### PUT /api/teachers/:id
更新教師資料（需權限：teacher.update）

**請求：**
```json
{
  "version": 2,
  "name": "李老師（更新）",
  "subjects": ["英文", "文學", "寫作"]
}
```

> **樂觀鎖：** 必須提供 `version` 欄位，如果版本不匹配會回傳 409 錯誤

### 操作日誌 API

#### GET /api/audit
查看操作日誌（需權限：system.logs）

**查詢參數：**
- `userId` - 用戶 ID
- `action` - 操作類型 (LOGIN, CREATE, UPDATE, DELETE)
- `resource` - 資源類型 (teacher, course, assignment)
- `startDate` - 開始日期
- `endDate` - 結束日期

---

## 📦 資料遷移

### 從 Google Sheets 遷移

```bash
# 1. 確保 .env 中的資料庫設定正確

# 2. 安裝依賴
npm install mysql2 dotenv

# 3. 執行遷移（需要 Node.js 18+）
node database/migrate-from-sheets.js
```

遷移腳本會自動：
- ✅ 從你的 Google Sheets 取得資料
- ✅ 轉換資料格式
- ✅ 插入到 MySQL
- ✅ 處理重複資料
- ✅ 顯示遷移統計

---

## 🚀 部署指南

### 選項一：Docker 本地部署

```bash
# 1. 修改 .env 為生產環境設定
NODE_ENV=production
DB_PASSWORD=<強密碼>
JWT_SECRET=<隨機64字元>

# 2. 建置並啟動（含本地 MySQL）
docker-compose up -d

# 3. 查看狀態
docker-compose ps
```

### 選項二：Azure 雲端部署 ⭐ (推薦)

**使用 Azure Database for MySQL + Azure App Service**

詳細步驟請參考：[AZURE_SETUP.md](./AZURE_SETUP.md)

```bash
# 1. 在 Azure 建立 MySQL 資料庫
az mysql flexible-server create --name teacher-roster-mysql ...

# 2. 更新 .env 使用 Azure 資料庫
DB_HOST=teacher-roster-mysql.mysql.database.azure.com
DB_USER=roster_admin
DB_PASSWORD=<Azure密碼>
DB_SSL_MODE=REQUIRED

# 3. 使用 Azure 專用的 Docker Compose
docker-compose -f docker-compose.azure.yml up -d
```

**優點：**
- ✅ 99.99% 可用性 SLA
- ✅ 自動備份和還原
- ✅ 內建監控和警示
- ✅ 彈性擴展資源
- ✅ SSL/TLS 加密連線
- ✅ 無需管理伺服器

### 安全檢查清單

- [ ] 修改所有預設密碼
- [ ] 使用強 JWT Secret
- [ ] 刪除測試帳號
- [ ] 設定正確的 CORS_ORIGIN
- [ ] 啟用 HTTPS
- [ ] 定期備份資料庫
- [ ] 監控日誌檔案
- [ ] 設定防火牆規則

---

## 🔧 開發

### 專案結構

```
teacher-roster/
├── backend/                 # 後端 API
│   ├── src/
│   │   ├── config/         # 配置（資料庫連線）
│   │   ├── middleware/     # 中介層（認證、權限、日誌）
│   │   ├── routes/         # API 路由
│   │   ├── controllers/    # 控制器
│   │   ├── services/       # 業務邏輯
│   │   ├── models/         # 資料模型
│   │   └── utils/          # 工具函數
│   ├── Dockerfile
│   └── package.json
├── database/                # 資料庫相關
│   ├── init/               # 初始化 SQL
│   │   ├── 01_schema.sql
│   │   └── 02_seed_data.sql
│   └── migrate-from-sheets.js
├── frontend-new/            # 前端 (待實作)
├── .env                     # 環境變數（不提交）
├── .env.example             # 環境變數範本
├── .gitignore
├── docker-compose.yml
└── README.md
```

### 貢獻指南

1. Fork 專案
2. 建立功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交變更 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

---

## 📝 License

MIT License - 詳見 LICENSE 檔案

---

## 🆘 常見問題

### Q: Docker 容器無法啟動？
**A:** 檢查 `.env` 檔案是否存在，埠號是否被佔用。

### Q: JWT Token 無效？
**A:** 確認 `JWT_SECRET` 在前後端一致，Token 未過期。

### Q: 資料庫連線失敗？
**A:** 檢查 MySQL 容器是否啟動，密碼是否正確。

### Q: 如何重設資料庫？
**A:**
```bash
docker-compose down -v
docker-compose up -d
```

---

## 📞 聯絡方式

有問題或建議？歡迎開 Issue 或 PR！

---

**Built with ❤️ by Your Team**
