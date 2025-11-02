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
const TOKEN      = 'tr_demo_12345';  // 要與前端一致，建議改成你自己的密碼
const SHEET_ID   = '1CPhI67yZt1W6FLV9Q02gjyJsdTP79pgUAc27ZZw3nJ4';  // 你的試算表 ID
const FOLDER_ID  = '1coJ2wsBu7I4qvM5eyViIu16POgEQL71n';  // Google Drive 資料夾 ID（用於上傳檔案）

// 三個資料表的名稱和標頭
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
  }
};

/***** 入口：GET（讀取/連線測試） *****/
function doGet(e) {
  try {
    const p = e?.parameter || {};
    _checkToken(p.token);
    const action = String(p.action || '').toLowerCase();
    const table = String(p.table || '').toLowerCase();

    // 測試連線
    if (action === 'ping') {
      return _json({ ok: true, timestamp: new Date().toISOString(), server: 'Google Apps Script' });
    }

    // 讀取特定表格
    if (action === 'list' && table && SHEETS_CONFIG[table]) {
      return _json({ ok: true, table: table, data: _readTable(table) });
    }

    // 讀取所有表格
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

/***** 入口：POST（儲存/上傳） *****/
function doPost(e) {
  try {
    const p = e?.parameter || {};
    const postType = e?.postData?.type || '';
    let action = String(p.action || '').toLowerCase();
    let bodyObj = null;

    // 解析 JSON body
    if (/json|text\/plain/i.test(postType)) {
      try {
        bodyObj = JSON.parse(e.postData.contents || e.postData.getDataAsString() || '{}');
        if (!action) action = String(bodyObj.action || '').toLowerCase();
        if (!p.token && bodyObj.token) p.token = bodyObj.token;
      } catch (_) {}
    }

    _checkToken(p.token);

    // 儲存特定表格的所有資料
    if (action === 'save') {
      const table = p.table || (bodyObj && bodyObj.table);
      const dataRaw = p.data || (bodyObj && bodyObj.data);

      if (!table || !SHEETS_CONFIG[table]) {
        return _json({ ok: false, error: 'Invalid or missing table name' });
      }

      let data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
      data = _asArray(data);

      // 針對不同表格做資料驗證和轉換
      if (table === 'teachers') {
        data = data.map(t => ({
          ...t,
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
      }

      _writeTable(table, data);
      return _json({ ok: true, table: table, count: data.length });
    }

    // 上傳檔案
    if (action === 'uploadfile') {
      const result = _handleUpload(e, bodyObj);
      return _json({ ok: true, ...result });
    }

    // 除錯資訊
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

/***** 檔案上傳處理 *****/
function _handleUpload(e, bodyObj) {
  let blob = null;

  // A) 解析 multipart/form-data
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

  // B) 後備：dataUrl (Base64)
  if (!blob && bodyObj && bodyObj.dataUrl) {
    const fname = String(bodyObj.fileName || 'upload_' + Date.now());
    blob = _dataUrlToBlob(bodyObj.dataUrl, fname);
  }

  if (!blob) throw new Error('No file found');

  // 上傳到 Google Drive
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

/***** Base64 DataURL 轉 Blob *****/
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

/***** 試算表操作 - 通用讀取 *****/
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
      // 自動解析 JSON 陣列欄位
      if (['experiences', 'certificates', 'subjects', 'tags', 'keywords'].includes(key)) {
        obj[key] = _asArray(val);
      } else {
        obj[key] = val;
      }
    });
    return obj;
  });
}

/***** 試算表操作 - 通用寫入 *****/
function _writeTable(tableName, dataArray) {
  const config = SHEETS_CONFIG[tableName];
  if (!config) throw new Error('Unknown table: ' + tableName);

  const sh = _getOrCreateSheet(tableName, config.header);
  const idx = _headerIndex(sh, config.header);
  const header = config.header;

  // 清空舊資料（保留表頭）
  const lastRow = sh.getLastRow();
  if (lastRow > 1) {
    sh.getRange(2, 1, lastRow - 1, idx._len).clearContent();
  }

  if (!dataArray || dataArray.length === 0) return;

  // 組裝 rows
  const rows = dataArray.map(item => {
    const row = new Array(idx._len).fill('');
    header.forEach((key, i) => {
      const val = item[key];
      // 陣列欄位轉 JSON 字串
      if (['experiences', 'certificates', 'subjects', 'tags', 'keywords'].includes(key)) {
        row[idx[key]] = JSON.stringify(_asArray(val));
      } else {
        row[idx[key]] = val !== undefined && val !== null ? String(val) : '';
      }
    });
    return row;
  });

  sh.getRange(2, 1, rows.length, idx._len).setValues(rows);
}

/***** 取得或建立 Sheet *****/
function _getOrCreateSheet(sheetName, header) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(sheetName);

  if (!sh) {
    // 建立新 Sheet
    sh = ss.insertSheet(sheetName);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
    return sh;
  }

  // 檢查並補齊缺少的欄位
  const lastCol = sh.getLastColumn();
  const currentHeader = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];

  const missing = header.slice(currentHeader.length);
  if (missing.length > 0) {
    sh.getRange(1, currentHeader.length + 1, 1, missing.length).setValues([missing]);
    sh.getRange(1, currentHeader.length + 1, 1, missing.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
  }

  // 修正已存在欄位的名稱
  const minLen = Math.min(currentHeader.length, header.length);
  for (let i = 0; i < minLen; i++) {
    if (String(currentHeader[i] || '') !== header[i]) {
      sh.getRange(1, i + 1).setValue(header[i]);
    }
  }

  return sh;
}

/***** 建立欄位索引對照表 *****/
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

/***** 小工具 *****/
function _checkToken(tok) {
  if (TOKEN && String(tok).trim() !== TOKEN) {
    throw new Error('Invalid token');
  }
}

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
