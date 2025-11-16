/**
 * 師資派課管理系統 - 功能擴展模組
 * 本模組添加以下功能到您的美觀介面中：
 * 1. 行事曆視圖與管理
 * 2. 智能衝堂檢查機制
 * 3. 派課與行事曆自動同步
 * 4. 本週課表即時預覽
 */

// ========== 數據結構擴展 ==========

// 行事曆事件數據（添加到 teachersData 之後）
let calendarEvents = JSON.parse(localStorage.getItem('calendarEvents') || '[]');
let currentCalendarDate = new Date();

// ========== 行事曆管理功能 ==========

// 儲存行事曆數據
function saveCalendarEvents() {
    try {
        localStorage.setItem('calendarEvents', JSON.stringify(calendarEvents));
    } catch (error) {
        console.error('儲存行事曆數據失敗:', error);
        showMessage('行事曆數據儲存失敗！', 'error');
    }
}

// 獲取課程類型對應的顏色
function getCourseTypeColor(type) {
    const colorMap = {
        '正課': '#3b82f6',    // 藍色
        '補課': '#f59e0b',    // 黃色
        '實驗課': '#8b5cf6',  // 紫色
        '實作課': '#10b981',  // 綠色
        '專題': '#ec4899'     // 粉色
    };
    return colorMap[type] || '#6b7280'; // 預設灰色
}

// ========== 衝堂檢查功能 ==========

// 檢查老師在特定時間是否有衝堂
function checkTeacherConflict(teacherId, date, startTime, endTime) {
    const conflicts = [];

    // 將時間轉換為分鐘數以便比較
    const timeToMinutes = (timeStr) => {
        if (!timeStr || typeof timeStr !== 'string') return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    };

    const newStart = timeToMinutes(startTime);
    const newEnd = timeToMinutes(endTime);

    // 檢查派課管理中的課程
    const teacher = teachersData[teacherId];
    if (teacher && teacher.courses) {
        teacher.courses.forEach(course => {
            if (course.date === date && course.time && typeof course.time === 'string') {
                const [courseStart, courseEnd] = course.time.split('-');
                const existingStart = timeToMinutes(courseStart);
                const existingEnd = timeToMinutes(courseEnd);

                // 檢查時間是否重疊
                if (!(newEnd <= existingStart || newStart >= existingEnd)) {
                    conflicts.push({
                        name: course.subject,
                        time: course.time,
                        type: course.type,
                        source: '派課管理'
                    });
                }
            }
        });
    }

    // 檢查行事曆中的事件
    calendarEvents.forEach(event => {
        if (event.teacherId === teacherId && event.date === date && event.time && typeof event.time === 'string') {
            const timeParts = event.time.split('-');
            if (timeParts.length === 2) {
                const [eventStart, eventEnd] = timeParts;
                const existingStart = timeToMinutes(eventStart);
                const existingEnd = timeToMinutes(eventEnd);

                // 檢查時間是否重疊（排除派課產生的事件，避免重複檢查）
                if (!event.courseId && !(newEnd <= existingStart || newStart >= existingEnd)) {
                    conflicts.push({
                        name: event.title,
                        time: event.time,
                        type: event.type || '行事曆事件',
                        source: '行事曆'
                    });
                }
            }
        }
    });

    return conflicts;
}

// ========== 課程與行事曆同步 ==========

// 擴展原有的 addCourse 函數
const original_addCourse = window.addCourse || addCourse;

