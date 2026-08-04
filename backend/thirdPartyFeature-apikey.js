const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 30000;

const REQUIRED_BODY_FIELDS = [
    'detailId',
    'serialNo',
    'entryUser',
    'entryOffice',
    'entryProg'
];

const SENSITIVE_RESPONSE_KEYS = new Set([
    'apikey',
    'apiKey',
    'authorization',
    'accessToken',
    'refreshToken',
    'password',
    'secret',
    'token'
]);

function buildHeaders(getCorsHeaders, origin) {
    return {
        ...getCorsHeaders(origin),
        'Content-Type': 'application/json'
    };
}

function getTimeoutMs(env = process.env) {
    const timeoutMs = Number(env.THIRD_PARTY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return DEFAULT_TIMEOUT_MS;
    }

    return Math.min(timeoutMs, MAX_TIMEOUT_MS);
}

function getRequiredEnvValue(env, name) {
    const value = String(env[name] || '').trim();
    if (!value) {
        throw new Error(`Missing ${name}`);
    }

    return value;
}

function buildScanbarTargetUrl({
    baseUrl,
    path,
    apiKey
}) {
    const parsedBaseUrl = new URL(baseUrl);
    if (parsedBaseUrl.protocol !== 'https:') {
        throw new Error('WANHAI_APIKEY_BASE_URL must use https');
    }

    const targetUrl = new URL(path, `${parsedBaseUrl.origin}/`);
    targetUrl.searchParams.set('apikey', apiKey);
    return targetUrl;
}

function getConfiguredTargetUrl(env = process.env) {
    return buildScanbarTargetUrl({
        baseUrl: getRequiredEnvValue(env, 'WANHAI_APIKEY_BASE_URL'),
        path: getRequiredEnvValue(env, 'WANHAI_SCANBAR_GET_BASIC_PATH'),
        apiKey: getRequiredEnvValue(env, 'WANHAI_SCANBAR_APIKEY')
    });
}

function validateRequestBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return 'request body 必須是 JSON object';
    }

    const missingFields = REQUIRED_BODY_FIELDS.filter(
        (fieldName) => body[fieldName] === undefined || body[fieldName] === null
    );

    if (missingFields.length > 0) {
        return `缺少必要欄位: ${missingFields.join(', ')}`;
    }

    return null;
}

function sanitizeResponse(value) {
    if (Array.isArray(value)) {
        return value.map(sanitizeResponse);
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !SENSITIVE_RESPONSE_KEYS.has(key))
            .map(([key, item]) => [key, sanitizeResponse(item)])
    );
}

function parseJsonTextResponse(text) {
    const trimmedText = String(text || '').trim();
    if (!trimmedText) {
        return { message: '' };
    }

    try {
        return JSON.parse(trimmedText);
    } catch {
        return { message: trimmedText };
    }
}

async function readThirdPartyResponse(response) {
    const contentType = response.headers?.get?.('content-type') || '';
    if (contentType.includes('application/json') && typeof response.json === 'function') {
        return await response.json();
    }

    if (typeof response.text === 'function') {
        return parseJsonTextResponse(await response.text());
    }

    return null;
}

async function callPtmScanbarGetBasic(payload, deps) {
    const targetUrl = getConfiguredTargetUrl(deps.env);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getTimeoutMs(deps.env));

    try {
        const response = await deps.fetchImpl(targetUrl, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        return {
            ok: response.ok,
            status: response.status,
            data: await readThirdPartyResponse(response)
        };
    } finally {
        clearTimeout(timeout);
    }
}

function createPtmScanbarHandler({
    validateRequest,
    getCorsHeaders,
    fetchImpl = fetch,
    env = process.env
}) {
    return async function ptmScanbarHandler(request, context) {
        const origin = request.headers.get('origin');
        const headers = buildHeaders(getCorsHeaders, origin);

        if (request.method === 'OPTIONS') {
            return { status: 204, headers };
        }

        const user = await validateRequest(request.headers.get('authorization'));
        if (!user) {
            return {
                status: 401,
                headers,
                jsonBody: { error: 'Not signed in' }
            };
        }

        if (!user.allowed) {
            return {
                status: 403,
                headers,
                jsonBody: { error: '沒有呼叫第三方 API 的權限' }
            };
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return {
                status: 400,
                headers,
                jsonBody: { error: 'JSON 格式錯誤' }
            };
        }

        const bodyError = validateRequestBody(body);
        if (bodyError) {
            return {
                status: 400,
                headers,
                jsonBody: { error: bodyError }
            };
        }

        let upstream;
        try {
            upstream = await callPtmScanbarGetBasic(body, { fetchImpl, env });
        } catch (error) {
            context.error?.('ptmScanbarFeature upstream request failed', {
                message: error.message,
                name: error.name
            });

            return {
                status: error.name === 'AbortError' ? 504 : 500,
                headers,
                jsonBody: { error: '第三方 API 呼叫失敗' }
            };
        }

        if (!upstream.ok) {
            context.error?.('ptmScanbarFeature upstream returned error', {
                status: upstream.status,
                data: sanitizeResponse(upstream.data)
            });

            return {
                status: 502,
                headers,
                jsonBody: {
                    error: '第三方 API 回傳錯誤',
                    upstreamStatus: upstream.status,
                    data: sanitizeResponse(upstream.data)
                }
            };
        }

        return {
            status: 200,
            headers,
            jsonBody: {
                success: true,
                data: sanitizeResponse(upstream.data)
            }
        };
    };
}

function registerAzureFunction() {
    let app;
    try {
        ({ app } = require('@azure/functions'));
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND' && String(error.message).includes('@azure/functions')) {
            return false;
        }

        throw error;
    }

    const { validateRequest, getCorsHeaders } = require('./sys_permissions');
    app.http('ptm-scanbar-feature', {
        methods: ['POST', 'OPTIONS'],
        authLevel: 'anonymous',
        route: 'ptm/scanbar/get-basic',
        handler: createPtmScanbarHandler({
            validateRequest,
            getCorsHeaders,
            fetchImpl: fetch,
            env: process.env
        })
    });

    return true;
}

registerAzureFunction();

module.exports = {
    buildScanbarTargetUrl,
    createPtmScanbarHandler,
    validateRequestBody
};
