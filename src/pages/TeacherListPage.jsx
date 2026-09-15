/**
 * TeacherListPage.jsx — 教師名單（卡片列表 + 搜尋 + 篩選）
 *
 * 取代舊檔：teacher-management.html 的「列表」那一半——
 *   renderTeacherGrid()   (:1810)  用 innerHTML 一次組出整個網格
 *   searchTeachers()      (:2597)  兩段式關鍵字搜尋
 *   clearSearch()         (:2693)
 *   以及 :386 那個 id="searchInput" 的搜尋框。
 * 編輯、新增、刪除、拖拉排序、複製師資屬於後續的編輯階段，本頁一律不提供。
 *
 * ── 搜尋規則沿用舊版，不是重新發明 ───────────────────────────────────
 * 1. 關鍵字以「空白或逗號」分隔，每個關鍵字都必須命中（AND，不是 OR）。
 * 2. 先只比對 tags；只要 tags 有任何結果，就只呈現這批結果（舊版註解裡的
 *    [Priority] 優先搜尋）。這是刻意的產品行為：標籤是人工整理過的分類，
 *    命中標籤時不希望被姓名／經歷的模糊命中稀釋。
 * 3. tags 全無命中才退回全欄位搜尋：姓名、Email、師資類型（中英文別名）、
 *    工作狀態（中英文別名）、工作經歷、證書名稱、授課項目名稱與其分類名稱。
 *
 * 與舊版的一處差異：多加了「職稱（rank）」。舊搜尋框的 placeholder 寫著
 * 「輸入教師姓名、職稱關鍵字…」，但 searchTeachers() 從來沒有比對過 rank，
 * 是說明文字與實作對不上的缺口，這裡補上。
 *
 * ── 搜尋高亮不使用 dangerouslySetInnerHTML ───────────────────────────
 * 舊版 highlightMaritimeText()（maritime-courses 那份同樣的實作，:4607）是
 * `new RegExp('(' + 使用者輸入 + ')', 'gi')` 之後 string.replace 進 innerHTML。
 * 使用者輸入直接當成正規表達式，既會因為 ( [ 之類的字元讓整個搜尋丟例外，
 * 也是一條 HTML 注入路徑。這裡改成把字串切成 React 節點陣列，
 * 命中的片段包在 <mark> 裡，全程沒有任何一段字串被當成 HTML 解析。
 *
 * ── 資料來源 ─────────────────────────────────────────────────────────
 * 一律讀 useData()，本頁不呼叫任何 API，也不寫 localStorage。
 * 舊版每一頁都自己 loadFromBackend() 再自己 normalize()，那份重複已經收斂到
 * DataContext + teachersApi.normalizeTeacher。
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button, EmptyState, Icon, SearchBar, Tag } from '../components/ui/index.js';
import {
  SUBJECT_CATEGORIES,
  TEACHER_TYPE,
  TEACHER_TYPE_KEYS,
  WORK_STATUS,
  WORK_STATUS_KEYS,
  teacherTypeOf,
  workStatusOf
} from '../services/teachersApi.js';
import { useData } from '../state/DataContext.jsx';
import { initialsOf, sanitizeUrl } from '../utils/format.js';

/** 可見焦點外框：卡片連結不是 .btn，吃不到 app.css 的 .btn:focus-visible */
const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** 篩選器的「全部」選項值 */
const ALL = 'all';

/**
 * 師資類型與工作狀態的中英文別名，取自舊版 searchTeachers()（:2651-:2661）。
 * 比對方向刻意與舊版一致：是「別名包含關鍵字」，不是「關鍵字包含別名」，
 * 所以打一個「船」字就能找到在船的教師。
 */
const TYPE_ALIASES = {
  internal: ['internal', '內部', '內部師資'],
  external: ['external', '外部', '外部師資']
};

const STATUS_ALIASES = {
  onboard: ['onboard', '在船', '海上'],
  onshore: ['onshore', '在岸', '陸地'],
  retired: ['retired', '退休']
};

/* ═══════════════════════ 純函式：關鍵字與比對 ═══════════════════════ */

