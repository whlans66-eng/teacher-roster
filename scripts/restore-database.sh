#!/bin/bash

###############################################################################
# 資料庫還原腳本
#
# 用途：從備份檔案還原資料庫
# 使用：./scripts/restore-database.sh <備份檔案> [環境名稱]
#
# 範例：
#   ./scripts/restore-database.sh backups/backup_20241106_120000.sql.gz
#   ./scripts/restore-database.sh backups/backup_latest.sql.gz azure
###############################################################################

set -e

# 顏色輸出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }

echo ""
echo "============================================================"
info "資料庫還原工具"
echo "============================================================"
echo ""

# 檢查參數
if [ -z "$1" ]; then
  error "請指定備份檔案！"
  echo ""
  echo "使用方法："
  echo "  $0 <備份檔案> [環境]"
  echo ""
  echo "範例："
  echo "  $0 backups/backup_20241106_120000.sql.gz"
  echo "  $0 backups/backup_latest.sql.gz azure"
  echo ""
  exit 1
fi

BACKUP_FILE="$1"

# 檢查備份檔案是否存在
if [ ! -f "$BACKUP_FILE" ]; then
  error "備份檔案不存在: $BACKUP_FILE"
  echo ""
  info "可用的備份檔案："
  ls -lht backups/*.sql.gz 2>/dev/null | head -n 10 || echo "  (無備份檔案)"
  exit 1
fi

# 載入環境變數
ENV_FILE=".env"
if [ ! -z "$2" ]; then
  if [ "$2" == "local" ]; then
    ENV_FILE=".env.local"
  elif [ "$2" == "azure" ]; then
    ENV_FILE=".env.azure"
  fi
fi

if [ ! -f "$ENV_FILE" ]; then
  error "環境變數檔案不存在: $ENV_FILE"
  exit 1
fi

info "使用環境變數檔案: $ENV_FILE"
source "$ENV_FILE"

# 檢查必要變數
if [ -z "$DB_HOST" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_NAME" ]; then
  error "缺少必要的資料庫環境變數！"
  exit 1
fi

info "還原資訊："
echo "  備份檔案: $BACKUP_FILE"
echo "  目標主機: $DB_HOST"
echo "  目標資料庫: $DB_NAME"
echo ""

# 確認操作
warning "⚠️  警告：此操作將覆蓋現有資料庫！"
read -p "確定要繼續嗎？(輸入 YES 確認): " CONFIRM

if [ "$CONFIRM" != "YES" ]; then
  error "操作已取消"
  exit 1
fi

# 構建 mysql 命令選項
MYSQL_OPTS=(
  "-h" "$DB_HOST"
  "-P" "${DB_PORT:-3306}"
  "-u" "$DB_USER"
  "-p$DB_PASSWORD"
)

# 如果是 Azure，加上 SSL 選項
if [[ "$DB_HOST" == *"azure.com"* ]] || [ "$DB_SSL_MODE" == "REQUIRED" ]; then
  MYSQL_OPTS+=("--ssl-mode=REQUIRED")
  info "檢測到 Azure 資料庫，將使用 SSL 連線"
fi

# 測試資料庫連線
info "測試資料庫連線..."
if mysql "${MYSQL_OPTS[@]}" -e "SELECT 1" 2>/dev/null; then
  success "資料庫連線成功"
else
  error "無法連線到資料庫！"
  exit 1
fi

# 備份當前資料庫（安全措施）
info "建立還原前備份（安全措施）..."
SAFETY_BACKUP="./backups/before_restore_$(date +%Y%m%d_%H%M%S).sql.gz"
mkdir -p ./backups
./scripts/backup-database.sh > /dev/null 2>&1 || warning "無法建立安全備份"

# 開始還原
info "開始還原資料庫..."
echo ""

# 判斷檔案是否為壓縮檔
if [[ "$BACKUP_FILE" == *.gz ]]; then
  info "解壓縮並還原..."
  if gunzip < "$BACKUP_FILE" | mysql "${MYSQL_OPTS[@]}" 2>&1; then
    success "還原完成！"
  else
    error "還原失敗！"
    warning "如需回復，請使用安全備份: $SAFETY_BACKUP"
    exit 1
  fi
else
  info "還原未壓縮的備份..."
  if mysql "${MYSQL_OPTS[@]}" < "$BACKUP_FILE" 2>&1; then
    success "還原完成！"
  else
    error "還原失敗！"
    warning "如需回復，請使用安全備份: $SAFETY_BACKUP"
    exit 1
  fi
fi

# 驗證還原
info "驗證資料庫..."
TABLE_COUNT=$(mysql "${MYSQL_OPTS[@]}" "$DB_NAME" -e "SHOW TABLES" 2>/dev/null | wc -l)
if [ "$TABLE_COUNT" -gt 1 ]; then
  success "資料庫驗證通過！找到 $((TABLE_COUNT - 1)) 個資料表"
else
  warning "資料庫驗證異常！請手動檢查"
fi

echo ""
echo "============================================================"
success "還原流程完成！"
echo "============================================================"
echo ""
info "安全備份位置: $SAFETY_BACKUP"
info "建議執行以下測試："
echo "  1. 測試資料庫連線: node test-azure-connection.js"
echo "  2. 測試權限系統: node test-permissions.js"
echo "  3. 啟動應用並測試 API"
echo ""
