/**
 * UserManagementPage.jsx — 權限管理畫面（路由 /users）
 *
 * 取代舊檔：無。舊系統從來沒有這一頁——js/msalAuth.js:133 的 checkPermissions
 * 只回答「我能不能進來」，「誰可以進來」一律要工程師手動改資料表。
 * 這一頁把另一半補上，資料全部走 services/permissionsApi.js。
 *
 * ── 這一頁必須誠實的三件事 ─────────────────────────────────────────────
 * 1. 權限守衛不能只靠導覽列藏連結。AppShell 的 NAV_ITEMS 對 /users 設了
 *    superAdminOnly，但那只是「不顯示」；使用者仍可直接輸入 #/users。
 *    因此這裡自己再判斷一次 auth.isSuperAdmin，不夠格就只渲染「禁止存取」。
 * 2. 舊的 Google Apps Script 後端沒有 /permissions* 這些路由（它們只存在於
 *    內網的 Azure Functions）。gas 模式下寫入必定失敗，所以直接停用新增與
 *    移除控制項並說明原因，而不是讓使用者按下去之後吃一個網路錯誤。
 *    判斷用 isUserManagementAvailable()：本機開發（isLocal）寫 localStorage
 *    是可行的，只有「非本機 + backend 不是 rest」才真的不能寫。
 * 3. 移除最後一位超級管理員 = 所有人被永久鎖在系統外，只能請 DBA 手動救援。
 *    這是本頁唯一不可逆的錯誤，因此在送出前就擋下，不讓它走到後端。
 *
 * 樣式：按鈕／標籤／輸入框一律用 app.css 的 class（透過 components/ui），
 * Tailwind 只負責排版、間距與 token 色，不出現任何原始色階 utility。
 * 對話框一律走 useToast()，沒有 alert() / confirm()。
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';

import { Button, Card, EmptyState, Icon, Input, Tag } from '../components/ui/index.js';
import {
  ROLES,
  USER_MANAGEMENT_HINT,
  addUser,
  getPermissions,
  isUserManagementAvailable,
  removeUser,
  roleLabel
} from '../services/permissionsApi.js';
import { useAuth } from '../state/AuthContext.jsx';
import { useToast } from '../state/ToastContext.jsx';

/**
 * 每個角色在畫面上的圖示與標籤顏色。
 * 這裡只放「呈現」用的資訊，角色本身的定義（value / bucket / label / description）
 * 一律以 permissionsApi.js 的 ROLES 為準，不在這裡複製一份。
 */
const ROLE_META = {
  superAdmin: { icon: 'shield-check', tone: 'orange' },
  admin: { icon: 'user-gear', tone: 'blue' },
  allowedUser: { icon: 'user', tone: 'gray' }
};

/** 新增表單的預設角色：最小權限原則，要給更高的角色必須是刻意的動作 */
const DEFAULT_ROLE = 'allowedUser';

/**
 * 寬鬆的信箱檢查，與 permissionsApi.js 的 isEmailLike 規則一致：
 * 只要求 a@b，不強制頂級網域，因為內網信箱可能長得像 user@intranet。
 * 這裡先擋一次，是為了讓使用者在按下按鈕前就看到錯誤，而不是等網路來回。
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

/** 移除最後一位超級管理員時要說清楚的後果 */
const LAST_SUPER_ADMIN_MESSAGE =
  '系統至少要保留一位超級管理員。移除最後一位之後，就再也沒有人能開啟這個畫面把權限加回來，' +
  '所有人都會被永久鎖在系統外，只能請資料庫管理員直接改資料表救援。\n\n' +
  '請先新增另一位超級管理員，再回來移除這一位。';

/** 取得角色定義（找不到就回 undefined，呼叫端自行處理） */
function roleDefOf(value) {
  return ROLES.find((item) => item.value === value);
}

/* ══════════════════════════════════════════════════════════════════════
   小區塊
   ══════════════════════════════════════════════════════════════════════ */

/** gas 模式的唯讀說明橫幅 */
function ReadOnlyBanner() {
  return (
    <div className="flex items-start gap-3 rounded-card border border-line bg-fill p-4" role="status">
      <Icon name="warning-circle" size={22} className="mt-0.5 shrink-0 text-warning" />
      <div className="min-w-0 text-sm">
        <p className="m-0 font-semibold text-ink">目前為唯讀模式，無法新增或移除使用者</p>
        <p className="m-0 mt-1 text-ink-secondary">{USER_MANAGEMENT_HINT}</p>
        <p className="m-0 mt-1 text-ink-secondary">
          內網切換完成後，這一頁的新增與移除功能會自動生效；在那之前，白名單仍由後端人員直接維護。
        </p>
      </div>
    </div>
  );
}

