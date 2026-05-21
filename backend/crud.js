/**
 * 通用 CRUD 操作模組
 * 內部使用，不直接對外暴露。業務 .js 檔透過此模組存取 Fabric SQL。
 */
const { getConnection, sql, SCHEMA } = require('./sys_database');

// 過濾不應由呼叫端傳入的系統欄位（camelCase 與 snake_case 均排除）
const SYSTEM_COLS = new Set(['id', 'createdAt', 'updatedAt', 'created_at', 'updated_at']);

/**
 * 驗證識別字格式（防止 SQL Injection）
 * 只允許英文字母、數字、底線，不允許任何特殊字元
 */
function sanitizeIdentifier(name) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        throw new Error(`非法識別字: ${name}`);
    }
    return name;
}

/**
 * 查詢所有記錄
 */
async function findAll(tableName) {
    sanitizeIdentifier(tableName);
    const pool = await getConnection();
    const result = await pool.request().query(`SELECT * FROM ${SCHEMA}.${tableName}`);
    return result.recordset;
}

/**
 * 根據單一條件過濾查詢（用於 FK 子表，例如 teacher_id = X）
 * @param {string} tableName
 * @param {string} column   - 欄位名稱（會經過 sanitize）
 * @param {*}      value    - 比對值（BIGINT）
 */
async function findAllWhere(tableName, column, value) {
    sanitizeIdentifier(tableName);
    sanitizeIdentifier(column);
    const pool = await getConnection();
    const result = await pool.request()
        .input('filterVal', sql.BigInt, Number(value))
        .query(`SELECT * FROM ${SCHEMA}.${tableName} WHERE ${column} = @filterVal ORDER BY sort_order ASC`);
    return result.recordset;
}

/**
 * 根據 ID 查詢
 */
async function findById(tableName, id) {
    sanitizeIdentifier(tableName);
    const pool = await getConnection();
    const result = await pool.request()
        .input('id', sql.BigInt, Number(id))
        .query(`SELECT * FROM ${SCHEMA}.${tableName} WHERE id = @id`);
    return result.recordset[0] || null;
}

/**
 * 新增記錄
 * @param {string}      tableName
 * @param {object}      data        - 欄位資料（系統欄位自動排除）
 * @param {string|null} userEmail   - MSAL 使用者 email（可為 null）
 */
async function create(tableName, data, userEmail) {
    sanitizeIdentifier(tableName);
    const pool = await getConnection();

    const columns = Object.keys(data)
        .filter(c => !SYSTEM_COLS.has(c))
        .map(sanitizeIdentifier);
    const values = columns.map(c => `@${c}`);

    const request = pool.request();
    columns.forEach(col => {
        request.input(col, sql.NVarChar, data[col]?.toString() ?? null);
    });

    let query;
    if (userEmail) {
        request.input('updatedBy', sql.NVarChar, userEmail);
        query = `
            INSERT INTO ${SCHEMA}.${tableName} (${columns.join(', ')}, updated_by)
            OUTPUT INSERTED.id
            VALUES (${values.join(', ')}, @updatedBy)
        `;
    } else {
        query = `
            INSERT INTO ${SCHEMA}.${tableName} (${columns.join(', ')})
            OUTPUT INSERTED.id
            VALUES (${values.join(', ')})
        `;
    }

    const result = await request.query(query);
    return { success: true, id: result.recordset[0].id };
}

/**
 * 更新記錄
 * @param {string}      tableName
 * @param {number}      id
 * @param {object}      data
 * @param {string|null} userEmail
 */
async function update(tableName, id, data, userEmail) {
    sanitizeIdentifier(tableName);
    const pool = await getConnection();

    const columns = Object.keys(data)
        .filter(c => !SYSTEM_COLS.has(c) && c !== 'id')
        .map(sanitizeIdentifier);
    const sets = columns.map(c => `${c} = @${c}`);

    if (sets.length === 0) {
        return { success: true, message: '沒有需要更新的欄位' };
    }

    const request = pool.request();
    request.input('id', sql.BigInt, Number(id));
    columns.forEach(col => {
        request.input(col, sql.NVarChar, data[col]?.toString() ?? null);
    });

    let updateClause = `${sets.join(', ')}, updated_at = GETUTCDATE()`;
    if (userEmail) {
        request.input('updatedBy', sql.NVarChar, userEmail);
        updateClause += ', updated_by = @updatedBy';
    }

    const query = `
        UPDATE ${SCHEMA}.${tableName}
        SET ${updateClause}
        WHERE id = @id
    `;

    await request.query(query);
    return { success: true };
}

/**
 * 刪除記錄
 */
