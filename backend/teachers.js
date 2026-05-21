/**
 * teachers - 師資管理 API
 *
 * 師資主檔
 * GET    /api/teachers           - 列出所有師資（含子表快取欄位）
 * GET    /api/teachers/{id}      - 取得完整師資資料（含所有子表）
 * POST   /api/teachers           - 新增師資（含子表）
 * PUT    /api/teachers/{id}      - 更新師資（完整替換子表）
 * DELETE /api/teachers/{id}      - 刪除師資（CASCADE 刪子表）
 *
 * 請假紀錄
 * GET    /api/teacher-leaves     - 列表（?teacherId=X&month=YYYY-MM）
 * POST   /api/teacher-leaves     - 新增
 * DELETE /api/teacher-leaves/{id} - 刪除
 *
 * 派課管理
 * GET    /api/course-assignments  - 列表（?teacherId=X&start=Y&end=Z）
 * POST   /api/course-assignments  - 新增
 * DELETE /api/course-assignments/{id} - 刪除
 *
 * 行事曆
 * GET    /api/calendar-events     - 列表（?year=YYYY&month=MM）
 * POST   /api/calendar-events     - 新增
 * PUT    /api/calendar-events/{id} - 更新
 * DELETE /api/calendar-events/{id} - 刪除
 *
 * 海事課程
 * GET    /api/maritime-courses    - 列表（含關鍵字）
 * POST   /api/maritime-courses    - 新增
 * PUT    /api/maritime-courses/{id} - 更新
 * DELETE /api/maritime-courses/{id} - 刪除
 *
 * 權限規則
 *   讀取：allowed（superAdmin / admin / allowedUser）
 *   寫入：isAdmin（superAdmin / admin）
 */
const { app } = require('@azure/functions');
const { getConnection, sql, SCHEMA } = require('./sys_database');
const { validateRequest, getCorsHeaders } = require('./sys_permissions');

// ─────────────────────────────────────────────────────────────
//  Helper：共用回應工廠
// ─────────────────────────────────────────────────────────────

function ok(data, headers)     { return { status: 200, headers, jsonBody: data }; }
function created(data, headers){ return { status: 201, headers, jsonBody: data }; }
function badReq(msg, headers)  { return { status: 400, headers, jsonBody: { error: msg } }; }
function forbidden(headers)    { return { status: 403, headers, jsonBody: { error: '權限不足' } }; }
function notFound(headers)     { return { status: 404, headers, jsonBody: { error: '資料不存在' } }; }
function serverErr(msg, headers){ return { status: 500, headers, jsonBody: { error: msg || '操作失敗，請聯絡系統管理員' } }; }

// ─────────────────────────────────────────────────────────────
//  Helper：前端 ↔ DB 欄位轉換
// ─────────────────────────────────────────────────────────────

/** 將前端師資物件解構為 DB 欄位 + 各子陣列 */
function parseTeacherBody(body) {
    const teacher = {
        id:               Number(body.id) || Date.now(),
        name:             String(body.name || '').trim(),
        email:            body.email   ? String(body.email).trim()  : null,
        teacher_type:     body.teacherType   === 'external' ? 'external' : 'internal',
        work_location:    body.workLocation  === 'onboard'  ? 'onboard'  : 'onshore',
        teacher_category: body.teacherCategory || null,
        rank:             body.rank     ? String(body.rank).trim()   : null,
        photo_url:        body.photo    ? String(body.photo).trim()  : null,
    };

    const experiences = (body.experiences || [])
        .map((e, i) => ({ content: String(e || '').trim(), sort_order: i }))
        .filter(e => e.content);

    const certificates = (body.certificates || [])
        .map((c, i) => ({
            name:       typeof c === 'string' ? c.trim() : String(c.name || '').trim(),
            file_name:  typeof c === 'object' ? (c.fileName || null) : null,
            file_url:   typeof c === 'object' ? (c.fileUrl  || null) : null,
            sort_order: i,
        }))
        .filter(c => c.name);

    const subjects = (body.subjects || []).map((s, i) => {
        const name = typeof s === 'string' ? s.trim() : String(s.name || '').trim();
        const materials = (typeof s === 'object' ? s.materials || [] : []).map((m, j) => ({
            file_name:  String(m.fileName || '').trim(),
            file_url:   String(m.fileUrl  || '').trim(),
            file_type:  String(m.fileType || '').trim(),
            sort_order: j,
        })).filter(m => m.file_url);
        return { name, sort_order: i, materials };
    }).filter(s => s.name);

    const tags = (body.tags || [])
        .map((t, i) => ({ tag: String(t || '').trim(), sort_order: i }))
        .filter(t => t.tag);

    return { teacher, experiences, certificates, subjects, tags };
}

