// ==================== UI 更新模組 ====================

// 更新所有視圖
function updateAllViews() {
    if (!state.currentTeacher || !teachersData[state.currentTeacher]) {
        clearAllViews();
        return;
    }

    updateTeacherSelect();
    updateCurrentTeacherStatus();
    updateStats();
    createCourseTypeChart();
    createTimeline();
    createTeachersList();
}

// 清空所有視圖
function clearAllViews() {
    document.getElementById('teacherSelect').innerHTML = '<option value="">無師資</option>';
    document.getElementById('currentTeacherAvatar').innerHTML = '<div class="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-sm">❌</div>';
    document.getElementById('currentTeacherName').textContent = '無師資';
    document.getElementById('currentTeacherSpecialty').textContent = '請新增師資';
    document.getElementById('monthlyHoursBar').style.width = '0%';
    document.getElementById('monthlyHoursText').textContent = '0/12 小時';
    document.getElementById('todayCourses').innerHTML = '<p class="text-gray-500 text-xs">無師資資料</p>';
    document.getElementById('totalHours').textContent = '0小時';
    document.getElementById('totalCourses').textContent = '0堂';

    if (state.courseTypeChart) {
        state.courseTypeChart.destroy();
        state.courseTypeChart = null;
    }

    document.getElementById('timeline').innerHTML = '<div class="text-center text-gray-500 py-8">無師資資料</div>';
    document.getElementById('teachersList').innerHTML = '<div class="col-span-full text-center text-gray-500 py-8">無師資資料<br><button onclick="toggleModal(\'addTeacherModal\')" class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">新增師資</button></div>';
}

// 更新師資選擇下拉選單
function updateTeacherSelect() {
    const teacherSelect = document.getElementById('teacherSelect');
    teacherSelect.innerHTML = '';

    Object.keys(teachersData).forEach(teacherId => {
        const teacher = teachersData[teacherId];
        const option = document.createElement('option');
        option.value = teacherId;
        option.textContent = `${teacher.name} - ${teacher.specialty}`;
        teacherSelect.appendChild(option);
    });

    teacherSelect.value = state.currentTeacher;
}

// 更新當前師資狀態
function updateCurrentTeacherStatus() {
    const teacher = teachersData[state.currentTeacher];
    if (!teacher) return;

    // 更新師資基本資訊
    const avatarElement = document.getElementById('currentTeacherAvatar');
    if (teacher.avatar) {
        avatarElement.innerHTML = `<img src="${teacher.avatar}" alt="師資照片" class="w-8 h-8 rounded-full object-cover">`;
    } else {
        avatarElement.innerHTML = '<div class="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-sm">👤</div>';
    }
    document.getElementById('currentTeacherName').textContent = teacher.name;
    document.getElementById('currentTeacherSpecialty').textContent = teacher.specialty;

    // 更新進度條
    updateMonthlyHoursProgress();
    updatePeriodHoursProgress();

    // 更新今日課程
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const todayCourses = teacher.courses.filter(course => course.date === today);
    updateTodayCourses(todayCourses);
}

