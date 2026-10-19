/**
 * 下拉選單選項（全站唯一來源）
 *
 * 以前職級清單寫死在 maritime-courses.html 的三個地方、課程分類散在四個檔案，
 * 客戶每要改一次就得改好幾處程式再重新部署。現在清單是資料，管理員在
 * 「帳號管理 → 選單管理」自己維護，各頁只負責把它畫出來。
 *
 * 用法：
 *     await Options.ready();                  // 載入（會先用快取立即可用）
 *     Options.list('crewRank')                // 啟用中的項目，已排序
 *     Options.grouped('crewRank')             // [{group:'甲板部門', items:[...]}, ...]
 *     Options.label('crewRank', 'deckCadet')  // '甲板實習生'（停用的也查得到）
 *     Options.order('crewRank', 'C/O')        // 排序鍵，數字小的職級高
 *
 * 三層降級，任何一層壞掉畫面都還能用：
 *   1. 後端（最新）→ 寫進 localStorage
 *   2. localStorage 快取（離線、後端暫時掛掉時）
 *   3. 內建預設值（第一次開、或快取被清掉）
 *
 * 內建預設值必須和 backend-api.gs 的 OPTION_DEFAULTS 一致，
 * 否則同一個代碼在兩邊會顯示成不同名稱。有測試在盯這件事。
 */
