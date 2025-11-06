-- =====================================================
-- 教師排課系統 - 資料庫架構
-- =====================================================
-- 這個腳本會在 Docker 容器啟動時自動執行
-- 包含：用戶、角色、權限、老師、課程、問卷、操作日誌
-- =====================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

USE teacher_roster;

-- =====================================================
-- 1. 用戶表 (users)
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '用戶名（用於登入）',
    email VARCHAR(100) NOT NULL UNIQUE COMMENT '電子郵件',
    password_hash VARCHAR(255) NOT NULL COMMENT '密碼雜湊值（bcrypt）',
    full_name VARCHAR(100) COMMENT '真實姓名',
    is_active BOOLEAN DEFAULT TRUE COMMENT '帳號是否啟用',
    last_login_at TIMESTAMP NULL COMMENT '最後登入時間',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用戶表';

-- =====================================================
-- 2. 角色表 (roles)
-- =====================================================
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE COMMENT '角色名稱',
    display_name VARCHAR(100) COMMENT '顯示名稱',
    description TEXT COMMENT '角色描述',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色表';

-- =====================================================
-- 3. 權限表 (permissions)
-- =====================================================
CREATE TABLE IF NOT EXISTS permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE COMMENT '權限名稱（如：teacher.view, course.create）',
    resource VARCHAR(50) NOT NULL COMMENT '資源名稱（如：teacher, course）',
    action VARCHAR(50) NOT NULL COMMENT '動作（如：view, create, update, delete）',
    description TEXT COMMENT '權限描述',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_resource (resource)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='權限表';

