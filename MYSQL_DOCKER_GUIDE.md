# 🐳 MySQL + Docker 專業後端升級方案

## 📋 概述

這份文件說明如何將現有的 Google Sheets 後端升級為 **MySQL + Docker** 專業架構，解決並發問題並支援 1000+ 用戶。

---

## 🎯 為什麼需要 MySQL + Docker？

### 目前 Google Sheets 架構的限制

| 限制 | 影響 |
|------|------|
| 同時寫入：10-30 人 | 超過限制會失敗 ❌ |
| API 配額：20,000 次/天 | 用戶多時容易超過 ❌ |
| 延遲：500ms - 2秒 | 使用體驗差 ❌ |
| 無真正鎖機制 | 資料衝突風險高 ❌ |
| 資料結構限制 | 只能用簡單表格 ❌ |

### MySQL + Docker 的優勢

| 優勢 | 說明 |
|------|------|
| ✅ 無並發限制 | 支援 1000+ 同時操作 |
| ✅ 無請求限制 | 只受伺服器資源限制 |
| ✅ 低延遲 | 10-100ms 回應時間 |
| ✅ 事務處理 | 完整的 ACID 保證 |
| ✅ 複雜查詢 | JOIN、索引、聚合等 |
| ✅ 可擴展 | 水平/垂直擴展 |
| ✅ 專業級 | 業界標準解決方案 |

---

## 🏗️ 架構設計

### 完整技術棧

```
┌─────────────────────┐
│   前端 (現有不變)    │
│  HTML + JavaScript  │
└──────────┬──────────┘
           │ HTTP/HTTPS
           ▼
┌─────────────────────┐
│   後端 API Server    │
│  Node.js + Express  │
└──────────┬──────────┘
           │ SQL
           ▼
┌─────────────────────┐
│   MySQL Database    │
│   (Docker 容器)     │
└─────────────────────┘
```

### 資料庫結構

```sql
-- 教師表
CREATE TABLE teachers (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100),
  teacherType VARCHAR(20),
  workLocation VARCHAR(20),
  photoUrl TEXT,
  experiences JSON,
  certificates JSON,
  subjects JSON,
  tags JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT DEFAULT 1  -- 樂觀鎖版本號
);

-- 派課記錄表
CREATE TABLE course_assignments (
  id BIGINT PRIMARY KEY,
  teacherId VARCHAR(50),
  name VARCHAR(200),
  date DATE,
  time VARCHAR(20),
  type VARCHAR(20),
  status VARCHAR(20),
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT DEFAULT 1,
  FOREIGN KEY (teacherId) REFERENCES teachers(id) ON DELETE CASCADE,
  INDEX idx_teacher_date (teacherId, date)
);

-- 海事課程表
CREATE TABLE maritime_courses (
  id BIGINT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(10),
  method VARCHAR(20),
  description TEXT,
  keywords JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT DEFAULT 1,
  INDEX idx_category (category)
);

-- 操作日誌表（審計追蹤）
CREATE TABLE audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(50),
  record_id VARCHAR(50),
  action VARCHAR(20),  -- INSERT, UPDATE, DELETE
  user_id VARCHAR(50),
  changes JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 📦 Docker 設定

### docker-compose.yml

```yaml
version: '3.8'

services:
  # MySQL 資料庫
  mysql:
    image: mysql:8.0
    container_name: teacher-roster-db
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: your_root_password_here
      MYSQL_DATABASE: teacher_roster
      MYSQL_USER: roster_user
      MYSQL_PASSWORD: your_password_here
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - teacher-network

  # Node.js 後端 API
  api:
    build: ./backend
    container_name: teacher-roster-api
    restart: always
    environment:
      DB_HOST: mysql
      DB_USER: roster_user
      DB_PASSWORD: your_password_here
      DB_NAME: teacher_roster
      JWT_SECRET: your_jwt_secret_here
      PORT: 3000
    ports:
      - "3000:3000"
    depends_on:
      - mysql
    networks:
      - teacher-network

volumes:
  mysql_data:

networks:
  teacher-network:
    driver: bridge