/** 目前登入者自己的角色：任何模式下都看得到，不需要寫入權限 */
function MyAccessCard({ email, roleValue, isAllowed }) {
  const meta = roleValue ? ROLE_META[roleValue] : null;

  return (
    <Card title="我的存取權限" subtitle="這是目前這個登入階段在系統中的角色">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-fill">
          <Icon name={meta?.icon || 'user'} size={22} className="text-ink-secondary" />
        </span>
        <div className="min-w-0">
          <p className="m-0 truncate text-base font-semibold text-ink">{email || '（未取得帳號）'}</p>
          <p className="m-0 mt-1 text-sm text-ink-secondary">
            {isAllowed ? '已通過白名單驗證' : '尚未取得系統存取權'}
          </p>
        </div>
        <div className="ml-auto">
          {roleValue ? (
            <Tag color={meta?.tone || 'gray'} icon={meta?.icon}>
              {roleLabel(roleValue)}
            </Tag>
          ) : (
            <Tag color="gray">無角色</Tag>
          )}
        </div>
      </div>
    </Card>
  );
}

/** 單一角色的成員清單 */
function RoleBucketCard({ roleDef, members, currentEmail, canWrite, pendingEmail, onRemove }) {
  const meta = ROLE_META[roleDef.value] || {};

  return (
    <Card
      title={roleDef.label}
      subtitle={roleDef.description}
      actions={
        <Tag color={meta.tone || 'gray'} icon={meta.icon}>
          {members.length} 人
        </Tag>
      }
    >
      {members.length === 0 ? (
        <p className="m-0 text-sm text-ink-secondary">目前沒有成員。</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {members.map((member) => (
            <li
              key={member}
              className="flex items-center justify-between gap-3 rounded-btn bg-fill px-4 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon name="envelope-simple" className="shrink-0 text-ink-secondary" />
                <span className="truncate text-sm text-ink" title={member}>
                  {member}
                </span>
                {member === currentEmail ? <Tag color="blue">你自己</Tag> : null}
              </span>

              <Button
                variant="danger"
                size="sm"
                icon="trash"
                aria-label={`移除 ${member} 的${roleDef.label}權限`}
                title={canWrite ? `移除 ${member}` : USER_MANAGEMENT_HINT}
                disabled={!canWrite}
                loading={pendingEmail === member}
                onClick={() => onRemove(member, roleDef.value)}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   主畫面
   ══════════════════════════════════════════════════════════════════════ */

export function UserManagementPage() {
  const auth = useAuth();
  const toast = useToast();

  /** 寫入是否可用：本機開發或內網 rest 後端才為 true */
  const canWrite = isUserManagementAvailable();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [role, setRole] = useState(DEFAULT_ROLE);
  const [formError, setFormError] = useState('');
  const [adding, setAdding] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');

  const roleSelectId = useId();

  /** 目前登入者的信箱：permissions 是後端說的，account 是登入時填的 */
  const currentEmail = String(auth.permissions?.email || auth.account?.username || '')
    .trim()
    .toLowerCase();

  /** 目前登入者的角色，由 AuthContext 已經算好的布林值推導 */
  const myRoleValue = auth.isSuperAdmin
    ? 'superAdmin'
    : auth.isAdmin
      ? 'admin'
      : auth.isAllowed
        ? 'allowedUser'
        : null;

  const selectedRoleDef = roleDefOf(role);

  const totalMembers = useMemo(() => {
    if (!data) return 0;
    return ROLES.reduce((sum, item) => sum + (data[item.bucket]?.length || 0), 0);
  }, [data]);

  /* ── 讀取名單 ── */

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getPermissions();
      setData(result);
    } catch (err) {
      setError(err?.message || '讀取權限名單失敗，請稍後再試。');
    } finally {
      setLoading(false);
    }
  }, []);

  // 不是超級管理員就完全不發請求：後端也會擋，但沒必要先送一次注定被拒絕的請求
  useEffect(() => {
    if (!auth.isSuperAdmin) {
      setLoading(false);
      return;
    }
    void load();
  }, [auth.isSuperAdmin, load]);

  /* ── 新增使用者 ── */

  async function handleAdd(event) {
    event.preventDefault();
    if (!canWrite || adding) return;

    const value = email.trim().toLowerCase();
    if (!value) {
      setFormError('請輸入使用者信箱');
      return;
    }
    if (!EMAIL_PATTERN.test(value)) {
      setFormError('信箱格式不正確，請輸入類似 name@example.com 的位址');
      return;
    }
    if (!roleDefOf(role)) {
      setFormError('請選擇角色');
      return;
    }

    setFormError('');
    setAdding(true);
    try {
      await addUser(value, role);
      setEmail('');
      setRole(DEFAULT_ROLE);
      toast.notify(`已將 ${value} 設為${roleLabel(role)}`, 'success');
      await load();
    } catch (err) {
      // 服務層會丟出中文訊息（格式錯誤、角色不合法、後端不支援）
      toast.alert(err?.message || '新增使用者失敗，請稍後再試。', '新增失敗');
    } finally {
      setAdding(false);
    }
  }

  /* ── 移除使用者 ── */

  function handleRemove(target, targetRole) {
    if (!canWrite || pendingEmail) return;

    const roleDef = roleDefOf(targetRole);
    const label = roleDef?.label || roleLabel(targetRole);

    // 這是本頁唯一不可逆的操作，在任何網路動作之前先擋下來
    const superAdmins = data?.superAdmins || [];
    if (targetRole === 'superAdmin' && superAdmins.length <= 1) {
      toast.alert(LAST_SUPER_ADMIN_MESSAGE, '無法移除最後一位超級管理員');
      return;
    }

    const selfNote =
      target === currentEmail
        ? '\n\n注意：這是你自己的帳號。移除之後，你會立刻失去這個畫面的存取權，必須請其他超級管理員把你加回來。'
        : '';

    toast.confirm(
      `確定要移除 ${target} 的「${label}」權限嗎？${selfNote}`,
      async () => {
        setPendingEmail(target);
        try {
          await removeUser(target, targetRole);
          toast.notify(`已移除 ${target} 的${label}權限`, 'success');
          await load();
        } catch (err) {
          toast.alert(err?.message || '移除使用者失敗，請稍後再試。', '移除失敗');
        } finally {
          setPendingEmail('');
        }
      },
      '移除使用者權限',
      { confirmLabel: '移除', cancelLabel: '取消' }
    );
  }

  /* ══════════════════ 狀態一：沒有權限看這一頁 ══════════════════ */

  if (!auth.isSuperAdmin) {
    return (
      <Card>
        <EmptyState
          icon="prohibit"
          title="禁止存取"
          message="權限管理僅限超級管理員使用。如果你認為這是設定錯誤，請聯絡系統的超級管理員為你調整角色。"
        />
      </Card>
    );
  }

  /* ══════════════════ 狀態二～五：正常畫面 ══════════════════ */

  return (
    <div className="flex flex-col gap-5">
      {/* 頁首 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-2xl font-semibold text-ink">權限管理</h1>
          <p className="m-0 mt-1 text-sm text-ink-secondary">
            決定哪些帳號可以登入系統，以及各自的角色。
            {data ? `目前共 ${totalMembers} 個帳號。` : ''}
          </p>
        </div>
        <Button
          variant="secondary"
          icon="arrows-clockwise"
          loading={loading}
          onClick={() => void load()}
        >
          重新載入
        </Button>
      </div>

      {!canWrite ? <ReadOnlyBanner /> : null}

      <MyAccessCard email={currentEmail} roleValue={myRoleValue} isAllowed={auth.isAllowed} />

      {/* 讀取失敗：名單還在的話保留名單，只在上方顯示錯誤 */}
      {error ? (
        <div
          className="flex items-start gap-3 rounded-card border border-line bg-fill p-4"
          role="alert"
        >
          <Icon name="warning-circle" size={22} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0 text-sm">
            <p className="m-0 font-semibold text-ink">讀取權限名單失敗</p>
            <p className="m-0 mt-1 text-ink-secondary">{error}</p>
          </div>
          <div className="ml-auto shrink-0">
            <Button variant="secondary" size="sm" icon="arrow-clockwise" onClick={() => void load()}>
              重試
            </Button>
          </div>
        </div>
      ) : null}

      {/* 新增使用者 */}
      <Card title="新增使用者" subtitle="信箱必須與登入系統時使用的帳號一致，大小寫不拘。">
        <form onSubmit={handleAdd} noValidate>
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <Input
              label="使用者信箱"
              type="email"
              icon="envelope-simple"
              placeholder="name@example.com"
              value={email}
              error={formError}
              disabled={!canWrite || adding}
              wrapperClassName="flex-1 min-w-0"
              onChange={(event) => {
                setEmail(event.target.value);
                if (formError) setFormError('');
              }}
            />

            <Input
              as="select"
              id={roleSelectId}
              label="角色"
              hint={selectedRoleDef?.description || ''}
              value={role}
              disabled={!canWrite || adding}
              wrapperClassName="w-full md:w-56"
              onChange={(event) => setRole(event.target.value)}
            >
              {ROLES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Input>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button
              type="submit"
              icon="user-plus"
              loading={adding}
              disabled={!canWrite}
              title={canWrite ? undefined : USER_MANAGEMENT_HINT}
            >
              新增使用者
            </Button>
            <span className="text-sm text-ink-secondary">
              一個帳號只會屬於一個角色；重複新增會以最後一次選擇的角色為準。
            </span>
          </div>
        </form>
      </Card>

      {/* 名單 */}
      {loading && !data ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 py-10" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <p className="m-0 text-sm text-ink-secondary">正在讀取權限名單…</p>
          </div>
        </Card>
      ) : data ? (
        <div className="flex flex-col gap-5">
          {ROLES.map((roleDef) => (
            <RoleBucketCard
              key={roleDef.value}
              roleDef={roleDef}
              members={data[roleDef.bucket] || []}
              currentEmail={currentEmail}
              canWrite={canWrite}
              pendingEmail={pendingEmail}
              onRemove={handleRemove}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon="users-three"
            title="沒有可顯示的名單"
            message="目前讀不到任何權限資料。請確認後端設定，或按「重新載入」再試一次。"
            action={
              <Button variant="secondary" icon="arrows-clockwise" onClick={() => void load()}>
                重新載入
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );
}

export default UserManagementPage;
