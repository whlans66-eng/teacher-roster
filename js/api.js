// ==================== API 層：與 Google Apps Script 後端通訊 ====================

/**
 * 設定區
 * 部署完 Google Apps Script 後，將取得的 Web App URL 填入下方
 */
const API_CONFIG = {
  // 將此 URL 替換為你部署後的 Google Apps Script Web App URL
  baseUrl: 'https://script.google.com/macros/s/AKfycbwYxtsHWbcflhuUYtXtVvM_OUOn2unLlmLz9nnYWC8o22KlhzUsnSk0EiJ7rs6t7HxFBg/exec',
  token: 'tr_demo_12345',  // 與後端 TOKEN 一致
  timeout: 30000  // 30 秒超時
};

/**
 * API 類別：統一管理所有後端呼叫
 */
class TeacherRosterAPI {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
    this.timeout = config.timeout;
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
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

/**
 * 數據正規化工具函數
 * 用於處理從後端載入的數據格式不一致問題
 */

/**
 * 正規化日期值 - 將各種日期格式統一為 YYYY-MM-DD
 * @param {*} value - 日期值（可能是字串、Date物件、時間戳、Excel序列日期）
 * @returns {string} YYYY-MM-DD 格式的日期字串
 */
function normalizeDateValue(value) {
  if (!value) return '';

  // 如果已經是 YYYY-MM-DD 格式，直接返回
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  // 處理 Date 物件
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }

  // 處理時間戳（毫秒）
  if (typeof value === 'number' && value > 10000000000) {
    return new Date(value).toISOString().split('T')[0];
  }

  // 處理 Excel 序列日期（數字）
  // Excel 從 1900-01-01 開始計算，但有閏年 bug
  if (typeof value === 'number' && value > 0 && value < 100000) {
    // Excel 序列日期轉換
    const excelEpoch = new Date(1899, 11, 30); // Excel 的起始日期
    const days = Math.floor(value);
    const date = new Date(excelEpoch.getTime() + days * 86400000);
    return date.toISOString().split('T')[0];
  }

  // 處理其他字串格式（例如 "2025/11/03" 或 "2025.11.03"）
  if (typeof value === 'string') {
    try {
      const normalized = value.replace(/[\/\.]/g, '-');
      const date = new Date(normalized);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch (e) {
      console.warn('無法解析日期:', value);
    }
  }

  // 無法識別的格式，返回原值
  console.warn('未知的日期格式:', value, typeof value);
  return String(value);
}

/**
 * 正規化時間範圍 - 統一為 HH:MM-HH:MM 格式
 * @param {string} value - 時間範圍（例如 "0900-1000" 或 "09:00-10:00"）
 * @returns {string} HH:MM-HH:MM 格式的時間範圍
 */
function normalizeTimeRange(value) {
  if (!value || typeof value !== 'string') return value;

  // 已經是 HH:MM-HH:MM 格式
  if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  // 處理無冒號格式 "0900-1000"
  if (/^\d{4}-\d{4}$/.test(value)) {
    const parts = value.split('-');
    const start = parts[0].substring(0, 2) + ':' + parts[0].substring(2);
    const end = parts[1].substring(0, 2) + ':' + parts[1].substring(2);
    return `${start}-${end}`;
  }

  // 處理單一時間 "0900" 或 "09:00"
  if (/^\d{4}$/.test(value)) {
    return value.substring(0, 2) + ':' + value.substring(2);
  }
  if (/^\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  return value;
}

/**
 * 正規化數值
 * @param {*} value - 數值
 * @returns {number} 數字
 */
function normalizeNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

/**
 * 正規化派課記錄
 * @param {Object} record - 派課記錄
 * @returns {Object} 正規化後的派課記錄
 */
function normalizeCourseAssignment(record) {
  if (!record) return record;

  const normalized = { ...record };

  // 正規化 ID 和 teacherId
  if (normalized.id !== undefined) {
    normalized.id = normalizeNumeric(normalized.id);
  }
  if (normalized.teacherId !== undefined) {
    normalized.teacherId = normalizeNumeric(normalized.teacherId);
  }

  // 正規化日期
  if (normalized.date) {
    normalized.date = normalizeDateValue(normalized.date);
  }

  // 正規化時間範圍
  if (normalized.time) {
    normalized.time = normalizeTimeRange(normalized.time);
  }

  return normalized;
}

/**
 * 正規化海事課程記錄
 * @param {Object} record - 海事課程記錄
 * @returns {Object} 正規化後的海事課程記錄
 */
function normalizeMaritimeCourse(record) {
  if (!record) return record;

  const normalized = { ...record };

  // 正規化 ID
  if (normalized.id !== undefined) {
    normalized.id = normalizeNumeric(normalized.id);
  }

  // 正規化日期
  if (normalized.date) {
    normalized.date = normalizeDateValue(normalized.date);
  }

  // 正規化時間範圍
  if (normalized.time) {
    normalized.time = normalizeTimeRange(normalized.time);
  }

  return normalized;
}

/**
 * 從 localStorage 載入並正規化陣列數據
 * @param {string} key - localStorage 鍵名
 * @param {Function} normalizer - 正規化函數
 * @returns {Array} 正規化後的陣列
 */
function loadArrayFromStorage(key, normalizer = null) {
  try {
    const data = localStorage.getItem(key);
    if (!data) return [];

    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];

    // 如果有提供正規化函數，應用它
    if (normalizer && typeof normalizer === 'function') {
      return parsed.map(normalizer);
    }

    return parsed;
  } catch (error) {
    console.error(`載入 ${key} 失敗:`, error);
    return [];
  }
}

// 建立全域 API 實例
const api = new TeacherRosterAPI(API_CONFIG);

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
      console.log('📥 從後端載入資料...');
      const allData = await this.api.listAll();

