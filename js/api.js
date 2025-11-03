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

      // 儲存到 localStorage
      if (allData.teachers) {
        localStorage.setItem('teachers', JSON.stringify(allData.teachers));
      }
      if (allData.courseAssignments) {
        localStorage.setItem('courseAssignments', JSON.stringify(allData.courseAssignments));
      }
      if (allData.maritimeCourses) {
        localStorage.setItem('maritimeCourses', JSON.stringify(allData.maritimeCourses));
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
    console.log('✅ 後端連線成功');

    // 載入資料
    await syncManager.loadFromBackend();
    showSyncStatus('資料已從雲端載入', 'success');

    // 可選：啟用自動同步（每 5 分鐘）
    // syncManager.enableAutoSync(5);

  } catch (error) {
    console.warn('⚠️ 無法連線到後端，使用本地資料:', error);
    showSyncStatus('使用離線模式', 'warning', {
      hint: '請確認 API URL 與 TOKEN 設定是否正確，或檢查網路連線狀態。'
    });
  }
}

// 匯出給其他模組使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { api, syncManager, initializeDataSync };
}
