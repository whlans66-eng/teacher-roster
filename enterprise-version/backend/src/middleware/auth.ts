/**
 * JWT 認證中介層
 */
import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { AppError } from './errorHandler';
import { query } from '../config/database';
import { logger } from '../utils/logger';

// 擴展 Express Request 類型
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        email: string;
        roles: string[];
        permissions: string[];
      };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-please-change';

/**
 * 驗證 JWT Token
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // 從 Header 取得 Token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('未提供認證 Token', 401);
    }

    const token = authHeader.substring(7);

    // 驗證 Token
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('Token 已過期，請重新登入', 401);
      }
      throw new AppError('Token 無效', 401);
    }

    // 查詢用戶資料
    const users = await query<any[]>(
      `SELECT u.id, u.username, u.email, u.is_active
       FROM users u
       WHERE u.id = ? AND u.is_active = TRUE`,
      [decoded.userId]
    );

    if (users.length === 0) {
      throw new AppError('用戶不存在或已被停用', 401);
    }

    const user = users[0];

    // 查詢用戶角色
    const roles = await query<any[]>(
      `SELECT r.name
       FROM roles r
       JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = ?`,
      [user.id]
    );

    // 查詢用戶權限
    const permissions = await query<any[]>(
      `SELECT DISTINCT p.name
       FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       JOIN user_roles ur ON rp.role_id = ur.role_id
       WHERE ur.user_id = ?`,
      [user.id]
    );

    // 設定 req.user
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      roles: roles.map((r) => r.name),
      permissions: permissions.map((p) => p.name),
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * 檢查角色
 */
export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('未認證', 401));
    }

    const hasRole = req.user.roles.some((role) =>
      allowedRoles.includes(role)
    );

    if (!hasRole) {
      logger.warn(`權限不足: 用戶 ${req.user.username} 嘗試存取需要角色 ${allowedRoles.join(', ')} 的資源`);
      return next(new AppError('權限不足', 403));
    }

    next();
  };
};

/**
 * 檢查權限
 */
export const requirePermission = (...requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('未認證', 401));
    }

    // 管理員擁有所有權限
    if (req.user.roles.includes('admin')) {
      return next();
    }

    const hasPermission = requiredPermissions.every((permission) =>
      req.user!.permissions.includes(permission)
    );

    if (!hasPermission) {
      logger.warn(`權限不足: 用戶 ${req.user.username} 嘗試存取需要權限 ${requiredPermissions.join(', ')} 的資源`);
      return next(new AppError('權限不足', 403));
    }

    next();
  };
};

/**
 * 可選認證（允許未登入訪問，但如果有 Token 就驗證）
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  // 如果有 Token，就進行認證
  return authenticate(req, res, next);
};

/**
 * 生成 JWT Token
 */
export const generateToken = (userId: number): string => {
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: expiresIn as any }
  );
};
