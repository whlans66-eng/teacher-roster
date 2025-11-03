// ==================== 工具函數模組 ====================

// 計算課程時數
function calculateHours(timeRange) {
    const [start, end] = timeRange.split('-');
    const startTime = new Date(`2024-01-01 ${start}`);
    const endTime = new Date(`2024-01-01 ${end}`);
    return (endTime - startTime) / (1000 * 60 * 60);
}

// 根據日期範圍過濾課程
function getFilteredCourses(teacherId) {
    const teacher = teachersData[teacherId];
    if (!teacher || !teacher.courses) return [];

    if (!state.currentStartDate || !state.currentEndDate) {
        return teacher.courses;
    }

    return teacher.courses.filter(course => {
        return course.date >= state.currentStartDate && course.date <= state.currentEndDate;
    });
}

// 計算選定期間的時數
function calculatePeriodHours(teacherId) {
    const filteredCourses = getFilteredCourses(teacherId);
    return filteredCourses.reduce((total, course) => total + calculateHours(course.time), 0);
}

// 計算月度時數
function calculateMonthlyHours(teacherId, year, month) {
    const teacher = teachersData[teacherId];
    if (!teacher) return 0;

    return teacher.courses
        .filter(course => {
            const courseDate = new Date(course.date);
            return courseDate.getFullYear() === year && courseDate.getMonth() === month;
        })
        .reduce((total, course) => total + calculateHours(course.time), 0);
}

// 檢查時數限制
function checkHourlyLimit(teacherId, courseDate) {
    const date = new Date(courseDate);
    const year = date.getFullYear();
    const month = date.getMonth();

    const currentMonthlyHours = calculateMonthlyHours(teacherId, year, month);

    return {
        currentHours: currentMonthlyHours,
        limit: 12,
        isOverLimit: currentMonthlyHours >= 12,
        remainingHours: Math.max(0, 12 - currentMonthlyHours),
        warningThreshold: currentMonthlyHours >= 10
    };
}

// 判斷課程狀態
function getCourseStatus(courseDate, courseTime) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;

    const [startTime, endTime] = courseTime.split('-');

    function timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    const startTimeInMinutes = timeToMinutes(startTime);
    const endTimeInMinutes = timeToMinutes(endTime);

    if (courseDate < today) {
        return { status: 'completed', color: 'bg-green-500', icon: '✅', text: '已完成' };
    } else if (courseDate > today) {
        return { status: 'upcoming', color: 'bg-blue-500', icon: '📅', text: '未來' };
    } else {
        if (currentTimeInMinutes >= endTimeInMinutes) {
            return { status: 'completed', color: 'bg-green-500', icon: '✅', text: '已完成' };
        } else if (currentTimeInMinutes >= startTimeInMinutes) {
            return { status: 'ongoing', color: 'bg-yellow-500', icon: '⏳', text: '進行中' };
        } else {
            return { status: 'upcoming', color: 'bg-blue-500', icon: '📅', text: '即將開始' };
        }
    }
}

// 初始化日期範圍
function initializeDates() {
    const startDate = new Date('2023-01-01');
    const endDate = new Date('2024-12-31');

    state.currentStartDate = startDate.toISOString().split('T')[0];
    state.currentEndDate = endDate.toISOString().split('T')[0];

    document.getElementById('startDate').value = state.currentStartDate;
    document.getElementById('endDate').value = state.currentEndDate;
}

// 設定日期範圍
function setDateRange(range) {
    const today = new Date();
    let startDate, endDate;

    switch(range) {
        case 'thisMonth':
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = today;
            break;
        case 'lastMonth':
            startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            endDate = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'last3Months':
            startDate = new Date(today.getFullYear(), today.getMonth() - 2, 1);
            endDate = today;
            break;
        case 'last6Months':
            startDate = new Date(today.getFullYear(), today.getMonth() - 5, 1);
            endDate = today;
            break;
        case 'thisYear':
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = today;
            break;
    }

    state.currentStartDate = startDate.toISOString().split('T')[0];
    state.currentEndDate = endDate.toISOString().split('T')[0];

    document.getElementById('startDate').value = state.currentStartDate;
    document.getElementById('endDate').value = state.currentEndDate;

    saveData();

    const rangeNames = {
        'thisMonth': '本月',
        'lastMonth': '上月',
        'last3Months': '近3個月',
        'last6Months': '近半年',
        'thisYear': '今年'
    };
    return rangeNames[range];
}

// 訊息顯示功能
function showMessage(message, type = 'info') {
    const existingMessages = document.querySelectorAll('.toast-message');
    existingMessages.forEach(msg => msg.remove());

    const messageDiv = document.createElement('div');
    let bgGradient, icon, borderColor;

    switch(type) {
        case 'success':
            bgGradient = 'from-emerald-500 to-green-600';
            borderColor = 'border-emerald-400';
            icon = '✅';
            break;
        case 'warning':
            bgGradient = 'from-amber-500 to-orange-600';
            borderColor = 'border-amber-400';
            icon = '⚠️';
            break;
        case 'error':
            bgGradient = 'from-red-500 to-rose-600';
            borderColor = 'border-red-400';
            icon = '❌';
            break;
        default:
            bgGradient = 'from-blue-500 to-indigo-600';
            borderColor = 'border-blue-400';
            icon = 'ℹ️';
    }

    messageDiv.className = `toast-message fixed top-6 right-6 px-6 py-4 rounded-2xl text-white font-medium z-50 bg-gradient-to-r ${bgGradient} shadow-2xl border ${borderColor} backdrop-blur-sm transform translate-x-full transition-all duration-500 ease-out max-w-md`;

    messageDiv.innerHTML = `
        <div class="flex items-center space-x-3">
            <div class="flex-shrink-0 text-xl">${icon}</div>
            <div class="flex-1">
                <p class="text-sm leading-relaxed">${message}</p>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" class="flex-shrink-0 ml-2 text-white/80 hover:text-white transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </div>
        <div class="absolute bottom-0 left-0 h-1 bg-white/30 rounded-full transition-all duration-${type === 'warning' ? '5000' : '3000'} ease-linear toast-progress"></div>
    `;

    document.body.appendChild(messageDiv);

    setTimeout(() => {
        messageDiv.classList.remove('translate-x-full');
        messageDiv.classList.add('translate-x-0');
    }, 100);

    const progressBar = messageDiv.querySelector('.toast-progress');
    setTimeout(() => {
        progressBar.style.width = '100%';
    }, 200);

    const duration = type === 'warning' ? 5000 : 3000;

    setTimeout(() => {
        messageDiv.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 500);
    }, duration);
}

// 數字動畫效果
function animateNumber(elementId, targetValue, unit) {
    const element = document.getElementById(elementId);
    const startValue = 0;
    const duration = 1000;
    const startTime = performance.now();

    function updateNumber(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const currentValue = startValue + (targetValue - startValue) * progress;

        element.textContent = Math.floor(currentValue) + unit;

        if (progress < 1) {
            requestAnimationFrame(updateNumber);
        }
    }

    requestAnimationFrame(updateNumber);
}

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        weekday: 'short'
    });
}

// 格式化日期範圍
function formatDateRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const startStr = start.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
    return `${startStr} - ${endStr}`;
}
