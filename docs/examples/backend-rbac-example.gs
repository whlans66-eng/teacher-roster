/**
 * Google Apps Script - RBAC 實作範例
 *
 * 此檔案展示如何在 Google Apps Script 中實作角色基礎訪問控制 (RBAC)
 *
 * 主要功能：
 * 1. 用戶認證（登入/登出）
 * 2. Token 驗證
 * 3. 角色檢查
 * 4. 權限控制
 * 5. 資料過濾（根據角色返回不同資料）
 *
 * 使用方式：
 * 1. 在 Google Sheets 中新增 users 和 sessions 工作表
 * 2. 複製此程式碼到 Google Apps Script 編輯器
 * 3. 設定 SHEET_ID 為您的 Google Sheets ID
 * 4. 部署為 Web App
 */

// ============================================
// 一、設定與初始化
// ============================================

// Google Sheets ID（請替換為您的 Sheets ID）
const SHEET_ID = '1CPhI67yZt1W6FLV9Q02gjyJsdTP79pgUAc27ZZw3nJ4';

// 開啟 Spreadsheet
const SS = SpreadsheetApp.openById(SHEET_ID);

// 工作表對應
const SHEETS = {
  teachers: SS.getSheetByName('teachers'),
  courseAssignments: SS.getSheetByName('courseAssignments'),
  maritimeCourses: SS.getSheetByName('maritimeCourses'),
  surveyTemplates: SS.getSheetByName('surveyTemplates'),
  surveys: SS.getSheetByName('surveys'),
  surveyResponses: SS.getSheetByName('surveyResponses'),
  users: SS.getSheetByName('users'),          // 新增
  sessions: SS.getSheetByName('sessions')     // 新增
};

// 角色權限定義
const ROLE_PERMISSIONS = {
  visitor: {
    level: 0,
    permissions: [
      'teacher.view_basic',    // 只能看教師基本資訊
      'course.view_basic'      // 只能看課程基本資訊
    ]
  },

  student: {
    level: 1,
    permissions: [
      'teacher.view',          // 可查看教師詳細資料
      'teacher.view_contact',  // 可查看聯絡資訊
      'course.view',           // 可查看課程詳細資訊
      'assignment.view',       // 可查看課表
      'survey.respond'         // 可填寫問卷
    ]
  },

  teacher: {
    level: 2,
    permissions: [
      'teacher.view',
      'teacher.update_own',    // 可編輯自己的資料
      'course.view',
      'assignment.view_own',   // 可查看自己的派課
      'survey.view_own',       // 可查看自己課程的問卷結果
      'survey.respond'
    ]
  },

  admin: {
    level: 3,
    permissions: ['*']         // 所有權限
  }
};

// ============================================
// 二、主要端點處理
// ============================================

/**
 * 處理 GET 請求
 */
function doGet(e) {
  try {
    const params = e.parameter;
    const action = params.action;

    // 公開端點（不需認證）
    if (action === 'ping') {
      return jsonResponse({ ok: true, message: 'pong' });
    }

    if (action === 'login') {
      return handleLogin(params);
    }

    // 需要認證的端點
    const token = params.token;
    const authInfo = verifyToken(token);

    Logger.log('[Auth] 用戶: ' + authInfo.username + ', 角色: ' + authInfo.role);

    // 根據 action 分發請求
    switch (action) {
      case 'logout':
        return handleLogout(token);

      case 'me':
        return handleGetCurrentUser(authInfo);

      case 'list':
        return handleList(params, authInfo);

      case 'listall':
        return handleListAll(authInfo);

      case 'get':
        return handleGetOne(params, authInfo);

      default:
        throw new Error('Unknown action: ' + action);
    }

  } catch (error) {
    Logger.log('[Error] ' + error.message);
    return jsonResponse({
      ok: false,
      error: error.message
    });
  }
}

/**
 * 處理 POST 請求
 */
