// ==================== 增強版資料管理模組 ====================
// 整合 teachers, courseAssignments, calendarEvents

// 師資課程數據
const teachersData = {};

// 課程派課數據
let courseAssignments = [];

// 行事曆事件數據
let calendarEvents = [];

// 狀態管理
const state = {
    currentTeacher: null,
    currentStartDate: null,
    currentEndDate: null,
    courseTypeChart: null
};

// ==================== 資料初始化 ====================

function initializeData() {
    // 從 localStorage 載入資料
    const savedTeachers = localStorage.getItem('teachers');
    const savedCourseAssignments = localStorage.getItem('courseAssignments');
    const savedCalendarEvents = localStorage.getItem('calendarEvents');

    // 載入師資資料（從舊系統轉換）
    if (savedTeachers) {
        const teachersArray = JSON.parse(savedTeachers);
        teachersArray.forEach(teacher => {
            const teacherId = `teacher${teacher.id}`;
            teachersData[teacherId] = {
                id: teacher.id,
                name: teacher.name,
                specialty: teacher.specialty || '專業師資',
                avatar: teacher.avatar || null,
                location: teacher.location || 'onboard',
                type: teacher.type || 'internal',
                courses: []
            };
        });
    }

    // 載入課程派課資料
    if (savedCourseAssignments) {
        courseAssignments = JSON.parse(savedCourseAssignments);
        // 將課程分配到對應師資
        courseAssignments.forEach(course => {
            const teacherId = `teacher${course.teacherId}`;
            if (teachersData[teacherId]) {
                teachersData[teacherId].courses.push({
                    date: course.date,
                    time: course.time,
                    subject: course.name,
                    students: 25,
                    type: course.type,
                    status: 'completed',
                    id: course.id
                });
            }
        });
    }

    // 載入行事曆資料
    if (savedCalendarEvents) {
        calendarEvents = JSON.parse(savedCalendarEvents);
    }

    // 如果沒有資料，使用預設資料
    if (Object.keys(teachersData).length === 0) {
        loadDefaultData();
    }

    // 設定當前師資
    const firstTeacherId = Object.keys(teachersData)[0];
    if (firstTeacherId) {
        state.currentTeacher = firstTeacherId;
    }
}

function loadDefaultData() {
    // 載入預設測試資料（之前的 teachersData）
    Object.assign(teachersData, {
        teacher1: {
            id: 1,
            name: '王小明老師',
            specialty: '數理專家',
            avatar: null,
            location: 'onboard',
            type: 'internal',
            courses: [
                { date: '2024-01-15', time: '09:00-11:00', subject: '高等數學', students: 25, type: '正課', status: 'completed', id: Date.now() + 1 },
                { date: '2024-01-15', time: '14:00-16:00', subject: '物理實驗', students: 20, type: '實驗課', status: 'completed', id: Date.now() + 2 }
            ]
        }
    });
}

// ==================== 儲存函數 ====================

function saveData() {
    try {
        // 轉換 teachersData 回陣列格式存儲（兼容舊系統）
        const teachersArray = Object.values(teachersData).map(teacher => ({
            id: teacher.id || parseInt(Object.keys(teachersData).find(k => teachersData[k] === teacher).replace('teacher', '')),
            name: teacher.name,
            specialty: teacher.specialty,
            avatar: teacher.avatar,
            location: teacher.location,
            type: teacher.type
        }));

        localStorage.setItem('teachers', JSON.stringify(teachersArray));
        localStorage.setItem('courseAssignments', JSON.stringify(courseAssignments));
        localStorage.setItem('calendarEvents', JSON.stringify(calendarEvents));
        localStorage.setItem('currentTeacher', state.currentTeacher);
        localStorage.setItem('currentStartDate', state.currentStartDate);
        localStorage.setItem('currentEndDate', state.currentEndDate);

        console.log('資料已儲存到本地儲存');
    } catch (error) {
        console.error('儲存資料失敗:', error);
        showMessage('資料儲存失敗！', 'error');
    }
}

// ==================== 課程操作 ====================

function addCourse(courseData) {
    const teacher = teachersData[state.currentTeacher];
    if (!teacher) return null;

    const teacherId = teacher.id;

    // 檢查衝堂
    const conflicts = checkTeacherConflict(
        teacherId,
        courseData.date,
        courseData.startTime,
        courseData.endTime
    );

    if (conflicts.length > 0) {
        const conflictMessages = conflicts.map(c =>
            `- ${c.name} (${c.time}) [${c.type}] 來源：${c.source}`
        ).join('\n');

        const confirmMessage = `⚠️ 衝堂警告！\n\n該老師在此時段已有以下課程：\n${conflictMessages}\n\n是否仍要繼續派課？`;

        if (!confirm(confirmMessage)) {
            return null;
        }
    }

    const courseId = Date.now();
    const timeRange = `${courseData.startTime}-${courseData.endTime}`;

    // 新增到 courseAssignments
    const newCourseAssignment = {
        id: courseId,
        teacherId: teacherId,
        name: courseData.name,
        date: courseData.date,
        time: timeRange,
        type: courseData.type
    };
    courseAssignments.push(newCourseAssignment);

    // 新增到 teachersData
    const courseStatus = getCourseStatus(courseData.date, timeRange);
    const newCourse = {
        date: courseData.date,
        time: timeRange,
        subject: courseData.name,
        students: 25,
        type: courseData.type,
        status: courseStatus.status,
        id: courseId
    };
    teacher.courses.push(newCourse);

    // 同步到行事曆
    const calendarEvent = {
        id: courseId,
        date: courseData.date,
        title: `${courseData.name} - ${teacher.name}`,
        time: timeRange,
        teacherId: teacherId,
        location: courseData.type,
        note: `課程類型：${courseData.type}`,
        color: getCourseTypeColor(courseData.type),
        courseId: courseId
    };
    calendarEvents.push(calendarEvent);

    saveData();
    return newCourse;
}

