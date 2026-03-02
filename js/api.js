// ==================== API 層：與 Google Apps Script 後端通訊 ====================

/**
 * 設定區
 * 部署完 Google Apps Script 後，將取得的 Web App URL 填入下方
 */
const API_CONFIG = {
  // 將此 URL 替換為你部署後的 Google Apps Script Web App URL
  baseUrl: 'https://script.google.com/macros/s/AKfycbyoOCS1E92C3-WcQUMuHiAoKIJwFZriIQYdoMieRel2HY075HYcqHsE84w4fNdGOsVzJQ/exec',
  timeout: 30000,  // 30 秒超時
  enableSessions: false, // 是否啟用 Session 追蹤與鎖定功能
  debug: false  // 開啟/關閉調試日誌（生產環境請設為 false）
};

/**
 * 從 sessionStorage 取得登入後的 Session Token
 */
function _getSessionToken() {
  try {
    const authData = sessionStorage.getItem('authData') || localStorage.getItem('authData');
    if (!authData) return '';
    const parsed = JSON.parse(authData);
    return parsed.token || '';
  } catch (e) {
    return '';
  }
}

/**
 * API 類別：統一管理所有後端呼叫
 */
class TeacherRosterAPI {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout;
    this.debug = config.debug || false;
  }

  /**
   * 取得當前 Session Token（動態讀取，不寫死）
   */
  get token() {
    return _getSessionToken();
  }

  /**
   * 登入（使用 POST 方法，密碼不會出現在 URL 中）
   * @param {string} username
   * @param {string} password
   * @returns {Object} { user, token }
   */
  async login(username, password) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const body = new URLSearchParams();
      body.append('action', 'login');
      body.append('username', username);
      body.append('password', password);

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: body.toString(),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('伺服器回傳狀態碼 ' + response.status);
      }

      const result = await response.json();
      if (!result.ok) {
        throw new Error(result.error || '登入失敗');
      }

      return result.data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') throw new Error('請求超時');
      if (error instanceof TypeError) throw new Error('無法連線到 API：' + error.message);
      throw error;
    }
  }

  /**
   * 測試連線
   */
  async ping() {
    try {
      const response = await this._get({ action: 'ping' });
      return response;
    } catch (error) {
      console.error('Ping 失敗:', error);
      throw error;
    }
  }

  /**
   * 讀取特定表格的所有資料
   * @param {string} table - 表格名稱: 'teachers', 'courseAssignments', 'maritimeCourses'
   */
  async list(table) {
    try {
      const response = await this._get({ action: 'list', table });
      return response.data || [];
    } catch (error) {
      console.error(`讀取 ${table} 失敗:`, error);
      throw error;
    }
  }

  /**
   * 讀取所有表格的資料
   * @returns {Object} { teachers: [], courseAssignments: [], maritimeCourses: [] }
   */
  async listAll() {
    try {
      const response = await this._get({ action: 'listall' });
      return response.data || {};
    } catch (error) {
      console.error('讀取所有資料失敗:', error);
      throw error;
    }
  }

  /**
   * 取得資料版本資訊（用於衝突檢測）
   * @returns {Object} { teachers: {count, fingerprint, lastModified}, ... }
   */
  async getVersions() {
    try {
      const response = await this._get({ action: 'getversions' });
      return response.versions || {};
    } catch (error) {
      console.error('取得版本資訊失敗:', error);
      throw error;
    }
  }

  /**
   * 儲存特定表格的資料
   * @param {string} table - 表格名稱
   * @param {Array} data - 資料陣列
   */
  async save(table, data) {
    try {
      const response = await this._post({
        action: 'save',
        table,
        data
      });
      return response;
    } catch (error) {
      console.error(`儲存 ${table} 失敗:`, error);
      throw error;
    }
  }

  /**
   * 批次儲存多個表格（單次 HTTP 請求，大幅減少等待時間）
   * @param {Object} tables - { tableName: data[] } 格式
   */
  async batchSave(tables) {
    try {
      const response = await this._post({
        action: 'batchsave',
        tables
      });
      return response;
    } catch (error) {
      console.error('批次儲存失敗:', error);
      throw error;
    }
  }

  /**
   * 上傳檔案到 Google Drive
   * @param {File|Blob} file - 檔案物件
   * @param {string} fileName - 檔案名稱（可選）
   */
  async uploadFile(file, fileName = null) {
    try {
      const formData = new FormData();
      formData.append('file', file, fileName || file.name);
      formData.append('token', this.token);
      formData.append('action', 'uploadfile');

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (!result.ok) throw new Error(result.error || '上傳失敗');
      return result;
    } catch (error) {
      console.error('上傳檔案失敗:', error);
      throw error;
    }
  }

  /**
   * 上傳 Base64 DataURL
   * @param {string} dataUrl - Base64 編碼的資料 URL
   * @param {string} fileName - 檔案名稱
   */
  async uploadDataUrl(dataUrl, fileName) {
    try {
      const response = await this._post({
        action: 'uploadfile',
        dataUrl,
        fileName
      });
      return response;
    } catch (error) {
      console.error('上傳 DataURL 失敗:', error);
      throw error;
    }
  }

  /**
   * GET 請求
   */
  async _get(params) {
    const url = new URL(this.baseUrl);
    url.searchParams.append('token', this.token);
    Object.keys(params).forEach(key => {
      url.searchParams.append(key, params[key]);
    });

    if (this.debug) {
      console.log('🌐 發送 GET 請求:', url.toString());
      console.log('🌐 請求參數:', params);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (this.debug) {
        console.log('📡 收到響應，狀態碼:', response.status);
      }

      if (!response.ok) {
        throw new Error(`後端回傳狀態碼 ${response.status}`);
      }

      let result;
      try {
        const responseText = await response.text();
        if (this.debug) {
          console.log('📄 響應內容 (前500字):', responseText.substring(0, 500));
        }
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ JSON 解析失敗:', parseError);
        throw new Error('後端回應不是 JSON 格式，請確認 Apps Script 是否有回傳 JSON');
      }

      if (this.debug) {
        console.log('✅ JSON 解析成功:', result);
      }

      if (!result.ok) {
        if (result.error === 'Unauthorized') {
          console.warn('Session 已過期，導向登入頁面');
          _handleSessionExpired();
          throw new Error('Session 已過期，請重新登入');
        }
        throw new Error(result.error || '請求失敗');
      }

      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('❌ GET 請求失敗:', error);
      if (error.name === 'AbortError') {
        throw new Error('請求超時');
      }
      if (error instanceof TypeError) {
        throw new Error('無法連線到 API，可能是 CORS 或網路連線問題：' + error.message);
      }
      throw error;
    }
  }

  /**
   * POST 請求
   */
  async _post(data) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const body = new URLSearchParams();
      body.append('token', this.token);
      Object.entries(data).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        const serialized = (typeof value === 'object') ? JSON.stringify(value) : value;
        body.append(key, serialized);
      });

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: body.toString(),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`後端回傳狀態碼 ${response.status}`);
      }

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        throw new Error('後端回應不是 JSON 格式，請確認 Apps Script 是否有回傳 JSON');
      }

      if (!result.ok) {
        if (result.error === 'Unauthorized') {
          console.warn('Session 已過期，導向登入頁面');
          _handleSessionExpired();
          throw new Error('Session 已過期，請重新登入');
        }
        throw new Error(result.error || '請求失敗');
      }

      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('請求超時');
      }
      if (error instanceof TypeError) {
        throw new Error('無法連線到 API，可能是 CORS 或網路連線問題：' + error.message);
      }
      throw error;
    }
  }
}

