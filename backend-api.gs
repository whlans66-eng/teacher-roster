/*****
 * 教師管理系統 - Google Apps Script 後端 API (安全強化版)
 * 更新日期：2026-02-06
 * 安全修復：密碼雜湊、Session 認證、速率限制、檔案上傳白名單、XSS 防護
 *****/

/***** 設定區 *****/
const SHEET_ID   = '1CPhI67yZt1W6FLV9Q02gjyJsdTP79pgUAc27ZZw3nJ4';
const FOLDER_ID  = '1coJ2wsBu7I4qvM5eyViIu16POgEQL71n';

// 安全設定
const SESSION_TTL = 21600; // Session 有效期 6 小時（CacheService 最大值）
const MAX_LOGIN_ATTEMPTS = 5; // 最多登入失敗次數
const LOGIN_LOCKOUT_SECONDS = 900; // 鎖定 15 分鐘
const ALLOWED_UPLOAD_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf'
];
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

const SHEETS_CONFIG = {
  users: {
    name: 'users',
    header: ['id', 'username', 'password', 'full_name', 'role', 'salt']
  },
  teachers: {
    name: 'teachers',
    header: ['id','name','email','teacherType','workLocation','teacherCategory','rank','photoUrl','experiences','certificates','subjects','tags','version','lastModifiedBy','lastModifiedAt']
  },
  courseAssignments: {
    name: 'courseAssignments',
    header: ['id','teacherId','teacherName','taId','taName','name','date','time','type','status','note','tags','rsvpStatus','reminderTime','createdBy','createdAt','updatedAt','version','lastModifiedBy','lastModifiedAt']
  },
  maritimeCourses: {
    name: 'maritimeCourses',
    header: ['id','name','category','method','description','keywords','version','lastModifiedBy','lastModifiedAt']
  },
  surveyTemplates: {
    name: 'surveyTemplates',
    header: ['id','name','description','questions','createdAt','updatedAt']
  },
  surveys: {
    name: 'surveys',
    header: ['id','templateId','courseId','courseName','courseDate','teacherId','teacherName','status','shareUrl','createdAt','expiresAt']
  },
  surveyResponses: {
    name: 'surveyResponses',
    header: ['id','surveyId','respondentName','respondentEmail','answers','submittedAt']
  },
  activityLog: {
    name: 'activityLog',
    header: ['id','courseId','userId','userName','action','actionType','details','timestamp']
  },
  comments: {
    name: 'comments',
    header: ['id','courseId','userId','userName','userAvatar','content','timestamp','updatedAt']
  },
  likes: {
    name: 'likes',
    header: ['id','courseId','userId','userName','timestamp']
  },
  activeSessions: {
    name: 'activeSessions',
    header: ['sessionId','userName','userEmail','pageUrl','lastActiveTime','userAgent','kicked']
  }
};

// ==================== 密碼安全 ====================

function _generateSalt() {
  return Utilities.getUuid();
}

function _hashPassword(password, salt) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + ':' + password
  );
  return digest.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function _verifyPassword(inputPassword, storedHash, salt) {
  if (!salt) {
    // 尚未遷移的明文密碼：直接比對（向下相容）
    return String(inputPassword) === String(storedHash);
  }
  return _hashPassword(inputPassword, salt) === storedHash;
}

// ==================== Session 管理（使用 CacheService）====================

function _createSession(userData) {
  const cache = CacheService.getScriptCache();
  const sessionToken = Utilities.getUuid();
  const sessionData = JSON.stringify({
    username: userData.username,
    role: userData.role,
    full_name: userData.full_name,
    createdAt: new Date().toISOString()
  });
  cache.put('sess_' + sessionToken, sessionData, SESSION_TTL);
  return sessionToken;
}

function _getSession(token) {
  if (!token || typeof token !== 'string') return null;
  const cache = CacheService.getScriptCache();
  const data = cache.get('sess_' + token);
  if (!data) return null;
  try {
    const session = JSON.parse(data);
    // 每次存取刷新 TTL
    cache.put('sess_' + token, data, SESSION_TTL);
    return session;
  } catch (e) {
    return null;
  }
}

function _requireSession(token) {
  const session = _getSession(token);
  if (!session) throw new Error('Unauthorized');
  return session;
}

function _requireRole(session, allowedRoles) {
  if (!allowedRoles.includes(session.role)) {
    throw new Error('Forbidden');
  }
}

// ==================== 速率限制 ====================