/** 將 DB 列轉為前端格式 */
function formatTeacher(row) {
    return {
        id:              row.id,
        name:            row.name,
        email:           row.email || '',
        teacherType:     row.teacher_type,
        workLocation:    row.work_location,
        teacherCategory: row.teacher_category || '',
        rank:            row.rank || '',
        photo:           row.photo_url || '',
        experiences: [],
        certificates: [],
        subjects: [],
        tags: [],
    };
}

// ─────────────────────────────────────────────────────────────
//  Helper：取得完整師資（含子表）
// ─────────────────────────────────────────────────────────────

async function getFullTeacher(pool, teacherId) {
    const id = Number(teacherId);

    const [tRes, expRes, certRes, subjRes, matRes, tagRes] = await Promise.all([
        pool.request().input('id', sql.BigInt, id)
            .query(`SELECT * FROM ${SCHEMA}.teachers WHERE id = @id`),
        pool.request().input('tid', sql.BigInt, id)
            .query(`SELECT * FROM ${SCHEMA}.teacher_experiences WHERE teacher_id = @tid ORDER BY sort_order`),
        pool.request().input('tid', sql.BigInt, id)
            .query(`SELECT * FROM ${SCHEMA}.teacher_certificates WHERE teacher_id = @tid ORDER BY sort_order`),
        pool.request().input('tid', sql.BigInt, id)
            .query(`SELECT * FROM ${SCHEMA}.teacher_subjects WHERE teacher_id = @tid ORDER BY sort_order`),
        pool.request().input('tid', sql.BigInt, id)
            .query(`SELECT m.* FROM ${SCHEMA}.teacher_subject_materials m
                    JOIN ${SCHEMA}.teacher_subjects s ON m.subject_id = s.id
                    WHERE s.teacher_id = @tid ORDER BY m.sort_order`),
        pool.request().input('tid', sql.BigInt, id)
            .query(`SELECT * FROM ${SCHEMA}.teacher_tags WHERE teacher_id = @tid ORDER BY sort_order`),
    ]);

    if (!tRes.recordset[0]) return null;

    const teacher = formatTeacher(tRes.recordset[0]);

    teacher.experiences = expRes.recordset.map(e => e.content);

    teacher.certificates = certRes.recordset.map(c =>
        c.file_url ? { name: c.name, fileName: c.file_name, fileUrl: c.file_url } : c.name
    );

    const matsBySubject = {};
    matRes.recordset.forEach(m => {
        if (!matsBySubject[m.subject_id]) matsBySubject[m.subject_id] = [];
        matsBySubject[m.subject_id].push({ fileName: m.file_name, fileUrl: m.file_url, fileType: m.file_type });
    });

    teacher.subjects = subjRes.recordset.map(s => {
        const mats = matsBySubject[s.id] || [];
        return mats.length ? { name: s.name, materials: mats } : s.name;
    });

    teacher.tags = tagRes.recordset.map(t => t.tag);

    return teacher;
}

// ─────────────────────────────────────────────────────────────
//  Helper：在事務中寫入師資子表（刪舊插新）
// ─────────────────────────────────────────────────────────────

async function replaceTeacherChildren(txn, teacherId, { experiences, certificates, subjects, tags }) {
    const id = Number(teacherId);

    // 刪除現有子表（除了 subject_materials，它隨 subjects CASCADE 刪除）
    await txn.request().input('tid', sql.BigInt, id).query(`
        DELETE FROM ${SCHEMA}.teacher_tags         WHERE teacher_id = @tid;
        DELETE FROM ${SCHEMA}.teacher_experiences  WHERE teacher_id = @tid;
        DELETE FROM ${SCHEMA}.teacher_certificates WHERE teacher_id = @tid;
        DELETE FROM ${SCHEMA}.teacher_subjects     WHERE teacher_id = @tid;
    `);

    // 插入 experiences
    for (const e of experiences) {
        await txn.request()
            .input('tid', sql.BigInt, id)
            .input('content', sql.NVarChar, e.content)
            .input('sort',    sql.Int,      e.sort_order)
            .query(`INSERT INTO ${SCHEMA}.teacher_experiences (teacher_id,content,sort_order)
                    VALUES (@tid,@content,@sort)`);
    }

    // 插入 certificates
    for (const c of certificates) {
        await txn.request()
            .input('tid',       sql.BigInt,   id)
            .input('name',      sql.NVarChar, c.name)
            .input('file_name', sql.NVarChar, c.file_name || null)
            .input('file_url',  sql.NVarChar, c.file_url  || null)
            .input('sort',      sql.Int,      c.sort_order)
            .query(`INSERT INTO ${SCHEMA}.teacher_certificates (teacher_id,name,file_name,file_url,sort_order)
                    VALUES (@tid,@name,@file_name,@file_url,@sort)`);
    }

    // 插入 subjects + materials（巢狀）
    for (const s of subjects) {
        const sRes = await txn.request()
            .input('tid',  sql.BigInt,   id)
            .input('name', sql.NVarChar, s.name)
            .input('sort', sql.Int,      s.sort_order)
            .query(`INSERT INTO ${SCHEMA}.teacher_subjects (teacher_id,name,sort_order)
                    OUTPUT INSERTED.id
                    VALUES (@tid,@name,@sort)`);
        const subjectId = sRes.recordset[0].id;

        for (const m of s.materials) {
            await txn.request()
                .input('sid',       sql.Int,      subjectId)
                .input('file_name', sql.NVarChar, m.file_name)
                .input('file_url',  sql.NVarChar, m.file_url)
                .input('file_type', sql.NVarChar, m.file_type || null)
                .input('sort',      sql.Int,      m.sort_order)
                .query(`INSERT INTO ${SCHEMA}.teacher_subject_materials (subject_id,file_name,file_url,file_type,sort_order)
                        VALUES (@sid,@file_name,@file_url,@file_type,@sort)`);
        }
    }

    // 插入 tags
    for (const t of tags) {
        await txn.request()
            .input('tid',  sql.BigInt,   id)
            .input('tag',  sql.NVarChar, t.tag)
            .input('sort', sql.Int,      t.sort_order)
            .query(`INSERT INTO ${SCHEMA}.teacher_tags (teacher_id,tag,sort_order)
                    VALUES (@tid,@tag,@sort)`);
    }
}