```

---

## 🔧 後端 API 實作

### 專案結構

```
backend/
├── package.json
├── Dockerfile
├── src/
│   ├── index.js          # 入口
│   ├── db.js             # 資料庫連接
│   ├── routes/
│   │   ├── teachers.js   # 教師 API
│   │   ├── courses.js    # 派課 API
│   │   └── maritime.js   # 海事課程 API
│   ├── middleware/
│   │   ├── auth.js       # 驗證中介
│   │   └── errorHandler.js
│   └── utils/
│       └── versioning.js # 版本控制
```

### package.json

```json
{
  "name": "teacher-roster-api",
  "version": "1.0.0",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mysql2": "^3.6.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "helmet": "^7.0.0",
    "express-rate-limit": "^7.1.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

### src/index.js

```javascript
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const teachersRouter = require('./routes/teachers');
const coursesRouter = require('./routes/courses');
const maritimeRouter = require('./routes/maritime');

const app = express();
const PORT = process.env.PORT || 3000;

// 安全性中介層
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API 速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 100 // 最多 100 個請求
});
app.use('/api/', limiter);

// 路由
app.use('/api/teachers', teachersRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/maritime', maritimeRouter);

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 錯誤處理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
```

### src/db.js

```javascript
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'roster_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'teacher_roster',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
```

### src/routes/teachers.js

```javascript
const express = require('express');
const router = express.Router();
const db = require('../db');

// 取得所有教師
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM teachers ORDER BY created_at DESC');
    res.json({ ok: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// 取得單一教師
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM teachers WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Teacher not found' });
    }
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
});

// 新增教師
router.post('/', async (req, res, next) => {
  try {
    const teacher = req.body;
    const [result] = await db.query(
      'INSERT INTO teachers (id, name, email, teacherType, workLocation, photoUrl, experiences, certificates, subjects, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        teacher.id || Date.now().toString(),
        teacher.name,
        teacher.email,
        teacher.teacherType,
        teacher.workLocation,
        teacher.photoUrl,
        JSON.stringify(teacher.experiences || []),
        JSON.stringify(teacher.certificates || []),
        JSON.stringify(teacher.subjects || []),
        JSON.stringify(teacher.tags || [])
      ]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (error) {
    next(error);
  }
});

// 更新教師（樂觀鎖）
router.put('/:id', async (req, res, next) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const teacher = req.body;
    const currentVersion = teacher.version || 1;

    // 檢查版本號
    const [current] = await connection.query(
      'SELECT version FROM teachers WHERE id = ? FOR UPDATE',
      [req.params.id]
    );

    if (current.length === 0) {
      await connection.rollback();
      return res.status(404).json({ ok: false, error: 'Teacher not found' });
    }

    if (current[0].version !== currentVersion) {
      await connection.rollback();
      return res.status(409).json({
        ok: false,
        error: 'Conflict: Data has been modified by another user',
        conflict: true
      });
    }

    // 更新資料並增加版本號
    await connection.query(
      `UPDATE teachers SET
        name = ?, email = ?, teacherType = ?, workLocation = ?,
        photoUrl = ?, experiences = ?, certificates = ?, subjects = ?, tags = ?,
        version = version + 1
       WHERE id = ? AND version = ?`,
      [
        teacher.name,
        teacher.email,
        teacher.teacherType,
        teacher.workLocation,
        teacher.photoUrl,
        JSON.stringify(teacher.experiences || []),
        JSON.stringify(teacher.certificates || []),
        JSON.stringify(teacher.subjects || []),
        JSON.stringify(teacher.tags || []),
        req.params.id,
        currentVersion
      ]
    );

    await connection.commit();
    res.json({ ok: true, version: currentVersion + 1 });

  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

// 刪除教師
router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM teachers WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// 批量儲存（覆蓋模式）
router.post('/batch', async (req, res, next) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const teachers = req.body.data || [];

    // 清空現有資料
    await connection.query('DELETE FROM teachers');

    // 批量插入
    for (const teacher of teachers) {
      await connection.query(
        'INSERT INTO teachers (id, name, email, teacherType, workLocation, photoUrl, experiences, certificates, subjects, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          teacher.id,
          teacher.name,
          teacher.email,
          teacher.teacherType,
          teacher.workLocation,
          teacher.photoUrl || teacher.photo,
          JSON.stringify(teacher.experiences || []),
          JSON.stringify(teacher.certificates || []),
          JSON.stringify(teacher.subjects || []),
          JSON.stringify(teacher.tags || [])
        ]
      );
    }

    await connection.commit();
    res.json({ ok: true, count: teachers.length });

  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

module.exports = router;
```

### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY src ./src

EXPOSE 3000

CMD ["node", "src/index.js"]
```

---

## 🚀 部署步驟

### 1. 安裝 Docker

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install docker.io docker-compose

# macOS (使用 Homebrew)
brew install docker docker-compose

# Windows
# 下載並安裝 Docker Desktop
```

### 2. 建立專案結構

```bash
mkdir teacher-roster-backend
cd teacher-roster-backend

# 建立必要目錄
mkdir -p backend/src/routes backend/src/middleware backend/src/utils
```

### 3. 建立設定檔

將上方的檔案內容複製到對應位置：
- `docker-compose.yml`
- `backend/package.json`
- `backend/Dockerfile`
- `backend/src/index.js`
- `backend/src/db.js`
- `backend/src/routes/teachers.js`
- （其他路由檔案類似）

### 4. 建立資料庫初始化腳本

```bash
# init.sql
CREATE DATABASE IF NOT EXISTS teacher_roster;
USE teacher_roster;

-- (將上方的 SQL 建表語句貼在這裡)
```

### 5. 啟動服務

```bash
# 啟動所有容器
docker-compose up -d

# 查看日誌
docker-compose logs -f

# 停止服務
docker-compose down

# 完全清除（包含資料）
docker-compose down -v
```

### 6. 測試 API

```bash
# 健康檢查
curl http://localhost:3000/health

# 取得教師列表
curl http://localhost:3000/api/teachers

# 新增教師
curl -X POST http://localhost:3000/api/teachers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "測試教師",
    "email": "test@example.com",
    "teacherType": "內部",
    "workLocation": "岸上"
  }'
```

---

## 🔄 前端整合

### 修改 js/api.js

```javascript
const API_CONFIG = {
  baseUrl: 'http://localhost:3000/api',  // 改為 Node.js API
  timeout: 30000
};

class TeacherRosterAPI {
  // ... (保持大部分程式碼不變)

  async list(table) {
    const tableMapping = {
      'teachers': '/teachers',
      'courseAssignments': '/courses',
      'maritimeCourses': '/maritime'
    };

    const endpoint = tableMapping[table];
    const response = await fetch(`${this.baseUrl}${endpoint}`);
    const result = await response.json();
    return result.data || [];
  }

  async save(table, data) {
    const tableMapping = {
      'teachers': '/teachers',
      'courseAssignments': '/courses',
      'maritimeCourses': '/maritime'
    };

    const endpoint = tableMapping[table];
    const response = await fetch(`${this.baseUrl}${endpoint}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data })
    });

    return await response.json();
  }
}
```

---

## 💰 成本估算

### 開發環境（本機）
- **成本：免費**
- Docker Desktop 免費
- 適合測試和開發

### 生產環境選項

#### 選項 1：VPS (Linode/DigitalOcean)
- **成本：$5-10/月**
- 1-2 GB RAM
- 支援 100-500 並發用戶

#### 選項 2：Railway/Render
- **成本：$0-25/月**
- 免費方案：支援小型使用
- 付費方案：更穩定，更多資源

#### 選項 3：雲端服務 (AWS/GCP/Azure)
- **成本：$10-50+/月**
- 彈性擴展
- 專業級可靠性

---

## 📊 效能比較

| 指標 | Google Sheets | MySQL + Docker |
|------|---------------|----------------|
| 並發寫入 | 10-30 人 | 1000+ 人 |
| API 回應時間 | 500-2000ms | 10-100ms |
| 每日請求限制 | 20,000 次 | 無限制 |
| 資料完整性 | 弱 | 強（ACID） |
| 衝突處理 | 無 | 完整支援 |
| 查詢能力 | 簡單 | 複雜（JOIN等） |
| 擴展性 | 有限 | 無限 |

---

## 🎯 何時應該升級？

✅ **建議升級**：
- 同時使用人數超過 30 人
- 每天操作次數超過 5,000 次
- 經常發生資料衝突
- 需要複雜查詢功能
- 資料安全性要求高

❌ **暫時不需要**：
- 使用人數 < 20 人
- 操作頻率低
- 預算有限
- 快速原型階段

---

## 📝 遷移檢查清單

- [ ] 安裝 Docker 和 Docker Compose
- [ ] 建立後端專案結構
- [ ] 複製所有程式碼檔案
- [ ] 修改 docker-compose.yml 密碼
- [ ] 建立 init.sql 資料庫腳本
- [ ] 啟動 Docker 容器
- [ ] 測試 API 端點
- [ ] 從 Google Sheets 匯出現有資料
- [ ] 匯入資料到 MySQL
- [ ] 修改前端 API 設定
- [ ] 測試前端整合
- [ ] 進行壓力測試
- [ ] 設定備份策略
- [ ] 部署到生產環境

---

## 🆘 需要協助？

如果你決定要升級到 MySQL + Docker，我可以：

1. ✅ 提供完整的程式碼範例
2. ✅ 協助設定 Docker 環境
3. ✅ 幫助除錯和測試
4. ✅ 設計資料遷移腳本
5. ✅ 提供部署指導

---

**最後更新：** 2025-11-02
**作者：** Claude AI
**版本：** 1.0.0
