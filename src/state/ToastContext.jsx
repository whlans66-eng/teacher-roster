/**
 * ToastContext.jsx — 全域訊息與確認對話框
 *
 * 取代舊版散落在各頁的 57 個 alert()、30 個 confirm() 與 1 個 prompt()。
 * 原生對話框會凍結整個分頁、無法套用設計系統、在手機上樣式失控，
 * 而且 confirm() 是同步阻塞的，跟 async 流程混用很容易出錯。
 *
 * API：
 *   toast.alert(message, title?)
 *   toast.confirm(message, onConfirm, title?, options?)
 *   toast.prompt(message, onSubmit, { title, defaultValue, placeholder })
 *   toast.showLoading(message) / toast.hideLoading()
 *   toast.notify(message, type?)   ← 非阻塞的浮動提示
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

let notifyId = 0;

export function ToastProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [loading, setLoading] = useState('');
  const [notices, setNotices] = useState([]);
  const timers = useRef(new Set());

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    },
    []
  );

  const alert = useCallback((message, title = '') => {
    setDialog({ type: 'alert', title, message });
  }, []);

  const confirm = useCallback((message, onConfirm, title = '請確認', options = {}) => {
    setDialog({
      type: 'confirm',
      title,
      message,
      onConfirm,
      confirmLabel: options.confirmLabel || '確定',
      cancelLabel: options.cancelLabel || '取消',
      danger: options.danger !== false
    });
  }, []);

  const prompt = useCallback((message, onSubmit, options = {}) => {
    setDialog({
      type: 'prompt',
      title: options.title || '',
      message,
      onSubmit,
      defaultValue: options.defaultValue || '',
      placeholder: options.placeholder || ''
    });
  }, []);

  const notify = useCallback((message, type = 'info') => {
    notifyId += 1;
    const id = notifyId;
    setNotices((list) => [...list, { id, message, type }]);
    const timer = setTimeout(() => {
      setNotices((list) => list.filter((n) => n.id !== id));
      timers.current.delete(timer);
    }, 4000);
    timers.current.add(timer);
  }, []);

  const value = useMemo(
    () => ({
      alert,
      confirm,
      prompt,
      notify,
      showLoading: setLoading,
      hideLoading: () => setLoading('')
    }),
    [alert, confirm, prompt, notify]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {loading ? <LoadingOverlay message={loading} /> : null}
      {dialog ? <Dialog dialog={dialog} onClose={() => setDialog(null)} /> : null}
      <NoticeStrip notices={notices} onDismiss={(id) => setNotices((l) => l.filter((n) => n.id !== id))} />
    </ToastContext.Provider>
  );
}

function LoadingOverlay({ message }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="spinner spinner-lg mb-4" />
      <div className="font-semibold text-ink">{message}</div>
    </div>
  );
}

function Dialog({ dialog, onClose }) {
  const inputRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    // 開啟時把焦點移進對話框，關閉時 Esc 取消
    const target = dialog.type === 'prompt' ? inputRef.current : confirmRef.current;
    target?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialog, onClose]);

  function runConfirm() {
    const next = dialog.onConfirm;
    onClose();
    if (typeof next === 'function') void next();
  }

  function runSubmit(event) {
    event.preventDefault();
    const next = dialog.onSubmit;
    const value = inputRef.current?.value ?? '';
    onClose();
    if (typeof next === 'function') void next(value);
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-card bg-surface p-6 shadow-2xl">
        {dialog.title ? <h3 className="mb-3 text-lg font-bold text-ink">{dialog.title}</h3> : null}
        <p className="mb-6 whitespace-pre-wrap text-ink-secondary">{dialog.message}</p>

        {dialog.type === 'prompt' ? (
          <form onSubmit={runSubmit}>
            <input
              ref={inputRef}
              className="input mb-4 w-full"
              defaultValue={dialog.defaultValue}
              placeholder={dialog.placeholder}
            />
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                取消
              </button>
              <button type="submit" className="btn btn-primary">
                確定
              </button>
            </div>
          </form>
        ) : dialog.type === 'confirm' ? (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {dialog.cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              className={dialog.danger ? 'btn btn-danger' : 'btn btn-primary'}
              onClick={runConfirm}
            >
              {dialog.confirmLabel}
            </button>
          </div>
        ) : (
          <button ref={confirmRef} type="button" className="btn btn-primary w-full" onClick={onClose}>
            知道了
          </button>
        )}
      </div>
    </div>
  );
}

function NoticeStrip({ notices, onDismiss }) {
  if (!notices.length) return null;

  const tone = {
    info: 'border-line bg-surface text-ink',
    success: 'border-success/40 bg-surface text-ink',
    error: 'border-danger/40 bg-surface text-ink'
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[65] flex flex-col gap-2" aria-live="polite">
      {notices.map((notice) => (
        <button
          key={notice.id}
          type="button"
          onClick={() => onDismiss(notice.id)}
          className={`pointer-events-auto max-w-sm rounded-btn border px-4 py-3 text-left text-sm shadow-lg ${
            tone[notice.type] || tone.info
          }`}
        >
          {notice.message}
        </button>
      ))}
    </div>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast 必須在 ToastProvider 內使用');
  return value;
}
