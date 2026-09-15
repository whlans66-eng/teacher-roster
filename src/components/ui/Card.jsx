/**
 * Card.jsx — 卡片容器
 *
 * 取代舊版 index.html、teacher-management.html、maritime-courses.html 等頁面裡
 * 各自手寫的 .card / .stat-card / .panel（每個頁面圓角與陰影都不一樣）。
 * 這裡統一成 app.css 的 --ui-radius-card（20px）、--ui-surface 底色與 --ui-border 外框，
 * Tailwind 只負責排版與間距，顏色與圓角一律走 token。
 */

import { useId } from 'react';

/**
 * padded 控制的是「內容區」的內距：傳 false 是為了讓整塊表格或清單可以貼齊卡片邊緣
 * （舊版 teacher-management.html 的教師表格就是這種用法）。
 * 標題列仍保留較小的內距，否則標題會直接黏在卡片邊框上。
 */
export function Card({
  padded = true,
  title = null,
  subtitle = null,
  actions = null,
  className = '',
  children = null,
  ...rest
}) {
  const titleId = useId();
  const hasHeader = Boolean(title || subtitle || actions);

  // overflow-hidden 讓不加內距的卡片（例如整塊表格）也能被 20px 圓角裁切
  const classes = ['bg-surface rounded-card border border-line overflow-hidden', className]
    .filter(Boolean)
    .join(' ');

  return (
    <section
      className={classes}
      aria-labelledby={title ? titleId : undefined}
      {...rest}
    >
      {hasHeader ? (
        <header
          className={[
            'flex items-start justify-between gap-4',
            padded ? 'px-5 pt-5' : 'px-4 pt-4',
            children ? '' : padded ? 'pb-5' : 'pb-4'
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="min-w-0">
            {title ? (
              <h3 id={titleId} className="m-0 text-base font-semibold text-ink">
                {title}
              </h3>
            ) : null}
            {subtitle ? <p className="m-0 mt-1 text-sm text-ink-secondary">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}

      {children ? (
        <div className={[padded ? 'p-5' : '', hasHeader && padded ? 'pt-4' : ''].filter(Boolean).join(' ')}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

export default Card;
