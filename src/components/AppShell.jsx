/**
 * AppShell.jsx — 全站版面框架與五道權限守衛
 *
 * 取代舊版八個 HTML 頁面各自複製的那一段開場程式：
 *   login.html / crew-login.html            登入表單與錯誤顯示
 *   js/auth.js 的 protectPage()             「沒登入就 alert 再轉頁」
 *   index.html / teacher-management.html /
 *   maritime-courses.html / course-management.html /
 *   teaching-materials.html / crew-portal.html
 *     各自手寫的頁首導覽列、使用者名稱、登出鈕（每頁樣式與判斷都不一樣）
 *
 * 這裡是全站唯一決定「要不要讓你看到路由內容」的地方。守衛順序固定：
 *   1. 尚未初始化          → 置中載入指示
 *   2. 驗證流程本身失敗    → 錯誤卡片 + 重試
 *   3. 未登入              → 登入畫面（本檔案直接渲染，不另開路由）
 *   4. 已登入但不在名單    → 帳號未授權
 *   5. 通過               → 導覽列 + <Outlet />
 * 另外 sessionExpired 是「疊」在第 5 種狀態上的對話框，不是取代它——
 * 路由要保持掛載，使用者未儲存的編輯內容才不會在逾期當下整頁消失
 * （舊版是原生對話框加上直接轉頁，內容當場不見，這正是要修掉的行為）。
 *
 * 樣式：顏色與圓角一律走 app.css 的 token，Tailwind 只負責排版。
 * 導覽：一律使用 react-router 的 <Link> 與狀態切換，不直接改網址列。
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../state/AuthContext.jsx';
import { useToast } from '../state/ToastContext.jsx';
import { Button, Card, Icon, Input, Modal } from './ui/index.js';

/** 產品名稱：與舊版頁首一致 */
const PRODUCT_NAME = '萬海智慧航安訓練管理系統';

/** 手機版選單的 id，給 hamburger 的 aria-controls 指向（元素恆常存在，只切換 hidden） */
const MOBILE_MENU_ID = 'app-shell-mobile-menu';

/**
 * 可見焦點樣式。導覽連結不是 .btn，吃不到 app.css 的 .btn:focus-visible，
 * 所以這裡用 token 色補一組同樣明顯的外框。
 */
const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/**
 * 導覽項目。superAdminOnly 的項目只有超級管理員看得到——
 * 這只是「不顯示」，真正的權限仍由後端與頁面自己把關。
 */
const NAV_ITEMS = [
  { to: '/', label: '首頁', icon: 'house', exact: true },
  { to: '/teachers', label: '教師管理', icon: 'users-three' },
  { to: '/users', label: '權限管理', icon: 'shield-check', superAdminOnly: true }
];

