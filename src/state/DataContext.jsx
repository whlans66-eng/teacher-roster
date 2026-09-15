/**
 * DataContext.jsx — 師資／排課／課程的全站讀取快取
 *
 * 取代舊檔：js/api.js 的 class DataSyncManager（:456-:733），
 * 以及各頁面自己寫的那一份「開場先 loadFromBackend()、然後從 localStorage
 * 撈回來、再各自 normalize 一次」的重複流程。
 *
 * ── 這裡只做「讀」這一件事 ─────────────────────────────────────────────
 * 舊的 DataSyncManager 一個類別同時扛了四件事，而這四件事在 React 裡的
 * 生命週期完全不同，混在一起是舊版最難維護的地方。本檔只承接第一件，
 * 其餘三件刻意不移植：
 *
 *   1. ✅ 初次載入與重新整理（loadFromBackend :466）
 *        → 就是本檔。全站只有這裡會呼叫 loadAll()。
 *
 *   2. ❌ 定時輪詢（enableAutoSync :603 / disableAutoSync :625）
 *        每 5 分鐘無條件把整份 localStorage 覆蓋回後端。這在多人同時使用時
 *        是「用背景計時器覆蓋別人的資料」，而不是同步。使用者要的是
 *        「我按了才存」，所以改為由畫面上的重新整理按鈕呼叫 refresh()。
 *        若之後真的需要背景更新，該做的是一支獨立的 usePolling hook，
 *        而不是把計時器藏在資料層裡。
 *
 *   3. ❌ 髒資料標記與去抖動寫入（markAsChanged :727、hasLocalChanges、
 *        saveToBackendSafe :663、beforeunload 攔截）
 *        寫入路徑屬於之後的編輯表單階段：表單自己持有草稿，送出時呼叫
 *        teachersApi.saveTeachers(rows, versions.teachers)，拿到結果再決定
 *        要顯示衝突對話框還是成功訊息。把「有沒有改過」記在 localStorage
 *        是舊版資料反覆復活的主因（標記沒清乾淨就被下一次自動同步寫回）。
 *        React 裡這個狀態本來就在元件的 state 中，不需要另外記一份。
 *
 *   4. ❌ 跨分頁協調（storage 事件 + lastSyncTime 比對）
 *        屬於之後的 useCrossTabSync，不屬於讀取快取。
 *
 * ── 為什麼一定要等身分確認才載入 ───────────────────────────────────────
 * 舊版每一頁都是「DOMContentLoaded 就打 listall」，而登入狀態是同一時間
 * 才在還原的，於是每次重新整理都會先吃一個 401、閃一下錯誤訊息，然後才
 * 重新載入一次。這裡改成只在 useAuth().isAllowed 第一次變成 true 時載入：
 * 沒登入就一次請求都不發。
 *
 * ── loading 的語意 ─────────────────────────────────────────────────────
 * loading 代表「此刻有一個請求在路上」，重新整理時也會是 true。所以整頁的
 * 載入骨架請判斷 loading && teachers.length === 0（第一次載入才蓋整頁），
 * 重新整理時只要讓按鈕轉圈就好，不要把使用者正在看的名單換成骨架。
 *
 * ── 錯誤處理原則 ───────────────────────────────────────────────────────
 * 載入失敗時只設定 error，既有的 teachers／assignments／courses 保持不動。
 * 畫面上會是「舊資料 + 一條錯誤橫幅」，而不是整頁清空。網路瞬斷不應該讓
 * 使用者眼前的名單消失。
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { loadAll } from '../services/syncApi.js';
import { normalizeTeachers } from '../services/teachersApi.js';
import { useAuth } from './AuthContext.jsx';

const DataContext = createContext(null);

/* ─────────────────────── 正規化小工具 ─────────────────────── */

/**
 * id 正規化。沿用舊版 normalizeNumeric（js/api.js:383）與 teachersApi 的
 * 同名邏輯：Sheet 的同一個欄位有時給數字 3、有時給字串 '3'，兩邊混用會讓
 * find(x => x.id === id) 靜靜地找不到人。看起來像數字就轉數字，否則留字串。
 *
 * 實作與 teachersApi 的 toId 逐字相同是必要的：師資列是由 teachersApi
 * 正規化的，查表的 key 卻由本檔算出來，兩邊只要有一個字不一樣，
 * 某些邊界值（例如布林 false）就會算出不同的 key，getTeacher 便會查不到。
 */
function toId(value) {
  if (value === undefined || value === null || value === '') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) && String(value).trim() !== '' ? numeric : String(value).trim();
}

/**
 * 排課資料正規化，等同舊版 normalizeCourseAssignment（js/api.js:402）：
 * 三個 id 欄位轉型，date／time 去空白，其餘欄位原樣保留。
 *
 * 只做到這個程度是刻意的——排課還沒有自己的領域模組。等 assignmentsApi.js
 * 出現時，這個函式應該整個搬過去，這裡改成 import。師資已經有
 * teachersApi.normalizeTeachers，所以師資不在這裡重寫一份。
 */
function normalizeAssignment(record) {
  if (!record || typeof record !== 'object') return null;
  const normalized = {
    ...record,
    id: toId(record.id),
    teacherId: toId(record.teacherId),
    taId: toId(record.taId)
  };
  // 只在本來就是字串時才去空白：沒有 date／time 欄位的資料列不該被補出一個
  // 值為 undefined 的鍵，而 Sheet 偶爾會把日期送成 Date 物件，字串化會毀掉它
  if (typeof normalized.date === 'string') normalized.date = normalized.date.trim();
  if (typeof normalized.time === 'string') normalized.time = normalized.time.trim();
  return normalized;
}

