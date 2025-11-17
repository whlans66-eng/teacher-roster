-- =====================================================
-- Microsoft Fabric Warehouse Schema
-- =====================================================
-- 這是從 MySQL 轉換到 Fabric Warehouse (T-SQL) 的 Schema
-- 使用說明：
-- 1. 登入 Fabric Portal (https://fabric.microsoft.com)
-- 2. 開啟您的 Warehouse
-- 3. 在 SQL Query Editor 中執行此腳本
-- =====================================================

-- =====================================================
-- 使用者與權限資料表
-- =====================================================
CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(50) NOT NULL UNIQUE,
    email NVARCHAR(100) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    full_name NVARCHAR(100),
    role NVARCHAR(20) NOT NULL DEFAULT 'user', -- 'admin', 'teacher', 'user'
    is_active BIT NOT NULL DEFAULT 1,
    last_login DATETIME2,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- =====================================================
-- 教師資料表
-- =====================================================
CREATE TABLE teachers (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT,
    employee_id NVARCHAR(20) UNIQUE,
    name NVARCHAR(100) NOT NULL,
    name_en NVARCHAR(100),
    email NVARCHAR(100) UNIQUE NOT NULL,
    phone NVARCHAR(20),
    department NVARCHAR(100),
    title NVARCHAR(50), -- '教授', '副教授', '助理教授', '講師'
    specialty NVARCHAR(500), -- 專長領域（可用 JSON 格式）
    office_location NVARCHAR(100),
    office_hours NVARCHAR(200),
    max_teaching_hours INT DEFAULT 18, -- 每週最大授課時數
    is_active BIT NOT NULL DEFAULT 1,
    hire_date DATE,
    notes NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================
-- 課程資料表
-- =====================================================
CREATE TABLE courses (
    id INT IDENTITY(1,1) PRIMARY KEY,
    course_code NVARCHAR(20) NOT NULL UNIQUE,
    course_name NVARCHAR(200) NOT NULL,
    course_name_en NVARCHAR(200),
    department NVARCHAR(100),
    credits INT NOT NULL,
    course_type NVARCHAR(20), -- '必修', '選修', '通識'
    semester NVARCHAR(20) NOT NULL, -- '1121', '1122' (year + semester)
    year INT NOT NULL, -- 學年度
    term INT NOT NULL, -- 學期 (1=上學期, 2=下學期)
    max_students INT DEFAULT 60,
    min_students INT DEFAULT 10,
    description NVARCHAR(MAX),
    syllabus_url NVARCHAR(500),
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- =====================================================
-- 教師排課資料表 (核心功能)
-- =====================================================
CREATE TABLE assignments (
    id INT IDENTITY(1,1) PRIMARY KEY,
    teacher_id INT NOT NULL,
    course_id INT NOT NULL,
    class_code NVARCHAR(10), -- 班級代號 (例如: A, B, C)

    -- 上課時間（可用 JSON 格式儲存多個時段）
    class_time NVARCHAR(MAX), -- 例如: '一1-2,三3-4'
    class_days NVARCHAR(50), -- '一,三' (星期一、三)
    class_periods NVARCHAR(50), -- '1-2,3-4' (第1-2節, 第3-4節)

    classroom NVARCHAR(50),
    building NVARCHAR(50),
    capacity INT,

    -- 狀態管理
    status NVARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled'
    assigned_by INT, -- 指派者 user_id
    assigned_at DATETIME2,
    confirmed_by INT, -- 確認者 user_id
    confirmed_at DATETIME2,

    notes NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),

    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id),
    FOREIGN KEY (confirmed_by) REFERENCES users(id)
);

-- =====================================================
-- 問卷調查資料表
-- =====================================================
CREATE TABLE surveys (
    id INT IDENTITY(1,1) PRIMARY KEY,
    title NVARCHAR(200) NOT NULL,
    description NVARCHAR(MAX),
    semester NVARCHAR(20) NOT NULL,
    start_date DATETIME2 NOT NULL,
    end_date DATETIME2 NOT NULL,
    is_active BIT NOT NULL DEFAULT 1,
    created_by INT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),

    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- =====================================================
-- 問卷回應資料表
-- =====================================================
CREATE TABLE survey_responses (
    id INT IDENTITY(1,1) PRIMARY KEY,
    survey_id INT NOT NULL,
    teacher_id INT NOT NULL,
    course_id INT,
    preference_level INT, -- 1-5 (1=不想教, 5=非常想教)
    availability NVARCHAR(MAX), -- JSON 格式的時間可用性
    comments NVARCHAR(MAX),
    submitted_at DATETIME2 NOT NULL DEFAULT GETDATE(),

    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id)
);

-- =====================================================
-- 審計日誌資料表
-- =====================================================
CREATE TABLE audit_logs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT,
    action NVARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'LOGIN'
    table_name NVARCHAR(50),
    record_id INT,
    old_data NVARCHAR(MAX), -- JSON
    new_data NVARCHAR(MAX), -- JSON
    ip_address NVARCHAR(45),
    user_agent NVARCHAR(500),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================
-- 建立索引以提升查詢效能
-- =====================================================

-- Users 索引
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Teachers 索引
CREATE INDEX idx_teachers_user_id ON teachers(user_id);
CREATE INDEX idx_teachers_employee_id ON teachers(employee_id);
CREATE INDEX idx_teachers_email ON teachers(email);
CREATE INDEX idx_teachers_department ON teachers(department);

-- Courses 索引
CREATE INDEX idx_courses_code ON courses(course_code);
CREATE INDEX idx_courses_semester ON courses(semester);
CREATE INDEX idx_courses_year_term ON courses(year, term);
CREATE INDEX idx_courses_department ON courses(department);

