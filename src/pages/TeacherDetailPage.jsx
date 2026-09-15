/**
 * TeacherDetailPage.jsx — 教師個人檔案（唯讀）
 *
 * 取代舊檔：teacher-management.html 的 viewTeacherDetail()（:2138）與它呼叫的
 * renderSubjectSection()（:2103）。舊版是把整份個人檔案用樣板字串組成 HTML
 * 之後塞進 #teacherDetailContent 的 innerHTML；教師姓名、經歷、證書名稱、
 * 標籤全部未經跳脫就串進去，是一條儲存型 XSS 路徑。改成 React 節點之後，
 * 所有文字都由 React 自動跳脫，本檔沒有任何 dangerouslySetInnerHTML。
 *
 * ── 本階段刻意不提供編輯 ─────────────────────────────────────────────
 * 舊版這一頁底部有一顆「編輯師資資料」，按下去會切換到一整套以 DOM 當資料
 * 模型的表單（欄位值散在各個 input 裡，送出時再爬回來）。那套表單沒有草稿
 * 物件可以移植，屬於獨立的一個階段，所以這裡不放任何會騙人的編輯／刪除按鈕。
 *
 * ── 檔案連結 ─────────────────────────────────────────────────────────
 * 舊版的「檢視」按鈕是 window.open('') 之後 document.write 一段 HTML，
 * 把檔名與網址直接內插進去。這裡改成一個普通的 <a target="_blank"
 * rel="noopener noreferrer">，網址先過 sanitizeUrl；拿不到安全網址時就不顯示
 * 連結，而不是給一個按了沒反應的按鈕。
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Button, Card, EmptyState, Icon, Tag } from '../components/ui/index.js';
import { SUBJECT_CATEGORIES, teacherTypeOf, workStatusOf } from '../services/teachersApi.js';
import { useData } from '../state/DataContext.jsx';
import { formatDateTime, initialsOf, sanitizeUrl } from '../utils/format.js';

/** 可見焦點外框：純文字連結不是 .btn，吃不到 app.css 的 .btn:focus-visible */
const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** 返回連結的樣式，與 AppShell 導覽連結同一套 token */
const BACK_LINK_CLASS = `inline-flex items-center gap-1.5 rounded-btn px-2 py-1.5 text-sm font-semibold text-ink-secondary transition-colors hover:bg-fill hover:text-ink ${FOCUS_RING}`;

/** 授課項目的呈現順序，與 teachersApi 的對照表一致 */
const SUBJECT_ORDER = ['teach', 'ta', 'video'];

/* ═══════════════════════ 小元件 ═══════════════════════ */

/** 頭像：照片優先，失敗或沒有就用姓名首字（舊版 initial()，:1583） */
function Avatar({ teacher }) {
  const [failed, setFailed] = useState(false);
  const photo = failed ? '' : sanitizeUrl(teacher.photoUrl);

  return (
    <span className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-pill bg-fill text-3xl font-semibold text-ink-secondary">
      {photo ? (
        <img src={photo} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initialsOf(teacher.name)
      )}
    </span>
  );
}

/** 區塊沒有資料時的說明。舊版每一區各寫一份措辭，這裡統一 */
function SectionEmpty({ icon, text }) {
  return (
    <p className="m-0 flex items-center gap-2 py-2 text-sm text-ink-secondary">
      <Icon name={icon} size={18} />
      {text}
    </p>
  );
}

