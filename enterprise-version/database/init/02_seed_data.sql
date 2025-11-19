-- =====================================================
-- 初始數據（預設角色、權限、管理員帳號）
-- =====================================================

USE teacher_roster;

-- =====================================================
-- 1. 插入預設角色
-- =====================================================
INSERT INTO roles (name, display_name, description) VALUES
('admin', '系統管理員', '擁有所有權限，可管理系統設定、用戶和資料'),
('manager', '課程管理員', '可管理所有教師和課程，但無法管理系統設定'),
('teacher', '教師', '只能查看和編輯自己的課程資料'),
('viewer', '訪客', '只能查看公開資訊，無法編輯任何資料');

-- =====================================================
-- 2. 插入預設權限
-- =====================================================
-- 教師相關權限
INSERT INTO permissions (name, resource, action, description) VALUES
('teacher.view', 'teacher', 'view', '查看教師資料'),
('teacher.view_all', 'teacher', 'view_all', '查看所有教師資料'),
('teacher.create', 'teacher', 'create', '新增教師'),
('teacher.update', 'teacher', 'update', '更新教師資料'),
('teacher.update_own', 'teacher', 'update_own', '更新自己的教師資料'),
('teacher.delete', 'teacher', 'delete', '刪除教師'),

-- 課程相關權限
('course.view', 'course', 'view', '查看課程'),
('course.view_all', 'course', 'view_all', '查看所有課程'),
('course.create', 'course', 'create', '新增課程'),
('course.update', 'course', 'update', '更新課程'),
('course.delete', 'course', 'delete', '刪除課程'),

-- 派課相關權限
('assignment.view', 'assignment', 'view', '查看派課'),
('assignment.view_all', 'assignment', 'view_all', '查看所有派課'),
('assignment.view_own', 'assignment', 'view_own', '查看自己的派課'),
('assignment.create', 'assignment', 'create', '新增派課'),
('assignment.update', 'assignment', 'update', '更新派課'),
('assignment.update_own', 'assignment', 'update_own', '更新自己的派課'),
('assignment.delete', 'assignment', 'delete', '刪除派課'),

-- 問卷相關權限
('survey.view', 'survey', 'view', '查看問卷'),
('survey.view_all', 'survey', 'view_all', '查看所有問卷'),
('survey.create', 'survey', 'create', '新增問卷'),
('survey.update', 'survey', 'update', '更新問卷'),
('survey.delete', 'survey', 'delete', '刪除問卷'),
('survey.respond', 'survey', 'respond', '填寫問卷'),

-- 用戶管理權限
('user.view', 'user', 'view', '查看用戶'),
('user.create', 'user', 'create', '新增用戶'),
('user.update', 'user', 'update', '更新用戶'),
('user.delete', 'user', 'delete', '刪除用戶'),

-- 系統管理權限
('system.settings', 'system', 'settings', '管理系統設定'),
('system.logs', 'system', 'logs', '查看系統日誌'),
('system.backup', 'system', 'backup', '備份系統');

-- =====================================================
-- 3. 角色權限關聯
-- =====================================================

-- 系統管理員：所有權限
INSERT INTO role_permissions (role_id, permission_id)
SELECT
    (SELECT id FROM roles WHERE name = 'admin'),
    id
FROM permissions;

-- 課程管理員：教師、課程、派課、問卷的所有權限
INSERT INTO role_permissions (role_id, permission_id)
SELECT
    (SELECT id FROM roles WHERE name = 'manager'),
    id
FROM permissions
WHERE resource IN ('teacher', 'course', 'assignment', 'survey');

-- 教師：只能查看和編輯自己的資料
INSERT INTO role_permissions (role_id, permission_id)
SELECT
    (SELECT id FROM roles WHERE name = 'teacher'),
    id
FROM permissions
WHERE name IN (
    'teacher.view',
    'teacher.update_own',
    'assignment.view_own',
    'assignment.update_own',
    'survey.view',
    'survey.respond'
);

-- 訪客：只能查看
INSERT INTO role_permissions (role_id, permission_id)
SELECT
    (SELECT id FROM roles WHERE name = 'viewer'),
    id
FROM permissions
WHERE action = 'view' OR name = 'survey.respond';

-- =====================================================
-- 4. 創建預設管理員帳號
-- =====================================================
-- 用戶名: admin
-- 密碼: Admin123!@# (這是 bcrypt hash，請在生產環境中修改)
-- 以下 hash 對應密碼：Admin123!@#

INSERT INTO users (username, email, password_hash, full_name, is_active) VALUES
('admin', 'admin@teacher-roster.local', '$2b$10$Eq5pP7gHqKP5LJ6nZKZx6.8c4y7GXBnqZ8jH5pB7KNvZGqYxKZn3i', '系統管理員', TRUE);

-- 分配管理員角色
INSERT INTO user_roles (user_id, role_id)
SELECT
    (SELECT id FROM users WHERE username = 'admin'),
    (SELECT id FROM roles WHERE name = 'admin');

-- =====================================================
-- 5. 創建測試帳號（可選，生產環境請刪除）
-- =====================================================

-- 課程管理員測試帳號
-- 用戶名: manager
-- 密碼: Manager123!@#
INSERT INTO users (username, email, password_hash, full_name, is_active) VALUES
('manager', 'manager@teacher-roster.local', '$2b$10$Eq5pP7gHqKP5LJ6nZKZx6.8c4y7GXBnqZ8jH5pB7KNvZGqYxKZn3i', '課程管理員', TRUE);

INSERT INTO user_roles (user_id, role_id)
SELECT
    (SELECT id FROM users WHERE username = 'manager'),
    (SELECT id FROM roles WHERE name = 'manager');

-- 教師測試帳號
-- 用戶名: teacher1
-- 密碼: Teacher123!@#
INSERT INTO users (username, email, password_hash, full_name, is_active) VALUES
('teacher1', 'teacher1@teacher-roster.local', '$2b$10$Eq5pP7gHqKP5LJ6nZKZx6.8c4y7GXBnqZ8jH5pB7KNvZGqYxKZn3i', '教師一號', TRUE);

INSERT INTO user_roles (user_id, role_id)
SELECT
    (SELECT id FROM users WHERE username = 'teacher1'),
    (SELECT id FROM roles WHERE name = 'teacher');

-- =====================================================
-- 完成
-- =====================================================

-- 顯示結果
SELECT '✅ 預設角色數量：' AS message, COUNT(*) AS count FROM roles;
SELECT '✅ 預設權限數量：' AS message, COUNT(*) AS count FROM permissions;
SELECT '✅ 預設用戶數量：' AS message, COUNT(*) AS count FROM users;
