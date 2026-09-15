/**
 * teachersApi.js — 師資領域的資料存取
 *
 * 對應舊檔：js/api.js 的 normalizeNumeric (:383) 與 normalizeTeacherRecord (:392)，
 * 加上 teacher-management.html:1552 那份頁面內嵌的 normalize()、
 * :1586 的 WORK_STATUS 與 :1540 的 SUBJECT_CATEGORIES。
 *
 * ── 為什麼正規化要搬到這裡 ────────────────────────────────────────────
 * 舊版有兩份不相容的正規化：傳輸層的 normalizeTeacherRecord 只把 id 轉成數字，
 * 頁面裡的 normalize() 才真的處理陣列欄位與預設值。結果是「沒有經過
 * teacher-management.html 的頁面」（行事曆、課程管理、前台）拿到的是半生不熟的
 * 資料，各自再補一套防禦性判斷。這裡統一成一個 normalizeTeacher，
 * 所有讀取路徑都會經過它，頁面拿到的形狀永遠一致。
 *
 * ── 資料表欄位（backend-api.gs:31 的 SHEETS_CONFIG.teachers）────────────
 *   id, name, email, teacherType, workLocation, teacherCategory, rank,
 *   photoUrl, experiences, certificates, subjects, tags,
 *   version, lastModifiedBy, lastModifiedAt
 * 其中 experiences / certificates / subjects / tags 在 Google Sheet 裡是
 * 一格 JSON 字串，後端讀出時會用 _asArray 還原（backend-api.gs:727），
 * 但空白格、手動編輯過的格子、以及本機 localStorage 的舊資料都可能不是陣列，
 * 所以本檔一律自己再保證一次。
 */

import { callApi } from './apiClient.js';
import { isLocal } from '../config.js';
import { LOCAL_TABLES, readLocalTable, writeLocalTable } from './localStore.js';
import { loadTable, saveTable } from './syncApi.js';

const TABLE = 'teachers';

/* ─────────────────────── 標籤對照表 ─────────────────────── */

/**
 * 工作狀態。值取自 teacher-management.html:1586 的 WORK_STATUS 與
 * :1041-1053 的三顆 radio，不是自己發明的。
 *
 * 舊版的 textClass / badgeClass 直接寫死 text-orange-600 之類的原始色票，
 * 那是舊專案的調色盤。這裡改成 tone，對應 UI kit 的 <Tag color="...">。
 */
export const WORK_STATUS = {
  onboard: { value: 'onboard', label: '在船', text: '海上工作', icon: 'boat', tone: 'orange' },
  onshore: { value: 'onshore', label: '在岸', text: '陸地工作', icon: 'building', tone: 'green' },
  retired: { value: 'retired', label: '退休', text: '已退休', icon: 'armchair', tone: 'gray' }
};

/** 工作狀態的合法值，順序即畫面上的排列順序 */
export const WORK_STATUS_KEYS = ['onboard', 'onshore', 'retired'];

/** 預設工作狀態：舊版 normalize() 對不認得的值一律回 onshore */
const DEFAULT_WORK_STATUS = 'onshore';

/**
 * 師資類型。值與說明文字取自 teacher-management.html:1023-1031 的兩顆 radio。
 */
export const TEACHER_TYPE = {
  internal: { value: 'internal', label: '內部師資', text: '公司內部教師', icon: 'user-circle', tone: 'blue' },
  external: { value: 'external', label: '外部師資', text: '外聘專業教師', icon: 'graduation-cap', tone: 'orange' }
};

/** 師資類型的合法值 */
export const TEACHER_TYPE_KEYS = ['internal', 'external'];

const DEFAULT_TEACHER_TYPE = 'internal';

/**
 * 到職分類。值取自 teacher-management.html:2561（'new' / 'existing'）與
 * :1865 的「新進」徽章。只有 new 會在畫面上標示。
 */
export const TEACHER_CATEGORY = {
  existing: { value: 'existing', label: '既有', icon: 'user', tone: 'gray' },
  new: { value: 'new', label: '新進', icon: 'user-plus', tone: 'green' }
};

const DEFAULT_TEACHER_CATEGORY = 'existing';

/**
 * 授課項目分類。取自 teacher-management.html:1540 的 SUBJECT_CATEGORIES。
 * 三種分類共用同一個 subjects 陣列，靠每一筆的 category 區分，
 * 所以後端表頭不需要多開欄位。舊資料沒有 category 時一律視為「講授」。
 */
export const SUBJECT_CATEGORIES = {
  teach: { value: 'teach', label: '講授課程', short: '講授', icon: 'books', tone: 'blue' },
  ta: { value: 'ta', label: '助教經驗', short: '助教', icon: 'users-three', tone: 'orange' },
  video: { value: 'video', label: '影片協作', short: '影片協作', icon: 'video-camera', tone: 'green' }
};

const DEFAULT_SUBJECT_CATEGORY = 'teach';

/* ─────────────────────── 正規化工具 ─────────────────────── */

function toText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

