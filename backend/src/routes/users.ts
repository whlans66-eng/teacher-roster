/**
 * 用戶管理路由（基礎版本）
 */
import express from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { autoAuditLog } from '../middleware/auditLog';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('admin', 'manager')); // 只有管理員可以管理用戶
router.use(autoAuditLog('user'));

// TODO: 實作用戶管理 CRUD
router.get('/', (req, res) => {
  res.json({ success: true, data: [], message: '用戶管理 API 開發中' });
});

export default router;
