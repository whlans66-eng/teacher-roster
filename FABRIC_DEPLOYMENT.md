# 🚀 Azure Fabric Warehouse 部署指南

## 📋 目錄

- [架構概覽](#架構概覽)
- [先決條件](#先決條件)
- [Fabric Warehouse 設定](#fabric-warehouse-設定)
- [Docker 部署](#docker-部署)
- [Azure Container Apps 部署](#azure-container-apps-部署)
- [常見問題](#常見問題)

---

## 架構概覽

```
┌─────────────────────────┐
│  使用者瀏覽器            │
└───────────┬─────────────┘
            │ HTTPS
            ▼
┌─────────────────────────┐
│  Azure Static Web Apps  │
│  (前端 React)           │
└───────────┬─────────────┘
            │ REST API
            ▼
┌─────────────────────────┐
│  Azure Container Apps   │ ◄─── 使用 Docker
│  (後端 Node.js)         │
└───────────┬─────────────┘
            │ SQL (TDS Protocol)
            ▼
┌─────────────────────────┐
│  Microsoft Fabric       │
│  Warehouse/Lakehouse    │
└─────────────────────────┘
```

**重點：**
- ✅ **會使用 Docker**（透過 Azure Container Apps）
- ✅ 資料庫改用 Fabric Warehouse（不是 MySQL）
- ✅ 使用 Managed Identity 進行安全認證

---

## 先決條件

### 1. Azure 訂閱與權限

```bash
# 確認已安裝 Azure CLI
az --version

# 登入 Azure
az login

# 確認訂閱
az account show
```

### 2. Microsoft Fabric Workspace

您需要：
- Microsoft Fabric 授權（F64 或以上）
- Workspace Admin 或 Contributor 權限

---

## Fabric Warehouse 設定

### 步驟 1: 建立 Fabric Warehouse

1. **登入 Fabric Portal**
   - https://fabric.microsoft.com

2. **建立 Workspace**
   ```
   名稱: teacher-roster-workspace
   授權模式: Fabric Capacity
   ```

3. **建立 Warehouse**
   ```
   類型: Data Warehouse（不是 Lakehouse）
   名稱: teacher_roster_warehouse
   ```

### 步驟 2: 取得 SQL Endpoint

在 Fabric Portal 中：

1. 進入您的 Warehouse
2. 點擊右上角「⚙️ 設定」
3. 找到「SQL 連線字串」
4. 複製 Server 名稱（例如：`xxx.datawarehouse.fabric.microsoft.com`）

### 步驟 3: 建立資料表

在 Fabric Warehouse 中執行以下 SQL（修改您現有的 MySQL schema）：

```sql
-- 教師資料表
CREATE TABLE teachers (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    email NVARCHAR(255) UNIQUE NOT NULL,
    department NVARCHAR(100),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

-- 課程資料表
CREATE TABLE courses (
    id INT IDENTITY(1,1) PRIMARY KEY,
    course_code NVARCHAR(50) UNIQUE NOT NULL,
    course_name NVARCHAR(200) NOT NULL,
    credits INT NOT NULL,
    semester NVARCHAR(20) NOT NULL,
    created_at DATETIME2 DEFAULT GETDATE()
);

-- 排課資料表
CREATE TABLE assignments (
    id INT IDENTITY(1,1) PRIMARY KEY,
    teacher_id INT NOT NULL,
    course_id INT NOT NULL,
    class_time NVARCHAR(100),
    classroom NVARCHAR(50),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
);

-- 建立索引提升效能
CREATE INDEX idx_teachers_email ON teachers(email);
CREATE INDEX idx_courses_code ON courses(course_code);
CREATE INDEX idx_assignments_teacher ON assignments(teacher_id);
CREATE INDEX idx_assignments_course ON assignments(course_id);
```

**注意：Fabric Warehouse 使用 T-SQL 語法（不是 MySQL）**

---

## Docker 部署

### 方式 1: 本地測試 Docker

```bash
# 1. 建立環境變數檔案
cp .env.fabric.example .env

# 2. 編輯 .env，填入您的 Fabric 資訊
# FABRIC_SERVER=xxx.datawarehouse.fabric.microsoft.com
# FABRIC_DATABASE=teacher_roster_warehouse

# 3. 建置 Docker 映像
cd backend
docker build -t teacher-roster-backend:fabric .

# 4. 執行容器（本地測試用）
docker run -p 3001:3001 \
  --env-file ../.env \
  teacher-roster-backend:fabric
```

### 方式 2: Docker Compose（包含前端）

建立 `docker-compose.fabric.yml`:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: teacher-roster-backend-fabric
    ports:
      - "3001:3001"
    env_file:
      - .env
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend-new
      dockerfile: Dockerfile
    container_name: teacher-roster-frontend
    ports:
      - "80:80"
    environment:
      - VITE_API_URL=http://backend:3001
    depends_on:
      - backend
    restart: unless-stopped
```

執行：
```bash
docker-compose -f docker-compose.fabric.yml up -d
```

---

## Azure Container Apps 部署

### 步驟 1: 建立 Azure Container Registry (ACR)

```bash
# 設定變數
RESOURCE_GROUP="teacher-roster-rg"
LOCATION="eastasia"
ACR_NAME="teacherrosteracr"  # 必須全域唯一

# 建立資源群組
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION

# 建立容器登錄
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic \
  --admin-enabled true

# 取得登入伺服器
ACR_SERVER=$(az acr show \
  --name $ACR_NAME \
  --query loginServer \
  --output tsv)

echo "ACR Server: $ACR_SERVER"
```

### 步驟 2: 建置並推送 Docker 映像

```bash
# 登入 ACR
az acr login --name $ACR_NAME

# 建置並推送後端映像
cd backend
docker build -t $ACR_SERVER/teacher-roster-backend:latest .
docker push $ACR_SERVER/teacher-roster-backend:latest

# 建置並推送前端映像
cd ../frontend-new
docker build -t $ACR_SERVER/teacher-roster-frontend:latest .
docker push $ACR_SERVER/teacher-roster-frontend:latest
```

### 步驟 3: 建立 Container Apps Environment

```bash
# 建立 Container Apps 環境
az containerapp env create \
  --name teacher-roster-env \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION
```

### 步驟 4: 設定 Managed Identity

```bash
# 建立 User Assigned Managed Identity
az identity create \
  --name teacher-roster-identity \
  --resource-group $RESOURCE_GROUP

# 取得 Identity ID 和 Client ID
IDENTITY_ID=$(az identity show \
  --name teacher-roster-identity \
  --resource-group $RESOURCE_GROUP \
  --query id \
  --output tsv)

IDENTITY_CLIENT_ID=$(az identity show \
  --name teacher-roster-identity \
  --resource-group $RESOURCE_GROUP \
  --query clientId \
  --output tsv)

echo "Identity Client ID: $IDENTITY_CLIENT_ID"
```

### 步驟 5: 授予 Fabric Warehouse 權限

在 **Fabric Portal** 中：

1. 進入您的 Warehouse
2. 點擊「管理權限」
3. 新增成員：搜尋 `teacher-roster-identity`
4. 授予角色：**Viewer** 或 **Contributor**

### 步驟 6: 部署後端 Container App

```bash
# 取得 ACR 憑證
ACR_USERNAME=$(az acr credential show \
  --name $ACR_NAME \
  --query username \
  --output tsv)

ACR_PASSWORD=$(az acr credential show \
  --name $ACR_NAME \
  --query passwords[0].value \
  --output tsv)

# 部署後端
az containerapp create \
  --name teacher-roster-backend \
  --resource-group $RESOURCE_GROUP \
  --environment teacher-roster-env \
  --image $ACR_SERVER/teacher-roster-backend:latest \
  --registry-server $ACR_SERVER \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --target-port 3001 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 3 \
  --cpu 0.5 \
  --memory 1Gi \
  --user-assigned $IDENTITY_ID \
  --env-vars \
    NODE_ENV=production \
    PORT=3001 \
    FABRIC_SERVER=your-workspace.datawarehouse.fabric.microsoft.com \
    FABRIC_DATABASE=teacher_roster_warehouse \
    FABRIC_AUTH_TYPE=azure-active-directory-default \
    AZURE_CLIENT_ID=$IDENTITY_CLIENT_ID \
    JWT_SECRET=your-jwt-secret \
    CORS_ORIGIN=https://your-frontend.azurestaticapps.net

# 取得後端 URL
BACKEND_URL=$(az containerapp show \
  --name teacher-roster-backend \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn \
  --output tsv)

echo "後端 API URL: https://$BACKEND_URL"
```

### 步驟 7: 部署前端（使用 Azure Static Web Apps）

```bash
# 建立 Static Web App
az staticwebapp create \
  --name teacher-roster-frontend \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --source https://github.com/your-org/teacher-roster \
  --branch main \
  --app-location "/frontend-new" \
  --api-location "" \
  --output-location "dist"

# 設定後端 API URL
az staticwebapp appsettings set \
  --name teacher-roster-frontend \
  --setting-names VITE_API_URL=https://$BACKEND_URL
```

---

## 測試部署

### 1. 測試後端連線

```bash
# 健康檢查
curl https://$BACKEND_URL/health

# 測試 API
curl https://$BACKEND_URL/api/teachers
```

### 2. 查看日誌

```bash
# Container App 日誌
az containerapp logs show \
  --name teacher-roster-backend \
  --resource-group $RESOURCE_GROUP \
  --follow
```

---

## 常見問題

### Q1: Docker 是必要的嗎？

**A:** 使用 Azure Container Apps 時，**是的，需要 Docker**。但有以下替代方案：

| 部署方式 | Docker | 說明 |
|---------|--------|------|
| **Azure Container Apps** | ✅ 需要 | 推薦！自動擴展 + 成本低 |
| **Azure App Service** | ❌ 可選 | 可直接部署 Node.js 程式碼 |
| **Azure Functions** | ❌ 不需要 | Serverless，按需求計費 |

### Q2: Lakehouse 還是 Warehouse？

**A:** 對於這個教師管理系統，建議用 **Warehouse**：

- ✅ 所有資料都是結構化的
- ✅ 只需要 SQL 查詢
- ✅ 效能更好
- ✅ 成本更低

只有在需要處理非結構化資料（如圖片、PDF）時才考慮 Lakehouse。

### Q3: 如何本地開發？

**方式 1: 使用 Azure CLI 認證**
```bash
# 登入 Azure
az login

# 設定環境變數
export FABRIC_SERVER=xxx.datawarehouse.fabric.microsoft.com
export FABRIC_DATABASE=teacher_roster_warehouse
export FABRIC_AUTH_TYPE=azure-active-directory-default

# 執行開發伺服器
npm run dev
```

**方式 2: 使用 Service Principal**
```bash
# 建立 Service Principal
az ad sp create-for-rbac --name teacher-roster-dev

# 在 .env 中設定
FABRIC_AUTH_TYPE=azure-active-directory-service-principal-secret
FABRIC_CLIENT_ID=xxx
FABRIC_CLIENT_SECRET=xxx
FABRIC_TENANT_ID=xxx
```

### Q4: 成本估算？

**小型生產環境（每月估算）：**

| 服務 | 規格 | 費用 (TWD) |
|-----|------|-----------|
| Fabric Warehouse | F64 Capacity | ~30,000 |
| Container Apps | 0.5 vCPU, 1GB RAM | ~1,500 |
| Static Web Apps | 免費層 | 0 |
| **總計** | | **~31,500/月** |

**節省成本技巧：**
- 開發環境：下班後關閉 Fabric Capacity
- 使用 Fabric Trial（60 天免費）
- Container Apps 設定自動縮放到 0

### Q5: 如何遷移現有資料？

```bash
# 1. 從 MySQL 匯出
mysqldump -u root -p teacher_roster > data.sql

# 2. 轉換為 T-SQL 格式（需要手動調整）
# - AUTO_INCREMENT → IDENTITY(1,1)
# - VARCHAR → NVARCHAR
# - DATETIME → DATETIME2

# 3. 匯入到 Fabric Warehouse
# 在 Fabric Portal 中執行轉換後的 SQL
```

---

## 監控與維護

### 啟用 Application Insights

```bash
# 建立 App Insights
az monitor app-insights component create \
  --app teacher-roster-insights \
  --location $LOCATION \
  --resource-group $RESOURCE_GROUP

# 取得連線字串
APPINSIGHTS_CONNECTION=$(az monitor app-insights component show \
  --app teacher-roster-insights \
  --resource-group $RESOURCE_GROUP \
  --query connectionString \
  --output tsv)

# 更新 Container App
az containerapp update \
  --name teacher-roster-backend \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars \
    APPLICATIONINSIGHTS_CONNECTION_STRING=$APPINSIGHTS_CONNECTION
```

---

## 下一步

1. ✅ 建立 Fabric Warehouse
2. ✅ 設定 Managed Identity
3. ✅ 本地測試 Docker
4. ✅ 部署到 Azure Container Apps
5. ✅ 設定監控和警示
6. ✅ 建立 CI/CD Pipeline

---

## 相關資源

- [Microsoft Fabric 文件](https://learn.microsoft.com/fabric/)
- [Azure Container Apps 文件](https://learn.microsoft.com/azure/container-apps/)
- [mssql Node.js 驅動](https://www.npmjs.com/package/mssql)

---

**有問題嗎？** 請查看 [疑難排解指南](./TROUBLESHOOTING.md) 或開 Issue！