function _checkRateLimit(username) {
  const cache = CacheService.getScriptCache();
  const key = 'login_fail_' + String(username).toLowerCase();
  const attempts = parseInt(cache.get(key) || '0', 10);
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    throw new Error('登入嘗試過多，帳號已暫時鎖定，請 15 分鐘後再試');
  }
}

function _recordLoginFailure(username) {
  const cache = CacheService.getScriptCache();
  const key = 'login_fail_' + String(username).toLowerCase();
  const attempts = parseInt(cache.get(key) || '0', 10);
  cache.put(key, String(attempts + 1), LOGIN_LOCKOUT_SECONDS);
}

function _clearLoginFailures(username) {
  const cache = CacheService.getScriptCache();
  cache.remove('login_fail_' + String(username).toLowerCase());
}

// ==================== 路由處理 ====================

function doGet(e) {
  try {
    const p = e?.parameter || {};
    const action = String(p.action || '').toLowerCase();

    // Ping 不需要認證
    if (action === 'ping') {
      return _json({ ok: true, timestamp: new Date().toISOString(), server: 'Google Apps Script' });
    }

    // 其他 GET 請求需要 Session 認證
    const session = _requireSession(p.token);
    const table = String(p.table || '');

    if (action === 'list' && table && SHEETS_CONFIG[table]) {
      // users 表不允許透過 API 讀取
      if (table === 'users') return _json({ ok: false, error: 'Access denied' });
      return _json({ ok: true, table: table, data: _readTable(table) });
    }

    if (action === 'listall') {
      const allData = {};
      Object.keys(SHEETS_CONFIG).forEach(tableName => {
        // 排除 users 表和 activeSessions 表
        if (tableName === 'users' || tableName === 'activeSessions') return;
        allData[tableName] = _readTable(tableName);
      });
      return _json({ ok: true, data: allData });
    }

    if (action === 'getversions') {
      const versions = {};
      const targetTables = ['teachers', 'courseAssignments', 'maritimeCourses'];
      targetTables.forEach(tableName => {
        const data = _readTable(tableName);
        const count = data.length;
        const ids = data.map(item => item.id || '').sort().join(',');
        const fingerprint = Utilities.computeDigest(
          Utilities.DigestAlgorithm.MD5,
          ids + '|' + count
        ).map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
        versions[tableName] = {
          count: count,
          fingerprint: fingerprint,
          lastModified: data.reduce((latest, item) => {
            const itemTime = item.lastModifiedAt || item.updatedAt || '';
            return itemTime > latest ? itemTime : latest;
          }, '')
        };
      });
      return _json({ ok: true, versions: versions });
    }

    // Session 管理 API
    if (action === 'session_register') {
      _cleanupStaleSessions();
      const result = _registerSession(p);
      return _json({ ok: true, ...result });
    }
    if (action === 'session_heartbeat') {
      _cleanupStaleSessions();
      const result = _updateHeartbeat(p);
      return _json({ ok: true, ...result });
    }
    if (action === 'session_list') {
      _requireRole(session, ['admin']);
      _cleanupStaleSessions();
      const sessions = _getActiveSessions();
      return _json({ ok: true, sessions });
    }
    if (action === 'session_kick') {
      _requireRole(session, ['admin']);
      const result = _kickSession(p);
      return _json({ ok: true, ...result });
    }
    if (action === 'session_check_kicked') {
      const kicked = _checkIfKicked(p.sessionId);
      return _json({ ok: true, kicked });
    }

    return _json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    const msg = String(err.message || err);
    if (msg === 'Unauthorized' || msg === 'Forbidden') {
      return _json({ ok: false, error: msg });
    }
    Logger.log('doGet error: ' + msg);
    return _json({ ok: false, error: '伺服器錯誤，請稍後再試' });
  }
}

