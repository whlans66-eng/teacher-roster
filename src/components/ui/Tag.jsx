/**
 * Tag.jsx — 狀態標籤／徽章
 *
 * 取代舊版 teacher-management.html、maritime-courses.html、crew-portal.html 裡
 * 手寫的 class="tag tag-green"、.badge、.status-pill 等各自為政的小標籤。
 * 顏色一律用 app.css 定義的五個修飾 class，不新增顏色。
 */

import Icon from './Icon.jsx';

const COLOR_CLASS = {
  blue: 'tag-blue',
  green: 'tag-green',
  orange: 'tag-orange',
  red: 'tag-red',
  gray: 'tag-gray'
};

export function Tag({ color = 'gray', icon = null, className = '', children = null, ...rest }) {
  const classes = ['tag', COLOR_CLASS[color] || COLOR_CLASS.gray, className].filter(Boolean).join(' ');

  return (
    <span className={classes} {...rest}>
      {typeof icon === 'string' && icon ? <Icon name={icon} /> : icon}
      {children}
    </span>
  );
}

export default Tag;
