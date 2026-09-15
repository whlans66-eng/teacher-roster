/**
 * config.js — 全站唯一的設定入口
 *
 * 對應舊檔：js/azureConfig.js（空白模板）+ js/api.js 開頭的 API_CONFIG
 *
 * ── 為什麼有兩組後端設定 ───────────────────────────────────────────────
 * 這個專案正在從 Google Apps Script 搬到公司內網。兩邊的驗證方式不相容：
 *
 *   GAS  ：帳號密碼登入 → 後端在 CacheService 種一個 sess_<token>，
 *          之後每個請求把 token 當 query param 帶上。
 *          （backend-api.gs:86 寫入、:90-102 驗證）
 *   REST ：Microsoft Entra ID 登入 → 前端拿 JWT → Authorization: Bearer
 *          後端用 JWKS 公鑰驗簽。（backend/sys_tokenValidator.js）
 *
 * GAS 完全看不懂 Entra 的 JWT，所以「用 MSAL 打 GAS」是行不通的。
 * 因此 backend 這個開關同時決定「傳輸格式」與「驗證方式」，
 * 而 apiClient / authService 以上的所有程式碼對此完全無感。
 *
 * ── 內網上線時要做的事 ─────────────────────────────────────────────────
 *   1. backend 改成 'rest'
 *   2. 填好 rest.apiBaseUrl 與 msal 四個值（見下方註解）
 *   3. 刪掉 services/gasAdapter.js 與本檔的 gas 區塊
 * 除此之外不需要動任何一支檔案。
 */

export const CONFIG = {
  /** 'gas' = 目前的 Google Apps Script；'rest' = 內網 Azure Functions */
  backend: 'gas',

  /** ── 舊後端（Google Apps Script）───────────────────────────────── */
  gas: {
    // 原值取自 js/api.js:9
    baseUrl:
      'https://script.google.com/macros/s/AKfycbyXzoXqd2NOP0u0GwgszCi2IuqB9vg8_4P_XvCO7jTGGjsnftiQWPP68wOPx0qk7RoVLA/exec'
  },

  /** ── 新後端（內網 Azure Functions，程式碼已在本 repo 的 backend/）──
   *  路由已經存在且固定：
   *    GET    /ping                  backend/sys_ping.js:22
   *    GET    /permissions/check     backend/permissionsApi.js:20
   *    GET    /permissions           backend/permissionsApi.js:80
   *    POST   /permissions
   *    POST   /permissions/user      backend/permissionsApi.js:168
   *    DELETE /permissions/user
   *  教師／課程／排程的端點尚未實作，需由後端同仁補上。
   */
  rest: {
    // 例如 https://func-xxx.azurewebsites.net/api
    apiBaseUrl: ''
  },

  /** ── Microsoft Entra ID（backend 為 'rest' 時才會用到）────────────
   *  這四個值原本應填在 js/azureConfig.js，目前全是空字串。
   *  redirectUri 必須與 Azure App Registration 裡登記的完全一致
   *  （含結尾斜線與子目錄），否則登入會被拒絕。
   */
  msal: {
    clientId: '',
    authority: '', // https://login.microsoftonline.com/<tenantId>
    redirectUri: '', // 例如 https://intranet.example.com/maritrain/
    scopes: ['User.Read']
  },

  /** 一般請求逾時（毫秒） */
  timeout: 30000,

  /** AI 問答逾時：需抓取外部網址時遠超過一般請求（原 js/api.js 的長逾時路徑） */
  aiTimeout: 180000,

  /** 上傳限制 */
  upload: {
    maxBytes: 5 * 1024 * 1024,
    allowedMime: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  },

  /** 開啟後會在 console 印出每一次請求，僅供開發用 */
  debug: false
};

/** 本機開發模式：資料走 localStorage，不打後端，也不需要登入 */
export const isLocal =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.protocol === 'file:';

/** 目前生效的 API 位址，由 backend 開關決定 */
export const apiBaseUrl = CONFIG.backend === 'gas' ? CONFIG.gas.baseUrl : CONFIG.rest.apiBaseUrl;

/** 目前生效的驗證方式：'gas' = 帳密 + session token，'entra' = MSAL + Bearer JWT */
export const authMode = CONFIG.backend === 'gas' ? 'gas' : 'entra';
