/**
 * syncApi.js — 共用的資料讀取／整表寫入路徑
 *
 * 對應舊檔：js/api.js 的 class DataSyncManager（:456，loadFromBackend :466、
 * saveToBackend :540、saveTable :571）、TeacherRosterAPI 的 list (:106)、
 * listAll (:120)、getVersions (:134)、save (:151)、batchSave (:170)，
 * 以及 loadArrayFromStorage (:423) 與 _mergeDataVersions (:443)。
 *
 * ── 這支檔案唯一的特權：資料表改名 ─────────────────────────────────────
 * 後端（Google Sheets 的分頁名稱，backend-api.gs:26 的 SHEETS_CONFIG）講的是
 *     teachers / courseAssignments / maritimeCourses
 * 前端講的是
 *     teachers / assignments / courses
 * 這個對照只在本檔發生一次。syncApi 以上的所有程式碼——DataContext、
 * teachersApi、各頁面——一律只講前端名稱，永遠不會看到 courseAssignments
 * 或 maritimeCourses 這兩個字串。
 *
 * ── 版本指紋（樂觀鎖）實際上是怎麼運作的 ──────────────────────────────
 * 後端沒有 row-level 鎖，靠的是「整表指紋比對」（backend-api.gs:732）：
 *
 *   fingerprint = MD5( 所有 id 排序後以逗號串接 + '|' + 筆數 )
 *   版本物件     = { count, fingerprint, lastModified }
 *
 * 流程：
 *   1. GET /roster/all 會順便回傳三張表的 versions，並把它們寫進後端的
 *      ScriptProperties 快取（backend-api.gs:173）。
 *   2. 前端把拿到的 versions 留著。存檔時原封不動回傳 savedVersion。
 *   3. 後端拿 savedVersion.fingerprint 跟當下的指紋比：
 *        不同 → 不寫入，回 HTTP 200 { ok:true, conflict:true, ... }
 *        相同 → 寫入，並回傳 newVersion / newVersions
 *   4. 呼叫端必須把回傳的 newVersion 存起來當作下一次的 savedVersion，
 *      否則下一次存檔一定會撞到衝突。
 *   5. options.force = true 會讓後端整段跳過比對，直接覆寫。
 *
 * ⚠️ 兩個必須知道的限制（後端就是這樣寫的，不是本檔的選擇）：
 *   · 指紋只含「id 集合 + 筆數」。別人把某一筆的欄位改掉但沒有新增或刪除
 *     資料列時，指紋完全相同，樂觀鎖偵測不到，後寫的人會直接蓋掉前者。
 *   · _writeTable（backend-api.gs:571）遇到空陣列會直接 return 而不寫入，
 *     但回應仍然是成功。也就是說「刪掉最後一筆」在後端是無效操作。
 *     本檔把這個情況攔下來回報 blocked，避免前端以為刪除成功。
 *
 * ── 業務結果用回傳值表達，不丟例外 ────────────────────────────────────
 * conflict（版本衝突）與 blocked（空表寫入被擋）都是正常的業務結果，
 * 一律放在回傳物件裡。丟出 Error 永遠代表「壞掉了」。
 */

import { isLocal } from '../config.js';
import { callApi } from './apiClient.js';
import { LOCAL_TABLES, readLocalTable, writeLocalTable } from './localStore.js';

/* ─────────────────────── 資料表名稱對照 ─────────────────────── */

/** 前端名稱 → 後端（Google Sheets 分頁）名稱 */
const APP_TO_SERVER = {
  teachers: 'teachers',
  assignments: 'courseAssignments',
  courses: 'maritimeCourses'
};

/** 後端名稱 → 前端名稱 */
const SERVER_TO_APP = {
  teachers: 'teachers',
  courseAssignments: 'assignments',
  maritimeCourses: 'courses'
};

/** 前端使用的三張主要資料表，順序固定，方便迴圈與畫面列舉 */
export const APP_TABLES = ['teachers', 'assignments', 'courses'];

/** 前端表名 → 後端表名；不認得的名稱原樣回傳（例如 teacherLeaves） */
export function toServerTable(table) {
  return APP_TO_SERVER[table] || table;
}

/** 後端表名 → 前端表名；不認得的名稱原樣回傳 */
export function toAppTable(table) {
  return SERVER_TO_APP[table] || table;
}