function doPost(e) {
  try {
    const params = e.parameter;
    const action = params.action;
    const token = params.token;

    // 驗證 Token
    const authInfo = verifyToken(token);

    Logger.log('[Auth] 用戶: ' + authInfo.username + ', 角色: ' + authInfo.role);

    // 根據 action 分發請求
    switch (action) {
      case 'save':
        return handleSave(params, authInfo);

      case 'delete':
        return handleDelete(params, authInfo);

      case 'uploadfile':
        return handleUploadFile(e, authInfo);

      default:
        throw new Error('Unknown action: ' + action);
    }

  } catch (error) {
    Logger.log('[Error] ' + error.message);
    return jsonResponse({
      ok: false,
      error: error.message
    });
  }
}

// ============================================
// 三、認證相關函數
// ============================================

/**
 * 處理登入
 */
function handleLogin(params) {
  const username = params.username;
  const password = params.password;

  if (!username || !password) {
    throw new Error('請提供用戶名和密碼');
  }

  // 查詢用戶
  const usersData = SHEETS.users.getDataRange().getValues();
  const headers = usersData[0];
  const users = usersData.slice(1);

  // 欄位索引
  const idx = {
    id: headers.indexOf('id'),
    username: headers.indexOf('username'),
    email: headers.indexOf('email'),
    password_hash: headers.indexOf('password_hash'),
    full_name: headers.indexOf('full_name'),
    role: headers.indexOf('role'),
    is_active: headers.indexOf('is_active')
  };

  // 尋找用戶
  const userRow = users.find(row => row[idx.username] === username);

  if (!userRow) {
    throw new Error('用戶名或密碼錯誤');
  }

  // 檢查是否啟用
  if (!userRow[idx.is_active]) {
    throw new Error('此帳號已被停用');
  }

  // 驗證密碼（簡化版，實際應使用 bcrypt）
  // 注意：這裡為了示範使用明文密碼，實際應用必須使用加密
  const storedPassword = userRow[idx.password_hash];
  if (password !== storedPassword) {
    throw new Error('用戶名或密碼錯誤');
  }

  // 產生 Token
  const token = generateToken();
  const sessionId = Utilities.getUuid();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小時

  // 儲存 Session
  SHEETS.sessions.appendRow([
    sessionId,
    userRow[idx.id],
    token,
    expiresAt,
    new Date()
  ]);

  // 返回用戶資訊和 Token
  const user = {
    id: userRow[idx.id],
    username: userRow[idx.username],
    email: userRow[idx.email],
    full_name: userRow[idx.full_name],
    role: userRow[idx.role],
    permissions: ROLE_PERMISSIONS[userRow[idx.role]]?.permissions || []
  };

  return jsonResponse({
    ok: true,
    data: {
      user: user,
      token: token,
      expiresAt: expiresAt
    }
  });
}

/**
 * 處理登出
 */
function handleLogout(token) {
  if (!token) {
    return jsonResponse({ ok: true, message: '已登出' });
  }

  // 刪除 Session
  const sessionsData = SHEETS.sessions.getDataRange().getValues();
  const sessionIndex = sessionsData.findIndex((row, i) => i > 0 && row[2] === token);

  if (sessionIndex > 0) {
    SHEETS.sessions.deleteRow(sessionIndex + 1);
  }

  return jsonResponse({
    ok: true,
    message: '已登出'
  });
}

/**
 * 取得當前用戶資訊
 */
function handleGetCurrentUser(authInfo) {
  return jsonResponse({
    ok: true,
    data: authInfo
  });
}

/**
 * 驗證 Token 並取得用戶資訊
 */
