/**
 * Azure AD 設定檔
 * 部署時請填入正確的值
 */
window.AZURE_CONFIG = {
  clientId: '',       // Azure AD App Registration 的 Client ID (同 FABRIC_CLIENT_ID)
  tenantId: '',       // Azure AD Tenant ID (同 FABRIC_TENANT_ID)
  redirectUri: '',    // 登入後導回的 URI，例如 https://yourapp.github.io/
  apiBaseUrl: ''      // Azure Function 的 API URL，例如 https://your-func.azurewebsites.net
};
