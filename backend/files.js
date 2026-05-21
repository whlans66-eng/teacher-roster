/**
 * files - 檔案管理
 * GET    /api/files?folder=teachers     - 列出檔案（需登入）
 * POST   /api/files                     - 上傳檔案（需 admin）
 * DELETE /api/files?folder=x&file=y     - 刪除檔案（需 admin）
 */
const { app } = require('@azure/functions');
const lakehouse = require('./sys_lakehouse');
const { validateRequest, getCorsHeaders } = require('./sys_permissions');

// 允許上傳的副檔名白名單
const ALLOWED_EXTENSIONS = [
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf',
    'xls', 'xlsx', 'doc', 'docx', 'ppt', 'pptx'
];

// 各類型 magic bytes（檔案頭部特徵，防止偽裝副檔名）
const MAGIC_BYTES = {
    png:  [0x89, 0x50, 0x4E, 0x47],
    jpg:  [0xFF, 0xD8, 0xFF],
    jpeg: [0xFF, 0xD8, 0xFF],
    gif:  [0x47, 0x49, 0x46],
    webp: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],  // RIFF....WEBP
    pdf:  [0x25, 0x50, 0x44, 0x46],
    // Office 舊格式（OLE Compound File）：xls/doc/ppt
    xls:  [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1],
    doc:  [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1],
    ppt:  [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1],
    // Office 新格式（Open XML）：xlsx/docx/pptx（ZIP 容器）
    xlsx: [0x50, 0x4B, 0x03, 0x04],
    docx: [0x50, 0x4B, 0x03, 0x04],
    pptx: [0x50, 0x4B, 0x03, 0x04]
};

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * 防止 Path Traversal：禁止 .. 與絕對路徑，允許合法子目錄路徑 (uploads/materials/123)
 */
function validatePath(value) {
    if (!value || typeof value !== 'string') return false;
    if (value.includes('..')) return false;
    if (value.startsWith('/') || value.startsWith('\\')) return false;
    if (value.includes('\0')) return false;
    return true;
}

/**
 * 驗證純檔案名稱（不允許路徑分隔符）
 */
function validateFileName(name) {
    if (!name || typeof name !== 'string') return false;
    if (name.includes('/') || name.includes('\\') || name.includes('..') || name.includes('\0')) return false;
    return true;
}

/**
 * 驗證副檔名白名單 + magic bytes（防止副檔名偽裝）
 */
function validateFileType(fileName, buffer) {
    const ext = fileName.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) return false;
    const magic = MAGIC_BYTES[ext];
    // null 表示該位元組為可變內容（如 WebP 的長度欄位），跳過比對
    return magic ? magic.every((byte, i) => byte === null || buffer[i] === byte) : false;
}

