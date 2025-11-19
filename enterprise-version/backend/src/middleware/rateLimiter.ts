/**
 * 限流中介層
 */
import rateLimit from 'express-rate-limit';

// 一般 API 限流：每 15 分鐘 100 次請求
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 100, // 最多 100 次請求
  message: {
    success: false,
    message: '請求次數過多，請稍後再試',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 登入限流：每 15 分鐘 5 次嘗試
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: '登入嘗試次數過多，請 15 分鐘後再試',
  },
  skipSuccessfulRequests: true, // 成功的請求不計入
});

// 註冊限流：每小時 3 次
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 小時
  max: 3,
  message: {
    success: false,
    message: '註冊請求過於頻繁，請稍後再試',
  },
});
