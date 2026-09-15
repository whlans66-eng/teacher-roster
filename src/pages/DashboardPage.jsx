/**
 * DashboardPage.jsx — 首頁／模組啟動器
 *
 * 取代舊檔：index.html（整頁，含它自己那份 <style>、showComingSoonModal()
 * 以及 protectPage() 開場腳本）。
 *
 * ── 保留舊版的意圖 ───────────────────────────────────────────────────
 * 舊 index.html 的唯一職責就是「選一個模組進去」，四張大卡片分別連到
 * teacher-management.html / course-management.html / maritime-courses.html /
 * teaching-materials.html。這一頁保留同樣的四個模組與同樣的文案，
 * 但只有「師資管理」在本階段有對應的路由（/teachers）。
 *
 * ── 未完成的模組不做成連結 ───────────────────────────────────────────
 * 舊版四張卡片全都是 <a href="...html">，其中三個目標在 React 版裡還不存在，
 * 直接照抄會變成點下去 404 的死連結。這裡改成「不可點的說明卡 + 即將推出標籤」：
 * 使用者看得到系統將有哪些模組，但不會被帶到壞掉的頁面。
 * 舊版那個用 document.createElement 疊出來的 showComingSoonModal() 一併移除——
 * 它的存在是因為卡片一定要可點；卡片不可點之後就不需要那個對話框了。
 *
 * ── 統計數字只用「真的載得到」的資料 ─────────────────────────────────
 * 下方的 StatTile 全部由 useData() 已載入的三張表直接算出來，不呼叫任何
 * 額外 API，也不顯示算不出來的指標（例如「本月上課時數」在目前的資料表
 * 裡沒有來源，就不放）。資料還在路上時顯示破折號，而不是先寫 0 再跳動。
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Button, Card, Icon, StatTile, Tag } from '../components/ui/index.js';
import { isRetired } from '../services/teachersApi.js';
import { useData } from '../state/DataContext.jsx';
import { formatNumber, formatRelativeTime } from '../utils/format.js';

/** 可見焦點外框。卡片連結不是 .btn，吃不到 app.css 的 .btn:focus-visible，故自備一組 */
const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/**
 * 模組清單。title / description 逐字沿用 index.html 的四張卡片，
 * to 有值代表本階段已經有路由，沒有 to 的就是「即將推出」。
 * legacy 只是註記它對應舊版哪一支 HTML，不會被渲染成連結。
 */
const MODULES = [
  {
    key: 'teachers',
    title: '師資管理',
    description: '管理教師資訊、統計分析',
    icon: 'chalkboard-teacher',
    to: '/teachers',
    legacy: 'teacher-management.html'
  },
  {
    key: 'schedule',
    title: '訓練排程',
    description: '安排課程、行事曆',
    icon: 'calendar-dots',
    to: null,
    legacy: 'course-management.html'
  },
  {
    key: 'maritime',
    title: '智慧派課',
    description: '海事專業課程管理與分析',
    icon: 'anchor',
    to: null,
    legacy: 'maritime-courses.html'
  },
  {
    key: 'materials',
    title: '教材管理',
    description: '書籍、影片與數位資源',
    icon: 'books',
    to: null,
    legacy: 'teaching-materials.html'
  }
];

/* ─────────────────────── 模組卡片 ─────────────────────── */

/** 已上線：整張卡片是一個連結，鍵盤 Tab 得到、Enter 進得去 */
function ModuleLink({ module }) {
  return (
    <Link
      to={module.to}
      className={`flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-6 transition-colors hover:bg-surface-hover ${FOCUS_RING}`}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-btn bg-primary-light">
        <Icon name={module.icon} size={26} className="text-primary" />
      </span>
      <span className="text-base font-semibold text-ink">{module.title}</span>
      <span className="text-sm text-ink-secondary">{module.description}</span>
      <span className="mt-auto flex items-center gap-1 pt-2 text-sm font-semibold text-primary">
        進入模組
        <Icon name="arrow-right" size={16} />
      </span>
    </Link>
  );
}

/**
 * 尚未上線：刻意不是連結、也不是 disabled 按鈕。
 * disabled 按鈕會被螢幕閱讀器讀成「一顆按不了的按鈕」，這裡要表達的是
 * 「這塊功能還沒做好」，所以用純敘述 + 標籤，讓輔助技術直接唸出文字。
 */
