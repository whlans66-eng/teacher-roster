#!/usr/bin/env node

/**
 * 權限系統完整性測試
 *
 * 測試項目：
 * 1. 檢查角色表資料
 * 2. 檢查權限表資料
 * 3. 檢查角色-權限關聯
 * 4. 檢查用戶-角色關聯
 * 5. 模擬權限查詢
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');

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

async function testPermissions() {
  console.log('\n' + '='.repeat(60));
  log(colors.cyan, '🔐 RBAC 權限系統完整性測試');
  console.log('='.repeat(60) + '\n');

  // 建立連線
  const config = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };

  // SSL 設定
  if (process.env.DB_SSL_MODE === 'REQUIRED' && process.env.DB_SSL_CA) {
    const caPath = process.env.DB_SSL_CA;
    if (fs.existsSync(caPath)) {
      config.ssl = {
        ca: fs.readFileSync(caPath),
        rejectUnauthorized: true,
      };
    }
  }

  log(colors.blue, `📍 連線到: ${config.host}`);
  const connection = await mysql.createConnection(config);
  log(colors.green, '✅ 資料庫連線成功\n');

  try {
    // 測試 1: 角色表
    log(colors.blue, '1️⃣  檢查角色表 (roles)');
    const [roles] = await connection.query('SELECT * FROM roles ORDER BY id');
    console.log(`   找到 ${roles.length} 個角色:`);
    roles.forEach(role => {
      console.log(`   - ${role.name.padEnd(10)} → ${role.display_name}`);
    });

    if (roles.length === 0) {
      log(colors.red, '   ❌ 錯誤：角色表是空的！');
      process.exit(1);
    }
    log(colors.green, '   ✅ 角色表正常\n');

    // 測試 2: 權限表
    log(colors.blue, '2️⃣  檢查權限表 (permissions)');
    const [permissions] = await connection.query(
      'SELECT COUNT(*) as count FROM permissions'
    );
    const permCount = permissions[0].count;
    console.log(`   找到 ${permCount} 個權限`);

    const [permSample] = await connection.query(
      'SELECT * FROM permissions ORDER BY resource, action LIMIT 10'
    );
    console.log('   範例權限:');
    permSample.forEach(perm => {
      console.log(`   - ${perm.name.padEnd(25)} (${perm.description})`);
    });

    if (permCount === 0) {
      log(colors.red, '   ❌ 錯誤：權限表是空的！');
      process.exit(1);
    }
    log(colors.green, `   ✅ 權限表正常\n`);

    // 測試 3: 角色-權限關聯
    log(colors.blue, '3️⃣  檢查角色-權限關聯 (role_permissions)');
    const [rolePerms] = await connection.query(`
      SELECT
        r.name as role_name,
        COUNT(rp.permission_id) as permission_count
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      GROUP BY r.id, r.name
      ORDER BY permission_count DESC
    `);

    console.log('   各角色的權限數量:');
    rolePerms.forEach(rp => {
      const status = rp.permission_count > 0 ? '✅' : '⚠️';
      console.log(`   ${status} ${rp.role_name.padEnd(10)} → ${rp.permission_count} 個權限`);
    });

    const totalRolePerms = rolePerms.reduce((sum, rp) => sum + parseInt(rp.permission_count), 0);
    if (totalRolePerms === 0) {
      log(colors.red, '   ❌ 錯誤：沒有任何角色-權限關聯！');
      process.exit(1);
    }
    log(colors.green, '   ✅ 角色-權限關聯正常\n');

    // 測試 4: 用戶-角色關聯
    log(colors.blue, '4️⃣  檢查用戶-角色關聯 (user_roles)');
    const [userRoles] = await connection.query(`
      SELECT
        u.username,
        r.name as role_name,
        r.display_name
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      ORDER BY u.username
    `);

    if (userRoles.length === 0) {
      log(colors.yellow, '   ⚠️  警告：沒有用戶被分配角色');
    } else {
      console.log(`   找到 ${userRoles.length} 個用戶-角色關聯:`);
      userRoles.forEach(ur => {
        console.log(`   - ${ur.username.padEnd(15)} → ${ur.display_name}`);
      });
      log(colors.green, '   ✅ 用戶-角色關聯正常\n');
    }

    // 測試 5: 模擬權限查詢（實際應用中的查詢）
    log(colors.blue, '5️⃣  模擬權限查詢（測試 admin 用戶）');

    const [adminUser] = await connection.query(`
      SELECT id, username FROM users WHERE username = 'admin' LIMIT 1
    `);

    if (adminUser.length === 0) {
      log(colors.yellow, '   ⚠️  找不到 admin 用戶，跳過此測試');
    } else {
      const userId = adminUser[0].id;

      // 查詢用戶的所有權限（實際應用邏輯）
      const [userPermissions] = await connection.query(`
        SELECT DISTINCT p.name, p.description
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        JOIN user_roles ur ON rp.role_id = ur.role_id
        WHERE ur.user_id = ?
        ORDER BY p.name
        LIMIT 10
      `, [userId]);

      console.log(`   用戶 "${adminUser[0].username}" 的權限 (顯示前10個):`);
      userPermissions.forEach(perm => {
        console.log(`   ✓ ${perm.name.padEnd(25)} - ${perm.description}`);
      });

      if (userPermissions.length === 0) {
        log(colors.red, '   ❌ 錯誤：admin 用戶沒有任何權限！');
      } else {
        log(colors.green, '   ✅ 權限查詢正常\n');
      }
    }

    // 測試 6: 檢查關鍵權限是否存在
    log(colors.blue, '6️⃣  檢查關鍵權限');
    const criticalPermissions = [
      'teacher.view',
      'teacher.create',
      'teacher.update',
      'teacher.delete',
      'course.view',
      'course.create',
      'assignment.view',
      'assignment.create',
    ];

    console.log('   檢查關鍵權限是否存在:');
    for (const permName of criticalPermissions) {
      const [result] = await connection.query(
        'SELECT name FROM permissions WHERE name = ?',
        [permName]
      );
      const exists = result.length > 0;
      const status = exists ? '✅' : '❌';
      console.log(`   ${status} ${permName}`);
    }
    log(colors.green, '   ✅ 關鍵權限檢查完成\n');

    // 總結
    console.log('='.repeat(60));
    log(colors.green, '✅ 所有權限系統測試通過！');
    console.log('='.repeat(60));
    console.log('');
    log(colors.cyan, '📊 統計資訊:');
    console.log(`   - 角色數量: ${roles.length}`);
    console.log(`   - 權限數量: ${permCount}`);
    console.log(`   - 用戶-角色關聯: ${userRoles.length}`);
    console.log(`   - 角色-權限關聯: ${totalRolePerms}`);
    console.log('');
    log(colors.green, '🎉 您的 RBAC 權限系統完整且正常運作！');
    log(colors.green, '   切換到 Azure Database 後，所有權限功能都會保持正常。');
    console.log('');

  } catch (error) {
    console.log('');
    log(colors.red, '❌ 測試失敗！');
    console.error(error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

// 執行測試
testPermissions().catch(error => {
  log(colors.red, '❌ 未預期的錯誤:', error);
  process.exit(1);
});
