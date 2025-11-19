# 企業版 RBAC 方案（Azure AD + Docker + MySQL）

## ⚠️ 注意

此資料夾包含**企業版**的 RBAC 實作方案，適合需要以下功能的組織：

- ✅ Azure AD (Microsoft Entra ID) 單一登入
- ✅ 公司 Outlook 帳號整合
- ✅ Docker 容器化部署
- ✅ MySQL 資料庫
- ✅ Node.js + Express 後端

---

## 📋 方案比較

| 項目 | 簡化版 | 企業版（本方案） |
|------|--------|-----------------|
| 實施時間 | 3-4 小時 | 2-3 週 |
| 成本 | 免費 | 需要伺服器 |
| 複雜度 | 低 | 高 |
| 適用規模 | < 1000 人 | 任意規模 |

**💡 如果您不需要 Azure AD 和 Docker，請使用簡化版**：[RBAC-GOOGLE-APPS-SCRIPT.md](../RBAC-GOOGLE-APPS-SCRIPT.md)

---

## 📁 文檔清單

### 核心文檔

1. **[AZURE-AD-INTEGRATION.md](AZURE-AD-INTEGRATION.md)** - Azure AD 整合完整指南
   - Azure Portal 設定步驟
   - Node.js 後端實作（passport-azure-ad）
   - 前端 OAuth 流程
   - 角色自動分配邏輯
   - 資料庫結構調整
   - 部署清單

2. **[AZURE-AD-ARCHITECTURE.md](AZURE-AD-ARCHITECTURE.md)** - 視覺化架構圖
   - 9 個 Mermaid 圖表
   - 完整登入流程
   - 角色分配決策樹
   - 安全架構層次
   - 部署架構

---

## 🎯 適合誰使用？

### ✅ 適合以下情況：
- 公司已使用 Microsoft 365
- 需要員工用 Outlook 帳號登入
- 需要根據部門自動分配角色
- 有技術團隊支援
- 預算充足

### ❌ 不適合以下情況：
- 小型團隊（< 100 人）
- 沒有 Microsoft 365
- 預算有限
- 想快速上線
- 技術團隊有限

👉 **如果不適合，請使用**：[簡化版方案](../RBAC-GOOGLE-APPS-SCRIPT.md)

---

## 🚀 快速開始

### 前置需求
- Azure AD 訂閱（Microsoft 365）
- Docker 和 Docker Compose
- Node.js 18+
- MySQL 8.0

### 實施步驟

1. **Azure AD 設定**（1 天）
   - 在 Azure Portal 註冊應用程式
   - 設定 API 權限
   - 建立用戶端密碼

2. **後端開發**（1 週）
   - 安裝依賴套件
   - 實作 OAuth 認證
   - 設定角色映射
   - 更新資料庫

3. **前端開發**（3 天）
   - 建立 Azure AD 登入按鈕
   - 實作 OAuth 回調
   - 整合認證狀態

4. **測試與部署**（3 天）
   - 功能測試
   - 權限測試
   - 生產環境部署

**總時程**：約 2-3 週

---

## 📊 技術棧

### 前端
- HTML/CSS/JavaScript（靜態部署）
- GitHub Pages

### 後端
- Node.js + Express + TypeScript
- passport-azure-ad（Azure AD 整合）
- jsonwebtoken（JWT Token）
- MySQL2（資料庫驅動）

### 資料庫
- MySQL 8.0
- 13 個表格（包含 RBAC 相關表）

### 部署
- Docker + Docker Compose
- Nginx（反向代理）
- PM2（Process Manager）

### Azure 服務
- Azure AD (Microsoft Entra ID)
- Microsoft Graph API

---

## 🔒 安全特性

- ✅ Azure AD 企業級認證
- ✅ OAuth 2.0 / OpenID Connect
- ✅ 多重要素驗證（MFA）
- ✅ 條件式存取
- ✅ JWT Token（系統內部）
- ✅ bcrypt 密碼加密
- ✅ HTTPS 傳輸
- ✅ 完整審計日誌

---

## 💰 成本估算

### Azure AD
- 免費層：基本 SSO（適合小型組織）
- Premium P1：約 $6/用戶/月（MFA、條件式存取）
- Premium P2：約 $9/用戶/月（進階安全功能）

### 伺服器
- 小型部署：VPS $10-20/月
- 中型部署：VPS $50-100/月
- 大型部署：需專業評估

### 總計
- 最低成本：約 $10-30/月（小型組織）
- 典型成本：約 $100-200/月（中型組織）

---

## 📚 相關資源

### 官方文檔
- [Microsoft Entra ID](https://learn.microsoft.com/zh-tw/entra/identity/)
- [Microsoft Graph API](https://learn.microsoft.com/zh-tw/graph/)
- [OAuth 2.0 授權碼流程](https://learn.microsoft.com/zh-tw/entra/identity-platform/v2-oauth2-auth-code-flow)

### 程式庫
- [passport-azure-ad](https://github.com/AzureAD/passport-azure-ad)
- [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)

---

## ❓ 常見問題

### Q: 一定要用 Azure AD 嗎？
**A**: 此方案是專門為 Azure AD 設計的。如果不需要 Azure AD，請使用[簡化版方案](../RBAC-GOOGLE-APPS-SCRIPT.md)。

### Q: 可以不用 Docker 嗎？
**A**: 可以，但 Docker 讓部署更簡單。如果不想用 Docker，可以直接在伺服器上安裝 Node.js 和 MySQL。

### Q: 成本太高怎麼辦？
**A**: 考慮使用[簡化版方案](../RBAC-GOOGLE-APPS-SCRIPT.md)，完全免費且功能足夠。

### Q: 可以從簡化版升級到企業版嗎？
**A**: 可以，但需要資料遷移（Google Sheets → MySQL）和重新建立 Azure AD 帳號。

---

## 📞 需要協助？

1. 查看完整文檔：[AZURE-AD-INTEGRATION.md](AZURE-AD-INTEGRATION.md)
2. 查看架構圖：[AZURE-AD-ARCHITECTURE.md](AZURE-AD-ARCHITECTURE.md)
3. 比較兩種方案：[RBAC-方案比較.md](../RBAC-方案比較.md)

---

## 🔙 返回主文檔

- [簡化版方案](../RBAC-GOOGLE-APPS-SCRIPT.md)（推薦，3-4 小時完成）
- [方案比較](../RBAC-方案比較.md)
- [RBAC 基礎規劃](../RBAC-PLANNING.md)