// 更新月度時數進度條
function updateMonthlyHoursProgress() {
    const now = new Date();
    const monthlyHours = calculateMonthlyHours(state.currentTeacher, now.getFullYear(), now.getMonth());
    const percentage = Math.min((monthlyHours / 12) * 100, 100);

    const progressBar = document.getElementById('monthlyHoursBar');
    const progressText = document.getElementById('monthlyHoursText');

    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${monthlyHours.toFixed(1)}/12 小時`;

    if (monthlyHours >= 12) {
        progressBar.className = 'bg-red-500 h-2 rounded-full transition-all duration-500';
        progressText.className = 'text-xs text-red-600 font-medium';
    } else if (monthlyHours >= 10) {
        progressBar.className = 'bg-yellow-500 h-2 rounded-full transition-all duration-500';
        progressText.className = 'text-xs text-yellow-600 font-medium';
    } else {
        progressBar.className = 'bg-blue-500 h-2 rounded-full transition-all duration-500';
        progressText.className = 'text-xs text-gray-600';
    }
}

// 更新選定期間時數進度條
function updatePeriodHoursProgress() {
    const periodHours = calculatePeriodHours(state.currentTeacher);
    const maxHours = Math.max(periodHours, 50);
    const percentage = Math.min((periodHours / maxHours) * 100, 100);

    const progressBar = document.getElementById('periodHoursBar');
    const progressText = document.getElementById('periodHoursText');
    const periodLabel = document.getElementById('periodLabel');

    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${periodHours.toFixed(1)} 小時`;

    const dateRange = formatDateRange(state.currentStartDate, state.currentEndDate);
    periodLabel.textContent = `${dateRange} 時數`;

    if (periodHours >= 40) {
        progressBar.className = 'bg-purple-500 h-2 rounded-full transition-all duration-500';
        progressText.className = 'text-xs text-purple-600 font-medium';
    } else if (periodHours >= 20) {
        progressBar.className = 'bg-green-500 h-2 rounded-full transition-all duration-500';
        progressText.className = 'text-xs text-green-600 font-medium';
    } else {
        progressBar.className = 'bg-blue-500 h-2 rounded-full transition-all duration-500';
        progressText.className = 'text-xs text-gray-600';
    }
}

// 更新今日課程預覽
function updateTodayCourses(todayCourses) {
    const todayCoursesElement = document.getElementById('todayCourses');

    if (todayCourses.length === 0) {
        todayCoursesElement.innerHTML = '<p class="text-gray-500 text-xs">今日無課程安排</p>';
        return;
    }

    todayCoursesElement.innerHTML = todayCourses.map(course => {
        const courseStatus = getCourseStatus(course.date, course.time);
        const { icon: statusIcon, text: statusText } = courseStatus;

        let statusColor;
        switch(courseStatus.status) {
            case 'completed':
                statusColor = 'text-green-600';
                break;
            case 'ongoing':
                statusColor = 'text-red-600';
                break;
            default:
                statusColor = 'text-blue-600';
        }

        return `
            <div class="flex items-center justify-between p-2 bg-white/50 rounded-lg">
                <div class="flex items-center space-x-2">
                    <span class="${statusColor} text-xs">${statusIcon}</span>
                    <div>
                        <p class="font-medium text-gray-800 text-xs">${course.subject}</p>
                        <p class="text-xs text-gray-600">${course.time}</p>
                    </div>
                </div>
                <span class="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">${course.type}</span>
            </div>
        `;
    }).join('');
}

// 更新統計數據
function updateStats() {
    const filteredCourses = getFilteredCourses(state.currentTeacher);
    const totalCourses = filteredCourses.length;
    const periodHours = calculatePeriodHours(state.currentTeacher);

    animateNumber('totalHours', periodHours, '小時');
    animateNumber('totalCourses', totalCourses, '堂');

    updateStatsLabels();
    updatePeriodHoursCard(periodHours);
}

// 更新統計卡片標籤
function updateStatsLabels() {
    const dateRange = formatDateRange(state.currentStartDate, state.currentEndDate);

    document.getElementById('totalHoursLabel').textContent = `${dateRange} 授課時數`;
    document.getElementById('totalCoursesLabel').textContent = `${dateRange} 課程數量`;
    document.getElementById('hoursSubtext').textContent = `選定期間統計`;
    document.getElementById('coursesSubtext').textContent = `選定期間統計`;
}

