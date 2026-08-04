/**
 * 權限檢查模組
 * 整合完整 Token 驗證 + 白名單控管
 * 改用 SQL Database 存取
 */

const { getConnection, sql, SCHEMA } = require('./sys_database');
const { validateToken } = require('./sys_tokenValidator');
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;

function resolveFrontendOrigin() {
    const baseUrl = String(FRONTEND_BASE_URL || '').trim();
    if (!baseUrl) {
        throw new Error('FRONTEND_BASE_URL 未設定，服務啟動失敗。');
    }

    let parsed;
    try {
        parsed = new URL(baseUrl);
    } catch {
        throw new Error(`FRONTEND_BASE_URL 格式錯誤: ${baseUrl}`);
    }

    if (!/^https?:$/.test(parsed.protocol)) {
        throw new Error(`FRONTEND_BASE_URL 協定不支援: ${parsed.protocol}`);
    }

    return parsed.origin;
}

const FRONTEND_ORIGIN = resolveFrontendOrigin();

let cachedPermissions = null;
let cacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000;

function normalizeRole(role) {
    const normalized = String(role || '').trim().toLowerCase();
    if (normalized === 'superadmin') return 'superAdmin';
    if (normalized === 'admin') return 'admin';
    if (normalized === 'alloweduser') return 'allowedUser';
    return null;
}

/**
 * 從 SQL 讀取權限，回傳 [{email, role}] 陣列
 */
async function getPermissions(options = {}) {
    const now = Date.now();
    const cacheStart = Date.now();
    if (cachedPermissions && (now - cacheTime) < CACHE_TTL) {
        reportTiming(options, 'permissionsCache', {
            durationMs: Date.now() - cacheStart,
            hit: true,
            ageMs: now - cacheTime,
            recordCount: cachedPermissions.length
        });
        return cachedPermissions;
    }
    reportTiming(options, 'permissionsCache', {
        durationMs: Date.now() - cacheStart,
        hit: false,
        ageMs: cachedPermissions ? now - cacheTime : null,
        recordCount: cachedPermissions ? cachedPermissions.length : 0
    });

    try {
        const connectionStart = Date.now();
        const pool = await getConnection();
        reportTiming(options, 'permissionsGetConnection', {
            durationMs: Date.now() - connectionStart,
            success: true
        });

        const queryStart = Date.now();
        const result = await pool.request().query(`SELECT email, role FROM ${SCHEMA}.permissions`);
        reportTiming(options, 'permissionsSqlQuery', {
            durationMs: Date.now() - queryStart,
            success: true,
            recordCount: result.recordset.length
        });

        const normalizeStart = Date.now();
        const records = result.recordset
            .filter(row => row.email && row.role)
            .map(row => ({
                email: String(row.email).trim().toLowerCase(),
                role: normalizeRole(row.role)
            }))
            .filter(row => row.role);
        reportTiming(options, 'permissionsNormalize', {
            durationMs: Date.now() - normalizeStart,
            recordCount: records.length
        });

        cachedPermissions = records;
        cacheTime = now;
        return records;

    } catch (error) {
        console.error('讀取權限設定失敗:', error);
        throw error;
    }
}

/**
 * 儲存權限設定（完整覆蓋）
 * 接收 [{email, role}] 陣列
 */