/** 目前路徑是否落在這個導覽項目底下（/teachers/12 仍算在「教師管理」） */
function isActivePath(pathname, item) {
  if (item.exact) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/** 顯示用的使用者名稱，三個欄位依序退而求其次 */
function displayName(account) {
  return account?.name || account?.username || '使用者';
}

/* ══════════════════════════════════════════════════════════════════════
   共用版面：守衛畫面一律置中，最寬 480px
   ══════════════════════════════════════════════════════════════════════ */

function CenteredScreen({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

/** 卡片內共用的「圖示 + 標題 + 說明」開頭 */
function ScreenHeading({ icon, title, tone = 'text-ink-secondary', children }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-pill bg-fill">
        <Icon name={icon} size={28} className={tone} />
      </span>
      <h1 className="m-0 text-lg font-semibold text-ink">{title}</h1>
      {children ? <p className="m-0 text-sm text-ink-secondary">{children}</p> : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   守衛 1：驗證中
   ══════════════════════════════════════════════════════════════════════ */

function LoadingScreen() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-6"
      role="status"
      aria-live="polite"
    >
      <div className="spinner spinner-lg" />
      <p className="m-0 text-sm text-ink-secondary">身分驗證中…</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   守衛 2：驗證流程本身壞了
   ──────────────────────────────────────────────────────────────────────
   這跟「密碼打錯」不同：是設定缺漏、後端沒回應、憑證服務掛掉之類的問題，
   使用者自己改不了，所以只提供「重試」與「重新登入」兩條路，並把原始
   訊息照實顯示出來，方便使用者轉述給資訊人員。
   ══════════════════════════════════════════════════════════════════════ */

function AuthErrorScreen({ message, onRetry, onRelogin }) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');

  async function handleRetry() {
    setRetrying(true);
    setRetryError('');
    try {
      await onRetry();
    } catch (err) {
      setRetryError(err?.message || '重試失敗，請稍後再試一次');
    } finally {
      setRetrying(false);
    }
  }

  return (
    <CenteredScreen>
      <Card padded={false} className="p-6">
        <ScreenHeading icon="warning-circle" title="無法完成身分驗證" tone="text-danger">
          系統在確認您的身分時發生問題，尚未進入任何頁面。
        </ScreenHeading>

        <p
          className="mt-5 whitespace-pre-wrap rounded-btn bg-danger-bg p-3 text-sm text-danger"
          role="alert"
        >
          {message}
        </p>

        {retryError ? (
          <p className="mt-3 m-0 text-sm text-danger" role="alert">
            {retryError}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          <Button variant="primary" block icon="arrow-clockwise" loading={retrying} onClick={handleRetry}>
            重試
          </Button>
          <Button variant="secondary" block icon="sign-in" disabled={retrying} onClick={onRelogin}>
            重新登入
          </Button>
        </div>

        <p className="mt-4 m-0 text-xs text-ink-secondary">
          若重試多次仍失敗，請將上方訊息提供給系統管理員。
        </p>
      </Card>
    </CenteredScreen>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   守衛 3：登入畫面
   ──────────────────────────────────────────────────────────────────────
   兩種驗證模式只會渲染其中一種，由 config.js 的 authMode 決定：
     gas   → 帳號密碼表單（舊 login.html）
     entra → 一顆按鈕轉址到 Microsoft（舊 js/msalAuth.js）
   登入錯誤一律留在表單裡顯示，不用浮動提示——使用者的視線本來就在表單上，
   而且錯誤訊息要能一直留著給他對照，不該四秒後自己消失。
   密碼只存在 state 與請求 body 裡，全檔沒有任何 console 輸出。
   ══════════════════════════════════════════════════════════════════════ */

function LoginScreen({ authMode, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  async function handleCredentialSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const account = username.trim();
    if (!account || !password) {
      setFormError('請輸入帳號與密碼');
      return;
    }

    setFormError('');
    setSubmitting(true);
    try {
      await onLogin({ username: account, password });
      // 成功後 AuthContext 會換掉整個畫面，這裡把密碼從 state 清掉
      setPassword('');
    } catch (err) {
      setFormError(err?.message || '登入失敗，請確認帳號與密碼');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEntraLogin() {
    if (submitting) return;
    setFormError('');
    setSubmitting(true);
    try {
      // 成功時瀏覽器會離開本頁去 Microsoft 登入，因此不會走到 finally 之後
      await onLogin({});
    } catch (err) {
      setFormError(err?.message || '無法開啟公司帳號登入');
      setSubmitting(false);
    }
  }

  return (
    <CenteredScreen>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-card bg-primary-light">
          <Icon name="anchor" size={28} className="text-primary" />
        </span>
        <h1 className="m-0 text-xl font-bold text-ink">{PRODUCT_NAME}</h1>
        <p className="m-0 text-sm text-ink-secondary">請先登入以繼續</p>
      </div>

      <Card padded={false} className="p-6">
        {formError ? (
          <p className="mb-4 m-0 rounded-btn bg-danger-bg p-3 text-sm text-danger" role="alert">
            {formError}
          </p>
        ) : null}

        {authMode === 'gas' ? (
          <form onSubmit={handleCredentialSubmit} noValidate>
            <div className="flex flex-col gap-4">
              <Input
                label="帳號"
                icon="user"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                disabled={submitting}
                placeholder="請輸入帳號"
              />

              {/* 顯示／隱藏切換放在欄位右側而非疊在輸入框上：
                  <Input> 的內部結構不開放插入子元素，用絕對定位去對齊會隨字級漂移。 */}
              <div className="flex items-end gap-2">
                <Input
                  wrapperClassName="min-w-0 flex-1"
                  label="密碼"
                  icon="lock-key"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={submitting}
                  placeholder="請輸入密碼"
                />
                <Button
                  variant="secondary"
                  size="lg"
                  icon={showPassword ? 'eye-slash' : 'eye'}
                  aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                  aria-pressed={showPassword}
                  disabled={submitting}
                  onClick={() => setShowPassword((value) => !value)}
                />
              </div>

              <Button type="submit" variant="primary" size="lg" block loading={submitting}>
                {submitting ? '登入中…' : '登入'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              size="lg"
              block
              icon="sign-in"
              loading={submitting}
              onClick={handleEntraLogin}
            >
              使用公司帳號登入
            </Button>
            <p className="m-0 text-center text-xs text-ink-secondary">
              將轉往 Microsoft 登入頁面，完成後自動回到本系統。
            </p>
          </div>
        )}
      </Card>
    </CenteredScreen>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   守衛 4：登入成功但帳號不在允許名單
   ══════════════════════════════════════════════════════════════════════ */

function UnauthorizedScreen({ account, permissions, onRecheck, onLogout }) {
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const identity = account?.username || permissions?.email || displayName(account);

  async function handleRecheck() {
    setChecking(true);
    setCheckError('');
    try {
      await onRecheck();
    } catch (err) {
      setCheckError(err?.message || '重新檢查失敗，請稍後再試');
    } finally {
      setChecking(false);
    }
  }

  return (
    <CenteredScreen>
      <Card padded={false} className="p-6">
        <ScreenHeading icon="prohibit" title="帳號未授權" tone="text-warning">
          您已經成功登入，但這個帳號尚未取得本系統的使用權限。
        </ScreenHeading>

        <div className="mt-5 rounded-btn bg-fill p-4">
          <p className="m-0 text-xs text-ink-secondary">目前登入的帳號</p>
          <p className="m-0 mt-1 break-all text-sm font-semibold text-ink">{identity}</p>
        </div>

        <p className="mt-4 m-0 text-sm text-ink-secondary">
          請聯絡系統管理員，將上述帳號加入允許名單；若您剛剛才被加入，請按「重新檢查權限」。
        </p>

        {checkError ? (
          <p className="mt-3 m-0 text-sm text-danger" role="alert">
            {checkError}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          <Button variant="primary" block icon="arrow-clockwise" loading={checking} onClick={handleRecheck}>
            重新檢查權限
          </Button>
          <Button variant="secondary" block icon="sign-out" disabled={checking} onClick={onLogout}>
            登出並改用其他帳號
          </Button>
        </div>
      </Card>
    </CenteredScreen>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   導覽列
   ──────────────────────────────────────────────────────────────────────
   白底 + 底部細線 + ink 文字，主色只留給「目前頁面」與主要動作。
   ≥768px 橫向排列；<768px 收成 hamburger，面板恆常存在只切換 hidden，
   這樣 aria-controls 永遠指得到實際節點。
   ══════════════════════════════════════════════════════════════════════ */

function NavItemLink({ item, active, block = false, onNavigate }) {
  const base = [
    'flex items-center gap-2 rounded-btn text-sm font-semibold transition-colors',
    block ? 'w-full px-3 py-3' : 'px-3 py-2',
    active ? 'bg-primary-light text-primary' : 'text-ink-secondary hover:bg-fill hover:text-ink',
    FOCUS_RING
  ].join(' ');

  return (
    <Link to={item.to} className={base} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
      <Icon name={item.icon} size={18} />
      <span>{item.label}</span>
    </Link>
  );
}

function NavBar({ account, isSuperAdmin, onLogout }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = NAV_ITEMS.filter((item) => !item.superAdminOnly || isSuperAdmin);
  const name = displayName(account);

  // 換頁後自動收起選單，否則手機上點完連結選單還蓋在內容上
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Esc 收起選單：鍵盤使用者不必 Tab 回去按那顆 hamburger
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
        <Link
          to="/"
          className={`flex min-w-0 items-center gap-2 rounded-btn text-ink ${FOCUS_RING}`}
          aria-label={`${PRODUCT_NAME} 首頁`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-primary-light">
            <Icon name="anchor" size={20} className="text-primary" />
          </span>
          <span className="truncate text-sm font-bold md:text-base">{PRODUCT_NAME}</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="主要導覽">
          {items.map((item) => (
            <NavItemLink key={item.to} item={item} active={isActivePath(location.pathname, item)} />
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          <span className="flex items-center gap-2 rounded-pill bg-fill px-3 py-1.5 text-sm text-ink">
            <Icon name="user-circle" size={18} className="text-ink-secondary" />
            <span className="max-w-[12rem] truncate">{name}</span>
          </span>
          <Button variant="ghost" size="sm" icon="sign-out" onClick={onLogout}>
            登出
          </Button>
        </div>

        <Button
          className="ml-auto md:hidden"
          variant="plain"
          icon={menuOpen ? 'x' : 'list'}
          aria-label={menuOpen ? '關閉主選單' : '開啟主選單'}
          aria-expanded={menuOpen}
          aria-controls={MOBILE_MENU_ID}
          onClick={() => setMenuOpen((value) => !value)}
        />
      </div>

      {/* 手機版面板：永遠在 DOM 裡，靠 hidden 屬性開關，md 以上一律不顯示 */}
      <div id={MOBILE_MENU_ID} hidden={!menuOpen} className="border-t border-line px-4 py-3 md:hidden">
        <nav className="flex flex-col gap-1" aria-label="主要導覽（手機版）">
          {items.map((item) => (
            <NavItemLink
              key={item.to}
              item={item}
              active={isActivePath(location.pathname, item)}
              block
              onNavigate={() => setMenuOpen(false)}
            />
          ))}
        </nav>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
            <Icon name="user-circle" size={18} className="text-ink-secondary" />
            <span className="truncate">{name}</span>
          </span>
          <Button variant="ghost" size="sm" icon="sign-out" onClick={onLogout}>
            登出
          </Button>
        </div>
      </div>
    </header>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   逾期對話框：疊在第 5 種狀態之上，底下的路由保持掛載
   ══════════════════════════════════════════════════════════════════════ */

function SessionExpiredModal({ authMode, onDismiss, onRelogin, onNotify }) {
  const [busy, setBusy] = useState(false);

  async function handleRelogin() {
    if (busy) return;
    setBusy(true);
    try {
      await onRelogin();
    } catch (err) {
      onNotify(err?.message || '無法重新登入，請稍後再試', 'error');
    } finally {
      // entra 模式會在 await 當下離開頁面，根本不會跑到這裡；
      // 帳密模式則會回到登入畫面並把本對話框卸載。兩種情況都不該讓按鈕卡在 loading。
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size="sm"
      title="登入已逾期"
      onClose={onDismiss}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onDismiss}>
            稍後再說
          </Button>
          <Button variant="primary" icon="sign-in" loading={busy} onClick={handleRelogin}>
            重新登入
          </Button>
        </>
      }
    >
      <p className="m-0 text-sm text-ink-secondary">
        伺服器已不再接受目前的登入憑證，接下來的存檔與讀取都會失敗。
      </p>
      <p className="mt-3 m-0 text-sm text-ink-secondary">
        這個頁面的內容仍然保留著。如果手邊有還沒存檔的資料，請先按「稍後再說」把內容複製下來，再回來重新登入。
        {authMode === 'entra'
          ? '重新登入會轉往 Microsoft 登入頁面。'
          : '重新登入會回到帳號密碼畫面。'}
      </p>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   主體
   ══════════════════════════════════════════════════════════════════════ */

export function AppShell() {
  const auth = useAuth();
  const toast = useToast();

  // 重試成功後要能離開錯誤畫面，但 AuthContext 沒有對外的 error 清除方法，
  // 所以由這一層記住「這則錯誤已經被重試解掉了」；換了新的錯誤訊息就重新計算。
  const [errorCleared, setErrorCleared] = useState(false);

  useEffect(() => {
    setErrorCleared(false);
  }, [auth.error]);

  const handleRetryAuth = useCallback(async () => {
    // entra 模式會重打 /permissions/check；gas／本機模式沒有這支請求，
    // 直接回傳現有權限，畫面隨即落到登入畫面或主畫面，兩者都是合理的復原點。
    await auth.refreshPermissions();
    setErrorCleared(true);
  }, [auth]);

  const handleLogout = useCallback(async () => {
    try {
      await auth.logout();
    } catch (err) {
      toast.notify(err?.message || '登出時發生問題，請重新整理頁面', 'error');
    }
  }, [auth, toast]);

  const handleRelogin = useCallback(async () => {
    if (auth.authMode === 'entra') {
      // 轉址到 Microsoft，回來後由 initializeAuth 還原狀態
      await auth.login({});
      return;
    }
    // 帳密模式沒有靜默續期的機制，清掉逾期憑證讓守衛 3 接手
    await auth.logout();
  }, [auth]);

  /* ── 守衛 1：初始化中 ── */
  if (!auth.ready) return <LoadingScreen />;

  /* ── 守衛 2：驗證流程本身失敗 ── */
  if (auth.error && !errorCleared) {
    return <AuthErrorScreen message={auth.error} onRetry={handleRetryAuth} onRelogin={handleLogout} />;
  }

  /* ── 守衛 3：未登入（本機開發模式不需要登入） ── */
  if (!auth.account && !auth.isLocal) {
    return <LoginScreen authMode={auth.authMode} onLogin={auth.login} />;
  }

  /* ── 守衛 4：登入了但不在允許名單 ── */
  if (auth.permissions && !auth.isAllowed) {
    return (
      <UnauthorizedScreen
        account={auth.account}
        permissions={auth.permissions}
        onRecheck={auth.refreshPermissions}
        onLogout={handleLogout}
      />
    );
  }

  /* ── 守衛 5：正式畫面 ── */
  return (
    <div className="min-h-screen">
      <NavBar account={auth.account} isSuperAdmin={auth.isSuperAdmin} onLogout={handleLogout} />

      {/* tabIndex=-1：頁面切換時可由程式把焦點移進來；
          不放「跳到主要內容」錨點連結，因為本站用 HashRouter，
          href="#main" 會覆蓋掉路由的 hash。 */}
      <main id="app-main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 focus:outline-none">
        <Outlet />
      </main>

      {auth.sessionExpired ? (
        <SessionExpiredModal
          authMode={auth.authMode}
          onDismiss={auth.dismissSessionExpired}
          onRelogin={handleRelogin}
          onNotify={toast.notify}
        />
      ) : null}
    </div>
  );
}

export default AppShell;