/** 把後端回來、以後端表名為 key 的物件換成前端表名 */
function renameKeysToApp(source) {
  const result = {};
  Object.entries(source || {}).forEach(([key, value]) => {
    result[toAppTable(key)] = value;
  });
  return result;
}

/** 把要送出、以前端表名為 key 的物件換成後端表名 */
function renameKeysToServer(source) {
  const result = {};
  Object.entries(source || {}).forEach(([key, value]) => {
    result[toServerTable(key)] = value;
  });
  return result;
}

/* ─────────────────────── 共用小工具 ─────────────────────── */

function asRows(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * 本機模式用的版本指紋。
 *
 * 後端用 MD5（backend-api.gs:732），瀏覽器端沒有同步版的 MD5，而本機模式
 * 只有一個分頁在寫同一份 localStorage，本來就不可能發生多人衝突。
 * 所以這裡只求「形狀一樣、內容穩定」——用 FNV-1a 雜湊同一組輸入
 * （排序後的 id + '|' + 筆數），讓上層拿到的版本物件跟線上完全同構。
 */
function localFingerprint(rows) {
  const list = asRows(rows);
  const ids = list
    .map((item) => String(item?.id ?? ''))
    .sort()
    .join(',');
  const input = `${ids}|${list.length}`;

  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return {
    count: list.length,
    fingerprint: hash.toString(16).padStart(8, '0'),
    lastModified: list.reduce((latest, item) => {
      const time = String(item?.lastModifiedAt || item?.updatedAt || '');
      return time > latest ? time : latest;
    }, '')
  };
}

/** 本機模式的資料表鍵名；未登記的表用原名當 key */
function localKey(table) {
  return LOCAL_TABLES[table] || toServerTable(table);
}

function readLocalRows(table) {
  return asRows(readLocalTable(localKey(table), []));
}

/**
 * 空表寫入的守門員。
 *
 * 後端遇到空陣列會靜靜地不寫入卻回成功（backend-api.gs:575），
 * 前端因此會誤以為「刪掉最後一筆」成功了，重新整理後資料又冒出來。
 * 本機模式也套用同一條規則，免得開發時看起來正常、上線才炸。
 */
function emptyWriteBlocked(table, rows) {
  return {
    blocked: true,
    table,
    count: 0,
    message: `後端不接受把「${table}」整表清空的寫入，這一筆儲存沒有生效。請至少保留一筆資料。`,
    rows: asRows(rows).length
  };
}

/* ─────────────────────── 對外 API ─────────────────────── */

/**
 * 連線測試。
 * @returns {Promise<{timestamp: string, server: string}>}
 */
export async function ping() {
  if (isLocal) {
    return { timestamp: new Date().toISOString(), server: 'local' };
  }
  return callApi('/ping');
}

/**
 * 一次讀回所有資料表與版本指紋（線上只打一次 HTTP）。
 *
 * 後端的 listall 會把 users / activeSessions 以外的每一張表都回傳，
 * 所以除了三張主要資料表之外，其餘（例如 teacherLeaves）會以原本的
 * 名稱原樣帶出來，不會被丟掉。
 *
 * @returns {Promise<{data: Object, versions: Object}>}
 *          data 與 versions 的 key 都已經換成前端名稱
 */
export async function loadAll() {
  if (isLocal) {
    const data = {};
    const versions = {};
    APP_TABLES.forEach((table) => {
      const rows = readLocalRows(table);
      data[table] = rows;
      versions[table] = localFingerprint(rows);
    });
    return { data, versions };
  }

  const result = await callApi('/roster/all');
  const rawData = result?.data || {};
  const rawVersions = result?.versions || {};

  const data = renameKeysToApp(rawData);
  APP_TABLES.forEach((table) => {
    data[table] = asRows(data[table]);
  });

  return { data, versions: renameKeysToApp(rawVersions) };
}

/**
 * 只讀版本指紋，不讀資料。用於「離開頁面前確認有沒有被別人改過」。
 * @returns {Promise<Object>} key 為前端表名
 */
export async function loadVersions() {
  if (isLocal) {
    const versions = {};
    APP_TABLES.forEach((table) => {
      versions[table] = localFingerprint(readLocalRows(table));
    });
    return versions;
  }

  const result = await callApi('/roster/versions');
  return renameKeysToApp(result?.versions || {});
}

/**
 * 讀取單一資料表。
 * @param {string} table 前端表名（teachers / assignments / courses）
 * @returns {Promise<Array>}
 */
export async function loadTable(table) {
  if (isLocal) {
    return readLocalRows(table);
  }

  const result = await callApi(`/roster/${encodeURIComponent(toServerTable(table))}`);
  return asRows(result?.data);
}

/**
 * 整表覆寫單一資料表。
 *
 * @param {string} table          前端表名
 * @param {Array}  rows           完整的資料列（整表覆寫，不是增量）
 * @param {Object|null} savedVersion 上次讀到的版本指紋，交給後端比對
 * @param {{force?: boolean}} options force 為 true 時跳過比對強制覆寫
 * @returns {Promise<Object>}
 *   成功   { table, count, newVersion }
 *   衝突   { conflict: true, table, savedCount, currentCount }
 *   空表   { blocked: true, table, count: 0, message }
 */
export async function saveTable(table, rows, savedVersion = null, options = {}) {
  const list = asRows(rows);

  // 空陣列在後端是無效操作，先攔下來，省掉一次不會有任何效果的請求
  if (list.length === 0) return emptyWriteBlocked(table, rows);

  if (isLocal) {
    writeLocalTable(localKey(table), list);
    return { table, count: list.length, newVersion: localFingerprint(list) };
  }

  const result = await callApi(`/roster/${encodeURIComponent(toServerTable(table))}`, {
    method: 'POST',
    body: {
      data: list,
      savedVersion: savedVersion || undefined,
      force: Boolean(options.force)
    }
  });

  // 衝突：後端回 HTTP 200 + conflict 旗標，傳輸層已經把 ok 信封拆掉
  if (result?.conflict) {
    return {
      conflict: true,
      table: toAppTable(result.table || toServerTable(table)),
      savedCount: result.savedCount,
      currentCount: result.currentCount
    };
  }

  return {
    table,
    count: typeof result?.count === 'number' ? result.count : list.length,
    newVersion: result?.newVersion || null
  };
}

/**
 * 一次覆寫多張資料表（單一 HTTP 請求）。
 *
 * 後端是先整批比對指紋，只要任何一張表對不上就整批不寫（backend-api.gs:347），
 * 所以這是一個「全有或全無」的操作。
 *
 * @param {Object} tables        { teachers: [...], assignments: [...] }，key 為前端表名
 * @param {Object|null} savedVersions 同樣以前端表名為 key 的版本指紋
 * @param {{force?: boolean}} options
 * @returns {Promise<Object>}
 *   成功   { results, newVersions, blockedTables }
 *   衝突   { conflict: true, conflicts: [{table, savedCount, currentCount}], message }
 *   全空   { blocked: true, blockedTables, message }
 *   results / newVersions / conflicts[].table 的 key 都已換回前端表名。
 *   blockedTables 列出因為是空陣列而被後端略過的表，呼叫端應該提醒使用者。
 */
export async function batchSave(tables, savedVersions = null, options = {}) {
  const entries = Object.entries(tables || {});
  const blockedTables = entries.filter(([, rows]) => asRows(rows).length === 0).map(([table]) => table);
  const writable = entries.filter(([, rows]) => asRows(rows).length > 0);

  if (writable.length === 0) {
    return {
      blocked: true,
      blockedTables,
      message: '沒有任何一張資料表有內容可以儲存，後端不接受整表清空。'
    };
  }

  if (isLocal) {
    const results = {};
    const newVersions = {};
    writable.forEach(([table, rows]) => {
      const list = asRows(rows);
      writeLocalTable(localKey(table), list);
      results[table] = { count: list.length };
      newVersions[table] = localFingerprint(list);
    });
    return { results, newVersions, blockedTables };
  }

  const payload = {};
  writable.forEach(([table, rows]) => {
    payload[toServerTable(table)] = asRows(rows);
  });

  const result = await callApi('/roster/batch', {
    method: 'POST',
    body: {
      tables: payload,
      savedVersions: savedVersions ? renameKeysToServer(savedVersions) : undefined,
      force: Boolean(options.force)
    }
  });

  if (result?.conflict) {
    return {
      conflict: true,
      conflicts: (result.conflicts || []).map((item) => ({
        table: toAppTable(item?.table),
        savedCount: item?.savedCount,
        currentCount: item?.currentCount
      })),
      message: result.message || '後端資料已被其他人修改，請先重新載入再編輯。'
    };
  }

  return {
    results: renameKeysToApp(result?.results || {}),
    newVersions: renameKeysToApp(result?.newVersions || {}),
    blockedTables
  };
}
