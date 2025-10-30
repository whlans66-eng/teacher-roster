// ==================== 主應用程式模組 ====================

// ==================== 模態框控制 ====================

function toggleModal(modalId) {
    const modal = document.getElementById(modalId);
    const isHidden = modal.classList.contains('hidden');

    if (isHidden) {
        if (modalId === 'addCourseModal' && (!state.currentTeacher || !teachersData[state.currentTeacher])) {
            showMessage('請先選擇或新增師資！', 'warning');
            return;
        }

        if (modalId === 'addCourseModal') {
            updateModalTeacherInfo();
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('courseDate').value = today;
        }

        if (modalId === 'addTeacherModal') {
            document.getElementById('teacherForm').reset();
            document.getElementById('avatarPreview').innerHTML = '<span class="text-gray-500 text-sm group-hover:text-blue-500">點擊上傳</span>';
        }

        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    } else {
        modal.classList.add('hidden');
        modal.style.display = 'none';

        if (modalId === 'addCourseModal') {
            document.getElementById('courseForm').reset();
        }
        if (modalId === 'addTeacherModal') {
            document.getElementById('teacherForm').reset();
        }
    }
}

// ==================== 師資操作 ====================

function selectTeacher(teacherId) {
    state.currentTeacher = teacherId;
    document.getElementById('teacherSelect').value = teacherId;
    saveData();
    updateAllViews();
    showMessage(`已切換到 ${teachersData[teacherId].name}`, 'success');
}

function editTeacher(teacherId = state.currentTeacher) {
    const teacher = teachersData[teacherId];

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.id = 'editTeacherModal';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <h3 class="text-2xl font-bold text-gray-800 mb-6">✏️ 編輯師資</h3>
            <form id="editTeacherForm" class="space-y-4">
                <div class="text-center mb-6">
                    <label class="block text-sm font-semibold text-gray-700 mb-3">師資大頭貼</label>
                    <div class="flex justify-center">
                        <div id="editAvatarPreview" class="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden border-3 border-gray-300 cursor-pointer hover:border-purple-400 hover:bg-gray-100 transition-all duration-200 group shadow-lg">
                            ${teacher.avatar ? `<img src="${teacher.avatar}" alt="師資照片" class="w-full h-full object-cover group-hover:opacity-80">` : '<span class="text-gray-500 text-sm group-hover:text-purple-500">點擊上傳</span>'}
                        </div>
                        <input type="file" id="editTeacherAvatar" accept="image/*" class="hidden">
                    </div>
                    <p class="text-xs text-gray-500 mt-2">支援 JPG、PNG 格式 • 點擊大頭貼更換</p>
                </div>

                <div class="space-y-2">
                    <label class="block text-sm font-semibold text-gray-700">師資姓名</label>
                    <input type="text" id="editTeacherName" value="${teacher.name}" class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" required>
                </div>

                <div class="space-y-2">
                    <label class="block text-sm font-semibold text-gray-700">專業領域</label>
                    <input type="text" id="editTeacherSpecialty" value="${teacher.specialty}" class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" required>
                </div>

                <div class="flex justify-end space-x-4 pt-4">
                    <button type="button" onclick="closeEditModal()" class="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors">
                        取消
                    </button>
                    <button type="submit" class="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-medium transition-colors">
                        確認修改
                    </button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    // 大頭貼預覽
    document.getElementById('editAvatarPreview').onclick = () => {
        document.getElementById('editTeacherAvatar').click();
    };

    document.getElementById('editTeacherAvatar').addEventListener('change', function(e) {
        const file = e.target.files[0];
        const preview = document.getElementById('editAvatarPreview');

        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                preview.innerHTML = `<img src="${e.target.result}" alt="預覽" class="w-full h-full object-cover group-hover:opacity-80">`;
            };
            reader.readAsDataURL(file);
        }
    });

    // 表單提交
    document.getElementById('editTeacherForm').addEventListener('submit', function(e) {
        e.preventDefault();

        const updatedName = document.getElementById('editTeacherName').value;
        const updatedSpecialty = document.getElementById('editTeacherSpecialty').value;

        if (!updatedName || !updatedSpecialty) {
            showMessage('請填寫師資姓名和專業領域！', 'error');
            return;
        }

        const avatarFile = document.getElementById('editTeacherAvatar').files[0];
        if (avatarFile) {
            const reader = new FileReader();
            reader.onload = function(e) {
                updateTeacher(teacherId, {
                    name: updatedName,
                    specialty: updatedSpecialty,
                    avatar: e.target.result
                });
                closeEditModal();
                updateAllViews();
                showMessage('師資資料修改成功！', 'success');
            };
            reader.readAsDataURL(avatarFile);
        } else {
            updateTeacher(teacherId, {
                name: updatedName,
                specialty: updatedSpecialty
            });
            closeEditModal();
            updateAllViews();
            showMessage('師資資料修改成功！', 'success');
        }
    });
}

