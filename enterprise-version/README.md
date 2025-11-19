# 企業版方案（Azure AD + Docker + MySQL）

## ⚠️ 注意

此資料夾包含**企業版**的實作檔案，適合需要以下功能的組織：
- Azure AD (Microsoft Entra ID) 單一登入
- Docker 容器化部署
- Node.js + Express 後端
- MySQL 資料庫

## 📁 資料夾內容

### 後端（Node.js + Express）
- **`backend/`** - Node.js 後端原始碼
  - TypeScript 專案
  - passport-azure-ad 整合
  - JWT 認證
  - MySQL 資料庫連接

### 資料庫（MySQL）
- **`database/`** - MySQL 資料庫設定
  - Schema 定義（13 個表）
  - 種子資料（測試帳號、角色、權限）
  - 遷移腳本

### Docker 部署
- **`docker-compose.yml`** - Docker 部署設定
- **`docker-compose.azure.yml`** - Azure 整合版 Docker 設定

### 環境變數範例
- **`.env.azure.example`** - Azure AD 環境變數範例

### 文檔
- **`AZURE_SETUP.md`** - Azure AD 設定步驟
- **`SWITCH_TO_AZURE.md`** - 從簡化版切換到企業版的指南

### 測試腳本
- **`test-azure-connection.js`** - Azure AD 連線測試
- **`test-permissions.js`** - 權限系統測試

---

## 💡 您可能不需要這個資料夾

如果您使用的是 **GitHub Pages + Google Apps Script** 架構，您**不需要**這個資料夾的內容。

### 請使用簡化版方案：
📖 [RBAC-GOOGLE-APPS-SCRIPT.md](docs/RBAC-GOOGLE-APPS-SCRIPT.md)

---

## 🏢 何時需要企業版？

只有在以下情況才需要使用此資料夾的內容：

- ✅ 公司已使用 Microsoft 365 / Outlook
- ✅ 需要員工用公司帳號登入（Azure AD SSO）
- ✅ 需要根據部門自動分配角色
- ✅ 有專業的技術團隊支援
- ✅ 預算充足（需要伺服器成本）

---

## 📚 企業版完整文檔

如果您確定需要企業版，請參考：

- [企業版方案說明](docs/enterprise-solution/README.md)
- [Azure AD 整合指南](docs/enterprise-solution/AZURE-AD-INTEGRATION.md)
- [架構圖與流程圖](docs/enterprise-solution/AZURE-AD-ARCHITECTURE.md)
- [方案比較](docs/RBAC-方案比較.md)

---

## 🚀 快速開始（企業版）

### 前置需求
- Docker 和 Docker Compose
- Node.js 18+
- MySQL 8.0
- Azure AD 訂閱

### 部署步驟

1. **設定環境變數**
   ```bash
   cp .env.azure.example .env
   # 編輯 .env，填入 Azure AD 設定
   ```

2. **啟動 Docker**
   ```bash
   docker-compose up -d
   ```

3. **初始化資料庫**
   ```bash
   docker-compose exec backend npm run migrate
   docker-compose exec backend npm run seed
   ```

4. **測試連線**
   ```bash
   node test-azure-connection.js
   ```

---

## 💰 成本估算（企業版）

### Azure AD
- 免費層：基本 SSO
- Premium P1：約 $6/用戶/月
- Premium P2：約 $9/用戶/月

### 伺服器
- 小型：VPS $10-20/月
- 中型：VPS $50-100/月

### 總計
- 最低成本：約 $10-30/月
- 典型成本：約 $100-200/月

---

## 🔙 返回簡化版

如果您不需要企業版的複雜功能，建議使用免費的簡化版方案：

👉 [返回主專案](../README.md)
👉 [查看簡化版規劃](../docs/RBAC-GOOGLE-APPS-SCRIPT.md)

---

**總結**：除非您明確需要 Azure AD 和企業級功能，否則請忽略此資料夾，使用簡化版方案即可！
