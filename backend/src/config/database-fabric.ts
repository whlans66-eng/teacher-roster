/**
 * Microsoft Fabric Warehouse/Lakehouse 資料庫連線配置
 *
 * 支援兩種連線方式：
 * 1. Fabric Warehouse - 使用 SQL Endpoint
 * 2. Fabric Lakehouse - 使用 SQL Analytics Endpoint
 */

import sql from 'mssql';
import { logger } from '../utils/logger';

// Fabric 連線配置
const fabricConfig: sql.config = {
  // Fabric Warehouse/Lakehouse SQL Endpoint
  server: process.env.FABRIC_SERVER || '', // 例如: xxx.datawarehouse.fabric.microsoft.com
  database: process.env.FABRIC_DATABASE || '',

  // 驗證方式 - Fabric 支援多種方式
  authentication: {
    type: (process.env.FABRIC_AUTH_TYPE as any) || 'azure-active-directory-default',
    options: {
      // 如果使用 Service Principal
      clientId: process.env.FABRIC_CLIENT_ID,
      clientSecret: process.env.FABRIC_CLIENT_SECRET,
      tenantId: process.env.FABRIC_TENANT_ID,
    }
  },

  options: {
    encrypt: true, // Fabric 強制使用加密
    trustServerCertificate: false,
    connectTimeout: 30000,
    requestTimeout: 30000,

    // 設定時區
    useUTC: false,
  },

  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// 建立連線池
let pool: sql.ConnectionPool | null = null;

/**
 * 取得資料庫連線池
 */
export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = new sql.ConnectionPool(fabricConfig);
    await pool.connect();
    logger.info('✅ Fabric Warehouse 連線池已建立');
  }
  return pool;
}

/**
 * 測試 Fabric Warehouse 連線
 */
export async function testConnection(): Promise<boolean> {
  try {
    const poolConnection = await getPool();
    const result = await poolConnection.request().query(`
      SELECT
        @@VERSION as version,
        DB_NAME() as database_name,
        GETDATE() as current_time
    `);

    const dbInfo = result.recordset[0];
    logger.info('✅ Fabric Warehouse 連線成功', {
      server: process.env.FABRIC_SERVER,
      database: dbInfo.database_name,
      version: dbInfo.version,
      currentTime: dbInfo.current_time,
      authType: process.env.FABRIC_AUTH_TYPE || 'azure-active-directory-default',
    });

    return true;
  } catch (error) {
    logger.error('❌ Fabric Warehouse 連線失敗:', error);
    return false;
  }
}

/**
 * 執行查詢（帶參數化查詢防止 SQL Injection）
 */
export async function query<T = any>(
  sqlQuery: string,
  params?: Record<string, any>
): Promise<T[]> {
  const start = Date.now();

  try {
    const poolConnection = await getPool();
    const request = poolConnection.request();

    // 添加參數
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        request.input(key, value);
      });
    }

    const result = await request.query(sqlQuery);
    const duration = Date.now() - start;

    logger.debug(`Fabric SQL 執行成功 (${duration}ms):`, {
      sql: sqlQuery,
      params,
      rowCount: result.recordset.length
    });

    return result.recordset as T[];
  } catch (error) {
    logger.error('Fabric SQL 執行失敗:', { sql: sqlQuery, params, error });
    throw error;
  }
}

/**
 * 執行單筆查詢
 */
export async function queryOne<T = any>(
  sqlQuery: string,
  params?: Record<string, any>
): Promise<T | null> {
  const results = await query<T>(sqlQuery, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * 執行事務（Fabric Warehouse 支援交易）
 */
export async function transaction<T>(
  callback: (transaction: sql.Transaction) => Promise<T>
): Promise<T> {
  const poolConnection = await getPool();
  const txn = new sql.Transaction(poolConnection);

  try {
    await txn.begin();
    const result = await callback(txn);
    await txn.commit();
    logger.info('✅ 事務提交成功');
    return result;
  } catch (error) {
    await txn.rollback();
    logger.error('❌ 事務回滾:', error);
    throw error;
  }
}

/**
 * 執行非查詢命令（INSERT, UPDATE, DELETE）
 */
export async function execute(
  sqlQuery: string,
  params?: Record<string, any>
): Promise<number> {
  const start = Date.now();

  try {
    const poolConnection = await getPool();
    const request = poolConnection.request();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        request.input(key, value);
      });
    }

    const result = await request.query(sqlQuery);
    const duration = Date.now() - start;

    logger.debug(`Fabric SQL 執行成功 (${duration}ms):`, {
      sql: sqlQuery,
      params,
      rowsAffected: result.rowsAffected[0]
    });

    return result.rowsAffected[0] || 0;
  } catch (error) {
    logger.error('Fabric SQL 執行失敗:', { sql: sqlQuery, params, error });
    throw error;
  }
}

/**
 * 關閉連線池（用於優雅關閉）
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
    logger.info('🔌 Fabric Warehouse 連線池已關閉');
  }
}

// 處理程序結束時關閉連線
process.on('SIGINT', async () => {
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closePool();
  process.exit(0);
});

export default {
  getPool,
  testConnection,
  query,
  queryOne,
  transaction,
  execute,
  closePool,
};
