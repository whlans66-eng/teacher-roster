/**
 * Fabric SQL Database 連線模組
 */
const sql = require('mssql');
const { ClientSecretCredential } = require('@azure/identity');
const SCHEMA = process.env.DB_SCHEMA;

let pool = null;
let tokenExpiry = 0;

/**
 * 取得資料庫連線
 */
async function getConnection() {
    const now = Date.now();
    
    // 如果連線存在且 Token 未過期，直接返回
    if (pool && now < tokenExpiry - 60000) {
        return pool;
    }

    // 關閉舊連線
    if (pool) {
        try {
            await pool.close();
        } catch (e) {
            console.warn('關閉舊連線時發生錯誤:', e.message);
        }
        pool = null;
    }

    // 使用 Service Principal 取得 Token
    const credential = new ClientSecretCredential(
        process.env.FABRIC_TENANT_ID,
        process.env.FABRIC_CLIENT_ID,
        process.env.FABRIC_CLIENT_SECRET
    );

    const tokenResponse = await credential.getToken('https://database.windows.net/.default');
    
    // 記錄 Token 過期時間
    tokenExpiry = tokenResponse.expiresOnTimestamp || (now + 3600000);

    const config = {
        server: process.env.FABRIC_SQL_SERVER,
        database: process.env.FABRIC_SQL_DATABASE,
        authentication: {
            type: 'azure-active-directory-access-token',
            options: {
                token: tokenResponse.token
            }
        },
        options: {
            encrypt: true,
            trustServerCertificate: false
        },
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
        }
    };

    pool = await sql.connect(config);
    console.log('✅ 已連接 Fabric SQL Database');
    return pool;
}

/**
 * 關閉連線
 */
async function closeConnection() {
    if (pool) {
        await pool.close();
        pool = null;
        console.log('✅ 已關閉 SQL 連線');
    }
}

module.exports = { getConnection, closeConnection, sql, SCHEMA };
