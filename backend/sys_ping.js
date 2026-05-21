/**
 * ping - 健康檢查
 */
const { app } = require('@azure/functions');
const { getConnection } = require('./sys_database');
const { validateToken } = require('./sys_tokenValidator');

app.http('ping', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        getConnection().catch(() => {});
        validateToken('Bearer warmup').catch(() => {});
        
        if (request.method === 'OPTIONS') {
            return {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                }
            };
        }

        return {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            jsonBody: {
                ok: true,
                timestamp: new Date().toISOString(),
                version: '1.0.0 (V4)',
                service: 'maritrain-api'
            }
        };
    }
});