// 建立全域 API 實例
const api = new TeacherRosterAPI(API_CONFIG);

// Session 過期通知 dedup flag（避免同一頁面多個 API 請求同時觸發多個 alert）
let _sessionExpiredNotified = false;

function _handleSessionExpired() {
  sessionStorage.removeItem('authData');
  localStorage.removeItem('authData');
  if (_sessionExpiredNotified) return; // 已經通知過，不重複
  _sessionExpiredNotified = true;
  if (!window.location.pathname.endsWith('login.html')) {
    alert('登入逾期，請重新登入以載入行事曆資料。');
    window.location.href = 'login.html';
  }
}

function normalizeNumeric(value) {
  if (value === undefined || value === null || value === '') {
    return value;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : value;
}

function normalizeTeacherRecord(record) {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const normalized = { ...record };
  normalized.id = normalizeNumeric(normalized.id);
  return normalized;
}

function normalizeCourseAssignment(record) {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const normalized = { ...record };
  normalized.id = normalizeNumeric(normalized.id);
  normalized.teacherId = normalizeNumeric(normalized.teacherId);
  normalized.taId = normalizeNumeric(normalized.taId);

  if (typeof normalized.date === 'string') {
    normalized.date = normalized.date.trim();
  }

  if (typeof normalized.time === 'string') {
    normalized.time = normalized.time.trim();
  }

  return normalized;
}

function loadArrayFromStorage(key, normalizer) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return typeof normalizer === 'function' ? parsed.map(normalizer) : parsed;
  } catch (error) {
    console.warn(`⚠️ 無法解析 ${key}:`, error);
    return [];
  }
}

/**
 * 資料同步管理器
 * 負責 localStorage 與後端的雙向同步
 */
class DataSyncManager {
  constructor(apiInstance) {
    this.api = apiInstance;
    this.syncInterval = null;
    this.autoSyncEnabled = false;
  }

