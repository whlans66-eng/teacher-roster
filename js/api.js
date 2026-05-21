/**
 * api.js — 前端 API 工具集
 *
 * 載入順序（HTML head 尾端依序）：
 *   msal-browser.min.js → sys_config.js → sys_auth.js → api.js
 *
 * isLocal 旗標：
 *   CONFIG.apiBaseUrl 未設定時自動啟用 localStorage 模式，
 *   所有業務函式均支援 API ↔ localStorage 雙模式 fallback。
 *
 * 函式命名規則：全部為全域函式，不使用 window.x 或物件包裝。
 */

// ─────────────────────────────────────────────────────────────
//  XSS / Security helpers
// ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#x27;');
}

function escapeAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g,  '&amp;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#x27;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;');
}

function sanitizeUrl(url) {
    if (!url) return '';
    const s = String(url).trim();
    if (/^(https?:\/\/|\/)/i.test(s)) return s;
    return '';
}

// ─────────────────────────────────────────────────────────────
//  isLocal 旗標（CONFIG 未設定或 apiBaseUrl 為空時啟用本地模式）
// ─────────────────────────────────────────────────────────────

const isLocal = (() => {
    try { return typeof CONFIG === 'undefined' || !CONFIG?.apiBaseUrl; }
    catch (_) { return true; }
})();

// ─────────────────────────────────────────────────────────────
//  localStorage 工具
// ─────────────────────────────────────────────────────────────

function lsGet(key, defaultVal = []) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : defaultVal;
    } catch (_) { return defaultVal; }
}

function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { console.warn(`[api] lsSet(${key}) failed:`, e.message); }
}

// ─────────────────────────────────────────────────────────────
//  Core HTTP helper
// ─────────────────────────────────────────────────────────────

async function callApi(endpoint, options = {}) {
    let token = await getAccessToken();
    if (!token) token = await getAccessTokenWithFallback();
    if (!token) throw new Error('未登入');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.timeout);

    const config = {
        ...options,
        signal: controller.signal,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers,
        },
    };

    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}${endpoint}`, config);

        if (response.status === 401) {
            const newToken = await getAccessTokenWithFallback();
            if (newToken) {
                config.headers['Authorization'] = `Bearer ${newToken}`;
                const retry = await fetch(`${CONFIG.apiBaseUrl}${endpoint}`, config);
                const retryData = await retry.json();
                if (!retry.ok) throw new Error(retryData.error || `HTTP ${retry.status}`);
                return retryData;
            }
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        return data;

    } catch (err) {
        if (err.name === 'AbortError') throw new Error('請求逾時，請稍後再試');
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// ─────────────────────────────────────────────────────────────
//  師資  Teachers
// ─────────────────────────────────────────────────────────────

async function getTeachers() {
    if (isLocal) return lsGet('teachers', []);
    try {
        const res = await callApi('/teachers');
        const data = res.data || [];
        lsSet('teachers', data);
        return data;
    } catch (err) {
        console.warn('[api] getTeachers → localStorage fallback:', err.message);
        return lsGet('teachers', []);
    }
}

async function getTeacher(id) {
    if (isLocal) {
        return lsGet('teachers', []).find(t => t.id === id || t.id === Number(id)) || null;
    }
    try {
        const res = await callApi(`/teachers/${id}`);
        return res.data || null;
    } catch (err) {
        console.warn('[api] getTeacher → localStorage fallback:', err.message);
        return lsGet('teachers', []).find(t => t.id === Number(id)) || null;
    }
}

async function createTeacher(data) {
    _lsCacheUpsertTeacher(data);
    if (isLocal) return { success: true, id: data.id };
    try {
        const res = await callApi('/teachers', { method: 'POST', body: JSON.stringify(data) });
        return res;
    } catch (err) {
        console.warn('[api] createTeacher → saved locally only:', err.message);
        return { success: true, id: data.id, _localOnly: true };
    }
}

async function updateTeacher(id, data) {
    _lsCacheUpsertTeacher(data);
    if (isLocal) return { success: true };
    try {
        return await callApi(`/teachers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    } catch (err) {
        console.warn('[api] updateTeacher → saved locally only:', err.message);
        return { success: true, _localOnly: true };
    }
}