function addCourse_Enhanced(courseData) {
    // 檢查必要的全域變數
    if (typeof teachersData === 'undefined' || !currentTeacher) {
        console.error('❌ teachersData 或 currentTeacher 未定義');
        if (typeof showMessage === 'function') {
            showMessage('系統錯誤：無法存取教師資料', 'error');
        }
        return;
    }

    const teacher = teachersData[currentTeacher];

    if (!teacher) {
        console.error('❌ 找不到教師資料');
        if (typeof showMessage === 'function') {
            showMessage('找不到教師資料', 'error');
        }
        return;
    }

    // 檢查新增課程後的時數限制
    const newCourseHours = calculateHours(`${courseData.startTime}-${courseData.endTime}`);
    const courseDate = new Date(courseData.date);
    const currentMonthlyHours = calculateMonthlyHours(currentTeacher, courseDate.getFullYear(), courseDate.getMonth());
    const totalHoursAfterAdd = currentMonthlyHours + newCourseHours;

    // 衝堂檢查
    const conflicts = checkTeacherConflict(currentTeacher, courseData.date, courseData.startTime, courseData.endTime);

    if (conflicts.length > 0) {
        const conflictMessages = conflicts.map(c =>
            `- ${c.name} (${c.time}) [${c.type}] 來源：${c.source}`
        ).join('\n');

        const confirmMessage = `⚠️ 衝堂警告！\n\n該老師在此時段已有以下課程：\n${conflictMessages}\n\n是否仍要繼續派課？`;

        if (!confirm(confirmMessage)) {
            return; // 取消派課
        }
    }

    // 如果會超過限制，顯示警告但仍允許新增
    if (totalHoursAfterAdd > 12) {
        const overHours = totalHoursAfterAdd - 12;
        showMessage(`⚠️ 警告：新增此課程後將超過月度限制 ${overHours.toFixed(1)} 小時！`, 'warning');
    } else if (totalHoursAfterAdd >= 10) {
        const remainingHours = 12 - totalHoursAfterAdd;
        showMessage(`⚠️ 注意：新增後剩餘時數僅 ${remainingHours.toFixed(1)} 小時`, 'warning');
    }

    // 根據實際時間自動判斷課程狀態
    const courseStatus = getCourseStatus(courseData.date, `${courseData.startTime}-${courseData.endTime}`);

    const newCourse = {
        date: courseData.date,
        time: `${courseData.startTime}-${courseData.endTime}`,
        subject: courseData.name,
        students: 25,
        type: courseData.type,
        status: courseStatus.status,
        id: Date.now()
    };

    teacher.courses.push(newCourse);

    // 同步到行事曆 - 這是新增的核心功能！
    calendarEvents.push({
        id: newCourse.id,
        date: courseData.date,
        title: `${courseData.name} - ${teacher.name}`,
        time: `${courseData.startTime}-${courseData.endTime}`,
        teacherId: currentTeacher,
        type: courseData.type,
        color: getCourseTypeColor(courseData.type),
        courseId: newCourse.id,
        source: 'course'
    });

    saveData();
    saveCalendarEvents();
    updateAllViews();

    showMessage('✅ 課程新增成功！已同步到行事曆', 'success');
}

// 替換原有函數
if (typeof addCourse !== 'undefined') {
    window.addCourse = addCourse_Enhanced;
}

// ========== 刪除課程時同步刪除行事曆 ==========

const original_deleteCourse = window.deleteCourse || deleteCourse;

function deleteCourse_Enhanced(index) {
    // 檢查必要的全域變數
    if (typeof teachersData === 'undefined' || !currentTeacher) {
        console.error('❌ teachersData 或 currentTeacher 未定義');
        if (typeof showMessage === 'function') {
            showMessage('系統錯誤：無法存取教師資料', 'error');
        }
        return;
    }

    const teacher = teachersData[currentTeacher];

    if (!teacher || !teacher.courses || !teacher.courses[index]) {
        console.error('❌ 找不到課程資料');
        if (typeof showMessage === 'function') {
            showMessage('找不到課程資料', 'error');
        }
        return;
    }

    const course = teacher.courses[index];
    const courseName = course.subject;
    const courseId = course.id;

    if (confirm(`確定要刪除課程「${courseName}」嗎？`)) {
        teacher.courses.splice(index, 1);

        // 同步刪除行事曆中的對應事件
        calendarEvents = calendarEvents.filter(e => e.courseId !== courseId);

        saveData();
        saveCalendarEvents();
        updateAllViews();

        showMessage(`✅ 課程「${courseName}」已刪除，已同步更新行事曆`, 'success');
    }
}

// 替換原有函數
if (typeof deleteCourse !== 'undefined') {
    window.deleteCourse = deleteCourse_Enhanced;
}

// ========== 行事曆渲染功能 ==========

function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

    document.getElementById('currentCalendarMonth').textContent = `${year}年 ${monthNames[month]}`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const today = new Date().toDateString();

    for (let w = 0; w < 6; w++) {
        for (let d = 0; d < 7; d++) {
            const cellDate = new Date(startDate);
            cellDate.setDate(startDate.getDate() + (w * 7) + d);

            const isCurrentMonth = (cellDate.getMonth() === month);
            const isToday = (cellDate.toDateString() === today);
            const dateKey = cellDate.toISOString().split('T')[0];

            // 獲取這一天的事件（包含派課和行事曆事件）
            const dayEvents = calendarEvents
                .filter(ev => ev.date === dateKey)
                .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

            const cell = document.createElement('div');
            cell.className = `calendar-day border rounded-lg p-2 ${
                isCurrentMonth ? 'bg-white' : 'bg-gray-100'
            } ${isToday ? 'ring-2 ring-blue-500' : ''}`;

            cell.innerHTML = `
                <div class="text-sm font-semibold mb-1 ${
                    isToday ? 'text-blue-600' : isCurrentMonth ? 'text-gray-700' : 'text-gray-400'
                }">${cellDate.getDate()}</div>
                <div class="space-y-1">
                    ${dayEvents.map(event => `
                        <div class="calendar-event text-white px-1 py-0.5 rounded truncate"
                             style="background-color: ${event.color || '#6b7280'}"
                             title="${event.title} (${event.time})">
                            ${event.time ? event.time.split('-')[0] : ''} ${event.title}
                        </div>
                    `).join('')}
                </div>
            `;

            grid.appendChild(cell);
        }
    }
}

function changeMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
}

function goToToday() {
    currentCalendarDate = new Date();
    renderCalendar();
}

// ========== 本週課表功能 ==========

function renderWeekSchedulePreview() {
    // 檢查必要的全域變數
    if (typeof teachersData === 'undefined' || typeof currentTeacher === 'undefined') {
        console.warn('⚠️ teachersData 或 currentTeacher 未定義');
        const previewElement = document.getElementById('weekSchedulePreview');
        if (previewElement) {
            previewElement.innerHTML = '<p class="text-gray-500 text-xs">系統尚未初始化</p>';
        }
        return;
    }

    if (!currentTeacher || !teachersData[currentTeacher]) {
        const previewElement = document.getElementById('weekSchedulePreview');
        if (previewElement) {
            previewElement.innerHTML = '<p class="text-gray-500 text-xs">請選擇師資</p>';
        }
        return;
    }

    const teacher = teachersData[currentTeacher];
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));

    const weekSchedule = [];
    const weekDays = ['一', '二', '三', '四', '五', '六', '日'];

    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];

        // 獲取該天的課程
        const dayCourses = teacher.courses.filter(c => c.date === dateStr);
        const dayEvents = calendarEvents.filter(e => e.teacherId === currentTeacher && e.date === dateStr && !e.courseId);

        if (dayCourses.length > 0 || dayEvents.length > 0) {
            weekSchedule.push({
                day: weekDays[i],
                date: date.getDate(),
                courses: [...dayCourses, ...dayEvents]
            });
        }
    }

    const container = document.getElementById('weekSchedulePreview');

    if (weekSchedule.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-xs">本週無排課</p>';
        return;
    }

    container.innerHTML = weekSchedule.map(day => `
        <div class="bg-white/50 rounded-lg p-2">
            <div class="text-xs font-semibold text-gray-700 mb-1">週${day.day} ${day.date}日</div>
            <div class="space-y-1">
                ${day.courses.map(course => `
                    <div class="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                        ${course.time} ${course.subject || course.title}
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// ========== 視圖切換功能 ==========

function switchView(viewName) {
    // 隱藏所有視圖
    document.querySelectorAll('.page-view').forEach(view => {
        view.classList.remove('active');
    });

    // 移除所有導航按鈕的active狀態
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // 顯示選中的視圖
    const targetView = viewName === 'dashboard' ? 'dashboardView' : 'calendarView';
    document.getElementById(targetView)?.classList.add('active');

    // 高亮當前導航按鈕
    document.getElementById(`nav-${viewName}`)?.classList.add('active');

    // 如果切換到行事曆，渲染行事曆
    if (viewName === 'calendar') {
        renderCalendar();
    }
}

// 新增行事曆事件模態框
function toggleAddEventModal() {
    // 這裡可以實作新增行事曆事件的功能
    showMessage('行事曆事件新增功能開發中...', 'info');
}

// ========== 初始化擴展功能 ==========

document.addEventListener('DOMContentLoaded', function() {
    console.log('✨ 功能擴展模組已載入');

    // 初始化本週課表
    if (typeof renderWeekSchedulePreview === 'function') {
        renderWeekSchedulePreview();
    }

    // 如果有自定義的updateAllViews，擴展它
    const original_updateAllViews = window.updateAllViews;
    if (original_updateAllViews) {
        window.updateAllViews = function() {
            original_updateAllViews();
            renderWeekSchedulePreview();
        };
    }
});

// 導出函數供外部使用
window.switchView = switchView;
window.renderCalendar = renderCalendar;
window.changeMonth = changeMonth;
window.goToToday = goToToday;
window.toggleAddEventModal = toggleAddEventModal;
window.checkTeacherConflict = checkTeacherConflict;
window.getCourseTypeColor = getCourseTypeColor;
window.renderWeekSchedulePreview = renderWeekSchedulePreview;

console.log('🎉 師資派課管理系統 - 所有擴展功能已就緒！');