function verifyToken(token) {
  if (!token) {
    // 未提供 Token，視為訪客
    return {
      role: 'visitor',
      username: 'guest',
      userId: null,
      permissions: ROLE_PERMISSIONS.visitor.permissions
    };
  }

  // 查詢 Session
  const sessionsData = SHEETS.sessions.getDataRange().getValues();
  const headers = sessionsData[0];
  const sessions = sessionsData.slice(1);

  const idx = {
    session_id: headers.indexOf('session_id'),
    user_id: headers.indexOf('user_id'),
    token: headers.indexOf('token'),
    expires_at: headers.indexOf('expires_at')
  };

  const session = sessions.find(row => row[idx.token] === token);

  if (!session) {
    throw new Error('無效的 Token，請重新登入');
  }

  // 檢查是否過期
  const expiresAt = new Date(session[idx.expires_at]);
  if (expiresAt < new Date()) {
    throw new Error('Token 已過期，請重新登入');
  }

  // 取得用戶資訊
  const userId = session[idx.user_id];
  const usersData = SHEETS.users.getDataRange().getValues();
  const userHeaders = usersData[0];
  const users = usersData.slice(1);

  const userIdx = {
    id: userHeaders.indexOf('id'),
    username: userHeaders.indexOf('username'),
    email: userHeaders.indexOf('email'),
    full_name: userHeaders.indexOf('full_name'),
    role: userHeaders.indexOf('role'),
    is_active: userHeaders.indexOf('is_active')
  };

  const user = users.find(row => row[userIdx.id] === userId);

  if (!user || !user[userIdx.is_active]) {
    throw new Error('用戶不存在或已被停用');
  }

  return {
    userId: user[userIdx.id],
    username: user[userIdx.username],
    email: user[userIdx.email],
    full_name: user[userIdx.full_name],
    role: user[userIdx.role],
    permissions: ROLE_PERMISSIONS[user[userIdx.role]]?.permissions || []
  };
}

/**
 * 產生隨機 Token
 */
function generateToken() {
  const timestamp = new Date().getTime();
  const random = Math.random().toString(36).substring(2);
  return 'tr_' + timestamp + '_' + random;
}

// ============================================
// 四、權限檢查函數
// ============================================

/**
 * 檢查是否有特定權限
 */
function hasPermission(authInfo, permission) {
  // 管理者有所有權限
  if (authInfo.role === 'admin') {
    return true;
  }

  // 檢查權限列表
  return authInfo.permissions.includes(permission);
}

/**
 * 要求特定權限（沒有則拋出錯誤）
 */
function requirePermission(authInfo, ...permissions) {
  // 管理者通過所有檢查
  if (authInfo.role === 'admin') {
    return true;
  }

  // 檢查是否有任一權限
  const hasAnyPermission = permissions.some(p => authInfo.permissions.includes(p));

  if (!hasAnyPermission) {
    throw new Error('權限不足：需要 ' + permissions.join(' 或 '));
  }

  return true;
}

/**
 * 要求特定角色
 */
function requireRole(authInfo, ...roles) {
  if (!roles.includes(authInfo.role)) {
    throw new Error('權限不足：需要 ' + roles.join(' 或 ') + ' 角色');
  }

  return true;
}

/**
 * 檢查角色等級
 */
function hasRoleLevel(authInfo, requiredRole) {
  const currentLevel = ROLE_PERMISSIONS[authInfo.role]?.level || 0;
  const requiredLevel = ROLE_PERMISSIONS[requiredRole]?.level || 0;

  return currentLevel >= requiredLevel;
}

// ============================================
// 五、資料查詢處理（含權限過濾）
// ============================================

/**
 * 處理列表查詢
 */
function handleList(params, authInfo) {
  const table = params.table;

  if (!table || !SHEETS[table]) {
    throw new Error('無效的表格名稱');
  }

  // 根據表格類型檢查權限
  switch (table) {
    case 'teachers':
      return handleListTeachers(authInfo);

    case 'courseAssignments':
      return handleListAssignments(authInfo);

    case 'surveys':
      requirePermission(authInfo, 'survey.view_all', 'survey.view_own');
      return handleListSurveys(authInfo);

    default:
      // 其他表格，至少需要登入
      if (authInfo.role === 'visitor') {
        throw new Error('請先登入');
      }
      return jsonResponse({
        ok: true,
        data: getTableData(table)
      });
  }
}

/**
 * 處理教師列表查詢（根據角色過濾資料）
 */
