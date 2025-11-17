# 🚀 Fabric Warehouse 快速開始指南

## 🎯 您問的問題答案

### Q: 部署到 Azure，資料庫接 Fabric Lakehouse/Warehouse，這樣會有 Docker 嗎？

**A: 是的，會使用 Docker！**

架構如下：

```
前端 (React) → Azure Static Web Apps
    ↓
後端 (Node.js) → Azure Container Apps ✅ 使用 Docker
    ↓
資料庫 → Microsoft Fabric Warehouse ✅ 不是 MySQL
```

---

## 📦 完整檔案清單

我已經為您建立了以下檔案：

### 1. 資料庫連線配置
- ✅ `backend/src/config/database-fabric.ts` - Fabric Warehouse 連線程式
- ✅ `database/fabric-schema.sql` - T-SQL Schema（從 MySQL 轉換）

### 2. 部署配置
- ✅ `.env.fabric.example` - 環境變數範本
- ✅ `azure-container-app.yaml` - Container App 配置
- ✅ `deploy-azure.sh` - 自動化部署腳本

### 3. 文件
- ✅ `FABRIC_DEPLOYMENT.md` - 完整部署指南（30+ 頁）
- ✅ `QUICK_START_FABRIC.md` - 本文件

### 4. 更新的檔案
- ✅ `backend/package.json` - 新增 `mssql` 驅動程式

---

## 🚀 3 分鐘快速部署

### 步驟 1: 建立 Fabric Warehouse（5 分鐘）