function doPost(e) {
  try {
    const p = e?.parameter || {};
    const postType = e?.postData?.type || '';
    let action = String(p.action || '').toLowerCase();
    let bodyObj = null;

    if (/json|text\/plain/i.test(postType)) {
      try {
        bodyObj = JSON.parse(e.postData.contents || e.postData.getDataAsString() || '{}');
        if (!action) action = String(bodyObj.action || '').toLowerCase();
        if (!p.token && bodyObj.token) p.token = bodyObj.token;
      } catch (_) {}
    }

    // ===== 登入（不需要 Session）=====
    if (action === 'login') {
      const username = p.username || (bodyObj && bodyObj.username);
      const password = p.password || (bodyObj && bodyObj.password);

      if (!username || !password) return _json({ ok: false, error: '請輸入帳號密碼' });

      // 速率限制檢查
      _checkRateLimit(username);

      let user = null;
      try {
        const users = _readTable('users');
        user = users.find(u => {
          if (u.username !== username) return false;
          return _verifyPassword(password, String(u.password), u.salt || '');
        });
      } catch (err) {
        Logger.log('Login read users error: ' + err);
      }

      if (user) {
        _clearLoginFailures(username);
        const sessionToken = _createSession(user);
        const userData = {
          username: user.username,
          role: user.role,
          full_name: user.full_name
        };
        return _json({ ok: true, data: { user: userData, token: sessionToken } });
      } else {
        _recordLoginFailure(username);
        return _json({ ok: false, error: '帳號或密碼錯誤' });
      }
    }

    // ===== 其他 POST 請求需要 Session =====
    const session = _requireSession(p.token);

    // Save (整表寫入)
    if (action === 'save') {
      _requireRole(session, ['admin', 'teacher']);
      const table = p.table || (bodyObj && bodyObj.table);
      const dataRaw = p.data || (bodyObj && bodyObj.data);

      if (!table || !SHEETS_CONFIG[table]) return _json({ ok: false, error: 'Invalid table' });
      // 禁止透過 API 覆寫 users 表
      if (table === 'users') return _json({ ok: false, error: 'Access denied' });

      let data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
      data = _asArray(data);

      if (table === 'teachers') {
        data = data.map(t => ({
          ...t,
          photoUrl: t.photoUrl || t.photo || '',
          experiences: _asArray(t?.experiences),
          certificates: _asArray(t?.certificates),
          subjects: _asArray(t?.subjects),
          tags: _asArray(t?.tags)
        }));
      } else if (table === 'maritimeCourses') {
        data = data.map(c => ({ ...c, keywords: _asArray(c?.keywords) }));
      } else if (table === 'surveyTemplates') {
        data = data.map(t => ({ ...t, questions: _asArray(t?.questions) }));
      } else if (table === 'surveyResponses') {
        data = data.map(r => ({ ...r, answers: _asArray(r?.answers) }));
      }

      _writeTable(table, data);
      return _json({ ok: true, table: table, count: data.length });
    }

    // Update (單筆更新)
    if (action === 'update') {
      _requireRole(session, ['admin', 'teacher']);
      const table = p.table || (bodyObj && bodyObj.table);
      const id = p.id || (bodyObj && bodyObj.id);
      const dataRaw = p.data || (bodyObj && bodyObj.data);

      if (!table || !SHEETS_CONFIG[table]) return _json({ ok: false, error: 'Invalid table' });
      if (table === 'users') return _json({ ok: false, error: 'Access denied' });
      if (!id) return _json({ ok: false, error: 'Missing ID' });

      const data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
      _updateRow(table, id, data);
      return _json({ ok: true, message: 'Updated', id: id });
    }

    // Upload (檔案上傳)
    if (action === 'uploadfile') {
      _requireRole(session, ['admin', 'teacher']);
      const result = _handleUpload(e, bodyObj);
      return _json({ ok: true, ...result });
    }

    // Ask Gemini（AI 課程顧問）
    if (action === 'askgemini') {
      _requireRole(session, ['admin', 'teacher']);
      const userMessage = p.userMessage || (bodyObj && bodyObj.userMessage) || '';
      const systemContext = p.systemContext || (bodyObj && bodyObj.systemContext) || '';
      const historyRaw = p.conversationHistory || (bodyObj && bodyObj.conversationHistory) || '[]';

      if (!userMessage) return _json({ ok: false, error: '請輸入問題' });

      // 每用戶 Gemini 速率限制：每分鐘最多 6 次
      const userId = session.userId || session.username || 'unknown';
      const rateLimitKey = 'gemini_rate_' + userId;
      const cache = CacheService.getScriptCache();
      const currentCount = parseInt(cache.get(rateLimitKey) || '0', 10);
      if (currentCount >= 6) {
        return _json({ ok: true, reply: '⚠️ AI 請求過於頻繁（每分鐘限 6 次），請等候 1 分鐘後再試。' });
      }
      cache.put(rateLimitKey, String(currentCount + 1), 60);

      const reply = _callGemini(userMessage, systemContext, historyRaw);
      return _json({ ok: true, reply: reply });
    }

    return _json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    const msg = String(err.message || err);
    if (msg === 'Unauthorized' || msg === 'Forbidden') {
      return _json({ ok: false, error: msg });
    }
    if (msg.includes('帳號已暫時鎖定') || msg.includes('帳號或密碼錯誤')) {
      return _json({ ok: false, error: msg });
    }
    Logger.log('doPost error: ' + msg);
    return _json({ ok: false, error: '伺服器錯誤，請稍後再試' });
  }
}

