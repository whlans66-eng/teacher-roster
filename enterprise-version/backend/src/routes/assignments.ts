/**
 * 派課路由（基礎版本）
 */
import express from 'express';
import { authenticate } from '../middleware/auth';
import { autoAuditLog } from '../middleware/auditLog';

const router = express.Router();

router.use(authenticate);
router.use(autoAuditLog('assignment'));

// TODO: 實作派課 CRUD + 衝堂檢查
router.get('/', (req, res) => {
  res.json({ success: true, data: [], message: '派課 API 開發中' });
});

export default router;