async function savePermissions(records, userEmail = 'system') {
    const pool = await getConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
        await transaction.request().query(`DELETE FROM ${SCHEMA}.permissions`);

        for (const { email, role } of records) {
            const normalizedRole = normalizeRole(role);
            if (!normalizedRole) {
                throw new Error(`無效角色: ${role}`);
            }

            await transaction.request()
                .input('email', sql.NVarChar, String(email).trim().toLowerCase())
                .input('role', sql.NVarChar, normalizedRole)
                .input('updatedBy', sql.NVarChar, userEmail)
                .query(`
                    INSERT INTO ${SCHEMA}.permissions (email, role, updatedBy)
                    VALUES (@email, @role, @updatedBy)
                `);
        }

        await transaction.commit();
        // 快取時統一 lowercase，與 validateRequest 的比對邏輯一致
        cachedPermissions = records
            .map(r => ({
                email: String(r.email).trim().toLowerCase(),
                role: normalizeRole(r.role)
            }))
            .filter(r => r.role);
        cacheTime = Date.now();

    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

/**
 * 新增單一使用者權限
 */
async function addPermission(email, role, userEmail) {
    const pool = await getConnection();
    const emailLower = String(email).trim().toLowerCase();
    const normalizedRole = normalizeRole(role);

    if (!normalizedRole) {
        throw new Error('無效的角色，僅允許 superAdmin/admin/allowedUser');
    }
    
    // 檢查是否已存在
    const existing = await pool.request()
        .input('email', sql.NVarChar, emailLower)
        .input('role', sql.NVarChar, normalizedRole)
        .query(`SELECT id FROM ${SCHEMA}.permissions WHERE email = @email AND role = @role`);
    
    if (existing.recordset.length > 0) {
        return { success: true, message: '權限已存在' };
    }
    
    await pool.request()
        .input('email', sql.NVarChar, emailLower)
        .input('role', sql.NVarChar, normalizedRole)
        .input('updatedBy', sql.NVarChar, userEmail)
        .query(`
            INSERT INTO ${SCHEMA}.permissions (email, role, updatedBy)
            VALUES (@email, @role, @updatedBy)
        `);
    
    // 清除快取
    clearCache();
    return { success: true };
}

/**
 * 移除單一使用者權限
 */
async function removePermission(email, role, userEmail) {
    const pool = await getConnection();
    const emailLower = String(email).trim().toLowerCase();
    const normalizedRole = normalizeRole(role);

    if (!normalizedRole) {
        return { success: true };
    }
    
    await pool.request()
        .input('email', sql.NVarChar, emailLower)
        .input('role', sql.NVarChar, normalizedRole)
        .query(`DELETE FROM ${SCHEMA}.permissions WHERE email = @email AND role = @role`);
    
    // 清除快取
    clearCache();
    return { success: true };
}

/**
 * 清除快取
 */
function clearCache() {
    cachedPermissions = null;
    cacheTime = 0;
}

function reportTiming(options, step, details) {
    if (typeof options?.onTiming === 'function') {
        options.onTiming(step, details);
    }
}

/**
 * 完整驗證請求並取得使用者資訊
 */
async function validateRequest(authHeader, options = {}) {
    // Step 1: 完整 Token 驗證
    const tokenStart = Date.now();
    const tokenInfo = await validateToken(authHeader);
    reportTiming(options, 'validateToken', {
        durationMs: Date.now() - tokenStart,
        success: !!tokenInfo?.success,
        source: tokenInfo?.source || tokenInfo?.from || 'entra'
    });
    
    if (!tokenInfo || !tokenInfo.success) {
        console.warn('Token 驗證失敗:', tokenInfo?.error);
        return null;
    }

    const email = tokenInfo.email;
    if (!email) return null;

    // 白名單檢查 + 角色判定
    const permissionsStart = Date.now();
    const records = await getPermissions(options);
    reportTiming(options, 'getPermissions', {
        durationMs: Date.now() - permissionsStart,
        recordCount: records.length
    });

    const roleMatchStart = Date.now();
    const emailLower = email.toLowerCase();
    const roles = records
        .filter(r => r.email === emailLower)
        .map(r => r.role)
        .filter(Boolean);
    reportTiming(options, 'matchRoles', {
        durationMs: Date.now() - roleMatchStart,
        roleCount: roles.length
    });

    const isSuperAdmin = roles.includes('superAdmin');
    const isAdmin      = isSuperAdmin || roles.includes('admin');
    const allowed      = isAdmin || roles.includes('allowedUser');

    return {
        email,
        name: tokenInfo.name || email,
        from: tokenInfo.source || tokenInfo.from,
        isSsoGuest: !!tokenInfo.isSsoGuest,
        isSuperAdmin,
        isAdmin,
        allowed
    };
}

/**
 * CORS Headers
 */
function getCorsHeaders(origin = '') {
    const requestOrigin = String(origin || '').trim();
    const allowOrigin = requestOrigin && requestOrigin === FRONTEND_ORIGIN
        ? requestOrigin
        : FRONTEND_ORIGIN;

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Credentials': 'true',
        Vary: 'Origin'
    };
}

module.exports = {
    getPermissions,
    savePermissions,
    addPermission,
    removePermission,
    clearCache,
    validateRequest,
    getCorsHeaders
};