// ═════════════════════════════════════════════════════════════
//  ROUTE: GET /api/teachers  &  GET /api/teachers/{id}
// ═════════════════════════════════════════════════════════════

app.http('teachers-list-get', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'teachers',
    handler: async (request, context) => {
        const headers = getCorsHeaders();
        if (request.method === 'OPTIONS') return { status: 200, headers };

        try {
            const user = await validateRequest(request.headers.get('authorization'));
            if (!user)          return { status: 401, headers, jsonBody: { error: '未登入或 Token 無效' } };
            if (!user.allowed)  return forbidden(headers);

            const pool = await getConnection();
            const rows = await pool.request()
                .query(`SELECT * FROM ${SCHEMA}.teachers ORDER BY id ASC`);

            // 快速列表：只附加 tags（供搜尋用），其他子表按需由 GET /{id} 載入
            const teacherIds = rows.recordset.map(r => r.id);
            let tagsMap = {};
            if (teacherIds.length) {
                const idList = teacherIds.join(',');
                const tagRows = await pool.request()
                    .query(`SELECT teacher_id, tag FROM ${SCHEMA}.teacher_tags
                            WHERE teacher_id IN (${idList}) ORDER BY sort_order`);
                tagRows.recordset.forEach(t => {
                    if (!tagsMap[t.teacher_id]) tagsMap[t.teacher_id] = [];
                    tagsMap[t.teacher_id].push(t.tag);
                });
            }

            const data = rows.recordset.map(row => {
                const t = formatTeacher(row);
                t.tags = tagsMap[row.id] || [];
                return t;
            });

            return ok({ data }, headers);
        } catch (error) {
            context.error('teachers-list-get error:', error);
            return serverErr(null, headers);
        }
    }
});

app.http('teachers-single', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'teachers/{id}',
    handler: async (request, context) => {
        const headers = getCorsHeaders();
        if (request.method === 'OPTIONS') return { status: 200, headers };

        try {
            const user = await validateRequest(request.headers.get('authorization'));
            if (!user)         return { status: 401, headers, jsonBody: { error: '未登入或 Token 無效' } };
            if (!user.allowed) return forbidden(headers);

            const pool = await getConnection();
            const teacher = await getFullTeacher(pool, request.params.id);
            if (!teacher) return notFound(headers);
            return ok({ data: teacher }, headers);
        } catch (error) {
            context.error('teachers-single error:', error);
            return serverErr(null, headers);
        }
    }
});

// ═════════════════════════════════════════════════════════════
//  ROUTE: POST /api/teachers
// ═════════════════════════════════════════════════════════════