function updateCourse(teacherId, courseIndex, courseData) {
    const teacher = teachersData[teacherId];
    const course = teacher.courses[courseIndex];
    const oldCourseId = course.id;

    // 更新 teachersData
    Object.assign(course, courseData);

    // 更新 courseAssignments
    const assignmentIndex = courseAssignments.findIndex(c => c.id === oldCourseId);
    if (assignmentIndex !== -1) {
        courseAssignments[assignmentIndex] = {
            ...courseAssignments[assignmentIndex],
            name: courseData.subject,
            date: courseData.date,
            time: courseData.time,
            type: courseData.type
        };
    }

    // 更新 calendarEvents
    const eventIndex = calendarEvents.findIndex(e => e.courseId === oldCourseId);
    if (eventIndex !== -1) {
        const teacherObj = Object.values(teachersData).find(t => `teacher${t.id}` === teacherId);
        calendarEvents[eventIndex] = {
            ...calendarEvents[eventIndex],
            title: `${courseData.subject} - ${teacherObj.name}`,
            date: courseData.date,
            time: courseData.time,
            location: courseData.type,
            note: `課程類型：${courseData.type}`,
            color: getCourseTypeColor(courseData.type)
        };
    }

    saveData();
}

function deleteCourse(teacherId, courseIndex) {
    const teacher = teachersData[teacherId];
    const course = teacher.courses[courseIndex];
    const courseId = course.id;

    // 從 teachersData 刪除
    const deletedCourse = teacher.courses.splice(courseIndex, 1)[0];

    // 從 courseAssignments 刪除
    const assignmentIndex = courseAssignments.findIndex(c => c.id === courseId);
    if (assignmentIndex !== -1) {
        courseAssignments.splice(assignmentIndex, 1);
    }

    // 從 calendarEvents 刪除
    const eventIndex = calendarEvents.findIndex(e => e.courseId === courseId);
    if (eventIndex !== -1) {
        calendarEvents.splice(eventIndex, 1);
    }

    saveData();
    return deletedCourse;
}

// ==================== 師資操作 ====================

function addTeacher(teacherData) {
    const newId = Math.max(...Object.values(teachersData).map(t => t.id || 0), 0) + 1;
    const teacherId = `teacher${newId}`;

    teachersData[teacherId] = {
        id: newId,
        name: teacherData.name,
        specialty: teacherData.specialty,
        avatar: teacherData.avatar,
        location: teacherData.location || 'onboard',
        type: teacherData.type || 'internal',
        courses: []
    };

    state.currentTeacher = teacherId;
    saveData();
    return teacherId;
}

function updateTeacher(teacherId, teacherData) {
    const teacher = teachersData[teacherId];
    teacher.name = teacherData.name;
    teacher.specialty = teacherData.specialty;
    if (teacherData.avatar !== undefined) {
        teacher.avatar = teacherData.avatar;
    }
    if (teacherData.location) {
        teacher.location = teacherData.location;
    }
    if (teacherData.type) {
        teacher.type = teacherData.type;
    }
    saveData();
}

function deleteTeacher(teacherId) {
    const teacher = teachersData[teacherId];
    const teacherIdNum = teacher.id;

    // 刪除相關課程
    courseAssignments = courseAssignments.filter(c => c.teacherId !== teacherIdNum);
    calendarEvents = calendarEvents.filter(e => e.teacherId !== teacherIdNum);

    // 刪除師資
    delete teachersData[teacherId];

    const remainingTeachers = Object.keys(teachersData);
    if (remainingTeachers.length === 0) {
        state.currentTeacher = null;
    } else if (teacherId === state.currentTeacher) {
        state.currentTeacher = remainingTeachers[0];
    }

    saveData();
    return remainingTeachers.length;
}

// ==================== 衝堂檢查 ====================

function checkTeacherConflict(teacherId, date, startTime, endTime) {
    const conflicts = [];

    const timeToMinutes = (timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    };

    const newStart = timeToMinutes(startTime);
    const newEnd = timeToMinutes(endTime);

    // 檢查派課管理中的課程
    courseAssignments.forEach(course => {
        if (course.teacherId === teacherId && course.date === date) {
            const [courseStart, courseEnd] = course.time.split('-');
            const existingStart = timeToMinutes(courseStart);
            const existingEnd = timeToMinutes(courseEnd);

            if (!(newEnd <= existingStart || newStart >= existingEnd)) {
                conflicts.push({
                    name: course.name,
                    time: course.time,
                    type: course.type,
                    source: '派課管理'
                });
            }
        }
    });

    // 檢查行事曆中的事件
    calendarEvents.forEach(event => {
        if (event.teacherId === teacherId && event.date === date && event.time) {
            const timeParts = event.time.split('-');
            if (timeParts.length === 2) {
                const [eventStart, eventEnd] = timeParts;
                const existingStart = timeToMinutes(eventStart);
                const existingEnd = timeToMinutes(eventEnd);

                if (!event.courseId && !(newEnd <= existingStart || newStart >= existingEnd)) {
                    conflicts.push({
                        name: event.title,
                        time: event.time,
                        type: event.location || '行事曆事件',
                        source: '行事曆'
                    });
                }
            }
        }
    });

    return conflicts;
}

// ==================== 工具函數 ====================

function getCourseTypeColor(type) {
    const colorMap = {
        '正課': '#007aff',
        '補課': '#ff9500',
        '實驗課': '#5856d6',
        '實作課': '#34c759',
        '專題': '#ff2d55'
    };
    return colorMap[type] || '#8e8e93';
}

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
