# 🛠️ 實用腳本工具

本目錄包含各種實用的管理腳本，幫助您更輕鬆地管理資料庫和環境。

---

## 📋 腳本列表

### 1. 🔄 環境切換工具

**檔案：** `switch-environment.sh`

**用途：** 快速在本地開發環境和 Azure 生產環境之間切換

**使用方法：**
```bash
# 互動式選單
./scripts/switch-environment.sh

# 直接切換到本地環境
./scripts/switch-environment.sh local

# 直接切換到 Azure 環境
./scripts/switch-environment.sh azure
```

**功能：**
- ✅ 自動備份當前 .env
- ✅ 載入對應環境設定
- ✅ 測試資料庫連線
- ✅ 顯示下一步操作建議
- ✅ 提供還原命令

---

### 2. 💾 資料庫備份工具

**檔案：** `backup-database.sh`

**用途：** 自動備份資料庫（支援本地和 Azure）

**使用方法：**
```bash
# 使用當前 .env 設定備份
./scripts/backup-database.sh

# 備份本地資料庫
./scripts/backup-database.sh local

# 備份 Azure 資料庫
./scripts/backup-database.sh azure
```

**功能：**
- ✅ 自動壓縮備份檔案
- ✅ 驗證備份完整性
- ✅ 自動清理舊備份（保留最新 30 個）
- ✅ 支援 SSL 連線（Azure）
- ✅ 包含觸發器、事件、預存程序

**備份位置：** `./backups/`

---

### 3. 🔙 資料庫還原工具

**檔案：** `restore-database.sh`

**用途：** 從備份檔案還原資料庫

**使用方法：**
```bash
# 還原到當前環境
./scripts/restore-database.sh backups/backup_20241106_120000.sql.gz

# 還原到 Azure 環境
./scripts/restore-database.sh backups/backup_latest.sql.gz azure

# 還原到本地環境
./scripts/restore-database.sh backups/backup_latest.sql.gz local
```

**功能：**
- ✅ 還原前自動建立安全備份
- ✅ 確認提示防止誤操作
- ✅ 支援壓縮和未壓縮檔案
- ✅ 還原後自動驗證
- ✅ 失敗時提供回復方法

---

## 🚀 快速開始

### 初次設定

1. **建立環境設定檔**
   ```bash
   # 本地環境
   cp .env.local.example .env.local
   # 編輯 .env.local 設定本地 MySQL

   # Azure 環境
   cp .env.azure.example .env.azure
   # 編輯 .env.azure 設定 Azure Database
   ```

2. **給腳本執行權限**
   ```bash
   chmod +x scripts/*.sh
   ```

3. **切換到想要的環境**
   ```bash
   ./scripts/switch-environment.sh local   # 或 azure
   ```

---

## 📖 使用場景

### 場景 1：從本地切換到 Azure

```bash
# 1. 先備份本地資料
./scripts/backup-database.sh local

# 2. 切換到 Azure 環境
./scripts/switch-environment.sh azure

# 3. 將本地資料還原到 Azure
./scripts/restore-database.sh backups/backup_latest.sql.gz azure
```

### 場景 2：從 Azure 同步資料到本地

```bash
# 1. 備份 Azure 資料
./scripts/backup-database.sh azure

# 2. 切換到本地環境
./scripts/switch-environment.sh local

# 3. 還原到本地
./scripts/restore-database.sh backups/backup_latest.sql.gz local
```

### 場景 3：定期備份（生產環境）

```bash
# 建立 cron job 每天凌晨 2 點備份
# 編輯 crontab: crontab -e
# 加入以下行：
0 2 * * * cd /path/to/teacher-roster && ./scripts/backup-database.sh azure
```

---

## ⚠️ 注意事項

### 安全性
- 🔒 **絕對不要**將 `.env.local` 或 `.env.azure` 提交到 Git
- 🔒 備份檔案包含敏感資料，請妥善保管
- 🔒 定期更換密碼和 JWT Secret

### 備份
- 💾 備份會自動保留最新 30 個
- 💾 建議定期將備份複製到其他位置
- 💾 重要操作前先手動備份

### 還原
- ⚠️ 還原會覆蓋現有資料庫
- ⚠️ 還原前會自動建立安全備份
- ⚠️ 確認操作時需要輸入 `YES`

---

## 🆘 故障排除

### 問題：腳本無法執行

```bash
# 解決：給予執行權限
chmod +x scripts/*.sh
```

### 問題：找不到 mysql 或 mysqldump 命令

```bash
# macOS 安裝
brew install mysql-client

# Ubuntu/Debian 安裝
sudo apt-get install mysql-client

# 或使用 Docker 執行
docker exec teacher-roster-mysql mysqldump ...
```

### 問題：Azure 連線失敗

1. 檢查防火牆規則是否包含您的 IP
2. 確認 SSL 憑證已下載
3. 驗證 DB_HOST 是否正確

### 問題：備份檔案太大

```bash
# 只備份結構不備份資料
mysqldump ... --no-data

# 排除特定資料表
mysqldump ... --ignore-table=teacher_roster.audit_logs
```

---

## 📚 相關文件

- [AZURE_SETUP.md](../AZURE_SETUP.md) - Azure 完整設定指南
- [SWITCH_TO_AZURE.md](../SWITCH_TO_AZURE.md) - 快速切換指南
- [CHECKLIST.md](../CHECKLIST.md) - 完整檢查清單

---

## 💡 進階用法

### 備份到遠端儲存

```bash
# 備份後上傳到 Azure Storage
BACKUP_FILE=$(./scripts/backup-database.sh azure)
az storage blob upload \
  --account-name mystorageaccount \
  --container-name backups \
  --name $(basename $BACKUP_FILE) \
  --file $BACKUP_FILE
```

### 自動化測試流程

```bash
#!/bin/bash
# 完整測試流程

# 1. 備份
./scripts/backup-database.sh

# 2. 測試連線
node test-azure-connection.js

# 3. 測試權限
node test-permissions.js

# 4. 啟動應用
docker-compose up -d

# 5. 執行 API 測試
npm test
```

---

**有問題嗎？** 查看主 README.md 或開啟 Issue！