async function deleteTeacher(id) {
    const teachers = lsGet('teachers', []);
    lsSet('teachers', teachers.filter(t => t.id !== id && t.id !== Number(id)));
    if (isLocal) return { success: true };
    try {
        return await callApi(`/teachers/${id}`, { method: 'DELETE' });
    } catch (err) {
        console.warn('[api] deleteTeacher → deleted locally only:', err.message);
        return { success: true, _localOnly: true };
    }
}

function _lsCacheUpsertTeacher(teacher) {
    const teachers = lsGet('teachers', []);
    const idx = teachers.findIndex(t => t.id === teacher.id || t.id === Number(teacher.id));
    if (idx >= 0) teachers[idx] = teacher;
    else teachers.unshift(teacher);
    lsSet('teachers', teachers);
}

// ─────────────────────────────────────────────────────────────
//  請假紀錄  Teacher Leaves
// ─────────────────────────────────────────────────────────────

async function getTeacherLeaves(params = {}) {
    if (isLocal) return _lsFilterLeaves(params);
    try {
        const qs = new URLSearchParams();
        if (params.teacherId) qs.set('teacherId', params.teacherId);
        if (params.month)     qs.set('month', params.month);
        const res = await callApi(`/teacher-leaves${qs.toString() ? '?' + qs : ''}`);
        const data = res.data || [];
        lsSet('teacherLeaves', data);
        return data;
    } catch (err) {
        console.warn('[api] getTeacherLeaves → localStorage fallback:', err.message);
        return _lsFilterLeaves(params);
    }
}

async function createTeacherLeave(data) {
    const leaves = lsGet('teacherLeaves', []);
    leaves.push(data);
    lsSet('teacherLeaves', leaves);
    if (isLocal) return { success: true, id: data.id };
    try {
        return await callApi('/teacher-leaves', { method: 'POST', body: JSON.stringify(data) });
    } catch (err) {
        console.warn('[api] createTeacherLeave → saved locally only:', err.message);
        return { success: true, id: data.id, _localOnly: true };
    }
}

async function deleteTeacherLeave(id) {
    lsSet('teacherLeaves', lsGet('teacherLeaves', []).filter(l => l.id !== id && l.id !== Number(id)));
    if (isLocal) return { success: true };
    try {
        return await callApi(`/teacher-leaves/${id}`, { method: 'DELETE' });
    } catch (err) {
        console.warn('[api] deleteTeacherLeave → deleted locally only:', err.message);
        return { success: true, _localOnly: true };
    }
}