  /**
   * 從後端載入所有資料到 localStorage
   */
  async loadFromBackend() {
    try {
      if (this.api.debug) {
        console.log('📥 從後端載入資料...');
        console.log('🔍 API URL:', this.api.baseUrl);
        console.log('🔍 Token:', this.api.token ? '已設置' : '未設置');
      }

      const allData = await this.api.listAll();

      // 詳細日誌
      if (this.api.debug) {
        console.log('🔍 後端返回的原始資料:', allData);
        console.log('🔍 teachers 數量:', allData.teachers?.length || 0);
        console.log('🔍 courseAssignments 數量:', allData.courseAssignments?.length || 0);
        console.log('🔍 maritimeCourses 數量:', allData.maritimeCourses?.length || 0);
      }

      const normalizedTeachers = Array.isArray(allData.teachers)
        ? allData.teachers.map(normalizeTeacherRecord)
        : [];
      const normalizedCourses = Array.isArray(allData.courseAssignments)
        ? allData.courseAssignments.map(normalizeCourseAssignment)
        : [];
      const maritimeCourses = Array.isArray(allData.maritimeCourses)
        ? allData.maritimeCourses
        : [];

      if (this.api.debug) {
        console.log('🔍 歸一化後的課程數據:', normalizedCourses);
      }

      // 儲存到 localStorage
      localStorage.setItem('teachers', JSON.stringify(normalizedTeachers));
      localStorage.setItem('courseAssignments', JSON.stringify(normalizedCourses));
      localStorage.setItem('maritimeCourses', JSON.stringify(maritimeCourses));

      // 儲存資料版本指紋（用於衝突檢測）
      try {
        const versions = await this.api.getVersions();
        localStorage.setItem('dataVersions', JSON.stringify(versions));
        if (this.api.debug) {
          console.log('🔖 已儲存資料版本指紋:', versions);
        }
      } catch (versionError) {
        console.warn('⚠️ 無法取得資料版本:', versionError);
      }

      // 更新最後同步時間
      localStorage.setItem('lastSyncTime', new Date().toISOString());
      // 清除本地修改標記（因為已經從後端載入最新資料）
      localStorage.removeItem('hasLocalChanges');

      if (this.api.debug) {
        console.log('✅ 資料載入完成');
        console.log('✅ teachers:', normalizedTeachers.length, '筆');
        console.log('✅ courseAssignments:', normalizedCourses.length, '筆');
        console.log('✅ maritimeCourses:', maritimeCourses.length, '筆');
      }

      return {
        ...allData,
        teachers: normalizedTeachers,
        courseAssignments: normalizedCourses,
        maritimeCourses
      };
    } catch (error) {
      console.error('❌ 載入資料失敗:', error);
      console.error('❌ 錯誤詳情:', error.message);
      console.error('❌ 錯誤堆疊:', error.stack);
      throw error;
    }
  }

  /**
   * 將 localStorage 資料上傳到後端
   */
  async saveToBackend() {
    try {
      if (this.api.debug) {
        console.log('📤 儲存資料到後端...');
      }

      const teachers = loadArrayFromStorage('teachers', normalizeTeacherRecord);
      const courseAssignments = loadArrayFromStorage('courseAssignments', normalizeCourseAssignment);
      const maritimeCourses = loadArrayFromStorage('maritimeCourses');

      // 批次儲存三個表格（單次請求，比依序儲存快 3 倍）
      await this.api.batchSave({ teachers, courseAssignments, maritimeCourses });

      // 更新最後同步時間
      localStorage.setItem('lastSyncTime', new Date().toISOString());

      if (this.api.debug) {
        console.log('✅ 資料儲存完成');
      }
      return true;
    } catch (error) {
      console.error('❌ 儲存資料失敗:', error);
      throw error;
    }
  }

  /**
   * 儲存特定表格（含衝突檢測）
   * @param {string} tableName - 表格名稱
   * @param {boolean} forceOverwrite - 是否強制覆蓋（忽略衝突）
   */
  async saveTable(tableName, forceOverwrite = false) {
    try {
      const normalizer = tableName === 'teachers'
        ? normalizeTeacherRecord
        : tableName === 'courseAssignments'
          ? normalizeCourseAssignment
          : undefined;
      const data = loadArrayFromStorage(tableName, normalizer);

      // 衝突檢測
      if (!forceOverwrite) {
        try {
          const savedVersions = JSON.parse(localStorage.getItem('dataVersions') || '{}');
          const currentVersions = await this.api.getVersions();

          const saved = savedVersions[tableName];
          const current = currentVersions[tableName];

          if (saved && current && saved.fingerprint !== current.fingerprint) {
            console.warn(`⚠️ ${tableName} 偵測到資料衝突`);
            return {
              conflict: true,
              table: tableName,
              savedCount: saved.count,
              currentCount: current.count,
              message: `${tableName} 資料已被其他人修改`
            };
          }
        } catch (versionCheckError) {
          console.warn('⚠️ 衝突檢測失敗，繼續儲存:', versionCheckError);
        }
      }

      await this.api.save(tableName, data);

      localStorage.setItem('lastSyncTime', new Date().toISOString());

      // 立刻清除舊版本指紋，避免下次儲存時誤報衝突
      localStorage.removeItem('dataVersions');

      // 非同步取得最新版本指紋（不阻塞回傳）
      this.api.getVersions().then(newVersions => {
        localStorage.setItem('dataVersions', JSON.stringify(newVersions));
      }).catch(e => console.warn('⚠️ 更新版本指紋失敗:', e));
      if (this.api.debug) {
        console.log(`✅ ${tableName} 儲存完成`);
      }
      return { success: true };
    } catch (error) {
      console.error(`❌ 儲存 ${tableName} 失敗:`, error);
      throw error;
    }
  }

