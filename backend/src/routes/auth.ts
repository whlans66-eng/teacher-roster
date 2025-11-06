/**
 * 認證路由 (註冊、登入、登出)
 */
import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import { query, transaction } from '../config/database';
import { generateToken, authenticate } from '../middleware/auth';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { loginRateLimiter, registerRateLimiter } from '../middleware/rateLimiter';
import { logAudit } from '../middleware/auditLog';

const router = express.Router();

/**
 * POST /api/auth/register
 * 用戶註冊
 */
router.post(
  '/register',
  registerRateLimiter,
  [
    body('username').isLength({ min: 3, max: 50 }).trim().escape(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('fullName').optional().isLength({ max: 100 }).trim(),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    // 驗證輸入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('輸入資料格式錯誤', 400);
    }

    const { username, email, password, fullName } = req.body;

    // 檢查用戶名是否已存在
    const existingUsers = await query<any[]>(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUsers.length > 0) {
      throw new AppError('用戶名或郵箱已被使用', 409);
    }

    // 雜湊密碼
    const passwordHash = await bcrypt.hash(password, 10);

    // 建立用戶（使用事務）
    const result = await transaction(async (conn) => {
      const [userResult] = await conn.execute(
        `INSERT INTO users (username, email, password_hash, full_name)
         VALUES (?, ?, ?, ?)`,
        [username, email, passwordHash, fullName || null]
      );

      const userId = (userResult as any).insertId;

      // 預設分配 'viewer' 角色
      await conn.execute(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT ?, id FROM roles WHERE name = 'viewer'`,
        [userId]
      );

      return userId;
    });

    // 記錄日誌
    await logAudit(req, {
      action: 'REGISTER',
      resource: 'user',
      resourceId: result,
      details: { username, email },
    });

    res.status(201).json({
      success: true,
      message: '註冊成功',
      data: { userId: result },
    });
  })
);

/**
 * POST /api/auth/login
 * 用戶登入
 */
router.post(
  '/login',
  loginRateLimiter,
  [
    body('username').notEmpty().trim(),
    body('password').notEmpty(),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('請提供用戶名和密碼', 400);
    }

    const { username, password } = req.body;

    // 查詢用戶
    const users = await query<any[]>(
      `SELECT id, username, email, password_hash, full_name, is_active
       FROM users
       WHERE username = ? OR email = ?`,
      [username, username]
    );

    if (users.length === 0) {
      throw new AppError('用戶名或密碼錯誤', 401);
    }

    const user = users[0];

    // 檢查帳號狀態
    if (!user.is_active) {
      throw new AppError('帳號已被停用', 403);
    }

    // 驗證密碼
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new AppError('用戶名或密碼錯誤', 401);
    }

    // 更新最後登入時間
    await query(
      'UPDATE users SET last_login_at = NOW() WHERE id = ?',
      [user.id]
    );

    // 查詢角色
    const roles = await query<any[]>(
      `SELECT r.name, r.display_name
       FROM roles r
       JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = ?`,
      [user.id]
    );

    // 生成 Token
    const token = generateToken(user.id);

    // 記錄日誌
    await logAudit(req, {
      action: 'LOGIN',
      resource: 'user',
      resourceId: user.id,
      details: { username: user.username },
    });

    res.json({
      success: true,
      message: '登入成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name,
          roles: roles.map((r) => ({
            name: r.name,
            displayName: r.display_name,
          })),
        },
      },
    });
  })
);

/**
 * POST /api/auth/logout
 * 用戶登出（主要用於記錄日誌）
 */
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    await logAudit(req, {
      action: 'LOGOUT',
      resource: 'user',
      resourceId: req.user!.id,
    });

    res.json({
      success: true,
      message: '登出成功',
    });
  })
);

/**
 * GET /api/auth/me
 * 取得當前用戶資訊
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await query<any[]>(
      `SELECT id, username, email, full_name, last_login_at, created_at
       FROM users
       WHERE id = ?`,
      [req.user!.id]
    );

    if (user.length === 0) {
      throw new AppError('用戶不存在', 404);
    }

    res.json({
      success: true,
      data: {
        ...user[0],
        roles: req.user!.roles,
        permissions: req.user!.permissions,
      },
    });
  })
);

/**
 * PUT /api/auth/password
 * 修改密碼
 */
router.put(
  '/password',
  authenticate,
  [
    body('oldPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('密碼格式錯誤（至少 8 字元）', 400);
    }

    const { oldPassword, newPassword } = req.body;

    // 查詢當前密碼
    const users = await query<any[]>(
      'SELECT password_hash FROM users WHERE id = ?',
      [req.user!.id]
    );

    if (users.length === 0) {
      throw new AppError('用戶不存在', 404);
    }

    // 驗證舊密碼
    const isOldPasswordValid = await bcrypt.compare(
      oldPassword,
      users[0].password_hash
    );

    if (!isOldPasswordValid) {
      throw new AppError('舊密碼錯誤', 401);
    }

    // 雜湊新密碼
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // 更新密碼
    await query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newPasswordHash, req.user!.id]
    );

    // 記錄日誌
    await logAudit(req, {
      action: 'CHANGE_PASSWORD',
      resource: 'user',
      resourceId: req.user!.id,
    });

    res.json({
      success: true,
      message: '密碼修改成功',
    });
  })
);

export default router;
