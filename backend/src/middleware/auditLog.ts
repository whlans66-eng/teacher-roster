/**
 * 操作日誌中介層
 */
import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { logger } from '../utils/logger';

export interface AuditLogData {
  action: string;
  resource: string;
  resourceId?: number;
  details?: any;
}

/**
 * 記錄操作日誌
 */
export async function logAudit(
  req: Request,
  data: AuditLogData
): Promise<void> {
  try {
    const userId = req.user?.id || null;
    const username = req.user?.username || 'anonymous';
    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    await query(
      `INSERT INTO audit_logs
       (user_id, username, action, resource, resource_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        username,
        data.action,
        data.resource,
        data.resourceId || null,
        data.details ? JSON.stringify(data.details) : null,
        ipAddress,
        userAgent,
      ]
    );

    logger.info('操作日誌已記錄:', {
      user: username,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
    });
  } catch (error) {
    // 日誌記錄失敗不應影響業務流程
    logger.error('記錄操作日誌失敗:', error);
  }
}

/**
 * 自動記錄 HTTP 操作
 */
export const autoAuditLog = (resource: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // 儲存原始的 json 方法
    const originalJson = res.json.bind(res);

    // 覆寫 res.json 以攔截回應
    res.json = function (body: any) {
      // 根據 HTTP 方法判斷動作
      let action = 'UNKNOWN';
      switch (req.method) {
        case 'GET':
          action = 'VIEW';
          break;
        case 'POST':
          action = 'CREATE';
          break;
        case 'PUT':
        case 'PATCH':
          action = 'UPDATE';
          break;
        case 'DELETE':
          action = 'DELETE';
          break;
      }

      // 只記錄成功的操作（2xx 狀態碼）
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const resourceId = req.params.id || body?.data?.id || null;

        logAudit(req, {
          action,
          resource,
          resourceId,
          details: {
            method: req.method,
            path: req.path,
            body: req.body,
            params: req.params,
          },
        });
      }

      // 呼叫原始的 json 方法
      return originalJson(body);
    };

    next();
  };
};
