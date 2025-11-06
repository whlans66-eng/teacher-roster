# 🚀 快速啟動指南

## ✅ 目前狀態

### 已完成
- ✅ 後端代碼完整建置成功
- ✅ TypeScript 編譯完成（dist/ 目錄）
- ✅ 所有依賴已安裝（604 packages）
- ✅ MySQL Schema 已準備好
- ✅ 環境變數範本已建立

### 建置資訊
```
📁 專案目錄：/home/user/teacher-roster
📦 後端依賴：604 packages
🏗️  建置輸出：backend/dist/
✅ 無安全漏洞
```

---

## 🎯 接下來的步驟

### 方案 A：在有 Docker 的環境中啟動（推薦）

如果你有 Docker 和 Docker Compose：

```bash
# 1. 確保在專案目錄
cd /home/user/teacher-roster

# 2. 檢查 .env 檔案是否存在
ls -la .env

# 3. 啟動所有服務（MySQL + Backend）
docker-compose up -d

# 4. 查看日誌
docker-compose logs -f backend

# 5. 測試 API
curl http://localhost:3001/health

# 預期回應：
# {"status":"ok","timestamp":"2025-11-05T..."}
```

### 方案 B：本地開發（需要手動安裝 MySQL）

如果沒有 Docker，需要：

#### 1. 安裝 MySQL 8.0

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install mysql-server
sudo systemctl start mysql
```

**macOS:**
```bash
brew install mysql@8.0
brew services start mysql@8.0
```

#### 2. 建立資料庫

```bash
# 登入 MySQL
mysql -u root -p

# 執行初始化腳本
mysql -u root -p < database/init/01_schema.sql
mysql -u root -p < database/init/02_seed_data.sql
```

或者手動執行：

```sql
CREATE DATABASE teacher_roster CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'roster_user'@'localhost' IDENTIFIED BY 'DevPassword123!@#';
GRANT ALL PRIVILEGES ON teacher_roster.* TO 'roster_user'@'localhost';
FLUSH PRIVILEGES;

USE teacher_roster;
-- 然後執行 database/init/01_schema.sql 的內容
-- 然後執行 database/init/02_seed_data.sql 的內容
```

#### 3. 修改環境變數

```bash
# 編輯 .env
nano /home/user/teacher-roster/.env

# 修改資料庫連線為本地：
DB_HOST=localhost
DB_PORT=3306
DB_USER=roster_user
DB_PASSWORD=DevPassword123!@#
```

#### 4. 啟動後端

```bash
cd /home/user/teacher-roster/backend

# 開發模式（自動重啟）
npm run dev

# 或生產模式
npm start
```

---

## 🧪 測試 API

### 1. 健康檢查

```bash
curl http://localhost:3001/health
```

**預期回應：**
```json
{"status":"ok","timestamp":"2025-11-05T10:55:00.000Z"}
```

### 2. 用戶登入

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "Admin123!@#"
  }'
```

**預期回應：**
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
      "roles": [{"name": "admin", "displayName": "系統管理員"}]
    }
  }
}
```

### 3. 取得教師列表（需要 Token）

```bash
# 先設定 Token
TOKEN="<從登入回應複製 token>"

curl -X GET http://localhost:3001/api/teachers \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🔧 常見問題排解

### Q1: 無法連接資料庫
**錯誤：**
```
❌ 資料庫連線失敗: Error: connect ECONNREFUSED 127.0.0.1:3306
```

**解決方法：**
1. 確認 MySQL 是否啟動：`systemctl status mysql` 或 `brew services list`
2. 檢查連線參數：`cat .env | grep DB_`
3. 測試連線：`mysql -h localhost -u roster_user -p`

### Q2: TypeScript 編譯錯誤
**錯誤：**
```
error TS6133: 'XXX' is declared but its value is never read.
```

**解決方法：**
已經在 `tsconfig.json` 中關閉嚴格檢查：
```json
{
  "noUnusedLocals": false,
  "noUnusedParameters": false
}
```

### Q3: Port 3001 被佔用
**錯誤：**
```
Error: listen EADDRINUSE: address already in use :::3001
```

**解決方法：**
```bash
# 查找佔用 port 的程序
lsof -i :3001

# 關閉該程序
kill -9 <PID>

# 或者修改 .env 中的 PORT
PORT=3002
```

### Q4: JWT Token 無效
**錯誤：**
```
{"success":false,"message":"Token 無效"}
```

**解決方法：**
1. 確認 Token 格式：`Bearer <token>`
2. 檢查 Token 是否過期（預設 7 天）
3. 確認 JWT_SECRET 一致

---

## 📊 資料遷移（可選）

如果你有 Google Sheets 的資料：

```bash
# 確保有網路連線
cd /home/user/teacher-roster

# 安裝依賴（如果還沒安裝）
npm install mysql2 dotenv

# 執行遷移
node database/migrate-from-sheets.js
```

**遷移內容：**
- ✅ 教師資料（teachers）
- ✅ 課程資料（maritimeCourses）
- ✅ 派課資料（courseAssignments）
- ✅ 問卷資料（surveyTemplates，如果有）

---

## 🎓 預設測試帳號

| 用戶名 | 密碼 | 角色 | 可用功能 |
|--------|------|------|----------|
| admin | Admin123!@# | 系統管理員 | 所有功能 |
| manager | Manager123!@# | 課程管理員 | 管理教師、課程、派課 |
| teacher1 | Teacher123!@# | 教師 | 查看/編輯自己的資料 |

**⚠️ 警告：** 生產環境請立即修改這些密碼或刪除測試帳號！

---

## 📁 專案結構

```
teacher-roster/
├── backend/
│   ├── dist/              ✅ 建置輸出（已生成）
│   ├── src/
│   │   ├── config/        ✅ 資料庫配置
│   │   ├── middleware/    ✅ JWT、RBAC、日誌
│   │   ├── routes/        ✅ API 路由
│   │   └── utils/         ✅ 工具函數
│   ├── node_modules/      ✅ 604 packages
│   └── package.json
├── database/
│   ├── init/
│   │   ├── 01_schema.sql  ✅ 資料庫架構
│   │   └── 02_seed_data.sql ✅ 預設資料
│   └── migrate-from-sheets.js ✅ 遷移腳本
├── .env                   ✅ 環境變數
├── .env.example
├── docker-compose.yml     ✅ Docker 配置
└── README.md             ✅ 完整文件
```

---

## 🔒 安全檢查清單

啟動前請確認：

- [ ] 已修改 `.env` 中的所有預設密碼
- [ ] JWT_SECRET 使用隨機生成的值
- [ ] 生產環境關閉測試帳號
- [ ] 設定正確的 CORS_ORIGIN
- [ ] 啟用 HTTPS（生產環境）
- [ ] 定期備份資料庫

---

## 📞 需要幫助？

**查看完整文檔：** `README.md`

**檢查系統狀態：**
```bash
# 後端狀態
cd backend && npm run dev

# 資料庫連線測試
mysql -h localhost -u roster_user -p -e "SELECT 1;"

# API 測試
curl http://localhost:3001/health
```

---

**Good luck! 🚀**
