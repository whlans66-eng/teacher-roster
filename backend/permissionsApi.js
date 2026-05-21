/**
 * permissions - 權限管理
 * GET    /api/permissions/check         - 檢查當前使用者權限
 * GET    /api/permissions               - 取得所有權限（僅 superAdmin）
 * POST   /api/permissions               - 更新權限（僅 superAdmin）
 * POST   /api/permissions/user          - 新增使用者
 * DELETE /api/permissions/user          - 移除使用者
 */
const { app } = require('@azure/functions');
const { 
    validateRequest, 
    getPermissions, 
    savePermissions,
    addPermission,
    removePermission, 
    getCorsHeaders 
} = require('./sys_permissions');

// 檢查當前使用者權限
app.http('permissions-check', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'permissions/check',
    handler: async (request, context) => {
        const headers = getCorsHeaders();

        if (request.method === 'OPTIONS') {
            return { status: 200, headers };
        }

        try {
            const authHeader = request.headers.get('authorization');
            
            const user = await validateRequest(authHeader);

            if (!user) {
                return {
                    status: 401,
                    headers,
                    jsonBody: { error: '未登入或 Token 無效' }
                };
            }

            return {
                status: 200,
                headers,
                jsonBody: {
                    email: user.email,
                    allowed: user.allowed,
                    isAdmin: user.isAdmin,
                    isSuperAdmin: user.isSuperAdmin
                }
            };

        } catch (error) {
            context.error('permissions-check error:', error);
            return { status: 500, headers, jsonBody: { error: '操作失敗，請聯絡系統管理員' } };
        }
    }
});

// 取得/更新所有權限
app.http('permissions', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'permissions',
    handler: async (request, context) => {
        const headers = getCorsHeaders();

        if (request.method === 'OPTIONS') {
            return { status: 200, headers };
        }

        try {
            const authHeader = request.headers.get('authorization');
            const user = await validateRequest(authHeader);

            if (!user) {
                return {
                    status: 401,
                    headers,
                    jsonBody: { error: '未登入或 Token 無效' }
                };
            }

            if (!user.isSuperAdmin) {
                return {
                    status: 403,
                    headers,
                    jsonBody: { error: '僅超級管理員可使用此功能' }
                };
            }

            // GET - 取得所有權限（轉換為前端預期的三陣列格式）
            if (request.method === 'GET') {
                const records = await getPermissions();
                const data = {
                    superAdmins:  records.filter(r => r.role === 'superAdmin').map(r => r.email),
                    admins:       records.filter(r => r.role === 'admin').map(r => r.email),
                    allowedUsers: records.filter(r => r.role === 'allowedUser').map(r => r.email)
                };
                return {
                    status: 200,
                    headers,
                    jsonBody: { data }
                };
            }

            // POST - 更新權限（完整覆蓋）
            if (request.method === 'POST') {
                const body = await request.json();

                // 確保至少有一個 superAdmin
                if (!body.superAdmins || body.superAdmins.length === 0) {
                    return {
                        status: 400,
                        headers,
                        jsonBody: { error: '至少需要一位超級管理員' }
                    };
                }

                // 前端傳入舊格式，轉換為 [{email, role}] 陣列存入
                const records = [
                    ...(body.superAdmins  || []).map(email => ({ email, role: 'superAdmin' })),
                    ...(body.admins       || []).map(email => ({ email, role: 'admin' })),
                    ...(body.allowedUsers || []).map(email => ({ email, role: 'allowedUser' }))
                ];

                await savePermissions(records, user.email);

                context.log(`✅ ${user.email} 更新了權限設定`);

                return {
                    status: 200,
                    headers,
                    jsonBody: { success: true }
                };
            }

        } catch (error) {
            context.error('permissions error:', error);
            return { status: 500, headers, jsonBody: { error: '操作失敗，請聯絡系統管理員' } };
        }
    }
});

// 新增/移除使用者
app.http('permissions-user', {
    methods: ['POST', 'DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'permissions/user',
    handler: async (request, context) => {
        const headers = getCorsHeaders();

        if (request.method === 'OPTIONS') {
            return { status: 200, headers };
        }

        try {
            const authHeader = request.headers.get('authorization');
            const user = await validateRequest(authHeader);

            if (!user) {
                return {
                    status: 401,
                    headers,
                    jsonBody: { error: '未登入或 Token 無效' }
                };
            }

            // DELETE 請求不保證有 body（部分 proxy 會移除），安全解析
            let email, role;
            try {
                const body = await request.json();
                email = body.email;
                role = body.role;
            } catch {
                // body 為空或非 JSON，交由下方參數驗證回 400
            }

            if (!email || !role) {
                return {
                    status: 400,
                    headers,
                    jsonBody: { error: '需要 email 和 role' }
                };
            }

            const validRoles = ['superAdmin', 'admin', 'allowedUser'];
            if (!validRoles.includes(role)) {
                return {
                    status: 400,
                    headers,
                    jsonBody: { error: '無效的角色' }
                };
            }

            // superAdmin 和 admin 操作需要 superAdmin 權限
            // allowedUser 操作需要 admin 權限
            if (role === 'superAdmin' || role === 'admin') {
                if (!user.isSuperAdmin) {
                    return {
                        status: 403,
                        headers,
                        jsonBody: { error: '僅超級管理員可管理此角色' }
                    };
                }
            } else {
                if (!user.isAdmin) {
                    return {
                        status: 403,
                        headers,
                        jsonBody: { error: '您沒有權限進行此操作' }
                    };
                }
            }

            // POST - 新增
            if (request.method === 'POST') {
                // 使用 addPermission 函數
                await addPermission(email, role, user.email);
                context.log(`✅ ${user.email} 新增了 ${role}: ${email}`);
                
                return {
                    status: 200,
                    headers,
                    jsonBody: { success: true }
                };
            }

            // DELETE - 移除
            if (request.method === 'DELETE') {
                // 檢查是否要移除最後一個 superAdmin
                if (role === 'superAdmin') {
                    const records = await getPermissions();
                    if (records.filter(r => r.role === 'superAdmin').length <= 1) {
                        return {
                            status: 400,
                            headers,
                            jsonBody: { error: '至少需要保留一位超級管理員' }
                        };
                    }
                }

                // 使用 removePermission 函數
                await removePermission(email, role, user.email);
                context.log(`✅ ${user.email} 移除了 ${role}: ${email}`);

                return {
                    status: 200,
                    headers,
                    jsonBody: { success: true }
                };
            }

        } catch (error) {
            context.error('permissions-user error:', error);
            return { status: 500, headers, jsonBody: { error: '操作失敗，請聯絡系統管理員' } };
        }
    }
});
