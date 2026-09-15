/**
 * format.js — 全站唯一的格式化與跳脫工具
 *
 * 對應舊檔：
 *   js/security.js                     escapeHtml / escapeAttr / sanitizeUrl
 *   maritime-courses.html:3704         escapeHtml（用 DOM 實作的版本，已淘汰）
 *   course-management.html:1573        getLocalDateString → formatDate
 *   course-management.html:4017-4026   時間戳格式化 → formatDateTime / formatRelativeTime
 *   course-management.html:1553-1569   「X 分鐘前」 → formatRelativeTime
 *   course-management.html:1753/2131   zh-TW 長格式日期 → formatDateDisplay
 *   course-management.html:2229/2282   同上
 *   teacher-management.html:1420       formatDateTimeForStatus → formatDateTime
 *   teacher-management.html:2986/2755  fmtDate / 年月字串 → formatDate
 *   teacher-management.html:3851       課程卡片日期 → formatDateDisplay
 *   crew-portal.html:1048/1252         姓名首字頭像 → initialsOf
 *   teaching-materials.html:904/1108   同上
 *   fix-sync-issue.html:235/274        KB / MB 換算 → formatFileSize
 *
 * 舊版每一頁都自己重寫一份，行為互相不一致（有的會少一天、有的會噴例外）。
 * 這裡收斂成單一權威版本：全部是純函式，全部容忍 null / undefined / ''，
 * 任何一個都不會丟出例外。
 *
 * ── 時區正確性（本檔最重要的一件事）─────────────────────────────────
 * 「純日期少一天」的 bug 有兩個方向，舊程式兩個都踩得到：
 *
 *   (a) 解析端：new Date('2026-09-15')。依 ECMAScript 規範，只有日期沒有時間的
 *       ISO 字串會被當成「UTC 午夜」；顯示時換回本地時區，在 UTC 以西
 *       （例如 America/New_York）就變成 9/14。
 *   (b) 輸出端：new Date(2026, 8, 15).toISOString().slice(0, 10)。本地午夜換算成
 *       UTC 會往前跨日，在 UTC+8（台北，也就是本系統的實際使用時區）
 *       就得到 '2026-09-14'。這個方向才是我們線上會遇到的那一個。
 *
 * 排課系統的 course.date 全部是純日期，一旦發生就是整個月曆錯位。
 *
 * 本檔的對策是：
 *   1. 解析端：parseDateInput 自己拆字串，純日期一律用 new Date(y, m-1, d) 建成
 *      「本地行事曆日期」，完全不經過 Date 建構子的字串解析路徑。
 *   2. 只有帶時區標記（Z 或 +08:00）的字串才視為「絕對時間點」，交給原生解析。
 *   3. 輸出端：formatDate / formatDateTime / formatDateDisplay 一律用
 *      getFullYear / getMonth / getDate 這組「本地」取值，本檔完全不使用
 *      toISOString()。日期進出都留在同一個時區，就沒有換算可以出錯。
 * 只要所有頁面都走這裡，這兩個方向的 bug 都不可能再出現。
 */

/* ────────────────────────────── HTML 跳脫 ────────────────────────────── */

/**
 * HTML 特殊字元跳脫（防 XSS）。
 * 沿用 js/security.js:9 的字串版實作，不碰 DOM，所以可在測試與 SSR 環境使用。
 * React 預設就會跳脫文字節點，這個函式只留給少數仍需自行組裝 HTML 的地方
 * （匯出 HTML 報表、dangerouslySetInnerHTML 的內容）。
 *
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * HTML 屬性值跳脫（防屬性注入）。對應 js/security.js:27。
 *
 * @param {*} value
 * @returns {string}
 */