      // 儲存到 localStorage（套用正規化）
      if (allData.teachers) {
        localStorage.setItem('teachers', JSON.stringify(allData.teachers));
        console.log('✅ 載入師資數據:', allData.teachers.length, '筆');
      }

      if (allData.courseAssignments) {
        // ✨ 正規化派課數據
        const normalizedCourses = Array.isArray(allData.courseAssignments)
          ? allData.courseAssignments.map(normalizeCourseAssignment)
          : [];
        localStorage.setItem('courseAssignments', JSON.stringify(normalizedCourses));
        console.log('✅ 載入並正規化派課數據:', normalizedCourses.length, '筆');

        // 顯示前 3 筆數據供檢查
        if (normalizedCourses.length > 0) {
          console.log('📋 派課數據範例（正規化後）:', normalizedCourses.slice(0, 3));
        }
      }

      if (allData.maritimeCourses) {
        // ✨ 正規化海事課程數據
        const normalizedMaritime = Array.isArray(allData.maritimeCourses)
          ? allData.maritimeCourses.map(normalizeMaritimeCourse)
          : [];
        localStorage.setItem('maritimeCourses', JSON.stringify(normalizedMaritime));
        console.log('✅ 載入並正規化海事課程數據:', normalizedMaritime.length, '筆');
      }

      // 更新最後同步時間
      localStorage.setItem('lastSyncTime', new Date().toISOString());