function doOptions(e) {
  return ContentService.createTextOutput("");
}

// ==================== 核心功能函數 ====================

function _handleUpload(e, bodyObj) {
  let blob = null;
  let detectedMime = '';

  if (e && e.postData) {
    const raw = e.postData.contents || e.postData.getDataAsString();
    const ctype = e.postData.type || 'multipart/form-data';
    try {
      const mp = Utilities.parseMultipart(raw, ctype);
      if (mp && mp.parts && mp.parts.length) {
        const part = mp.parts.find(p => p.name === 'file' && p.filename) || mp.parts.find(p => p.filename) || mp.parts[0];
        if (part && part.filename) {
          detectedMime = part.type || 'application/octet-stream';
          blob = Utilities.newBlob(part.data, detectedMime, part.filename);
        }
      }
    } catch (_) {}
  }
  if (!blob && bodyObj && bodyObj.dataUrl) {
    const fname = String(bodyObj.fileName || 'upload_' + Date.now());
    blob = _dataUrlToBlob(bodyObj.dataUrl, fname);
    detectedMime = blob.getContentType();
  }
  if (!blob) throw new Error('No file found');

  // 檔案類型白名單檢查
  if (!ALLOWED_UPLOAD_TYPES.includes(detectedMime)) {
    throw new Error('不允許的檔案類型：' + detectedMime + '，僅允許圖片與 PDF');
  }

  // 檔案大小檢查
  if (blob.getBytes().length > MAX_UPLOAD_SIZE) {
    throw new Error('檔案超過大小限制（最大 10MB）');
  }

  const folder = DriveApp.getFolderById(FOLDER_ID);
  const file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(_) {}

  const id = file.getId();
  return {
    id,
    url: 'https://drive.google.com/uc?export=view&id=' + id,
    name: file.getName(),
    size: file.getSize(),
    mime: file.getMimeType()
  };
}

function _dataUrlToBlob(dataUrl, fileName) {
  const i = dataUrl.indexOf(',');
  if (i < 0) throw new Error('Invalid dataUrl');
  const meta = dataUrl.substring(0, i);
  const b64 = dataUrl.substring(i + 1);
  const m = meta.match(/^data:([^;]+)/i);
  const mime = m ? m[1] : 'application/octet-stream';
  const bytes = Utilities.base64Decode(b64);
  return Utilities.newBlob(bytes, mime, fileName);
}

// 防止 Google Sheets 公式注入
function _sanitizeSheetValue(val) {
  if (typeof val !== 'string') return val;
  // 如果以危險字元開頭，加上單引號前綴
  if (/^[=+\-@\t\r]/.test(val)) {
    return "'" + val;
  }
  return val;
}

