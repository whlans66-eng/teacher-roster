# 🔄 從本地 MySQL 切換到 Azure Database 快速指南

## 📋 切換步驟總覽

```
本地 Docker MySQL  →  Azure Database for MySQL
     (5 個步驟, 約 30 分鐘)
```

---

## 步驟 1️⃣：在 Azure 建立 MySQL 資料庫 (10 分鐘)

### 使用 Azure Portal (圖形化介面)

1. 前往 https://portal.azure.com
2. 搜尋「Azure Database for MySQL」
3. 點選「建立」→ 選擇「彈性伺服器」
4. 填寫設定：

```
資源群組：建立新的 → teacher-roster-rg
伺服器名稱：teacher-roster-mysql
區域：East Asia (香港) 或 Southeast Asia (新加坡)
MySQL 版本：8.0
工作負載類型：開發環境 → Burstable, B1ms (1 vCore, 2 GiB)
系統管理員使用者名稱：roster_admin
密碼：[設定強密碼，記下來！]
```

5. 點選「網路」標籤：
   - 選擇「公用存取」
   - 勾選「允許從 Azure 內的任何 Azure 服務存取此伺服器」

6. 點選「檢閱 + 建立」→「建立」

7. 等待 5-10 分鐘部署完成

### 或使用 Azure CLI (命令列，更快)

```bash
# 登入 Azure
az login

# 建立資源群組
az group create \
  --name teacher-roster-rg \
  --location eastasia

# 建立 MySQL 伺服器
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
  --public-access 0.0.0.0-255.255.255.255

# 建立資料庫
az mysql flexible-server db create \
  --resource-group teacher-roster-rg \
  --server-name teacher-roster-mysql \
  --database-name teacher_roster
```

---

## 步驟 2️⃣：下載 SSL 憑證 (2 分鐘)

```bash
cd /home/user/teacher-roster/backend

# 下載 Azure MySQL SSL 憑證
curl -o azure-mysql-ca.pem \
  https://dl.cacerts.digicert.com/DigiCertGlobalRootCA.crt.pem

# 驗證檔案已下載
ls -lh azure-mysql-ca.pem
```

---

## 步驟 3️⃣：更新 .env 檔案 (3 分鐘)

編輯 `/home/user/teacher-roster/.env`：

```bash
# =====================================================
# 註解掉或刪除本地 MySQL 設定
# =====================================================
# DB_HOST=mysql
# DB_USER=roster_user
# DB_PASSWORD=DevPassword123!@#ChangeMeInProduction
# DB_ROOT_PASSWORD=RootPassword456!@#ChangeMeInProduction

# =====================================================
# 啟用 Azure Database 設定
# =====================================================
DB_HOST=teacher-roster-mysql.mysql.database.azure.com
DB_PORT=3306
DB_NAME=teacher_roster
DB_USER=roster_admin
DB_PASSWORD=YourStrongPassword123!@#

# SSL 連線（強烈建議）
DB_SSL_MODE=REQUIRED
DB_SSL_CA=/app/azure-mysql-ca.pem

# 其他設定保持不變
NODE_ENV=production
PORT=3001
JWT_SECRET=your_existing_jwt_secret_here
CORS_ORIGIN=https://your-frontend-domain.com
```

**⚠️ 重要：** `DB_HOST` 請換成您實際的 Azure 伺服器名稱！

---

## 步驟 4️⃣：遷移資料 (10 分鐘)

### 選項 A：從本地 MySQL 匯出並匯入（如果有現有資料）

```bash
# 1. 從本地 Docker MySQL 匯出
docker exec teacher-roster-mysql mysqldump \
  -u roster_user \
  -p'DevPassword123!@#ChangeMeInProduction' \
  --single-transaction \
  --routines \
  --triggers \
  teacher_roster > backup.sql

# 2. 匯入到 Azure
mysql -h teacher-roster-mysql.mysql.database.azure.com \
      -u roster_admin \
      -p \
      --ssl-mode=REQUIRED \
      teacher_roster < backup.sql

# 輸入密碼後等待匯入完成
```

### 選項 B：初始化新的資料庫（推薦給新專案）

```bash
# 1. 初始化資料庫結構
mysql -h teacher-roster-mysql.mysql.database.azure.com \
      -u roster_admin \
      -p \
      --ssl-mode=REQUIRED \
      teacher_roster < database/init/01_schema.sql

# 2. 匯入測試資料
mysql -h teacher-roster-mysql.mysql.database.azure.com \
      -u roster_admin \
      -p \
      --ssl-mode=REQUIRED \
      teacher_roster < database/init/02_seed_data.sql
```

---

## 步驟 5️⃣：測試連線並啟動應用 (5 分鐘)

### 測試 Azure 連線

```bash
# 執行連線測試腳本
node test-azure-connection.js
```

你應該會看到：

```
============================================================
🔵 Azure Database for MySQL 連線測試
============================================================

📋 連線設定:
   主機: teacher-roster-mysql.mysql.database.azure.com
   埠號: 3306
   用戶: roster_admin
   密碼: ********************
   資料庫: teacher_roster
   SSL: 已啟用

🔌 正在連線到 Azure MySQL...
✅ 連線成功！

📊 資料庫資訊:
   MySQL 版本: 8.0.21
   主機名稱: teacher-roster-mysql
   SSL 加密: 已啟用 (TLS_AES_256_GCM_SHA384)

============================================================
✅ Azure Database 連線測試通過！
============================================================
```

