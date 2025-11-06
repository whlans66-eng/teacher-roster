#!/bin/bash

###############################################################################
# 資料庫備份腳本
#
# 用途：自動備份資料庫（支援本地和 Azure MySQL）
# 使用：./scripts/backup-database.sh [環境名稱]
#
# 範例：
#   ./scripts/backup-database.sh              # 使用 .env 設定
#   ./scripts/backup-database.sh local        # 備份本地資料庫
#   ./scripts/backup-database.sh azure        # 備份 Azure 資料庫
###############################################################################

set -e  # 遇到錯誤立即退出

# 顏色輸出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 輸出函數
info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }

echo ""
echo "============================================================"
info "資料庫備份工具"
echo "============================================================"
echo ""

# 載入環境變數
ENV_FILE=".env"
if [ ! -z "$1" ]; then
  if [ "$1" == "local" ]; then
    ENV_FILE=".env.local"
  elif [ "$1" == "azure" ]; then
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
  echo "  需要：DB_HOST, DB_USER, DB_PASSWORD, DB_NAME"
  exit 1
fi

# 建立備份目錄
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

# 生成備份檔名（包含時間戳）
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/backup_${DB_NAME}_${TIMESTAMP}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.gz"

info "備份資訊："
echo "  資料庫主機: $DB_HOST"
echo "  資料庫名稱: $DB_NAME"
echo "  備份檔案: $BACKUP_FILE"
echo ""

# 構建 mysqldump 命令
DUMP_CMD="mysqldump"
DUMP_OPTS=(
  "-h" "$DB_HOST"
  "-P" "${DB_PORT:-3306}"
  "-u" "$DB_USER"
  "-p$DB_PASSWORD"
  "--single-transaction"
  "--routines"
  "--triggers"
  "--events"
  "--add-drop-database"
  "--databases" "$DB_NAME"
)

# 如果是 Azure，加上 SSL 選項
if [[ "$DB_HOST" == *"azure.com"* ]] || [ "$DB_SSL_MODE" == "REQUIRED" ]; then
  DUMP_OPTS+=("--ssl-mode=REQUIRED")
  info "檢測到 Azure 資料庫，將使用 SSL 連線"
fi

# 執行備份
info "開始備份..."
if $DUMP_CMD "${DUMP_OPTS[@]}" > "$BACKUP_FILE" 2>/dev/null; then
  success "備份完成！"
else
  error "備份失敗！"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# 檢查備份檔案大小
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
info "備份檔案大小: $BACKUP_SIZE"

# 壓縮備份
info "壓縮備份檔案..."
if gzip -f "$BACKUP_FILE"; then
  success "壓縮完成！"
  COMPRESSED_SIZE=$(du -h "$COMPRESSED_FILE" | cut -f1)
  info "壓縮後大小: $COMPRESSED_SIZE"
else
  warning "壓縮失敗，保留未壓縮檔案"
  COMPRESSED_FILE="$BACKUP_FILE"
fi

# 驗證備份
info "驗證備份完整性..."
if [ -f "$COMPRESSED_FILE" ] && [ -s "$COMPRESSED_FILE" ]; then
  success "備份驗證通過！"
else
  error "備份檔案無效！"
  exit 1
fi

# 列出最近的備份
echo ""
info "最近的備份檔案（保留最新 10 個）："
ls -lht "$BACKUP_DIR" | head -n 11

# 清理舊備份（保留最新 30 個）
info "清理舊備份（保留最新 30 個）..."
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt 30 ]; then
  OLD_BACKUPS=$(ls -1t "$BACKUP_DIR"/backup_*.sql.gz | tail -n +31)
  echo "$OLD_BACKUPS" | xargs rm -f
  DELETED_COUNT=$(echo "$OLD_BACKUPS" | wc -l)
  success "已刪除 $DELETED_COUNT 個舊備份"
fi

echo ""
echo "============================================================"
success "備份流程完成！"
echo "============================================================"
echo ""
info "備份檔案位置: $COMPRESSED_FILE"
info "還原命令："
echo "  gunzip < $COMPRESSED_FILE | mysql -h \$DB_HOST -u \$DB_USER -p \$DB_NAME"
echo ""

# 返回備份檔案路徑（供其他腳本使用）
echo "$COMPRESSED_FILE"