  /**
   * 啟用自動同步（每 N 分鐘）
   */
  enableAutoSync(intervalMinutes = 5) {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.autoSyncEnabled = true;
    this.syncInterval = setInterval(async () => {
      try {
        await this.saveToBackend();
        if (this.api.debug) {
          console.log('🔄 自動同步完成');
        }
      } catch (error) {
        console.error('🔄 自動同步失敗:', error);
      }
    }, intervalMinutes * 60 * 1000);

    if (this.api.debug) {
      console.log(`🔄 已啟用自動同步（每 ${intervalMinutes} 分鐘）`);
    }
  }

  /**
   * 停用自動同步
   */
  disableAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.autoSyncEnabled = false;
    if (this.api.debug) {
      console.log('🔄 已停用自動同步');
    }
  }

  /**
   * 取得最後同步時間
   */
  getLastSyncTime() {
    const time = localStorage.getItem('lastSyncTime');
    return time ? new Date(time) : null;
  }

  /**
   * 安全儲存：儲存到後端（含衝突檢測）
   * 會在儲存前檢查後端資料是否被其他人修改過
   * @param {boolean} forceOverwrite - 是否強制覆蓋（忽略衝突）
   */
  async saveToBackendSafe(forceOverwrite = false) {
    try {
      if (this.api.debug) {
        console.log('📤 儲存資料到後端（含衝突檢測）...');
      }

      // 取得本地資料
      const localTeachers = loadArrayFromStorage('teachers', normalizeTeacherRecord);
      const localCourses = loadArrayFromStorage('courseAssignments', normalizeCourseAssignment);
      const localMaritime = loadArrayFromStorage('maritimeCourses');

      // 檢查是否有修改標記
      const hasLocalChanges = localStorage.getItem('hasLocalChanges') === 'true';

      if (!hasLocalChanges) {
        if (this.api.debug) {
          console.log('⏭️ 本地無修改，跳過儲存');
        }
        return { skipped: true, reason: 'no_local_changes' };
      }

      // 衝突檢測：比對儲存的版本與後端目前版本
      if (!forceOverwrite) {
        try {
          const savedVersions = JSON.parse(localStorage.getItem('dataVersions') || '{}');
          const currentVersions = await this.api.getVersions();

          const conflicts = [];
          const tables = ['teachers', 'courseAssignments', 'maritimeCourses'];

          for (const table of tables) {
            const saved = savedVersions[table];
            const current = currentVersions[table];

            if (saved && current) {
              // 比對指紋，如果不同表示資料已被修改
              if (saved.fingerprint !== current.fingerprint) {
                conflicts.push({
                  table,
                  savedCount: saved.count,
                  currentCount: current.count,
                  savedFingerprint: saved.fingerprint,
                  currentFingerprint: current.fingerprint
                });
              }
            }
          }

          if (conflicts.length > 0) {
            console.warn('⚠️ 偵測到資料衝突:', conflicts);
            return {
              conflict: true,
              conflicts: conflicts,
              message: '後端資料已被其他人修改，請先重新載入資料再進行編輯',
              hint: '您可以選擇「重新載入」獲取最新資料，或「強制覆蓋」使用您的本地資料'
            };
          }
        } catch (versionCheckError) {
          console.warn('⚠️ 衝突檢測失敗，繼續儲存:', versionCheckError);
        }
      }

      // 批次儲存資料（單次請求，比依序儲存快 3 倍）
      await this.api.batchSave({
        teachers: localTeachers,
        courseAssignments: localCourses,
        maritimeCourses: localMaritime
      });

      // 清除修改標記
      localStorage.removeItem('hasLocalChanges');
      localStorage.setItem('lastSyncTime', new Date().toISOString());

      // 立刻清除舊版本指紋，避免下次儲存時誤報衝突
      // （後端資料剛被更新，舊指紋已失效）
      localStorage.removeItem('dataVersions');

      // 非同步取得最新版本指紋（不阻塞回傳）
      this.api.getVersions().then(newVersions => {
        localStorage.setItem('dataVersions', JSON.stringify(newVersions));
      }).catch(e => console.warn('⚠️ 更新版本指紋失敗:', e));

      if (this.api.debug) {
        console.log('✅ 資料已儲存完成');
      }
      return { success: true };
    } catch (error) {
      console.error('❌ 儲存資料失敗:', error);
      throw error;
    }
  }

  /**
   * 標記本地資料已修改
   */
  markAsChanged() {
    localStorage.setItem('hasLocalChanges', 'true');
    if (this.api.debug) {
      console.log('🔖 標記資料已修改');
    }
  }
}

