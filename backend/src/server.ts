/**
 * 教師排課系統 - 後端 API 入口
 */
import dotenv from 'dotenv';
dotenv.config();

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { logger } from './utils/logger';
import { testConnection } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';

// 路由
import authRoutes from './routes/auth';
import teacherRoutes from './routes/teachers';
import courseRoutes from './routes/courses';
import assignmentRoutes from './routes/assignments';
import surveyRoutes from './routes/surveys';
import userRoutes from './routes/users';
import auditRoutes from './routes/audit';

const app: Express = express();
const PORT = process.env.PORT || 3001;

// =====================================================
// 中介層
// =====================================================

// 安全性標頭
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// 壓縮
app.use(compression());

// 解析 JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP 請求日誌
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  }));
}

// 限流
app.use('/api', rateLimiter);

// =====================================================
// 路由
// =====================================================

// 健康檢查
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit', auditRoutes);

// 404 處理
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `路由 ${req.method} ${req.path} 不存在`,
  });
});

// 錯誤處理
app.use(errorHandler);

// =====================================================
// 啟動伺服器
// =====================================================

async function startServer() {
  try {
    // 測試資料庫連線
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('❌ 無法連接資料庫，伺服器啟動失敗');
      process.exit(1);
    }

    // 啟動 HTTP 伺服器
    app.listen(PORT, () => {
      logger.info(`🚀 伺服器已啟動在 http://localhost:${PORT}`);
      logger.info(`📝 環境：${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔒 CORS Origin：${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
    });
  } catch (error) {
    logger.error('❌ 伺服器啟動失敗:', error);
    process.exit(1);
  }
}

// 處理未捕獲的錯誤
process.on('unhandledRejection', (reason: any) => {
  logger.error('未處理的 Promise 拒絕:', reason);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('未捕獲的例外:', error);
  process.exit(1);
});

// 啟動
startServer();

export default app;