/**
 * id 正規化。沿用舊版 normalizeNumeric (js/api.js:383) 的精神：
 * 看起來像數字就轉成數字（Sheet 有時給字串 '12'、有時給數字 12，
 * 兩邊混用會讓 find(t => t.id === id) 靜靜失敗），否則保留原字串。
 * 找不到 id 時回空字串，不自己產生新的——產生 id 是新增資料的職責，
 * 不是正規化的職責（舊版在這裡塞 Date.now() 會讓同一毫秒的兩筆撞號）。
 */
function toId(value) {
  if (value === undefined || value === null || value === '') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) && String(value).trim() !== '' ? numeric : String(value).trim();
}

/** id 比對：Sheet 可能給數字也可能給字串，一律轉字串比 */
function sameId(a, b) {
  return String(a) === String(b);
}

/**
 * 把「可能是陣列、可能是 JSON 字串、可能是空字串」的欄位變成陣列。
 *
 * 比後端的 _asArray（backend-api.gs:727）寬容一點：後端遇到不是 JSON 的
 * 裸字串會直接回 []，等於把資料丟掉；這裡把它當成單一元素保留下來。
 */
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  if (typeof value === 'object') return [value];

  const text = String(value).trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed === undefined || parsed === null || parsed === '') return [];
    return [parsed];
  } catch {
    // 不是 JSON 的裸字串：當成只有一個元素的陣列，別讓整格資料消失
    return [text];
  }
}

/**
 * 列舉欄位正規化。合法值全部是小寫英文，但 Sheet 是人手可以直接編輯的，
 * 出現 'External'、'ONBOARD' 這種大小寫不一致的格子並不罕見，所以先比原值、
 * 再比小寫，都對不上才落回預設值。
 */
function oneOf(value, allowed, fallback) {
  const text = toText(value);
  if (allowed.includes(text)) return text;
  const lowered = text.toLowerCase();
  return allowed.includes(lowered) ? lowered : fallback;
}

/**
 * 證照。舊資料有兩種形狀：純字串（只有名稱）或 {name, fileName, fileUrl}。
 * 一律正規化成物件，讀取端就不用再 typeof 判斷一次。
 */
function normalizeCertificate(item) {
  if (typeof item === 'string') {
    return { name: toText(item), fileName: '', fileUrl: '' };
  }
  return {
    name: toText(item?.name),
    fileName: toText(item?.fileName),
    fileUrl: toText(item?.fileUrl)
  };
}

function normalizeMaterial(item) {
  return {
    fileName: toText(item?.fileName),
    fileUrl: toText(item?.fileUrl),
    fileType: toText(item?.fileType)
  };
}

/**
 * 授課項目。舊資料同樣有兩種形狀：純字串或 {name, category, materials}。
 * 一律正規化成物件，category 不認得就落回 teach。
 */
function normalizeSubject(item) {
  const isObject = item !== null && typeof item === 'object';
  const rawCategory = isObject ? item.category : undefined;
  return {
    name: toText(isObject ? item.name : item),
    category: oneOf(rawCategory, Object.keys(SUBJECT_CATEGORIES), DEFAULT_SUBJECT_CATEGORY),
    materials: toArray(isObject ? item.materials : null)
      .map(normalizeMaterial)
      .filter((m) => m.fileUrl)
  };
}

/**
 * 唯一的師資正規化函式。所有讀取路徑都會經過它。
 *
 * 回傳的欄位固定為：
 *   id, name, email, teacherType, workLocation, teacherCategory, rank,
 *   photoUrl, photo, experiences, certificates, subjects, tags,
 *   version, lastModifiedBy, lastModifiedAt
 *
 * photoUrl 與 photo 會保持同一個值：Sheet 的欄位叫 photoUrl，但後端讀出時
 * 會另外補一個 photo 別名（backend-api.gs:566），而舊頁面只認得 photo。
 * 兩個都給，整筆資料才能原封不動地在前後端之間來回而不掉照片。
 *
 * @param {Object} record 後端或 localStorage 來的原始資料列
 * @returns {Object} 正規化後的師資物件；傳入非物件時回傳 null
 */
export function normalizeTeacher(record) {
  if (!record || typeof record !== 'object') return null;

  const photoUrl = toText(record.photoUrl || record.photo);

  return {
    id: toId(record.id),
    name: toText(record.name),
    email: toText(record.email),
    teacherType: oneOf(record.teacherType, TEACHER_TYPE_KEYS, DEFAULT_TEACHER_TYPE),
    workLocation: oneOf(record.workLocation, WORK_STATUS_KEYS, DEFAULT_WORK_STATUS),
    teacherCategory: oneOf(record.teacherCategory, Object.keys(TEACHER_CATEGORY), DEFAULT_TEACHER_CATEGORY),
    rank: toText(record.rank),
    photoUrl,
    photo: photoUrl,
    experiences: toArray(record.experiences).map(toText).filter(Boolean),
    certificates: toArray(record.certificates).map(normalizeCertificate).filter((c) => c.name),
    subjects: toArray(record.subjects).map(normalizeSubject).filter((s) => s.name),
    tags: toArray(record.tags).map(toText).filter(Boolean),
    version: toText(record.version),
    lastModifiedBy: toText(record.lastModifiedBy),
    lastModifiedAt: toText(record.lastModifiedAt)
  };
}