// 建立全域同步管理器實例
const syncManager = new DataSyncManager(api);

/**
 * Session 管理器
 * 負責追蹤使用者在線狀態，支援踢人功能
 */
class SessionManager {
  constructor(apiInstance) {
    this.api = apiInstance;
    this.sessionId = null;
    this.userName = null;
    this.userEmail = null;
    this.heartbeatInterval = null;
    this.checkKickedInterval = null;
    this.isActive = false;
  }

  /**
   * 註冊 session（頁面載入時呼叫）
   */
  async register(userName = null, userEmail = null) {
    if (!API_CONFIG.enableSessions) {
      if (this.api.debug) {
        console.log('ℹ️ 已停用 Session 追蹤，略過註冊');
      }
      return { ok: true, disabled: true };
    }

    try {
      // 從 localStorage 取得使用者名稱，若沒有就使用預設值避免彈跳視窗
      if (!userName) {
        userName = localStorage.getItem('sessionUserName') || '訪客';
        localStorage.setItem('sessionUserName', userName);
      }

      if (!userEmail) {
        userEmail = localStorage.getItem('sessionUserEmail') || '';
      }

      // 產生或取得 sessionId
      this.sessionId = localStorage.getItem('sessionId') || this._generateSessionId();
      localStorage.setItem('sessionId', this.sessionId);

      this.userName = userName || '訪客';
      this.userEmail = userEmail;

      const response = await this.api._get({
        action: 'session_register',
        sessionId: this.sessionId,
        userName: this.userName,
        userEmail: this.userEmail,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent
      });

      if (response.ok) {
        this.isActive = true;
        this._startHeartbeat();
        this._startKickedCheck();
        if (this.api.debug) {
          console.log('✅ Session 已註冊:', this.sessionId);
        }
      }

      return response;
    } catch (error) {
      console.error('❌ Session 註冊失敗:', error);
      throw error;
    }
  }

  /**
   * 更新心跳
   */
  async heartbeat() {
    if (!this.sessionId || !this.isActive) return;

    try {
      const response = await this.api._get({
        action: 'session_heartbeat',
        sessionId: this.sessionId
      });

      if (response.ok && response.kicked) {
        this._handleKicked();
      }

      return response;
    } catch (error) {
      console.error('❌ Heartbeat 失敗:', error);
    }
  }

  /**
   * 取得目前活躍的 sessions
   */
  async getActiveSessions() {
    try {
      const response = await this.api._get({
        action: 'session_list'
      });

      return response.sessions || [];
    } catch (error) {
      console.error('❌ 取得活躍 sessions 失敗:', error);
      return [];
    }
  }

  /**
   * 踢出特定使用者
   */
  async kickUser(targetSessionId) {
    try {
      const response = await this.api._get({
        action: 'session_kick',
        sessionId: targetSessionId
      });

      return response;
    } catch (error) {
      console.error('❌ 踢人失敗:', error);
      throw error;
    }
  }

  /**
   * 檢查自己是否被踢出
   */
  async checkKicked() {
    if (!this.sessionId || !this.isActive) return false;

    try {
      const response = await this.api._get({
        action: 'session_check_kicked',
        sessionId: this.sessionId
      });

      if (response.ok && response.kicked) {
        this._handleKicked();
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ 檢查踢出狀態失敗:', error);
      return false;
    }
  }

  /**
   * 取消註冊（離開頁面時呼叫）
   */
  unregister() {
    this.isActive = false;
    this._stopHeartbeat();
    this._stopKickedCheck();
    if (this.api.debug) {
      console.log('👋 Session 已取消註冊');
    }
  }

  /**
   * 啟動心跳（每 30 秒）
   */
  _startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      this.heartbeat();
    }, 30 * 1000); // 30 秒
  }

  /**
   * 停止心跳
   */
  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 啟動踢出檢查（每 10 秒）
   */
  _startKickedCheck() {
    if (this.checkKickedInterval) {
      clearInterval(this.checkKickedInterval);
    }

    this.checkKickedInterval = setInterval(() => {
      this.checkKicked();
    }, 10 * 1000); // 10 秒
  }

  /**
   * 停止踢出檢查
   */
  _stopKickedCheck() {
    if (this.checkKickedInterval) {
      clearInterval(this.checkKickedInterval);
      this.checkKickedInterval = null;
    }
  }

  /**
   * 處理被踢出
   */
  _handleKicked() {
    this.unregister();
    alert('⚠️ 您已被管理員踢出，頁面即將重新載入。');
    localStorage.removeItem('sessionId'); // 清除舊的 sessionId
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }

  /**
   * 產生 sessionId
   */
  _generateSessionId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

// 建立全域 Session Manager 實例
const sessionManager = new SessionManager(api);

