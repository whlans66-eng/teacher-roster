/**
 * EmptyState.jsx — 空狀態
 *
 * 取代舊版 teacher-management.html / maritime-courses.html / crew-portal.html 裡
 * 用 innerHTML 塞進去的「目前沒有資料」字串（每頁措辭與樣式都不一樣）。
 * 統一成「圖示 + 標題 + 說明 + 一個主要動作」四段結構。
 */

import Icon from './Icon.jsx';

export function EmptyState({ icon = null, title = '', message = '', action = null, className = '' }) {
  const classes = ['flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {icon ? (
        <span className="flex h-16 w-16 items-center justify-center rounded-pill bg-fill">
          <Icon name={icon} size={30} className="text-ink-secondary" />
        </span>
      ) : null}
      {title ? <h3 className="m-0 text-base font-semibold text-ink">{title}</h3> : null}
      {message ? <p className="m-0 max-w-md text-sm text-ink-secondary">{message}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export default EmptyState;