(function () {
  'use strict';

  const CACHE_KEY = 'optionCatalog';
  const CACHE_TS_KEY = 'optionCatalogAt';
  const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;   // 超過 12 小時就當過期，但仍先拿來用

  // [listKey, value, label, sublabel, groupName, sortOrder, active]
  // [listKey, value, label, sublabel, groupName, sortOrder, active, icon]
  const DEFAULTS = [
    ['crewRank', 'C/P',            'C/P',        '船長',            '甲板部門', 10,  true,  'ph-anchor'],
    ['crewRank', 'pilot',          '領港',       'Pilot',           '甲板部門', 15,  true,  'ph-path'],
    ['crewRank', 'C/O',            'C/O',        '大副',            '甲板部門', 20,  true,  'ph-compass'],
    ['crewRank', '2/O',            '2/O',        '二副',            '甲板部門', 30,  true,  'ph-binoculars'],
    ['crewRank', '3/O',            '3/O',        '三副',            '甲板部門', 40,  true,  'ph-navigation-arrow'],
    ['crewRank', 'bosun',          '水手長',     'Bosun',           '甲板部門', 50,  true,  'ph-users-three'],
    ['crewRank', 'carpenter',      '木匠',       'Carpenter',       '甲板部門', 60,  true,  'ph-hammer'],
    ['crewRank', 'AB',             '幹練水手',   'A.B.',            '甲板部門', 70,  true,  'ph-user-check'],
    ['crewRank', 'OS',             '普通水手',   'O.S.',            '甲板部門', 80,  true,  'ph-user'],
    // 實習生：客戶要求不要出現在選單（「對客戶來說，很弱」）。
    // 停用而不是刪掉，既有課程若已勾選過仍顯示得出名稱。
    ['crewRank', 'deckCadet',      '甲板實習生', 'Deck Cadet',      '甲板部門', 90,  false, 'ph-student'],
    ['crewRank', 'C/E',            'C/E',        '輪機長',          '輪機部門', 110, true,  'ph-gear'],
    ['crewRank', '2/E',            '2/E',        '大管',            '輪機部門', 120, true,  'ph-engine'],
    ['crewRank', '3/E',            '3/E',        '二管',            '輪機部門', 130, true,  'ph-wrench'],
    ['crewRank', '4/E',            '4/E',        '三管',            '輪機部門', 140, true,  'ph-screwdriver'],
    ['crewRank', 'oiler',          '加油長',     'Oiler',           '輪機部門', 150, true,  'ph-drop'],
    ['crewRank', 'fitter',         '銅匠',       'Fitter',          '輪機部門', 160, true,  'ph-toolbox'],
    ['crewRank', 'engineCadet',    '輪機實習生', 'Engine Cadet',    '輪機部門', 170, false, 'ph-student'],
    // 客戶說「有時候是某公司的總經理、處長」，所以標準船員職級之外另立一組
    ['crewRank', 'generalManager', '總經理',     'General Manager', '岸上主管', 210, true,  'ph-briefcase'],
    ['crewRank', 'director',       '處長',       'Director',        '岸上主管', 220, true,  'ph-buildings'],

    ['personnelType', 'existing', '現有', '既有船員',   '', 10, true, 'ph-check-circle'],
    ['personnelType', 'new',      '新進', '新加入船員', '', 20, true, 'ph-user-plus'],

    ['teacherType', 'internal', '內部師資', '公司內部教師', '', 10, true, 'ph-user-circle'],
    ['teacherType', 'external', '外部師資', '外聘專業教師', '', 20, true, 'ph-graduation-cap'],

    ['workLocation', 'onboard', '在船', '海上工作', '', 10, true, 'ph-boat'],
    ['workLocation', 'onshore', '在岸', '陸地工作', '', 20, true, 'ph-building'],
    ['workLocation', 'retired', '退休', '已退休',   '', 30, true, 'ph-armchair'],

    ['courseCategory', '01', '01 船舶操縱與航行實務訓練',   '', '', 10, true, ''],
    ['courseCategory', '02', '02 領導統御與檢查應對管理',   '', '', 20, true, ''],
    ['courseCategory', '03', '03 事故案例分析與應變處置訓練', '', '', 30, true, ''],
    ['courseCategory', '04', '04 船舶設備操作與技術知能訓練', '', '', 40, true, ''],
    ['courseCategory', '05', '05 國際法規與環境合規知識',   '', '', 50, true, ''],
    ['courseCategory', '06', '06 船舶貨物裝卸作業實務',     '', '', 60, true, ''],
    ['courseCategory', '07', '07 船員經驗交流與職能回饋',   '', '', 70, true, ''],
    ['courseCategory', '08', '08 職級轉換與壓力調適',       '', '', 80, true, ''],
    ['courseCategory', '09', '09 其他',                     '', '', 90, true, ''],

    ['teachingMethod', '實體課程', '實體課程', '面對面課堂教學，互動性強',   '', 10, true, 'ph-chalkboard-teacher'],
    ['teachingMethod', '線上課程', '線上課程', '遠距線上授課，時間彈性',     '', 20, true, 'ph-monitor-play'],
    ['teachingMethod', '混合課程', '混合課程', '結合實體與線上的混合式教學', '', 30, true, 'ph-shuffle']
  ];

  const LIST_LABELS = {
    crewRank: '船員職級',
    personnelType: '人員類別',
    teacherType: '師資類別',
    workLocation: '工作狀態',
    courseCategory: '課程分類',
    teachingMethod: '授課方式'
  };

  function fromRow(r, i) {
    return {
      id: 'default-' + i,
      listKey: r[0], value: r[1], label: r[2], sublabel: r[3],
      groupName: r[4], sortOrder: r[5], active: r[6], icon: r[7] || '', builtin: true
    };
  }

  function builtinCatalog() {
    return DEFAULTS.map(fromRow);
  }

  function normalize(rows) {
    if (!Array.isArray(rows)) return null;
    const out = rows
      .filter(o => o && o.listKey && o.value !== undefined && o.value !== '')
      .map(o => ({
        id: String(o.id === undefined ? '' : o.id),
        listKey: String(o.listKey),
        value: String(o.value),
        label: String(o.label || o.value),
        sublabel: String(o.sublabel || ''),
        groupName: String(o.groupName || ''),
        sortOrder: Number(o.sortOrder) || 0,
        active: o.active !== false && String(o.active).toUpperCase() !== 'FALSE',
        icon: String(o.icon || ''),
        builtin: o.builtin === true || String(o.builtin).toUpperCase() === 'TRUE'
      }));
    return out.length ? out : null;
  }

  function readCache() {
    try { return normalize(JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')); }
    catch (e) { return null; }
  }

  function writeCache(catalog) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(catalog));
      localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
    } catch (e) { /* 配額滿或無痕模式，不影響功能 */ }
  }

  function cacheAge() {
    const ts = Number(localStorage.getItem(CACHE_TS_KEY) || 0);
    return ts ? Date.now() - ts : Infinity;
  }

  // 開場就先有東西可用：快取優先，沒有就用內建預設值
  let catalog = readCache() || builtinCatalog();
  let source = readCache() ? 'cache' : 'builtin';
  let loading = null;

  function byList(key) {
    return catalog.filter(o => o.listKey === key)
                  .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const Options = {
    LIST_LABELS: LIST_LABELS,

    /** 目前這份清單是哪來的：backend / cache / builtin */
    get source() { return source; },

    /**
     * 向後端要最新的；失敗就沿用現有的，不要讓畫面空掉
     * @param {boolean} force 忽略快取年齡強制重抓
     */
    ready(force) {
      if (loading) return loading;
      const fresh = source === 'cache' && cacheAge() < CACHE_MAX_AGE_MS;
      if (!force && fresh) return Promise.resolve(catalog);
      if (typeof api === 'undefined' || !api || typeof api.listOptions !== 'function') {
        return Promise.resolve(catalog);
      }
      loading = api.listOptions()
        .then(rows => {
          const clean = normalize(rows);
          if (clean) { catalog = clean; source = 'backend'; writeCache(clean); }
          return catalog;
        })
        .catch(() => catalog)        // 後端掛掉時維持快取／預設值
        .then(c => { loading = null; return c; });
      return loading;
    },

    /** 直接換掉目前這份（管理頁存檔後呼叫，免得要重新整理） */
    apply(rows) {
      const clean = normalize(rows);
      if (clean) { catalog = clean; source = 'backend'; writeCache(clean); }
      return catalog;
    },

    /** 啟用中的項目，依排序 */
    list(key) { return byList(key).filter(o => o.active); },

    /** 全部項目（含停用），管理頁用 */
    all(key) { return byList(key); },

    /** 顯示名稱。停用的也查得到，舊資料才不會變成看不懂的代碼 */
    label(key, value) {
      const v = String(value === undefined || value === null ? '' : value);
      if (!v) return '';
      const hit = catalog.find(o => o.listKey === key && o.value === v);
      return hit ? hit.label : v;
    },

    /** 連同副標的完整顯示，例如「C/O 大副」 */
    fullLabel(key, value) {
      const v = String(value === undefined || value === null ? '' : value);
      if (!v) return '';
      const hit = catalog.find(o => o.listKey === key && o.value === v);
      if (!hit) return v;
      return hit.sublabel ? hit.label + ' ' + hit.sublabel : hit.label;
    },

    /** 這個代碼還在不在啟用清單裡 */
    isActive(key, value) {
      const hit = catalog.find(o => o.listKey === key && o.value === String(value));
      return !!(hit && hit.active);
    },

    /**
     * 排序鍵。職級的 sortOrder 同時就是階層順序（數字小的職級高），
     * 所以講師選單用它排就會「同職級排在一起」。
     * 查不到的（沒填職級、或已被刪掉的代碼）回傳很大的數字排到最後，
     * 才不會因為沒填職級就被擠到看不見的地方——它們仍在清單裡，只是在後面。
     */
    order(key, value) {
      const hit = catalog.find(o => o.listKey === key && o.value === String(value));
      return hit ? hit.sortOrder : Number.MAX_SAFE_INTEGER;
    },

    /** 依 groupName 分組（職級的甲板部門／輪機部門／岸上主管） */
    grouped(key, includeInactive) {
      const items = includeInactive ? byList(key) : byList(key).filter(o => o.active);
      const groups = [];
      const index = {};
      items.forEach(o => {
        const g = o.groupName || '';
        if (index[g] === undefined) { index[g] = groups.length; groups.push({ group: g, items: [] }); }
        groups[index[g]].items.push(o);
      });
      return groups;
    },

    /** 內建預設值，給管理頁的「還原」與測試用 */
    defaults(key) {
      const all = builtinCatalog();
      return key ? all.filter(o => o.listKey === key) : all;
    }
  };

  window.Options = Options;
})();