/** 把搜尋字串切成小寫關鍵字陣列（空白或逗號分隔），沿用舊版 :2610 */
function toKeywords(text) {
  return String(text || '')
    .split(/[,\s]+/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
}

/** 安全的「不分大小寫包含」——兩邊都可能是 null／數字 */
function contains(haystack, needle) {
  return String(haystack || '').toLowerCase().includes(needle);
}

/** 某個關鍵字是否命中這位教師的任一標籤 */
function matchesTag(teacher, keyword) {
  return teacher.tags.some((tag) => contains(tag, keyword));
}

/** 某個關鍵字是否命中這位教師的任一可搜尋欄位（不含 tags） */
function matchesAnyField(teacher, keyword) {
  if (contains(teacher.name, keyword)) return true;
  if (contains(teacher.email, keyword)) return true;
  // 舊版 placeholder 承諾可以搜「職稱」，實作卻漏掉，這裡補上
  if (contains(teacher.rank, keyword)) return true;

  const typeAliases = TYPE_ALIASES[teacher.teacherType] || [];
  if (typeAliases.some((alias) => alias.includes(keyword))) return true;

  const statusAliases = STATUS_ALIASES[teacher.workLocation] || [];
  if (statusAliases.some((alias) => alias.includes(keyword))) return true;

  if (teacher.experiences.some((item) => contains(item, keyword))) return true;
  if (teacher.certificates.some((cert) => contains(cert.name, keyword))) return true;

  return teacher.subjects.some((subject) => {
    if (contains(subject.name, keyword)) return true;
    const category = SUBJECT_CATEGORIES[subject.category];
    if (!category) return false;
    return category.label.includes(keyword) || category.short.includes(keyword);
  });
}

/**
 * 兩段式搜尋。回傳 { list, mode }，mode 為 'tag' | 'field' | 'none'，
 * 讓結果列可以照舊版的措辭說明這批結果是怎麼來的。
 */
function searchTeachers(teachers, keywords) {
  if (keywords.length === 0) return { list: teachers, mode: 'none' };

  const tagMatched = teachers.filter((teacher) =>
    keywords.every((keyword) => matchesTag(teacher, keyword))
  );
  if (tagMatched.length > 0) return { list: tagMatched, mode: 'tag' };

  const fieldMatched = teachers.filter((teacher) =>
    keywords.every((keyword) => matchesAnyField(teacher, keyword))
  );
  return { list: fieldMatched, mode: 'field' };
}

/* ═══════════════════════ 高亮：切成 React 節點 ═══════════════════════ */

/**
 * 把命中的片段包成 <mark>，其餘留純文字。
 * 不用 RegExp，也不碰 innerHTML：逐字掃描原字串，命中就切一段出來。
 * 長關鍵字優先，避免「海」先吃掉「海上」的前半段。
 */
function Highlight({ text, keywords }) {
  const value = String(text ?? '');
  if (!value || keywords.length === 0) return value;

  const lower = value.toLowerCase();
  // 少數字元（例如土耳其文 İ）小寫後長度會變，索引就對不上了；
  // 這種情況寧可不高亮，也不要切錯字。
  if (lower.length !== value.length) return value;

  // filter(Boolean) 是防呆而不是裝飾：空字串會讓 startsWith 永遠成立、
  // 而 hit.length 是 0，游標不前進就會變成無窮迴圈。
  const sorted = keywords.filter(Boolean).sort((a, b) => b.length - a.length);
  const nodes = [];
  let buffer = '';
  let cursor = 0;
  let key = 0;

  while (cursor < value.length) {
    const hit = sorted.find((keyword) => lower.startsWith(keyword, cursor));
    if (hit) {
      if (buffer) {
        nodes.push(buffer);
        buffer = '';
      }
      key += 1;
      nodes.push(
        <mark key={`hl-${key}`} className="bg-primary-light px-0.5 text-primary">
          {value.slice(cursor, cursor + hit.length)}
        </mark>
      );
      cursor += hit.length;
    } else {
      buffer += value[cursor];
      cursor += 1;
    }
  }
  if (buffer) nodes.push(buffer);

  return nodes;
}

/* ═══════════════════════ 卡片內的小元件 ═══════════════════════ */

/**
 * 頭像：有照片就用照片，沒有（或載入失敗）就用姓名首字。
 * 照片來源可能是 Drive 連結，也可能是舊資料裡的 data: base64，
 * 一律先過 sanitizeUrl（js/security.js:39 的後繼者）。
 */
function Avatar({ teacher }) {
  const [failed, setFailed] = useState(false);
  const photo = failed ? '' : sanitizeUrl(teacher.photoUrl);

  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-pill bg-fill text-lg font-semibold text-ink-secondary">
      {photo ? (
        <img
          src={photo}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initialsOf(teacher.name)
      )}
    </span>
  );
}