function _lsFilterLeaves({ teacherId, month } = {}) {
    let leaves = lsGet('teacherLeaves', []);
    if (teacherId) leaves = leaves.filter(l => l.teacherId === Number(teacherId));
    if (month)     leaves = leaves.filter(l => l.date?.startsWith(month));
    return leaves.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

// ─────────────────────────────────────────────────────────────
//  派課管理  Course Assignments
// ─────────────────────────────────────────────────────────────

async function getCourseAssignments(params = {}) {
    if (isLocal) return _lsFilterCourses(params);
    try {
        const qs = new URLSearchParams();
        if (params.teacherId) qs.set('teacherId', params.teacherId);
        if (params.start)     qs.set('start', params.start);
        if (params.end)       qs.set('end', params.end);
        const res = await callApi(`/course-assignments${qs.toString() ? '?' + qs : ''}`);
        const data = res.data || [];
        lsSet('courseAssignments', data);
        return data;
    } catch (err) {
        console.warn('[api] getCourseAssignments → localStorage fallback:', err.message);
        return _lsFilterCourses(params);
    }
}

async function createCourseAssignment(data) {
    const courses = lsGet('courseAssignments', []);
    courses.push(data);
    lsSet('courseAssignments', courses);
    if (isLocal) return { success: true, id: data.id };
    try {
        return await callApi('/course-assignments', { method: 'POST', body: JSON.stringify(data) });
    } catch (err) {
        console.warn('[api] createCourseAssignment → saved locally only:', err.message);
        return { success: true, id: data.id, _localOnly: true };
    }
}

async function deleteCourseAssignment(id) {
    lsSet('courseAssignments', lsGet('courseAssignments', []).filter(c => c.id !== id && c.id !== Number(id)));
    if (isLocal) return { success: true };
    try {
        return await callApi(`/course-assignments/${id}`, { method: 'DELETE' });
    } catch (err) {
        console.warn('[api] deleteCourseAssignment → deleted locally only:', err.message);
        return { success: true, _localOnly: true };
    }
}

function _lsFilterCourses({ teacherId, start, end } = {}) {
    let courses = lsGet('courseAssignments', []);
    if (teacherId) courses = courses.filter(c => Number(c.teacherId) === Number(teacherId));
    if (start)     courses = courses.filter(c => c.date >= start);
    if (end)       courses = courses.filter(c => c.date <= end);
    return courses.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

// ─────────────────────────────────────────────────────────────
//  行事曆  Calendar Events
// ─────────────────────────────────────────────────────────────

async function getCalendarEvents(params = {}) {
    if (isLocal) return _lsFilterCalendar(params);
    try {
        const qs = new URLSearchParams();
        if (params.year)  qs.set('year',  params.year);
        if (params.month) qs.set('month', params.month);
        const res = await callApi(`/calendar-events${qs.toString() ? '?' + qs : ''}`);
        const data = res.data || [];
        lsSet('calendarEvents', data);
        return data;
    } catch (err) {
        console.warn('[api] getCalendarEvents → localStorage fallback:', err.message);
        return _lsFilterCalendar(params);
    }
}

async function createCalendarEvent(data) {
    const events = lsGet('calendarEvents', []);
    events.push(data);
    lsSet('calendarEvents', events);
    if (isLocal) return { success: true, id: data.id };
    try {
        return await callApi('/calendar-events', { method: 'POST', body: JSON.stringify(data) });
    } catch (err) {
        console.warn('[api] createCalendarEvent → saved locally only:', err.message);
        return { success: true, id: data.id, _localOnly: true };
    }
}

async function updateCalendarEvent(id, data) {
    const events = lsGet('calendarEvents', []);
    const idx = events.findIndex(e => e.id === id || e.id === Number(id));
    if (idx >= 0) events[idx] = { ...events[idx], ...data };
    lsSet('calendarEvents', events);
    if (isLocal) return { success: true };
    try {
        return await callApi(`/calendar-events/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    } catch (err) {
        console.warn('[api] updateCalendarEvent → saved locally only:', err.message);
        return { success: true, _localOnly: true };
    }
}

async function deleteCalendarEvent(id) {
    lsSet('calendarEvents', lsGet('calendarEvents', []).filter(e => e.id !== id && e.id !== Number(id)));
    if (isLocal) return { success: true };
    try {
        return await callApi(`/calendar-events/${id}`, { method: 'DELETE' });
    } catch (err) {
        console.warn('[api] deleteCalendarEvent → deleted locally only:', err.message);
        return { success: true, _localOnly: true };
    }
}

function _lsFilterCalendar({ year, month } = {}) {
    let events = lsGet('calendarEvents', []);
    if (year && month) {
        const prefix = `${year}-${String(month).padStart(2, '0')}`;
        events = events.filter(e => e.date?.startsWith(prefix));
    } else if (year) {
        events = events.filter(e => e.date?.startsWith(String(year)));
    }
    return events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

// ─────────────────────────────────────────────────────────────
//  海事課程  Maritime Courses
// ─────────────────────────────────────────────────────────────

async function getMaritimeCourses() {
    if (isLocal) return lsGet('maritimeCourses', []);
    try {
        const res = await callApi('/maritime-courses');
        const data = res.data || [];
        lsSet('maritimeCourses', data);
        return data;
    } catch (err) {
        console.warn('[api] getMaritimeCourses → localStorage fallback:', err.message);
        return lsGet('maritimeCourses', []);
    }
}

async function createMaritimeCourse(data) {
    const courses = lsGet('maritimeCourses', []);
    courses.push(data);
    lsSet('maritimeCourses', courses);
    if (isLocal) return { success: true, id: data.id };
    try {
        return await callApi('/maritime-courses', { method: 'POST', body: JSON.stringify(data) });
    } catch (err) {
        console.warn('[api] createMaritimeCourse → saved locally only:', err.message);
        return { success: true, id: data.id, _localOnly: true };
    }
}

async function updateMaritimeCourse(id, data) {
    const courses = lsGet('maritimeCourses', []);
    const idx = courses.findIndex(c => c.id === id || c.id === Number(id));
    if (idx >= 0) courses[idx] = { ...courses[idx], ...data, id };
    lsSet('maritimeCourses', courses);
    if (isLocal) return { success: true };
    try {
        return await callApi(`/maritime-courses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    } catch (err) {
        console.warn('[api] updateMaritimeCourse → saved locally only:', err.message);
        return { success: true, _localOnly: true };
    }
}

async function deleteMaritimeCourse(id) {
    lsSet('maritimeCourses', lsGet('maritimeCourses', []).filter(c => c.id !== id && c.id !== Number(id)));
    if (isLocal) return { success: true };
    try {
        return await callApi(`/maritime-courses/${id}`, { method: 'DELETE' });
    } catch (err) {
        console.warn('[api] deleteMaritimeCourse → deleted locally only:', err.message);
        return { success: true, _localOnly: true };
    }
}

// ─────────────────────────────────────────────────────────────
//  檔案 API  Files
// ─────────────────────────────────────────────────────────────

async function listFiles(folder) {
    const result = await callApi(`/files?folder=${encodeURIComponent(folder)}`);
    return Array.isArray(result) ? result : (result.files || []);
}

async function uploadFile(folder, fileName, dataUrl) {
    return await callApi('/files', {
        method: 'POST',
        body: JSON.stringify({ folder, fileName, dataUrl }),
    });
}

async function deleteFile(folder, fileName) {
    return await callApi(
        `/files?folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(fileName)}`,
        { method: 'DELETE' }
    );
}

// ─────────────────────────────────────────────────────────────
//  權限 API  Permissions
// ─────────────────────────────────────────────────────────────

async function getPermissions() {
    const result = await callApi('/permissions');
    return result.data || { superAdmins: [], admins: [], allowedUsers: [] };
}

async function updatePermissions(permissions) {
    return await callApi('/permissions', {
        method: 'POST',
        body: JSON.stringify(permissions),
    });
}

async function addUser(email, role) {
    return await callApi('/permissions/user', {
        method: 'POST',
        body: JSON.stringify({ email, role }),
    });
}

async function removeUser(email, role) {
    return await callApi('/permissions/user', {
        method: 'DELETE',
        body: JSON.stringify({ email, role }),
    });
}

// ─────────────────────────────────────────────────────────────
//  SSO API
// ─────────────────────────────────────────────────────────────

async function verifySsoToken(encryptedToken) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.timeout);
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/auth/sso`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: encryptedToken }),
            signal: controller.signal,
        });
        return await response.json();
    } catch (err) {
        if (err.name === 'AbortError') throw new Error('驗證請求逾時，請稍後再試');
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// ─────────────────────────────────────────────────────────────
//  健康檢查  Health Check
// ─────────────────────────────────────────────────────────────

async function pingApi() {
    try {
        const result = await fetch(`${CONFIG.apiBaseUrl}/ping`);
        return await result.json();
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

// ─────────────────────────────────────────────────────────────
//  UI helpers  ( Alert / Confirm / Loading )
// ─────────────────────────────────────────────────────────────

function showSystemAlert(message, title = '航海訓練管理系統') {
    const rawTitle   = String(title ?? '');
    const safeTitle  = escapeHtml(rawTitle);
    const safeMsg    = escapeHtml(message);
    const icon       = rawTitle.includes('錯誤') || rawTitle.includes('失敗') ? '❌' : '✅';

    const old = document.getElementById('custom-alert-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'custom-alert-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.4);z-index:99999;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(2px);animation:fadeIn .2s ease-out;';
    overlay.innerHTML = `
        <div style="background:white;padding:24px;border-radius:16px;width:85%;max-width:320px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.2);animation:popIn .2s cubic-bezier(.175,.885,.32,1.275) forwards;">
            <div style="font-size:40px;margin-bottom:12px;">${icon}</div>
            <h3 style="color:#1a5276;margin:0 0 12px;font-size:1.1rem;font-weight:700;">${safeTitle}</h3>
            <p style="color:#4a4a4a;margin:0 0 24px;font-size:1rem;line-height:1.5;">${safeMsg}</p>
            <button onclick="document.getElementById('custom-alert-overlay').remove()" style="background:#1a5276;color:white;border:none;padding:10px 0;width:100%;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;">確定</button>
        </div>
        <style>@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes popIn{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}</style>`;

    document.body.appendChild(overlay);
    const fn = e => { if (e.key === 'Enter') { overlay.remove(); document.removeEventListener('keydown', fn); } };
    document.addEventListener('keydown', fn);
}

function showSystemConfirm(message, onConfirm) {
    const safeMsg = escapeHtml(message);
    const old = document.getElementById('custom-confirm-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'custom-confirm-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.4);z-index:99999;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(2px);animation:fadeIn .2s ease-out;';
    overlay.innerHTML = `
        <div style="background:white;padding:24px;border-radius:16px;width:85%;max-width:320px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.2);animation:popIn .2s cubic-bezier(.175,.885,.32,1.275) forwards;">
            <div style="font-size:40px;margin-bottom:12px;">❓</div>
            <h3 style="color:#1a5276;margin:0 0 12px;font-size:1.1rem;font-weight:700;">確認操作</h3>
            <p style="color:#4a4a4a;margin:0 0 24px;font-size:1rem;line-height:1.5;">${safeMsg}</p>
            <div style="display:flex;gap:10px;">
                <button id="sys-cancel-btn" style="flex:1;background:#e8e8e8;color:#333;border:none;padding:10px 0;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;">取消</button>
                <button id="sys-confirm-btn" style="flex:1;background:#c0392b;color:white;border:none;padding:10px 0;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;">確認</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
    document.getElementById('sys-cancel-btn').onclick  = () => overlay.remove();
    document.getElementById('sys-confirm-btn').onclick = () => { overlay.remove(); onConfirm(); };
}

function showLoading(message = '載入中...') {
    const safeMsg = escapeHtml(message);
    const existing = document.getElementById('global-loading-overlay');
    if (existing) { document.getElementById('loading-text').textContent = safeMsg; return; }

    const overlay = document.createElement('div');
    overlay.id = 'global-loading-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,.8);z-index:99999;display:flex;flex-direction:column;justify-content:center;align-items:center;backdrop-filter:blur(4px);animation:fadeIn .3s ease-out;';
    overlay.innerHTML = `
        <div class="loading-spinner"></div>
        <div id="loading-text" style="margin-top:20px;color:#1a5276;font-weight:600;font-size:1.1rem;letter-spacing:1px;">${safeMsg}</div>
        <style>.loading-spinner{width:50px;height:50px;border:5px solid #e8f4f8;border-top:5px solid #1a5276;border-radius:50%;animation:spin 1s linear infinite;}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}</style>`;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('global-loading-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity .3s';
        setTimeout(() => overlay.remove(), 300);
    }
}

// ─────────────────────────────────────────────────────────────
//  批次操作  Batch Operations（泛型，供其他頁面使用）
// ─────────────────────────────────────────────────────────────

async function createBatch(tableName, dataArray) {
    return await callApi('/batch', {
        method: 'POST',
        body: JSON.stringify({ table: tableName, data: dataArray }),
    });
}

async function updateBatch(tableName, dataArray) {
    return await callApi('/batch', {
        method: 'PUT',
        body: JSON.stringify({ table: tableName, data: dataArray }),
    });
}

async function deleteBatch(tableName, idArray) {
    return await callApi('/batch', {
        method: 'DELETE',
        body: JSON.stringify({ table: tableName, ids: idArray }),
    });
}

// ─────────────────────────────────────────────────────────────
//  泛型 CRUD（舊版相容，供尚未遷移的頁面使用）
// ─────────────────────────────────────────────────────────────

async function loadTable(tableName) {
    const result = await callApi(`/list?table=${tableName}`);
    return result.data || [];
}

async function loadAllTables() {
    const result = await callApi('/listall');
    return result.data || {};
}

async function saveTable(tableName, data) {
    return await callApi('/save', {
        method: 'POST',
        body: JSON.stringify({ table: tableName, data }),
    });
}