app.http('teachers-create', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'teachers',
    handler: async (request, context) => {
        const headers = getCorsHeaders();
        if (request.method === 'OPTIONS') return { status: 200, headers };

        try {
            const user = await validateRequest(request.headers.get('authorization'));
            if (!user)         return { status: 401, headers, jsonBody: { error: '未登入或 Token 無效' } };
            if (!user.isAdmin) return forbidden(headers);

            const body = await request.json();
            const { teacher, experiences, certificates, subjects, tags } = parseTeacherBody(body);

            if (!teacher.name) return badReq('師資姓名為必填', headers);

            const pool = await getConnection();
            const transaction = pool.transaction();
            await transaction.begin();

            try {
                await transaction.request()
                    .input('id',               sql.BigInt,   teacher.id)
                    .input('name',             sql.NVarChar, teacher.name)
                    .input('email',            sql.NVarChar, teacher.email)
                    .input('teacher_type',     sql.NVarChar, teacher.teacher_type)
                    .input('work_location',    sql.NVarChar, teacher.work_location)
                    .input('teacher_category', sql.NVarChar, teacher.teacher_category)
                    .input('rank',             sql.NVarChar, teacher.rank)
                    .input('photo_url',        sql.NVarChar, teacher.photo_url)
                    .input('updated_by',       sql.NVarChar, user.email)
                    .query(`INSERT INTO ${SCHEMA}.teachers
                            (id,name,email,teacher_type,work_location,teacher_category,rank,photo_url,updated_by)
                            VALUES (@id,@name,@email,@teacher_type,@work_location,@teacher_category,@rank,@photo_url,@updated_by)`);

                await replaceTeacherChildren(transaction, teacher.id, { experiences, certificates, subjects, tags });
                await transaction.commit();

                context.log(`✅ ${user.email} 新增師資 ${teacher.name} (id=${teacher.id})`);
                return created({ success: true, id: teacher.id }, headers);

            } catch (err) {
                try { await transaction.rollback(); } catch (_) {}
                throw err;
            }
        } catch (error) {
            context.error('teachers-create error:', error);
            return serverErr(null, headers);
        }
    }
});

// ═════════════════════════════════════════════════════════════
//  ROUTE: PUT /api/teachers/{id}
// ═════════════════════════════════════════════════════════════

