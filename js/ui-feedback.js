// 全站共用的操作回饋層
//
// 解決兩件事：
//   1. 送出資料時要看得出來「還在處理」，不要停頓兩三秒卻以為已經成功
//   2. 編輯完一筆回到清單時，要標出剛剛改的是哪一筆，不會逐筆修改到一半迷失
(function () {
  'use strict';

  const TOAST_MS = 3200;
  const MARK_TTL = 60 * 60 * 1000;   // 「剛剛編輯」的記號保留 1 小時
  const MARK_PREFIX = 'lastEdited:';

  let stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'ui-feedback-styles';
    style.textContent = `
      .uif-overlay {
        position: fixed; inset: 0; z-index: 99000;
        display: flex; align-items: center; justify-content: center;
        background: rgba(245, 245, 247, 0.72);
        -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
        opacity: 0; visibility: hidden; transition: opacity 0.2s ease, visibility 0.2s;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', sans-serif;
      }
      .uif-overlay.show { opacity: 1; visibility: visible; }
      .uif-overlay-card {
        display: flex; flex-direction: column; align-items: center; gap: 16px;
        padding: 32px 40px; border-radius: 20px; background: #fff;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.16); min-width: 220px;
      }
      .uif-overlay-text { font-size: 16px; font-weight: 600; color: #1d1d1f; }
      .uif-overlay-sub { font-size: 13px; color: #6e6e73; margin-top: -8px; }
      .uif-spinner {
        width: 34px; height: 34px; border: 3px solid rgba(0, 0, 0, 0.1);
        border-top-color: #007aff; border-radius: 50%;
        animation: uif-spin 0.7s linear infinite;
      }
      .uif-spinner-sm {
        width: 15px; height: 15px; border: 2px solid rgba(255, 255, 255, 0.4);
        border-top-color: #fff; border-radius: 50%;
        animation: uif-spin 0.7s linear infinite;
        display: inline-block; vertical-align: -2px; margin-right: 7px;
      }
      @keyframes uif-spin { to { transform: rotate(360deg); } }

      .uif-toast {
        position: fixed; bottom: 28px; left: 50%; transform: translate(-50%, 16px);
        display: flex; align-items: center; gap: 10px;
        max-width: min(92vw, 520px);
        padding: 13px 20px; border-radius: 14px;
        background: rgba(28, 28, 30, 0.95);
        -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
        color: #fff; font-size: 14.5px; font-weight: 500; line-height: 1.5;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
        opacity: 0; visibility: hidden; z-index: 99500;
        transition: opacity 0.24s ease, transform 0.24s ease, visibility 0.24s;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', sans-serif;
      }
      .uif-toast.show { opacity: 1; visibility: visible; transform: translate(-50%, 0); }
      .uif-toast-dot {
        width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; background: #30d158;
      }
      .uif-toast.error .uif-toast-dot { background: #ff453a; }
      .uif-toast.info  .uif-toast-dot { background: #0a84ff; }

      /* 背景儲存狀態（防抖／自動儲存用） */
      .uif-status {
        position: fixed; right: 20px; bottom: 20px; z-index: 99400;
        display: flex; align-items: center; gap: 9px;
        padding: 9px 15px; border-radius: 999px;
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid rgba(0, 0, 0, 0.08);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', sans-serif;
        font-size: 13px; font-weight: 600; color: #1d1d1f;
        opacity: 0; visibility: hidden; transform: translateY(8px);
        transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
      }
      .uif-status.show { opacity: 1; visibility: visible; transform: translateY(0); }
      .uif-status .uif-spinner-sm {
        border-color: rgba(0, 0, 0, 0.12); border-top-color: #007aff; margin: 0;
      }
      .uif-status-dot { width: 9px; height: 9px; border-radius: 50%; background: #30d158; }
      .uif-status.error { color: #c81e14; border-color: rgba(255, 59, 48, 0.3); cursor: pointer; }
      .uif-status.error .uif-status-dot { background: #ff3b30; }

      /* ── 上次編輯到哪 ── */
      /* 刻意沿用頁面既有的白卡語言（白底、極淡邊框、柔和陰影），
         不要另外做漸層或強色塊，否則會像貼上去的外來元件 */
      .uif-resume {
        grid-column: 1 / -1;
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        margin: 0 0 20px; padding: 13px 16px;
        border-radius: 16px;
        background: #ffffff;
        border: 1px solid rgba(0, 0, 0, 0.06);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.05);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', sans-serif;
        font-size: 14px; color: #1d1d1f; line-height: 1.45;
        animation: uif-fade-in 0.3s ease-out;
      }
      @keyframes uif-fade-in {
        from { opacity: 0; transform: translateY(-6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .uif-resume-dot {
        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        background: #007aff;
        box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.12);
        margin: 0 3px;
      }
      .uif-resume-text { flex: 1; min-width: 180px; }
      .uif-resume-text strong { font-weight: 600; }
      .uif-resume-meta { color: #86868b; font-size: 13px; }
      .uif-resume-btn {
        padding: 6px 13px; border: none; border-radius: 9px;
        background: transparent; color: #6e6e73; cursor: pointer;
        font-family: inherit; font-size: 13px; font-weight: 600;
        white-space: nowrap;
      }
      .uif-resume-btn:hover { background: rgba(0, 0, 0, 0.05); color: #1d1d1f; }
      .uif-resume-btn.primary { background: #eaf3ff; color: #007aff; }
      .uif-resume-btn.primary:hover { background: #d8e9ff; }

      /* 剛剛編輯的那一張：用 box-shadow 做環，會自動貼合卡片既有的圓角；
         outline 在圓角卡片上會顯得像除錯用的方框。
         不放角落徽章 —— 卡片四角通常已經有標籤，硬塞會互相打架，
         而且部分卡片是 overflow:hidden，貼邊的徽章會被切掉。 */
      .uif-last-edited {
        box-shadow: 0 0 0 2px #007aff, 0 10px 28px rgba(0, 122, 255, 0.15) !important;
      }
      .uif-last-edited::after {
        content: '';
        position: absolute; inset: 0;
        border-radius: inherit;
        border: 2px solid rgba(0, 122, 255, 0.5);
        animation: uif-ring 1.6s ease-out 1 forwards;
        pointer-events: none;
      }
      @keyframes uif-ring {
        0%   { transform: scale(1);     opacity: 0.85; }
        100% { transform: scale(1.03);  opacity: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .uif-resume, .uif-last-edited::after { animation: none; }
        .uif-last-edited::after { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  function ready(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ==================== 處理中遮罩 ====================

  let overlayEl = null;
  let overlayDepth = 0;

  function getOverlay() {
    if (overlayEl) return overlayEl;
    injectStyles();
    overlayEl = document.createElement('div');
    overlayEl.className = 'uif-overlay';
    overlayEl.setAttribute('role', 'alert');
    overlayEl.setAttribute('aria-live', 'assertive');
    overlayEl.innerHTML = `
      <div class="uif-overlay-card">
        <div class="uif-spinner"></div>
        <div class="uif-overlay-text"></div>
        <div class="uif-overlay-sub"></div>
      </div>`;
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  /**
   * 顯示「處理中」遮罩，回傳關閉用的函式
   * 之所以蓋整頁，是因為停頓兩三秒時使用者需要明確知道還沒完成
   */
  function showBusy(text, sub) {
    let closed = false;
    ready(() => {
      if (closed) return;
      const el = getOverlay();
      el.querySelector('.uif-overlay-text').textContent = text || '處理中…';
      el.querySelector('.uif-overlay-sub').textContent = sub || '請稍候，完成前請不要關閉視窗';
      el.classList.add('show');
    });
    overlayDepth++;
    return function done() {
      if (closed) return;
      closed = true;
      overlayDepth = Math.max(0, overlayDepth - 1);
      if (overlayDepth === 0 && overlayEl) overlayEl.classList.remove('show');
    };
  }

  // ==================== Toast ====================

  let toastEl = null;
  let toastTimer = null;

  function toast(message, type) {
    ready(() => {
      injectStyles();
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.className = 'uif-toast';
        toastEl.setAttribute('role', 'status');
        toastEl.innerHTML = '<span class="uif-toast-dot"></span><span class="uif-toast-msg"></span>';
        document.body.appendChild(toastEl);
      }
      toastEl.querySelector('.uif-toast-msg').textContent = message;
      toastEl.className = 'uif-toast show ' + (type || 'success');
      clearTimeout(toastTimer);
      // 錯誤訊息停久一點，讓人看得完
      toastTimer = setTimeout(() => {
        toastEl.className = 'uif-toast ' + (type || 'success');
      }, type === 'error' ? 5200 : TOAST_MS);
    });
  }

  // ==================== 送出包裝 ====================

  function setButtonBusy(button, text) {
    if (!button) return function () {};
    const originalHtml = button.innerHTML;
    const wasDisabled = button.disabled;
    button.disabled = true;
    button.innerHTML = '<span class="uif-spinner-sm"></span>' + escapeHtml(text || '處理中…');
    return function restore() {
      button.disabled = wasDisabled;
      button.innerHTML = originalHtml;
    };
  }

  /**
   * 包住一個送出動作，全程給使用者明確狀態
   *
   * 重點：只有 task 真的 resolve 才會顯示成功訊息。
   * 先前的寫法是後端失敗僅 console.error，畫面照樣報成功。
   *
   * @param {Function} task 回傳 Promise 的實際工作
   * @param {Object}  opts
   *   button   送出按鈕，執行期間顯示轉圈並停用
   *   pending  遮罩文字，預設「儲存中…」
   *   sub      遮罩副標
   *   success  成功後的 toast；傳 null 表示不顯示
   *   error    失敗訊息前綴，預設「儲存失敗」
   *   block    是否蓋整頁遮罩，預設 true
   * @returns {Promise} task 的結果；失敗時原樣往外丟
   */
  async function submit(task, opts) {
    const o = opts || {};
    const useOverlay = o.block !== false;
    const restoreButton = setButtonBusy(o.button, o.pending || '儲存中…');
    const closeBusy = useOverlay ? showBusy(o.pending || '儲存中…', o.sub) : function () {};

    try {
      const result = await task();
      closeBusy();
      restoreButton();
      if (o.success !== null) toast(o.success || '已儲存', 'success');
      return result;
    } catch (error) {
      closeBusy();
      restoreButton();
      const reason = (error && error.message) ? error.message : String(error || '未知原因');
      toast((o.error || '儲存失敗') + '：' + reason, 'error');
      throw error;
    }
  }

  // ==================== 背景儲存狀態 ====================

  let statusEl = null;
  let statusTimer = null;

  function getStatus() {
    if (statusEl) return statusEl;
    injectStyles();
    statusEl = document.createElement('div');
    statusEl.className = 'uif-status';
    statusEl.setAttribute('role', 'status');
    document.body.appendChild(statusEl);
    return statusEl;
  }

  function renderStatus(html, cls, onClick) {
    ready(() => {
      const el = getStatus();
      el.innerHTML = html;
      el.className = 'uif-status show ' + (cls || '');
      el.onclick = onClick || null;
    });
  }

  const status = {
    saving: function (text) {
      clearTimeout(statusTimer);
      renderStatus('<span class="uif-spinner-sm"></span>' + escapeHtml(text || '儲存中…'), '');
    },
    saved: function (text) {
      clearTimeout(statusTimer);
      renderStatus('<span class="uif-status-dot"></span>' + escapeHtml(text || '已儲存'), '');
      statusTimer = setTimeout(() => { if (statusEl) statusEl.classList.remove('show'); }, 2200);
    },
    failed: function (text, onRetry) {
      clearTimeout(statusTimer);
      const label = escapeHtml(text || '儲存失敗') + (onRetry ? '，點此重試' : '');
      // 失敗狀態不自動消失，否則跟沒提示一樣
      renderStatus('<span class="uif-status-dot"></span>' + label, 'error', onRetry);
    },
    hide: function () {
      clearTimeout(statusTimer);
      if (statusEl) statusEl.classList.remove('show');
    }
  };

  // ==================== 上次編輯到哪 ====================

  function markKey(scope) {
    return MARK_PREFIX + scope;
  }

  /**
   * 記下剛剛編輯的是哪一筆
   * @param {string} scope 資料範圍，例如 'teachers'、'maritimeCourses'
   * @param {string|number} id
   * @param {string} label 顯示用名稱
   */
  function markLastEdited(scope, id, label) {
    if (id === undefined || id === null || id === '') return;
    try {
      sessionStorage.setItem(markKey(scope), JSON.stringify({
        id: String(id),
        label: String(label || ''),
        at: Date.now()
      }));
    } catch (e) { /* 無痕模式等情況，略過即可 */ }
  }

  function getLastEdited(scope) {
    try {
      const raw = sessionStorage.getItem(markKey(scope));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.id) return null;
      if (Date.now() - (data.at || 0) > MARK_TTL) {
        clearLastEdited(scope);
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  function clearLastEdited(scope) {
    try { sessionStorage.removeItem(markKey(scope)); } catch (e) {}
  }

  function relativeTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60 * 1000) return '剛剛';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + ' 分鐘前';
    return Math.floor(mins / 60) + ' 小時前';
  }

  /**
   * 在清單上標出剛剛編輯的那一筆（像回到 IG 首頁會標出你剛看過的那則）
   *
   * @param {string} scope
   * @param {Object} opts
   *   selector   卡片選擇器，例如 '.course-card'
   *   idAttr     卡片上存 id 的 dataset key，例如 'courseId'
   *   container  要插入提示列的容器（省略則不插提示列）
   *   scroll     是否自動捲到該筆，預設 true
   *   noun       名詞，用於文案，預設「資料」
   * @returns {boolean} 是否有找到並標記
   */
  function highlightLastEdited(scope, opts) {
    const o = opts || {};
    const mark = getLastEdited(scope);
    if (!mark) return false;

    injectStyles();

    // 清掉上一輪的標記，避免重複渲染時疊加
    document.querySelectorAll('.uif-last-edited').forEach(el => el.classList.remove('uif-last-edited'));
    document.querySelectorAll('.uif-resume').forEach(el => el.remove());

    const cards = Array.from(document.querySelectorAll(o.selector || '[data-id]'));
    const card = cards.filter(el => String(el.dataset[o.idAttr || 'id']) === mark.id)[0];

    const container = typeof o.container === 'string'
      ? document.querySelector(o.container)
      : o.container;

    if (container) {
      const bar = document.createElement('div');
      bar.className = 'uif-resume';
      const name = mark.label ? `「${escapeHtml(mark.label)}」` : `這筆${escapeHtml(o.noun || '資料')}`;
      const missing = card ? '' : '，目前的篩選條件下看不到';
      bar.innerHTML = `
        <span class="uif-resume-dot"></span>
        <span class="uif-resume-text">上次修改到<strong>${name}</strong><span class="uif-resume-meta"> · ${escapeHtml(relativeTime(mark.at))}${escapeHtml(missing)}</span></span>
        ${card ? '<button type="button" class="uif-resume-btn primary" data-uif-goto>看這一筆</button>' : ''}
        <button type="button" class="uif-resume-btn" data-uif-dismiss>知道了</button>
      `;
      container.insertBefore(bar, container.firstChild);

      const goto = bar.querySelector('[data-uif-goto]');
      if (goto) goto.addEventListener('click', () => scrollToCard(card));
      bar.querySelector('[data-uif-dismiss]').addEventListener('click', () => {
        clearLastEdited(scope);
        bar.remove();
        if (card) card.classList.remove('uif-last-edited');
      });
    }

    if (!card) return false;

    card.classList.add('uif-last-edited');
    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';

    if (o.scroll !== false) {
      // 等版面穩定再捲，否則位置會算錯
      requestAnimationFrame(() => setTimeout(() => scrollToCard(card), 60));
    }
    return true;
  }

  function scrollToCard(card) {
    if (!card) return;
    try {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      card.scrollIntoView();
    }
  }

  window.UIFeedback = {
    toast,
    submit,
    showBusy,
    status,
    markLastEdited,
    getLastEdited,
    clearLastEdited,
    highlightLastEdited,
    scrollToCard,
    escapeHtml
  };
})();