1. 登入 [Microsoft Fabric Portal](https://fabric.microsoft.com)
2. 建立 Workspace：`teacher-roster-workspace`
3. 建立 Warehouse：`teacher_roster_warehouse`
4. 執行 SQL：複製 `database/fabric-schema.sql` 內容並執行
5. 複製 SQL Endpoint：`xxx.datawarehouse.fabric.microsoft.com`

### 步驟 2: 本地測試（3 分鐘）

```bash
# 1. 安裝新的依賴
cd backend
npm install

# 2. 建立環境變數
cd ..
cp .env.fabric.example .env

# 3. 編輯 .env 填入您的 Fabric 資訊
# FABRIC_SERVER=xxx.datawarehouse.fabric.microsoft.com
# FABRIC_DATABASE=teacher_roster_warehouse

# 4. 測試連線（使用 Azure CLI 認證）
az login
cd backend
npm run dev
```

### 步驟 3: 部署到 Azure（10 分鐘）

```bash
# 1. 修改部署腳本中的變數
nano deploy-azure.sh
# 修改：FABRIC_SERVER, ACR_NAME 等

# 2. 執行自動化部署
chmod +x deploy-azure.sh
./deploy-azure.sh

# 3. 在 Fabric Portal 授予 Managed Identity 權限
# (腳本會顯示 Identity 名稱)

# 4. 測試部署
curl https://your-app.azurecontainerapps.io/health
```

---

## 🔍 關鍵差異：MySQL vs Fabric Warehouse

| 項目 | MySQL（舊） | Fabric Warehouse（新） |
|------|------------|----------------------|
| **驅動程式** | `mysql2` | `mssql` |
| **SQL 語法** | MySQL | T-SQL |
| **連線方式** | 用戶名/密碼 | Azure AD / Managed Identity |
| **AUTO_INCREMENT** | `AUTO_INCREMENT` | `IDENTITY(1,1)` |
| **字串類型** | `VARCHAR` | `NVARCHAR` |
| **日期時間** | `DATETIME` | `DATETIME2` |
| **布林值** | `TINYINT(1)` | `BIT` |

### 程式碼範例對比

**舊的 MySQL 查詢：**
```typescript
import mysql from 'mysql2/promise';
const [rows] = await pool.execute('SELECT * FROM teachers WHERE id = ?', [1]);
```

**新的 Fabric Warehouse 查詢：**
```typescript
import { query } from './config/database-fabric';
const rows = await query('SELECT * FROM teachers WHERE id = @id', { id: 1 });
```

---

## 📝 修改現有路由範例

假設您有一個 `backend/src/routes/teachers.ts`：

### 舊的 MySQL 版本：
```typescript
import { pool } from '../config/database';

router.get('/', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM teachers');
  res.json(rows);
});
```

### 新的 Fabric Warehouse 版本：
```typescript
import { query } from '../config/database-fabric';

router.get('/', async (req, res) => {
  const rows = await query('SELECT * FROM teachers');
  res.json(rows);
});
```

只需要改這兩個地方：
1. 匯入改成 `database-fabric`
2. 移除解構賦值的 `[rows]`（因為 mssql 已經返回 recordset）

---

## 🔐 驗證方式選擇

### 方式 1: Managed Identity（生產環境推薦）✅

```bash
# .env
FABRIC_AUTH_TYPE=azure-active-directory-default
AZURE_CLIENT_ID=<managed-identity-client-id>
```

優點：
- 無需管理密碼
- 最安全
- Azure 內建支援

### 方式 2: Service Principal（CI/CD）

```bash
# .env
FABRIC_AUTH_TYPE=azure-active-directory-service-principal-secret
FABRIC_CLIENT_ID=xxx
FABRIC_CLIENT_SECRET=xxx
FABRIC_TENANT_ID=xxx
```

### 方式 3: Azure CLI（本地開發）

```bash
# 只需要登入
az login

# .env
FABRIC_AUTH_TYPE=azure-active-directory-default
```

---

## 💡 常見問題速答

### Q1: 為什麼選 Warehouse 而不是 Lakehouse？

**A:** 對於結構化的教師管理系統：
- Warehouse = 純 SQL，效能好 ✅
- Lakehouse = 支援非結構化資料（圖片、PDF），較複雜

### Q2: 成本多少？

**A:** 小型生產環境：
- Fabric Warehouse (F64): ~NT$30,000/月
- Container Apps: ~NT$1,500/月
- **總計：~NT$31,500/月**

開發環境可用 Fabric Trial（60 天免費）

### Q3: 需要改很多程式碼嗎？

**A:** 不用！只需要：
1. 安裝 `mssql`：`npm install mssql`
2. 改 import：`database` → `database-fabric`
3. 改查詢：移除 `[rows]` 解構

大約 30 分鐘內可完成。

### Q4: Docker Compose 還能用嗎？

**A:** 可以！但不需要 MySQL 容器了：

```yaml
# docker-compose.fabric.yml
services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    env_file:
      - .env
    # 不再需要 mysql 服務
```

### Q5: 如何遷移現有資料？

```bash
# 1. 從 MySQL 匯出
mysqldump -u root -p teacher_roster > backup.sql

# 2. 使用轉換工具（手動或腳本）
# - AUTO_INCREMENT → IDENTITY(1,1)
# - VARCHAR → NVARCHAR
# - DATETIME → DATETIME2

# 3. 在 Fabric Portal 執行轉換後的 SQL
```

我已經提供了轉換好的 Schema：`database/fabric-schema.sql`

---

## 🎯 下一步行動

選擇一個路徑：

### 路徑 A: 先本地測試（推薦）
```bash
1. npm install mssql
2. 建立 Fabric Warehouse
3. 複製 .env.fabric.example → .env
4. npm run dev
```

### 路徑 B: 直接部署到 Azure
```bash
1. 修改 deploy-azure.sh
2. ./deploy-azure.sh
3. 在 Fabric Portal 授權
```

---

## 📚 完整文件

- 📖 **完整部署指南**: `FABRIC_DEPLOYMENT.md`（30+ 頁，含所有細節）
- 🗄️ **資料庫 Schema**: `database/fabric-schema.sql`
- ⚙️ **環境變數範本**: `.env.fabric.example`
- 🐳 **容器配置**: `azure-container-app.yaml`

---

## 🆘 需要協助？

1. 查看詳細文件：`FABRIC_DEPLOYMENT.md`
2. 檢查日誌：
   ```bash
   az containerapp logs show \
     --name teacher-roster-backend \
     --resource-group teacher-roster-rg \
     --follow
   ```
3. 測試連線：
   ```bash
   curl https://your-app.azurecontainerapps.io/health
   ```

---

**總結：是的，會用 Docker（透過 Azure Container Apps），資料庫改用 Fabric Warehouse（不是 MySQL）。所有配置檔案都已準備好！** 🚀