async function remove(tableName, id) {
    sanitizeIdentifier(tableName);
    const pool = await getConnection();
    await pool.request()
        .input('id', sql.BigInt, Number(id))
        .query(`DELETE FROM ${SCHEMA}.${tableName} WHERE id = @id`);
    return { success: true };
}

/**
 * 批次新增記錄（transaction）
 */
async function createBatch(tableName, dataArray, userEmail) {
    sanitizeIdentifier(tableName);
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
        return { success: true, count: 0, results: [] };
    }

    const pool = await getConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
        const results = [];
        for (const data of dataArray) {
            const columns = Object.keys(data)
                .filter(c => !SYSTEM_COLS.has(c))
                .map(sanitizeIdentifier);
            const values = columns.map(c => `@${c}`);

            const request = transaction.request();
            columns.forEach(col => {
                request.input(col, sql.NVarChar, data[col]?.toString() ?? null);
            });

            let query;
            if (userEmail) {
                request.input('updatedBy', sql.NVarChar, userEmail);
                query = `
                    INSERT INTO ${SCHEMA}.${tableName} (${columns.join(', ')}, updated_by)
                    OUTPUT INSERTED.id
                    VALUES (${values.join(', ')}, @updatedBy)
                `;
            } else {
                query = `
                    INSERT INTO ${SCHEMA}.${tableName} (${columns.join(', ')})
                    OUTPUT INSERTED.id
                    VALUES (${values.join(', ')})
                `;
            }

            const result = await request.query(query);
            results.push({ id: result.recordset[0].id, success: true });
        }

        await transaction.commit();
        return { success: true, count: dataArray.length, results };

    } catch (error) {
        try { await transaction.rollback(); } catch (_) {}
        throw error;
    }
}

/**
 * 批次更新記錄（transaction）
 */
async function updateBatch(tableName, dataArray, userEmail) {
    sanitizeIdentifier(tableName);
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
        return { success: true, count: 0, results: [] };
    }

    const pool = await getConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
        const results = [];
        for (const data of dataArray) {
            const { id, ...updateData } = data;
            if (!id) continue;

            const columns = Object.keys(updateData)
                .filter(c => !SYSTEM_COLS.has(c))
                .map(sanitizeIdentifier);
            const sets = columns.map(c => `${c} = @${c}`);

            if (sets.length === 0) {
                results.push({ id, success: true, message: '沒有需要更新的欄位' });
                continue;
            }

            const request = transaction.request();
            request.input('id', sql.BigInt, Number(id));
            columns.forEach(col => {
                request.input(col, sql.NVarChar, updateData[col]?.toString() ?? null);
            });

            let updateClause = `${sets.join(', ')}, updated_at = GETUTCDATE()`;
            if (userEmail) {
                request.input('updatedBy', sql.NVarChar, userEmail);
                updateClause += ', updated_by = @updatedBy';
            }

            const query = `
                UPDATE ${SCHEMA}.${tableName}
                SET ${updateClause}
                WHERE id = @id
            `;
            await request.query(query);
            results.push({ id, success: true });
        }

        await transaction.commit();
        return { success: true, count: dataArray.length, results };

    } catch (error) {
        try { await transaction.rollback(); } catch (_) {}
        throw error;
    }
}

/**
 * 批次刪除記錄（transaction）
 */
async function deleteBatch(tableName, idArray) {
    sanitizeIdentifier(tableName);
    if (!Array.isArray(idArray) || idArray.length === 0) {
        return { success: true, count: 0, results: [] };
    }

    const pool = await getConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
        const results = [];
        for (const id of idArray) {
            if (!id) continue;
            const request = transaction.request();
            request.input('id', sql.BigInt, Number(id));
            await request.query(`DELETE FROM ${SCHEMA}.${tableName} WHERE id = @id`);
            results.push({ id, success: true });
        }

        await transaction.commit();
        return { success: true, count: idArray.length, results };

    } catch (error) {
        try { await transaction.rollback(); } catch (_) {}
        throw error;
    }
}

/**
 * 依 source 查詢允許的來源（permissions 系統專用）
 */
async function findBySource(source) {
    const pool = await getConnection();
    const result = await pool.request()
        .input('source', sql.NVarChar, source)
        .query(`SELECT * FROM ${SCHEMA}.allowed_sources WHERE source = @source AND status = 'active'`);
    return result.recordset[0] || null;
}

module.exports = {
    sanitizeIdentifier,
    findAll,
    findAllWhere,
    findById,
    create,
    update,
    remove,
    createBatch,
    updateBatch,
    deleteBatch,
    findBySource,
};