-- Assignments 索引
CREATE INDEX idx_assignments_teacher ON assignments(teacher_id);
CREATE INDEX idx_assignments_course ON assignments(course_id);
CREATE INDEX idx_assignments_status ON assignments(status);
CREATE INDEX idx_assignments_teacher_course ON assignments(teacher_id, course_id);

-- Surveys 索引
CREATE INDEX idx_surveys_semester ON surveys(semester);
CREATE INDEX idx_surveys_active ON surveys(is_active);
CREATE INDEX idx_surveys_dates ON surveys(start_date, end_date);

-- Survey Responses 索引
CREATE INDEX idx_responses_survey ON survey_responses(survey_id);
CREATE INDEX idx_responses_teacher ON survey_responses(teacher_id);
CREATE INDEX idx_responses_course ON survey_responses(course_id);

-- Audit Logs 索引
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_table ON audit_logs(table_name);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- =====================================================
-- 建立視圖（View）方便查詢
-- =====================================================

-- 1. 教師排課總覽
GO
CREATE VIEW v_teacher_assignments AS
SELECT
    a.id AS assignment_id,
    t.id AS teacher_id,
    t.name AS teacher_name,
    t.department AS teacher_department,
    c.course_code,
    c.course_name,
    c.credits,
    c.semester,
    a.class_code,
    a.class_time,
    a.classroom,
    a.status,
    a.created_at
FROM assignments a
INNER JOIN teachers t ON a.teacher_id = t.id
INNER JOIN courses c ON a.course_id = c.id
WHERE a.status != 'cancelled';
GO

-- 2. 教師授課時數統計
GO
CREATE VIEW v_teacher_workload AS
SELECT
    t.id AS teacher_id,
    t.name AS teacher_name,
    t.department,
    t.max_teaching_hours,
    COUNT(DISTINCT a.course_id) AS course_count,
    SUM(c.credits) AS total_credits,
    SUM(c.credits) * 1.0 / t.max_teaching_hours AS workload_ratio
FROM teachers t
LEFT JOIN assignments a ON t.id = a.teacher_id AND a.status = 'confirmed'
LEFT JOIN courses c ON a.course_id = c.id
GROUP BY t.id, t.name, t.department, t.max_teaching_hours;
GO

-- 3. 課程開課狀態
GO
CREATE VIEW v_course_status AS
SELECT
    c.id AS course_id,
    c.course_code,
    c.course_name,
    c.semester,
    c.credits,
    c.max_students,
    COUNT(a.id) AS assigned_teachers,
    STRING_AGG(t.name, ', ') AS teacher_names
FROM courses c
LEFT JOIN assignments a ON c.id = a.course_id AND a.status != 'cancelled'
LEFT JOIN teachers t ON a.teacher_id = t.id
GROUP BY c.id, c.course_code, c.course_name, c.semester, c.credits, c.max_students;
GO

-- =====================================================
-- 插入初始資料
-- =====================================================

-- 建立預設管理員帳號
INSERT INTO users (username, email, password_hash, full_name, role)
VALUES
    ('admin', 'admin@school.edu.tw', '$2b$10$...(bcrypt hash)', '系統管理員', 'admin'),
    ('teacher1', 'teacher1@school.edu.tw', '$2b$10$...', '王大明', 'teacher');

-- 建立範例教師
INSERT INTO teachers (user_id, employee_id, name, email, department, title)
VALUES
    (2, 'T001', '王大明', 'teacher1@school.edu.tw', '資訊工程系', '副教授'),
    (NULL, 'T002', '李小華', 'teacher2@school.edu.tw', '資訊工程系', '助理教授');

-- 建立範例課程
INSERT INTO courses (course_code, course_name, department, credits, semester, year, term, course_type)
VALUES
    ('CS101', '計算機概論', '資訊工程系', 3, '1131', 113, 1, '必修'),
    ('CS201', '資料結構', '資訊工程系', 3, '1131', 113, 1, '必修'),
    ('CS301', '演算法', '資訊工程系', 3, '1131', 113, 1, '選修');

-- =====================================================
-- 建立更新時間自動觸發器（Fabric Warehouse 不支援）
-- =====================================================
-- 注意：Fabric Warehouse 目前不支援 Trigger
-- 需要在應用程式層級處理 updated_at 欄位的更新

-- =====================================================
-- 完成提示
-- =====================================================
-- SELECT '✅ Fabric Warehouse Schema 建立完成！' AS status;
-- SELECT '📊 資料表數量：' AS info, COUNT(*) AS count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE';
-- SELECT '👁️ 視圖數量：' AS info, COUNT(*) AS count FROM INFORMATION_SCHEMA.VIEWS;
-- SELECT '📇 索引數量：' AS info, COUNT(*) AS count FROM sys.indexes WHERE is_primary_key = 0 AND is_unique_constraint = 0;

-- =====================================================
-- 查詢範例
-- =====================================================

-- 1. 查看所有教師及其授課數
-- SELECT * FROM v_teacher_workload ORDER BY total_credits DESC;

-- 2. 查看某學期所有排課
-- SELECT * FROM v_teacher_assignments WHERE semester = '1131' ORDER BY teacher_name;

-- 3. 查看衝堂檢查
-- SELECT class_time, class_days, classroom, COUNT(*) as conflict_count
-- FROM assignments
-- WHERE status = 'confirmed' AND classroom IS NOT NULL
-- GROUP BY class_time, class_days, classroom
-- HAVING COUNT(*) > 1;

-- 4. 查看教師可用時段
-- SELECT t.name, sr.availability, sr.comments
-- FROM survey_responses sr
-- JOIN teachers t ON sr.teacher_id = t.id
-- WHERE sr.survey_id = 1;