/**
 * 編輯鎖定管理器
 * 實現細粒度鎖定，讓多人可以同時編輯不同資料
 */
class EditLockManager {
  constructor(apiInstance, sessionManagerInstance) {
    this.api = apiInstance;
    this.sessionManager = sessionManagerInstance;
    this.activeLocks = new Map(); // 追蹤目前持有的鎖定
  }

  /**
   * 取得編輯鎖定
   */
  async acquireLock(table, recordId) {
    if (!API_CONFIG.enableSessions) {
      return {
        ok: true,
        locked: true,
        ownLock: true,
        skipped: true
      };
    }

    try {
      const response = await this.api._get({
        action: 'lock_acquire',
        table,
        recordId: String(recordId),
        sessionId: this.sessionManager.sessionId,
        userName: this.sessionManager.userName
      });

      if (response.ok) {
        if (response.ownLock) {
          // 成功取得鎖定
          const lockKey = `${table}:${recordId}`;
          this.activeLocks.set(lockKey, {
            table,
            recordId,
            lockedAt: new Date()
          });
          if (this.api.debug) {
            console.log(`🔒 已鎖定 ${table}/${recordId}`);
          }
          return { locked: true, ownLock: true };
        } else {
          // 已被其他人鎖定
          console.warn(`⚠️ ${table}/${recordId} 已被 ${response.lockedBy} 鎖定`);
          return {
            locked: false,
            lockedBy: response.lockedBy,
            lockedAt: response.lockedAt
          };
        }
      }

      return { locked: false };
    } catch (error) {
      console.error('❌ 取得鎖定失敗:', error);
      return { locked: false, error: error.message };
    }
  }

  /**
   * 釋放編輯鎖定
   */
  async releaseLock(table, recordId) {
    if (!API_CONFIG.enableSessions) {
      return { released: true, skipped: true };
    }

    try {
      const response = await this.api._get({
        action: 'lock_release',
        table,
        recordId: String(recordId),
        sessionId: this.sessionManager.sessionId
      });

      if (response.ok && response.released) {
        const lockKey = `${table}:${recordId}`;
        this.activeLocks.delete(lockKey);
        if (this.api.debug) {
          console.log(`🔓 已釋放 ${table}/${recordId}`);
        }
        return { released: true };
      }

      return { released: false };
    } catch (error) {
      console.error('❌ 釋放鎖定失敗:', error);
      return { released: false, error: error.message };
    }
  }

  /**
   * 檢查特定資料的鎖定狀態
   */
  async checkLock(table, recordId) {
    if (!API_CONFIG.enableSessions) {
      return null;
    }

    try {
      const response = await this.api._get({
        action: 'lock_check',
        table,
        recordId: String(recordId)
      });

      return response.lock || null;
    } catch (error) {
      console.error('❌ 檢查鎖定失敗:', error);
      return null;
    }
  }

  /**
   * 取得所有鎖定（可選過濾）
   */
  async getAllLocks(table = null) {
    if (!API_CONFIG.enableSessions) {
      return { ok: true, locks: [], skipped: true };
    }

    try {
      const params = { action: 'lock_list' };
      if (table) params.table = table;

      const response = await this.api._get(params);
      return { ok: true, locks: response.locks || [] };
    } catch (error) {
      console.error('❌ 取得鎖定列表失敗:', error);
      return { ok: false, error: error.message };
    }
  }

  /**
   * 釋放所有持有的鎖定
   */
  async releaseAllLocks() {
    if (!API_CONFIG.enableSessions) {
      return { released: true, skipped: true };
    }

    const promises = [];
    for (const [lockKey, lock] of this.activeLocks.entries()) {
      promises.push(this.releaseLock(lock.table, lock.recordId));
    }

    await Promise.all(promises);
    this.activeLocks.clear();
    if (this.api.debug) {
      console.log('🔓 已釋放所有鎖定');
    }
  }
}

// 建立全域 Edit Lock Manager 實例
const editLockManager = new EditLockManager(api, sessionManager);

/**
 * 便利函數：顯示同步狀態訊息
 */
function showSyncStatus(message, type = 'info', options = {}) {
  // 如果頁面有 showMessage 函數就使用它
  if (typeof showMessage === 'function') {
    showMessage(message, type, options.hint || '');
  } else {
    console.log(`[${type.toUpperCase()}] ${message}`);
    if (options.hint) {
      console.log('↳', options.hint);
    }
  }
}

/**
 * 頁面載入時自動從後端同步資料
 */