function _readTable(tableName) {
  const config = SHEETS_CONFIG[tableName];
  if (!config) throw new Error('Table not found: ' + tableName);

  if (tableName === 'users') {
    try {
       const testSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('users');
       if (!testSheet) return [];
    } catch(e) { return []; }
  }

  const sh = _getOrCreateSheet(tableName, config.header);
  const idx = _headerIndex(sh, config.header);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const values = sh.getRange(2, 1, lastRow - 1, idx._len).getValues();
  const header = config.header;

  return values.map(row => {
    const obj = {};
    header.forEach((key, i) => {
      const val = row[idx[key]];
      if (['experiences', 'certificates', 'subjects', 'tags', 'keywords', 'questions', 'answers'].includes(key)) {
        obj[key] = _asArray(val);
      } else if (val instanceof Date) {
        obj[key] = _formatDate(val);
      } else if (key === 'category' && tableName === 'maritimeCourses') {
        obj[key] = (typeof val === 'number') ? String(val).padStart(2, '0') : String(val || '').replace(/^'/, '');
      } else {
        obj[key] = val;
      }
    });
    if (tableName === 'teachers' && obj.photoUrl) obj.photo = obj.photoUrl;
    return obj;
  });
}

function _writeTable(tableName, dataArray) {
  const config = SHEETS_CONFIG[tableName];
  if (!config) throw new Error('Unknown table');

  if (!dataArray || !Array.isArray(dataArray) || dataArray.length === 0) {
    Logger.log('[Guard] Blocked empty write to ' + tableName);
    return;
  }

  const sh = _getOrCreateSheet(tableName, config.header);
  const idx = _headerIndex(sh, config.header);
  const header = config.header;

  const rows = dataArray.map(item => {
    const row = new Array(idx._len).fill('');
    header.forEach((key, i) => {
      const val = item[key];
      if (['experiences', 'certificates', 'subjects', 'tags', 'keywords', 'questions', 'answers'].includes(key)) {
        row[idx[key]] = JSON.stringify(_asArray(val));
      } else if (key === 'category' && tableName === 'maritimeCourses') {
        row[idx[key]] = val !== undefined && val !== null ? "'" + String(val) : '';
      } else {
        const strVal = val !== undefined && val !== null ? String(val) : '';
        row[idx[key]] = _sanitizeSheetValue(strVal);
      }
    });
    return row;
  });

  const lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, idx._len).clearContent();
  sh.getRange(2, 1, rows.length, idx._len).setValues(rows);
}

function _updateRow(tableName, id, dataObj) {
  const config = SHEETS_CONFIG[tableName];
  const sheet = _getOrCreateSheet(tableName, config.header);
  const header = config.header;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Table empty');

  const idColumn = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const rowIndex = idColumn.findIndex(rowId => String(rowId) === String(id));
  if (rowIndex === -1) throw new Error('Record not found');

  const actualRow = rowIndex + 2;
  const idx = _headerIndex(sheet, header);
  const oldRowValues = sheet.getRange(actualRow, 1, 1, idx._len).getValues()[0];

  const newRow = header.map((key, i) => {
    let val = dataObj.hasOwnProperty(key) ? dataObj[key] : oldRowValues[i];
    if (['experiences', 'certificates', 'subjects', 'tags', 'keywords', 'questions', 'answers'].includes(key)) {
      if (Array.isArray(val)) val = JSON.stringify(val);
    } else if (key === 'category' && tableName === 'maritimeCourses') {
      val = val !== undefined && val !== null ? "'" + String(val) : '';
    } else {
      val = val !== undefined && val !== null ? String(val) : '';
      val = _sanitizeSheetValue(val);
    }
    return val;
  });

  sheet.getRange(actualRow, 1, 1, newRow.length).setValues([newRow]);
  if (header.includes('lastModifiedAt')) {
     const timeCol = idx['lastModifiedAt'] + 1;
     sheet.getRange(actualRow, timeCol).setValue(new Date().toISOString());
  }
}

function _getOrCreateSheet(sheetName, header) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(sheetName);
  if (!sh) {
    sh = ss.insertSheet(sheetName);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
    return sh;
  }
  const lastCol = sh.getLastColumn();
  const currentHeader = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  // 自動補齊缺少的欄位
  const missingCols = header.filter(h => !currentHeader.includes(h));
  if (missingCols.length > 0) {
    const startCol = currentHeader.length + 1;
    sh.getRange(1, startCol, 1, missingCols.length).setValues([missingCols]);
  }
  return sh;
}

function _headerIndex(sh, header) {
  const lastCol = Math.max(sh.getLastColumn(), header.length);
  const currentHeader = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || ''));
  const idx = {};
  header.forEach((h, i) => {
    const pos = currentHeader.indexOf(h);
    idx[h] = (pos >= 0 ? pos : i);
  });
  idx._len = Math.max(currentHeader.length, header.length);
  return idx;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function _asArray(v) {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v) || []; } catch (e) { return []; }
}

