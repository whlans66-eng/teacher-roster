/**
 * apiClient.js — 全站唯一會呼叫 fetch() 的檔案
 *
 * 對應舊檔：js/api.js 裡 class TeacherRosterAPI 的 _get / _post / uploadFile
 *
 * 規則（這是整個架構的關鍵約束）：
 *   1. 頁面與元件永遠不准直接 fetch，一律經過 services/。
 *   2. 只有這裡知道傳輸格式、驗證標頭、逾時與錯誤信封長什麼樣。
 *      因此把 Google Apps Script 換成內網 REST API 時，只需要改這支
 *      與 config.js，上層一行都不用動。
 *   3. 丟出 Error 一律代表「壞掉了」。像「儲存時發生版本衝突」「AI 被限流」
 *      這種正常的業務結果不丟錯，而是由各領域模組用回傳值表達。
 */

import { CONFIG, apiBaseUrl, isLocal } from '../config.js';
import { ApiError, AuthError, normalizeThrown, withTimeout } from './apiErrors.js';
import { gasRequest } from './gasAdapter.js';

// 錯誤型別定義在 apiErrors.js，這裡轉出以維持單一對外入口
export { ApiError, AuthError } from './apiErrors.js';

/** token 由 AuthContext 在初始化時注入，避免 services 反過來依賴 state 層 */
let tokenProvider = async () => null;

export function setTokenProvider(provider) {
  tokenProvider = typeof provider === 'function' ? provider : async () => null;
}

export function getTokenProvider() {
  return tokenProvider;
}

function debugLog(...args) {
  // eslint-disable-next-line no-console -- 由 CONFIG.debug 控制的除錯輸出，正式環境預設關閉
  if (CONFIG.debug) console.log('[api]', ...args);
}

function requireBaseUrl() {
  if (!apiBaseUrl) {
    throw new ApiError(
      CONFIG.backend === 'rest'
        ? 'config.js 的 rest.apiBaseUrl 尚未填寫，請填入內網 API 位址'
        : 'config.js 的 gas.baseUrl 尚未填寫'
    );
  }
}

/**
 * 主要的 API 呼叫。
 *
 * @param {string} path    REST 風格路徑，例如 '/permissions/check'、'/roster/teachers'
 * @param {object} options fetch 選項，另支援 { timeout, body 為物件時自動 JSON 化 }
 * @returns {Promise<any>} 已解開信封的資料
 */
export async function callApi(path, options = {}) {
  requireBaseUrl();

  // 舊後端：交給轉接層把 REST 路徑翻成 GAS 的 action 參數
  if (CONFIG.backend === 'gas') {
    return gasRequest(path, options, tokenProvider);
  }

  const [signal, cleanup] = withTimeout(options.timeout || CONFIG.timeout);

  try {
    const token = await tokenProvider();
    const hasBody = options.body !== undefined && options.body !== null;
    const isPlainObject =
      hasBody && typeof options.body === 'object' && !(options.body instanceof FormData);

    debugLog(options.method || 'GET', path);

    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      body: isPlainObject ? JSON.stringify(options.body) : options.body,
      headers: {
        ...(isPlainObject ? { 'Content-Type': 'application/json' } : {}),
        ...(token && !isLocal ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      },
      signal
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text();

    if (response.status === 401 || response.status === 403) {
      throw new AuthError(payload?.error || payload?.message || '沒有權限或登入已逾期', {
        status: response.status
      });
    }

    if (!response.ok) {
      throw new ApiError(payload?.error || payload?.message || `API 錯誤 ${response.status}`, {
        status: response.status
      });
    }

    return payload;
  } catch (error) {
    throw normalizeThrown(error);
  } finally {
    cleanup();
  }
}

/**
 * 下載二進位內容（圖片、匯出檔）。回傳 Blob，204 回傳 null。
 */
export async function fetchApiBlob(path, accept = '*/*') {
  requireBaseUrl();

  if (CONFIG.backend === 'gas') {
    return gasRequest(path, { accept, responseType: 'blob' }, tokenProvider);
  }

  const [signal, cleanup] = withTimeout(CONFIG.timeout);

  try {
    const token = await tokenProvider();
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: {
        Accept: accept,
        ...(token && !isLocal ? { Authorization: `Bearer ${token}` } : {})
      },
      signal
    });

    if (response.status === 204) return null;
    if (response.status === 401 || response.status === 403) throw new AuthError();
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data?.error || data?.message || `API 錯誤 ${response.status}`, {
        status: response.status
      });
    }

    return response.blob();
  } catch (error) {
    throw normalizeThrown(error);
  } finally {
    cleanup();
  }
}

/**
 * 檔案上傳（multipart）。
 *
 * 註：這是在你同事那份參考實作之外「新增」的第三個對外函式。
 * 原因是本專案有真實的檔案上傳需求（教師照片、證照、教材），而舊版是把
 * 檔案轉成 base64 data URL 塞進一般請求裡送（js/api.js:214），那條路徑會
 * 讓 payload 膨脹約 33%，且大檔會被後端擋掉。multipart 是正確做法。
 */
export async function uploadMultipart(path, formData, options = {}) {
  requireBaseUrl();

  if (!(formData instanceof FormData)) {
    throw new ApiError('uploadMultipart 需要 FormData');
  }

  if (CONFIG.backend === 'gas') {
    return gasRequest(path, { ...options, method: 'POST', body: formData }, tokenProvider);
  }

  const [signal, cleanup] = withTimeout(options.timeout || CONFIG.timeout);

  try {
    const token = await tokenProvider();
    // 刻意不設 Content-Type：瀏覽器必須自己帶上含 boundary 的值
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      body: formData,
      headers: { ...(token && !isLocal ? { Authorization: `Bearer ${token}` } : {}) },
      signal
    });

    const payload = await response.json().catch(() => null);

    if (response.status === 401 || response.status === 403) throw new AuthError();
    if (!response.ok) {
      throw new ApiError(payload?.error || `上傳失敗（${response.status}）`, {
        status: response.status
      });
    }

    return payload;
  } catch (error) {
    throw normalizeThrown(error);
  } finally {
    cleanup();
  }
}