export function escapeAttr(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 會執行腳本的協定，一律擋掉。 */
const UNSAFE_URL_SCHEMES = ['javascript:', 'vbscript:', 'file:'];

/**
 * 用碼位（code point）組出字元類別的 RegExp。
 *
 * 為什麼不直接寫 regex 字面量：這幾個類別要比對的是控制字元與零寬字元，
 * 若原始碼裡塞入那些字元本體，檔案會被 grep / diff 當成二進位檔，
 * code review 也完全看不出改了什麼。改用數字碼位描述，原始碼維持純可讀 ASCII。
 *
 * @param {Array<number|number[]>} ranges 單一碼位，或 [起, 迄] 區間
 * @param {string} [flags]
 * @returns {RegExp}
 */
function charClassFromRanges(ranges, flags) {
  const body = ranges
    .map((range) => {
      const start = Array.isArray(range) ? range[0] : range;
      const end = Array.isArray(range) ? range[1] : range;
      return start === end
        ? String.fromCodePoint(start)
        : `${String.fromCodePoint(start)}-${String.fromCodePoint(end)}`;
    })
    .join('');
  return new RegExp(`[${body}]`, flags);
}

/**
 * 控制字元與零寬字元，判斷協定前要先剝掉。
 * 涵蓋 C0 控制字元、DEL 與 C1 控制字元、零寬字元（ZWSP/ZWNJ/ZWJ）與 BOM。
 */
const INVISIBLE_CHARS_RE = charClassFromRanges(
  [
    [0x0000, 0x001f],
    [0x007f, 0x009f],
    [0x200b, 0x200d],
    0xfeff
  ],
  'g'
);

/**
 * 驗證使用者提供的連結，不安全時回傳 ''。對應 js/security.js:39。
 *
 * 舊版只擋 javascript: / data:text/html / vbscript:，漏掉兩種常見繞道：
 *   1. 協定名稱中間夾控制字元（例如 tab 或換行），HTML 屬性會忽略它們，
 *      瀏覽器仍會執行。
 *   2. data:image/svg+xml —— SVG 內可以放 script，等同任意程式碼執行。
 * 這裡都補上。
 *
 * data: 例外：teacher-management.html:2476 用 FileReader.readAsDataURL 把老師
 * 照片存成 base64，所以 data:image/*（svg 除外）必須放行，否則照片全部消失。
 *
 * @param {*} value
 * @returns {string} 安全的 URL，不安全回傳 ''
 */
export function sanitizeUrl(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  const probe = raw.replace(INVISIBLE_CHARS_RE, '').trim().toLowerCase();
  if (!probe) return '';

  if (UNSAFE_URL_SCHEMES.some((scheme) => probe.startsWith(scheme))) return '';

  if (probe.startsWith('data:')) {
    const isImage = probe.startsWith('data:image/');
    const isSvg = probe.startsWith('data:image/svg');
    return isImage && !isSvg ? raw.trim() : '';
  }

  return raw.trim();
}

/* ────────────────────────────── 一般工具 ────────────────────────────── */

/**
 * 組 className 字串：過濾掉假值後用空白串接。
 * 除了字串，也接受陣列與 { 類名: 條件 } 物件，方便在 JSX 裡寫條件樣式。
 *
 * @param {...*} values
 * @returns {string}
 */
export function classNames(...values) {
  const result = [];

  const collect = (value) => {
    if (!value) return;
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim();
      if (text) result.push(text);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value === 'object') {
      Object.keys(value).forEach((key) => {
        if (!value[key]) return;
        const text = key.trim();
        if (text) result.push(text);
      });
    }
  };

  values.forEach(collect);
  return result.join(' ');
}

/**
 * 轉整數，取不到就回 0。
 * 容忍千分位逗號、全形空白，以及 '12 小時' 這種尾巴有單位的字串。
 *
 * @param {*} value
 * @returns {number}
 */
export function intVal(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }
  if (value === null || value === undefined || typeof value === 'boolean') return 0;

  const text = String(value).replace(/[,\s]/g, '');
  const parsed = parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * 是否為「空」：null / undefined / 空白字串 / NaN / 空陣列。
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isBlank(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return Number.isNaN(value);
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/* ────────────────────────────── 日期時間 ────────────────────────────── */

/** 純日期：2026-09-15 / 2026/9/15 / 2026.9.15 / 2026年9月15日 */
const DATE_ONLY_RE = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/;

/** 日期加時間、但沒有時區標記：2026-09-15 08:30(:00)(.123) 或 2026-09-15T08:30 */
const NAIVE_DATE_TIME_RE =
  /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/;

/** 帶時區標記（Z 或 ±HH:MM），代表一個絕對時間點 */
const HAS_TIMEZONE_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** 純數字時間戳（毫秒）。maritime-courses 用 Date.now() 當 course.id。 */
const EPOCH_MS_RE = /^-?\d{10,}$/;

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

/**
 * 以「本地行事曆日期」建立 Date，並檢查是否真的存在（擋掉 2026-02-30）。
 * 這是本檔避免 UTC 位移 bug 的核心：完全不讓 Date 建構子去解析字串。
 */
function buildLocalDate(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  const date = new Date(year, month - 1, day, hour, minute, second, ms);
  if (!isValidDate(date)) return '';
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return '';
  }
  return date;
}