      console.log('✅ 資料載入完成');
      return allData;
    } catch (error) {
      console.error('❌ 載入資料失敗:', error);
      throw error;
    }
  }

  /**
   * 將 localStorage 資料上傳到後端
   */
  async saveToBackend() {
    try {
      console.log('📤 儲存資料到後端...');

      const teachers = JSON.parse(localStorage.getItem('teachers') || '[]');
      const courseAssignments = JSON.parse(localStorage.getItem('courseAssignments') || '[]');
      const maritimeCourses = JSON.parse(localStorage.getItem('maritimeCourses') || '[]');

      // 依序儲存三個表格
      await this.api.save('teachers', teachers);
      await this.api.save('courseAssignments', courseAssignments);
      await this.api.save('maritimeCourses', maritimeCourses);

      // 更新最後同步時間
      localStorage.setItem('lastSyncTime', new Date().toISOString());

      console.log('✅ 資料儲存完成');
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
      const data = JSON.parse(localStorage.getItem(tableName) || '[]');
      await this.api.save(tableName, data);
      localStorage.setItem('lastSyncTime', new Date().toISOString());
      console.log(`✅ ${tableName} 儲存完成`);
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
        console.log('🔄 自動同步完成');
      } catch (error) {
        console.error('🔄 自動同步失敗:', error);
      }
    }, intervalMinutes * 60 * 1000);

    console.log(`🔄 已啟用自動同步（每 ${intervalMinutes} 分鐘）`);
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
    console.log('🔄 已停用自動同步');
  }

  /**
   * 取得最後同步時間
   */
  getLastSyncTime() {
    const time = localStorage.getItem('lastSyncTime');
    return time ? new Date(time) : null;
  }

  /**
   * 安全儲存：檢查是否有衝突再儲存
   * 防止舊資料覆蓋新資料
   */
  async saveToBackendSafe() {
    try {
      console.log('📤 安全儲存模式：檢查資料衝突...');

      // 先從後端載入最新資料
      const backendData = await this.api.listAll();

      // 取得本地資料
      const localTeachers = JSON.parse(localStorage.getItem('teachers') || '[]');
      const localCourses = JSON.parse(localStorage.getItem('courseAssignments') || '[]');
      const localMaritime = JSON.parse(localStorage.getItem('maritimeCourses') || '[]');

      // 檢查是否有修改標記
      const hasLocalChanges = localStorage.getItem('hasLocalChanges') === 'true';

      if (!hasLocalChanges) {
        console.log('⏭️ 本地無修改，跳過儲存');
        return { skipped: true, reason: 'no_local_changes' };
      }

      // 比對資料長度，如果後端資料比本地新，警告用戶
      const backendHasMore =
        (backendData.teachers?.length || 0) > localTeachers.length ||
        (backendData.courseAssignments?.length || 0) > localCourses.length ||
        (backendData.maritimeCourses?.length || 0) > localMaritime.length;

      if (backendHasMore) {
        console.warn('⚠️ 警告：後端有更新的資料！');
        return {
          conflict: true,
          message: '後端有其他人的更新，請重新整理頁面後再儲存'
        };
      }

      // 沒有衝突，安全儲存
      await this.api.save('teachers', localTeachers);
      await this.api.save('courseAssignments', localCourses);
      await this.api.save('maritimeCourses', localMaritime);

      // 清除修改標記
      localStorage.removeItem('hasLocalChanges');
      localStorage.setItem('lastSyncTime', new Date().toISOString());

      console.log('✅ 安全儲存完成');
      return { success: true };
    } catch (error) {
      console.error('❌ 安全儲存失敗:', error);
      throw error;
    }
  }

  /**
   * 標記本地資料已修改
   */
  markAsChanged() {
    localStorage.setItem('hasLocalChanges', 'true');
    console.log('🔖 標記資料已修改');
  }
}

// 建立全域同步管理器實例
const syncManager = new DataSyncManager(api);

/**
 * 便利函數：顯示同步狀態訊息
 */
function showSyncStatus(message, type = 'info') {
  // 如果頁面有 showMessage 函數就使用它
  if (typeof showMessage === 'function') {
    showMessage(message, type);
  } else {
    console.log(`[${type.toUpperCase()}] ${message}`);
  }
}

/**
 * 頁面載入時自動從後端同步資料
 */
async function initializeDataSync() {
  try {
    // 測試連線
    await api.ping();
    console.log('✅ 後端連線成功');

    // 載入資料
    await syncManager.loadFromBackend();
    showSyncStatus('資料已從雲端載入', 'success');

    // 可選：啟用自動同步（每 5 分鐘）
    // syncManager.enableAutoSync(5);

  } catch (error) {
    console.warn('⚠️ 無法連線到後端，使用本地資料:', error);
    showSyncStatus('使用離線模式', 'warning');
  }
}

// 匯出給其他模組使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { api, syncManager, initializeDataSync };
}