function ModulePlaceholder({ module }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-card border border-line bg-fill p-6">
      <span className="flex h-12 w-12 items-center justify-center rounded-btn bg-surface">
        <Icon name={module.icon} size={26} className="text-ink-secondary" />
      </span>
      <span className="text-base font-semibold text-ink-secondary">{module.title}</span>
      <span className="text-sm text-ink-secondary">{module.description}</span>
      <span className="mt-auto pt-2">
        <Tag color="gray" icon="clock">
          即將推出
        </Tag>
      </span>
    </div>
  );
}

/* ─────────────────────── 主體 ─────────────────────── */

export function DashboardPage() {
  const data = useData();

  // 第一次載入（畫面上還沒有任何資料）時，統計數字顯示破折號而不是 0
  const pending = data.loading && data.teachers.length === 0;

  const stats = useMemo(() => {
    const total = data.teachers.length;
    const retired = data.teachers.filter((teacher) => isRetired(teacher)).length;
    const onboard = data.teachers.filter((teacher) => teacher.workLocation === 'onboard').length;
    return {
      total,
      retired,
      active: total - retired,
      onboard,
      courses: data.courses.length,
      assignments: data.assignments.length
    };
  }, [data.teachers, data.courses, data.assignments]);

  /** 統計數字的顯示值：載入中一律破折號 */
  const show = (value) => (pending ? '—' : formatNumber(value));

  const syncedAt = data.lastSyncTime ? formatRelativeTime(data.lastSyncTime) : '';

  return (
    <div className="flex flex-col gap-6">
      {/* 頁首：標題 + 重新整理 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-2xl font-bold text-ink">模組總覽</h1>
          <p className="m-0 mt-1 text-sm text-ink-secondary">
            WHL MARITRAIN — 請選擇要進入的模組
            {syncedAt ? ` · 資料更新於 ${syncedAt}` : ''}
          </p>
        </div>
        <Button
          variant="secondary"
          icon="arrow-clockwise"
          loading={data.loading}
          onClick={() => data.refresh()}
        >
          重新整理
        </Button>
      </div>

      {/* 載入失敗：只補一條橫幅，下面的統計與模組照常呈現（資料維持上一次的內容） */}
      {data.error ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-danger-bg p-4"
          role="alert"
        >
          <Icon name="warning-circle" size={20} className="text-danger" />
          <p className="m-0 min-w-0 flex-1 text-sm text-danger">{data.error}</p>
          <Button variant="danger" size="sm" icon="arrow-clockwise" onClick={() => data.refresh()}>
            重試
          </Button>
        </div>
      ) : null}

      {/* 統計：四個數字全部由已載入的三張表直接算出 */}
      <section aria-label="系統統計">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon="users-three"
            label="教師人數"
            value={show(stats.total)}
            hint={pending ? '載入中…' : `在職 ${stats.active} 位 · 退休 ${stats.retired} 位`}
            tone="primary"
          />
          <StatTile
            icon="boat"
            label="在船教師"
            value={show(stats.onboard)}
            hint={pending ? '載入中…' : '目前於海上工作'}
            tone="warning"
          />
          <StatTile
            icon="anchor"
            label="海事課程"
            value={show(stats.courses)}
            hint={pending ? '載入中…' : '已同步的課程資料筆數'}
          />
          <StatTile
            icon="calendar"
            label="排課紀錄"
            value={show(stats.assignments)}
            hint={pending ? '載入中…' : '已同步的排課資料筆數'}
          />
        </div>
      </section>

      {/* 模組入口 */}
      <section aria-labelledby="dashboard-modules-heading">
        <h2 id="dashboard-modules-heading" className="m-0 mb-3 text-base font-semibold text-ink">
          系統模組
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((module) =>
            module.to ? (
              <ModuleLink key={module.key} module={module} />
            ) : (
              <ModulePlaceholder key={module.key} module={module} />
            )
          )}
        </div>
      </section>

      {/* 舊版首頁底部的版權列 */}
      <Card>
        <p className="m-0 text-center text-xs text-ink-secondary">
          © {new Date().getFullYear()} 萬海智慧航安訓練管理系統 (WHL MARITRAIN)
        </p>
      </Card>
    </div>
  );
}

export default DashboardPage;
