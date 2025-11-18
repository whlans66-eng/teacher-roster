# 📘 教師排課管理系統 - 細部開發手冊

> **版本**: v1.0.0
> **最後更新**: 2025-11-18
> **適用對象**: 後端開發者、前端開發者、系統管理員

---

## 📑 目錄

1. [專案概述](#1-專案概述)
2. [開發環境設定](#2-開發環境設定)
3. [專案架構詳解](#3-專案架構詳解)
4. [後端開發指南](#4-後端開發指南)
5. [前端開發指南](#5-前端開發指南)
6. [資料庫設計與管理](#6-資料庫設計與管理)
7. [API 開發規範](#7-api-開發規範)
8. [安全性最佳實踐](#8-安全性最佳實踐)
9. [測試指南](#9-測試指南)
10. [部署與維運](#10-部署與維運)
11. [常見問題排解](#11-常見問題排解)
12. [開發工作流程](#12-開發工作流程)

---

## 1. 專案概述

### 1.1 系統簡介

教師排課管理系統是一個現代化的三層式 Web 應用程式，用於管理教育機構的教師資訊、課程安排和派課調度。

**核心價值**：
- 從 Google Sheets 升級到專業的資料庫系統
- 完整的用戶認證和權限管理 (RBAC)
- 高安全性、可擴展、易維護

### 1.2 技術棧

| 層級 | 技術 | 版本要求 |
|------|------|---------|
| **前端** | React + TypeScript + Vite | React 18+ |
| **狀態管理** | Zustand | Latest |
| **UI 框架** | TailwindCSS | 3.x |
| **HTTP 客戶端** | Axios | Latest |
| **後端** | Node.js + Express + TypeScript | Node 18+ |
| **資料庫** | MySQL | 8.0+ |
| **ORM/查詢** | mysql2 (原生 SQL) | 3.6+ |
| **認證** | JWT + bcrypt | - |
| **容器化** | Docker + Docker Compose | - |

### 1.3 系統特色

- ✅ **RBAC 權限系統**: 4 種角色 (admin, manager, teacher, viewer)，33+ 種細緻權限
- ✅ **樂觀鎖機制**: 使用 version 欄位防止併發衝突
- ✅ **完整操作日誌**: 所有操作自動記錄，可追蹤審計
- ✅ **安全防護**: Rate Limiting、Helmet、CORS、SQL Injection 防護
- ✅ **TypeScript 全棧**: 類型安全、易於維護

---

## 2. 開發環境設定

### 2.1 系統需求

#### 必要軟體

```bash
# 核心工具
- Node.js >= 18.0.0
- npm >= 9.0.0
- Git >= 2.30
- Docker >= 20.10 (推薦)
- Docker Compose >= 2.0 (推薦)

# 可選工具
- VS Code (推薦編輯器)
- MySQL Workbench (資料庫管理)
- Postman / Insomnia (API 測試)
```

#### VS Code 推薦擴充套件

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-azuretools.vscode-docker",
    "bradlc.vscode-tailwindcss",
    "ritwickdey.liveserver",
    "mongodb.mongodb-vscode"
  ]
}
```

### 2.2 專案初始化

#### 步驟 1: Clone 專案

```bash
# 使用 HTTPS
git clone https://github.com/your-org/teacher-roster.git
cd teacher-roster

# 或使用 SSH
git clone git@github.com:your-org/teacher-roster.git
cd teacher-roster
```

#### 步驟 2: 環境變數設定

```bash
# 複製環境變數範本
cp .env.example .env

# 編輯 .env 檔案
nano .env  # 或使用你喜歡的編輯器
```

**必須修改的變數**：

```bash
# 🔒 資料庫密碼（至少 16 字元）
DB_PASSWORD=Your_Super_Secure_Password_2024!

# 🔒 Root 密碼（至少 16 字元）
DB_ROOT_PASSWORD=Your_Root_Password_2024!

# 🔒 JWT 密鑰（使用以下命令生成）
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# 🔒 Session 密鑰
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
```

#### 步驟 3: 使用 Docker 啟動 (推薦)

```bash
# 啟動所有服務（MySQL + Backend）
docker-compose up -d

# 查看服務狀態
docker-compose ps

# 查看後端日誌
docker-compose logs -f backend

# 查看資料庫日誌
docker-compose logs -f mysql
```

**服務端點**：
- 後端 API: `http://localhost:3001`
- MySQL: `localhost:3306`

#### 步驟 4: 本地開發設定（不使用 Docker）

```bash
# 1. 安裝後端依賴
cd backend
npm install

# 2. 確保 MySQL 正在運行
# 方式 A: 使用本地安裝的 MySQL
mysql -u root -p
CREATE DATABASE teacher_roster;

# 方式 B: 使用 Docker 單獨啟動 MySQL
docker run --name teacher-roster-mysql \
  -e MYSQL_ROOT_PASSWORD=root123 \
  -e MYSQL_DATABASE=teacher_roster \
  -e MYSQL_USER=roster_user \
  -e MYSQL_PASSWORD=roster_pass \
  -p 3306:3306 \
  -d mysql:8.0

# 3. 初始化資料庫
cd ..
mysql -h localhost -u roster_user -p teacher_roster < database/init/01_schema.sql
mysql -h localhost -u roster_user -p teacher_roster < database/init/02_seed_data.sql

# 4. 啟動後端開發伺服器
cd backend
npm run dev
```

### 2.3 驗證安裝

```bash
# 測試後端健康檢查
curl http://localhost:3001/health

# 預期回應
{
  "status": "ok",
  "timestamp": "2025-11-18T10:30:00.000Z",
  "database": "connected"
}

# 測試登入 API
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!@#"}'

# 預期回應包含 token
{
  "success": true,
  "message": "登入成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { ... }
  }
}
```

---

## 3. 專案架構詳解

### 3.1 目錄結構

```
teacher-roster/
├── backend/                     # 後端 API 服務
│   ├── src/
│   │   ├── config/             # 配置檔案
│   │   │   └── database.ts     # 資料庫連線池設定
│   │   ├── middleware/         # 中介層
│   │   │   ├── auth.ts         # JWT 認證中介層
│   │   │   ├── rateLimiter.ts  # API 限流
│   │   │   ├── auditLog.ts     # 操作日誌記錄
│   │   │   └── errorHandler.ts # 錯誤處理
│   │   ├── routes/             # 路由定義
│   │   │   ├── auth.ts         # 認證路由
│   │   │   ├── teachers.ts     # 教師管理路由
│   │   │   ├── courses.ts      # 課程管理路由
│   │   │   ├── assignments.ts  # 派課管理路由
│   │   │   ├── surveys.ts      # 問卷路由
│   │   │   ├── users.ts        # 用戶管理路由
│   │   │   └── audit.ts        # 操作日誌路由
│   │   ├── utils/              # 工具函數
│   │   │   └── logger.ts       # Winston 日誌工具
│   │   └── server.ts           # 伺服器主入口
│   ├── Dockerfile              # 後端 Docker 映像檔
│   ├── package.json            # 後端依賴
│   └── tsconfig.json           # TypeScript 設定
│
├── frontend-new/                # 前端應用 (待實作)
│   ├── src/
│   │   ├── components/         # React 元件
│   │   ├── pages/              # 頁面元件
│   │   ├── stores/             # Zustand 狀態管理
│   │   ├── services/           # API 服務層
│   │   ├── hooks/              # 自訂 Hooks
│   │   ├── types/              # TypeScript 類型定義
│   │   └── utils/              # 工具函數
│   ├── package.json
│   └── vite.config.ts
│
├── database/                    # 資料庫相關
│   ├── init/                   # 初始化 SQL
│   │   ├── 01_schema.sql       # 資料表結構
│   │   └── 02_seed_data.sql    # 測試資料
│   ├── migrations/             # 資料遷移腳本
│   └── migrate-from-sheets.js  # Google Sheets 遷移工具
│
├── docs/                        # 文件目錄 (建議新增)
│   ├── api/                    # API 文件
│   ├── database/               # 資料庫 ER 圖
│   └── architecture/           # 架構設計文件
│
├── .env                         # 環境變數 (不提交到 Git)
├── .env.example                 # 環境變數範本
├── .gitignore                   # Git 忽略清單
├── docker-compose.yml           # Docker Compose 本地開發
├── docker-compose.azure.yml     # Docker Compose Azure 部署
├── README.md                    # 專案說明
├── DEVELOPMENT_MANUAL.md        # 本開發手冊
└── AZURE_SETUP.md              # Azure 部署指南
```

### 3.2 架構圖

#### 三層式架構

```
┌─────────────────────────────────────────────────────────────┐
│                      前端層 (Presentation)                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  React Components (pages, layouts, components)       │  │
│  │  - 使用者介面                                         │  │
│  │  - 表單驗證                                           │  │
│  │  - 路由管理 (React Router)                            │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  State Management (Zustand)                          │  │
│  │  - 全域狀態                                           │  │
│  │  - 用戶認證狀態                                       │  │
│  │  - 快取管理                                           │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  API Service Layer (Axios)                           │  │
│  │  - HTTP 請求                                          │  │
│  │  - 錯誤處理                                           │  │
│  │  - Token 管理                                         │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ HTTPS / REST API
                        │ Bearer Token Authentication
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                    後端層 (Application)                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Middleware Stack                                     │  │
│  │  - CORS, Helmet, Rate Limiting                        │  │
│  │  - JWT Authentication                                 │  │
│  │  - RBAC Permission Check                              │  │
│  │  - Audit Logging                                      │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Routes / Controllers                                 │  │
│  │  - 請求路由                                           │  │
│  │  - 參數驗證 (express-validator)                       │  │
│  │  - 業務邏輯調用                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Business Logic                                       │  │
│  │  - 教師管理                                           │  │
│  │  - 課程管理                                           │  │
│  │  - 派課管理                                           │  │
│  │  - 權限檢查                                           │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ MySQL2 Connection Pool
                        │ Prepared Statements (防 SQL Injection)
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                    資料層 (Database)                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  MySQL 8.0 Database                                   │  │
│  │  - 13 張資料表                                        │  │
│  │  - 外鍵約束 (Referential Integrity)                   │  │
│  │  - 索引優化 (Performance)                             │  │
│  │  - JSON 欄位支援 (Flexibility)                        │  │
│  │  - 樂觀鎖 (version 欄位)                              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 資料流程

#### 請求流程範例：新增教師

```
1. 用戶操作
   └─> 前端表單提交 (name, email, teacherType)

2. 前端驗證
   └─> 檢查必填欄位、格式驗證
   └─> 呼叫 API Service: teacherService.createTeacher(data)

3. HTTP 請求
   └─> POST /api/teachers
   └─> Headers: Authorization: Bearer {token}
   └─> Body: { name, email, teacherType, ... }

4. 後端中介層處理
   └─> CORS 檢查
   └─> Rate Limiting (限制請求頻率)
   └─> JWT 驗證 (解析 token)
   └─> Permission 檢查 (是否有 teacher.create 權限)

5. 路由層
   └─> routes/teachers.ts
   └─> 參數驗證 (express-validator)
   └─> 呼叫業務邏輯

6. 業務邏輯層
   └─> 檢查 email 是否重複
   └─> 建立資料庫連線
   └─> 執行 INSERT 語句
   └─> 記錄操作日誌

7. 資料庫操作
   └─> INSERT INTO teachers (...)
   └─> 回傳新增的 teacher_id

8. 回應
   └─> { success: true, data: { id: 123, ... } }
   └─> 前端更新狀態和 UI
```

---

## 4. 後端開發指南

### 4.1 後端技術棧

- **Node.js 18+**: JavaScript 執行環境
- **Express 4.x**: Web 框架
- **TypeScript 5.x**: 類型安全
- **mysql2**: MySQL 客戶端（支援 Promise）
- **bcrypt**: 密碼加密
- **jsonwebtoken**: JWT 認證
- **express-validator**: 輸入驗證
- **winston**: 日誌記錄
- **helmet**: 安全標頭
- **express-rate-limit**: API 限流

### 4.2 專案啟動

```bash
# 開發模式（熱重載）
cd backend
npm run dev

# 建置生產版本
npm run build

# 運行生產版本
npm start

# 程式碼檢查
npm run lint

# 運行測試
npm test
```

### 4.3 新增 API 路由

#### 步驟 1: 定義路由

在 `backend/src/routes/` 新增或修改路由檔案。

**範例：`routes/teachers.ts`**

```typescript
import express from 'express';
import { body, query, param } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/auth';
import db from '../config/database';

const router = express.Router();

/**
 * GET /api/teachers
 * 取得教師列表
 * 權限: teacher.view_all
 */
router.get(
  '/',
  authenticate,
  requirePermission('teacher.view_all'),
  async (req, res, next) => {
    try {
      const { search, teacherType, isActive, page = 1, limit = 20 } = req.query;

      // 建立查詢
      let sql = 'SELECT * FROM teachers WHERE 1=1';
      const params: any[] = [];

      if (search) {
        sql += ' AND (name LIKE ? OR email LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      if (teacherType) {
        sql += ' AND teacher_type = ?';
        params.push(teacherType);
      }

      if (isActive !== undefined) {
        sql += ' AND is_active = ?';
        params.push(isActive === 'true' ? 1 : 0);
      }

      // 分頁
      const offset = (Number(page) - 1) * Number(limit);
      sql += ' LIMIT ? OFFSET ?';
      params.push(Number(limit), offset);

      // 執行查詢
      const [rows] = await db.query(sql, params);

      res.json({
        success: true,
        data: rows,
        pagination: {
          page: Number(page),
          limit: Number(limit)
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/teachers
 * 新增教師
 * 權限: teacher.create
 */
router.post(
  '/',
  authenticate,
  requirePermission('teacher.create'),
  [
    body('name').notEmpty().withMessage('姓名為必填'),
    body('email').isEmail().withMessage('Email 格式不正確'),
    body('teacherType').isIn(['full_time', 'part_time', 'adjunct']).withMessage('教師類型不正確')
  ],
  async (req, res, next) => {
    try {
      const { name, email, teacherType, workLocation, subjects, experiences, certificates } = req.body;

      // 檢查 email 是否已存在
      const [existing] = await db.query('SELECT id FROM teachers WHERE email = ?', [email]);
      if ((existing as any[]).length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email 已被使用'
        });
      }

      // 插入新教師
      const [result] = await db.query(
        `INSERT INTO teachers (name, email, teacher_type, work_location, subjects, experiences, certificates, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          email,
          teacherType,
          workLocation || null,
          JSON.stringify(subjects || []),
          JSON.stringify(experiences || []),
          JSON.stringify(certificates || []),
          req.user.id
        ]
      );

      res.status(201).json({
        success: true,
        message: '教師新增成功',
        data: {
          id: (result as any).insertId
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
```

#### 步驟 2: 註冊路由

在 `backend/src/server.ts` 註冊路由：

```typescript
import teacherRoutes from './routes/teachers';

// ...

app.use('/api/teachers', teacherRoutes);
```

### 4.4 認證與權限

#### JWT 認證中介層

所有需要認證的路由都應使用 `authenticate` 中介層：

```typescript
import { authenticate } from '../middleware/auth';

router.get('/protected', authenticate, (req, res) => {
  // req.user 包含解碼後的用戶資訊
  res.json({ userId: req.user.id });
});
```

#### 權限檢查中介層

需要特定權限的路由使用 `requirePermission`：

```typescript
import { requirePermission } from '../middleware/auth';

router.post(
  '/teachers',
  authenticate,
  requirePermission('teacher.create'),
  (req, res) => {
    // 只有擁有 teacher.create 權限的用戶可以訪問
  }
);
```

#### 多權限檢查

```typescript
// 需要任一權限 (OR)
requirePermission(['teacher.view', 'teacher.view_all'], 'any')

// 需要所有權限 (AND)
requirePermission(['teacher.view', 'course.view'], 'all')
```

### 4.5 資料庫操作

#### 使用連線池

```typescript
import db from '../config/database';

// 簡單查詢
const [rows] = await db.query('SELECT * FROM teachers WHERE id = ?', [teacherId]);

// 插入
const [result] = await db.query(
  'INSERT INTO teachers (name, email) VALUES (?, ?)',
  [name, email]
);
const insertId = (result as any).insertId;

// 更新
const [updateResult] = await db.query(
  'UPDATE teachers SET name = ? WHERE id = ?',
  [newName, teacherId]
);
const affectedRows = (updateResult as any).affectedRows;

// 刪除
const [deleteResult] = await db.query('DELETE FROM teachers WHERE id = ?', [teacherId]);
```

#### 樂觀鎖實作

```typescript
// 更新時檢查版本號
const [result] = await db.query(
  `UPDATE teachers
   SET name = ?, version = version + 1
   WHERE id = ? AND version = ?`,
  [newName, teacherId, currentVersion]
);

if ((result as any).affectedRows === 0) {
  return res.status(409).json({
    success: false,
    message: '資料已被其他用戶修改，請重新載入'
  });
}
```

#### 交易處理

```typescript
const connection = await db.getConnection();
try {
  await connection.beginTransaction();

  // 執行多個操作
  await connection.query('INSERT INTO teachers ...');
  await connection.query('INSERT INTO audit_logs ...');

  await connection.commit();
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
}
```

### 4.6 錯誤處理

#### 統一錯誤格式

```typescript
// 在 middleware/errorHandler.ts
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);

  const statusCode = err.statusCode || 500;
  const message = err.message || '伺服器錯誤';

  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};
```

#### 自訂錯誤類型

```typescript
export class ValidationError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends Error {
  statusCode = 401;
  constructor(message: string = '未授權') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

// 使用
throw new ValidationError('Email 格式不正確');
```

### 4.7 日誌記錄

#### 使用 Winston

```typescript
import logger from '../utils/logger';

// 不同級別的日誌
logger.info('用戶登入', { userId: 123, ip: req.ip });
logger.warn('API 請求頻率過高', { userId: 456 });
logger.error('資料庫連線失敗', { error: err.message });

// 在生產環境，日誌會寫入檔案
// 在開發環境，日誌會輸出到控制台
```

---

## 5. 前端開發指南

> **注意**: 前端應用目前尚未實作，以下為規劃指南。

### 5.1 前端技術棧

- **React 18**: UI 框架
- **TypeScript**: 類型安全
- **Vite**: 建置工具
- **Zustand**: 輕量級狀態管理
- **React Router v6**: 路由管理
- **Axios**: HTTP 客戶端
- **TailwindCSS**: UI 樣式
- **React Hook Form**: 表單管理
- **Zod**: 表單驗證

### 5.2 專案結構規劃

```
frontend-new/
├── src/
│   ├── components/          # 可複用元件
│   │   ├── common/         # 通用元件
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── Table.tsx
│   │   ├── layout/         # 佈局元件
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── MainLayout.tsx
│   │   └── teachers/       # 教師相關元件
│   │       ├── TeacherList.tsx
│   │       ├── TeacherForm.tsx
│   │       └── TeacherCard.tsx
│   ├── pages/              # 頁面元件
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── TeachersPage.tsx
│   │   ├── CoursesPage.tsx
│   │   └── AssignmentsPage.tsx
│   ├── stores/             # Zustand 狀態管理
│   │   ├── authStore.ts
│   │   ├── teacherStore.ts
│   │   └── uiStore.ts
│   ├── services/           # API 服務
│   │   ├── api.ts          # Axios 配置
│   │   ├── authService.ts
│   │   ├── teacherService.ts
│   │   └── courseService.ts
│   ├── hooks/              # 自訂 Hooks
│   │   ├── useAuth.ts
│   │   ├── usePermission.ts
│   │   └── useDebounce.ts
│   ├── types/              # TypeScript 類型
│   │   ├── user.ts
│   │   ├── teacher.ts
│   │   └── api.ts
│   ├── utils/              # 工具函數
│   │   ├── validators.ts
│   │   ├── formatters.ts
│   │   └── constants.ts
│   ├── App.tsx             # 主應用
│   └── main.tsx            # 入口點
├── public/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

### 5.3 API 服務層範例

```typescript
// services/api.ts
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  timeout: 10000
});

// 請求攔截器：自動添加 Token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 回應攔截器：統一錯誤處理
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token 過期，導向登入頁
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

```typescript
// services/teacherService.ts
import api from './api';
import { Teacher, CreateTeacherDto } from '../types/teacher';

export const teacherService = {
  // 取得教師列表
  async getTeachers(params?: {
    search?: string;
    teacherType?: string;
    page?: number;
    limit?: number;
  }) {
    const { data } = await api.get<{ success: boolean; data: Teacher[] }>('/teachers', { params });
    return data.data;
  },

  // 取得單一教師
  async getTeacher(id: number) {
    const { data } = await api.get<{ success: boolean; data: Teacher }>(`/teachers/${id}`);
    return data.data;
  },

  // 新增教師
  async createTeacher(teacher: CreateTeacherDto) {
    const { data } = await api.post<{ success: boolean; data: { id: number } }>('/teachers', teacher);
    return data.data;
  },

  // 更新教師
  async updateTeacher(id: number, teacher: Partial<Teacher> & { version: number }) {
    const { data } = await api.put(`/teachers/${id}`, teacher);
    return data.data;
  },

  // 刪除教師
  async deleteTeacher(id: number) {
    const { data } = await api.delete(`/teachers/${id}`);
    return data;
  }
};
```

### 5.4 狀態管理範例

```typescript
// stores/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: number;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;

  login: (token: string, user: User) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      login: (token, user) => {
        set({ token, user, isAuthenticated: true });
      },

      logout: () => {
        set({ token: null, user: null, isAuthenticated: false });
      },

      hasPermission: (permission) => {
        const { user } = get();
        return user?.permissions?.includes(permission) || false;
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user })
    }
  )
);
```

### 5.5 權限控制元件

```typescript
// components/common/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, permission }) => {
  const { isAuthenticated, hasPermission } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
```

---

## 6. 資料庫設計與管理

### 6.1 資料表結構

#### 核心資料表

| 資料表 | 說明 | 主要欄位 |
|--------|------|---------|
| `users` | 用戶帳號 | id, username, email, password_hash |
| `roles` | 角色定義 | id, name, display_name, description |
| `permissions` | 權限定義 | id, name, display_name, resource, action |
| `user_roles` | 用戶-角色關聯 | user_id, role_id |
| `role_permissions` | 角色-權限關聯 | role_id, permission_id |
| `teachers` | 教師資訊 | id, name, email, teacher_type, subjects, experiences |
| `courses` | 課程資訊 | id, course_code, course_name, category, delivery_mode |
| `assignments` | 派課記錄 | id, teacher_id, course_id, semester, hours_per_week |
| `surveys` | 問卷定義 | id, title, description, questions (JSON) |
| `survey_responses` | 問卷回覆 | id, survey_id, teacher_id, responses (JSON) |
| `audit_logs` | 操作日誌 | id, user_id, action, resource, details (JSON) |

#### ER 關聯圖

```
users ──┐
        ├─── user_roles ──── roles ──── role_permissions ──── permissions
        │
        └─── audit_logs

teachers ──┐
           ├─── assignments ──── courses
           │
           └─── survey_responses ──── surveys
```

### 6.2 索引優化

```sql
-- 常用查詢欄位建立索引
CREATE INDEX idx_teachers_email ON teachers(email);
CREATE INDEX idx_teachers_type ON teachers(teacher_type);
CREATE INDEX idx_teachers_active ON teachers(is_active);
CREATE INDEX idx_assignments_teacher ON assignments(teacher_id);
CREATE INDEX idx_assignments_course ON assignments(course_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- 複合索引
CREATE INDEX idx_assignments_teacher_semester ON assignments(teacher_id, semester);
```

### 6.3 資料遷移

#### 從 Google Sheets 遷移

```bash
# 使用提供的遷移腳本
node database/migrate-from-sheets.js
```

#### 建立新的遷移

```bash
# 建立遷移檔案
mkdir -p database/migrations
touch database/migrations/2025_11_18_add_teacher_rating.sql
```

```sql
-- database/migrations/2025_11_18_add_teacher_rating.sql
-- 新增教師評分欄位

ALTER TABLE teachers
ADD COLUMN rating DECIMAL(3,2) DEFAULT NULL COMMENT '教師評分 (0-5)',
ADD COLUMN rating_count INT DEFAULT 0 COMMENT '評分人數';

-- 建立索引
CREATE INDEX idx_teachers_rating ON teachers(rating);
```

### 6.4 備份與還原

```bash
# 備份資料庫
docker exec teacher-roster-mysql mysqldump -u roster_user -p teacher_roster > backup_$(date +%Y%m%d).sql

# 還原資料庫
docker exec -i teacher-roster-mysql mysql -u roster_user -p teacher_roster < backup_20251118.sql

# 僅備份結構
docker exec teacher-roster-mysql mysqldump -u roster_user -p --no-data teacher_roster > schema.sql

# 僅備份資料
docker exec teacher-roster-mysql mysqldump -u roster_user -p --no-create-info teacher_roster > data.sql
```

---

## 7. API 開發規範

### 7.1 RESTful API 設計原則

#### URL 命名規範

```
✅ 正確
GET    /api/teachers              # 取得教師列表
GET    /api/teachers/:id          # 取得單一教師
POST   /api/teachers              # 新增教師
PUT    /api/teachers/:id          # 更新教師
DELETE /api/teachers/:id          # 刪除教師
GET    /api/teachers/:id/courses  # 取得教師的課程

❌ 錯誤
GET    /api/getTeachers           # 不要在 URL 中使用動詞
POST   /api/teacher/create        # 不要使用 create 動詞
GET    /api/teachers_list         # 使用橫線而非底線
```

#### HTTP 狀態碼使用

| 狀態碼 | 說明 | 使用時機 |
|--------|------|---------|
| 200 | OK | 成功取得或更新資源 |
| 201 | Created | 成功建立資源 |
| 204 | No Content | 成功刪除資源 |
| 400 | Bad Request | 請求參數錯誤 |
| 401 | Unauthorized | 未認證或 Token 無效 |
| 403 | Forbidden | 已認證但無權限 |
| 404 | Not Found | 資源不存在 |
| 409 | Conflict | 資源衝突（如樂觀鎖失敗）|
| 422 | Unprocessable Entity | 驗證失敗 |
| 429 | Too Many Requests | 超過速率限制 |
| 500 | Internal Server Error | 伺服器錯誤 |

### 7.2 統一回應格式

#### 成功回應

```json
{
  "success": true,
  "message": "操作成功",
  "data": {
    "id": 123,
    "name": "王老師"
  }
}
```

#### 錯誤回應

```json
{
  "success": false,
  "message": "Email 已被使用",
  "error": {
    "code": "DUPLICATE_EMAIL",
    "field": "email"
  }
}
```

#### 分頁回應

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### 7.3 API 版本控制

```typescript
// 使用 URL 版本控制
app.use('/api/v1/teachers', teachersV1Routes);
app.use('/api/v2/teachers', teachersV2Routes);

// 或使用 Header 版本控制
app.use((req, res, next) => {
  const version = req.headers['api-version'] || 'v1';
  req.apiVersion = version;
  next();
});
```

### 7.4 API 文件生成

建議使用 Swagger/OpenAPI：

```bash
npm install swagger-jsdoc swagger-ui-express
```

```typescript
// server.ts
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '教師排課系統 API',
      version: '1.0.0',
      description: 'API 文件'
    },
    servers: [
      { url: 'http://localhost:3001', description: '本地開發' },
      { url: 'https://api.teacher-roster.com', description: '生產環境' }
    ]
  },
  apis: ['./src/routes/*.ts']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
```

在路由中添加註解：

```typescript
/**
 * @swagger
 * /api/teachers:
 *   get:
 *     summary: 取得教師列表
 *     tags: [Teachers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: 搜尋關鍵字
 *     responses:
 *       200:
 *         description: 成功取得教師列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Teacher'
 */
router.get('/', authenticate, requirePermission('teacher.view_all'), getTeachers);
```

---

## 8. 安全性最佳實踐

### 8.1 認證安全

#### 密碼加密

```typescript
import bcrypt from 'bcrypt';

// 註冊時加密密碼
const saltRounds = 10;
const passwordHash = await bcrypt.hash(password, saltRounds);

// 登入時驗證密碼
const isValid = await bcrypt.compare(inputPassword, storedHash);
```

#### JWT Token 管理

```typescript
import jwt from 'jsonwebtoken';

// 生成 Token
const token = jwt.sign(
  { userId: user.id, username: user.username },
  process.env.JWT_SECRET!,
  { expiresIn: '7d' }
);

// 驗證 Token
const decoded = jwt.verify(token, process.env.JWT_SECRET!);
```

**最佳實踐**：
- ✅ JWT Secret 至少 256 位元
- ✅ Token 設定合理的過期時間（不超過 7 天）
- ✅ 使用 HTTPS 傳輸 Token
- ✅ 前端將 Token 存在 localStorage 或 sessionStorage
- ❌ 不要將敏感資訊放入 Token payload

### 8.2 輸入驗證

```typescript
import { body, validationResult } from 'express-validator';

router.post(
  '/teachers',
  [
    body('name')
      .trim()
      .notEmpty().withMessage('姓名為必填')
      .isLength({ max: 100 }).withMessage('姓名不可超過 100 字元'),
    body('email')
      .trim()
      .isEmail().withMessage('Email 格式不正確')
      .normalizeEmail(),
    body('teacherType')
      .isIn(['full_time', 'part_time', 'adjunct']).withMessage('教師類型不正確')
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    // 處理請求
  }
);
```

### 8.3 SQL Injection 防護

```typescript
// ✅ 正確：使用參數化查詢
const [rows] = await db.query(
  'SELECT * FROM teachers WHERE email = ?',
  [userInput]
);

// ❌ 錯誤：字串拼接（危險！）
const sql = `SELECT * FROM teachers WHERE email = '${userInput}'`;
await db.query(sql);
```

### 8.4 XSS 防護

```typescript
// 後端：sanitize 輸入
import validator from 'validator';

const sanitizedInput = validator.escape(userInput);

// 前端：使用 React 自動轉義
// React 預設會轉義所有變數
<div>{userInput}</div>  // 安全

// 如需渲染 HTML，使用 DOMPurify
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
```

### 8.5 CORS 設定

```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### 8.6 Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// 一般 API 限流
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 100, // 最多 100 個請求
  message: '請求過於頻繁，請稍後再試'
});

// 登入 API 嚴格限流
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: '登入嘗試過多，請 15 分鐘後再試'
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', loginLimiter);
```

### 8.7 安全標頭

```typescript
import helmet from 'helmet';

app.use(helmet());

// 自訂設定
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));
```

### 8.8 環境變數保護

```bash
# .gitignore
.env
.env.local
.env.*.local

# 確保不要提交敏感資訊
git log --all --full-history -- .env
```

---

## 9. 測試指南

### 9.1 測試策略

```
測試金字塔：
       ┌─────────┐
       │ E2E 測試 │ 10%
       ├─────────┤
       │整合測試  │ 30%
       ├─────────┤
       │單元測試  │ 60%
       └─────────┘
```

### 9.2 單元測試

使用 Jest 進行單元測試：

```bash
npm install --save-dev jest @types/jest ts-jest
```

```typescript
// backend/src/utils/__tests__/validators.test.ts
import { isValidEmail, isStrongPassword } from '../validators';

describe('Validators', () => {
  describe('isValidEmail', () => {
    it('應該接受有效的 email', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name+tag@example.co.uk')).toBe(true);
    });

    it('應該拒絕無效的 email', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
    });
  });

  describe('isStrongPassword', () => {
    it('應該接受強密碼', () => {
      expect(isStrongPassword('Abc123!@#')).toBe(true);
    });

    it('應該拒絕弱密碼', () => {
      expect(isStrongPassword('12345678')).toBe(false);
      expect(isStrongPassword('abcdefgh')).toBe(false);
    });
  });
});
```

### 9.3 整合測試

```typescript
// backend/src/routes/__tests__/teachers.test.ts
import request from 'supertest';
import app from '../../server';
import db from '../../config/database';

describe('Teachers API', () => {
  let authToken: string;

  beforeAll(async () => {
    // 登入取得 Token
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin123!@#' });
    authToken = res.body.data.token;
  });

  afterAll(async () => {
    await db.end();
  });

  describe('GET /api/teachers', () => {
    it('應該回傳教師列表', async () => {
      const res = await request(app)
        .get('/api/teachers')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('沒有 Token 應該回傳 401', async () => {
      const res = await request(app).get('/api/teachers');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/teachers', () => {
    it('應該成功新增教師', async () => {
      const newTeacher = {
        name: '測試老師',
        email: 'test@example.com',
        teacherType: 'part_time'
      };

      const res = await request(app)
        .post('/api/teachers')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newTeacher);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
    });

    it('缺少必填欄位應該回傳 400', async () => {
      const res = await request(app)
        .post('/api/teachers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: '測試' });

      expect(res.status).toBe(400);
    });
  });
});
```

### 9.4 E2E 測試

使用 Cypress 或 Playwright：

```bash
npm install --save-dev @playwright/test
```

```typescript
// e2e/teacher-management.spec.ts
import { test, expect } from '@playwright/test';

test.describe('教師管理', () => {
  test.beforeEach(async ({ page }) => {
    // 登入
    await page.goto('http://localhost:5173/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'Admin123!@#');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
  });

  test('應該可以新增教師', async ({ page }) => {
    await page.goto('http://localhost:5173/teachers');
    await page.click('text=新增教師');

    await page.fill('input[name="name"]', '測試老師');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.selectOption('select[name="teacherType"]', 'full_time');

    await page.click('button:has-text("儲存")');

    await expect(page.locator('text=新增成功')).toBeVisible();
  });
});
```

### 9.5 執行測試

```bash
# 執行所有測試
npm test

# 執行特定測試檔案
npm test -- validators.test.ts

# 產生覆蓋率報告
npm test -- --coverage

# Watch 模式
npm test -- --watch
```

---

## 10. 部署與維運

### 10.1 環境設定

#### 開發環境 (Development)

```bash
NODE_ENV=development
DB_HOST=localhost
LOG_LEVEL=debug
```

#### 測試環境 (Staging)

```bash
NODE_ENV=staging
DB_HOST=staging-db.example.com
LOG_LEVEL=info
```

#### 生產環境 (Production)

```bash
NODE_ENV=production
DB_HOST=prod-db.example.com
LOG_LEVEL=warn
DB_SSL_MODE=REQUIRED
```

### 10.2 Docker 部署

#### 建置映像檔

```bash
# 建置後端映像檔
cd backend
docker build -t teacher-roster-backend:latest .

# 推送到 Registry
docker tag teacher-roster-backend:latest your-registry/teacher-roster-backend:latest
docker push your-registry/teacher-roster-backend:latest
```

#### 使用 Docker Compose

```bash
# 啟動服務
docker-compose up -d

# 查看日誌
docker-compose logs -f

# 停止服務
docker-compose down

# 重啟服務
docker-compose restart backend

# 查看狀態
docker-compose ps
```

### 10.3 Azure 部署

詳見 `AZURE_SETUP.md`，重點步驟：

1. 建立 Azure Database for MySQL
2. 設定防火牆規則
3. 執行初始化 SQL
4. 建立 Azure App Service 或 Container Instances
5. 設定環境變數
6. 部署應用程式

### 10.4 健康檢查

```typescript
// server.ts
app.get('/health', async (req, res) => {
  try {
    // 檢查資料庫連線
    await db.query('SELECT 1');

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: process.env.npm_package_version
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected'
    });
  }
});
```

### 10.5 監控與日誌

#### 應用程式監控

建議使用：
- **Application Insights** (Azure)
- **New Relic**
- **Datadog**

#### 日誌聚合

```typescript
// 使用 Winston 集中日誌
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

### 10.6 效能優化

```typescript
// 啟用 Gzip 壓縮
import compression from 'compression';
app.use(compression());

// 快取靜態資源
app.use(express.static('public', {
  maxAge: '1d'
}));

// 資料庫連線池優化
const pool = mysql.createPool({
  connectionLimit: 10,
  queueLimit: 0,
  waitForConnections: true
});
```

---

## 11. 常見問題排解

### 11.1 資料庫連線失敗

**錯誤訊息**：
```
Error: connect ECONNREFUSED 127.0.0.1:3306
```

**解決方法**：
1. 檢查 MySQL 服務是否啟動：`docker-compose ps`
2. 確認 `.env` 中的 DB_HOST 設定正確
3. 檢查防火牆是否阻擋 3306 埠號
4. 查看 MySQL 日誌：`docker-compose logs mysql`

### 11.2 JWT Token 無效

**錯誤訊息**：
```
JsonWebTokenError: invalid signature
```

**解決方法**：
1. 確認前後端使用相同的 JWT_SECRET
2. 檢查 Token 是否過期
3. 確認 Token 格式：`Authorization: Bearer <token>`
4. 清除前端的 localStorage 重新登入

### 11.3 CORS 錯誤

**錯誤訊息**：
```
Access to fetch at 'http://localhost:3001/api/teachers' from origin 'http://localhost:5173' has been blocked by CORS policy
```

**解決方法**：
1. 確認 `.env` 中的 CORS_ORIGIN 設定正確
2. 後端添加 CORS 中介層：`app.use(cors({ origin: process.env.CORS_ORIGIN }))`
3. 檢查請求是否包含 credentials：`{ withCredentials: true }`

### 11.4 樂觀鎖衝突

**錯誤訊息**：
```
409 Conflict: 資料已被其他用戶修改
```

**解決方法**：
1. 提示用戶重新載入資料
2. 實作衝突解決策略（如 3-way merge）
3. 調整前端 UI，顯示版本號和最後修改時間

### 11.5 Docker 容器啟動失敗

**解決步驟**：
```bash
# 查看日誌
docker-compose logs backend

# 檢查容器狀態
docker-compose ps

# 重新建置並啟動
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# 進入容器除錯
docker exec -it teacher-roster-backend sh
```

---

## 12. 開發工作流程

### 12.1 Git 分支策略

```
main (生產)
  └─ develop (開發)
       ├─ feature/teacher-rating (功能)
       ├─ feature/email-notification (功能)
       └─ bugfix/login-issue (修正)
```

**分支命名規範**：
- `feature/<功能名稱>`：新功能開發
- `bugfix/<問題描述>`：錯誤修正
- `hotfix/<緊急修正>`：生產環境緊急修正
- `refactor/<重構內容>`：程式碼重構

### 12.2 開發流程

#### 1. 建立功能分支

```bash
git checkout develop
git pull origin develop
git checkout -b feature/teacher-rating
```

#### 2. 開發與測試

```bash
# 修改程式碼
# ...

# 執行測試
npm test

# 執行 Lint
npm run lint
```

#### 3. 提交變更

```bash
git add .
git commit -m "feat: 新增教師評分功能

- 新增 rating 和 rating_count 欄位
- 實作評分 API
- 新增評分權限檢查
"
```

**Commit 訊息格式**：
```
<type>: <subject>

<body>

<footer>
```

**Type 類型**：
- `feat`: 新功能
- `fix`: 錯誤修正
- `docs`: 文件更新
- `style`: 程式碼格式（不影響功能）
- `refactor`: 重構
- `test`: 新增或修改測試
- `chore`: 建置或輔助工具變更

#### 4. 推送與 Pull Request

```bash
git push origin feature/teacher-rating

# 在 GitHub 建立 Pull Request
# 指定 Reviewer
# 等待 Code Review
```

#### 5. Code Review

**檢查清單**：
- [ ] 程式碼符合專案規範
- [ ] 包含適當的測試
- [ ] 文件已更新
- [ ] 無安全性問題
- [ ] 效能考量合理

#### 6. 合併與部署

```bash
# PR 通過後合併到 develop
git checkout develop
git merge --no-ff feature/teacher-rating
git push origin develop

# 部署到測試環境
# 測試通過後合併到 main
git checkout main
git merge --no-ff develop
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin main --tags
```

### 12.3 程式碼審查重點

1. **安全性**：是否有 SQL Injection、XSS 風險？
2. **效能**：是否有 N+1 查詢、無限迴圈？
3. **可讀性**：變數命名、註解是否清楚？
4. **測試**：是否包含單元測試和整合測試？
5. **錯誤處理**：是否妥善處理異常情況？

### 12.4 版本發布

```bash
# 建立發布分支
git checkout -b release/v1.1.0 develop

# 更新版本號
# backend/package.json
# frontend/package.json

# 更新 CHANGELOG.md
# 執行測試
npm test

# 提交
git commit -am "chore: bump version to 1.1.0"

# 合併到 main 和 develop
git checkout main
git merge --no-ff release/v1.1.0
git tag -a v1.1.0 -m "Release v1.1.0"

git checkout develop
git merge --no-ff release/v1.1.0

# 刪除發布分支
git branch -d release/v1.1.0

# 推送
git push origin main develop --tags
```

---

## 附錄 A：開發檢查清單

### 新功能開發檢查清單

- [ ] 需求明確定義
- [ ] 資料庫 Schema 設計與遷移
- [ ] 後端 API 實作
- [ ] API 參數驗證
- [ ] 權限檢查
- [ ] 單元測試
- [ ] 整合測試
- [ ] API 文件更新
- [ ] 前端 UI 實作
- [ ] E2E 測試
- [ ] Code Review
- [ ] 部署到測試環境
- [ ] UAT 測試
- [ ] 文件更新
- [ ] 版本發布

### 安全檢查清單

- [ ] 所有 API 需要認證
- [ ] 敏感操作需要權限檢查
- [ ] 所有輸入需要驗證
- [ ] 使用參數化查詢（防 SQL Injection）
- [ ] 輸出需要轉義（防 XSS）
- [ ] CORS 正確設定
- [ ] Rate Limiting 已啟用
- [ ] Helmet 安全標頭已啟用
- [ ] 敏感資訊不在日誌中
- [ ] 環境變數正確設定
- [ ] HTTPS 已啟用（生產環境）

### 部署檢查清單

- [ ] 環境變數已設定
- [ ] 資料庫已初始化
- [ ] 資料遷移已執行
- [ ] 健康檢查端點正常
- [ ] 日誌正常輸出
- [ ] 監控已設定
- [ ] 備份策略已確認
- [ ] SSL 憑證有效
- [ ] 防火牆規則正確
- [ ] 負載測試通過

---

## 附錄 B：常用指令速查

### Docker

```bash
# 啟動所有服務
docker-compose up -d

# 重啟後端
docker-compose restart backend

# 查看日誌
docker-compose logs -f backend

# 進入容器
docker exec -it teacher-roster-backend sh

# 清理並重建
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### Git

```bash
# 建立新分支
git checkout -b feature/new-feature

# 提交變更
git add .
git commit -m "feat: add new feature"

# 推送分支
git push -u origin feature/new-feature

# 合併分支
git checkout develop
git merge --no-ff feature/new-feature

# 查看分支
git branch -a

# 刪除分支
git branch -d feature/new-feature
```

### MySQL

```bash
# 連線到資料庫
docker exec -it teacher-roster-mysql mysql -u roster_user -p

# 備份資料庫
docker exec teacher-roster-mysql mysqldump -u roster_user -p teacher_roster > backup.sql

# 還原資料庫
docker exec -i teacher-roster-mysql mysql -u roster_user -p teacher_roster < backup.sql

# 執行 SQL 檔案
docker exec -i teacher-roster-mysql mysql -u roster_user -p teacher_roster < schema.sql
```

### NPM

```bash
# 安裝依賴
npm install

# 新增依賴
npm install express
npm install --save-dev @types/express

# 更新依賴
npm update

# 檢查過期套件
npm outdated

# 安全性審計
npm audit
npm audit fix
```

---

## 附錄 C：參考資源

### 官方文件

- [Node.js 文件](https://nodejs.org/docs/)
- [Express 文件](https://expressjs.com/)
- [React 文件](https://react.dev/)
- [TypeScript 文件](https://www.typescriptlang.org/docs/)
- [MySQL 文件](https://dev.mysql.com/doc/)
- [Docker 文件](https://docs.docker.com/)

### 工具與套件

- [Zustand](https://github.com/pmndrs/zustand)
- [TailwindCSS](https://tailwindcss.com/)
- [Axios](https://axios-http.com/)
- [JWT](https://jwt.io/)
- [bcrypt](https://github.com/kelektiv/node.bcrypt.js)
- [Winston](https://github.com/winstonjs/winston)

### 最佳實踐

- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [REST API Design Guide](https://restfulapi.net/)
- [OWASP Security Guidelines](https://owasp.org/)
- [12 Factor App](https://12factor.net/)

---

**文件版本**: v1.0.0
**最後更新**: 2025-11-18
**維護者**: Development Team
**聯絡方式**: dev@teacher-roster.com

