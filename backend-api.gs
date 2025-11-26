/*****
 * 教師管理系統 - Google Apps Script 後端 API (含登入驗證版)
 * 更新日期：2025-11-26
 * 新增功能：支援 users 表格與 login 動作
 *****/

/***** 設定區 *****/
const TOKEN      = 'tr_demo_12345'; 
const SHEET_ID   = '1CPhI67yZt1W6FLV9Q02gjyJsdTP79pgUAc27ZZw3nJ4'; 
const FOLDER_ID  = '1coJ2wsBu7I4qvM5eyViIu16POgEQL71n'; 

const SHEETS_CONFIG = {
  // 👇 新增了這個 users 表格設定
  users: {
    name: 'users',
    header: ['id', 'username', 'password', 'full_name', 'role']
  },
  teachers: {
    name: 'teachers',
    header: ['id','name','email','teacherType','workLocation','photoUrl','experiences','certificates','subjects','tags','version','lastModifiedBy','lastModifiedAt']
  },
  courseAssignments: {
    name: 'courseAssignments',
    header: ['id','teacherId','name','date','time','type','status','note','tags','rsvpStatus','reminderTime','createdBy','createdAt','updatedAt','version','lastModifiedBy','lastModifiedAt']
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

function doGet(e) {
  try {
    const p = e?.parameter || {};
    // 登入不需要檢查 TOKEN，因為還沒登入
    const action = String(p.action || '').toLowerCase();

    // 👇 新增：處理登入請求
    if (action === 'login') {
      const username = p.username;
      const password = p.password;
      
      if (!username || !password) return _json({ ok: false, error: '請輸入帳號密碼' });

      const users = _readTable('users');
      // 比對帳號密碼
      const user = users.find(u => u.username === username && String(u.password) === String(password));

      if (user) {
        // 登入成功，回傳使用者資料 (不包含密碼)
        const userData = { ...user };
        delete userData.password; 
        
        // 產生一個簡單的 token (實務上建議用 UUID 或加密字串)
        const token = 'token_' + new Date().getTime() + '_' + Math.floor(Math.random()*1000);
        
        return _json({ 
          ok: true, 
          data: { 
            user: userData, 
            token: token 
          } 
        });
      } else {
        return _json({ ok: false, error: '帳號或密碼錯誤' });
      }
    }

    // 其他請求需要檢查 Token (前端 API_CONFIG.token)
    if (action !== 'ping') {
       _checkToken(p.token);
    }

    const table = String(p.table || '');

    if (action === 'ping') {
      return _json({ ok: true, timestamp: new Date().toISOString(), server: 'Google Apps Script' });
    }

    if (action === 'list' && table && SHEETS_CONFIG[table]) {
      return _json({ ok: true, table: table, data: _readTable(table) });
    }

    if (action === 'listall') {
      const allData = {};
      Object.keys(SHEETS_CONFIG).forEach(tableName => {
        allData[tableName] = _readTable(tableName);
      });
      return _json({ ok: true, data: allData });
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
      _cleanupStaleSessions();
      const sessions = _getActiveSessions();
      return _json({ ok: true, sessions });
    }

    if (action === 'session_kick') {
      const result = _kickSession(p);
      return _json({ ok: true, ...result });
    }

    if (action === 'session_check_kicked') {
      const kicked = _checkIfKicked(p.sessionId);
      return _json({ ok: true, kicked });
    }

    return _json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
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

    _checkToken(p.token);

    if (action === 'save') {
      const table = p.table || (bodyObj && bodyObj.table);
      const dataRaw = p.data || (bodyObj && bodyObj.data);

      if (!table || !SHEETS_CONFIG[table]) {
        return _json({ ok: false, error: 'Invalid table name' });
      }

      let data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
      data = _asArray(data);

      // 資料前處理
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
        data = data.map(c => ({
          ...c,
          keywords: _asArray(c?.keywords)
        }));
      } else if (table === 'surveyTemplates') {
        data = data.map(t => ({
          ...t,
          questions: _asArray(t?.questions)
        }));
      } else if (table === 'surveyResponses') {
        data = data.map(r => ({
          ...r,
          answers: _asArray(r?.answers)
        }));
      }

      _writeTable(table, data);
      return _json({ ok: true, table: table, count: data.length });
    }

    if (action === 'update') {
      const table = p.table || (bodyObj && bodyObj.table);
      const id = p.id || (bodyObj && bodyObj.id);
      const dataRaw = p.data || (bodyObj && bodyObj.data);

      if (!table || !SHEETS_CONFIG[table]) {
        return _json({ ok: false, error: 'Invalid table name' });
      }
      if (!id) {
        return _json({ ok: false, error: 'Missing record ID' });
      }

      const data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
      _updateRow(table, id, data);
      return _json({ ok: true, message: 'Record updated successfully', id: id });
    }

    if (action === 'uploadfile') {
      const result = _handleUpload(e, bodyObj);
      return _json({ ok: true, ...result });
    }

    if (action === 'debug') {
      const info = {
        hasPostData: !!e.postData,
        tables: Object.keys(SHEETS_CONFIG)
      };
      return _json({ ok: true, info });
    }

    return _json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function doOptions(e) {
  return ContentService.createTextOutput("");
}

// ... (以下 _handleUpload, _dataUrlToBlob, _readTable, _writeTable, _updateRow, _getOrCreateSheet, _headerIndex, _checkToken, _json, _asArray, _formatDate 等函數請保留原樣，或從之前的版本複製，為了節省版面這邊省略，但記得要放進去！)
// 請確保 _readTable 和 _writeTable 函數有包含在裡面

// ----- 補上必要的輔助函數 (避免你複製漏掉) -----

function _readTable(tableName) {
  const config = SHEETS_CONFIG[tableName];
  if (!config) throw new Error('Unknown table: ' + tableName);
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
        if (typeof val === 'number') {
          obj[key] = String(val).padStart(2, '0');
        } else {
          obj[key] = String(val || '').replace(/^'/, '');
        }
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
  if (!config) throw new Error('Unknown table: ' + tableName);
  
  if (!dataArray || !Array.isArray(dataArray) || dataArray.length === 0) {
    Logger.log(`⚠️ [安全攔截] 嘗試寫入空資料到 ${tableName}`);
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
        row[idx[key]] = val !== undefined && val !== null ? String(val) : '';
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
  if (lastRow < 2) throw new Error(`Table ${tableName} is empty`);
  const idColumn = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const rowIndex = idColumn.findIndex(rowId => String(rowId) === String(id));
  if (rowIndex === -1) throw new Error(`Record ID ${id} not found`);
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
  const missing = header.slice(currentHeader.length);
  if (missing.length > 0) {
    sh.getRange(1, currentHeader.length + 1, 1, missing.length).setValues([missing]);
    sh.getRange(1, currentHeader.length + 1, 1, missing.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
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

function _checkToken(tok) {
  if (TOKEN && String(tok).trim() !== TOKEN) {
    throw new Error('Invalid token');
  }
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

function _handleUpload(e, bodyObj) { /* ... 保留原本的上傳邏輯 ... */ return { ok: true }; } // 這裡請自行補上你原本完整的 _handleUpload，或者如果你沒在用上傳功能可以先這樣
// Session 相關函數 (保留空殼或完整邏輯皆可，因為我們移除了鎖定，Session 變成 optional)
function _registerSession(p){ return {sessionId:'s1'}; }
function _updateHeartbeat(p){ return {}; }
function _getActiveSessions(){ return []; }
function _kickSession(p){ return {}; }
function _checkIfKicked(p){ return false; }
function _cleanupStaleSessions(){}