/** 一次正規化一整批，順手濾掉壞掉的資料列 */
export function normalizeTeachers(rows) {
  return (Array.isArray(rows) ? rows : []).map(normalizeTeacher).filter(Boolean);
}

/* ─────────────────────── 查詢輔助 ─────────────────────── */

/** 取得工作狀態的顯示設定，值不認得時落回「在岸」 */
export function workStatusOf(teacher) {
  return WORK_STATUS[teacher?.workLocation] || WORK_STATUS[DEFAULT_WORK_STATUS];
}

/** 取得師資類型的顯示設定，值不認得時落回「內部師資」 */
export function teacherTypeOf(teacher) {
  return TEACHER_TYPE[teacher?.teacherType] || TEACHER_TYPE[DEFAULT_TEACHER_TYPE];
}

/** 是否已退休。呈現模式不列出退休師資（teacher-management.html:1593） */
export function isRetired(teacher) {
  return teacher?.workLocation === 'retired';
}

/* ─────────────────────── 讀寫 ─────────────────────── */

/**
 * 讀取全部師資。
 * @returns {Promise<Array>} 已正規化
 */
export async function listTeachers() {
  const rows = await loadTable(TABLE);
  return normalizeTeachers(rows);
}

/**
 * 讀取單一師資。後端沒有「讀一筆」的端點，所以是整表讀回後比對 id
 * （Sheet 的 id 可能是數字也可能是字串，這裡一律轉字串比）。
 * @param {number|string} id
 * @returns {Promise<Object|null>} 找不到時回 null
 */
export async function getTeacher(id) {
  if (id === undefined || id === null || id === '') return null;
  const teachers = await listTeachers();
  return teachers.find((teacher) => sameId(teacher.id, id)) || null;
}

/**
 * 整表覆寫師資。
 *
 * 送出前先跑一次 normalizeTeacher，確保寫進 Sheet 的形狀一致
 * （後端的 save 只會補 _asArray，不會補預設值）。
 *
 * @param {Array} rows              完整的師資陣列（整表覆寫，不是增量）
 * @param {Object|null} savedVersion 上次讀到的版本指紋
 * @param {{force?: boolean}} options
 * @returns {Promise<Object>}
 *   成功 { table:'teachers', count, newVersion }
 *   衝突 { conflict:true, table:'teachers', savedCount, currentCount }
 *   空表 { blocked:true, table:'teachers', count:0, message }
 *   衝突與空表都是正常業務結果，不會丟例外，呼叫端要自己判斷這兩個旗標。
 */
export async function saveTeachers(rows, savedVersion = null, options = {}) {
  return saveTable(TABLE, normalizeTeachers(rows), savedVersion, options);
}

/**
 * 更新單一師資。
 *
 * ⚠️ 這條路徑跟 saveTeachers 完全不同，用途也不同：
 * 後端的 update（backend-api.gs:394）是 _updateRow，只改掉 id 對應的那一列，
 * 其他欄位沿用原本的儲存格內容。它不做版本指紋比對，**也不可能回傳 conflict**——
 * 原因是指紋只由「id 集合 + 筆數」算出來（backend-api.gs:732），單筆更新兩者都沒變，
 * 指紋在更新前後本來就相同。所以這支不需要帶 savedVersion，也沒有衝突分支。
 *
 * 代價是它沒有任何併發保護：兩個人同時改同一筆，後寫的贏。需要整批一致性時
 * 請改用 saveTeachers。
 *
 * 這個端點後端早就寫好了，但舊前端從頭到尾沒有呼叫過（舊版每改一個欄位都整表覆寫）。
 *
 * @param {number|string} id
 * @param {Object} patch 只需要帶要改的欄位；未帶到的欄位保持原值
 * @returns {Promise<{id: (number|string), message?: string}>}
 */
export async function updateTeacher(id, patch) {
  if (id === undefined || id === null || id === '') {
    throw new Error('updateTeacher 需要師資 id');
  }
  if (!patch || typeof patch !== 'object') {
    throw new Error('updateTeacher 需要要更新的欄位物件');
  }

  if (isLocal) {
    // 本機模式：讀回整表、換掉那一筆、再寫回去，行為與線上的 _updateRow 一致
    const rows = readLocalTable(LOCAL_TABLES.teachers, []) || [];
    const list = Array.isArray(rows) ? rows : [];
    const index = list.findIndex((row) => sameId(row?.id, id));
    if (index === -1) throw new Error('找不到這筆師資資料');

    const merged = normalizeTeacher({ ...list[index], ...patch, id: list[index].id });
    const next = [...list];
    next[index] = merged;
    writeLocalTable(LOCAL_TABLES.teachers, next);
    return { id: merged.id, message: 'Updated' };
  }

  const result = await callApi(`/roster/teachers/${encodeURIComponent(String(id))}`, {
    method: 'PUT',
    body: { data: patch }
  });

  return { id: result?.id ?? id, message: result?.message || 'Updated' };
}