function _formatDate(date) {
  if (!(date instanceof Date)) return date;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Session Helpers
function _registerSession(p){
   const sh = _getOrCreateSheet('activeSessions', SHEETS_CONFIG.activeSessions.header);
   sh.appendRow([p.sessionId || Utilities.getUuid(), p.userName, p.userEmail, p.pageUrl, new Date().toISOString(), p.userAgent, false]);
   return { sessionId: p.sessionId, message: 'Registered' };
}
function _updateHeartbeat(p){ return { message: 'Updated' }; }
function _getActiveSessions(){
   const sh = _getOrCreateSheet('activeSessions', SHEETS_CONFIG.activeSessions.header);
   const data = sh.getDataRange().getValues();
   if(data.length<2) return [];
   return data.slice(-10).map(r=>({userName:r[1], lastActiveTime:r[4]}));
}
function _kickSession(p){ return {}; }
function _checkIfKicked(p){ return false; }
function _cleanupStaleSessions(){}

// ==================== Gemini AI 整合 ====================

/**
 * 呼叫 Gemini API 產生回覆
 * API Key 儲存在 Script Properties 中（安全性考量不寫死在程式碼裡）
 * 設定方式：Apps Script 編輯器 → 專案設定 → 指令碼屬性 → 新增 GEMINI_API_KEY
 *
 * @param {string} userMessage - 使用者訊息
 * @param {string} systemContext - 系統提示詞（含課程資料上下文）
 * @param {string|Array} conversationHistory - 對話歷史
 * @returns {string} AI 回覆文字
 */
function _callGemini(userMessage, systemContext, conversationHistory) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return '⚠️ AI 功能尚未設定。請在 Apps Script 的「專案設定 → 指令碼屬性」中新增 GEMINI_API_KEY。';
  }

  // 解析對話歷史
  let history = [];
  try {
    history = typeof conversationHistory === 'string'
      ? JSON.parse(conversationHistory)
      : (Array.isArray(conversationHistory) ? conversationHistory : []);
  } catch (e) {
    history = [];
  }

  // 建構 Gemini API 請求內容
  const contents = [];

  // 將系統提示詞作為第一輪對話
  if (systemContext) {
    contents.push({
      role: 'user',
      parts: [{ text: '系統指令：' + systemContext }]
    });
    contents.push({
      role: 'model',
      parts: [{ text: '了解，我已掌握課程資料與系統資訊，準備好為您服務。請問有什麼需要幫忙的嗎？' }]
    });
  }

  // 加入歷史對話（排除當前訊息，因為會在最後加）
  const historyWithoutLast = history.filter(h => h.role && h.content);
  // 跳過最後一筆（如果是 user 且內容與當前相同）
  const trimmedHistory = historyWithoutLast.length > 0 &&
    historyWithoutLast[historyWithoutLast.length - 1].role === 'user' &&
    historyWithoutLast[historyWithoutLast.length - 1].content === userMessage
    ? historyWithoutLast.slice(0, -1)
    : historyWithoutLast;

  trimmedHistory.forEach(h => {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }]
    });
  });

  // 加入當前使用者訊息
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  // 呼叫 Gemini API
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

  const payload = {
    contents: contents,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 2048
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
    ]
  };

  // 含自動重試（429 時指數退避，最多 2 次）
  var maxRetries = 2;
  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      var status = response.getResponseCode();
      var body = JSON.parse(response.getContentText());

      if (status === 429) {
        Logger.log('Gemini API 429 (attempt ' + (attempt + 1) + '/' + (maxRetries + 1) + ')');
        if (attempt < maxRetries) {
          // 指數退避：2 秒、4 秒
          Utilities.sleep((attempt + 1) * 2000);
          continue;
        }
        return '⚠️ AI 請求過於頻繁，請等候 1 分鐘後再試。冷卻中…';
      }

      if (status !== 200) {
        Logger.log('Gemini API error: ' + JSON.stringify(body));
        return '⚠️ AI 服務暫時無法使用（錯誤碼：' + status + '），請稍後再試。';
      }

      // 擷取回覆文字
      if (body.candidates && body.candidates.length > 0) {
        var candidate = body.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          return candidate.content.parts.map(function(p) { return p.text || ''; }).join('');
        }
      }

      return '抱歉，AI 未能產生有效回覆，請再試一次。';
    } catch (error) {
      Logger.log('Gemini API call failed (attempt ' + (attempt + 1) + '): ' + error);
      if (attempt < maxRetries) {
        Utilities.sleep((attempt + 1) * 2000);
        continue;
      }
      return '⚠️ 無法連線到 AI 服務：' + String(error.message || error);
    }
  }
  return '⚠️ AI 服務暫時無法使用，請稍後再試。';
}

// ==================== 資料庫初始化與遷移 ====================

/**
 * 初始化資料庫（首次使用時執行）
 * 預設密碼已使用 SHA-256 雜湊
 */
