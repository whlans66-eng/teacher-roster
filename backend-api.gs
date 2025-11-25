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
    header: ['id','teacherId','name','date','time','type','status','note','tags','rsvpStatus','reminderTime','createdBy','createdAt','updatedAt']
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

/**
 * Email 提醒系統
 *
 * 設定方式：
 * 1. 在 Google Apps Script 編輯器中，點擊「觸發器」圖示（時鐘）
 * 2. 新增觸發器：
 *    - 選擇函式：sendCourseReminders
 *    - 部署方式：Head
 *    - 選取活動來源：時間驅動
 *    - 選取時間型觸發條件：每日計時器
 *    - 選取時段：上午 8-9 點
 * 3. 儲存
 *
 * 這樣系統會每天早上 8-9 點自動檢查並發送課程提醒。
 */
function sendCourseReminders() {
  try {
    const courseAssignments = _readTable('courseAssignments');
    const teachers = _readTable('teachers');
    const today = new Date();
    const todayStr = _formatDate(today);

    let sentCount = 0;

    courseAssignments.forEach(course => {
      if (!course.reminderTime || !course.date) return;

      const teacher = teachers.find(t => t.id === course.teacherId);
      if (!teacher || !teacher.email) return;

      // 判斷是否需要發送提醒
      const shouldSend = _shouldSendReminder(course.date, course.reminderTime, todayStr);

      if (shouldSend) {
        _sendReminderEmail(teacher, course);
        sentCount++;
      }
    });

    Logger.log(`✅ 課程提醒發送完成！共發送 ${sentCount} 封提醒信。`);
    return { ok: true, sent: sentCount };

  } catch (err) {
    Logger.log(`❌ 發送提醒失敗: ${err}`);
    return { ok: false, error: String(err) };
  }
}

/**
 * 判斷是否應該發送提醒
 */
function _shouldSendReminder(courseDate, reminderTime, todayStr) {
  const courseDateObj = new Date(courseDate);
  const todayObj = new Date(todayStr);

  if (reminderTime === '課程當天 09:00') {
    return courseDate === todayStr;
  }

  const diffDays = Math.floor((courseDateObj - todayObj) / (1000 * 60 * 60 * 24));

  if (reminderTime === '1天前' && diffDays === 1) return true;
  if (reminderTime === '3天前' && diffDays === 3) return true;
  if (reminderTime === '1週前' && diffDays === 7) return true;

  return false;
}

/**
 * 發送提醒 Email
 */
function _sendReminderEmail(teacher, course) {
  const subject = `📅 課程提醒：${course.name}`;

  const body = `
親愛的 ${teacher.name} 老師，您好！

這是您的課程提醒通知：

📚 課程名稱：${course.name}
📅 上課日期：${course.date}
⏰ 上課時間：${course.time}
📍 課程類型：${course.type}
${course.note ? `📝 備註：${course.note}` : ''}

${course.rsvpStatus === '已確認' ? '✅ 您已確認參加此課程' : '⚠️ 請確認是否參加此課程'}

--
此為系統自動發送的提醒信件，請勿直接回覆。
如有任何問題，請聯絡管理員。

教師排課管理系統
  `.trim();

  try {
    MailApp.sendEmail({
      to: teacher.email,
      subject: subject,
      body: body
    });
    Logger.log(`✅ 已發送提醒給 ${teacher.name} (${teacher.email})`);
  } catch (err) {
    Logger.log(`❌ 發送失敗給 ${teacher.name}: ${err}`);
  }
}

/**
 * 測試函數：手動觸發提醒（用於測試）
 *
 * 使用方式：
 * 1. 在 Google Apps Script 編輯器中選擇此函數
 * 2. 點擊「執行」按鈕
 * 3. 授權必要權限（發送 Email）
 * 4. 查看執行記錄檔
 */
function testSendReminders() {
  const result = sendCourseReminders();
  Logger.log('測試結果:', JSON.stringify(result));
  return result;
}

/**
 * ==================== Session 管理系統 ====================
 * 用於追蹤線上使用者並支援踢人功能
 */

/**
 * 註冊新 session
 */