app.http('files', {
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
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
                    jsonBody: { error: '未登入' }
                };
            }

            if (!user.allowed) {
                return {
                    status: 403,
                    headers,
                    jsonBody: { error: '您的帳號未被授權使用此系統' }
                };
            }

            const url = new URL(request.url);
            const folder = url.searchParams.get('folder') || 'uploads';

            if (!validatePath(folder)) {
                return { status: 400, headers, jsonBody: { error: '無效的路徑' } };
            }

            // GET - 列出檔案
            if (request.method === 'GET') {
                const rawFiles = await lakehouse.listFiles(folder);
                
                // 🔥 重點修改：為每個檔案生成可存取的 URL
                // 使用 /api/file 端點作為圖片代理
                const apiBase = `${url.protocol}//${url.host}/api`;
                const files = rawFiles
                    .filter(f => !f.isDirectory)  // 只回傳檔案，不回傳目錄
                    .map(f => ({
                        name: f.name,
                        path: f.path,
                        size: f.contentLength,
                        lastModified: f.lastModified,
                        // 🔥 使用 file 端點作為圖片 URL
                        url: `${apiBase}/file?folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(f.name)}`
                    }));

                return {
                    status: 200,
                    headers,
                    jsonBody: files  // 🔥 直接回傳陣列，不包裝在 { folder, files } 中
                };
            }

            // POST 和 DELETE 需要 admin 權限
            if (!user.isAdmin) {
                return {
                    status: 403,
                    headers,
                    jsonBody: { error: '僅管理員可進行此操作' }
                };
            }

            // POST - 上傳檔案
            if (request.method === 'POST') {
                const body = await request.json();
                const { dataUrl, fileName, folder: targetFolder } = body;

                if (!dataUrl || !fileName) {
                    return {
                        status: 400,
                        headers,
                        jsonBody: { error: '需要 dataUrl 和 fileName' }
                    };
                }

                const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                if (!matches) {
                    return {
                        status: 400,
                        headers,
                        jsonBody: { error: '無效的 dataUrl 格式' }
                    };
                }

                if (!validateFileName(fileName)) {
                    return { status: 400, headers, jsonBody: { error: '無效的檔案名稱' } };
                }

                if (targetFolder && !validatePath(targetFolder)) {
                    return { status: 400, headers, jsonBody: { error: '無效的目標路徑' } };
                }

                // 檢查 base64 預估大小（避免解碼超大檔案耕盡記憶體）
                if (Math.floor(matches[2].length * 0.75) > MAX_FILE_SIZE) {
                    return { status: 413, headers, jsonBody: { error: '檔案超過 25MB 上限' } };
                }

                const fileBuffer = Buffer.from(matches[2], 'base64');

                if (fileBuffer.length > MAX_FILE_SIZE) {
                    return { status: 413, headers, jsonBody: { error: '檔案超過 25MB 上限' } };
                }

                if (!validateFileType(fileName, fileBuffer)) {
                    return { status: 400, headers, jsonBody: { error: '不支援的檔案類型，允許：png、jpg、jpeg、gif、webp、pdf、xls、xlsx、doc、docx、ppt、pptx' } };
                }

                const result = await lakehouse.uploadFile(targetFolder || 'uploads', fileName, fileBuffer);

                context.log(`✅ ${user.email} 上傳了 ${targetFolder || 'uploads'}/${fileName}`);

                return {
                    status: 200,
                    headers,
                    jsonBody: result
                };
            }

            // DELETE - 刪除檔案
            if (request.method === 'DELETE') {
                const fileName = url.searchParams.get('file');
                if (!fileName) {
                    return {
                        status: 400,
                        headers,
                        jsonBody: { error: '需要 file 參數' }
                    };
                }

                if (!validateFileName(fileName)) {
                    return { status: 400, headers, jsonBody: { error: '無效的檔案名稱' } };
                }

                await lakehouse.deleteFile(folder, fileName);

                context.log(`✅ ${user.email} 刪除了 ${folder}/${fileName}`);

                return {
                    status: 200,
                    headers,
                    jsonBody: { deleted: `${folder}/${fileName}` }
                };
            }

            return {
                status: 405,
                headers,
                jsonBody: { error: 'Method not allowed' }
            };

        } catch (error) {
            context.error('files error:', error);
            return { status: 500, headers, jsonBody: { error: '操作失敗，請聯絡系統管理員' } };
        }
    }
});

/**
 * 🔥 新增：file - 單一檔案下載/代理
 * GET /api/file?folder=teachers&file=xxx.png - 取得檔案內容
 * 
 * 這個端點用於代理 OneLake 檔案，讓前端可以直接在 <img src="..."> 中使用
 */
app.http('file', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const corsHeaders = getCorsHeaders();

        if (request.method === 'OPTIONS') {
            return { status: 200, headers: corsHeaders };
        }

        try {
            const authHeader = request.headers.get('authorization');
            const user = await validateRequest(authHeader);

            if (!user) {
                return {
                    status: 401,
                    headers: corsHeaders,
                    jsonBody: { error: '未登入' }
                };
            }

            if (!user.allowed) {
                return {
                    status: 403,
                    headers: corsHeaders,
                    jsonBody: { error: '您的帳號未被授權使用此系統' }
                };
            }

            const url = new URL(request.url);
            const folder = url.searchParams.get('folder');
            const fileName = url.searchParams.get('file');

            if (!folder || !fileName) {
                return {
                    status: 400,
                    headers: corsHeaders,
                    jsonBody: { error: '需要 folder 和 file 參數' }
                };
            }

            if (!validatePath(folder) || !validateFileName(fileName)) {
                return { status: 400, headers: corsHeaders, jsonBody: { error: '無效的路徑或檔案名稱' } };
            }

            // 從 Lakehouse 下載檔案
            const fileBuffer = await lakehouse.downloadFile(folder, fileName);

            // 根據副檔名判斷 Content-Type（不含 svg，防止 XSS）
            const ext = fileName.split('.').pop().toLowerCase();
            const contentTypes = {
                'png':  'image/png',
                'jpg':  'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif':  'image/gif',
                'webp': 'image/webp',
                'pdf':  'application/pdf',
                'xls':  'application/vnd.ms-excel',
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'doc':  'application/msword',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'ppt':  'application/vnd.ms-powerpoint',
                'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            };
            const contentType = contentTypes[ext] || 'application/octet-stream';

            return {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': contentType,
                    'X-Content-Type-Options': 'nosniff',
                    'Cache-Control': 'no-cache'
                },
                body: fileBuffer
            };

        } catch (error) {
            context.error('file download error:', error);
            
            // 檔案不存在
            if (error.statusCode === 404 || error.message?.includes('not found')) {
                return {
                    status: 404,
                    headers: corsHeaders,
                    jsonBody: { error: '檔案不存在' }
                };
            }

            return { status: 500, headers: corsHeaders, jsonBody: { error: '操作失敗，請聯絡系統管理員' } };
        }
    }
});
