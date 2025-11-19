#!/usr/bin/env node

/**
 * Azure Database for MySQL 連線測試腳本
 *
 * 使用方法：
 *   node test-azure-connection.js
 *
 * 環境變數（可在 .env 設定）：
 *   DB_HOST - Azure MySQL 主機名稱
 *   DB_USER - 資料庫使用者
 *   DB_PASSWORD - 資料庫密碼
 *   DB_NAME - 資料庫名稱
 *   DB_SSL_MODE - SSL 模式 (REQUIRED/DISABLED)
 *   DB_SSL_CA - SSL 憑證路徑
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// 顏色輸出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function testConnection() {
  console.log('\n' + '='.repeat(60));
  log(colors.cyan, '🔵 Azure Database for MySQL 連線測試');
  console.log('='.repeat(60) + '\n');

  // 讀取環境變數
  const config = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };

  // 顯示連線資訊（隱藏密碼）
  log(colors.blue, '📋 連線設定:');
  console.log(`   主機: ${config.host || '(未設定)'}`);
  console.log(`   埠號: ${config.port}`);
  console.log(`   用戶: ${config.user || '(未設定)'}`);
  console.log(`   密碼: ${config.password ? '*'.repeat(config.password.length) : '(未設定)'}`);
  console.log(`   資料庫: ${config.database || '(未設定)'}`);

  // 檢查必要設定
  if (!config.host || !config.user || !config.password) {
    log(colors.red, '\n❌ 錯誤：缺少必要的環境變數！');
    console.log('   請在 .env 檔案中設定：');
    console.log('   - DB_HOST');
    console.log('   - DB_USER');
    console.log('   - DB_PASSWORD');
    process.exit(1);
  }

  // SSL 設定
  if (process.env.DB_SSL_MODE === 'REQUIRED' && process.env.DB_SSL_CA) {
    const caPath = process.env.DB_SSL_CA;
    if (fs.existsSync(caPath)) {
      config.ssl = {
        ca: fs.readFileSync(caPath),
        rejectUnauthorized: true,
      };
      log(colors.green, `   SSL: 已啟用 (憑證: ${caPath})`);
    } else {
      log(colors.yellow, `   SSL: 憑證檔案不存在 (${caPath})`);
    }
  } else {
    log(colors.yellow, '   SSL: 未啟用（建議啟用）');
  }

  console.log('');

  // 測試連線
  log(colors.blue, '🔌 正在連線到 Azure MySQL...');
  let connection;

  try {
    connection = await mysql.createConnection(config);
    log(colors.green, '✅ 連線成功！');

    // 查詢資料庫資訊
    console.log('');
    log(colors.blue, '📊 資料庫資訊:');

    const [versionResult] = await connection.query('SELECT VERSION() as version');
    console.log(`   MySQL 版本: ${versionResult[0].version}`);

    const [hostnameResult] = await connection.query('SELECT @@hostname as hostname');
    console.log(`   主機名稱: ${hostnameResult[0].hostname}`);

    const [sslResult] = await connection.query('SHOW STATUS LIKE "Ssl_cipher"');
    if (sslResult.length > 0 && sslResult[0].Value) {
      log(colors.green, `   SSL 加密: 已啟用 (${sslResult[0].Value})`);
    } else {
      log(colors.yellow, '   SSL 加密: 未啟用');
    }

    // 檢查資料庫
    console.log('');
    log(colors.blue, '🗄️  資料庫檢查:');

    const [databases] = await connection.query('SHOW DATABASES');
    const dbList = databases.map(db => Object.values(db)[0]);

    if (dbList.includes(config.database)) {
      log(colors.green, `   ✅ 資料庫 "${config.database}" 存在`);

      // 切換到目標資料庫
      await connection.query(`USE ${config.database}`);

      // 列出資料表
      const [tables] = await connection.query('SHOW TABLES');
      if (tables.length > 0) {
        console.log(`   📋 資料表數量: ${tables.length}`);
        console.log('   資料表列表:');
        tables.slice(0, 10).forEach(table => {
          console.log(`      - ${Object.values(table)[0]}`);
        });
        if (tables.length > 10) {
          console.log(`      ... 還有 ${tables.length - 10} 個資料表`);
        }
      } else {
        log(colors.yellow, '   ⚠️  資料庫是空的（無資料表）');
        log(colors.yellow, '   💡 提示：執行 database/init/*.sql 來初始化資料庫');
      }
    } else {
      log(colors.red, `   ❌ 資料庫 "${config.database}" 不存在`);
      console.log('   可用的資料庫:');
      dbList.forEach(db => console.log(`      - ${db}`));
    }

    // 測試基本查詢
    console.log('');
    log(colors.blue, '🧪 測試查詢執行:');
    const startTime = Date.now();
    await connection.query('SELECT 1+1 as result');
    const duration = Date.now() - startTime;
    log(colors.green, `   ✅ 查詢執行成功 (${duration}ms)`);

    // 總結
    console.log('');
    console.log('='.repeat(60));
    log(colors.green, '✅ Azure Database 連線測試通過！');
    console.log('='.repeat(60));
    console.log('');
    log(colors.cyan, '下一步:');
    console.log('   1. 確保已執行初始化腳本 (database/init/*.sql)');
    console.log('   2. 更新 .env 檔案中的所有設定');
    console.log('   3. 啟動應用程式: npm run dev');
    console.log('');

  } catch (error) {
    console.log('');
    console.log('='.repeat(60));
    log(colors.red, '❌ 連線失敗！');
    console.log('='.repeat(60));
    console.log('');
    log(colors.red, '錯誤詳情:');
    console.error(error);
    console.log('');
    log(colors.yellow, '💡 常見問題排查:');
    console.log('   1. 檢查 DB_HOST 是否正確');
    console.log('   2. 檢查帳號密碼是否正確');
    console.log('   3. 檢查 Azure 防火牆是否允許你的 IP');
    console.log('   4. 檢查 SSL 憑證是否正確');
    console.log('   5. 確認資料庫服務是否正在運行');
    console.log('');
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 執行測試
testConnection().catch(error => {
  log(colors.red, '❌ 未預期的錯誤:', error);
  process.exit(1);
});
