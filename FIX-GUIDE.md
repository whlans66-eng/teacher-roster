# 📖 课程数据无法传送到前端 - 修复指南

## 问题描述
已登录课程的后端数据无法传送到前端显示。

## 🔍 诊断步骤

### 第一步：使用诊断工具
1. 打开浏览器访问 `diagnose-api.html`
2. 点击"开始诊断"按钮
3. 查看诊断结果

### 第二步：检查常见问题

#### 问题 1: API URL 未正确配置
**症状**: Ping 测试失败，显示网络错误

**解决方案**:
1. 打开 `js/api.js` 文件
2. 检查第 9 行的 `baseUrl`:
   ```javascript
   baseUrl: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'
   ```
3. 确保这个 URL 是您在 Google Apps Script 部署后获得的 Web App URL
4. 如果不确定，请重新部署 Google Apps Script:
   - 打开 Google Apps Script 编辑器
   - 点击"部署" → "新部署"
   - 选择类型: "网络应用程序"
   - 执行身份: "我"
   - 访问权限: "所有人"
   - 点击"部署"
   - 复制新的 Web App URL

#### 问题 2: Token 不匹配
**症状**: API 返回 "Invalid token" 错误

**解决方案**:
1. 打开 `backend-api.gs` 查看第 14 行:
   ```javascript
   const TOKEN = 'tr_demo_12345';
   ```
2. 打开 `js/api.js` 查看第 10 行:
   ```javascript
   token: 'tr_demo_12345'
   ```
3. 确保两个 Token 完全一致

#### 问题 3: Google Sheets 中没有数据
**症状**: API 连接成功，但返回空数组

**解决方案**:
1. 打开您的 Google Sheets: `https://docs.google.com/spreadsheets/d/1CPhI67yZt1W6FLV9Q02gjyJsdTP79pgUAc27ZZw3nJ4/`
2. 检查是否有名为 `courseAssignments` 的工作表
3. 检查该工作表是否有数据:
   - 第一行应该是标题: `id, teacherId, name, date, time, type, status, note`
   - 第二行开始应该有课程数据
4. 如果没有数据，可以手动添加一笔测试数据:
   ```
   1 | 1 | 测试课程 | 2025-11-04 | 09:00-12:00 | 正课 | 上班 | 测试备注
   ```

#### 问题 4: CORS 问题
**症状**: 浏览器控制台显示 CORS 错误

**解决方案**:
已在后端代码中添加了 CORS 标头，但如果仍有问题:
1. 确认 Google Apps Script 部署设置:
   - 访问权限必须设为"所有人"
2. 尝试重新部署 Apps Script
3. 清除浏览器缓存后重试

#### 问题 5: 数据同步逻辑问题
**症状**: API 可以返回数据，但前端页面显示为空

**解决方案**:
检查 `course-management.html` 的初始化逻辑:

1. 打开浏览器开发者工具 (F12)
2. 转到 Console 标签
3. 查看是否有以下日志:
   - `✅ 后端连线成功`
   - `📥 从后端载入资料...`
   - `✅ 资料载入完成`

如果没有这些日志，检查:
- `initializeDataSync()` 函数是否被调用 (在第 619 行)
- 是否有 JavaScript 错误阻止了执行

## 🛠️ 快速修复方案

### 方案 A: 重置并重新同步
```javascript
// 在浏览器控制台执行:
localStorage.clear();
location.reload();
```
然后重新载入页面，数据会从后端重新同步。

### 方案 B: 手动测试 API
在浏览器控制台执行:
```javascript
// 测试连接
api.ping().then(result => console.log('Ping:', result));

// 测试读取数据
api.listAll().then(data => {
  console.log('所有数据:', data);
  console.log('课程数量:', data.courseAssignments?.length);
});

// 测试读取课程
api.list('courseAssignments').then(courses => {
  console.log('课程列表:', courses);
});
```

### 方案 C: 检查网络请求
1. 打开浏览器开发者工具 (F12)
2. 转到 Network 标签
3. 刷新页面
4. 查找对 `script.google.com` 的请求
5. 检查:
   - 状态码是否为 200
   - Response 是否包含数据
   - 是否有错误消息

## 📝 数据格式检查

确保后端返回的数据格式正确:

### courseAssignments 表的正确格式:
```javascript
{
  "ok": true,
  "data": {
    "courseAssignments": [
      {
        "id": 1,
        "teacherId": 1,
        "name": "课程名称",
        "date": "2025-11-04",
        "time": "09:00-12:00",
        "type": "正课",
        "status": "上班",
        "note": "备注"
      }
    ]
  }
}
```

## 🔧 高级调试

### 启用详细日志
在 `js/api.js` 中添加更多日志:

```javascript
async loadFromBackend() {
  try {
    console.log('📥 从后端载入资料...');
    const allData = await this.api.listAll();

    // 添加详细日志
    console.log('🔍 原始数据:', allData);
    console.log('🔍 courseAssignments:', allData.courseAssignments);

    // ... 其余代码
  }
}
```

### 检查数据归一化
确保数据归一化函数正常工作:

```javascript
// 在浏览器控制台测试:
const testCourse = {
  id: "1",
  teacherId: "1",
  name: "测试",
  date: "2025-11-04",
  time: "09:00-12:00",
  type: "正课",
  status: "上班"
};

console.log('归一化前:', testCourse);
console.log('归一化后:', normalizeCourseAssignment(testCourse));
```

## ✅ 验证修复

修复后，验证以下内容:

1. **诊断工具测试全部通过**
   - 访问 `diagnose-api.html`
   - 所有测试显示 ✅

2. **浏览器控制台无错误**
   - 打开 F12 开发者工具
   - Console 标签中无红色错误

3. **localStorage 有数据**
   ```javascript
   // 在控制台执行:
   JSON.parse(localStorage.getItem('courseAssignments'))
   ```
   应该返回课程数组

4. **前端页面显示数据**
   - 课程行事历有课程显示
   - 统计数据不为 0
   - 今日课程总览有内容

## 📞 需要更多帮助？

如果以上方法都无法解决问题，请提供:
1. `diagnose-api.html` 的完整诊断结果
2. 浏览器控制台的错误消息（截图或文字）
3. Network 标签中对 Google Apps Script 请求的详细信息
4. Google Sheets 中 courseAssignments 表的截图

## 🎯 常见成功案例

### 案例 1: Token 不匹配
用户症状: 一直显示"Invalid token"错误
解决方案: 检查发现前端 token 多了一个空格，删除空格后正常

### 案例 2: 部署 ID 错误
用户症状: Ping 失败，404 错误
解决方案: 使用了旧的部署 URL，重新部署后获取新 URL 解决

### 案例 3: 工作表名称错误
用户症状: API 返回空数据
解决方案: Google Sheets 中工作表名称为 "courseAssignment"（少了s），改名为 "courseAssignments" 后正常

### 案例 4: 权限设置问题
用户症状: 访问 API URL 要求登录
解决方案: 重新部署时将"访问权限"从"仅限我自己"改为"所有人"
