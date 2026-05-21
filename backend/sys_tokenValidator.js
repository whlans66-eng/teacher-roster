/**
 * Token 驗證模組
 * 完整驗證 Microsoft Entra ID (Azure AD) 發出的 JWT Token
 * 
 * 驗證項目：
 * 1. 簽章 (Signature) - 用 Microsoft 公鑰驗證
 * 2. 發行者 (iss) - 必須是指定租戶
 * 3. 對象 (aud) - 必須是我們的 App
 * 4. 過期時間 (exp) - 必須未過期
 * 5. 生效時間 (nbf) - 必須已生效
 */

const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
// 是否跳過完整驗證（除錯用）
const SKIP_FULL_VALIDATION = process.env.SKIP_TOKEN_VALIDATION === 'true';

// 設定
const TENANT_ID = process.env.FABRIC_TENANT_ID;  // 共用同一個 Tenant ID
const CLIENT_ID = process.env.MSAL_CLIENT_ID || process.env.FABRIC_CLIENT_ID;  // 前端 App 的 Client ID

const JWT_SECRET = process.env.JWT_SECRET;
const SSO_JWT_ISSUER = process.env.SSO_JWT_ISSUER;
const SSO_JWT_AUDIENCE = process.env.SSO_JWT_AUDIENCE;
const SSO_ENABLED = process.env.SSO_ENABLED === 'true';

// JWKS 客戶端（用於取得 Microsoft 公鑰）
let jwksClientInstance = null;

/**
 * 取得 JWKS 客戶端
 */
function getJwksClient() {
    if (jwksClientInstance) return jwksClientInstance;

    if (!TENANT_ID) {
        throw new Error('環境變數 FABRIC_TENANT_ID 未設定');
    }

    jwksClientInstance = jwksClient({
        jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 600000  // 10 分鐘
    });

    return jwksClientInstance;
}

/**
 * 取得簽章金鑰
 */
function getSigningKey(header, callback) {
    const client = getJwksClient();
    client.getSigningKey(header.kid, (err, key) => {
        if (err) {
            callback(err, null);
            return;
        }
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
}

/**
 * 驗證 Token（Promise 版本）
 */
function verifyTokenAsync(token) {
    return new Promise((resolve, reject) => {
        if (!TENANT_ID) {
            reject(new Error('Token 驗證設定不完整：缺少 FABRIC_TENANT_ID'));
            return;
        }

        const options = {
            // 驗證發行者
            issuer: [
                `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
                `https://sts.windows.net/${TENANT_ID}/`,
				`https://login.microsoftonline.com/${TENANT_ID}/`
            ],
            // 驗證對象：接受 Graph Token 或自訂 API Token
            audience: [
                CLIENT_ID,
                `api://${CLIENT_ID}`
            ].filter(Boolean),  // 過濾掉 undefined
            // 驗證演算法
            algorithms: ['RS256']
        };

        jwt.verify(token, getSigningKey, options, (err, decoded) => {
            if (err) {
                // 加入這行，以後在 Azure Portal 的 Log 就能秒懂失敗原因
                console.error(`[Token Auth] 驗證失敗: ${err.message}, Token 發行者: ${jwt.decode(token)?.iss}`);
                reject(err);
            } else {
                resolve(decoded);
            }
        });
    });
}

/**
 * 判斷是否為 自簽 JWT
 */
function isSsoToken(token) {
    try {
        if (!SSO_JWT_ISSUER) {
            return false;
        }
        const decoded = jwt.decode(token);
        return decoded?.iss === SSO_JWT_ISSUER;
    } catch {
        return false;
    }
}

/**
 * 驗證 JWT
 */
function verifySsoToken(token) {
    try {
        if (!JWT_SECRET) {
            return { success: false, error: 'JWT_SECRET 未設定' };
        }
        if (!SSO_JWT_ISSUER || !SSO_JWT_AUDIENCE) {
            return { success: false, error: 'SSO_JWT_ISSUER 或 SSO_JWT_AUDIENCE 未設定' };
        }
        const decoded = jwt.verify(token, JWT_SECRET, {
            algorithms: ['HS256'],
            audience: SSO_JWT_AUDIENCE,
            issuer: SSO_JWT_ISSUER
        });

        const source = decoded.source || decoded.from;
        const account = (decoded.account || '').toString().trim().toLowerCase();

        if (!source || !account) {
            return { success: false, error: 'SSO Token 缺少 source/account' };
        }

        return {
            success: true,
            // 權限比對鍵值只使用 account；source 僅用於來源驗證與追蹤
            email: account,
            name: '訪客',
            source,
            account,
            isSsoGuest: true
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 從 Authorization Header 驗證並取得使用者資訊
 * 
 * @param {string} authHeader - Authorization header (Bearer xxx)
 * @returns {Promise<object|null>} - 使用者資訊或 null
 */
async function validateToken(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { success: false, error: '缺少 Authorization Header' };
    }

    const token = authHeader.substring(7);
	
    // SSO token 分流，不走 Entra 驗證
    if (isSsoToken(token)) {
        if (!SSO_ENABLED) {
            return { success: false, error: 'SSO 未啟用' };
        }
        return verifySsoToken(token);
    }

    if (SKIP_FULL_VALIDATION) {
        const payload = parseTokenWithoutValidation(authHeader);
        if (!payload) return null;
        const email = (payload.preferred_username || payload.email || payload.upn || '').toLowerCase();
        return {
            success: true,
            email,
            name: payload.name || email,
            oid: payload.oid,
            tid: payload.tid
        };
    }

    try {
        const decoded = await verifyTokenAsync(token);

        // 取得 email（可能在不同欄位）
        const email = (
            decoded.preferred_username ||
            decoded.email ||
            decoded.upn ||
            decoded.unique_name ||
            ''
        ).toString().toLowerCase();

        if (!email) {
            console.error('Token 中沒有 email 資訊');
            return { success: false, error: 'Token 中找不到有效的使用者識別' };
        }

        return {
            success: true,
            email: email,
            name: decoded.name || email,
            oid: decoded.oid,
            tid: decoded.tid
        };

    } catch (error) {
        // 詳細的錯誤訊息
        if (error.name === 'TokenExpiredError') {
            console.error('Token 已過期:', error.expiredAt);
        } else if (error.name === 'JsonWebTokenError') {
            console.error('Token 無效:', error.message);
        } else if (error.name === 'NotBeforeError') {
            console.error('Token 尚未生效:', error.date);
        } else {
            console.error('Token 驗證失敗:', error.message);
        }
        return { 
            success: false, 
            error: error.message, 
            detail: "Token 驗證程序發生異常",
            errorType: error.name,
            debug: {
                tenantIdUsed: process.env.FABRIC_TENANT_ID,
                issuerInToken: jwt.decode(token)?.iss
            }
        };
    }
}

/**
 * 簡單解析 Token（不驗證，僅除錯用）
 */
function parseTokenWithoutValidation(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    try {
        const token = authHeader.substring(7);
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        return payload;
    } catch (e) {
        return null;
    }
}

module.exports = {
    validateToken,
    parseTokenWithoutValidation,
	isSsoToken,
	verifySsoToken
};
