/*****
 * 教師管理系統 - Google Apps Script 後端 API (最終完整版)
 * 更新日期：2025-11-26
 * 包含：登入驗證、單筆更新、檔案上傳、Session管理、安全寫入
 *****/

/***** 設定區 *****/
const TOKEN      = 'tr_demo_12345'; 
const SHEET_ID   = '1CPhI67yZt1W6FLV9Q02gjyJsdTP79pgUAc27ZZw3nJ4'; 
const FOLDER_ID  = '1coJ2wsBu7I4qvM5eyViIu16POgEQL71n'; 

const SHEETS_CONFIG = {
  users: {
    name: 'users',
    header: ['id', 'username', 'password', 'full_name', 'role']
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

function doGet(e) {
  try {
    const p = e?.parameter || {};
    const action = String(p.action || '').toLowerCase();

    // 1. 處理登入 (不需 Token)
    if (action === 'login') {
      const username = p.username;
      const password = p.password;
      
      if (!username || !password) return _json({ ok: false, error: '請輸入帳號密碼' });

      // 嘗試從 users 表找人
      let user = null;
      try {
        const users = _readTable('users');
        user = users.find(u => u.username === username && String(u.password) === String(password));
      } catch(err) {
        // 如果 users 表還沒建好，提供一個緊急後門 (僅供第一次設定使用，建議之後刪除)
        if (username === 'admin' && password === 'admin123') {
             user = { username: 'admin', role: 'admin', full_name: '管理員(緊急)' };
        }
      }

      if (user) {
        const userData = { ...user };
        delete userData.password; 
        const token = 'token_' + new Date().getTime(); // 簡易 Token
        return _json({ ok: true, data: { user: userData, token: token } });
      } else {
        return _json({ ok: false, error: '帳號或密碼錯誤' });
      }
    }

    if (action === 'ping') {
      return _json({ ok: true, timestamp: new Date().toISOString(), server: 'Google Apps Script' });
    }

    // 其他請求檢查 Token
    _checkToken(p.token);

    const table = String(p.table || '');

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

    // 取得資料版本資訊（用於衝突檢測）
    if (action === 'getversions') {
      const versions = {};
      const targetTables = ['teachers', 'courseAssignments', 'maritimeCourses'];
      targetTables.forEach(tableName => {
        const data = _readTable(tableName);
        const count = data.length;
        // 計算簡單的資料指紋（基於 ID 列表和記錄數）
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

    // Session 管理 API (保留以防前端報錯，但可視為選用)
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

    // Save (整表寫入 - 用於初始化或大量匯入)
    if (action === 'save') {
      const table = p.table || (bodyObj && bodyObj.table);
      const dataRaw = p.data || (bodyObj && bodyObj.data);

      if (!table || !SHEETS_CONFIG[table]) return _json({ ok: false, error: 'Invalid table' });

      let data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
      data = _asArray(data);

      // 簡單的資料處理
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

    // Update (單筆更新 - 高效能)
    if (action === 'update') {
      const table = p.table || (bodyObj && bodyObj.table);
      const id = p.id || (bodyObj && bodyObj.id);
      const dataRaw = p.data || (bodyObj && bodyObj.data);

      if (!table || !SHEETS_CONFIG[table]) return _json({ ok: false, error: 'Invalid table' });
      if (!id) return _json({ ok: false, error: 'Missing ID' });

      const data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
      _updateRow(table, id, data);
      return _json({ ok: true, message: 'Updated', id: id });
    }

    // Upload (檔案上傳)
    if (action === 'uploadfile') {
      const result = _handleUpload(e, bodyObj);
      return _json({ ok: true, ...result });
    }

    return _json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function doOptions(e) {
  return ContentService.createTextOutput("");
}

// ==================== 核心功能函數 ====================

function _handleUpload(e, bodyObj) {
  let blob = null;
  if (e && e.postData) {
    const raw = e.postData.contents || e.postData.getDataAsString();
    const ctype = e.postData.type || 'multipart/form-data';
    try {
      const mp = Utilities.parseMultipart(raw, ctype);
      if (mp && mp.parts && mp.parts.length) {
        const part = mp.parts.find(p => p.name === 'file' && p.filename) || mp.parts.find(p => p.filename) || mp.parts[0];
        if (part && part.filename) {
          blob = Utilities.newBlob(part.data, part.type || 'application/octet-stream', part.filename);
        }
      }
    } catch (_) {}
  }
  if (!blob && bodyObj && bodyObj.dataUrl) {
    const fname = String(bodyObj.fileName || 'upload_' + Date.now());
    blob = _dataUrlToBlob(bodyObj.dataUrl, fname);
  }
  if (!blob) throw new Error('No file found');

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

function _readTable(tableName) {
  const config = SHEETS_CONFIG[tableName];
  if (!config) throw new Error('Table not found: ' + tableName);
  
  // 如果是 users 表，特別處理 (如果尚未建立 sheet)
  if (tableName === 'users') {
    try {
       const testSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('users');
       if (!testSheet) return []; // 沒建表就回傳空，不報錯
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
  
  // 🛑 安全檢查：防止寫入空資料
  if (!dataArray || !Array.isArray(dataArray) || dataArray.length === 0) {
    Logger.log(`⚠️ [攔截] 嘗試寫入空資料到 ${tableName}`);
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
  if (TOKEN && String(tok).trim() !== TOKEN) throw new Error('Invalid token');
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

// Session Helpers (保留以防前端呼叫報錯，但邏輯簡化)
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
   // 簡單回傳最近 10 筆
   return data.slice(-10).map(r=>({userName:r[1], lastActiveTime:r[4]}));
}
function _kickSession(p){ return {}; }
function _checkIfKicked(p){ return false; }
function _cleanupStaleSessions(){}

function setupDatabase() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('users');
  if (sheet) return; // 如果有了就不做

  sheet = ss.insertSheet('users');
  const headers = ['id', 'username', 'password', 'role'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');

  const defaultUsers = [
    ['1', 'admin', 'admin123', 'admin'],
    ['2', 'teacher', 'teacher123', 'teacher'],
    ['3', 'guest', 'guest123', 'guest']
  ];
  sheet.getRange(2, 1, defaultUsers.length, defaultUsers[0].length).setValues(defaultUsers);
}

/**
 * 🔧 資料庫遷移：為 courseAssignments 表添加缺少的欄位
 * 使用方法：
 * 1. 部署完成後，在 Apps Script 編輯器中選擇這個函數
 * 2. 點擊執行按鈕 ▶
 * 3. 授權後會自動檢查並添加 teacherName, taId, taName 欄位
 */
function migrateTAColumns() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheetName = 'courseAssignments';
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    Logger.log('❌ courseAssignments 表不存在，請先創建表格');
    return { success: false, message: 'Sheet not found' };
  }

  // 讀取當前的 header
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    Logger.log('❌ 表格沒有任何欄位');
    return { success: false, message: 'No columns found' };
  }

  const currentHeader = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  Logger.log('📋 當前 header: ' + currentHeader.join(', '));

  // 檢查需要添加的欄位
  const hasTeacherName = currentHeader.includes('teacherName');
  const hasTaId = currentHeader.includes('taId');
  const hasTaName = currentHeader.includes('taName');

  if (hasTeacherName && hasTaId && hasTaName) {
    Logger.log('✅ teacherName, taId, taName 已存在，無需遷移');
    return { success: true, message: 'All columns already exist' };
  }

  // 找到 teacherId 的位置（作為插入點）
  const teacherIdIndex = currentHeader.indexOf('teacherId');
  if (teacherIdIndex === -1) {
    Logger.log('❌ 找不到 teacherId 欄位，無法確定插入位置');
    return { success: false, message: 'teacherId column not found' };
  }

  Logger.log(`🔍 在 teacherId (位置 ${teacherIdIndex + 1}) 後面插入缺少的欄位`);

  // 計算需要插入的欄位
  const columnsToInsert = [];
  if (!hasTeacherName) columnsToInsert.push('teacherName');
  if (!hasTaId) columnsToInsert.push('taId');
  if (!hasTaName) columnsToInsert.push('taName');

  Logger.log(`📝 需要添加的欄位: ${columnsToInsert.join(', ')}`);

  // 在 teacherId 後面插入欄位
  for (let i = 0; i < columnsToInsert.length; i++) {
    sheet.insertColumnAfter(teacherIdIndex + 1);
  }

  // 設定新欄位的名稱
  for (let i = 0; i < columnsToInsert.length; i++) {
    const colIndex = teacherIdIndex + 2 + i;
    sheet.getRange(1, colIndex).setValue(columnsToInsert[i]);
  }

  // 設定樣式（與其他 header 一致）
  sheet.getRange(1, teacherIdIndex + 2, 1, columnsToInsert.length)
    .setFontWeight('bold')
    .setBackground('#4285f4')
    .setFontColor('#ffffff');

  // 驗證結果
  const newHeader = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('✅ 遷移完成！新 header: ' + newHeader.join(', '));

  // 檢查順序是否正確
  const expectedOrder = ['id', 'teacherId', 'teacherName', 'taId', 'taName', 'name'];
  const actualOrder = newHeader.slice(0, 6);
  const isCorrect = expectedOrder.every((val, idx) => val === actualOrder[idx]);

  if (isCorrect) {
    Logger.log('🎉 欄位順序正確！');
    return {
      success: true,
      message: 'Migration completed successfully',
      addedColumns: columnsToInsert,
      header: newHeader
    };
  } else {
    Logger.log('⚠️ 欄位順序可能不正確，請手動檢查');
    Logger.log('預期: ' + expectedOrder.join(', '));
    Logger.log('實際: ' + actualOrder.join(', '));
    return {
      success: true,
      message: 'Migration completed but order may be incorrect',
      addedColumns: columnsToInsert,
      expected: expectedOrder,
      actual: actualOrder
    };
  }
}
