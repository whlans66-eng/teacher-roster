/**
 * ping - 健康檢查
 */
const { app } = require('@azure/functions');
const { getConnection } = require('./sys_database');
const { getCorsHeaders, getPermissions } = require('./sys_permissions');

async function runWarmup(context) {
    const results = await Promise.allSettled([
        getConnection(),
        getPermissions()
    ]);

    const failedResults = results.filter((result) => result.status === 'rejected');
    for (const result of failedResults) {
        context.error?.('warmup task failed:', result.reason);
    }

    context.log?.(`warmup completed: ${results.length - failedResults.length}/${results.length} tasks succeeded`);
}

app.http('ping', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const corsHeaders = getCorsHeaders(request.headers.get('origin'));
        
        if (request.method === 'OPTIONS') {
            return {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'X-Frame-Options': 'DENY',
                    'Referrer-Policy': 'strict-origin'
                }
            };
        }

        return {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'X-Frame-Options': 'DENY',
                'Referrer-Policy': 'strict-origin'
            },
            jsonBody: {
                ok: true
            }
        };
    }
});

app.timer('warmup-timer', {
    schedule: '0 */30 * * * *',
    handler: async (_timer, context) => {
        await runWarmup(context);
    }
});