-- =====================================================
-- 4. 用戶角色關聯表 (user_roles)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    role_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_role (user_id, role_id),
    INDEX idx_user_id (user_id),
    INDEX idx_role_id (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用戶角色關聯表';

-- =====================================================
-- 5. 角色權限關聯表 (role_permissions)
-- =====================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
    UNIQUE KEY unique_role_permission (role_id, permission_id),
    INDEX idx_role_id (role_id),
    INDEX idx_permission_id (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色權限關聯表';

-- =====================================================
-- 6. 教師表 (teachers)
-- =====================================================
CREATE TABLE IF NOT EXISTS teachers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL COMMENT '關聯的用戶 ID（如果老師有登入帳號）',
    name VARCHAR(100) NOT NULL COMMENT '教師姓名',
    email VARCHAR(100) COMMENT '電子郵件',
    teacher_type ENUM('full_time', 'part_time', 'adjunct') DEFAULT 'full_time' COMMENT '教師類型',
    work_location VARCHAR(100) COMMENT '工作地點',
    photo_url VARCHAR(255) COMMENT '照片 URL',
    experiences JSON COMMENT '經歷（JSON 陣列）',
    certificates JSON COMMENT '證照（JSON 陣列）',
    subjects JSON COMMENT '授課科目（JSON 陣列）',
    tags JSON COMMENT '標籤（JSON 陣列）',
    is_active BOOLEAN DEFAULT TRUE COMMENT '是否在職',
    version INT DEFAULT 0 COMMENT '版本號（用於樂觀鎖）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT COMMENT '創建者 user_id',
    updated_by INT COMMENT '最後更新者 user_id',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_name (name),
    INDEX idx_teacher_type (teacher_type),
    INDEX idx_is_active (is_active),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='教師表';

-- =====================================================
-- 7. 課程表 (courses)
-- =====================================================
CREATE TABLE IF NOT EXISTS courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL COMMENT '課程名稱',
    category VARCHAR(50) COMMENT '課程類別',
    method ENUM('online', 'offline', 'hybrid') DEFAULT 'offline' COMMENT '授課方式',
    description TEXT COMMENT '課程描述',
    keywords JSON COMMENT '關鍵字（JSON 陣列）',
    is_active BOOLEAN DEFAULT TRUE COMMENT '是否啟用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_category (category),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='課程表';

-- =====================================================
-- 8. 派課表 (course_assignments)
-- =====================================================
CREATE TABLE IF NOT EXISTS course_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL COMMENT '教師 ID',
    course_id INT NULL COMMENT '課程 ID（如果有關聯）',
    course_name VARCHAR(200) NOT NULL COMMENT '課程名稱',
    course_date DATE NOT NULL COMMENT '上課日期',
    start_time TIME NOT NULL COMMENT '開始時間',
    end_time TIME NOT NULL COMMENT '結束時間',
    course_type ENUM('regular', 'makeup', 'lab', 'practice', 'project') DEFAULT 'regular' COMMENT '課程類型',
    status ENUM('scheduled', 'in_progress', 'completed', 'cancelled') DEFAULT 'scheduled' COMMENT '課程狀態',
    student_count INT DEFAULT 0 COMMENT '學生人數',
    note TEXT COMMENT '備註',
    version INT DEFAULT 0 COMMENT '版本號（用於樂觀鎖）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT COMMENT '創建者 user_id',
    updated_by INT COMMENT '最後更新者 user_id',
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_teacher_id (teacher_id),
    INDEX idx_course_date (course_date),
    INDEX idx_status (status),
    INDEX idx_teacher_date (teacher_id, course_date),
    -- 防止同一老師在同一時間有多個課程
    UNIQUE KEY unique_teacher_time (teacher_id, course_date, start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='派課表';

-- =====================================================
-- 9. 問卷模板表 (survey_templates)
-- =====================================================
CREATE TABLE IF NOT EXISTS survey_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL COMMENT '模板名稱',
    description TEXT COMMENT '模板描述',
    questions JSON NOT NULL COMMENT '問題（JSON 陣列）',
    is_active BOOLEAN DEFAULT TRUE COMMENT '是否啟用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT COMMENT '創建者 user_id',
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_name (name),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='問卷模板表';

-- =====================================================
-- 10. 問卷表 (surveys)
-- =====================================================
CREATE TABLE IF NOT EXISTS surveys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_id INT NOT NULL COMMENT '問卷模板 ID',
    assignment_id INT NULL COMMENT '關聯的派課 ID',
    course_name VARCHAR(200) COMMENT '課程名稱',
    course_date DATE COMMENT '上課日期',
    teacher_id INT COMMENT '教師 ID',
    teacher_name VARCHAR(100) COMMENT '教師姓名',
    status ENUM('draft', 'active', 'closed', 'archived') DEFAULT 'draft' COMMENT '問卷狀態',
    share_url VARCHAR(255) COMMENT '分享連結',
    expires_at TIMESTAMP NULL COMMENT '到期時間',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT COMMENT '創建者 user_id',
    FOREIGN KEY (template_id) REFERENCES survey_templates(id) ON DELETE CASCADE,
    FOREIGN KEY (assignment_id) REFERENCES course_assignments(id) ON DELETE SET NULL,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_expires_at (expires_at),
    INDEX idx_teacher_id (teacher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='問卷表';

-- =====================================================
-- 11. 問卷回應表 (survey_responses)
-- =====================================================
CREATE TABLE IF NOT EXISTS survey_responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    survey_id INT NOT NULL COMMENT '問卷 ID',
    respondent_name VARCHAR(100) COMMENT '填答者姓名',
    respondent_email VARCHAR(100) COMMENT '填答者郵箱',
    answers JSON NOT NULL COMMENT '答案（JSON 陣列）',
    ip_address VARCHAR(45) COMMENT 'IP 位址',
    user_agent TEXT COMMENT '瀏覽器資訊',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
    INDEX idx_survey_id (survey_id),
    INDEX idx_submitted_at (submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='問卷回應表';

-- =====================================================
-- 12. 操作日誌表 (audit_logs)
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT COMMENT '操作者 user_id',
    username VARCHAR(50) COMMENT '操作者用戶名',
    action VARCHAR(50) NOT NULL COMMENT '操作動作（如：CREATE, UPDATE, DELETE）',
    resource VARCHAR(50) NOT NULL COMMENT '資源類型（如：teacher, course）',
    resource_id INT COMMENT '資源 ID',
    details JSON COMMENT '詳細資訊（JSON）',
    ip_address VARCHAR(45) COMMENT 'IP 位址',
    user_agent TEXT COMMENT '瀏覽器資訊',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_resource (resource),
    INDEX idx_resource_id (resource_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日誌表';

-- =====================================================
-- 13. Session 表 (sessions) - 可選
-- =====================================================
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id INT COMMENT '用戶 ID',
    data TEXT COMMENT 'Session 資料',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Session 表';

-- =====================================================
-- 完成
-- =====================================================
