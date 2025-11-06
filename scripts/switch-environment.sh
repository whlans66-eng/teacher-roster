#!/bin/bash

###############################################################################
# 環境快速切換工具
#
# 用途：快速切換本地開發環境和 Azure 生產環境
# 使用：./scripts/switch-environment.sh [local|azure]
###############################################################################

set -e

# 顏色輸出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }
title() { echo -e "${CYAN}$1${NC}"; }

clear
echo ""
title "╔════════════════════════════════════════════════════════════╗"
title "║          🔄 環境快速切換工具                              ║"
title "╚════════════════════════════════════════════════════════════╝"
echo ""

# 檢查當前環境
CURRENT_ENV="unknown"
if [ -f ".env" ]; then
  if grep -q "DB_HOST=mysql" .env; then
    CURRENT_ENV="local"
  elif grep -q "azure.com" .env; then
    CURRENT_ENV="azure"
  fi
fi

info "當前環境: ${CURRENT_ENV^^}"
echo ""

# 如果沒有參數，顯示選單
if [ -z "$1" ]; then
  echo "請選擇要切換的環境："
  echo ""
  echo "  1) 🏠 本地開發環境 (Docker MySQL)"
  echo "  2) ☁️  Azure 生產環境 (Azure Database)"
  echo "  3) ❌ 取消"
  echo ""
  read -p "請輸入選項 (1-3): " choice

  case $choice in
    1) TARGET_ENV="local" ;;
    2) TARGET_ENV="azure" ;;
    3) echo "操作已取消"; exit 0 ;;
    *) error "無效的選項"; exit 1 ;;
  esac
else
  TARGET_ENV="$1"
fi

# 驗證目標環境
if [ "$TARGET_ENV" != "local" ] && [ "$TARGET_ENV" != "azure" ]; then
  error "無效的環境！請使用 'local' 或 'azure'"
  exit 1
fi

# 檢查是否需要切換
if [ "$CURRENT_ENV" == "$TARGET_ENV" ]; then
  warning "已經在 ${TARGET_ENV^^} 環境，無需切換"
  exit 0
fi

echo ""
info "準備切換到: ${TARGET_ENV^^} 環境"
echo ""

# 檢查環境設定檔是否存在
ENV_SOURCE=".env.$TARGET_ENV"
if [ ! -f "$ENV_SOURCE" ]; then
  error "環境設定檔不存在: $ENV_SOURCE"
  echo ""
  info "請先建立環境設定檔："
  if [ "$TARGET_ENV" == "local" ]; then
    echo "  cp .env.example .env.local"
    echo "  # 然後編輯 .env.local 設定本地 MySQL"
  else
    echo "  cp .env.example .env.azure"
    echo "  # 然後編輯 .env.azure 設定 Azure Database"
  fi
  exit 1
fi

# 備份當前 .env
if [ -f ".env" ]; then
  BACKUP_FILE=".env.backup.$(date +%Y%m%d_%H%M%S)"
  cp .env "$BACKUP_FILE"
  success "已備份當前環境設定: $BACKUP_FILE"
fi

# 切換環境
info "切換環境設定..."
cp "$ENV_SOURCE" .env
success "環境設定已更新"

# 載入新環境變數
source .env

# 顯示新環境資訊
echo ""
info "新環境資訊："
echo "  資料庫主機: $DB_HOST"
echo "  資料庫名稱: $DB_NAME"
echo "  資料庫用戶: $DB_USER"
echo "  Node 環境: ${NODE_ENV:-development}"

# 測試資料庫連線
echo ""
info "測試資料庫連線..."

if command -v node &> /dev/null; then
  if node test-azure-connection.js 2>&1 | grep -q "連線成功"; then
    success "資料庫連線測試通過！"
  else
    warning "資料庫連線測試失敗，請檢查設定"
  fi
else
  warning "未安裝 Node.js，跳過連線測試"
fi

# 重啟服務建議
echo ""
info "下一步操作建議："
if [ "$TARGET_ENV" == "local" ]; then
  echo "  1. 啟動本地 MySQL: docker-compose up -d"
  echo "  2. 啟動後端服務: cd backend && npm run dev"
elif [ "$TARGET_ENV" == "azure" ]; then
  echo "  1. 停止本地 MySQL: docker-compose down"
  echo "  2. 啟動後端服務: docker-compose -f docker-compose.azure.yml up -d"
  echo "  3. 查看日誌: docker-compose -f docker-compose.azure.yml logs -f"
fi

echo ""
title "╔════════════════════════════════════════════════════════════╗"
title "║          ✅ 環境切換完成！                                ║"
title "╚════════════════════════════════════════════════════════════╝"
echo ""

# 顯示還原命令
if [ -f "$BACKUP_FILE" ]; then
  info "如需還原原環境，執行："
  echo "  cp $BACKUP_FILE .env"
fi

echo ""
