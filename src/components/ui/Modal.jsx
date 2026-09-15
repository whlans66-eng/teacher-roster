/**
 * Modal.jsx — 對話框
 *
 * 取代舊版 teacher-management.html / maritime-courses.html / course-management.html
 * 裡各自實作的 .modal-overlay + document.getElementById('xxxModal').style.display,
 * 以及那些用 alert() / confirm() 當對話框的地方。
 *
 * 無障礙行為（這些都是交付項目，不是加分項）：
 *   - 開啟時焦點移進對話框，關閉時還給原本被聚焦的元素
 *   - Tab / Shift+Tab 被鎖在對話框內循環
 *   - Esc 與點擊遮罩都會呼叫 onClose
 *   - 開啟期間鎖住 body 捲動
 *   - role="dialog" aria-modal="true"，標題用 aria-labelledby 串起來
 *
 * 樣式說明：app.css 沒有「遮罩」與「浮起陰影」的 token（ui.css 只管按鈕／標籤／輸入框），
 * 所以這兩個值以 inline style 寫在這裡——全站唯一一處，日後要改遮罩深度只改這個檔案。
 */

import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import Button from './Button.jsx';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

const SIZE_CLASS = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl'
};

const SCRIM_STYLE = { backgroundColor: 'rgba(0, 0, 0, 0.45)' };
const PANEL_STYLE = { boxShadow: '0 24px 60px rgba(0, 0, 0, 0.18)' };

/** 取得容器內「真的看得到」的可聚焦元素（排除 display:none 之類的隱藏節點） */
function getFocusable(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0
  );
}

export function Modal({
  open = false,
  title = '',
  onClose = null,
  footer = null,
  size = 'md',
  className = '',
  children = null
}) {
  const panelRef = useRef(null);
  const lastFocusedRef = useRef(null);
  const backdropPressRef = useRef(false);
  const titleId = useId();

  const requestClose = useCallback(() => {
    if (typeof onClose === 'function') onClose();
  }, [onClose]);

  // 開啟／關閉時的焦點搬移與 body 捲動鎖，只跟 open 有關，不要被 onClose 的
  // 每次 render 新函式牽動，否則每次重繪都會重跑一次搶焦點
  useEffect(() => {
    if (!open) return undefined;

    lastFocusedRef.current = document.activeElement;

    const panel = panelRef.current;
    const focusables = getFocusable(panel);
    (focusables[0] || panel)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      const previous = lastFocusedRef.current;
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [open]);

  // Esc 關閉 + Tab 焦點鎖。用 capture 階段監聽 document，
  // 即使焦點不小心跑到對話框外面（例如剛關掉一個內層元件）也還抓得到。
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const items = getFocusable(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (!panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, requestClose]);

  if (!open) return null;

  // 只有「在遮罩上按下、也在遮罩上放開」才算點擊遮罩；
  // 避免從對話框內文字選取拖曳到外面放開時誤關。
  function handleBackdropMouseDown(event) {
    backdropPressRef.current = event.target === event.currentTarget;
  }

  function handleBackdropClick(event) {
    const pressedOnBackdrop = backdropPressRef.current;
    backdropPressRef.current = false;
    if (pressedOnBackdrop && event.target === event.currentTarget) requestClose();
  }

  const panelClasses = [
    'flex w-full flex-col max-h-[90vh] bg-surface rounded-card focus:outline-none',
    SIZE_CLASS[size] || SIZE_CLASS.md,
    className
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={SCRIM_STYLE}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      {/* 面板本身只會被程式性聚焦（對話框內沒有任何可聚焦元素時的退路），
          鍵盤使用者不會 Tab 到它，所以移除它的外框不影響可見焦點要求。 */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : '對話框'}
        tabIndex={-1}
        className={panelClasses}
        style={PANEL_STYLE}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6">
          {title ? (
            <h2 id={titleId} className="m-0 text-lg font-semibold text-ink">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {typeof onClose === 'function' ? (
            <Button variant="plain" size="sm" icon="x" aria-label="關閉對話框" onClick={requestClose} />
          ) : null}
        </header>

        <div className="overflow-y-auto px-6 py-5 text-ink">{children}</div>

        {footer ? (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
