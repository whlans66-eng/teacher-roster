// ==================== 資料管理模組 ====================

// 師資課程數據
const teachersData = {
    teacher1: {
        name: '王小明老師',
        specialty: '數理專家',
        avatar: null,
        courses: [
            // 2024年1月
            { date: '2024-01-15', time: '09:00-11:00', subject: '高等數學', students: 25, type: '正課', status: 'completed' },
            { date: '2024-01-15', time: '14:00-16:00', subject: '物理實驗', students: 20, type: '實驗課', status: 'completed' },
            { date: '2024-01-16', time: '10:00-12:00', subject: '微積分', students: 22, type: '補課', status: 'completed' },
            { date: '2024-01-17', time: '09:00-10:30', subject: '線性代數', students: 18, type: '正課', status: 'completed' },
            { date: '2024-01-18', time: '13:00-15:00', subject: '統計學', students: 24, type: '正課', status: 'completed' },
            { date: '2024-01-19', time: '15:00-17:00', subject: '機率論', students: 26, type: '正課', status: 'completed' },
            { date: '2024-01-20', time: '10:00-12:00', subject: '數學建模', students: 15, type: '專題', status: 'completed' },
            // 2023年12月
            { date: '2023-12-05', time: '09:00-11:00', subject: '高等數學', students: 28, type: '正課', status: 'completed' },
            { date: '2023-12-08', time: '14:00-16:00', subject: '物理實驗', students: 22, type: '實驗課', status: 'completed' },
            { date: '2023-12-12', time: '10:00-12:00', subject: '微積分', students: 25, type: '正課', status: 'completed' },
            { date: '2023-12-15', time: '09:00-10:30', subject: '線性代數', students: 20, type: '補課', status: 'completed' },
            { date: '2023-12-18', time: '13:00-15:00', subject: '統計學', students: 27, type: '正課', status: 'completed' },
            { date: '2023-12-22', time: '15:00-17:00', subject: '機率論', students: 24, type: '正課', status: 'completed' },
            // 2023年11月
            { date: '2023-11-03', time: '09:00-11:00', subject: '高等數學', students: 26, type: '正課', status: 'completed' },
            { date: '2023-11-07', time: '14:00-16:00', subject: '物理實驗', students: 21, type: '實驗課', status: 'completed' },
            { date: '2023-11-10', time: '10:00-12:00', subject: '微積分', students: 23, type: '正課', status: 'completed' },
            { date: '2023-11-14', time: '09:00-10:30', subject: '線性代數', students: 19, type: '正課', status: 'completed' },
            { date: '2023-11-17', time: '13:00-15:00', subject: '統計學', students: 25, type: '補課', status: 'completed' },
            { date: '2023-11-21', time: '15:00-17:00', subject: '機率論', students: 28, type: '正課', status: 'completed' },
            { date: '2023-11-24', time: '10:00-12:00', subject: '數學建模', students: 16, type: '專題', status: 'completed' },
            // 2023年10月
            { date: '2023-10-02', time: '09:00-11:00', subject: '高等數學', students: 24, type: '正課', status: 'completed' },
            { date: '2023-10-05', time: '14:00-16:00', subject: '物理實驗', students: 20, type: '實驗課', status: 'completed' },
            { date: '2023-10-09', time: '10:00-12:00', subject: '微積分', students: 22, type: '正課', status: 'completed' },
            { date: '2023-10-12', time: '09:00-10:30', subject: '線性代數', students: 18, type: '正課', status: 'completed' },
            { date: '2023-10-16', time: '13:00-15:00', subject: '統計學', students: 26, type: '正課', status: 'completed' },
            { date: '2023-10-19', time: '15:00-17:00', subject: '機率論', students: 25, type: '補課', status: 'completed' },
            { date: '2023-10-23', time: '10:00-12:00', subject: '數學建模', students: 17, type: '專題', status: 'completed' },
            { date: '2023-10-26', time: '14:00-16:00', subject: '應用數學', students: 23, type: '實作課', status: 'completed' }
        ]
    },
    teacher2: {
        name: '李美華老師',
        specialty: '語言大師',
        avatar: null,
        courses: [
            { date: '2024-01-15', time: '08:00-10:00', subject: '商用英文', students: 30, type: '正課', status: 'completed' },
            { date: '2024-01-16', time: '14:00-16:00', subject: '英語會話', students: 28, type: '正課', status: 'completed' },
            { date: '2024-01-17', time: '10:00-12:00', subject: 'TOEIC準備', students: 25, type: '補課', status: 'ongoing' },
            { date: '2024-01-18', time: '09:00-11:00', subject: '學術寫作', students: 32, type: '正課', status: 'upcoming' },
            { date: '2024-01-19', time: '16:00-18:00', subject: '英語演講', students: 20, type: '實作課', status: 'upcoming' }
        ]
    },
    teacher3: {
        name: '張志強老師',
        specialty: '商管菁英',
        avatar: null,
        courses: [
            { date: '2024-01-15', time: '13:00-15:00', subject: '企業管理', students: 35, type: '正課', status: 'completed' },
            { date: '2024-01-16', time: '09:00-11:00', subject: '行銷策略', students: 28, type: '正課', status: 'completed' },
            { date: '2024-01-17', time: '15:00-17:00', subject: '財務分析', students: 22, type: '正課', status: 'ongoing' },
            { date: '2024-01-18', time: '11:00-13:00', subject: '專案管理', students: 30, type: '實作課', status: 'upcoming' }
        ]
    },
    teacher4: {
        name: '陳雅婷老師',
        specialty: '科學達人',
        avatar: null,
        courses: [
            { date: '2024-01-15', time: '10:00-12:00', subject: '有機化學', students: 24, type: '正課', status: 'completed' },
            { date: '2024-01-16', time: '13:00-15:00', subject: '生物實驗', students: 18, type: '實驗課', status: 'completed' },
            { date: '2024-01-17', time: '08:00-10:00', subject: '分析化學', students: 26, type: '正課', status: 'ongoing' },
            { date: '2024-01-18', time: '14:00-16:00', subject: '環境科學', students: 20, type: '正課', status: 'upcoming' }
        ]
    }
};

