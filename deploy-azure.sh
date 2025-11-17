#!/bin/bash
# =====================================================
# Azure Container Apps 自動化部署腳本
# =====================================================
# 使用方法：
# 1. 修改下方變數
# 2. chmod +x deploy-azure.sh
# 3. ./deploy-azure.sh
# =====================================================

set -e  # 遇到錯誤立即停止

# =====================================================
# 設定變數（請修改這些值）
# =====================================================
RESOURCE_GROUP="teacher-roster-rg"
LOCATION="eastasia"
ACR_NAME="teacherrosteracr"  # 必須全域唯一，只能小寫字母和數字
ENV_NAME="teacher-roster-env"
IDENTITY_NAME="teacher-roster-identity"
BACKEND_APP_NAME="teacher-roster-backend"

# Fabric 設定
FABRIC_SERVER="<YOUR_WORKSPACE>.datawarehouse.fabric.microsoft.com"
FABRIC_DATABASE="teacher_roster_warehouse"

# 安全性設定（建議使用 Key Vault，這裡僅示範）
JWT_SECRET=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 32)

# 前端網域（部署後需更新）
FRONTEND_URL="https://your-frontend.azurestaticapps.net"

# =====================================================
# 顏色輸出
# =====================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# =====================================================
# 檢查先決條件
# =====================================================
info "檢查先決條件..."

if ! command -v az &> /dev/null; then
    error "Azure CLI 未安裝，請先安裝：https://docs.microsoft.com/cli/azure/install-azure-cli"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    error "Docker 未安裝，請先安裝：https://docs.docker.com/get-docker/"
    exit 1
fi

success "先決條件檢查完成"

# =====================================================
# 登入 Azure
# =====================================================
info "檢查 Azure 登入狀態..."
if ! az account show &> /dev/null; then
    warn "需要登入 Azure"
    az login
fi
success "已登入 Azure"

# =====================================================
# 建立資源群組
# =====================================================
info "建立資源群組：$RESOURCE_GROUP"
az group create \
    --name $RESOURCE_GROUP \
    --location $LOCATION \
    --output none
success "資源群組已建立"

# =====================================================
# 建立 Container Registry (ACR)
# =====================================================
info "建立容器登錄：$ACR_NAME"
if ! az acr show --name $ACR_NAME --resource-group $RESOURCE_GROUP &> /dev/null; then
    az acr create \
        --resource-group $RESOURCE_GROUP \
        --name $ACR_NAME \
        --sku Basic \
        --admin-enabled true \
        --output none
    success "容器登錄已建立"
else
    warn "容器登錄已存在，跳過建立"
fi

# 取得 ACR 資訊
ACR_SERVER=$(az acr show --name $ACR_NAME --query loginServer --output tsv)
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query username --output tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query passwords[0].value --output tsv)

info "ACR Server: $ACR_SERVER"

# =====================================================
# 建置並推送 Docker 映像
# =====================================================
info "登入 ACR..."
echo $ACR_PASSWORD | docker login $ACR_SERVER -u $ACR_USERNAME --password-stdin

info "建置後端 Docker 映像..."
cd backend
docker build -t $ACR_SERVER/teacher-roster-backend:latest .
success "後端映像建置完成"

info "推送後端映像到 ACR..."
docker push $ACR_SERVER/teacher-roster-backend:latest
success "後端映像推送完成"

cd ..

# =====================================================
# 建立 Managed Identity
# =====================================================
info "建立 Managed Identity：$IDENTITY_NAME"
if ! az identity show --name $IDENTITY_NAME --resource-group $RESOURCE_GROUP &> /dev/null; then
    az identity create \
        --name $IDENTITY_NAME \
        --resource-group $RESOURCE_GROUP \
        --output none
    success "Managed Identity 已建立"
else
    warn "Managed Identity 已存在，跳過建立"
fi

