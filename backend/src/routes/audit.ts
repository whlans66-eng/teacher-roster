/**
 * 操作日誌路由
 */
import express, { Request, Response } from 'express';
import { query } from '../config/database';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

router.use(authenticate);
router.use(requirePermission('system.logs'));

/**
 * GET /api/audit
 * 取得操作日誌列表
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const {
      userId,
      action,
      resource,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    let sql = `
      SELECT id, user_id, username, action, resource, resource_id,
             details, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE 1=1
    `;
    const params: any[] = [];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    if (action) {
      sql += ' AND action = ?';
      params.push(action);
    }

    if (resource) {
      sql += ' AND resource = ?';
      params.push(resource);
    }

    if (startDate) {
      sql += ' AND created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND created_at <= ?';
      params.push(endDate);
    }

    const offset = (Number(page) - 1) * Number(limit);
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);

    const logs = await query<any[]>(sql, params);

    // 解析 details JSON
    const formattedLogs = logs.map((log) => ({
      ...log,
      details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details,
    }));

    res.json({
      success: true,
      data: formattedLogs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
      },
    });
  })
);

export default router;