// 狀態管理
const state = {
    currentTeacher: 'teacher1',
    currentStartDate: null,
    currentEndDate: null,
    courseTypeChart: null
};

// 儲存資料到本地儲存
function saveData() {
    try {
        localStorage.setItem('teachersData', JSON.stringify(teachersData));
        localStorage.setItem('currentTeacher', state.currentTeacher);
        localStorage.setItem('currentStartDate', state.currentStartDate);
        localStorage.setItem('currentEndDate', state.currentEndDate);
        console.log('資料已儲存到本地儲存');
    } catch (error) {
        console.error('儲存資料失敗:', error);
        showMessage('資料儲存失敗！', 'error');
    }
}

// 從本地儲存載入資料
function loadData() {
    try {
        const savedTeachersData = localStorage.getItem('teachersData');
        const savedCurrentTeacher = localStorage.getItem('currentTeacher');
        const savedStartDate = localStorage.getItem('currentStartDate');
        const savedEndDate = localStorage.getItem('currentEndDate');

        if (savedTeachersData) {
            const parsedData = JSON.parse(savedTeachersData);
            Object.assign(teachersData, parsedData);
            console.log('已載入儲存的師資資料');
        }

        if (savedCurrentTeacher && teachersData[savedCurrentTeacher]) {
            state.currentTeacher = savedCurrentTeacher;
            console.log('已載入當前師資:', state.currentTeacher);
        }

        if (savedStartDate && savedEndDate) {
            state.currentStartDate = savedStartDate;
            state.currentEndDate = savedEndDate;
            console.log('已載入日期範圍:', state.currentStartDate, '到', state.currentEndDate);
        }

        return true;
    } catch (error) {
        console.error('載入資料失敗:', error);
        showMessage('載入儲存資料失敗，使用預設資料', 'warning');
        return false;
    }
}

// 新增課程
function addCourse(courseData) {
    const teacher = teachersData[state.currentTeacher];

    // 檢查新增課程後的時數限制
    const newCourseHours = calculateHours(`${courseData.startTime}-${courseData.endTime}`);
    const courseDate = new Date(courseData.date);
    const currentMonthlyHours = calculateMonthlyHours(state.currentTeacher, courseDate.getFullYear(), courseDate.getMonth());
    const totalHoursAfterAdd = currentMonthlyHours + newCourseHours;

    // 時數警告
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
        status: courseStatus.status
    };

    teacher.courses.push(newCourse);
    saveData();
    return newCourse;
}

// 新增師資
function addTeacher(teacherData) {
    const teacherId = `teacher${Object.keys(teachersData).length + 1}`;
    teachersData[teacherId] = {
        name: teacherData.name,
        specialty: teacherData.specialty,
        avatar: teacherData.avatar,
        courses: []
    };

    state.currentTeacher = teacherId;
    saveData();
    return teacherId;
}

// 刪除師資
function deleteTeacher(teacherId) {
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

// 更新師資資訊
function updateTeacher(teacherId, teacherData) {
    const teacher = teachersData[teacherId];
    teacher.name = teacherData.name;
    teacher.specialty = teacherData.specialty;
    if (teacherData.avatar !== undefined) {
        teacher.avatar = teacherData.avatar;
    }
    saveData();
}

// 更新課程資訊
function updateCourse(teacherId, courseIndex, courseData) {
    const teacher = teachersData[teacherId];
    const course = teacher.courses[courseIndex];
    Object.assign(course, courseData);
    saveData();
}

// 刪除課程
function deleteCourse(teacherId, courseIndex) {
    const teacher = teachersData[teacherId];
    const deletedCourse = teacher.courses.splice(courseIndex, 1)[0];
    saveData();
    return deletedCourse;
}
