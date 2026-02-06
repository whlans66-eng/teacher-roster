// ==================== 前端安全工具 ====================

/**
 * HTML 特殊字元跳脫（防止 XSS）
 * 將使用者輸入的內容轉為安全的 HTML 文字
 * @param {string} str - 要跳脫的字串
 * @returns {string} 跳脫後的安全字串
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 跳脫 HTML 屬性值（防止屬性注入）
 * @param {string} str - 要跳脫的屬性值
 * @returns {string} 安全的屬性值
 */
function escapeAttr(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 驗證 URL 是否安全（防止 javascript: 協議注入）
 * @param {string} url - 要驗證的 URL
 * @returns {string} 安全的 URL，不安全時回傳空字串
 */
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:text/html') || trimmed.startsWith('vbscript:')) {
    return '';
  }
  return url;
}

// 匯出到全域
window.escapeHtml = escapeHtml;
window.escapeAttr = escapeAttr;
window.sanitizeUrl = sanitizeUrl;
