/**
 * Button.jsx — 全站唯一的按鈕元件
 *
 * 取代舊版散落在 index.html / login.html / teacher-management.html /
 * maritime-courses.html / course-management.html / teaching-materials.html /
 * crew-portal.html / crew-login.html 裡上百處手寫的 class="btn btn-primary"，
 * 以及那些 inline onmouseover 改樣式的寫法。
 *
 * class 名稱全部來自 src/assets/css/app.css（即 shared/ui.css），
 * 這裡不新增任何自創 class，也不用 Tailwind 重做 app.css 已經做過的事。
 *
 * 設計決定（其他 agent 請注意）：
 *   iconRight 時「DOM 順序仍是 圖示→文字」，改由 app.css 的
 *   .btn-icon-right { flex-direction: row-reverse } 做視覺翻轉。
 *   這是 ui.css 原本就設計好的用法，視覺結果就是文字在左、箭頭在右。
 *   loading 時的 .spinner 會依按鈕尺寸縮放，因為 app.css 的 .spinner 固定 24px，
 *   直接用會讓按鈕在 loading 前後跳高約 5px；app.css 目前沒有 .spinner-sm 可用，
 *   而設計系統檔案不可修改，所以尺寸在這裡以 inline style 覆寫（顏色仍吃 token）。
 */

import { forwardRef, useEffect } from 'react';

import Icon from './Icon.jsx';

const VARIANT_CLASS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  plain: 'btn-plain',
  soft: 'btn-soft',
  success: 'btn-success',
  'on-color': 'btn-on-color'
};

const SIZE_CLASS = {
  sm: 'btn-sm',
  md: '', // md 是 .btn 的預設，不需要額外 class
  lg: 'btn-lg'
};

/** .spinner 在各尺寸按鈕裡的幾何尺寸，對齊 app.css 的圖示尺寸（16 / 18 / 20px） */
const SPINNER_STYLE = {
  sm: { width: '16px', height: '16px', borderWidth: '2px' },
  md: { width: '18px', height: '18px', borderWidth: '2px' },
  lg: { width: '20px', height: '20px', borderWidth: '3px' }
};

/** children 攤平後是否還有實際內容（null / false / undefined 不算） */
function hasVisibleChildren(children) {
  if (children == null || children === false || children === '') return false;
  if (Array.isArray(children)) return children.some(hasVisibleChildren);
  return true;
}

export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon = null,
    iconRight = false,
    block = false,
    loading = false,
    disabled = false,
    type = 'button',
    className = '',
    children = null,
    ...rest
  },
  ref
) {
  const hasChildren = hasVisibleChildren(children);
  const iconOnly = !hasChildren;
  const ariaLabel = rest['aria-label'];

  // 只有圖示、又沒有 aria-label 的按鈕對螢幕閱讀器等於空白，開發期要吵出來
  useEffect(() => {
    if (import.meta.env && import.meta.env.DEV && iconOnly && !ariaLabel) {
      // eslint-disable-next-line no-console
      console.warn('[Button] 純圖示按鈕缺少 aria-label，螢幕閱讀器會讀不到這顆按鈕。', { icon });
    }
  }, [iconOnly, ariaLabel, icon]);

  const sizeKey = SIZE_CLASS[size] === undefined ? 'md' : size;

  const classes = [
    'btn',
    VARIANT_CLASS[variant] || VARIANT_CLASS.primary,
    SIZE_CLASS[sizeKey],
    iconOnly ? 'btn-icon' : '',
    block ? 'btn-block' : '',
    iconRight && !iconOnly ? 'btn-icon-right' : '',
    className
  ]
    .filter(Boolean)
    .join(' ');

  // loading 時 spinner 取代圖示的位置，文字保留，讓按鈕寬度不要忽大忽小
  let leading = null;
  if (loading) {
    leading = <span className="spinner" style={SPINNER_STYLE[sizeKey]} aria-hidden="true" />;
  } else if (typeof icon === 'string' && icon) {
    leading = <Icon name={icon} />;
  } else if (icon) {
    leading = icon;
  }

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {leading}
      {hasChildren ? <span>{children}</span> : null}
    </button>
  );
});

export default Button;