async function initializeDataSync() {
  try {
    // 測試連線
    await api.ping();
    if (API_CONFIG.debug) {
      console.log('✅ 後端連線成功');
    }

    // 載入資料
    await syncManager.loadFromBackend();
    // showSyncStatus('資料已從雲端載入', 'success');

    // 註冊 session（追蹤使用者在線狀態）
    if (API_CONFIG.enableSessions) {
      try {
        await sessionManager.register();
      } catch (sessionError) {
        console.warn('⚠️ Session 註冊失敗:', sessionError);
      }
    } else if (API_CONFIG.debug) {
      console.log('ℹ️ Session 功能已停用，略過註冊。');
    }

    // 可選：啟用自動同步（每 5 分鐘）
    // syncManager.enableAutoSync(5);

  } catch (error) {
    console.warn('⚠️ 無法連線到後端，使用本地資料:', error);
    // showSyncStatus('使用離線模式', 'warning', {
    //   hint: '請確認 API URL 與 TOKEN 設定是否正確，或檢查網路連線狀態。'
    // });
  }
}

// 頁面離開時取消註冊 session 並釋放所有鎖定
window.addEventListener('beforeunload', () => {
  // 同步釋放鎖定（使用 Navigator.sendBeacon 確保請求送出）
  editLockManager.releaseAllLocks().catch(err => {
    console.warn('釋放鎖定失敗:', err);
  });
  if (API_CONFIG.enableSessions) {
    sessionManager.unregister();
  }
});

// ==================== AI 對話管理器 ====================

/**
 * AI 對話管理器
 * 透過後端 GAS 呼叫 Gemini API，實現智慧課程顧問功能
 */
class AIChatManager {
  constructor(apiInstance) {
    this.api = apiInstance;
    this.conversationHistory = [];
    this.isStreaming = false;
    this.onToken = null;
    this.onComplete = null;
    this.onError = null;
    this._lastRequestTime = 0;
    this._minInterval = 5000; // 最少間隔 5 秒（免費 API 配額保護）
    this._cooldownUntil = 0;
    this._consecutiveFailures = 0; // 連續失敗計數
    this._cachedContext = null;    // 系統上下文快取
    this._contextCacheTime = 0;   // 上下文快取時間
  }

  /**
   * 建構系統提示詞（含課程上下文），5 分鐘內使用快取
   */
  _buildSystemContext() {
    const now = Date.now();
    if (this._cachedContext && (now - this._contextCacheTime) < 300000) {
      return this._cachedContext;
    }

    const courses = loadArrayFromStorage('maritimeCourses');
    const teachers = loadArrayFromStorage('teachers', normalizeTeacherRecord);

    const coursesSummary = courses.map(c => {
      const keywords = Array.isArray(c.keywords) ? c.keywords.join('、') : '';
      const targets = [];
      if (Array.isArray(c.targetCategories)) targets.push(...c.targetCategories.map(t => t === 'existing' ? '現有船員' : '新進船員'));
      if (Array.isArray(c.targetRanks)) targets.push(...c.targetRanks);
      return `- ${c.name}（分類: ${c.category}, 方式: ${c.method || '未設定'}, 關鍵字: ${keywords}, 適用: ${targets.join('、') || '全員'}）`;
    }).join('\n');

    const teachersSummary = teachers.slice(0, 20).map(t =>
      `- ${t.name}（類別: ${t.teacherType || '未設定'}, 職等: ${t.rank || '未設定'}, 專長: ${(Array.isArray(t.subjects) ? t.subjects.join('、') : '') || '未設定'}）`
    ).join('\n');

    this._cachedContext = `你是「萬海智慧航安訓練管理系統」的 AI 課程顧問。請用繁體中文回答，語氣專業但親切。

以下是目前系統中的課程資料（共 ${courses.length} 門課程）：
${coursesSummary}

以下是教師名單（前 20 位）：
${teachersSummary}

你的職責：
1. 根據使用者的職等、經驗與需求，推薦最適合的課程
2. 解答課程內容、訓練安排相關問題
3. 提供船員職涯發展建議
4. 分析課程之間的關聯性與學習路徑

回答注意事項：
- 回答請簡潔有力，使用項目符號整理
- 推薦課程時，請說明理由
- 若找不到完全匹配的課程，建議最接近的選項`;
    this._contextCacheTime = now;
    return this._cachedContext;
  }

  /**
   * 觸發冷卻並拋出帶 rateLimited 標記的錯誤
   */
  _triggerCooldown(message) {
    this._cooldownUntil = Date.now() + 60000;
    this.conversationHistory.pop(); // 移除失敗的使用者訊息
    const err = new Error(message);
    err.rateLimited = true;
    throw err;
  }

