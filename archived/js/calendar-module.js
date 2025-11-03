// ==================== 行事曆模組 ====================
// 整合自 teacher-management.html，用於派課管理系統

let currentDate = new Date();
let viewMode = 'month';
let selectedColor = 'bg-blue-500';
let reminderInterval = null;

// 行事曆事件數據
let calendarEvents = JSON.parse(localStorage.getItem('calendarEvents') || '[]');

// ==================== 儲存函數 ====================

function saveCalendarLocal() {
    try {
        localStorage.setItem('calendarEvents', JSON.stringify(calendarEvents));
    } catch (err) {
        console.warn('localStorage 超額，行事曆數據保存失敗：', err);
    }
}

// ==================== 工具函數 ====================

function fmtDate(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function todayStr() {
    const d = new Date();
    return fmtDate(d.getFullYear(), d.getMonth(), d.getDate());
}

// ==================== 視圖控制 ====================

function setViewMode(mode) {
    viewMode = mode;
    const monthBtn = document.getElementById('monthViewBtn');
    const weekBtn = document.getElementById('weekViewBtn');

    if (mode === 'month') {
        monthBtn.className = 'px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-md';
        weekBtn.className = 'px-4 py-2 rounded-lg text-sm font-semibold transition-all text-gray-600 hover:text-gray-800 hover:bg-white hover:bg-opacity-50';
        document.getElementById('prevLabel').textContent = '上個月';
        document.getElementById('nextLabel').textContent = '下個月';
    } else {
        weekBtn.className = 'px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-md';
        monthBtn.className = 'px-4 py-2 rounded-lg text-sm font-semibold transition-all text-gray-600 hover:text-gray-800 hover:bg-white hover:bg-opacity-50';
        document.getElementById('prevLabel').textContent = '上週';
        document.getElementById('nextLabel').textContent = '下週';
    }
    renderCalendar();
}

function previousPeriod() {
    if (viewMode === 'month') {
        currentDate.setMonth(currentDate.getMonth() - 1);
    } else {
        currentDate.setDate(currentDate.getDate() - 7);
    }
    renderCalendar();
}

function nextPeriod() {
    if (viewMode === 'month') {
        currentDate.setMonth(currentDate.getMonth() + 1);
    } else {
        currentDate.setDate(currentDate.getDate() + 7);
    }
    renderCalendar();
}

function goToToday() {
    currentDate = new Date();
    renderCalendar();
}

// ==================== 事件管理 ====================

function openAddEventModal() {
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventTime').value = '';
    document.getElementById('eventLocation').value = '';
    document.getElementById('eventNote').value = '';
    selectedColor = 'bg-blue-500';
    document.getElementById('eventDate').value = todayStr();
    document.getElementById('addEventModal').classList.remove('hidden');
}

function openAddEventModalForDate(dateKey) {
    openAddEventModal();
    document.getElementById('eventDate').value = dateKey;
}

function closeAddEventModal() {
    document.getElementById('addEventModal').classList.add('hidden');
}

function selectColor(color) {
    selectedColor = color;
    // 更新顏色選擇器的視覺反饋
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.remove('ring-4', 'ring-offset-2');
    });
    event.target.classList.add('ring-4', 'ring-offset-2');
}

function addEventIntegrated(e) {
    e.preventDefault();
    const title = (document.getElementById('eventTitle').value || '').trim();
    const date = (document.getElementById('eventDate').value || '').trim();
    const time = (document.getElementById('eventTime').value || '').trim();
    const teacherIdVal = document.getElementById('eventTeacherId').value;
    const teacherId = teacherIdVal ? Number(teacherIdVal) : null;
    const location = (document.getElementById('eventLocation').value || '').trim();
    const note = (document.getElementById('eventNote').value || '').trim();

    if (!title || !date) {
        alert('請填寫事件標題和日期！');
        return;
    }

    calendarEvents.push({
        id: Date.now(),
        date,
        title,
        time,
        teacherId,
        location,
        note,
        color: selectedColor
    });

    saveCalendarLocal();
    closeAddEventModal();
    renderCalendar();
    showMessage('✅ 事件已新增到行事曆', 'success');
}

function deleteEventById(id) {
    if (confirm('確定要刪除此事件嗎？')) {
        calendarEvents = calendarEvents.filter(ev => ev.id !== id);
        saveCalendarLocal();
        renderCalendar();
        showMessage('✅ 事件已刪除', 'success');
    }
}

// ==================== 行事曆渲染 ====================

function renderCalendar() {
    if (viewMode === 'month') {
        renderMonthView();
    } else {
        renderWeekView();
    }
    checkTodayReminders();
}

