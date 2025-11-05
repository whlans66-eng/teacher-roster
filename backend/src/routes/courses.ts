/**
 * 課程路由（基礎版本）
 */
import express from 'express';
import { authenticate } from '../middleware/auth';
import { autoAuditLog } from '../middleware/auditLog';

const router = express.Router();

router.use(authenticate);
router.use(autoAuditLog('course'));

// TODO: 實作課程 CRUD
router.get('/', (req, res) => {
  res.json({ success: true, data: [], message: '課程 API 開發中' });
});

export default router;
