/**
 * 問卷路由（基礎版本）
 */
import express from 'express';
import { authenticate, optionalAuth } from '../middleware/auth';
import { autoAuditLog } from '../middleware/auditLog';

const router = express.Router();

// 查看問卷可以不需要認證（公開問卷）
router.get('/public/:shareUrl', optionalAuth, (req, res) => {
  res.json({ success: true, data: null, message: '公開問卷 API 開發中' });
});

// 其他操作需要認證
router.use(authenticate);
router.use(autoAuditLog('survey'));

// TODO: 實作問卷 CRUD
router.get('/', (req, res) => {
  res.json({ success: true, data: [], message: '問卷 API 開發中' });
});

export default router;