function renderMonthView() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
    document.getElementById('currentMonth').textContent = `${year}年 ${monthNames[month]}`;

    const firstDay = new Date(year, month, 1);
    const start = new Date(firstDay);
    start.setDate(start.getDate() - firstDay.getDay());

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    grid.className = 'grid grid-cols-7';
    const today = new Date().toDateString();

    for (let w = 0; w < 6; w++) {
        for (let d = 0; d < 7; d++) {
            const cellDate = new Date(start);
            cellDate.setDate(start.getDate() + (w * 7) + d);

            const isCurrentMonth = (cellDate.getMonth() === month);
            const isToday = (cellDate.toDateString() === today);
            const dateKey = fmtDate(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());

            const dayEvents = calendarEvents
                .filter(ev => ev.date === dateKey)
                .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

            const cell = document.createElement('div');
            cell.className = `calendar-day border-r border-b border-gray-200 p-4 min-h-[120px] ${isCurrentMonth ? 'bg-white' : 'bg-gray-50'
                } ${isToday ? 'ring-2 ring-blue-500' : ''} hover:bg-blue-50 transition-all cursor-pointer`;

            cell.onclick = () => openAddEventModalForDate(dateKey);

            cell.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <span class="text-lg font-bold ${isCurrentMonth ? (isToday ? 'text-blue-600' : 'text-gray-800') : 'text-gray-400'
                } ${isToday ? 'bg-blue-100 px-2 py-1 rounded-lg' : ''}">
                        ${cellDate.getDate()}
                    </span>
                </div>
                <div class="space-y-1">
                    ${dayEvents.map(ev => `
                        <div class="event-item ${ev.color || 'bg-blue-500'} text-white text-xs p-1 rounded truncate"
                             title="點擊刪除：${ev.title}${ev.time ? ' ' + ev.time : ''}${ev.location ? (' · ' + ev.location) : ''}"
                             onclick="event.stopPropagation(); deleteEventById(${ev.id})">
                            ${ev.time ? ev.time + ' ' : ''}${ev.title}
                        </div>`).join('')}
                </div>`;

            grid.appendChild(cell);
        }
    }
}

function renderWeekView() {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
    document.getElementById('currentMonth').textContent =
        `${startOfWeek.getFullYear()}年 ${monthNames[startOfWeek.getMonth()]} ${startOfWeek.getDate()}日 - ${endOfWeek.getDate()}日`;

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    grid.className = 'grid grid-cols-7';
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const today = new Date().toDateString();

    for (let i = 0; i < 7; i++) {
        const cellDate = new Date(startOfWeek);
        cellDate.setDate(startOfWeek.getDate() + i);

        const isToday = (cellDate.toDateString() === today);
        const dateKey = fmtDate(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());

        const dayEvents = calendarEvents
            .filter(ev => ev.date === dateKey)
            .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

        const cell = document.createElement('div');
        cell.className = `week-day border-r border-b border-gray-200 p-4 bg-white ${isToday ? 'ring-2 ring-blue-500' : ''} hover:bg-blue-50 transition-all cursor-pointer`;

        cell.onclick = () => openAddEventModalForDate(dateKey);

        cell.innerHTML = `
            <div class="text-center mb-4 pb-3 border-b border-gray-200">
                <div class="text-sm font-semibold ${isToday ? 'text-blue-600' : 'text-gray-600'}">${dayNames[i]}</div>
                <div class="text-2xl font-bold ${isToday ? 'text-blue-600' : 'text-gray-800'} ${isToday ? 'bg-blue-100 rounded-lg px-2 py-1 inline-block mt-1' : ''}">
                    ${cellDate.getDate()}
                </div>
            </div>
            <div class="space-y-2">
                ${dayEvents.map(ev => `
                    <div class="event-item ${ev.color || 'bg-blue-500'} text-white text-sm p-3 rounded-xl"
                         title="點擊刪除：${ev.title}${ev.time ? ' ' + ev.time : ''}${ev.location ? (' · ' + ev.location) : ''}"
                         onclick="event.stopPropagation(); deleteEventById(${ev.id})">
                        <div class="font-semibold">${ev.title}</div>
                        ${ev.time ? `<div class="text-xs opacity-90 mt-1">⏰ ${ev.time}${ev.location ? ` · ${ev.location}` : ''}</div>` : (ev.location ? `<div class="text-xs opacity-90 mt-1">${ev.location}</div>` : '')}
                        ${ev.note ? `<div class="text-xs opacity-90 mt-1">🗒️ ${ev.note}</div>` : ''}
                    </div>`).join('')}
            </div>`;

        grid.appendChild(cell);
    }
}

// ==================== 今日提醒 ====================

function checkTodayReminders() {
    const tStr = todayStr();
    const now = new Date();
    const upcoming = calendarEvents.filter(ev => {
        if (ev.date !== tStr || !ev.time) return false;
        const dt = new Date(`${tStr}T${ev.time}`);
        const diff = dt - now;
        return diff > 0 && diff <= 30 * 60 * 1000;
    }).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    const box = document.getElementById('todayReminders');
    const list = document.getElementById('remindersList');

    if (upcoming.length) {
        list.innerHTML = upcoming.map(ev => {
            const dt = new Date(`${tStr}T${ev.time}`);
            const mins = Math.ceil((dt - now) / (60 * 1000));
            return `
                <div class="reminder-item bg-white bg-opacity-20 rounded-lg p-3 flex items-center justify-between">
                    <div>
                        <div class="font-medium">${ev.title}</div>
                        <div class="text-sm opacity-90">${ev.time} - ${mins}分鐘後開始${ev.location ? ` · ${ev.location}` : ''}</div>
                    </div>
                    <div class="text-2xl">⚠️</div>
                </div>`;
        }).join('');
        box.classList.remove('hidden');
    } else {
        box.classList.add('hidden');
    }
}

function startReminderCheck() {
    if (reminderInterval) clearInterval(reminderInterval);
    reminderInterval = setInterval(checkTodayReminders, 60000);
    checkTodayReminders();
}

function stopReminderCheck() {
    if (reminderInterval) clearInterval(reminderInterval);
}

// ==================== 初始化 ====================

function initCalendar() {
    // 載入師資列表到事件表單
    const teachers = JSON.parse(localStorage.getItem('teachers') || '[]');
    const sel = document.getElementById('eventTeacherId');
    if (sel) {
        sel.innerHTML = `<option value="">（未指派）</option>` +
            (teachers || []).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }

    // 設定今天的日期
    const today = todayStr();
    const dateInput = document.getElementById('eventDate');
    if (dateInput) {
        dateInput.value = today;
    }

    // 渲染行事曆
    renderCalendar();
    startReminderCheck();
}

// 當頁面載入時初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCalendar);
} else {
    initCalendar();
}
