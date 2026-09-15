/**
 * apiErrors.js — API 錯誤型別
 *
 * 獨立成一支是為了避免 apiClient.js ↔ gasAdapter.js 的循環相依：
 * 兩邊都要丟這些錯誤，但誰也不該 import 對方的全部。
 */

/** 一般 API 錯誤 */
export class ApiError extends Error {
  constructor(message, { status = 0, cause = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (cause) this.cause = cause;
  }
}

/** 身分失效：token 過期、被踢、或後端回 401/403。
 *  AuthContext 攔截此型別後切換到 session-expired 守衛畫面，
 *  不再像舊版那樣在傳輸層直接 alert() + 改 window.location
 *  （舊行為見 js/api.js:372-381，會連同未存檔的編輯一起炸掉）。 */
export class AuthError extends ApiError {
  constructor(message = '登入已逾期，請重新登入', options = {}) {
    super(message, options);
    this.name = 'AuthError';
  }
}

/**
 * 全域身分失效通知。
 *
 * AuthContext 在掛載時註冊一個處理器；任何一支服務、任何一個頁面只要打到
 * 逾期的 token，這裡就會通知 AuthContext 切到 session-expired 守衛畫面。
 * 舊版是在傳輸層直接 alert() + 改 window.location（js/api.js:372-381），
 * 那會把整棵 React 樹連同未存檔的編輯一起毀掉。
 */
let authErrorHandler = null;

export function setAuthErrorHandler(handler) {
  authErrorHandler = typeof handler === 'function' ? handler : null;
}

/** 把任意丟出物正規化成 ApiError；順帶通報身分失效 */
export function normalizeThrown(error) {
  const normalized =
    error instanceof ApiError
      ? error
      : error?.name === 'AbortError'
        ? new ApiError('請求逾時，請稍後再試')
        : new ApiError(error?.message || '請求失敗', { cause: error });

  if (normalized instanceof AuthError && authErrorHandler) {
    try {
      authErrorHandler(normalized);
    } catch {
      // 處理器本身出錯不能影響原始錯誤的傳遞
    }
  }

  return normalized;
}

/** 包住 AbortController 的逾時處理，回傳 [signal, cleanup] */
export function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return [controller.signal, () => clearTimeout(timer)];
}
