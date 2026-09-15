/**
 * StatTile.jsx — 統計數字磚
 *
 * 取代舊版 index.html 儀表板與 teacher-management.html 上方的 .stat-card
 * （舊版每頁的內距、圓角、字級都不一樣，且數字顏色直接寫死 hex）。
 *
 * 外框直接沿用 <Card>，確保跟其他卡片共用同一組表面樣式；
 * tone 只影響圖示顏色，底色一律 --ui-fill，避免儀表板變成七彩拼盤。
 */

import Card from './Card.jsx';
import Icon from './Icon.jsx';

const TONE_CLASS = {
  default: 'text-ink-secondary',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger'
};

export function StatTile({
  icon = null,
  label = '',
  value = null,
  hint = '',
  tone = 'default',
  className = ''
}) {
  return (
    <Card className={['h-full', className].filter(Boolean).join(' ')}>
      <div className="flex items-start gap-4">
        {icon ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn bg-fill">
            <Icon name={icon} size={22} className={TONE_CLASS[tone] || TONE_CLASS.default} />
          </span>
        ) : null}
        <div className="min-w-0">
          {label ? <p className="m-0 text-sm text-ink-secondary">{label}</p> : null}
          <p className="m-0 mt-1 text-2xl font-semibold leading-tight text-ink">{value}</p>
          {hint ? <p className="m-0 mt-1 text-xs text-ink-secondary">{hint}</p> : null}
        </div>
      </div>
    </Card>
  );
}

export default StatTile;