function confirmDeleteTeacher(teacherId) {
    const teacher = teachersData[teacherId];

    if (document.querySelector('.delete-teacher-modal')) {
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'delete-teacher-modal fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div class="text-center mb-6">
                <div class="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                    <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </div>
                <h3 class="text-xl font-bold text-gray-800 mb-2">確認刪除師資</h3>
                <p class="text-gray-600">
                    確定要刪除 <strong>${teacher.name}</strong> 嗎？
                    ${teacher.courses.length > 0 ? `<br><span class="text-red-600">⚠️ 此師資還有 ${teacher.courses.length} 門課程，刪除後課程資料也會一併移除。</span>` : ''}
                </p>
            </div>

            <div class="flex justify-end space-x-4">
                <button class="cancel-delete px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors">
                    取消
                </button>
                <button class="confirm-delete px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors">
                    確認刪除
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.cancel-delete').addEventListener('click', () => {
        modal.remove();
    });

    modal.querySelector('.confirm-delete').addEventListener('click', () => {
        modal.remove();
        const remainingTeachers = deleteTeacher(teacherId);

        if (remainingTeachers === 0) {
            clearAllViews();
            showMessage('所有師資已刪除！', 'success');
        } else {
            updateAllViews();
            showMessage('師資刪除成功！', 'success');
        }
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// ==================== 課程操作 ====================

function editCourse(index) {
    const teacher = teachersData[state.currentTeacher];
    const course = teacher.courses[index];

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.id = 'editCourseModal';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <h3 class="text-2xl font-bold text-gray-800 mb-6">✏️ 編輯課程</h3>
            <form id="editCourseForm" class="space-y-4">
                <div class="space-y-2">
                    <label class="block text-sm font-semibold text-gray-700">課程名稱</label>
                    <input type="text" id="editCourseName" value="${course.subject}" class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <label class="block text-sm font-semibold text-gray-700">課程日期</label>
                        <input type="date" id="editCourseDate" value="${course.date}" class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                    </div>

                    <div class="space-y-2">
                        <label class="block text-sm font-semibold text-gray-700">課程類型</label>
                        <select id="editCourseType" class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            <option value="正課" ${course.type === '正課' ? 'selected' : ''}>正課</option>
                            <option value="補課" ${course.type === '補課' ? 'selected' : ''}>補課</option>
                            <option value="實驗課" ${course.type === '實驗課' ? 'selected' : ''}>實驗課</option>
                            <option value="實作課" ${course.type === '實作課' ? 'selected' : ''}>實作課</option>
                            <option value="專題" ${course.type === '專題' ? 'selected' : ''}>專題</option>
                        </select>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <label class="block text-sm font-semibold text-gray-700">開始時間</label>
                        <input type="time" id="editStartTime" value="${course.time.split('-')[0]}" class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                    </div>

                    <div class="space-y-2">
                        <label class="block text-sm font-semibold text-gray-700">結束時間</label>
                        <input type="time" id="editEndTime" value="${course.time.split('-')[1]}" class="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                    </div>
                </div>

                <div class="flex justify-end space-x-4 pt-4">
                    <button type="button" onclick="closeEditModal()" class="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors">
                        取消
                    </button>
                    <button type="submit" class="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors">
                        確認修改
                    </button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('editCourseForm').addEventListener('submit', function(e) {
        e.preventDefault();

        const updatedCourse = {
            subject: document.getElementById('editCourseName').value,
            date: document.getElementById('editCourseDate').value,
            time: `${document.getElementById('editStartTime').value}-${document.getElementById('editEndTime').value}`,
            type: document.getElementById('editCourseType').value,
            students: course.students,
            status: course.status
        };

        if (!updatedCourse.subject || !updatedCourse.date) {
            showMessage('請填寫所有必填欄位！', 'error');
            return;
        }

        if (document.getElementById('editStartTime').value >= document.getElementById('editEndTime').value) {
            showMessage('結束時間必須晚於開始時間！', 'error');
            return;
        }

        updateCourse(state.currentTeacher, index, updatedCourse);
        closeEditModal();
        updateAllViews();
        showMessage('課程修改成功！', 'success');
    });
}

function editCourseName(index) {
    const teacher = teachersData[state.currentTeacher];
    const course = teacher.courses[index];

    const newName = prompt('請輸入新的課程名稱：', course.subject);
    if (newName && newName.trim() !== '' && newName !== course.subject) {
        updateCourse(state.currentTeacher, index, { ...course, subject: newName.trim() });
        updateAllViews();
        showMessage('課程名稱修改成功！', 'success');
    }
}

function handleDeleteCourse(index) {
    const teacher = teachersData[state.currentTeacher];
    const courseName = teacher.courses[index].subject;

    if (confirm(`確定要刪除課程「${courseName}」嗎？`)) {
        deleteCourse(state.currentTeacher, index);
        updateAllViews();
        showMessage(`課程「${courseName}」已刪除`, 'success');
    }
}

function closeEditModal() {
    const modals = document.querySelectorAll('.fixed.inset-0');
    modals.forEach(modal => {
        if (modal.id === 'editCourseModal' || modal.id === 'editTeacherModal') {
            modal.remove();
        }
    });
}

// ==================== 事件監聽器設置 ====================

function setupEventListeners() {
    // 師資選擇變更
    document.getElementById('teacherSelect').addEventListener('change', (e) => {
        state.currentTeacher = e.target.value;
        saveData();
        updateAllViews();
        showMessage(`已切換到 ${teachersData[state.currentTeacher].name}`, 'success');
    });

    // 日期範圍變更
    document.getElementById('startDate').addEventListener('change', (e) => {
        state.currentStartDate = e.target.value;
        saveData();
        updateAllViews();
        showMessage('日期範圍已更新', 'success');
    });

    document.getElementById('endDate').addEventListener('change', (e) => {
        state.currentEndDate = e.target.value;
        saveData();
        updateAllViews();
        showMessage('日期範圍已更新', 'success');
    });

    // 日期範圍快速選擇按鈕
    document.querySelectorAll('.date-range-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const range = e.target.dataset.range;
            const rangeName = setDateRange(range);
            updateAllViews();
            showMessage(`已切換到${rangeName}資料`, 'success');
        });
    });

    // 更新視圖按鈕
    document.getElementById('updateView').addEventListener('click', function() {
        const button = this;
        const originalText = button.innerHTML;
        button.innerHTML = '🔄 更新中...';
        button.disabled = true;

        setTimeout(() => {
            updateAllViews();
            button.innerHTML = originalText;
            button.disabled = false;
            showMessage('資料已更新！', 'success');
        }, 800);
    });

    // 新增課程按鈕
    document.getElementById('addCourseBtn').addEventListener('click', () => {
        toggleModal('addCourseModal');
    });

    // 新增師資按鈕
    document.getElementById('addTeacherBtn').addEventListener('click', () => {
        toggleModal('addTeacherModal');
    });

    // 課程表單提交
    document.getElementById('courseForm').addEventListener('submit', (e) => {
        e.preventDefault();

        const courseData = {
            name: document.getElementById('courseName').value,
            date: document.getElementById('courseDate').value,
            startTime: document.getElementById('startTime').value,
            endTime: document.getElementById('endTime').value,
            type: document.getElementById('courseType').value
        };

        if (!courseData.name || !courseData.date || !courseData.startTime || !courseData.endTime) {
            showMessage('請填寫所有必填欄位！', 'error');
            return;
        }

        if (courseData.startTime >= courseData.endTime) {
            showMessage('結束時間必須晚於開始時間！', 'error');
            return;
        }

        addCourse(courseData);
        updateAllViews();
        showMessage(`已為 ${teachersData[state.currentTeacher].name} 新增課程：${courseData.name}`, 'success');
        toggleModal('addCourseModal');
    });

    // 師資表單提交
    document.getElementById('teacherForm').addEventListener('submit', (e) => {
        e.preventDefault();

        const teacherData = {
            name: document.getElementById('teacherName').value,
            specialty: document.getElementById('teacherSpecialty').value,
            avatar: null
        };

        if (!teacherData.name || !teacherData.specialty) {
            showMessage('請填寫師資姓名和專業領域！', 'error');
            return;
        }

        const avatarFile = document.getElementById('teacherAvatar').files[0];
        if (avatarFile) {
            const reader = new FileReader();
            reader.onload = (e) => {
                teacherData.avatar = e.target.result;
                addTeacher(teacherData);
                updateAllViews();
                showMessage(`師資 ${teacherData.name} 新增成功！已自動切換`, 'success');
                toggleModal('addTeacherModal');
            };
            reader.readAsDataURL(avatarFile);
        } else {
            addTeacher(teacherData);
            updateAllViews();
            showMessage(`師資 ${teacherData.name} 新增成功！已自動切換`, 'success');
            toggleModal('addTeacherModal');
        }
    });

    // 取消按鈕
    document.getElementById('cancelAdd').addEventListener('click', () => {
        toggleModal('addCourseModal');
    });

    document.getElementById('cancelTeacherAdd').addEventListener('click', () => {
        toggleModal('addTeacherModal');
    });

    // 大頭貼預覽
    document.getElementById('avatarPreview').addEventListener('click', () => {
        document.getElementById('teacherAvatar').click();
    });

    document.getElementById('teacherAvatar').addEventListener('change', (e) => {
        const file = e.target.files[0];
        const preview = document.getElementById('avatarPreview');

        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `<img src="${e.target.result}" alt="預覽" class="w-full h-full object-cover group-hover:opacity-80">`;
            };
            reader.readAsDataURL(file);
        } else {
            preview.innerHTML = '<span class="text-gray-500 text-sm group-hover:text-blue-500">點擊上傳</span>';
        }
    });

    // 模態框背景點擊關閉
    document.getElementById('addCourseModal').addEventListener('click', (e) => {
        if (e.target.id === 'addCourseModal') {
            toggleModal('addCourseModal');
        }
    });

    document.getElementById('addTeacherModal').addEventListener('click', (e) => {
        if (e.target.id === 'addTeacherModal') {
            toggleModal('addTeacherModal');
        }
    });

    // 時間軸按鈕事件委派
    document.getElementById('timeline').addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-course-btn');
        const deleteBtn = e.target.closest('.delete-course-btn');
        const courseTitle = e.target.closest('.course-title');

        if (editBtn) {
            const index = parseInt(editBtn.dataset.index);
            editCourse(index);
        } else if (deleteBtn) {
            const index = parseInt(deleteBtn.dataset.index);
            handleDeleteCourse(index);
        } else if (courseTitle) {
            const index = parseInt(courseTitle.dataset.index);
            editCourseName(index);
        }
    });
}

// ==================== 應用程式初始化 ====================

function initializeApp() {
    loadData();
    initializeDates();
    setupEventListeners();
    updateAllViews();
    showMessage('師資派課管理系統已載入完成！', 'success');
}

// 當 DOM 載入完成後執行初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