/**
 * 課程正規化。舊版對 maritimeCourses 完全沒有處理（js/api.js:493 直接原樣
 * 存進 localStorage），所以這裡只補最低限度的 id 轉型，其餘欄位一字不動。
 * keywords／targetRanks／materials 這些 JSON 字串欄位的解析屬於未來的
 * coursesApi.js，不在讀取快取這一層猜測它們的形狀。
 */
function normalizeCourse(record) {
  if (!record || typeof record !== 'object') return null;
  return { ...record, id: toId(record.id) };
}

function normalizeList(rows, normalizer) {
  return (Array.isArray(rows) ? rows : []).map(normalizer).filter(Boolean);
}

/* ─────────────────────── Provider ─────────────────────── */

export function DataProvider({ children }) {
  const { isAllowed } = useAuth();

  const [teachers, setTeachers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [versions, setVersions] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // 卸載後不得再 setState；StrictMode 在開發模式會掛載兩次，
  // 所以每次掛載都要把旗標設回 true，不能只在 cleanup 設 false。
  const mountedRef = useRef(false);
  // 進行中的請求。重複呼叫 refresh() 會拿到同一個 Promise，不會併發兩次載入。
  const inFlightRef = useRef(null);
  // 這一段登入期間是否已經啟動過初次載入。登出時歸零，換人登入才會重載。
  const startedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** 清空快取。只在登出時使用——不要讓上一位使用者的名單留在記憶體裡。 */
  const reset = useCallback(() => {
    setTeachers([]);
    setAssignments([]);
    setCourses([]);
    setVersions({});
    setError('');
    setLastSyncTime(null);
    setLoading(false);
  }, []);

  /**
   * 重新載入全部資料。
   *
   * ·「同時只會有一個請求」：進行中時直接回傳同一個 Promise。
   * · 這個 Promise 永遠不會 reject——失敗透過 data.error 呈現，
   *   呼叫端可以安心 await refresh() 而不需要 try/catch。
   * · 失敗時保留既有資料，只更新 error。
   */
  const refresh = useCallback(() => {
    if (!mountedRef.current) return Promise.resolve();
    if (inFlightRef.current) return inFlightRef.current;

    setLoading(true);
    setError('');

    async function run() {
      try {
        const result = await loadAll();
        if (!mountedRef.current) return;

        const data = result?.data || {};
        setTeachers(normalizeTeachers(data.teachers));
        setAssignments(normalizeList(data.assignments, normalizeAssignment));
        setCourses(normalizeList(data.courses, normalizeCourse));
        setVersions(result?.versions || {});
        setLastSyncTime(Date.now());
      } catch (err) {
        if (!mountedRef.current) return;
        // 不吞錯：訊息留在 error，資料維持原狀
        setError(err?.message || '資料載入失敗，請稍後再試');
      }
    }

    // finally 一定是在 inFlightRef 指派之後的 microtask 才執行，
    // 所以這裡不會有「先清掉再指派」的競態。
    const promise = run().finally(() => {
      if (inFlightRef.current === promise) inFlightRef.current = null;
      if (mountedRef.current) setLoading(false);
    });

    inFlightRef.current = promise;
    return promise;
  }, []);

  /* ── 只在通過權限檢查後載入一次；登出時清空並容許下次重載 ── */
  useEffect(() => {
    if (!isAllowed) {
      if (startedRef.current) {
        startedRef.current = false;
        reset();
      }
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    void refresh();
  }, [isAllowed, refresh, reset]);

  /* ── id 查表：建索引一次，之後每次查詢都是 O(1) ── */
  const teacherIndex = useMemo(() => {
    const index = new Map();
    teachers.forEach((teacher) => {
      const key = String(teacher.id);
      if (key) index.set(key, teacher);
    });
    return index;
  }, [teachers]);

  /**
   * 依 id 取得師資。Sheet 的 id 同時存在 '3' 與 3 兩種形態，路由參數又一定
   * 是字串，所以兩邊都先過 toId 再轉字串比對，不做嚴格等於。
   * @returns {Object|undefined}
   */
  const getTeacher = useCallback(
    (id) => {
      const key = String(toId(id));
      if (!key) return undefined;
      return teacherIndex.get(key);
    },
    [teacherIndex]
  );

  /**
   * 契約之外的附加項（寫入路徑需要，之後的編輯表單階段會用到）：
   * 後端的樂觀鎖要求「存檔時帶上這次讀到的版本指紋，成功後換成回傳的新指紋」。
   * 沒有換新指紋的話，第二次存檔一定會被判定為衝突（見 syncApi.js 檔頭）。
   * 存檔成功後呼叫 applyVersions({ teachers: newVersion }) 即可。
   */
  const applyVersions = useCallback((partial) => {
    if (!partial || typeof partial !== 'object') return;
    setVersions((current) => ({ ...current, ...partial }));
  }, []);

  const value = useMemo(
    () => ({
      // 契約
      teachers,
      assignments,
      courses,
      loading,
      error,
      lastSyncTime,
      refresh,
      getTeacher,

      // 附加：樂觀鎖的版本指紋
      versions,
      applyVersions
    }),
    [teachers, assignments, courses, loading, error, lastSyncTime, refresh, getTeacher, versions, applyVersions]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData 必須在 DataProvider 內使用');
  return value;
}