  /**
   * 傳送訊息給 AI（透過後端 GAS）
   * 含防抖（debounce）、冷卻期（cooldown）、連續失敗防護
   * @param {string} userMessage - 使用者的問題
   * @returns {Promise<string>} AI 回覆
   */
  async chat(userMessage) {
    if (this.isStreaming) {
      throw new Error('AI 正在回覆中，請稍候');
    }

    // 冷卻期檢查
    const now = Date.now();
    if (this._cooldownUntil > now) {
      const waitSec = Math.ceil((this._cooldownUntil - now) / 1000);
      const err = new Error(`AI 服務冷卻中，請等待 ${waitSec} 秒後再試`);
      err.rateLimited = true;
      throw err;
    }

    // 防抖：確保最少間隔
    const elapsed = now - this._lastRequestTime;
    if (elapsed < this._minInterval) {
      await new Promise(resolve => setTimeout(resolve, this._minInterval - elapsed));
    }

    this.isStreaming = true;
    this._lastRequestTime = Date.now();
    this.conversationHistory.push({ role: 'user', content: userMessage });

    try {
      const systemContext = this._buildSystemContext();

      const response = await this.api._post({
        action: 'askgemini',
        systemContext: systemContext,
        conversationHistory: this.conversationHistory,
        userMessage: userMessage
      });

      // 第一優先：檢查後端結構化 rateLimited 旗標
      if (response.rateLimited) {
        this._consecutiveFailures++;
        this._triggerCooldown(response.reply || 'AI 請求已達上限，請稍後再試。');
      }

      const aiReply = response.reply || '抱歉，我無法回答這個問題。';

      // 第二防線：連續失敗偵測
      // 如果 AI 回覆以 ⚠️ 開頭（後端錯誤訊息格式），累計失敗次數
      // 連續 2 次代表 API 持續異常，觸發冷卻保護
      if (aiReply.startsWith('⚠️') || aiReply.startsWith('⚠')) {
        this._consecutiveFailures++;
        if (this._consecutiveFailures >= 2) {
          this._triggerCooldown('AI 服務連續異常，已啟動 60 秒冷卻保護。');
        }
        // 第 1 次：仍然顯示錯誤訊息，但不觸發冷卻
      } else {
        // 正常回覆，重置失敗計數
        this._consecutiveFailures = 0;
      }

      this.conversationHistory.push({ role: 'assistant', content: aiReply });

      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      if (this.onComplete) this.onComplete(aiReply);
      return aiReply;
    } catch (error) {
      console.error('AI 對話失敗:', error);
      if (!error.rateLimited) {
        this._consecutiveFailures++;
        // 任何錯誤連續 3 次也觸發冷卻
        if (this._consecutiveFailures >= 3) {
          this._cooldownUntil = Date.now() + 60000;
          error.rateLimited = true;
        }
        if (this.conversationHistory.length > 0 &&
            this.conversationHistory[this.conversationHistory.length - 1].role === 'user') {
          this.conversationHistory.pop();
        }
      }
      if (this.onError) this.onError(error);
      throw error;
    } finally {
      this.isStreaming = false;
    }
  }

  /**
   * 模擬串流顯示效果（打字機效果）
   * @param {string} text - 要顯示的文字
   * @param {function} onChar - 每個字元的回呼
   * @param {number} speed - 每字元間隔（毫秒）
   */
  async simulateStream(text, onChar, speed = 20) {
    for (let i = 0; i < text.length; i++) {
      onChar(text[i], i, text.substring(0, i + 1));
      await new Promise(resolve => setTimeout(resolve, speed));
    }
  }

  /**
   * 智慧匹配課程
   * 根據使用者的職等、專長等條件，計算每門課程的匹配分數
   * @param {Object} userProfile - 使用者資訊 { rank, category, keywords }
   * @returns {Array} 排序後的課程（含匹配分數）
   */
  smartMatch(userProfile = {}) {
    const courses = loadArrayFromStorage('maritimeCourses');
    const { rank, category, keywords } = userProfile;

    return courses.map(course => {
      let score = 0;

      // 職等匹配（權重 40）
      if (rank && Array.isArray(course.targetRanks) && course.targetRanks.length > 0) {
        if (course.targetRanks.includes(rank)) {
          score += 40;
        }
      }

      // 人員類別匹配（權重 20）
      if (category && Array.isArray(course.targetCategories) && course.targetCategories.length > 0) {
        if (course.targetCategories.includes(category)) {
          score += 20;
        }
      }

      // 關鍵字匹配（權重 30）
      if (keywords && Array.isArray(keywords) && Array.isArray(course.keywords)) {
        const matchCount = keywords.filter(kw =>
          course.keywords.some(ck =>
            typeof ck === 'string' && ck.toLowerCase().includes(kw.toLowerCase())
          )
        ).length;
        if (keywords.length > 0) {
          score += Math.round((matchCount / keywords.length) * 30);
        }
      }

      // 基礎分（有描述、有關鍵字的課程品質較高）
      if (course.description && course.description.length > 20) score += 5;
      if (Array.isArray(course.keywords) && course.keywords.length > 0) score += 5;

      return { ...course, matchScore: score };
    }).sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * 清除對話歷史
   */
  clearHistory() {
    this.conversationHistory = [];
  }
}

// 建立全域 AI Chat Manager 實例
const aiChat = new AIChatManager(api);

// 匯出給其他模組使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    api,
    syncManager,
    aiChat,
    initializeDataSync,
    normalizeTeacherRecord,
    normalizeCourseAssignment,
    loadArrayFromStorage
  };
}