// 更新期間時數卡片狀態
function updatePeriodHoursCard(periodHours) {
    const hoursCard = document.querySelector('.stat-gradient-1').parentElement;
    const hoursSubtext = document.getElementById('hoursSubtext');
    const hoursNumber = document.getElementById('totalHours');

    hoursCard.classList.remove('ring-2', 'ring-red-400', 'ring-yellow-400', 'ring-purple-400');

    if (periodHours >= 40) {
        hoursCard.classList.add('ring-2', 'ring-purple-400');
        hoursSubtext.innerHTML = `🔥 高強度授課期間`;
        hoursSubtext.className = 'text-xs text-purple-600 mt-1 font-medium';
        hoursNumber.className = 'text-3xl font-bold text-purple-600';
    } else if (periodHours >= 20) {
        hoursCard.classList.add('ring-2', 'ring-green-400');
        hoursSubtext.innerHTML = `✅ 適中授課時數`;
        hoursSubtext.className = 'text-xs text-green-600 mt-1 font-medium';
        hoursNumber.className = 'text-3xl font-bold text-green-600';
    } else {
        hoursSubtext.innerHTML = `📊 選定期間統計`;
        hoursSubtext.className = 'text-xs text-gray-500 mt-1';
        hoursNumber.className = 'text-3xl font-bold text-gray-800';
    }
}

// 創建課程類型圖表
function createCourseTypeChart() {
    const ctx = document.getElementById('courseTypeChart').getContext('2d');

    if (state.courseTypeChart) {
        state.courseTypeChart.destroy();
    }

    const filteredCourses = getFilteredCourses(state.currentTeacher);
    const typeCount = {};

    filteredCourses.forEach(course => {
        typeCount[course.type] = (typeCount[course.type] || 0) + 1;
    });

    const gradientColors = [
        { bg: 'rgba(99, 102, 241, 0.9)', border: 'rgba(99, 102, 241, 1)' },
        { bg: 'rgba(16, 185, 129, 0.9)', border: 'rgba(16, 185, 129, 1)' },
        { bg: 'rgba(245, 158, 11, 0.9)', border: 'rgba(245, 158, 11, 1)' },
        { bg: 'rgba(239, 68, 68, 0.9)', border: 'rgba(239, 68, 68, 1)' },
        { bg: 'rgba(139, 92, 246, 0.9)', border: 'rgba(139, 92, 246, 1)' }
    ];

    state.courseTypeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(typeCount),
            datasets: [{
                data: Object.values(typeCount),
                backgroundColor: gradientColors.slice(0, Object.keys(typeCount).length).map(color => color.bg),
                borderColor: gradientColors.slice(0, Object.keys(typeCount).length).map(color => color.border),
                borderWidth: 3,
                hoverBorderWidth: 5,
                hoverOffset: 15,
                borderRadius: 8,
                spacing: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'right',
                    align: 'center',
                    labels: {
                        color: '#374151',
                        padding: 25,
                        font: {
                            size: 14,
                            weight: '600'
                        },
                        usePointStyle: true,
                        pointStyle: 'circle',
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const value = data.datasets[0].data[i];
                                    const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                                    const percentage = Math.round((value / total) * 100);

                                    return {
                                        text: `${label} (${value}堂 • ${percentage}%)`,
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        strokeStyle: data.datasets[0].borderColor[i],
                                        lineWidth: 2,
                                        hidden: false,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1,
                    cornerRadius: 12,
                    padding: 16,
                    titleFont: {
                        size: 16,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 14
                    },
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((context.parsed / total) * 100);
                            return `${context.label}: ${context.parsed}堂課 (${percentage}%)`;
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 1500,
                easing: 'easeOutQuart'
            }
        },
        plugins: [{
            id: 'centerText',
            beforeDraw: function(chart) {
                const ctx = chart.ctx;
                const centerX = chart.chartArea.left + (chart.chartArea.right - chart.chartArea.left) / 2;
                const centerY = chart.chartArea.top + (chart.chartArea.bottom - chart.chartArea.top) / 2;

                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                ctx.font = 'bold 32px Inter, system-ui, sans-serif';
                ctx.fillStyle = '#1f2937';
                ctx.fillText(total, centerX, centerY - 10);

                ctx.font = '14px Inter, system-ui, sans-serif';
                ctx.fillStyle = '#6b7280';
                ctx.fillText('總課程數', centerX, centerY + 20);

                ctx.restore();
            }
        }]
    });
}