# 取得 Identity 資訊
IDENTITY_ID=$(az identity show \
    --name $IDENTITY_NAME \
    --resource-group $RESOURCE_GROUP \
    --query id \
    --output tsv)

IDENTITY_CLIENT_ID=$(az identity show \
    --name $IDENTITY_NAME \
    --resource-group $RESOURCE_GROUP \
    --query clientId \
    --output tsv)

info "Managed Identity Client ID: $IDENTITY_CLIENT_ID"

# =====================================================
# 建立 Container Apps Environment
# =====================================================
info "建立 Container Apps 環境：$ENV_NAME"
if ! az containerapp env show --name $ENV_NAME --resource-group $RESOURCE_GROUP &> /dev/null; then
    az containerapp env create \
        --name $ENV_NAME \
        --resource-group $RESOURCE_GROUP \
        --location $LOCATION \
        --output none
    success "Container Apps 環境已建立"
else
    warn "Container Apps 環境已存在，跳過建立"
fi

# =====================================================
# 部署後端 Container App
# =====================================================
info "部署後端 Container App：$BACKEND_APP_NAME"

if az containerapp show --name $BACKEND_APP_NAME --resource-group $RESOURCE_GROUP &> /dev/null; then
    warn "Container App 已存在，執行更新..."
    az containerapp update \
        --name $BACKEND_APP_NAME \
        --resource-group $RESOURCE_GROUP \
        --image $ACR_SERVER/teacher-roster-backend:latest \
        --output none
else
    az containerapp create \
        --name $BACKEND_APP_NAME \
        --resource-group $RESOURCE_GROUP \
        --environment $ENV_NAME \
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
            FABRIC_SERVER=$FABRIC_SERVER \
            FABRIC_DATABASE=$FABRIC_DATABASE \
            FABRIC_AUTH_TYPE=azure-active-directory-default \
            AZURE_CLIENT_ID=$IDENTITY_CLIENT_ID \
            JWT_SECRET=$JWT_SECRET \
            JWT_EXPIRES_IN=7d \
            SESSION_SECRET=$SESSION_SECRET \
            CORS_ORIGIN=$FRONTEND_URL \
            LOG_LEVEL=info \
            LOG_DIR=/app/logs \
            UPLOAD_DIR=/app/uploads \
            MAX_FILE_SIZE=10485760 \
        --output none
fi

success "後端 Container App 部署完成"

# =====================================================
# 取得部署資訊
# =====================================================
BACKEND_FQDN=$(az containerapp show \
    --name $BACKEND_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --query properties.configuration.ingress.fqdn \
    --output tsv)

# =====================================================
# 顯示部署結果
# =====================================================
echo ""
echo "========================================"
success "部署完成！"
echo "========================================"
echo ""
echo "📦 資源資訊："
echo "   資源群組: $RESOURCE_GROUP"
echo "   容器登錄: $ACR_SERVER"
echo "   Identity: $IDENTITY_NAME"
echo ""
echo "🌐 應用程式 URL："
echo "   後端 API: https://$BACKEND_FQDN"
echo "   健康檢查: https://$BACKEND_FQDN/health"
echo ""
echo "🔑 安全資訊（請妥善保存）："
echo "   JWT Secret: $JWT_SECRET"
echo "   Session Secret: $SESSION_SECRET"
echo "   Managed Identity Client ID: $IDENTITY_CLIENT_ID"
echo ""
warn "下一步："
echo "   1. 在 Fabric Portal 中授予 Managed Identity 權限"
echo "   2. 測試後端 API：curl https://$BACKEND_FQDN/health"
echo "   3. 部署前端並設定 VITE_API_URL=https://$BACKEND_FQDN"
echo "   4. 更新 CORS_ORIGIN 為實際前端 URL"
echo ""
echo "📚 查看日誌："
echo "   az containerapp logs show \\"
echo "     --name $BACKEND_APP_NAME \\"
echo "     --resource-group $RESOURCE_GROUP \\"
echo "     --follow"
echo ""
echo "========================================"
