/*****
 * 教師管理系統 - Google Apps Script 後端 API
 * 支援三個資料表：teachers, courseAssignments, maritimeCourses
 *
 * 部署說明：
 * 1. 在 Google Apps Script 新建專案
 * 2. 複製此代碼貼上
 * 3. 修改下方設定區的參數
 * 4. 部署為網路應用程式
 * 5. 將部署後的 URL 複製到前端 js/api.js
 *****/

/***** 設定區 *****/
const TOKEN      = 'tr_demo_12345';
const SHEET_ID   = '1CPhI67yZt1W6FLV9Q02gjyJsdTP79pgUAc27ZZw3nJ4';
const FOLDER_ID  = '1coJ2wsBu7I4qvM5eyViIu16POgEQL71n';

const SHEETS_CONFIG = {
  teachers: {
    name: 'teachers',
    header: ['id','name','email','teacherType','workLocation','photoUrl','experiences','certificates','subjects','tags']
  },
  courseAssignments: {
    name: 'courseAssignments',
    header: ['id','teacherId','name','date','time','type','status','note']
  },
  maritimeCourses: {
    name: 'maritimeCourses',
    header: ['id','name','category','method','description','keywords']
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
  }
};

function doGet(e) {
  try {
    const p = e?.parameter || {};
    _checkToken(p.token);
    const action = String(p.action || '').toLowerCase();
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

    return _json({ ok: false, error: 'Unknown action or missing table parameter' });
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
        return _json({ ok: false, error: 'Invalid or missing table name' });
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

    if (action === 'uploadfile') {
      const result = _handleUpload(e, bodyObj);
      return _json({ ok: true, ...result });
    }

    if (action === 'debug') {
      const info = {
        hasPostData: !!e.postData,
        postType: e.postData?.type || null,
        length: e.postData?.length || null,
        tables: Object.keys(SHEETS_CONFIG)
      };
      return _json({ ok: true, info });
    }

    return _json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

/**
 * 處理 CORS Preflight (預檢) 請求
 * Google Apps Script Web App 部署為"任何人都可以存取"時會自動處理 CORS
 */
function doOptions(e) {
  return ContentService.createTextOutput("");
}

function _handleUpload(e, bodyObj) {
  let blob = null;

  if (e && e.postData) {
    const raw   = e.postData.contents || e.postData.getDataAsString();
    const ctype = e.postData.type || 'multipart/form-data';
    try {
      const mp = Utilities.parseMultipart(raw, ctype);
      if (mp && mp.parts && mp.parts.length) {
        const part = mp.parts.find(p => p.name === 'file' && p.filename) ||
                     mp.parts.find(p => p.filename) ||
                     mp.parts[0];
        if (part && part.filename) {
          blob = Utilities.newBlob(
            part.data,
            part.type || 'application/octet-stream',
            part.filename || ('upload_' + Date.now())
          );
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
  const file   = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch(_) {}

  const id = file.getId();
  return {
    id,
    url:  'https://drive.google.com/uc?export=view&id=' + id,
    name: file.getName(),
    size: file.getSize(),
    mime: file.getMimeType()
  };
}

function _dataUrlToBlob(dataUrl, fileName) {
  const i = dataUrl.indexOf(',');
  if (i < 0) throw new Error('Invalid dataUrl');
  const meta = dataUrl.substring(0, i);
  const b64  = dataUrl.substring(i + 1);
  const m    = meta.match(/^data:([^;]+)/i);
  const mime = m ? m[1] : 'application/octet-stream';
  const bytes = Utilities.base64Decode(b64);
  return Utilities.newBlob(bytes, mime, fileName);
}

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
        // 將 Date 物件轉換為 YYYY-MM-DD 格式
        obj[key] = _formatDate(val);
      } else if (key === 'category' && tableName === 'maritimeCourses') {
        // 處理 category：如果是數字，轉換為兩位數字串（1 -> '01'）
        if (typeof val === 'number') {
          obj[key] = String(val).padStart(2, '0');
        } else {
          obj[key] = String(val || '').replace(/^'/, ''); // 移除前綴單引號
        }
      } else {
        obj[key] = val;
      }
    });

    if (tableName === 'teachers' && obj.photoUrl) {
      obj.photo = obj.photoUrl;
    }

    return obj;
  });
}

function _writeTable(tableName, dataArray) {
  const config = SHEETS_CONFIG[tableName];
  if (!config) throw new Error('Unknown table: ' + tableName);

  const sh = _getOrCreateSheet(tableName, config.header);
  const idx = _headerIndex(sh, config.header);
  const header = config.header;

  const lastRow = sh.getLastRow();
  if (lastRow > 1) {
    sh.getRange(2, 1, lastRow - 1, idx._len).clearContent();
  }

  if (!dataArray || dataArray.length === 0) return;

  const rows = dataArray.map(item => {
    const row = new Array(idx._len).fill('');
    header.forEach((key, i) => {
      const val = item[key];
      if (['experiences', 'certificates', 'subjects', 'tags', 'keywords', 'questions', 'answers'].includes(key)) {
        row[idx[key]] = JSON.stringify(_asArray(val));
      } else if (key === 'category' && tableName === 'maritimeCourses') {
        // 強制將 category 儲存為文字格式（在前面加 ' 符號）
        row[idx[key]] = val !== undefined && val !== null ? "'" + String(val) : '';
      } else {
        row[idx[key]] = val !== undefined && val !== null ? String(val) : '';
      }
    });
    return row;
  });

  sh.getRange(2, 1, rows.length, idx._len).setValues(rows);
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

  const minLen = Math.min(currentHeader.length, header.length);
  for (let i = 0; i < minLen; i++) {
    if (String(currentHeader[i] || '') !== header[i]) {
      sh.getRange(1, i + 1).setValue(header[i]);
    }
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

/**
 * 建立 JSON 回應
 * CORS 由 Google Apps Script Web App 部署設定自動處理
 */
function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _asArray(v) {
  if (Array.isArray(v)) return v;
  try {
    const x = (typeof v === 'string') ? JSON.parse(v) : v;
    return Array.isArray(x) ? x : [];
  } catch (e) {
    return [];
  }
}

/**
 * 將 Date 物件格式化為 YYYY-MM-DD
 */
function _formatDate(date) {
  if (!(date instanceof Date)) return date;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
