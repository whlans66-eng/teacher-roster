/**
 * SSO 外部平台驗證端點
 * POST /api/auth/sso  { token: "..." }
 */
const { app } = require('@azure/functions');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getCorsHeaders, getPermissions } = require('./sys_permissions');
const crud = require('./crud');

const JWT_SECRET = process.env.JWT_SECRET;
const AES_SECRET = process.env.AES_SECRET;
const SSO_JWT_ISSUER = process.env.SSO_JWT_ISSUER;
const SSO_JWT_AUDIENCE = process.env.SSO_JWT_AUDIENCE;
const SSO_ENABLED = process.env.SSO_ENABLED === 'true';
const TTL_SECONDS = 60;
const CLOCK_SKEW = 300;

function getSourceHmacEnvName(source) {
    return `${source.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_HMAC_SECRET`;
}

function aesDecrypt(encryptedToken, secret) {
    const key = Buffer.from(secret, 'hex');
    const buf = Buffer.from(encryptedToken, 'base64');
    const iv = buf.slice(0, 16);
    const encrypted = buf.slice(16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// 支援秒與毫秒時間戳：13 碼視為毫秒，10 碼視為秒
function normalizeTimestampSeconds(rawTimestamp) {
    const ts = Number(rawTimestamp);
    if (!Number.isFinite(ts)) return NaN;
    return ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
}

app.http('ssoAuth', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'auth/sso',
    handler: async (request, context) => {
        const corsHeaders = getCorsHeaders();

        if (!SSO_ENABLED) {
            return {
                status: 404,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'Not Found' }
            };
        }

        if (request.method === 'OPTIONS') {
            return { status: 204, headers: corsHeaders };
        }

        try {
            let encryptedToken;

            try {
                const body = await request.json();
                encryptedToken = body?.token;
            } catch {
                // Ignore parse error and fall through to missing-parameter response.
            }

            if (!encryptedToken) {
                return {
                    status: 400,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: '缺少必要參數' }
                };
            }

            if (!AES_SECRET || !JWT_SECRET || !SSO_JWT_ISSUER || !SSO_JWT_AUDIENCE) {
                context.error('環境變數 AES_SECRET、JWT_SECRET、SSO_JWT_ISSUER 或 SSO_JWT_AUDIENCE 未設定');
                return {
                    status: 500,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: '伺服器設定錯誤' }
                };
            }

            let source, account, timestamp, sig;
            try {
                const decrypted = aesDecrypt(encryptedToken, AES_SECRET);
                [source, account, timestamp, sig] = decrypted.split('|');
            } catch (e) {
                return {
                    status: 401,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: '無效的 token' }
                };
            }

            if (!source || !account || !timestamp || !sig) {
                return {
                    status: 401,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: '無效的 token 格式，需為 source|account|timestamp|sig' }
                };
            }

            const sourceRow = await crud.findBySource(source);
            if (!sourceRow) {
                return {
                    status: 401,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: '不允許的來源' }
                };
            }

            const hmacEnvName = getSourceHmacEnvName(source);
            const HMAC_SECRET = process.env[hmacEnvName];
            if (!HMAC_SECRET) {
                context.error(`環境變數 ${hmacEnvName} 未設定`);
                return {
                    status: 500,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: '伺服器設定錯誤' }
                };
            }

            // 檢查時效
            const now = Math.floor(Date.now() / 1000);
            const ts = normalizeTimestampSeconds(timestamp);
            const diff = Math.abs(now - ts);

            context.log(`[ssoAuth] now=${now}, t=${ts}, rawTimestamp=${timestamp}, diff=${diff}秒, source=${source}, account=${account}`);

            if (isNaN(ts) || (now - ts) > TTL_SECONDS + CLOCK_SKEW || (ts - now) > CLOCK_SKEW) {
                context.log(`[ssoAuth] 過期，差距 ${diff} 秒`);
                return {
                    status: 401,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: 'Token 已過期，請重新進入' }
                };
            }

            // 驗證 HMAC 簽章
            const expected = crypto
                .createHmac('sha256', HMAC_SECRET)
                .update(`${source}|${account}|${timestamp}`)
                .digest('hex');

            const expectedBuf = Buffer.from(expected, 'hex');
            const sigBuf = Buffer.from(sig, 'hex');

            if (expectedBuf.length !== sigBuf.length || 
                !crypto.timingSafeEqual(expectedBuf, sigBuf)) {
                return {
                    status: 401,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: '簽章驗證失敗' }
                };
            }

            // 確認 account 已在 permissions 白名單內
            const accountLower = account.trim().toLowerCase();
            const permRecords = await getPermissions();
            if (!permRecords.some(r => r.email === accountLower)) {
                return {
                    status: 403,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: '帳號不在授權名單，請聯絡系統管理員' }
                };
            }

            // 驗證通過，簽發 SSO session JWT（8 小時有效）
            const sessionToken = jwt.sign(
                {
                    iss: SSO_JWT_ISSUER,
                    aud: SSO_JWT_AUDIENCE,
                    role: 'sso-guest',
                    source,
                    account
                },
                JWT_SECRET,
                { algorithm: 'HS256', expiresIn: '8h' }
            );

            return {
                status: 200,
                headers: corsHeaders,
                jsonBody: { success: true, token: sessionToken }
            };

        } catch (error) {
            context.error('ssoAuth 錯誤:', error);
            return {
                status: 500,
                headers: corsHeaders,
                jsonBody: { success: false, error: '伺服器錯誤' }
            };
        }
    }
});