/**
 * 把各種來源的日期值轉成 Date，轉不出來回 ''（空字串，不是 null，方便直接 if 判斷）。
 *
 * 認得的格式（都是實際出現在試算表或舊程式裡的）：
 *   Date 物件                        回傳複本，不會被呼叫端改到
 *   1757894400000                    毫秒時間戳（number 或字串）
 *   '2026-09-15'                     backend-api.gs:749 _formatDate 的輸出
 *   '2026/9/15'、'2026.9.15'         儲存格是文字時的樣子
 *   '2026年9月15日'                  少數手動輸入
 *   '2026-09-15 08:30'               純日期加時間，無時區 → 視為本地時間
 *   '2026-09-15T08:30:00'            同上
 *   '2026-09-15T08:30:00Z'           有時區 → 絕對時間點，交給原生解析
 *   '2026-09-15T08:30:00+08:00'      同上
 *
 * 純日期一律建成「本地午夜」，不是 UTC 午夜 —— 見檔頭時區說明。
 *
 * @param {*} value
 * @returns {Date|string} Date 或 ''
 */
export function parseDateInput(value) {
  if (value === null || value === undefined || value === '') return '';

  if (value instanceof Date) {
    return isValidDate(value) ? new Date(value.getTime()) : '';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    const fromEpoch = new Date(value);
    return isValidDate(fromEpoch) ? fromEpoch : '';
  }

  if (typeof value !== 'string') return '';

  const text = value.trim();
  if (!text) return '';

  if (EPOCH_MS_RE.test(text)) {
    const fromEpoch = new Date(Number(text));
    return isValidDate(fromEpoch) ? fromEpoch : '';
  }

  const dateOnly = DATE_ONLY_RE.exec(text);
  if (dateOnly) {
    return buildLocalDate(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
  }

  // 有時區標記 → 這是一個絕對時間點，原生解析才正確
  if (HAS_TIMEZONE_RE.test(text)) {
    const absolute = new Date(text);
    return isValidDate(absolute) ? absolute : '';
  }

  const naive = NAIVE_DATE_TIME_RE.exec(text);
  if (naive) {
    return buildLocalDate(
      Number(naive[1]),
      Number(naive[2]),
      Number(naive[3]),
      Number(naive[4]),
      Number(naive[5]),
      Number(naive[6] || 0),
      Number(String(naive[7] || '0').padEnd(3, '0'))
    );
  }

  // 最後才退回原生解析（例如 'Mon, 15 Sep 2026' 這種來自第三方的格式）
  const fallback = new Date(text);
  return isValidDate(fallback) ? fallback : '';
}

/**
 * 格式化成 YYYY-MM-DD。取代 course-management.html:1573 的 getLocalDateString
 * 與 teacher-management.html:2986 的 fmtDate。
 *
 * 用本地取值，所以 formatDate('2026-09-15') 在任何時區都回 '2026-09-15'。
 *
 * @param {*} value
 * @returns {string} 無法解析回 ''
 */
export function formatDate(value) {
  const date = parseDateInput(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * 格式化成 YYYY-MM-DD HH:mm。取代 teacher-management.html:1420 的
 * formatDateTimeForStatus 與 course-management.html:4017 的手工組裝。
 *
 * 純日期輸入沒有時間，會得到 00:00，這是刻意且可預期的行為。
 *
 * @param {*} value
 * @returns {string} 無法解析回 ''
 */
export function formatDateTime(value) {
  const date = parseDateInput(value);
  if (!date) return '';
  return `${formatDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * zh-TW 顯示用格式：'2026年9月15日 星期二'。
 * 這是舊版 toLocaleDateString('zh-TW', { year, month:'long', day, weekday:'long' })
 * 的輸出形式（course-management.html:1753 / 2131 / 2229）。
 *
 * 這裡自己組字串而不呼叫 Intl：Node 若編成 small-icu 會退回英文，
 * 畫面就會中英混雜；自行組裝則在任何執行環境輸出都一致。
 *
 * @param {*} value
 * @param {{ weekday?: boolean }} [options] weekday 預設 true；
 *        傳 false 得到 '2026年9月15日'（對應 maritime-courses 的短版）
 * @returns {string} 無法解析回 ''
 */
export function formatDateDisplay(value, options) {
  const date = parseDateInput(value);
  if (!date) return '';

  const showWeekday = !options || options.weekday !== false;
  const base = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  return showWeekday ? `${base} 星期${WEEKDAY_ZH[date.getDay()]}` : base;
}

/**
 * 相對時間：'剛剛' / 'X 分鐘前' / 'X 小時前' / 'X 天前'，超過七天就顯示日期。
 * 取代 course-management.html:1553 與 :4005 兩份幾乎相同的實作。
 *
 * now 可注入，所以這個函式對同一組輸入永遠回同樣結果（方便測試）。
 *
 * @param {*} value
 * @param {number|Date} [now] 基準時間，預設為現在
 * @returns {string} 無法解析回 ''
 */
export function formatRelativeTime(value, now) {
  const date = parseDateInput(value);
  if (!date) return '';

  const baseDate = parseDateInput(now === undefined ? new Date() : now);
  if (!baseDate) return formatDateTime(date);

  const diffMs = baseDate.getTime() - date.getTime();
  if (diffMs < 0) return formatDateTime(date);

  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return '剛剛';
  if (diffMinutes < 60) return `${diffMinutes} 分鐘前`;

  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `${diffHours} 小時前`;

  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) return `${diffDays} 天前`;

  return formatDate(date);
}

/* ────────────────────────────── 數字與檔案 ────────────────────────────── */

/**
 * 千分位數字。formatNumber(1234567) 回 '1,234,567'。
 *
 * 同樣不用 Intl，避免不同環境的 locale 差異（有些 locale 用空白或點當分隔符）。
 *
 * @param {*} value
 * @param {{ decimals?: number }} [options] 指定小數位數，不給就保留原本的小數
 * @returns {string} 無法解析回 ''
 */
export function formatNumber(value, options) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return '';
  }

  const numeric =
    typeof value === 'number' ? value : Number(String(value).replace(/[,\s]/g, ''));
  if (!Number.isFinite(numeric)) return '';

  const decimals = options && Number.isFinite(options.decimals) ? options.decimals : null;
  const text = decimals === null ? String(numeric) : numeric.toFixed(Math.max(0, decimals));

  // 指數表示法（1e21 以上）沒有千分位可言，原樣回傳
  if (text.includes('e') || text.includes('E')) return text;

  const parts = text.split('.');
  const grouped = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts[1] ? `${grouped}.${parts[1]}` : grouped;
}

const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * 檔案大小，1024 進位。取代 fix-sync-issue.html:235 / :274 的手算，
 * 以及各頁上傳限制訊息裡硬寫的 '50MB'。
 *
 * formatFileSize(0) 回 '0 B'；formatFileSize(1536) 回 '1.5 KB'；
 * formatFileSize(52428800) 回 '50 MB'
 *
 * @param {*} bytes
 * @returns {string} 無法解析或為負數回 ''
 */
export function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined || bytes === '' || typeof bytes === 'boolean') {
    return '';
  }

  const numeric =
    typeof bytes === 'number' ? bytes : Number(String(bytes).replace(/[,\s]/g, ''));
  if (!Number.isFinite(numeric) || numeric < 0) return '';
  if (numeric === 0) return '0 B';

  let size = numeric;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < FILE_SIZE_UNITS.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  // 位元組不需要小數；其他單位保留一位，但整數時不顯示 '.0'
  const text = unitIndex === 0 ? String(Math.round(size)) : size.toFixed(1).replace(/\.0$/, '');
  return `${text} ${FILE_SIZE_UNITS[unitIndex]}`;
}

/* ────────────────────────────── 姓名縮寫 ────────────────────────────── */

/** 中日韓文字範圍（含擴充 A、相容漢字、假名、諺文） */
const CJK_RE = charClassFromRanges([
  [0x3040, 0x30ff], // 平假名、片假名
  [0x3400, 0x4dbf], // 中日韓統一表意文字擴充 A
  [0x4e00, 0x9fff], // 中日韓統一表意文字
  [0xac00, 0xd7af], // 諺文音節
  [0xf900, 0xfaff]  // 中日韓相容表意文字
]);

/**
 * 頭像用的姓名縮寫。取代 crew-portal.html:1048 / :1252、
 * teaching-materials.html:904 / :1108、course-management.html:2856 的 charAt(0)。
 *
 * 中文名取第一個字（'王大明' 回 '王'），英文名取前兩個字的字首（'Amy Chen' 回 'AC'），
 * 單一英文字取首字母（'amy' 回 'A'）。空值回 '?'，不會是空白的圓圈。
 *
 * 用 Array.from 切字元，避免 charAt(0) 把代理對（例如 emoji）切成半個字。
 *
 * @param {*} name
 * @returns {string}
 */
export function initialsOf(name) {
  if (isBlank(name)) return '?';

  const text = String(name).trim().replace(/\s+/g, ' ');
  if (!text) return '?';

  const chars = Array.from(text);
  if (CJK_RE.test(chars[0])) return chars[0];

  const words = text.split(' ').filter(Boolean);
  const firstChar = (word) => Array.from(word)[0] || '';

  if (words.length >= 2) {
    return `${firstChar(words[0])}${firstChar(words[1])}`.toUpperCase();
  }
  return firstChar(words[0]).toUpperCase();
}
