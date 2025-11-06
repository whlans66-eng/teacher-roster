/**
 * 從 Google Sheets 遷移資料到 MySQL
 * 使用方式：node database/migrate-from-sheets.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

// Google Sheets API URL（你原本的後端）
const GOOGLE_SHEETS_API = 'https://script.google.com/macros/s/AKfycbwEoOzYF23XzhMib48grCmPeV8szx-qFWtPA-aejR-Z8ULL1QyNmAWGRXh5RJAg4d-QgA/exec';
const TOKEN = 'tr_demo_12345';

async function fetchFromGoogleSheets(action, table = null) {
  const url = new URL(GOOGLE_SHEETS_API);
  url.searchParams.append('token', TOKEN);
  url.searchParams.append('action', action);
  if (table) {
    url.searchParams.append('table', table);
  }

  console.log(`📥 正在從 Google Sheets 取得 ${table || 'all'} 資料...`);

  const response = await fetch(url.toString());
  const result = await response.json();

  if (!result.ok) {
    throw new Error(`Google Sheets API 錯誤: ${result.error}`);
  }

  return result.data;
}

async function migrateData() {
  let connection;

  try {
    console.log('🚀 開始資料遷移...\n');

    // 連接 MySQL
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'roster_user',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'teacher_roster',
    });

    console.log('✅ MySQL 連線成功\n');

    // 1. 遷移教師資料
    console.log('📋 Step 1: 遷移教師資料...');
    const teachers = await fetchFromGoogleSheets('list', 'teachers');
    console.log(`   找到 ${teachers.length} 筆教師資料`);

    for (const teacher of teachers) {
      await connection.execute(
        `INSERT INTO teachers
         (name, email, teacher_type, work_location, photo_url,
          experiences, certificates, subjects, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         email = VALUES(email),
         teacher_type = VALUES(teacher_type),
         work_location = VALUES(work_location),
         photo_url = VALUES(photo_url),
         experiences = VALUES(experiences),
         certificates = VALUES(certificates),
         subjects = VALUES(subjects),
         tags = VALUES(tags)`,
        [
          teacher.name,
          teacher.email || null,
          teacher.teacherType || 'full_time',
          teacher.workLocation || null,
          teacher.photoUrl || teacher.photo || null,
          JSON.stringify(teacher.experiences || []),
          JSON.stringify(teacher.certificates || []),
          JSON.stringify(teacher.subjects || []),
          JSON.stringify(teacher.tags || []),
        ]
      );
    }
    console.log('   ✅ 教師資料遷移完成\n');

    // 2. 遷移課程資料
    console.log('📋 Step 2: 遷移海事課程資料...');
    const maritimeCourses = await fetchFromGoogleSheets('list', 'maritimeCourses');
    console.log(`   找到 ${maritimeCourses.length} 筆課程資料`);

    for (const course of maritimeCourses) {
      await connection.execute(
        `INSERT INTO courses
         (name, category, method, description, keywords)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         category = VALUES(category),
         method = VALUES(method),
         description = VALUES(description),
         keywords = VALUES(keywords)`,
        [
          course.name,
          course.category || null,
          course.method || 'offline',
          course.description || null,
          JSON.stringify(course.keywords || []),
        ]
      );
    }
    console.log('   ✅ 課程資料遷移完成\n');

    // 3. 遷移派課資料
    console.log('📋 Step 3: 遷移派課資料...');
    const courseAssignments = await fetchFromGoogleSheets('list', 'courseAssignments');
    console.log(`   找到 ${courseAssignments.length} 筆派課資料`);

    for (const assignment of courseAssignments) {
      // 查找對應的教師 ID
      const [teacherRows] = await connection.execute(
        'SELECT id FROM teachers WHERE name = ? LIMIT 1',
        [assignment.name || assignment.teacherName]
      );

      if (teacherRows.length === 0) {
        console.log(`   ⚠️ 找不到教師 ${assignment.name}，跳過此派課`);
        continue;
      }

      const teacherId = teacherRows[0].id;

      // 解析時間
      const timeParts = (assignment.time || '').split('-');
      if (timeParts.length !== 2) {
        console.log(`   ⚠️ 時間格式錯誤：${assignment.time}，跳過此派課`);
        continue;
      }

      const [startTime, endTime] = timeParts;

      try {
        await connection.execute(
          `INSERT INTO course_assignments
           (teacher_id, course_name, course_date, start_time, end_time,
            course_type, status, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            teacherId,
            assignment.courseName || assignment.subject || '未命名課程',
            assignment.date,
            startTime.trim(),
            endTime.trim(),
            assignment.type || 'regular',
            assignment.status || 'scheduled',
            assignment.note || null,
          ]
        );
      } catch (error) {
        // 如果是重複資料（衝突），跳過
        if (error.code === 'ER_DUP_ENTRY') {
          console.log(`   ⚠️ 重複的派課資料，跳過`);
        } else {
          throw error;
        }
      }
    }
    console.log('   ✅ 派課資料遷移完成\n');

    // 4. 遷移問卷資料（如果有）
    try {
      console.log('📋 Step 4: 遷移問卷資料...');
      const surveyTemplates = await fetchFromGoogleSheets('list', 'surveyTemplates');
      console.log(`   找到 ${surveyTemplates.length} 筆問卷模板`);

      for (const template of surveyTemplates) {
        await connection.execute(
          `INSERT INTO survey_templates
           (name, description, questions)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE
           description = VALUES(description),
           questions = VALUES(questions)`,
          [
            template.name,
            template.description || null,
            JSON.stringify(template.questions || []),
          ]
        );
      }
      console.log('   ✅ 問卷資料遷移完成\n');
    } catch (error) {
      console.log('   ⚠️ 問卷資料不存在或遷移失敗，跳過\n');
    }

    console.log('🎉 資料遷移完成！\n');

    // 顯示統計
    const [teacherCount] = await connection.execute('SELECT COUNT(*) as count FROM teachers');
    const [courseCount] = await connection.execute('SELECT COUNT(*) as count FROM courses');
    const [assignmentCount] = await connection.execute('SELECT COUNT(*) as count FROM course_assignments');

    console.log('📊 資料庫統計：');
    console.log(`   • 教師數量：${teacherCount[0].count}`);
    console.log(`   • 課程數量：${courseCount[0].count}`);
    console.log(`   • 派課數量：${assignmentCount[0].count}`);
    console.log();

  } catch (error) {
    console.error('❌ 遷移失敗:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 執行遷移
migrateData();