/** 附檔連結。網址不安全或不存在時整個連結不出現 */
function FileLink({ fileName, fileUrl }) {
  const safeUrl = sanitizeUrl(fileUrl);
  if (!safeUrl) return null;

  const label = fileName || '檔案';
  return (
    <a
      href={safeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 rounded-btn px-1.5 py-1 text-sm font-semibold text-primary transition-colors hover:bg-primary-light ${FOCUS_RING}`}
    >
      <Icon name="eye" size={16} />
      <span className="max-w-[16rem] truncate">{label}</span>
      <span className="sr-only">（另開新視窗）</span>
    </a>
  );
}

/** 條列項目共用的外框：淺色底、內距、圓角走 token */
function ListItem({ children }) {
  return <li className="rounded-btn bg-fill px-4 py-3">{children}</li>;
}

/* ═══════════════════════ 各區塊 ═══════════════════════ */

/** 經歷 */
function ExperienceSection({ experiences }) {
  return (
    <Card title="經歷" subtitle={experiences.length > 0 ? `${experiences.length} 筆` : ''}>
      {experiences.length === 0 ? (
        <SectionEmpty icon="note-pencil" text="尚未填寫工作經歷" />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {experiences.map((item, index) => (
            <ListItem key={`exp-${index}`}>
              <span className="text-sm text-ink">{item}</span>
            </ListItem>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** 證照 */
function CertificateSection({ certificates }) {
  return (
    <Card title="證照" subtitle={certificates.length > 0 ? `${certificates.length} 張` : ''}>
      {certificates.length === 0 ? (
        <SectionEmpty icon="trophy" text="尚未填寫證書或資格" />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {certificates.map((cert, index) => (
            <ListItem key={`cert-${index}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 flex-1 text-sm text-ink">{cert.name}</span>
                <FileLink fileName={cert.fileName} fileUrl={cert.fileUrl} />
              </div>
            </ListItem>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * 專長（授課項目）。三種分類共用同一個 subjects 陣列，靠 category 區分。
 *
 * 與舊版的差異：舊版 renderSubjectSection() 在「助教經驗」「影片協作」
 * 沒有資料時直接把整區隱藏，只有「講授課程」會留下空狀態。那會讓人分不清
 * 「沒有資料」和「系統沒這個欄位」。這裡三個分類一律列出，沒有資料就顯示
 * 一行說明，資訊完整而且版面仍然乾淨。
 */
function SubjectSection({ subjects }) {
  return (
    <Card title="專長" subtitle={subjects.length > 0 ? `共 ${subjects.length} 項` : ''}>
      {subjects.length === 0 ? (
        <SectionEmpty icon="books" text="尚未填寫授課項目" />
      ) : (
        <div className="flex flex-col gap-5">
          {SUBJECT_ORDER.map((key) => {
            const category = SUBJECT_CATEGORIES[key];
            const items = subjects.filter((subject) => subject.category === key);

            return (
              <div key={key}>
                <div className="mb-2 flex items-center gap-2">
                  <Icon name={category.icon} size={18} className="text-ink-secondary" />
                  <h4 className="m-0 text-sm font-semibold text-ink">{category.label}</h4>
                  {items.length > 0 ? <Tag color={category.tone}>{items.length} 項</Tag> : null}
                </div>

                {items.length === 0 ? (
                  <p className="m-0 text-sm text-ink-secondary">尚未填寫{category.label}</p>
                ) : (
                  <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">
                    {items.map((subject, index) => (
                      <ListItem key={`${key}-${index}`}>
                        <p className="m-0 text-sm font-medium text-ink">{subject.name}</p>
                        {subject.materials.length > 0 ? (
                          <div className="mt-2 flex flex-col items-start gap-1">
                            {subject.materials.map((material, materialIndex) => (
                              <FileLink
                                key={`${key}-${index}-${materialIndex}`}
                                fileName={material.fileName}
                                fileUrl={material.fileUrl}
                              />
                            ))}
                          </div>
                        ) : null}
                      </ListItem>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** 標籤 */
function TagSection({ tags }) {
  return (
    <Card title="標籤">
      {tags.length === 0 ? (
        <SectionEmpty icon="tag" text="尚未填寫標籤" />
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, index) => (
            <Tag key={`tag-${index}`} color="blue" icon="tag">
              {tag}
            </Tag>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ═══════════════════════ 主體 ═══════════════════════ */

export function TeacherDetailPage() {
  const { id } = useParams();
  const data = useData();
  const teacher = data.getTeacher(id);

  const backLink = (
    <Link to="/teachers" className={BACK_LINK_CLASS}>
      <Icon name="arrow-left" size={16} />
      返回師資列表
    </Link>
  );

  /* ── 名單還沒到手：不要先說「找不到這位教師」 ── */
  if (!teacher && data.loading && data.teachers.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div role="status" aria-live="polite">
          <EmptyState icon="spinner" title="載入教師資料中…" message="正在向伺服器取得師資資料。" />
        </div>
      </div>
    );
  }

  /* ── 載入失敗：這是「拿不到資料」，不是「這個人不存在」 ── */
  if (!teacher && data.error && data.teachers.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
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
      </div>
    );
  }

  /* ── 真的查無此人 ── */
  if (!teacher) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <EmptyState
          icon="user-circle"
          title="找不到這位教師"
          message={`編號「${id}」沒有對應的師資資料，可能已被刪除，或是連結有誤。`}
          action={
            <Link to="/teachers" className={BACK_LINK_CLASS}>
              <Icon name="arrow-left" size={16} />
              回到師資列表
            </Link>
          }
        />
      </div>
    );
  }

  const status = workStatusOf(teacher);
  const type = teacherTypeOf(teacher);
  const modifiedAt = formatDateTime(teacher.lastModifiedAt) || teacher.lastModifiedAt;

  return (
    <div className="flex flex-col gap-4">
      {backLink}

      {/* 身分抬頭 */}
      <Card>
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left">
          <Avatar teacher={teacher} />

          <div className="min-w-0 flex-1">
            <h1 className="m-0 break-words text-2xl font-bold text-ink">
              {teacher.name || '（未命名）'}
            </h1>

            <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              <Tag color={type.tone} icon={type.icon}>
                {type.label}
              </Tag>
              <Tag color={status.tone} icon={status.icon}>
                {status.text}
              </Tag>
              {teacher.teacherCategory === 'new' ? (
                <Tag color="green" icon="user-plus">
                  新進
                </Tag>
              ) : null}
            </div>

            <dl className="m-0 mt-4 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
              {teacher.rank ? (
                <div className="flex items-center justify-center gap-2 sm:justify-start">
                  <dt className="flex items-center gap-1 text-ink-secondary">
                    <Icon name="identification-badge" size={16} />
                    職稱
                  </dt>
                  <dd className="m-0 font-medium text-ink">{teacher.rank}</dd>
                </div>
              ) : null}

              {teacher.email ? (
                <div className="flex items-center justify-center gap-2 sm:justify-start">
                  <dt className="flex items-center gap-1 text-ink-secondary">
                    <Icon name="envelope" size={16} />
                    Email
                  </dt>
                  <dd className="m-0 min-w-0 break-all font-medium text-ink">{teacher.email}</dd>
                </div>
              ) : null}
            </dl>

            {modifiedAt || teacher.lastModifiedBy ? (
              <p className="m-0 mt-3 text-xs text-ink-secondary">
                最後更新
                {modifiedAt ? `：${modifiedAt}` : ''}
                {teacher.lastModifiedBy ? `（${teacher.lastModifiedBy}）` : ''}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      {/* 載入失敗但手上還有舊資料：補一條橫幅，內容照常顯示 */}
      {data.error ? (
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExperienceSection experiences={teacher.experiences} />
        <CertificateSection certificates={teacher.certificates} />
      </div>

      <SubjectSection subjects={teacher.subjects} />
      <TagSection tags={teacher.tags} />

      <p className="m-0 text-center text-xs text-ink-secondary">
        本階段為唯讀檢視，教師資料的編輯功能將於後續版本提供。
      </p>
    </div>
  );
}

export default TeacherDetailPage;