/** 師資類型 / 工作狀態 / 新進，三種標籤都由 teachersApi 的對照表決定顏色 */
function TeacherTags({ teacher }) {
  const status = workStatusOf(teacher);
  const type = teacherTypeOf(teacher);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag color={type.tone} icon={type.icon}>
        {type.label}
      </Tag>
      <Tag color={status.tone} icon={status.icon}>
        {status.label}
      </Tag>
      {teacher.teacherCategory === 'new' ? (
        <Tag color="green" icon="user-plus">
          新進
        </Tag>
      ) : null}
    </div>
  );
}

/** 一張教師卡片的內容（連結與非連結兩種外框共用） */
function TeacherCardBody({ teacher, keywords }) {
  const previewSubjects = teacher.subjects.slice(0, 3);
  const restCount = teacher.subjects.length - previewSubjects.length;

  return (
    <>
      <div className="flex items-start gap-3">
        <Avatar teacher={teacher} />
        <div className="min-w-0 flex-1">
          <h3 className="m-0 truncate text-base font-semibold text-ink">
            <Highlight text={teacher.name || '（未命名）'} keywords={keywords} />
          </h3>
          {teacher.rank ? (
            <p className="m-0 mt-0.5 truncate text-sm text-ink-secondary">
              <Highlight text={teacher.rank} keywords={keywords} />
            </p>
          ) : null}
          {teacher.email ? (
            <p className="m-0 mt-0.5 flex items-center gap-1 text-xs text-ink-secondary">
              <Icon name="envelope" size={14} />
              <span className="truncate">
                <Highlight text={teacher.email} keywords={keywords} />
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <TeacherTags teacher={teacher} />

      {previewSubjects.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {previewSubjects.map((subject, index) => (
            <Tag key={`${subject.name}-${index}`} color="gray">
              <Highlight text={subject.name} keywords={keywords} />
            </Tag>
          ))}
          {restCount > 0 ? <span className="text-xs text-ink-secondary">＋{restCount} 項</span> : null}
        </div>
      ) : null}
    </>
  );
}

const CARD_CLASS = 'flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-4';

function TeacherCard({ teacher, keywords }) {
  // 正規化器不會自己補 id（teachersApi 檔頭第 5 點），所以真的可能是空字串。
  // 沒有 id 就連不到 /teachers/:id，這種資料列顯示成不可點的卡片並標示原因。
  const hasId = String(teacher.id) !== '';

  if (!hasId) {
    return (
      <div className={CARD_CLASS}>
        <TeacherCardBody teacher={teacher} keywords={keywords} />
        <p className="m-0 mt-auto flex items-center gap-1 pt-1 text-xs text-ink-secondary">
          <Icon name="warning-circle" size={14} />
          此筆資料缺少編號，無法開啟詳細資料
        </p>
      </div>
    );
  }

  return (
    <Link
      to={`/teachers/${encodeURIComponent(String(teacher.id))}`}
      className={`${CARD_CLASS} transition-colors hover:bg-surface-hover ${FOCUS_RING}`}
      aria-label={`檢視 ${teacher.name || '未命名教師'} 的詳細資料`}
    >
      <TeacherCardBody teacher={teacher} keywords={keywords} />
    </Link>
  );
}

/* ═══════════════════════ 篩選列 ═══════════════════════ */

/**
 * 分段式篩選按鈕。用真的 <button> + aria-pressed，而不是 <select>：
 * 選項只有三、四個，攤開來比下拉選單好按，也不必在頁面裡手寫 .input 樣式。
 */
function FilterGroup({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium text-ink-secondary">{label}</span>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <Button
            key={option.value}
            size="sm"
            variant={active ? 'primary' : 'secondary'}
            icon={option.icon}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════ 主體 ═══════════════════════ */

export function TeacherListPage() {
  const data = useData();

  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  const keywords = useMemo(() => toKeywords(keyword), [keyword]);
  const filtersActive = typeFilter !== ALL || statusFilter !== ALL;
  const anyCriteria = keywords.length > 0 || filtersActive;

  /**
   * 先篩選、再搜尋。
   * 順序是有意義的：第 2 條的「標籤優先」只在目前篩選出來的池子裡判斷，
   * 否則勾了「外部師資」卻因為某個內部師資的標籤命中而被整批換掉。
   */
  const { list: results, mode } = useMemo(() => {
    const pool = data.teachers.filter((teacher) => {
      if (typeFilter !== ALL && teacher.teacherType !== typeFilter) return false;
      if (statusFilter !== ALL && teacher.workLocation !== statusFilter) return false;
      return true;
    });
    return searchTeachers(pool, keywords);
  }, [data.teachers, typeFilter, statusFilter, keywords]);

  function clearAll() {
    setKeyword('');
    setTypeFilter(ALL);
    setStatusFilter(ALL);
  }

  const typeOptions = [
    { value: ALL, label: '全部', icon: 'selection-all' },
    ...TEACHER_TYPE_KEYS.map((key) => ({
      value: key,
      label: TEACHER_TYPE[key].label,
      icon: TEACHER_TYPE[key].icon
    }))
  ];

  const statusOptions = [
    { value: ALL, label: '全部', icon: 'selection-all' },
    ...WORK_STATUS_KEYS.map((key) => ({
      value: key,
      label: WORK_STATUS[key].label,
      icon: WORK_STATUS[key].icon
    }))
  ];

  /** 結果列文字。沿用舊版的措辭，並保留「這是標籤命中」的說明 */
  const quoted = keywords.map((word) => `「${word}」`).join('、');
  let summary;
  if (mode === 'tag') summary = `找到 ${results.length} 位符合標籤 ${quoted} 的教師`;
  else if (mode === 'field') summary = `找到 ${results.length} 位符合 ${quoted} 的教師`;
  else if (filtersActive) summary = `符合篩選條件 ${results.length} 位（共 ${data.teachers.length} 位）`;
  else summary = `共 ${data.teachers.length} 位教師`;

  /* ── 內容區：載入 / 錯誤 / 空 / 名單，四選一 ── */
  let content;

  if (data.loading && data.teachers.length === 0) {
    // 第一次載入才蓋整頁，重新整理時維持既有名單（DataContext 檔頭的 loading 語意）
    content = (
      <div role="status" aria-live="polite">
        <EmptyState icon="spinner" title="載入教師資料中…" message="正在向伺服器取得最新的師資名單。" />
      </div>
    );
  } else if (data.error && data.teachers.length === 0) {
    content = (
      <EmptyState
        icon="warning-circle"
        title="無法載入教師資料"
        message={data.error}
        action={
          <Button variant="primary" icon="arrow-clockwise" onClick={() => data.refresh()}>
            重新載入
          </Button>
        }
      />
    );
  } else if (data.teachers.length === 0) {
    content = (
      <EmptyState
        icon="chalkboard-teacher"
        title="尚未建立任何教師資料"
        message="目前的資料來源沒有任何師資紀錄。本階段為唯讀檢視，新增功能將於後續版本提供。"
      />
    );
  } else if (results.length === 0) {
    content = (
      <EmptyState
        icon="magnifying-glass"
        title="找不到符合的教師"
        message="請嘗試其他關鍵字，或清除目前的搜尋與篩選條件。"
        action={
          <Button variant="secondary" icon="x" onClick={clearAll}>
            清除搜尋與篩選
          </Button>
        }
      />
    );
  } else {
    content = (
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
        {results.map((teacher, index) => (
          <li key={String(teacher.id) || `row-${index}`}>
            <TeacherCard teacher={teacher} keywords={keywords} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 頁首 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-2xl font-bold text-ink">師資管理</h1>
          <p className="m-0 mt-1 text-sm text-ink-secondary">瀏覽與搜尋教師資料（本階段為唯讀檢視）</p>
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

      {/* 搜尋與篩選 */}
      <div className="flex flex-col gap-3">
        <SearchBar
          value={keyword}
          onChange={setKeyword}
          placeholder="搜尋姓名、職稱、Email、經歷、證書、授課項目或標籤…"
        />
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-5">
          <FilterGroup label="師資類型" options={typeOptions} value={typeFilter} onChange={setTypeFilter} />
          <FilterGroup label="工作狀態" options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
        </div>
      </div>

      {/* 載入失敗但手上還有舊資料：補一條橫幅，名單照常顯示 */}
      {data.error && data.teachers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-danger-bg p-3" role="alert">
          <Icon name="warning-circle" size={18} className="text-danger" />
          <p className="m-0 min-w-0 flex-1 text-sm text-danger">
            {data.error}（以下為上次成功載入的資料）
          </p>
          <Button variant="danger" size="sm" icon="arrow-clockwise" onClick={() => data.refresh()}>
            重試
          </Button>
        </div>
      ) : null}

      {/* 結果數量 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-sm text-ink-secondary" role="status" aria-live="polite">
          {summary}
        </p>
        {anyCriteria ? (
          <Button variant="ghost" size="sm" icon="x" onClick={clearAll}>
            清除條件
          </Button>
        ) : null}
      </div>

      {content}
    </div>
  );
}

export default TeacherListPage;
