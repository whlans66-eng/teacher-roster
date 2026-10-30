/**
 * 系統設定（文字與數字）：全站唯一來源
 *
 * 系統名稱、登入頁文字、教材頁歡迎詞、授課時數目標、分享訊息、衝堂規則、AI 快速提問……
 * 以前寫死在各頁，現在管理者在「帳號管理 → 系統設定」改，各頁只負責把它畫出來。
 *
 * 用法：
 *     Site.get('systemName')               // 立即可用（快取或預設值）
 *     await Site.ready();                  // 向後端要最新的
 *     <span data-site="systemName"></span> // 載入後自動填字
 *     <a data-site-href="forgotPasswordUrl">忘記密碼？</a>   // 沒設定就整個藏起來
 *     <span data-site-copyright></span>    // © 今年 版權所有者
 *     Site.fill(Site.get('shareTemplate'), { 課程: '…' })    // 套範本
 *
 * 三層降級：後端 → localStorage 快取 → 這裡的預設值。
 * SITE_DEFS 的鍵、預設值、型別、上下限必須和 backend-api.gs 的 SITE_DEFS 一致。
 */
(function () {
  'use strict';

  const CACHE_KEY = 'siteSettings';
  const CACHE_TS_KEY = 'siteSettingsAt';
  // 快取裡是「全部」還是「只有登入前那幾項」。登入頁只拿得到公開的那幾項，
  // 不記下來的話，登入後會以為快取是新的，其他設定就一直停在預設值
  const CACHE_SCOPE_KEY = 'siteSettingsScope';
  const REFRESH_MS = 10 * 60 * 1000;   // 十分鐘內不重抓

  const GROUPS = [
    { key: 'brand',    name: '系統名稱與登入頁', desc: '顯示在首頁、登入頁、分頁標題、匯出檔與 AI 回答裡。' },
    { key: 'learning', name: '教材頁',           desc: '教材頁首頁的歡迎區塊，以及影片看到多少算完成。' },
    { key: 'schedule', name: '訓練排程',         desc: '授課時數的目標、衝堂時怎麼處理、分享課程時的訊息。' },
    { key: 'radar',    name: '師資雷達圖',       desc: '師資詳細頁「授課強項分布」要依什麼分、算什麼。' },
    { key: 'ai',       name: 'AI 助教',          desc: 'AI 視窗裡的快速提問按鈕與提醒文字。' }
  ];

  const SITE_DEFS = [
    { key: 'systemName', group: 'brand', label: '系統名稱', type: 'text', def: '萬海智慧航安訓練管理系統', max: 40, required: true, pub: true,
      help: '首頁大標題、登入頁、匯出的 PDF／簡報、AI 自我介紹都用這個名稱。' },
    { key: 'systemShortName', group: 'brand', label: '英文／簡稱', type: 'text', def: 'WHL MARITRAIN', max: 30, required: true, pub: true,
      help: '首頁副標題與瀏覽器分頁標題。' },
    { key: 'copyrightHolder', group: 'brand', label: '版權所有者', type: 'text', def: 'Wan Hai Lines Ltd.', max: 60, pub: true,
      help: '頁尾顯示「© 今年 版權所有者」，年份自動更新。' },
    { key: 'supportContact', group: 'brand', label: '聯絡窗口', type: 'text', def: '', max: 100, pub: true,
      help: '例如「資訊室 王小明 分機 1234」。會接在「請聯絡系統管理者」後面；留空就不顯示。' },
    { key: 'forgotPasswordUrl', group: 'brand', label: '忘記密碼連結', type: 'url', def: '', max: 300, pub: true,
      help: '登入頁「忘記密碼？」要連到哪裡，只接受 https:// 或 mailto:。留空就不顯示這個連結。' },

    { key: 'welcomeTitle', group: 'learning', label: '歡迎標題', type: 'text', def: '歡迎回來，繼續累積', max: 40 },
    { key: 'welcomeHighlight', group: 'learning', label: '標題強調文字', type: 'text', def: '海上的實力', max: 20,
      help: '接在歡迎標題後面、用藍色顯示。' },
    { key: 'welcomeBody', group: 'learning', label: '歡迎說明', type: 'longtext', def: '船會換、航線會換，真正跟著你一輩子的是基本功。這裡彙整公司各類船員訓練教材，從船舶操縱、法規合規到職級轉換，一步一步把岸上的準備變成船上的即戰力。', max: 300 },
    { key: 'videoCompletePct', group: 'learning', label: '影片看到幾 % 算完成', type: 'number', def: 92, min: 50, max: 100, unit: '%' },

    { key: 'teachingHoursTarget', group: 'schedule', label: '授課時數目標', type: 'number', def: 12, min: 1, max: 200, unit: '小時',
      help: '訓練排程的師資時數分析：達到這個時數標示「已達標」。' },
    { key: 'teachingHoursWarn', group: 'schedule', label: '接近目標的提醒', type: 'number', def: 8, min: 0, max: 200, unit: '小時',
      help: '達到這個時數但還沒到目標，標示「接近目標」。不能大於目標。' },
    { key: 'conflictPolicy', group: 'schedule', label: '同一位講師衝堂時', type: 'enum', def: 'warn', values: ['warn', 'block'],
      valueLabels: { warn: '提醒，可以選擇照樣排', block: '直接擋下，不能存' } },
    { key: 'shareSubject', group: 'schedule', label: '分享信件主旨', type: 'text', def: '課程資訊分享', max: 60 },
    { key: 'shareTemplate', group: 'schedule', label: '分享／複製課程的訊息', type: 'longtext', max: 1000,
      def: '課程資訊\n課程：{課程}\n教師：{教師}\n日期：{日期}\n時間：{時間}\n類型：{類型}\n備註：{備註}',
      help: '可用 {課程} {教師} {助教} {日期} {時間} {類型} {備註}。值是空的那一行會自動拿掉。' },

    { key: 'radarDimension', group: 'radar', label: '雷達圖的軸', type: 'enum', def: 'courseCategory',
      values: ['courseCategory', 'teachingMethod', 'courseType'],
      valueLabels: { courseCategory: '課程分類', teachingMethod: '授課方式', courseType: '課程類型（依每一場排課）' },
      help: '軸的名稱與順序來自「選單管理」的同名清單。選課程類型時只看訓練排程，師資卡登錄的講授課程沒有類型、不計入。' },
    { key: 'radarMeasure', group: 'radar', label: '算什麼', type: 'enum', def: 'courses',
      values: ['courses', 'sessions', 'hours'],
      valueLabels: { courses: '門數：同一門課只算一次', sessions: '場次：訓練排程排了幾場', hours: '時數：訓練排程的上課時數加總' },
      help: '場次與時數只看訓練排程；門數另外合併師資卡登錄的講授課程。' },
    { key: 'radarIncludeAssist', group: 'radar', label: '助教紀錄', type: 'enum', def: 'no',
      values: ['no', 'yes'], valueLabels: { no: '不算進去，另外列出場次', yes: '一起算進去' } },

    { key: 'aiDisclaimer', group: 'ai', label: '智慧派課 AI 提醒文字', type: 'text', max: 200,
      def: '智慧派課 AI 顧問由大型語言模型驅動，建議您對重要排程進行二次確認。' },
    { key: 'aiQuickPrompts', group: 'ai', label: '智慧派課 AI 快速提問', type: 'list', maxItems: 8, max: 80,
      def: ['推薦大副課程｜推薦大副適合的課程', '新進船員課程｜新進船員需要上哪些課？',
            '領導統御｜領導統御相關的課程有哪些？', '課程分佈分析｜請分析目前課程分佈是否均衡'],
      help: '一行一個按鈕，最多 8 個。寫成「按鈕文字｜送出的問題」；只寫一段就兩者相同。' },
    { key: 'aiLessonPrompts', group: 'ai', label: '教材頁 AI 建議問題', type: 'list', maxItems: 8, max: 80,
      def: ['這個單元的重點是什麼？', '可以用更簡單的方式解釋一次嗎？', '實際在船上會怎麼用到？'],
      help: '上課時 AI 助教視窗裡的建議問題，一行一個。' }
  ];

  const BY_KEY = {};
  SITE_DEFS.forEach(d => { BY_KEY[d.key] = d; });

  function defaults() {
    const out = {};
    SITE_DEFS.forEach(d => { out[d.key] = Array.isArray(d.def) ? d.def.slice() : d.def; });
    return out;
  }

  /** 只收認得的鍵、型別對的值；其餘用預設值 */
  function normalize(raw) {
    const out = defaults();
    if (!raw || typeof raw !== 'object') return out;
    SITE_DEFS.forEach(d => {
      if (!Object.prototype.hasOwnProperty.call(raw, d.key)) return;
      const v = raw[d.key];
      if (d.type === 'number') { const n = Number(v); if (isFinite(n)) out[d.key] = n; }
      else if (d.type === 'list') { if (Array.isArray(v)) out[d.key] = v.map(String); }
      else if (d.type === 'enum') { if (d.values.indexOf(String(v)) >= 0) out[d.key] = String(v); }
      else if (v !== undefined && v !== null) out[d.key] = String(v);
    });
    return out;
  }

  function readCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return raw ? normalize(raw) : null;
    } catch (e) { return null; }
  }

  function writeCache(v, scope) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(v));
      localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
      if (scope) localStorage.setItem(CACHE_SCOPE_KEY, scope);
    } catch (e) { /* 無痕模式 */ }
  }

  function cacheScope() {
    try { return localStorage.getItem(CACHE_SCOPE_KEY) || ''; } catch (e) { return ''; }
  }

  function cacheAge() {
    try { const ts = Number(localStorage.getItem(CACHE_TS_KEY) || 0); return ts ? Date.now() - ts : Infinity; }
    catch (e) { return Infinity; }
  }

  let values = readCache() || defaults();
  let loading = null;

  function loggedIn() {
    try {
      const raw = sessionStorage.getItem('authData') || localStorage.getItem('authData');
      return !!(raw && JSON.parse(raw).token);
    } catch (e) { return false; }
  }

  const Site = {
    DEFS: SITE_DEFS,
    GROUPS: GROUPS,

    get(key) {
      const v = values[key];
      return Array.isArray(v) ? v.slice() : v;
    },

    all() { return JSON.parse(JSON.stringify(values)); },

    defaults: defaults,

    /** 換上一份新的（管理頁存檔後、或後端回來時）；有變就重填頁面並發 site:changed */
    apply(raw, partial) {
      const next = partial ? normalize(Object.assign({}, values, raw)) : normalize(raw);
      const changed = JSON.stringify(next) !== JSON.stringify(values);
      values = next;
      writeCache(values, partial ? (cacheScope() === 'full' ? 'full' : 'public') : 'full');
      if (changed) {
        this.applyToPage();
        try { document.dispatchEvent(new CustomEvent('site:changed', { detail: { settings: this.all() } })); }
        catch (e) { /* 舊瀏覽器 */ }
      }
      return changed;
    },

    /**
     * 向後端要最新的。登入前只拿得到公開的那幾項（系統名稱、版權、聯絡窗口、忘記密碼連結）
     * @param {boolean} force 忽略十分鐘的節流
     */
    ready(force) {
      if (loading) return loading;
      if (typeof api === 'undefined' || !api) return Promise.resolve(this.all());
      const authed = loggedIn();
      if (!force && authed && cacheScope() === 'full' && cacheAge() < REFRESH_MS) return Promise.resolve(this.all());
      const call = authed ? api.siteSettings() : api.sitePublic();
      loading = call
        .then(v => { this.apply(v, !authed); return this.all(); })
        .catch(() => this.all())            // 後端掛了、或還是舊版沒有這個動作：沿用快取／預設值
        .then(v => { loading = null; return v; });
      return loading;
    },

    /**
     * 套範本：{課程} 這類佔位換成值；有佔位但值是空的那一行整行拿掉
     */
    fill(template, map) {
      return String(template || '').split('\n').map(line => {
        let empty = false;
        const out = line.replace(/\{([^{}]+)\}/g, (m, k) => {
          const v = map && Object.prototype.hasOwnProperty.call(map, k) ? String(map[k] == null ? '' : map[k]).trim() : m;
          if (!v) empty = true;
          return v;
        });
        return empty ? null : out;
      }).filter(l => l !== null).join('\n').trim();
    },

    /** 「按鈕文字｜送出的問題」拆成兩半；只有一段就兩者相同 */
    splitPrompt(item) {
      const parts = String(item || '').split(/[｜|]/);
      const label = parts[0].trim();
      const prompt = (parts.slice(1).join('｜') || parts[0]).trim();
      return { label: label || prompt, prompt: prompt };
    },

    /** 接在「請聯絡系統管理者」後面的那段；沒設定聯絡窗口就是空字串 */
    contactSuffix() {
      const c = String(values.supportContact || '').trim();
      return c ? '（' + c + '）' : '';
    },

    /** 把設定填進頁面上標了 data-site 的元素，順便換掉分頁標題裡的系統名稱 */
    applyToPage() {
      if (typeof document === 'undefined' || !document.querySelectorAll) return;
      document.querySelectorAll('[data-site]').forEach(el => {
        const v = values[el.getAttribute('data-site')];
        if (v !== undefined && v !== null) el.textContent = String(v);
      });
      document.querySelectorAll('[data-site-href]').forEach(el => {
        const url = String(values[el.getAttribute('data-site-href')] || '');
        // 後端存檔時已經擋過，這裡再擋一次：只認 https 與 mailto
        const ok = /^(https:\/\/|mailto:)/i.test(url);
        el.hidden = !ok;
        if (ok) el.setAttribute('href', url); else el.removeAttribute('href');
      });
      document.querySelectorAll('[data-site-copyright]').forEach(el => {
        const holder = String(values.copyrightHolder || '').trim();
        el.textContent = '© ' + new Date().getFullYear() + (holder ? ' ' + holder : '');
      });
      document.querySelectorAll('[data-site-contact]').forEach(el => {
        el.textContent = this.contactSuffix();
      });
      // 分頁標題：各頁寫的是預設名稱，換成目前的設定
      // 永遠從頁面原本的標題算起，同一頁改兩次名稱也換得到
      const root = document.documentElement;
      if (root && root.dataset && document.title) {
        if (!root.dataset.siteTitle) root.dataset.siteTitle = document.title;
        const d = defaults();
        document.title = root.dataset.siteTitle
          .split(d.systemShortName).join(values.systemShortName)
          .split(d.systemName).join(values.systemName);
      }
    }
  };

  window.Site = Site;

  // 頁面一載入就先用快取／預設值填字，再背景向後端要最新的
  const boot = () => { Site.applyToPage(); Site.ready(); };
  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
