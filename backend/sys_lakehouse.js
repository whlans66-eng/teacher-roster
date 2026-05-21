/**
 * Fabric Lakehouse 連線模組
 * 使用 Service Principal (Client Credentials) 跨租戶存取
 */

const { ClientSecretCredential } = require("@azure/identity");
const { DataLakeServiceClient } = require("@azure/storage-file-datalake");

// 設定
const TENANT_ID = process.env.FABRIC_TENANT_ID;
const CLIENT_ID = process.env.FABRIC_CLIENT_ID;
const CLIENT_SECRET = process.env.FABRIC_CLIENT_SECRET;
const STORAGE_ACCOUNT = process.env.FABRIC_STORAGE_ACCOUNT;
const CONTAINER_NAME = process.env.FABRIC_CONTAINER_NAME;

let fileSystemClient = null;

/**
 * 取得 FileSystem Client
 */
function getFileSystemClient() {
    if (fileSystemClient) return fileSystemClient;

    const BASE_PATH = process.env.FABRIC_BASE_PATH || '';

    if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !STORAGE_ACCOUNT || !CONTAINER_NAME) {
        throw new Error('Fabric 連線設定不完整，請檢查環境變數');
    }

    const credential = new ClientSecretCredential(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
    const datalakeServiceClient = new DataLakeServiceClient(
        `https://${STORAGE_ACCOUNT}.dfs.fabric.microsoft.com`,
        credential
    );

    fileSystemClient = datalakeServiceClient.getFileSystemClient(CONTAINER_NAME);
    return fileSystemClient;
}

/**
 * 列出檔案
 */
async function listFiles(folder) {
    const BASE_PATH = process.env.FABRIC_BASE_PATH || '';
    const fs = getFileSystemClient();
    const folderPath = BASE_PATH ? `${BASE_PATH}/${folder}` : folder;

    const files = [];
    try {
        for await (const item of fs.listPaths({ path: folderPath })) {
            if (!item.isDirectory) {
                const name = item.name.split('/').pop();
                files.push({
                    name,
                    path: item.name,
                    size: item.contentLength,
                    lastModified: item.lastModified
                });
            }
        }
    } catch (error) {
        if (error.statusCode === 404) {
            return [];
        }
        throw error;
    }

    return files;
}

/**
 * 上傳檔案
 */
async function uploadFile(folder, fileName, content) {
    const BASE_PATH = process.env.FABRIC_BASE_PATH || '';
    const fs = getFileSystemClient();
    const filePath = BASE_PATH ? `${BASE_PATH}/${folder}/${fileName}` : `${folder}/${fileName}`;
    const fileClient = fs.getFileClient(filePath);

    await fileClient.create();
    await fileClient.append(content, 0, content.length);
    await fileClient.flush(content.length);

    return { success: true, path: filePath };
}

/**
 * 刪除檔案
 */
async function deleteFile(folder, fileName) {
    const BASE_PATH = process.env.FABRIC_BASE_PATH || '';
    const fs = getFileSystemClient();
    const filePath = BASE_PATH ? `${BASE_PATH}/${folder}/${fileName}` : `${folder}/${fileName}`;
    const fileClient = fs.getFileClient(filePath);

    await fileClient.deleteIfExists();
    return { success: true };
}

/**
 * 從 Lakehouse 下載檔案並轉換為 Buffer
 */
async function downloadFile(folder, fileName) {
    const BASE_PATH = process.env.FABRIC_BASE_PATH || '';
    const fs = getFileSystemClient();
    const filePath = BASE_PATH ? `${BASE_PATH}/${folder}/${fileName}` : `${folder}/${fileName}`;
    const fileClient = fs.getFileClient(filePath);

    // 執行讀取
    const downloadResponse = await fileClient.read();
    
    // 將 ReadableStream 轉換為 Buffer
    const chunks = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

module.exports = {
    listFiles,
    uploadFile,
    deleteFile,
    downloadFile
};