function handleListTeachers(authInfo) {
  const data = getTableData('teachers');
  const role = authInfo.role;

  Logger.log('[Teachers] 角色 ' + role + ' 查詢教師列表，共 ' + data.length + ' 筆');

  // 根據角色過濾資料
  const filteredData = data.map(teacher => {
    if (role === 'visitor') {
      // 訪客只能看到基本資訊
      return {
        id: teacher.id,
        name: teacher.name,
        teacherType: teacher.teacherType,
        photoUrl: teacher.photoUrl,
        tags: teacher.tags ? teacher.tags.slice(0, 3) : []  // 只顯示 3 個標籤
      };
    } else if (role === 'student') {
      // 學員可以看到完整資料（但不含敏感資訊）
      return {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        teacherType: teacher.teacherType,
        workLocation: teacher.workLocation,
        photoUrl: teacher.photoUrl,
        experiences: teacher.experiences,
        certificates: teacher.certificates,
        subjects: teacher.subjects,
        tags: teacher.tags
      };
    } else {
      // 教師和管理者可以看到所有資料
      return teacher;
    }
  });

  return jsonResponse({
    ok: true,
    data: filteredData,
    role: role
  });
}

/**
 * 處理派課列表查詢（根據角色過濾）
 */
function handleListAssignments(authInfo) {
  // 訪客無法查看派課
  if (authInfo.role === 'visitor') {
    throw new Error('請先登入以查看課表');
  }

  const data = getTableData('courseAssignments');

  // 教師只能看到自己的派課
  if (authInfo.role === 'teacher') {
    const filteredData = data.filter(item => {
      // 假設 teacherId 對應到 user_id
      return item.teacherId === authInfo.userId;
    });

    Logger.log('[Assignments] 教師 ' + authInfo.username + ' 查詢派課，共 ' + filteredData.length + ' 筆');

    return jsonResponse({
      ok: true,
      data: filteredData
    });
  }

  // 學員和管理者可以看到所有派課
  return jsonResponse({
    ok: true,
    data: data
  });
}

/**
 * 處理問卷列表查詢
 */
function handleListSurveys(authInfo) {
  const data = getTableData('surveys');

  // 教師只能看到自己課程的問卷
  if (authInfo.role === 'teacher') {
    const filteredData = data.filter(item => {
      return item.teacherId === authInfo.userId;
    });

    return jsonResponse({
      ok: true,
      data: filteredData
    });
  }

  // 管理者可以看到所有問卷
  return jsonResponse({
    ok: true,
    data: data
  });
}

/**
 * 處理單筆資料查詢
 */
function handleGetOne(params, authInfo) {
  const table = params.table;
  const id = params.id;

  if (!table || !id) {
    throw new Error('缺少參數：table 和 id');
  }

  const data = getTableData(table);
  const item = data.find(row => row.id === id);

  if (!item) {
    throw new Error('找不到資料');
  }

  // 檢查權限（教師只能查看自己的資料）
  if (table === 'teachers' && authInfo.role === 'teacher') {
    if (item.userId !== authInfo.userId) {
      throw new Error('您只能查看自己的資料');
    }
  }

  return jsonResponse({
    ok: true,
    data: item
  });
}

// ============================================
// 六、資料修改處理（含權限檢查）
// ============================================

/**
 * 處理儲存（新增或更新）
 */
function handleSave(params, authInfo) {
  const table = params.table;
  const dataJson = params.data;

  if (!table || !dataJson) {
    throw new Error('缺少參數：table 和 data');
  }

  // 根據表格類型檢查權限
  switch (table) {
    case 'teachers':
      return handleSaveTeacher(dataJson, authInfo);

    case 'courseAssignments':
      requireRole(authInfo, 'admin');  // 只有管理者可以派課
      break;

    case 'surveys':
      requireRole(authInfo, 'admin');  // 只有管理者可以建立問卷
      break;

    case 'surveyResponses':
      // 所有人都可以填寫問卷
      break;

    default:
      requireRole(authInfo, 'admin');  // 其他操作需要管理者權限
  }

  // 解析資料
  const data = JSON.parse(dataJson);

  // 儲存資料
  saveTableData(table, data);

  return jsonResponse({
    ok: true,
    message: '儲存成功'
  });
}

/**
 * 處理教師資料儲存
 */