app.http('teachers-update', {
    methods: ['PUT', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'teachers/{id}',
    handler: async (request, context) => {
        const headers = getCorsHeaders();
        if (request.method === 'OPTIONS') return { status: 200, headers };

        try {
            const user = await validateRequest(request.headers.get('authorization'));
            if (!user)         return { status: 401, headers, jsonBody: { error: '未登入或 Token 無效' } };
            if (!user.isAdmin) return forbidden(headers);

            const teacherId = Number(request.params.id);
            const body = await request.json();
            const { teacher, experiences, certificates, subjects, tags } = parseTeacherBody(body);

            if (!teacher.name) return badReq('師資姓名為必填', headers);

            const pool = await getConnection();

            const exists = await pool.request()
                .input('id', sql.BigInt, teacherId)
                .query(`SELECT id FROM ${SCHEMA}.teachers WHERE id = @id`);
            if (!exists.recordset[0]) return notFound(headers);

            const transaction = pool.transaction();
            await transaction.begin();

            try {
                await transaction.request()
                    .input('id',               sql.BigInt,   teacherId)
                    .input('name',             sql.NVarChar, teacher.name)
                    .input('email',            sql.NVarChar, teacher.email)
                    .input('teacher_type',     sql.NVarChar, teacher.teacher_type)
                    .input('work_location',    sql.NVarChar, teacher.work_location)
                    .input('teacher_category', sql.NVarChar, teacher.teacher_category)
                    .input('rank',             sql.NVarChar, teacher.rank)
                    .input('photo_url',        sql.NVarChar, teacher.photo_url)
                    .input('updated_by',       sql.NVarChar, user.email)
                    .query(`UPDATE ${SCHEMA}.teachers
                            SET name=@name, email=@email, teacher_type=@teacher_type,
                                work_location=@work_location, teacher_category=@teacher_category,
                                rank=@rank, photo_url=@photo_url,
                                updated_at=GETUTCDATE(), updated_by=@updated_by
                            WHERE id = @id`);

                await replaceTeacherChildren(transaction, teacherId, { experiences, certificates, subjects, tags });
                await transaction.commit();

                context.log(`✅ ${user.email} 更新師資 id=${teacherId}`);
                return ok({ success: true }, headers);

            } catch (err) {
                try { await transaction.rollback(); } catch (_) {}
                throw err;
            }
        } catch (error) {
            context.error('teachers-update error:', error);
            return serverErr(null, headers);
        }
    }
});

// ═════════════════════════════════════════════════════════════
//  ROUTE: DELETE /api/teachers/{id}
// ═════════════════════════════════════════════════════════════

app.http('teachers-delete', {
    methods: ['DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'teachers/{id}',
    handler: async (request, context) => {
        const headers = getCorsHeaders();
        if (request.method === 'OPTIONS') return { status: 200, headers };

        try {
            const user = await validateRequest(request.headers.get('authorization'));
            if (!user)         return { status: 401, headers, jsonBody: { error: '未登入或 Token 無效' } };
            if (!user.isAdmin) return forbidden(headers);

            const pool = await getConnection();
            await pool.request()
                .input('id', sql.BigInt, Number(request.params.id))
                .query(`DELETE FROM ${SCHEMA}.teachers WHERE id = @id`);

            context.log(`✅ ${user.email} 刪除師資 id=${request.params.id}`);
            return ok({ success: true }, headers);
        } catch (error) {
            context.error('teachers-delete error:', error);
            return serverErr(null, headers);
        }
    }
});

// ═════════════════════════════════════════════════════════════
//  ROUTE: 請假紀錄  /api/teacher-leaves
// ═════════════════════════════════════════════════════════════

app.http('teacher-leaves', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'teacher-leaves',
    handler: async (request, context) => {
        const headers = getCorsHeaders();
        if (request.method === 'OPTIONS') return { status: 200, headers };

        try {
            const user = await validateRequest(request.headers.get('authorization'));
            if (!user)         return { status: 401, headers, jsonBody: { error: '未登入或 Token 無效' } };
            if (!user.allowed) return forbidden(headers);

            const pool = await getConnection();

            if (request.method === 'GET') {
                const params  = new URL(request.url).searchParams;
                const month   = params.get('month');    // YYYY-MM
                const tidStr  = params.get('teacherId');

                let query = `SELECT * FROM ${SCHEMA}.teacher_leaves WHERE 1=1`;
                const req = pool.request();

                if (tidStr) {
                    req.input('tid', sql.BigInt, Number(tidStr));
                    query += ' AND teacher_id = @tid';
                }
                if (month) {
                    req.input('month', sql.NVarChar, month);
                    query += ` AND FORMAT(leave_date,'yyyy-MM') = @month`;
                }
                query += ' ORDER BY leave_date';

                const result = await req.query(query);
                const data = result.recordset.map(r => ({
                    id:          r.id,
                    teacherId:   r.teacher_id,
                    teacherName: r.teacher_name,
                    date:        r.leave_date.toISOString().slice(0, 10),
                    reason:      r.reason || '',
                }));
                return ok({ data }, headers);
            }

            // POST
            if (!user.isAdmin) return forbidden(headers);

            const body = await request.json();
            const { teacherId, date, reason } = body;
            if (!teacherId || !date) return badReq('teacherId 和 date 為必填', headers);

            const teacher = await pool.request()
                .input('tid', sql.BigInt, Number(teacherId))
                .query(`SELECT name FROM ${SCHEMA}.teachers WHERE id = @tid`);
            if (!teacher.recordset[0]) return badReq('找不到指定師資', headers);

            const newId = Date.now();
            await pool.request()
                .input('id',           sql.BigInt,   newId)
                .input('teacher_id',   sql.BigInt,   Number(teacherId))
                .input('teacher_name', sql.NVarChar, teacher.recordset[0].name)
                .input('leave_date',   sql.Date,     new Date(date))
                .input('reason',       sql.NVarChar, reason || null)
                .query(`INSERT INTO ${SCHEMA}.teacher_leaves (id,teacher_id,teacher_name,leave_date,reason)
                        VALUES (@id,@teacher_id,@teacher_name,@leave_date,@reason)`);

            return created({ success: true, id: newId }, headers);
        } catch (error) {
            context.error('teacher-leaves error:', error);
            return serverErr(null, headers);
        }
    }
});

app.http('teacher-leaves-delete', {
    methods: ['DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'teacher-leaves/{id}',
    handler: async (request, context) => {
        const headers = getCorsHeaders();
        if (request.method === 'OPTIONS') return { status: 200, headers };

        try {
            const user = await validateRequest(request.headers.get('authorization'));
            if (!user)         return { status: 401, headers, jsonBody: { error: '未登入或 Token 無效' } };
            if (!user.isAdmin) return forbidden(headers);

            const pool = await getConnection();
            await pool.request()
                .input('id', sql.BigInt, Number(request.params.id))
                .query(`DELETE FROM ${SCHEMA}.teacher_leaves WHERE id = @id`);

            return ok({ success: true }, headers);
        } catch (error) {
            context.error('teacher-leaves-delete error:', error);
            return serverErr(null, headers);
        }
    }
});

// ═════════════════════════════════════════════════════════════
//  ROUTE: 派課管理  /api/course-assignments
// ═════════════════════════════════════════════════════════════

app.http('course-assignments', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'course-assignments',
    handler: async (request, context) => {
        const headers = getCorsHeaders();
        if (request.method === 'OPTIONS') return { status: 200, headers };

        try {
            const user = await validateRequest(request.headers.get('authorization'));
            if (!user)         return { status: 401, headers, jsonBody: { error: '未登入或 Token 無效' } };
            if (!user.allowed) return forbidden(headers);

            const pool = await getConnection();

            if (request.method === 'GET') {
                const params   = new URL(request.url).searchParams;
                const tidStr   = params.get('teacherId');
                const startStr = params.get('start');
                const endStr   = params.get('end');

                let query = `SELECT * FROM ${SCHEMA}.course_assignments WHERE 1=1`;
                const req = pool.request();

                if (tidStr) {
                    req.input('tid', sql.BigInt, Number(tidStr));
                    query += ' AND teacher_id = @tid';
                }
                if (startStr) {
                    req.input('start', sql.Date, new Date(startStr));
                    query += ' AND course_date >= @start';
                }
                if (endStr) {
                    req.input('end', sql.Date, new Date(endStr));
                    query += ' AND course_date <= @end';
                }
                query += ' ORDER BY course_date, time_range';

                const result = await req.query(query);
                const data = result.recordset.map(r => ({
                    id:        r.id,
                    teacherId: r.teacher_id,
                    name:      r.name,
                    date:      r.course_date.toISOString().slice(0, 10),
                    time:      r.time_range,
                    type:      r.course_type,
                    note:      r.note || '',
                }));
                return ok({ data }, headers);
            }

            // POST
            if (!user.isAdmin) return forbidden(headers);

            const body = await request.json();
            const { teacherId, name, date, time, type, note } = body;
            if (!teacherId || !name || !date || !time || !type)
                return badReq('teacherId, name, date, time, type 為必填', headers);

            const newId = Date.now();
            await pool.request()
                .input('id',          sql.BigInt,   newId)
                .input('teacher_id',  sql.BigInt,   Number(teacherId))
                .input('name',        sql.NVarChar, String(name))
                .input('course_date', sql.Date,     new Date(date))
                .input('time_range',  sql.NVarChar, String(time))
                .input('course_type', sql.NVarChar, String(type))
                .input('note',        sql.NVarChar, note || null)
                .input('updated_by',  sql.NVarChar, user.email)
                .query(`INSERT INTO ${SCHEMA}.course_assignments
                        (id,teacher_id,name,course_date,time_range,course_type,note,updated_by)
                        VALUES (@id,@teacher_id,@name,@course_date,@time_range,@course_type,@note,@updated_by)`);

            context.log(`✅ ${user.email} 新增派課 id=${newId}`);
            return created({ success: true, id: newId }, headers);
        } catch (error) {
            context.error('course-assignments error:', error);
            return serverErr(null, headers);
        }
    }
});

app.http('course-assignments-delete', {
    methods: ['DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'course-assignments/{id}',
    handler: async (request, context) => {
        const headers = getCorsHeaders();
        if (request.method === 'OPTIONS') return { status: 200, headers };

        try {
            const user = await validateRequest(request.headers.get('authorization'));
            if (!user)         return { status: 401, headers, jsonBody: { error: '未登入或 Token 無效' } };
            if (!user.isAdmin) return forbidden(headers);

            const pool = await getConnection();
            await pool.request()
                .input('id', sql.BigInt, Number(request.params.id))
                .query(`DELETE FROM ${SCHEMA}.course_assignments WHERE id = @id`);

            return ok({ success: true }, headers);
        } catch (error) {
            context.error('course-assignments-delete error:', error);
            return serverErr(null, headers);
        }
    }
});

// ═════════════════════════════════════════════════════════════
//  ROUTE: 行事曆  /api/calendar-events
// ═════════════════════════════════════════════════════════════

app.http('calendar-events', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'calendar-events',
    handler: async (request, context) => {
        const headers = getCorsHeaders();
        if (request.method === 'OPTIONS') return { status: 200, headers };

        try {
            const user = await validateRequest(request.headers.get('authorization'));
            if (!user)         return { status: 401, headers, jsonBody: { error: '未登入或 Token 無效' } };
            if (!user.allowed) return forbidden(headers);

            const pool = await getConnection();

            if (request.method === 'GET') {
                const params    = new URL(request.url).searchParams;
                const yearStr   = params.get('year');
                const monthStr  = params.get('month');

                let query = `SELECT * FROM ${SCHEMA}.calendar_events WHERE 1=1`;
                const req = pool.request();

                if (yearStr && monthStr) {
                    req.input('year',  sql.Int, Number(yearStr));
                    req.input('month', sql.Int, Number(monthStr));
                    query += ' AND YEAR(event_date) = @year AND MONTH(event_date) = @month';
                } else if (yearStr) {
                    req.input('year', sql.Int, Number(yearStr));
                    query += ' AND YEAR(event_date) = @year';
                }
                query += ' ORDER BY event_date, event_time';

                const result = await req.query(query);
                const data = result.recordset.map(r => ({
                    id:                 r.id,
                    date:               r.event_date.toISOString().slice(0, 10),
                    title:              r.title,
                    time:               r.event_time || '',
                    teacherId:          r.teacher_id,
                    location:           r.location || '',
                    note:               r.note || '',
                    color:              r.color || 'bg-blue-500',
                    courseAssignmentId: r.course_assignment_id || null,
                }));
                return ok({ data }, headers);
            }

            // POST
            if (!user.isAdmin) return forbidden(headers);

            const body = await request.json();
            const { id, date, title, time, teacherId, location, note, color, courseAssignmentId } = body;
            if (!date || !title) return badReq('date 和 title 為必填', headers);

            const newId = id ? Number(id) : Date.now();
            await pool.request()
                .input('id',                   sql.BigInt,   newId)
                .input('event_date',           sql.Date,     new Date(date))
                .input('title',                sql.NVarChar, String(title))
                .input('event_time',           sql.NVarChar, time   || null)
                .input('teacher_id',           sql.BigInt,   teacherId ? Number(teacherId) : null)
                .input('location',             sql.NVarChar, location || null)
                .input('note',                 sql.NVarChar, note     || null)
                .input('color',                sql.NVarChar, color    || 'bg-blue-500')
                .input('course_assignment_id', sql.BigInt,   courseAssignmentId ? Number(courseAssignmentId) : null)
                .query(`INSERT INTO ${SCHEMA}.calendar_events
                        (id,event_date,title,event_time,teacher_id,location,note,color,course_assignment_id)
                        VALUES (@id,@event_date,@title,@event_time,@teacher_id,@location,@note,@color,@course_assignment_id)`);

            return created({ success: true, id: newId }, headers);
        } catch (error) {
            context.error('calendar-events error:', error);
            return serverErr(null, headers);
        }
    }
});

app.http('calendar-events-update-delete', {
    methods: ['PUT', 'DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'calendar-events/{id}',
    handler: async (request, context) => {
        const headers = getCorsHeaders();
        if (request.method === 'OPTIONS') return { status: 200, headers };

        try {
            const user = await validateRequest(request.headers.get('authorization'));
            if (!user)         return { status: 401, headers, jsonBody: { error: '未登入或 Token 無效' } };
            if (!user.isAdmin) return forbidden(headers);

            const pool = await getConnection();
            const eventId = Number(request.params.id);

            if (request.method === 'DELETE') {
                await pool.request()
                    .input('id', sql.BigInt, eventId)
                    .query(`DELETE FROM ${SCHEMA}.calendar_events WHERE id = @id`);
                return ok({ success: true }, headers);
            }

            // PUT
            const body = await request.json();
            const { date, title, time, teacherId, location, note, color } = body;
            if (!date || !title) return badReq('date 和 title 為必填', headers);

            await pool.request()
                .input('id',         sql.BigInt,   eventId)
                .input('event_date', sql.Date,     new Date(date))
                .input('title',      sql.NVarChar, String(title))
                .input('event_time', sql.NVarChar, time     || null)
                .input('teacher_id', sql.BigInt,   teacherId ? Number(teacherId) : null)
                .input('location',   sql.NVarChar, location || null)
                .input('note',       sql.NVarChar, note     || null)
                .input('color',      sql.NVarChar, color    || 'bg-blue-500')
                .query(`UPDATE ${SCHEMA}.calendar_events
                        SET event_date=@event_date, title=@title, event_time=@event_time,
                            teacher_id=@teacher_id, location=@location, note=@note, color=@color
                        WHERE id = @id`);

            return ok({ success: true }, headers);
        } catch (error) {
            context.error('calendar-events-update-delete error:', error);
            return serverErr(null, headers);
        }
    }
});

// ═════════════════════════════════════════════════════════════
//  ROUTE: 海事課程  /api/maritime-courses
// ═════════════════════════════════════════════════════════════

async function getMaritimeCourseWithKeywords(pool, courseId) {
    const [cRes, kRes] = await Promise.all([
        pool.request().input('id', sql.BigInt, Number(courseId))
            .query(`SELECT * FROM ${SCHEMA}.maritime_courses WHERE id = @id`),
        pool.request().input('cid', sql.BigInt, Number(courseId))
            .query(`SELECT keyword FROM ${SCHEMA}.maritime_course_keywords
                    WHERE course_id = @cid ORDER BY sort_order`),
    ]);
    if (!cRes.recordset[0]) return null;
    return {
        id:          cRes.recordset[0].id,
        name:        cRes.recordset[0].name,
        category:    cRes.recordset[0].category,
        method:      cRes.recordset[0].method || '',
        description: cRes.recordset[0].description || '',
        keywords:    kRes.recordset.map(k => k.keyword),
    };
}

app.http('maritime-courses', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'maritime-courses',
    handler: async (request, context) => {
        const headers = getCorsHeaders();
        if (request.method === 'OPTIONS') return { status: 200, headers };

        try {
            const user = await validateRequest(request.headers.get('authorization'));
            if (!user)         return { status: 401, headers, jsonBody: { error: '未登入或 Token 無效' } };
            if (!user.allowed) return forbidden(headers);

            const pool = await getConnection();

            if (request.method === 'GET') {
                const [cRes, kRes] = await Promise.all([
                    pool.request().query(`SELECT * FROM ${SCHEMA}.maritime_courses ORDER BY category, id`),
                    pool.request().query(`SELECT * FROM ${SCHEMA}.maritime_course_keywords ORDER BY course_id, sort_order`),
                ]);

                const kwMap = {};
                kRes.recordset.forEach(k => {
                    if (!kwMap[k.course_id]) kwMap[k.course_id] = [];
                    kwMap[k.course_id].push(k.keyword);
                });

                const data = cRes.recordset.map(c => ({
                    id:          c.id,
                    name:        c.name,
                    category:    c.category,
                    method:      c.method || '',
                    description: c.description || '',
                    keywords:    kwMap[c.id] || [],
                }));
                return ok({ data }, headers);
            }

            // POST
            if (!user.isAdmin) return forbidden(headers);

            const body = await request.json();
            const { name, category, method, description, keywords } = body;
            if (!name || !category) return badReq('name 和 category 為必填', headers);

            const newId = body.id ? Number(body.id) : Date.now();
            const pool2 = await getConnection();
            const transaction = pool2.transaction();
            await transaction.begin();

            try {
                await transaction.request()
                    .input('id',          sql.BigInt,   newId)
                    .input('name',        sql.NVarChar, String(name))
                    .input('category',    sql.NVarChar, String(category))
                    .input('method',      sql.NVarChar, method      || null)
                    .input('description', sql.NVarChar, description || null)
                    .input('updated_by',  sql.NVarChar, user.email)
                    .query(`INSERT INTO ${SCHEMA}.maritime_courses
                            (id,name,category,method,description,updated_by)
                            VALUES (@id,@name,@category,@method,@description,@updated_by)`);

                for (const [i, kw] of (keywords || []).entries()) {
                    await transaction.request()
                        .input('cid',  sql.BigInt,   newId)
                        .input('kw',   sql.NVarChar, String(kw).trim())
                        .input('sort', sql.Int,      i)
                        .query(`INSERT INTO ${SCHEMA}.maritime_course_keywords (course_id,keyword,sort_order)
                                VALUES (@cid,@kw,@sort)`);
                }

                await transaction.commit();
                context.log(`✅ ${user.email} 新增海事課程 id=${newId}`);
                return created({ success: true, id: newId }, headers);
            } catch (err) {
                try { await transaction.rollback(); } catch (_) {}
                throw err;
            }
        } catch (error) {
            context.error('maritime-courses error:', error);
            return serverErr(null, headers);
        }
    }
});

app.http('maritime-courses-update-delete', {
    methods: ['PUT', 'DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'maritime-courses/{id}',
    handler: async (request, context) => {
        const headers = getCorsHeaders();
        if (request.method === 'OPTIONS') return { status: 200, headers };

        try {
            const user = await validateRequest(request.headers.get('authorization'));
            if (!user)         return { status: 401, headers, jsonBody: { error: '未登入或 Token 無效' } };
            if (!user.isAdmin) return forbidden(headers);

            const pool = await getConnection();
            const courseId = Number(request.params.id);

            if (request.method === 'DELETE') {
                await pool.request()
                    .input('id', sql.BigInt, courseId)
                    .query(`DELETE FROM ${SCHEMA}.maritime_courses WHERE id = @id`);
                return ok({ success: true }, headers);
            }

            // PUT
            const body = await request.json();
            const { name, category, method, description, keywords } = body;
            if (!name || !category) return badReq('name 和 category 為必填', headers);

            const transaction = pool.transaction();
            await transaction.begin();

            try {
                await transaction.request()
                    .input('id',          sql.BigInt,   courseId)
                    .input('name',        sql.NVarChar, String(name))
                    .input('category',    sql.NVarChar, String(category))
                    .input('method',      sql.NVarChar, method      || null)
                    .input('description', sql.NVarChar, description || null)
                    .input('updated_by',  sql.NVarChar, user.email)
                    .query(`UPDATE ${SCHEMA}.maritime_courses
                            SET name=@name, category=@category, method=@method,
                                description=@description, updated_at=GETUTCDATE(), updated_by=@updated_by
                            WHERE id = @id`);

                await transaction.request()
                    .input('cid', sql.BigInt, courseId)
                    .query(`DELETE FROM ${SCHEMA}.maritime_course_keywords WHERE course_id = @cid`);

                for (const [i, kw] of (keywords || []).entries()) {
                    await transaction.request()
                        .input('cid',  sql.BigInt,   courseId)
                        .input('kw',   sql.NVarChar, String(kw).trim())
                        .input('sort', sql.Int,      i)
                        .query(`INSERT INTO ${SCHEMA}.maritime_course_keywords (course_id,keyword,sort_order)
                                VALUES (@cid,@kw,@sort)`);
                }

                await transaction.commit();
                return ok({ success: true }, headers);
            } catch (err) {
                try { await transaction.rollback(); } catch (_) {}
                throw err;
            }
        } catch (error) {
            context.error('maritime-courses-update-delete error:', error);
            return serverErr(null, headers);
        }
    }
});