### 停止本地 MySQL 容器

```bash
# 停止並移除本地 MySQL 容器（保留資料備份）
docker-compose down

# 或者只停止 MySQL 容器
docker stop teacher-roster-mysql
```

### 使用 Azure 版本的 Docker Compose 啟動

```bash
# 使用 Azure 專用配置啟動（不包含 MySQL）
docker-compose -f docker-compose.azure.yml up -d

# 查看日誌
docker-compose -f docker-compose.azure.yml logs -f backend
```

你應該會看到：

```
✅ SSL 憑證已載入，將使用加密連線
✅ 資料庫連線成功 {
  host: 'teacher-roster-mysql.mysql.database.azure.com',
  database: 'teacher_roster',
  version: '8.0.21',
  hostname: 'teacher-roster-mysql',
  ssl: '已啟用'
}
```

### 測試 API

```bash
# 健康檢查
curl http://localhost:3001/health

# 登入測試
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "Admin123!@#"
  }'
```

---

## ✅ 完成檢查清單

確認以下所有項目都已完成：

- [ ] Azure MySQL 資料庫已建立並運行
- [ ] SSL 憑證已下載到 `backend/azure-mysql-ca.pem`
- [ ] `.env` 檔案已更新為 Azure 設定
- [ ] 資料已成功遷移到 Azure
- [ ] `test-azure-connection.js` 測試通過
- [ ] 本地 MySQL 容器已停止
- [ ] 應用程式使用 Azure 資料庫成功啟動
- [ ] API 測試正常回應

---

## 🔙 如何回退到本地 MySQL

如果需要回到本地 MySQL：

```bash
# 1. 恢復 .env 設定
DB_HOST=mysql
DB_USER=roster_user
DB_PASSWORD=DevPassword123!@#ChangeMeInProduction
# 註解掉 DB_SSL_MODE 和 DB_SSL_CA

# 2. 重新啟動本地 MySQL
docker-compose up -d

# 3. 如有需要，從備份恢復資料
docker exec -i teacher-roster-mysql mysql \
  -u roster_user \
  -p'DevPassword123!@#ChangeMeInProduction' \
  teacher_roster < backup.sql
```

---

## 📊 成本估算

**開發/測試環境 (Burstable B1ms):**
- 1 vCore, 2 GiB RAM, 32 GB 儲存
- 費用：約 NT$1,500-2,000/月
- 適合：開發測試、小型應用

**生產環境 (General Purpose D2ds_v4):**
- 2 vCore, 8 GiB RAM, 128 GB 儲存
- 費用：約 NT$5,000-7,000/月
- 適合：正式上線、中等流量

**節省成本技巧:**
1. 預留容量折扣：預付 1-3 年可省 40-65%
2. 開發環境在非工作時間自動關機
3. 定期檢查並調整規格

---

## 🆘 疑難排解

### 連線失敗：Connection timeout

**原因：** Azure 防火牆未允許您的 IP

**解決：**
```bash
# 取得你的 IP
curl ifconfig.me

# 加入防火牆規則
az mysql flexible-server firewall-rule create \
  --resource-group teacher-roster-rg \
  --name teacher-roster-mysql \
  --rule-name AllowMyIP \
  --start-ip-address YOUR_IP \
  --end-ip-address YOUR_IP
```

### SSL 錯誤：SSL connection error

**解決：**
```bash
# 重新下載憑證
cd backend
curl -o azure-mysql-ca.pem \
  https://dl.cacerts.digicert.com/DigiCertGlobalRootCA.crt.pem

# 確認憑證內容
openssl x509 -in azure-mysql-ca.pem -text -noout
```

### 資料庫不存在

**解決：**
```bash
# 手動建立資料庫
mysql -h teacher-roster-mysql.mysql.database.azure.com \
      -u roster_admin \
      -p \
      --ssl-mode=REQUIRED \
      -e "CREATE DATABASE IF NOT EXISTS teacher_roster CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 權限不足錯誤

**解決：** 確認使用的是 `roster_admin` 而不是一般用戶

---

## 📚 更多資源

- **完整 Azure 設定指南：** [AZURE_SETUP.md](./AZURE_SETUP.md)
- **Azure 官方文件：** https://docs.microsoft.com/azure/mysql/
- **定價計算機：** https://azure.microsoft.com/pricing/calculator/

---

## 🎉 恭喜！

您已成功從本地 Docker MySQL 遷移到 Azure Database for MySQL！

現在您可以享受：
- ✅ 99.99% 的高可用性
- ✅ 自動備份和還原
- ✅ 專業級的安全性
- ✅ 彈性的資源擴展
- ✅ 完整的監控和警示

**下一步建議：**
1. 設定 Azure Monitor 警示
2. 啟用進階威脅防護
3. 建立定期效能報告
4. 考慮使用 VNet 私有端點（生產環境）