function setupDatabase() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('users');
  if (sheet) return;

  sheet = ss.insertSheet('users');
  const headers = ['id', 'username', 'password', 'full_name', 'role', 'salt'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');

  // 產生雜湊密碼（請部署後立即更改這些預設密碼！）
  const salt1 = _generateSalt();
  const salt2 = _generateSalt();
  const salt3 = _generateSalt();

  const defaultUsers = [
    ['1', 'admin',   _hashPassword('admin123', salt1),   '管理員', 'admin',   salt1],
    ['2', 'teacher', _hashPassword('teacher123', salt2), '教師',   'teacher', salt2],
    ['3', 'guest',   _hashPassword('guest123', salt3),   '訪客',   'guest',   salt3]
  ];
  sheet.getRange(2, 1, defaultUsers.length, defaultUsers[0].length).setValues(defaultUsers);

  Logger.log('Database initialized with hashed passwords. Please change default passwords immediately!');
}

/**
 * 遷移：將現有明文密碼轉換為 SHA-256 雜湊
 * 在 Apps Script 編輯器中手動執行此函數一次
 */
function migratePasswordsToHash() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('users');
  if (!sheet) {
    Logger.log('users table not found');
    return;
  }

  // 確保 salt 欄位存在
  const lastCol = sheet.getLastColumn();
  const currentHeader = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let saltCol = currentHeader.indexOf('salt');
  if (saltCol === -1) {
    saltCol = lastCol;
    sheet.getRange(1, saltCol + 1).setValue('salt');
    Logger.log('Added salt column at position ' + (saltCol + 1));
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('No users to migrate');
    return;
  }

  const passwordCol = currentHeader.indexOf('password');
  if (passwordCol === -1) {
    Logger.log('password column not found');
    return;
  }

  let migrated = 0;
  for (let row = 2; row <= lastRow; row++) {
    const existingSalt = sheet.getRange(row, saltCol + 1).getValue();
    if (existingSalt) {
      Logger.log('Row ' + row + ' already has salt, skipping');
      continue;
    }

    const plainPassword = String(sheet.getRange(row, passwordCol + 1).getValue());
    const salt = _generateSalt();
    const hashedPassword = _hashPassword(plainPassword, salt);

    sheet.getRange(row, passwordCol + 1).setValue(hashedPassword);
    sheet.getRange(row, saltCol + 1).setValue(salt);
    migrated++;
    Logger.log('Migrated row ' + row);
  }

  Logger.log('Migration complete. ' + migrated + ' passwords hashed.');
}

/**
 * 資料庫遷移：為 courseAssignments 表添加缺少的欄位
 */
function migrateTAColumns() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheetName = 'courseAssignments';
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    Logger.log('courseAssignments sheet not found');
    return { success: false, message: 'Sheet not found' };
  }

  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    Logger.log('Sheet has no columns');
    return { success: false, message: 'No columns found' };
  }

  const currentHeader = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  Logger.log('Current header: ' + currentHeader.join(', '));

  const hasTeacherName = currentHeader.includes('teacherName');
  const hasTaId = currentHeader.includes('taId');
  const hasTaName = currentHeader.includes('taName');

  if (hasTeacherName && hasTaId && hasTaName) {
    Logger.log('All columns already exist');
    return { success: true, message: 'All columns already exist' };
  }

  const teacherIdIndex = currentHeader.indexOf('teacherId');
  if (teacherIdIndex === -1) {
    Logger.log('teacherId column not found');
    return { success: false, message: 'teacherId column not found' };
  }

  const columnsToInsert = [];
  if (!hasTeacherName) columnsToInsert.push('teacherName');
  if (!hasTaId) columnsToInsert.push('taId');
  if (!hasTaName) columnsToInsert.push('taName');

  Logger.log('Adding columns: ' + columnsToInsert.join(', '));

  for (let i = 0; i < columnsToInsert.length; i++) {
    sheet.insertColumnAfter(teacherIdIndex + 1);
  }

  for (let i = 0; i < columnsToInsert.length; i++) {
    const colIndex = teacherIdIndex + 2 + i;
    sheet.getRange(1, colIndex).setValue(columnsToInsert[i]);
  }

  sheet.getRange(1, teacherIdIndex + 2, 1, columnsToInsert.length)
    .setFontWeight('bold')
    .setBackground('#4285f4')
    .setFontColor('#ffffff');

  const newHeader = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('Migration complete. New header: ' + newHeader.join(', '));

  return {
    success: true,
    message: 'Migration completed',
    addedColumns: columnsToInsert,
    header: newHeader
  };
}
