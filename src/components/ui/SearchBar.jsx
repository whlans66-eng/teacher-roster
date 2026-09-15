/**
 * SearchBar.jsx — 搜尋列
 *
 * 取代舊版 teacher-management.html / maritime-courses.html / course-management.html
 * 裡各自手寫的 .search-box（含 document.getElementById('searchInput') 那一套）。
 *
 * ⚠ 契約提醒（其他 agent 請照這個用）：
 *   onChange 收到的是「字串」，不是 DOM event：onChange={(text) => setKeyword(text)}
 *   （第二個參數才是原始 event，通常用不到）。這跟 <Input> 的 onChange 不同，
 *   <Input> 是直接把 props 透傳給原生 <input>，收到的是 event。
 *   onClear 沒傳時，清除鈕會改呼叫 onChange('')，並把焦點還給輸入框。
 */

import { useRef } from 'react';

import Button from './Button.jsx';
import Icon from './Icon.jsx';

export function SearchBar({
  value = '',
  onChange = null,
  placeholder = '搜尋…',
  onClear = null,
  className = '',
  ...rest
}) {
  const inputRef = useRef(null);

  function handleChange(event) {
    if (typeof onChange === 'function') onChange(event.target.value, event);
  }

  function handleClear() {
    if (typeof onClear === 'function') onClear();
    else if (typeof onChange === 'function') onChange('');
    // 清除後焦點留在輸入框，鍵盤使用者可以直接繼續打字
    inputRef.current?.focus();
  }

  return (
    <div role="search" className={['relative', className].filter(Boolean).join(' ')}>
      <Icon
        name="magnifying-glass"
        size={18}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-secondary"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={placeholder || '搜尋'}
        /* 隱藏 WebKit 內建的清除叉叉，避免跟我們自己的清除鈕重複 */
        className="input pl-11 pr-12 [&::-webkit-search-cancel-button]:appearance-none"
        {...rest}
      />
      {value ? (
        <Button
          variant="plain"
          size="sm"
          icon="x"
          aria-label="清除搜尋"
          onClick={handleClear}
          /* 用 inset-y-0 + my-auto 置中，而不是 -translate-y-1/2：
             app.css 的 .btn:active { transform: scale(0.98) } 會蓋掉 translate，
             按下去的瞬間按鈕會往下掉半格。 */
          className="absolute inset-y-0 right-2 my-auto"
        />
      ) : null}
    </div>
  );
}

export default SearchBar;