function handleSaveTeacher(dataJson, authInfo) {
  const data = JSON.parse(dataJson);

  // 教師只能編輯自己的資料
  if (authInfo.role === 'teacher') {
    // 檢查是否只編輯自己的資料
    const hasOtherTeachers = data.some(teacher => {
      return teacher.userId && teacher.userId !== authInfo.userId;
    });

    if (hasOtherTeachers) {
      throw new Error('您只能編輯自己的資料');
    }

    Logger.log('[Teachers] 教師 ' + authInfo.username + ' 更新自己的資料');
  } else if (authInfo.role === 'admin') {
    Logger.log('[Teachers] 管理者 ' + authInfo.username + ' 更新教師資料，共 ' + data.length + ' 筆');
  } else {
    throw new Error('權限不足：無法編輯教師資料');
  }

  // 儲存資料
  saveTableData('teachers', data);

  return jsonResponse({
    ok: true,
    message: '儲存成功'
  });
}

/**
 * 處理刪除
 */
function handleDelete(params, authInfo) {
  const table = params.table;
  const id = params.id;

  // 只有管理者可以刪除
  requireRole(authInfo, 'admin');

  if (!table || !id) {
    throw new Error('缺少參數：table 和 id');
  }

  Logger.log('[Delete] 管理者 ' + authInfo.username + ' 刪除 ' + table + ' id=' + id);

  // 執行刪除（這裡簡化處理，實際應實作軟刪除）
  deleteTableRow(table, id);

  return jsonResponse({
    ok: true,
    message: '刪除成功'
  });
}

// ============================================
// 七、輔助函數
// ============================================

/**
 * 取得表格資料
 */
function getTableData(tableName) {
  const sheet = SHEETS[tableName];
  if (!sheet) {
    throw new Error('表格不存在: ' + tableName);
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  return rows.map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      let value = row[i];

      // 嘗試解析 JSON
      if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
        try {
          value = JSON.parse(value);
        } catch (e) {
          // 保持原值
        }
      }

      obj[header] = value;
    });
    return obj;
  });
}

/**
 * 儲存表格資料
 */
function saveTableData(tableName, data) {
  const sheet = SHEETS[tableName];
  if (!sheet) {
    throw new Error('表格不存在: ' + tableName);
  }

  sheet.clear();

  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const rows = data.map(obj => {
    return headers.map(header => {
      const value = obj[header];
      // 將陣列和物件轉為 JSON 字串
      if (Array.isArray(value) || typeof value === 'object') {
        return JSON.stringify(value);
      }
      return value;
    });
  });

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

/**
 * 刪除表格列
 */
function deleteTableRow(tableName, id) {
  const sheet = SHEETS[tableName];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIndex = headers.indexOf('id');

  if (idIndex === -1) {
    throw new Error('表格沒有 id 欄位');
  }

  const rowIndex = data.findIndex((row, i) => i > 0 && row[idIndex] === id);

  if (rowIndex > 0) {
    sheet.deleteRow(rowIndex + 1);
  }
}

/**
 * 處理所有表格查詢
 */
function handleListAll(authInfo) {
  // 只有管理者可以查詢所有表格
  requireRole(authInfo, 'admin');

  const result = {};

  Object.keys(SHEETS).forEach(tableName => {
    if (tableName !== 'users' && tableName !== 'sessions') {
      result[tableName] = getTableData(tableName);
    }
  });

  return jsonResponse({
    ok: true,
    data: result
  });
}

/**
 * 統一的 JSON 回應格式
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 處理檔案上傳（需要權限）
 */
function handleUploadFile(e, authInfo) {
  // 需要登入才能上傳檔案
  if (authInfo.role === 'visitor') {
    throw new Error('請先登入');
  }

  // 這裡簡化處理，實際應實作完整的檔案上傳邏輯
  Logger.log('[Upload] 用戶 ' + authInfo.username + ' 上傳檔案');

  return jsonResponse({
    ok: true,
    message: '檔案上傳成功（示範）',
    url: 'https://example.com/file.jpg'
  });
}
