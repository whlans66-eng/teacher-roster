# 🔵 Azure Database for MySQL 部署指南

## 📋 目錄

- [為什麼選擇 Azure Database for MySQL](#為什麼選擇-azure-database-for-mysql)
- [Azure 建立資料庫](#azure-建立資料庫)
- [連線設定](#連線設定)
- [資料遷移](#資料遷移)
- [安全性設定](#安全性設定)
- [成本估算](#成本估算)

---

## 為什麼選擇 Azure Database for MySQL

與本地 Docker MySQL 相比的優勢：

| 項目 | 本地 Docker | Azure Database |
|------|------------|----------------|
| **可用性** | 單點故障 | 99.99% SLA |
| **備份** | 手動 | 自動每日備份 |
| **擴展性** | 手動調整容器 | 彈性調整規格 |
| **監控** | 需自建 | 內建 Azure Monitor |
| **安全性** | 需自行維護 | SSL、防火牆、威脅偵測 |
| **成本** | 伺服器電費 + 維護時間 | 按需付費 |

---

## Azure 建立資料庫

### 方法一：Azure Portal (圖形化介面)

1. **登入 Azure Portal**
   - https://portal.azure.com

2. **建立資源**
   - 搜尋「Azure Database for MySQL」
   - 選擇「Azure Database for MySQL 彈性伺服器」

3. **基本設定**
   ```
   資源群組：teacher-roster-rg (新建)
   伺服器名稱：teacher-roster-mysql
   區域：East Asia (香港) 或 Southeast Asia (新加坡)
   MySQL 版本：8.0
   計算+儲存：
     - 開發測試：Burstable B1ms (1 vCore, 2GiB RAM)
     - 生產環境：General Purpose D2ds_v4 (2 vCore, 8GiB RAM)
   ```

4. **驗證和建立**
   - 系統管理員帳號：`roster_admin`
   - 密碼：設定強密碼（記下來！）

### 方法二：Azure CLI (命令列)

```bash
# 1. 登入 Azure
az login

# 2. 建立資源群組
az group create \
  --name teacher-roster-rg \
  --location eastasia

# 3. 建立 MySQL 彈性伺服器
az mysql flexible-server create \
  --resource-group teacher-roster-rg \
  --name teacher-roster-mysql \
  --location eastasia \
  --admin-user roster_admin \
  --admin-password 'YourStrongPassword123!@#' \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --version 8.0.21 \
  --storage-size 32 \
  --backup-retention 7 \
  --public-access 0.0.0.0

# 4. 建立資料庫
az mysql flexible-server db create \
  --resource-group teacher-roster-rg \
  --server-name teacher-roster-mysql \
  --database-name teacher_roster
```

---

## 連線設定

### 1. 取得連線資訊

從 Azure Portal 取得：
```
主機名稱：teacher-roster-mysql.mysql.database.azure.com
埠號：3306
使用者名稱：roster_admin
密碼：[您設定的密碼]
資料庫：teacher_roster
```

### 2. 設定防火牆規則

**允許您的開發機器連線：**
```bash
az mysql flexible-server firewall-rule create \
  --resource-group teacher-roster-rg \
  --name teacher-roster-mysql \
  --rule-name AllowMyIP \
  --start-ip-address YOUR_IP \
  --end-ip-address YOUR_IP
```

**允許 Azure 服務連線：**
```bash
az mysql flexible-server firewall-rule create \
  --resource-group teacher-roster-rg \
  --name teacher-roster-mysql \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

### 3. 啟用 SSL 連線（強烈建議）

下載 SSL 憑證：
```bash
curl -o /home/user/teacher-roster/backend/azure-mysql-ca.pem \
  https://dl.cacerts.digicert.com/DigiCertGlobalRootCA.crt.pem
```

### 4. 更新 .env 檔案

```bash
# Azure Database for MySQL 設定
DB_HOST=teacher-roster-mysql.mysql.database.azure.com
DB_PORT=3306
DB_NAME=teacher_roster
DB_USER=roster_admin
DB_PASSWORD=YourStrongPassword123!@#

# SSL 連線
DB_SSL_CA=/app/azure-mysql-ca.pem
DB_SSL_MODE=REQUIRED

# 其他設定保持不變
NODE_ENV=production
PORT=3001
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://your-frontend-domain.com
```

---

## 資料遷移

### 方法一：初始化新資料庫（推薦給新專案）

```bash
# 1. 連線到 Azure MySQL
mysql -h teacher-roster-mysql.mysql.database.azure.com \
      -u roster_admin \
      -p \
      --ssl-mode=REQUIRED \
      teacher_roster

# 2. 執行初始化 SQL
mysql -h teacher-roster-mysql.mysql.database.azure.com \
      -u roster_admin \
      -p \
      --ssl-mode=REQUIRED \
      teacher_roster < database/init/01_schema.sql

mysql -h teacher-roster-mysql.mysql.database.azure.com \
      -u roster_admin \
      -p \
      --ssl-mode=REQUIRED \
      teacher_roster < database/init/02_seed_data.sql
```

### 方法二：從本地 MySQL 匯出並匯入

```bash
# 1. 從本地 Docker MySQL 匯出資料
docker exec teacher-roster-mysql mysqldump \
  -u roster_user \
  -p'DevPassword123!@#ChangeMeInProduction' \
  teacher_roster > backup.sql

# 2. 匯入到 Azure
mysql -h teacher-roster-mysql.mysql.database.azure.com \
      -u roster_admin \
      -p \
      --ssl-mode=REQUIRED \
      teacher_roster < backup.sql
```

### 方法三：使用 Azure Database Migration Service

適合大型資料庫的線上遷移（無停機時間）：
- https://azure.microsoft.com/services/database-migration/

---

## 安全性設定

### 1. 網路安全

**使用 VNet 整合（生產環境推薦）：**
```bash
# 建立虛擬網路
az network vnet create \
  --resource-group teacher-roster-rg \
  --name teacher-roster-vnet \
  --address-prefix 10.0.0.0/16 \
  --subnet-name mysql-subnet \
  --subnet-prefix 10.0.1.0/24

# 啟用私人端點
az mysql flexible-server update \
  --resource-group teacher-roster-rg \
  --name teacher-roster-mysql \
  --vnet teacher-roster-vnet \
  --subnet mysql-subnet
```

### 2. 進階威脅防護

在 Azure Portal 啟用：
- Azure Defender for MySQL
- 可偵測 SQL Injection、異常存取等

### 3. 稽核日誌

```bash
# 啟用稽核日誌
az mysql flexible-server parameter set \
  --resource-group teacher-roster-rg \
  --server-name teacher-roster-mysql \
  --name audit_log_enabled \
  --value ON
```

---

## 成本估算

### 開發/測試環境

**Burstable B1ms**
- 1 vCore, 2 GiB RAM
- 32 GB 儲存空間
- 費用：約 NT$1,500-2,000/月

### 生產環境（小型）

**General Purpose D2ds_v4**
- 2 vCore, 8 GiB RAM
- 128 GB 儲存空間
- 自動備份 7 天
- 費用：約 NT$5,000-7,000/月

### 節省成本技巧

1. **保留容量定價**：預付 1-3 年可省 40-65%
2. **自動關機**：開發環境下班時關閉
3. **適當調整規格**：監控使用率，避免過度配置

---

## 更新應用程式

### 1. 修改 database.ts 支援 SSL

已經自動相容！只需更新環境變數即可。

如需自訂 SSL 設定：

```typescript
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL_MODE === 'REQUIRED' ? {
    ca: fs.readFileSync(process.env.DB_SSL_CA!),
    rejectUnauthorized: true
  } : undefined,
  // ... 其他設定
};
```

### 2. 更新 Docker Compose

移除本地 MySQL 容器：

```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    env_file:
      - .env
    volumes:
      - ./backend/src:/app/src
      - ./logs:/app/logs
    restart: unless-stopped
    # 不再需要 depends_on mysql

  # 移除 mysql 服務
```

---

## 測試連線

### 使用 Node.js 測試腳本

```bash
cd backend
npm run dev
# 查看日誌是否顯示 "✅ 資料庫連線成功"
```

### 使用 MySQL CLI 測試

```bash
mysql -h teacher-roster-mysql.mysql.database.azure.com \
      -u roster_admin \
      -p \
      --ssl-mode=REQUIRED \
      -e "SELECT VERSION();"
```

---

## 監控和維護

### 1. Azure Portal 監控

- CPU 使用率
- 記憶體使用率
- 連線數
- 查詢效能

### 2. 設定警示

```bash
# 當 CPU > 80% 時發送警示
az monitor metrics alert create \
  --name HighCPU \
  --resource-group teacher-roster-rg \
  --scopes /subscriptions/.../teacher-roster-mysql \
  --condition "avg Percentage CPU > 80" \
  --window-size 5m \
  --evaluation-frequency 1m
```

### 3. 自動備份

Azure 自動備份設定：
- 預設每日自動備份
- 保留 7-35 天
- 可手動觸發備份
- 可還原到任意時間點（PITR）

---

## 疑難排解

### 連線逾時

1. 檢查防火牆規則是否包含您的 IP
2. 確認 SSL 憑證正確
3. 測試網路連線：`telnet teacher-roster-mysql.mysql.database.azure.com 3306`

### SSL 錯誤

```bash
# 重新下載憑證
curl -o azure-mysql-ca.pem \
  https://dl.cacerts.digicert.com/DigiCertGlobalRootCA.crt.pem
```

### 效能問題

1. 檢查慢查詢日誌
2. 啟用 Query Performance Insight
3. 考慮升級到更高規格

---

## 下一步

1. ✅ 在 Azure 建立 MySQL 資料庫
2. ✅ 更新 .env 檔案
3. ✅ 執行資料遷移
4. ✅ 測試應用程式連線
5. ✅ 移除 Docker Compose 中的 MySQL
6. ✅ 設定監控和警示
7. ✅ 部署應用程式到 Azure App Service 或容器

---

## 相關資源

- [Azure Database for MySQL 文件](https://docs.microsoft.com/azure/mysql/)
- [定價計算機](https://azure.microsoft.com/pricing/calculator/)
- [最佳實踐](https://docs.microsoft.com/azure/mysql/flexible-server/concepts-best-practices)

---

**有問題嗎？** 歡迎開 Issue！
