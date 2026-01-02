// ==================== API 層：與 Google Apps Script 後端通訊 ====================

/**
 * 設定區
 * 部署完 Google Apps Script 後，將取得的 Web App URL 填入下方
 */
const API_CONFIG = {
  // 將此 URL 替換為你部署後的 Google Apps Script Web App URL
  baseUrl: 'https://script.google.com/macros/s/AKfycbwN8J4yuOgGHlq6FHp32EnvIuvyf_RykVHtRXG3mVUFUmLS3wAJQIfI22gmtOnexEdfFQ/exec',
  token: 'tr_demo_12345',  // 與後端 TOKEN 一致
  timeout: 30000,  // 30 秒超時
  enableSessions: false, // 是否啟用 Session 追蹤與鎖定功能
  debug: false  // 開啟/關閉調試日誌（生產環境請設為 false）
};

/**
 * API 類別：統一管理所有後端呼叫
 */
class TeacherRosterAPI {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
    this.timeout = config.timeout;
    this.debug = config.debug || false;
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

      // 更新最後同步時間
      localStorage.setItem('lastSyncTime', new Date().toISOString());

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

      // 依序儲存三個表格
      await this.api.save('teachers', teachers);
      await this.api.save('courseAssignments', courseAssignments);
      await this.api.save('maritimeCourses', maritimeCourses);

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
   * 儲存特定表格
   */
  async saveTable(tableName) {
    try {
      const normalizer = tableName === 'teachers'
        ? normalizeTeacherRecord
        : tableName === 'courseAssignments'
          ? normalizeCourseAssignment
          : undefined;
      const data = loadArrayFromStorage(tableName, normalizer);
      await this.api.save(tableName, data);
      localStorage.setItem('lastSyncTime', new Date().toISOString());
      if (this.api.debug) {
        console.log(`✅ ${tableName} 儲存完成`);
      }
      return true;
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
   * 安全儲存：直接儲存到後端（已移除衝突檢查）
   * 注意：此模式下不檢查其他使用者的更新，直接覆蓋後端資料
   */
  async saveToBackendSafe() {
    try {
      if (this.api.debug) {
        console.log('📤 儲存資料到後端（無衝突檢查）...');
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

      // 直接儲存（不檢查衝突）
      await this.api.save('teachers', localTeachers);
      await this.api.save('courseAssignments', localCourses);
      await this.api.save('maritimeCourses', localMaritime);

      // 清除修改標記
      localStorage.removeItem('hasLocalChanges');
      localStorage.setItem('lastSyncTime', new Date().toISOString());

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

// 匯出給其他模組使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    api,
    syncManager,
    initializeDataSync,
    normalizeTeacherRecord,
    normalizeCourseAssignment,
    loadArrayFromStorage
  };
}
