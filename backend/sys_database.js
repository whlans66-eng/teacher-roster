/**
 * Fabric SQL Database 連線模組
 */
const sql = require('mssql');
const { ClientSecretCredential } = require('@azure/identity');
const _rawSchema = process.env.DB_SCHEMA;
const SCHEMA_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;
const SCHEMA = _rawSchema;

let pool = null;
let tokenExpiry = 0;
let connectingPromise = null;
let credential = null;

const SQL_CONNECT_MAX_ATTEMPTS = Number(process.env.SQL_CONNECT_MAX_ATTEMPTS || 3);
const SQL_CONNECT_RETRY_DELAY_MS = Number(process.env.SQL_CONNECT_RETRY_DELAY_MS || 500);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCredential() {
    if (!credential) {
        credential = new ClientSecretCredential(
            process.env.FABRIC_TENANT_ID,
            process.env.FABRIC_CLIENT_ID,
            process.env.FABRIC_CLIENT_SECRET
        );
    }

    return credential;
}

function validateSchema() {
    if (!SCHEMA || !SCHEMA_PATTERN.test(SCHEMA)) {
        throw new Error(`環境變數 DB_SCHEMA 值無效："${SCHEMA}"，僅允許英數字與底線`);
    }
}

async function closeExistingPool() {
    if (!pool) return;

    try {
        await pool.close();
    } catch (e) {
        console.warn('關閉舊連線時發生錯誤:', e.message);
    }

    pool = null;
}

async function createConnection() {
    await closeExistingPool();

    const tokenResponse = await getCredential().getToken('https://database.windows.net/.default');
    tokenExpiry = tokenResponse.expiresOnTimestamp || (Date.now() + 3600000);

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
            idleTimeoutMillis: 15 * 60 * 1000
        }
    };

    pool = await sql.connect(config);
    console.log('✅ 已連接 Fabric SQL Database');
    return pool;
}

async function createConnectionWithRetry() {
    const maxAttempts = Number.isFinite(SQL_CONNECT_MAX_ATTEMPTS) && SQL_CONNECT_MAX_ATTEMPTS > 0
        ? SQL_CONNECT_MAX_ATTEMPTS
        : 3;
    const retryDelayMs = Number.isFinite(SQL_CONNECT_RETRY_DELAY_MS) && SQL_CONNECT_RETRY_DELAY_MS >= 0
        ? SQL_CONNECT_RETRY_DELAY_MS
        : 500;

    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await createConnection();
        } catch (error) {
            lastError = error;
            tokenExpiry = 0;
            pool = null;

            if (attempt >= maxAttempts) {
                break;
            }

            console.warn(`SQL 連線失敗，準備重試 (${attempt}/${maxAttempts}):`, error.message);
            await sleep(retryDelayMs * attempt);
        }
    }

    throw lastError;
}

/**
 * 取得資料庫連線
 */
async function getConnection() {
    const now = Date.now();
    
    validateSchema();

    // 如果連線存在且 Token 未過期，直接返回
    if (pool && now < tokenExpiry - 60000) {
        return pool;
    }

    if (!connectingPromise) {
        connectingPromise = createConnectionWithRetry();
    }

    try {
        return await connectingPromise;
    } finally {
        connectingPromise = null;
    }
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