// 創建時間軸
function createTimeline() {
    const teacher = teachersData[state.currentTeacher];
    const timeline = document.getElementById('timeline');

    timeline.innerHTML = '';

    if (!teacher || !teacher.courses || teacher.courses.length === 0) {
        timeline.innerHTML = '<div class="text-center text-gray-500 py-8">📚 此師資尚無課程資料</div>';
        return;
    }

    const filteredCourses = getFilteredCourses(state.currentTeacher);
    const sortedCourses = [...filteredCourses].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sortedCourses.length === 0) {
        const dateRange = formatDateRange(state.currentStartDate, state.currentEndDate);
        timeline.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <div class="mb-4">📅 選定時間範圍內無課程資料</div>
                <div class="text-sm">
                    <p>師資: ${teacher.name}</p>
                    <p>專業: ${teacher.specialty}</p>
                    <p>查詢範圍: ${dateRange}</p>
                    <p class="text-xs text-gray-400 mt-2">師資總共有 ${teacher.courses.length} 門課程，但不在選定時間範圍內</p>
                    <button onclick="toggleModal('addCourseModal')" class="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                        新增課程
                    </button>
                </div>
            </div>
        `;
        return;
    }

    // 顯示統計資訊
    const statsDiv = document.createElement('div');
    statsDiv.className = 'mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800';
    const dateRange = formatDateRange(state.currentStartDate, state.currentEndDate);
    statsDiv.innerHTML = `
        <div class="flex justify-between items-center">
            <span>📊 ${dateRange} 期間：${teacher.name} 共 ${sortedCourses.length} 門課程</span>
            <span>📅 最新課程：${sortedCourses[0] ? formatDate(sortedCourses[0].date) : '無'}</span>
        </div>
        <div class="text-xs text-blue-600 mt-1">
            師資總課程數：${teacher.courses.length} 門 | 選定期間課程數：${sortedCourses.length} 門
        </div>
    `;
    timeline.appendChild(statsDiv);

    // 顯示課程列表
    sortedCourses.forEach((course) => {
        const timelineItem = createTimelineItem(course, teacher);
        timeline.appendChild(timelineItem);
    });
}

// 創建時間軸項目
function createTimelineItem(course, teacher) {
    const timelineItem = document.createElement('div');
    timelineItem.className = 'glass-effect rounded-xl p-4 card-hover';

    const hours = calculateHours(course.time);
    const courseStatus = getCourseStatus(course.date, course.time);
    const { status, color: statusColor, icon: statusIcon, text: statusText } = courseStatus;

    const typeColors = {
        '正課': 'bg-blue-100 text-blue-800',
        '補課': 'bg-yellow-100 text-yellow-800',
        '實驗課': 'bg-purple-100 text-purple-800',
        '實作課': 'bg-green-100 text-green-800',
        '專題': 'bg-red-100 text-red-800'
    };
    const typeColor = typeColors[course.type] || 'bg-gray-100 text-gray-800';

    const realIndex = teacher.courses.findIndex(c =>
        c.date === course.date &&
        c.time === course.time &&
        c.subject === course.subject
    );

    timelineItem.innerHTML = `
        <div class="flex items-start justify-between">
            <div class="flex-grow">
                <div class="flex items-center space-x-2 mb-2">
                    <h4 class="course-title text-lg font-semibold text-gray-800 cursor-pointer hover:text-blue-600 transition-colors" data-index="${realIndex}" title="點擊編輯課程名稱">${course.subject}</h4>
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${typeColor}">${course.type}</span>
                    <span class="px-2 py-1 text-xs font-medium rounded-full text-white ${statusColor}">${statusIcon} ${statusText}</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-gray-600">
                    <div class="flex items-center space-x-1">
                        <span class="text-blue-500">🕐</span>
                        <span class="text-xs">${course.time}</span>
                    </div>
                    <div class="flex items-center space-x-1">
                        <span class="text-green-500">⏱️</span>
                        <span class="text-xs">${hours.toFixed(1)}小時</span>
                    </div>
                    <div class="flex items-center space-x-1">
                        <span class="text-orange-500">📅</span>
                        <span class="text-xs">${formatDate(course.date)}</span>
                    </div>
                </div>
            </div>
            <div class="flex space-x-1 ml-4">
                <button class="edit-course-btn p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors" data-index="${realIndex}" title="編輯課程">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                    </svg>
                </button>
                <button class="delete-course-btn p-1 text-red-500 hover:bg-red-50 rounded transition-colors" data-index="${realIndex}" title="刪除課程">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            </div>
        </div>
    `;

    return timelineItem;
}

// 創建師資列表
function createTeachersList() {
    const teachersList = document.getElementById('teachersList');
    teachersList.innerHTML = '';

    Object.keys(teachersData).forEach(teacherId => {
        const teacher = teachersData[teacherId];
        const isCurrentTeacher = teacherId === state.currentTeacher;

        const teacherItem = document.createElement('div');
        teacherItem.className = `glass-effect p-4 rounded-xl transition-all cursor-pointer card-hover ${
            isCurrentTeacher ? 'ring-2 ring-blue-400' : ''
        }`;

        teacherItem.innerHTML = `
            <div class="text-center" onclick="selectTeacher('${teacherId}')">
                <div class="w-12 h-12 mx-auto mb-2 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                    ${teacher.avatar ? `<img src="${teacher.avatar}" alt="師資照片" class="w-full h-full object-cover">` : '<span class="text-gray-500 text-lg">👤</span>'}
                </div>
                <h4 class="font-semibold text-gray-800 text-sm">${teacher.name}</h4>
                <p class="text-xs text-gray-600 mb-2">${teacher.specialty}</p>
                <p class="text-xs text-gray-500">${teacher.courses.length} 門課程</p>
                ${isCurrentTeacher ? '<div class="mt-2 px-2 py-1 bg-blue-100 text-blue-600 rounded-full text-xs">當前選擇</div>' : ''}
            </div>
            <div class="flex justify-center space-x-2 mt-3">
                <button onclick="event.stopPropagation(); editTeacher('${teacherId}')" class="p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors" title="編輯師資">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                    </svg>
                </button>
                <button onclick="event.stopPropagation(); confirmDeleteTeacher('${teacherId}')" class="p-1 text-red-500 hover:bg-red-50 rounded transition-colors" title="刪除師資">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            </div>
        `;

        teachersList.appendChild(teacherItem);
    });
}

// 更新模態框中的師資資訊
function updateModalTeacherInfo() {
    const teacher = teachersData[state.currentTeacher];
    if (!teacher) return;

    const modalAvatar = document.getElementById('modalTeacherAvatar');
    if (teacher.avatar) {
        modalAvatar.innerHTML = `<img src="${teacher.avatar}" alt="師資照片" class="w-8 h-8 rounded-full object-cover">`;
    } else {
        modalAvatar.innerHTML = '<div class="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-sm">👤</div>';
    }

    document.getElementById('modalTeacherName').textContent = teacher.name;
    document.getElementById('modalTeacherSpecialty').textContent = teacher.specialty;

    const now = new Date();
    const monthlyHours = calculateMonthlyHours(state.currentTeacher, now.getFullYear(), now.getMonth());
    const percentage = Math.min((monthlyHours / 12) * 100, 100);

    const modalHoursBar = document.getElementById('modalHoursBar');
    const modalHoursText = document.getElementById('modalMonthlyHours');

    modalHoursBar.style.width = `${percentage}%`;
    modalHoursText.textContent = `${monthlyHours.toFixed(1)}/12 小時`;

    if (monthlyHours >= 12) {
        modalHoursBar.className = 'bg-red-500 h-2 rounded-full transition-all duration-500';
        modalHoursText.className = 'text-xs text-red-600 font-medium';
    } else if (monthlyHours >= 10) {
        modalHoursBar.className = 'bg-yellow-500 h-2 rounded-full transition-all duration-500';
        modalHoursText.className = 'text-xs text-yellow-600 font-medium';
    } else {
        modalHoursBar.className = 'bg-blue-500 h-2 rounded-full transition-all duration-500';
        modalHoursText.className = 'text-xs text-gray-600';
    }
}
