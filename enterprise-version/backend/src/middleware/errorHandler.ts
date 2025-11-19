/**
 * 全域錯誤處理中介層
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 預設狀態碼
  let statusCode = 500;
  let message = '伺服器內部錯誤';
  let isOperational = false;

  // 處理自定義錯誤
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
  }

  // 處理 MySQL 錯誤
  if ('code' in err) {
    const mysqlError = err as any;
    switch (mysqlError.code) {
      case 'ER_DUP_ENTRY':
        statusCode = 409;
        message = '資料已存在';
        break;
      case 'ER_NO_REFERENCED_ROW_2':
        statusCode = 400;
        message = '參考的資料不存在';
        break;
      case 'ER_ROW_IS_REFERENCED_2':
        statusCode = 409;
        message = '資料正在被使用，無法刪除';
        break;
      case 'ECONNREFUSED':
        statusCode = 503;
        message = '資料庫連線失敗';
        break;
    }
  }

  // 處理 JWT 錯誤
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Token 無效';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token 已過期';
  }

  // 處理驗證錯誤
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
  }

  // 記錄錯誤
  if (statusCode >= 500) {
    logger.error('伺服器錯誤:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      user: (req as any).user?.id,
    });
  } else {
    logger.warn('客戶端錯誤:', {
      message: err.message,
      url: req.originalUrl,
      method: req.method,
      statusCode,
    });
  }

  // 回應錯誤
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      error: err.message,
      stack: err.stack,
    }),
  });
};

// 非同步錯誤包裝器
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
