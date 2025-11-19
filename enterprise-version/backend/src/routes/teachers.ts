/**
 * 教師路由
 */
import express, { Request, Response } from 'express';
import { body, query as expressQuery, param, validationResult } from 'express-validator';
import { query, transaction } from '../config/database';
import { authenticate, requirePermission } from '../middleware/auth';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { autoAuditLog } from '../middleware/auditLog';

const router = express.Router();

// 所有教師路由都需要認證
router.use(authenticate);
router.use(autoAuditLog('teacher'));

/**
 * GET /api/teachers
 * 取得教師列表
 */
router.get(
  '/',
  requirePermission('teacher.view_all', 'teacher.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const { search, teacherType, isActive, page = 1, limit = 20 } = req.query;

    let sql = `
      SELECT id, name, email, teacher_type, work_location, photo_url,
             experiences, certificates, subjects, tags, is_active,
             created_at, updated_at
      FROM teachers
      WHERE 1=1
    `;
    const params: any[] = [];

    // 搜尋條件
    if (search) {
      sql += ' AND (name LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (teacherType) {
      sql += ' AND teacher_type = ?';
      params.push(teacherType);
    }

    if (isActive !== undefined) {
      sql += ' AND is_active = ?';
      params.push(isActive === 'true' ? 1 : 0);
    }

    // 分頁
    const offset = (Number(page) - 1) * Number(limit);
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);

    const teachers = await query<any[]>(sql, params);

    // 解析 JSON 欄位
    const formattedTeachers = teachers.map((t) => ({
      ...t,
      experiences: typeof t.experiences === 'string' ? JSON.parse(t.experiences) : t.experiences,
      certificates: typeof t.certificates === 'string' ? JSON.parse(t.certificates) : t.certificates,
      subjects: typeof t.subjects === 'string' ? JSON.parse(t.subjects) : t.subjects,
      tags: typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags,
    }));

    res.json({
      success: true,
      data: formattedTeachers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
      },
    });
  })
);

/**
 * GET /api/teachers/:id
 * 取得單一教師資料
 */
router.get(
  '/:id',
  param('id').isInt(),
  requirePermission('teacher.view_all', 'teacher.view'),
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('無效的教師 ID', 400);
    }

    const teachers = await query<any[]>(
      'SELECT * FROM teachers WHERE id = ?',
      [req.params.id]
    );

    if (teachers.length === 0) {
      throw new AppError('教師不存在', 404);
    }

    const teacher = teachers[0];

    // 解析 JSON 欄位
    res.json({
      success: true,
      data: {
        ...teacher,
        experiences: typeof teacher.experiences === 'string' ? JSON.parse(teacher.experiences) : teacher.experiences,
        certificates: typeof teacher.certificates === 'string' ? JSON.parse(teacher.certificates) : teacher.certificates,
        subjects: typeof teacher.subjects === 'string' ? JSON.parse(teacher.subjects) : teacher.subjects,
        tags: typeof teacher.tags === 'string' ? JSON.parse(teacher.tags) : teacher.tags,
      },
    });
  })
);

/**
 * POST /api/teachers
 * 新增教師
 */
router.post(
  '/',
  requirePermission('teacher.create'),
  [
    body('name').isLength({ min: 1, max: 100 }).trim(),
    body('email').optional().isEmail(),
    body('teacherType').isIn(['full_time', 'part_time', 'adjunct']),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('輸入資料格式錯誤', 400);
    }

    const {
      name,
      email,
      teacherType,
      workLocation,
      photoUrl,
      experiences,
      certificates,
      subjects,
      tags,
    } = req.body;

    const result = await query<any>(
      `INSERT INTO teachers
       (name, email, teacher_type, work_location, photo_url,
        experiences, certificates, subjects, tags, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        email || null,
        teacherType,
        workLocation || null,
        photoUrl || null,
        JSON.stringify(experiences || []),
        JSON.stringify(certificates || []),
        JSON.stringify(subjects || []),
        JSON.stringify(tags || []),
        req.user!.id,
      ]
    );

    res.status(201).json({
      success: true,
      message: '教師新增成功',
      data: { id: result.insertId },
    });
  })
);

/**
 * PUT /api/teachers/:id
 * 更新教師資料（帶樂觀鎖）
 */
router.put(
  '/:id',
  param('id').isInt(),
  requirePermission('teacher.update'),
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('無效的教師 ID', 400);
    }

    const { version, ...updateData } = req.body;

    // 樂觀鎖：檢查版本號
    const teachers = await query<any[]>(
      'SELECT version FROM teachers WHERE id = ?',
      [req.params.id]
    );

    if (teachers.length === 0) {
      throw new AppError('教師不存在', 404);
    }

    if (version !== undefined && teachers[0].version !== version) {
      throw new AppError('資料已被其他人修改，請重新載入', 409);
    }

    // 建立更新 SQL
    const fields: string[] = [];
    const values: any[] = [];

    if (updateData.name) {
      fields.push('name = ?');
      values.push(updateData.name);
    }
    if (updateData.email !== undefined) {
      fields.push('email = ?');
      values.push(updateData.email);
    }
    if (updateData.teacherType) {
      fields.push('teacher_type = ?');
      values.push(updateData.teacherType);
    }
    if (updateData.workLocation !== undefined) {
      fields.push('work_location = ?');
      values.push(updateData.workLocation);
    }
    if (updateData.photoUrl !== undefined) {
      fields.push('photo_url = ?');
      values.push(updateData.photoUrl);
    }
    if (updateData.experiences) {
      fields.push('experiences = ?');
      values.push(JSON.stringify(updateData.experiences));
    }
    if (updateData.certificates) {
      fields.push('certificates = ?');
      values.push(JSON.stringify(updateData.certificates));
    }
    if (updateData.subjects) {
      fields.push('subjects = ?');
      values.push(JSON.stringify(updateData.subjects));
    }
    if (updateData.tags) {
      fields.push('tags = ?');
      values.push(JSON.stringify(updateData.tags));
    }

    if (fields.length === 0) {
      throw new AppError('沒有要更新的欄位', 400);
    }

    // 增加版本號和更新者
    fields.push('version = version + 1');
    fields.push('updated_by = ?');
    values.push(req.user!.id);

    values.push(req.params.id);

    await query(
      `UPDATE teachers SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    res.json({
      success: true,
      message: '教師資料更新成功',
    });
  })
);

/**
 * DELETE /api/teachers/:id
 * 刪除教師
 */
router.delete(
  '/:id',
  param('id').isInt(),
  requirePermission('teacher.delete'),
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('無效的教師 ID', 400);
    }

    const result = await query<any>(
      'DELETE FROM teachers WHERE id = ?',
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      throw new AppError('教師不存在', 404);
    }

    res.json({
      success: true,
      message: '教師刪除成功',
    });
  })
);

export default router;
