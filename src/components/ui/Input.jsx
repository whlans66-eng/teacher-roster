/**
 * Input.jsx — 表單輸入框
 *
 * 取代舊版 login.html / crew-login.html / teacher-management.html /
 * maritime-courses.html 表單裡手寫的 <input class="input"> 與那些沒有 <label>、
 * 只靠 placeholder 當標籤的欄位（螢幕閱讀器讀不到，也是舊版的無障礙缺口）。
 *
 * id 用 React 的 useId 產生，確保 <label for> 與 <input id> 一定對得上，
 * 就算同一頁出現多個同名欄位也不會互相搶焦點。
 *
 * as="select" 時改渲染 <select>（children 放 <option>），共用同一套 .input 樣式、
 * label 與錯誤訊息。這樣頁面就不必自己手寫 class="input"——.input 這個 class 字串
 * 只會出現在 src/components/ui/ 底下。
 */

import { forwardRef, useId } from 'react';

import Icon from './Icon.jsx';

export const Input = forwardRef(function Input(
  {
    label = '',
    hint = '',
    error = '',
    icon = null,
    as = 'input',
    type = 'text',
    className = '',
    wrapperClassName = '',
    id: idProp = '',
    children = null,
    ...rest
  },
  ref
) {
  const generatedId = useId();
  const id = idProp || `input-${generatedId}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const isSelect = as === 'select';

  // 有錯誤時以錯誤訊息取代提示文字，描述用的 id 也跟著只指向實際渲染出來的那一個
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const inputClasses = ['input', icon ? 'pl-11' : '', error ? 'border-danger' : '', className]
    .filter(Boolean)
    .join(' ');

  // .input 已經定義好圓角，這裡只共用 class 名稱，不再疊任何 Tailwind rounded-*
  const controlProps = {
    id,
    ref,
    className: inputClasses,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    ...rest
  };

  return (
    <div className={['flex flex-col gap-1.5', wrapperClassName].filter(Boolean).join(' ')}>
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
      ) : null}

      <div className="relative">
        {icon ? (
          <Icon
            name={icon}
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-secondary"
          />
        ) : null}
        {isSelect ? (
          <select {...controlProps}>{children}</select>
        ) : (
          <input type={type} {...controlProps} />
        )}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="m-0 text-sm text-ink-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export default Input;
