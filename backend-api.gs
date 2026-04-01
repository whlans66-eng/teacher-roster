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
  'application/pdf',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB

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
    header: ['id','name','category','method','description','keywords','targetCategories','targetRanks','version','lastModifiedBy','lastModifiedAt','duration','lang','link']
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
      const versions = {};
      Object.keys(SHEETS_CONFIG).forEach(tableName => {
        if (tableName === 'users' || tableName === 'activeSessions') return;
        const data = _readTable(tableName);
        allData[tableName] = data;
        if (VERSION_TABLES.includes(tableName)) {
          versions[tableName] = _computeFingerprint(data);
        }
      });
      // 更新快取，讓後續 batchsave 的衝突檢測不需重讀 sheet
      _writeCachedFingerprints(versions);
      return _json({ ok: true, data: allData, versions });
    }

    if (action === 'getversions') {
      const versions = _readCachedFingerprints(VERSION_TABLES);
      // 快取 miss 的 table 才讀 sheet（通常重新部署後第一次）
      const missing = VERSION_TABLES.filter(t => !versions[t]);
      const newCache = {};
      missing.forEach(tableName => {
        const fp = _computeFingerprint(_readTable(tableName));
        versions[tableName] = fp;
        newCache[tableName] = fp;
      });
      if (Object.keys(newCache).length > 0) _writeCachedFingerprints(newCache);
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
      if (table === 'users') return _json({ ok: false, error: 'Access denied' });
      if (['teachers', 'maritimeCourses'].includes(table) && session.role === 'teacher') return _json({ ok: false, error: 'Access denied' });

      // server-side 衝突檢測（優先從 ScriptProperties 快取讀取，省掉 sheet read）
      const savedVersionRaw = p.savedVersion || (bodyObj && bodyObj.savedVersion);
      const forceOverwrite = String(p.forceOverwrite || (bodyObj && bodyObj.forceOverwrite)) === 'true';
      if (savedVersionRaw && !forceOverwrite) {
        const savedVersion = _parseRaw(savedVersionRaw);
        if (savedVersion && savedVersion.fingerprint) {
          const conflicts = _detectConflicts({ [table]: savedVersion }, [table]);
          if (conflicts.length > 0) {
            const c = conflicts[0];
            return _json({ ok: true, conflict: true, table, savedCount: c.savedCount, currentCount: c.currentCount });
          }
        }
      }

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
        data = data.map(c => ({ ...c, keywords: _asArray(c?.keywords), targetCategories: _asArray(c?.targetCategories), targetRanks: _asArray(c?.targetRanks) }));
      } else if (table === 'surveyTemplates') {
        data = data.map(t => ({ ...t, questions: _asArray(t?.questions) }));
      } else if (table === 'surveyResponses') {
        data = data.map(r => ({ ...r, answers: _asArray(r?.answers) }));
      }

      _writeTable(table, data);
      const newVersion = _computeFingerprint(data);
      _writeCachedFingerprints({ [table]: newVersion });
      return _json({ ok: true, table, count: data.length, newVersion });
    }

    // Batch Save (多表同時寫入，減少 HTTP 往返次數)
    if (action === 'batchsave') {
      _requireRole(session, ['admin', 'teacher']);
      const tablesRaw = p.tables || (bodyObj && bodyObj.tables);
      if (!tablesRaw) return _json({ ok: false, error: 'Missing tables' });

      const tablesObj = typeof tablesRaw === 'string' ? JSON.parse(tablesRaw) : tablesRaw;

      // server-side 衝突檢測（優先從 ScriptProperties 快取讀取，省掉 sheet reads）
      const savedVersionsRaw = p.savedVersions || (bodyObj && bodyObj.savedVersions);
      const forceOverwrite = String(p.forceOverwrite || (bodyObj && bodyObj.forceOverwrite)) === 'true';
      if (savedVersionsRaw && !forceOverwrite) {
        const savedVersions = _parseRaw(savedVersionsRaw);
        const conflicts = _detectConflicts(savedVersions, VERSION_TABLES);
        if (conflicts.length > 0) {
          return _json({ ok: true, conflict: true, conflicts, message: '後端資料已被其他人修改，請先重新載入資料再進行編輯' });
        }
      }

      const results = {};
      const newVersions = {};

      for (const [table, dataRaw] of Object.entries(tablesObj)) {
        if (!SHEETS_CONFIG[table]) continue;
        if (table === 'users') continue;
        if (['teachers', 'maritimeCourses'].includes(table) && session.role === 'teacher') continue;

        let data = _asArray(dataRaw);

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
          data = data.map(c => ({ ...c, keywords: _asArray(c?.keywords), targetCategories: _asArray(c?.targetCategories), targetRanks: _asArray(c?.targetRanks) }));
        } else if (table === 'surveyTemplates') {
          data = data.map(t => ({ ...t, questions: _asArray(t?.questions) }));
        } else if (table === 'surveyResponses') {
          data = data.map(r => ({ ...r, answers: _asArray(r?.answers) }));
        }

        _writeTable(table, data);
        results[table] = { count: data.length };
        if (VERSION_TABLES.includes(table)) {
          newVersions[table] = _computeFingerprint(data);
        }
      }

      // 寫完後批次更新 fingerprint 快取（讓下次衝突檢測不需重讀 sheet）
      if (Object.keys(newVersions).length > 0) _writeCachedFingerprints(newVersions);

      return _json({ ok: true, results, newVersions });
    }

    // Update (單筆更新)
    if (action === 'update') {
      _requireRole(session, ['admin', 'teacher']);
      const table = p.table || (bodyObj && bodyObj.table);
      const id = p.id || (bodyObj && bodyObj.id);
      const dataRaw = p.data || (bodyObj && bodyObj.data);

      if (!table || !SHEETS_CONFIG[table]) return _json({ ok: false, error: 'Invalid table' });
      if (table === 'users') return _json({ ok: false, error: 'Access denied' });
      // teacher 角色無法修改 teachers / maritimeCourses 資料表（唯讀預覽）
      if (['teachers', 'maritimeCourses'].includes(table) && session.role === 'teacher') return _json({ ok: false, error: 'Access denied' });
      if (!id) return _json({ ok: false, error: 'Missing ID' });

      const data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
      _updateRow(table, id, data);
      return _json({ ok: true, message: 'Updated', id: id });
    }

    // Upload (檔案上傳)
    if (action === 'uploadfile') {
      _requireRole(session, ['admin']);
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
        return _json({ ok: true, reply: 'AI 請求已達每分鐘上限（6 次），請等候 1 分鐘後再試。', rateLimited: true });
      }
      cache.put(rateLimitKey, String(currentCount + 1), 60);

      const reply = _callGemini(userMessage, systemContext, historyRaw);
      if (reply && typeof reply === 'object') {
        return _json(reply);
      }
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
    throw new Error('不允許的檔案類型：' + detectedMime + '，僅允許圖片、PDF、影片與文件檔案');
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
      if (['experiences', 'certificates', 'subjects', 'tags', 'keywords', 'questions', 'answers', 'targetCategories', 'targetRanks'].includes(key)) {
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
      if (['experiences', 'certificates', 'subjects', 'tags', 'keywords', 'questions', 'answers', 'targetCategories', 'targetRanks'].includes(key)) {
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
  // 先寫入新資料（覆蓋現有內容），再清除多餘的舊 rows（避免清除後馬上覆寫的浪費）
  sh.getRange(2, 1, rows.length, idx._len).setValues(rows);
  const extraRows = lastRow - 1 - rows.length;
  if (extraRows > 0) sh.getRange(2 + rows.length, 1, extraRows, idx._len).clearContent();
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
    if (['experiences', 'certificates', 'subjects', 'tags', 'keywords', 'questions', 'answers', 'targetCategories', 'targetRanks'].includes(key)) {
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

// ScriptProperties fingerprint 快取（讀取比 sheet 快 10-100x）
const _FP_PREFIX = 'fp_';
const VERSION_TABLES = ['teachers', 'courseAssignments', 'maritimeCourses'];

function _readCachedFingerprints(tableNames) {
  try {
    const all = PropertiesService.getScriptProperties().getProperties();
    const result = {};
    tableNames.forEach(t => {
      const raw = all[_FP_PREFIX + t];
      if (raw) try { result[t] = JSON.parse(raw); } catch (_) {}
    });
    return result;
  } catch (e) {
    return {};
  }
}

function _writeCachedFingerprints(fpMap) {
  try {
    const toSet = {};
    Object.entries(fpMap).forEach(([t, fp]) => { toSet[_FP_PREFIX + t] = JSON.stringify(fp); });
    PropertiesService.getScriptProperties().setProperties(toSet, false);
  } catch (e) {
    Logger.log('⚠️ fingerprint cache write failed: ' + e);
  }
}

// 解析可能為 JSON 字串或已是物件的值
function _parseRaw(raw) {
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

// 衝突檢測：比對 savedVersions 與快取指紋，回傳衝突陣列
function _detectConflicts(savedVersions, tableNames) {
  const cached = _readCachedFingerprints(tableNames);
  const conflicts = [];
  for (const tableName of tableNames) {
    const saved = savedVersions[tableName];
    if (!saved || !saved.fingerprint || !SHEETS_CONFIG[tableName]) continue;
    const current = cached[tableName] || _computeFingerprint(_readTable(tableName));
    if (saved.fingerprint !== current.fingerprint) {
      conflicts.push({ table: tableName, savedCount: saved.count, currentCount: current.count });
    }
  }
  return conflicts;
}

function _asArray(v) {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v) || []; } catch (e) { return []; }
}

function _computeFingerprint(data) {
  const count = data.length;
  const ids = data.map(item => item.id || '').sort().join(',');
  const fingerprint = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    ids + '|' + count
  ).map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
  return {
    count,
    fingerprint,
    lastModified: data.reduce((latest, item) => {
      const itemTime = item.lastModifiedAt || item.updatedAt || '';
      return itemTime > latest ? itemTime : latest;
    }, '')
  };
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
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;

  const payload = {
    contents: contents,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 0 }
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
        return { ok: true, reply: 'Gemini API 請求已達上限，請等候 1 分鐘後再試。', rateLimited: true };
      }

      if (status !== 200) {
        Logger.log('Gemini API error: ' + JSON.stringify(body));
        return '⚠️ AI 服務暫時無法使用（錯誤碼：' + status + '），請稍後再試。';
      }

      // 擷取回覆文字（過濾思考部分）
      if (body.candidates && body.candidates.length > 0) {
        var candidate = body.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          var text = candidate.content.parts
            .filter(function(p) { return !p.thought; })
            .map(function(p) { return p.text || ''; })
            .join('');
          if (candidate.finishReason === 'MAX_TOKENS') {
            text += '\n\n（回覆超出長度限制，請將問題拆成較小範圍分次詢問）';
          }
          return text;
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

/**
 * 資料庫遷移：修正 courseAssignments 欄位名稱標錯的問題。
 *
 * 背景：舊工作表的欄位順序為
 *   id | teacherId | name | date | time | type | status | note | ...
 * 但實際資料存放的是：
 *   col C (name)   → 師資姓名（teacherName 的資料）
 *   col D (date)   → 助教ID（taId 的資料）
 *   col E (time)   → 助教姓名（taName 的資料）
 *   col F (type)   → 課程名稱（name 的資料）  ← 行事曆需要這個
 *   col G (status) → 課程日期（date 的資料）   ← 行事曆需要這個
 *   col H (note)   → 課程時間（time 的資料）   ← 行事曆需要這個
 *
 * 本函式只修改第一列的表頭，資料列不動。
 * 在 GAS 編輯器直接執行一次即可。
 */
function fixCourseAssignmentsHeaders() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName('courseAssignments');

  if (!sh) {
    Logger.log('[fixHeaders] courseAssignments sheet not found');
    return;
  }

  const lastCol = sh.getLastColumn();
  if (lastCol < 8) {
    Logger.log('[fixHeaders] Not enough columns (' + lastCol + '), skipping');
    return;
  }

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || ''));
  Logger.log('[fixHeaders] Current headers: ' + headers.join(' | '));

  // 偵測是否為需要修正的舊版格式：
  // 位置 2 = 'name'，位置 5 = 'type'，位置 6 = 'status'
  const isOldLayout = (headers[2] === 'name' && headers[5] === 'type' && headers[6] === 'status');
  if (!isOldLayout) {
    Logger.log('[fixHeaders] Headers do not match old pattern — already fixed or different layout. Skipping.');
    Logger.log('[fixHeaders] headers[2]=' + headers[2] + ', headers[5]=' + headers[5] + ', headers[6]=' + headers[6]);
    return;
  }

  const newHeaders = headers.slice(); // copy

  // 核心修正：重新命名 col C–H 的表頭
  newHeaders[2] = 'teacherName'; // was 'name'   → 資料是師資姓名
  newHeaders[3] = 'taId';        // was 'date'   → 資料是助教 ID
  newHeaders[4] = 'taName';      // was 'time'   → 資料是助教姓名
  newHeaders[5] = 'name';        // was 'type'   → 資料是課程名稱 ★
  newHeaders[6] = 'date';        // was 'status' → 資料是課程日期 ★
  newHeaders[7] = 'time';        // was 'note'   → 資料是課程時間 ★

  // 修正自動補齊時錯置的欄位（位置 8 之後）：
  // _getOrCreateSheet() 曾把 'teacherName','taId','taName' 附加在末尾（空白欄）
  // 這些位置現在應改回 'type','status','note'
  for (let i = 8; i < newHeaders.length; i++) {
    if (newHeaders[i] === 'teacherName') { newHeaders[i] = 'type';   continue; }
    if (newHeaders[i] === 'taId')        { newHeaders[i] = 'status'; continue; }
    if (newHeaders[i] === 'taName')      { newHeaders[i] = 'note';   continue; }
  }

  sh.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
  sh.getRange(1, 1, 1, newHeaders.length)
    .setFontWeight('bold')
    .setBackground('#4285f4')
    .setFontColor('#ffffff');

  Logger.log('[fixHeaders] Done. New headers: ' + newHeaders.join(' | '));
  Logger.log('[fixHeaders] 請重新整理前端頁面，行事曆課程應正常顯示。');
}
