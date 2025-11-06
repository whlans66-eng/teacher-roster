/**
 * 資料庫連線配置
 */
import mysql from 'mysql2/promise';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

// SSL 配置（用於 Azure Database for MySQL）
let sslConfig: any = undefined;
if (process.env.DB_SSL_MODE === 'REQUIRED' && process.env.DB_SSL_CA) {
  try {
    const caPath = process.env.DB_SSL_CA;
    if (fs.existsSync(caPath)) {
      sslConfig = {
        ca: fs.readFileSync(caPath),
        rejectUnauthorized: true,
      };
      logger.info('✅ SSL 憑證已載入，將使用加密連線');
    } else {
      logger.warn(`⚠️ SSL 憑證檔案不存在：${caPath}`);
    }
  } catch (error) {
    logger.error('❌ 載入 SSL 憑證失敗:', error);
  }
}

const dbConfig: mysql.PoolOptions = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'teacher_roster',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: '+08:00', // 台灣時區
  ssl: sslConfig, // Azure Database for MySQL SSL 支援
};

// 建立連線池
export const pool = mysql.createPool(dbConfig);

/**
 * 測試資料庫連線
 */
export async function testConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query('SELECT VERSION() as version, @@hostname as hostname');
    const dbInfo = (rows as any)[0];
    logger.info('✅ 資料庫連線成功', {
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      version: dbInfo.version,
      hostname: dbInfo.hostname,
      ssl: sslConfig ? '已啟用' : '未啟用',
    });
    connection.release();
    return true;
  } catch (error) {
    logger.error('❌ 資料庫連線失敗:', error);
    return false;
  }
}

/**
 * 執行查詢（帶日誌）
 */
export async function query<T = any>(sql: string, params?: any[]): Promise<T> {
  const start = Date.now();
  try {
    const [rows] = await pool.execute(sql, params);
    const duration = Date.now() - start;
    logger.debug(`SQL 執行成功 (${duration}ms):`, { sql, params });
    return rows as T;
  } catch (error) {
    logger.error('SQL 執行失敗:', { sql, params, error });
    throw error;
  }
}

/**
 * 執行事務
 */
export async function transaction<T>(
  callback: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export default pool;