function _registerSession(params) {
  const sessionId = params.sessionId || Utilities.getUuid();
  const userName = params.userName || '訪客';
  const userEmail = params.userEmail || '';
  const pageUrl = params.pageUrl || '';
  const userAgent = params.userAgent || '';

  const sh = _getOrCreateSheet('activeSessions', SHEETS_CONFIG.activeSessions.header);

  // 檢查是否已存在相同 sessionId
  const data = sh.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === sessionId) {
      rowIndex = i + 1;
      break;
    }
  }

  const now = new Date().toISOString();

  if (rowIndex > 0) {
    // 更新現有 session
    sh.getRange(rowIndex, 1, 1, 7).setValues([[
      sessionId, userName, userEmail, pageUrl, now, userAgent, false
    ]]);
  } else {
    // 新增 session
    sh.appendRow([sessionId, userName, userEmail, pageUrl, now, userAgent, false]);
  }

  Logger.log(`✅ Session 註冊: ${userName} (${sessionId})`);
  return { sessionId, message: 'Session registered' };
}

/**
 * 更新心跳
 */
function _updateHeartbeat(params) {
  const sessionId = params.sessionId;
  if (!sessionId) throw new Error('Missing sessionId');

  const sh = _getOrCreateSheet('activeSessions', SHEETS_CONFIG.activeSessions.header);
  const data = sh.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === sessionId) {
      const now = new Date().toISOString();
      sh.getRange(i + 1, 5).setValue(now); // 更新 lastActiveTime

      // 檢查是否被踢出
      const kicked = data[i][6];
      return {
        message: 'Heartbeat updated',
        kicked: kicked === true || kicked === 'TRUE' || kicked === 'true'
      };
    }
  }

  throw new Error('Session not found');
}

/**
 * 取得活躍的 sessions（5分鐘內有活動）
 */
function _getActiveSessions() {
  const sh = _getOrCreateSheet('activeSessions', SHEETS_CONFIG.activeSessions.header);
  const data = sh.getDataRange().getValues();

  if (data.length < 2) return [];

  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  const activeSessions = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const lastActiveTime = new Date(row[4]);

    // 只返回 5 分鐘內活躍的 session
    if (lastActiveTime > fiveMinutesAgo) {
      activeSessions.push({
        sessionId: row[0],
        userName: row[1],
        userEmail: row[2],
        pageUrl: row[3],
        lastActiveTime: row[4],
        userAgent: row[5],
        kicked: row[6]
      });
    }
  }

  return activeSessions;
}

/**
 * 踢出特定 session
 */
function _kickSession(params) {
  const sessionId = params.sessionId;
  if (!sessionId) throw new Error('Missing sessionId');

  const sh = _getOrCreateSheet('activeSessions', SHEETS_CONFIG.activeSessions.header);
  const data = sh.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === sessionId) {
      sh.getRange(i + 1, 7).setValue(true); // 設定 kicked = true
      Logger.log(`⚠️ Session 被踢出: ${data[i][1]} (${sessionId})`);
      return { message: 'Session kicked', userName: data[i][1] };
    }
  }

  throw new Error('Session not found');
}

/**
 * 檢查 session 是否被踢出
 */
function _checkIfKicked(sessionId) {
  if (!sessionId) return false;

  const sh = _getOrCreateSheet('activeSessions', SHEETS_CONFIG.activeSessions.header);
  const data = sh.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === sessionId) {
      const kicked = data[i][6];
      return kicked === true || kicked === 'TRUE' || kicked === 'true';
    }
  }

  return false;
}

/**
 * 清理過期的 sessions（超過 5 分鐘無活動）
 */
function _cleanupStaleSessions() {
  const sh = _getOrCreateSheet('activeSessions', SHEETS_CONFIG.activeSessions.header);
  const data = sh.getDataRange().getValues();

  if (data.length < 2) return;

  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  const rowsToDelete = [];

  for (let i = data.length - 1; i >= 1; i--) {
    const lastActiveTime = new Date(data[i][4]);

    if (lastActiveTime < fiveMinutesAgo) {
      rowsToDelete.push(i + 1); // +1 because sheet rows are 1-indexed
    }
  }

  // 從後往前刪除，避免索引錯位
  rowsToDelete.forEach(rowIndex => {
    sh.deleteRow(rowIndex);
  });

  if (rowsToDelete.length > 0) {
    Logger.log(`🧹 清理了 ${rowsToDelete.length} 個過期 sessions`);
  }
}
