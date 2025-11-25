# 多人協作編輯系統

## 📋 概述

此系統允許 **10個人（或更多）同時編輯不同的課程/教師資料**，而不會互相覆蓋。

### 核心機制

```
✅ 可行：
- A 編輯課程 1，B 編輯課程 2 → 完全沒問題！
- A 編輯課程 1，B 編輯課程 3，C 編輯教師資料 → 都可以！

⚠️ 需處理：
- A 和 B 同時編輯課程 1 → 系統會警告並要求協調
```

---

## 🏗️ 系統架構

### 1. 細粒度鎖定（Edit Locks）

每筆資料（課程/教師）都可以獨立鎖定：

```
editLocks 表格結構：
┌────────┬────────────────┬──────────┬───────────┬──────────┬────────────┐
│ lockId │ table          │ recordId │ sessionId │ userName │ lockedAt   │
├────────┼────────────────┼──────────┼───────────┼──────────┼────────────┤
│ uuid-1 │ courseAssignments │ 101   │ sess-abc  │ 張三     │ 10:30:00   │
│ uuid-2 │ courseAssignments │ 102   │ sess-def  │ 李四     │ 10:31:00   │
│ uuid-3 │ teachers       │ 5        │ sess-ghi  │ 王五     │ 10:32:00   │
└────────┴────────────────┴──────────┴───────────┴──────────┴────────────┘

→ 張三正在編輯課程 101
→ 李四正在編輯課程 102
→ 王五正在編輯教師 5
→ 三人互不干擾 ✅
```

### 2. 版本控制（Versioning）

每筆資料都有版本號：

```javascript
{
  id: 101,
  name: "進階程式設計",
  version: 5,              // 版本號
  lastModifiedBy: "張三",  // 最後修改者
  lastModifiedAt: "2025-11-25 10:30"
}
```

儲存時檢查版本：
```javascript
if (後端版本 !== 本地版本) {
  // 有人先修改了，需要處理衝突
  alert(`${lastModifiedBy} 已修改此課程`);
}
```

### 3. 自動清理機制

- **Session 超時**：5 分鐘無活動自動清理
- **Lock 超時**：10 分鐘無更新自動釋放
- **頁面關閉**：自動釋放所有鎖定

---

## 🚀 使用方式

### 前端 API

#### 1. 取得編輯鎖定

```javascript
// 當使用者開始編輯課程時
const result = await editLockManager.acquireLock('courseAssignments', courseId);

if (result.locked && result.ownLock) {
  // 成功取得鎖定，可以編輯
  console.log('🔒 已鎖定，可以編輯');
} else {
  // 已被其他人鎖定
  alert(`此課程正被 ${result.lockedBy} 編輯中`);
}
```

#### 2. 釋放編輯鎖定

```javascript
// 編輯完成或取消編輯時
await editLockManager.releaseLock('courseAssignments', courseId);
console.log('🔓 已釋放鎖定');
```

#### 3. 檢查鎖定狀態

```javascript
// 檢查特定課程是否被鎖定
const lock = await editLockManager.checkLock('courseAssignments', courseId);

if (lock) {
  console.log(`被 ${lock.userName} 鎖定，於 ${lock.lockedAt}`);
} else {
  console.log('此課程目前未被鎖定');
}
```

#### 4. 取得所有鎖定

```javascript
// 取得所有課程的鎖定狀態
const locks = await editLockManager.getAllLocks('courseAssignments');

locks.forEach(lock => {
  console.log(`課程 ${lock.recordId} 被 ${lock.userName} 鎖定`);
});
```

---

## 📝 實作範例

### 範例 1：編輯課程時自動鎖定

```javascript
// 當使用者點擊「編輯」按鈕
async function editCourse(courseId) {
  // 1. 嘗試取得鎖定
  const lockResult = await editLockManager.acquireLock('courseAssignments', courseId);

  if (!lockResult.locked || !lockResult.ownLock) {
    // 已被其他人鎖定
    alert(`⚠️ 此課程正被 ${lockResult.lockedBy} 編輯中

請稍後再試，或聯絡 ${lockResult.lockedBy} 協調。`);
    return;
  }

  // 2. 成功取得鎖定，開啟編輯對話框
  const modal = openEditModal(courseId);

  // 3. 當對話框關閉時釋放鎖定
  modal.onClose = async () => {
    await editLockManager.releaseLock('courseAssignments', courseId);
  };
}
```

### 範例 2：儲存時檢查版本

```javascript
async function saveCourse(course) {
  try {
    // 從後端取得最新版本
    const latestCourse = await api.getCourse(course.id);

    // 檢查版本號
    if (latestCourse.version !== course.version) {
      // 版本不一致，有衝突
      const shouldOverwrite = confirm(`
⚠️ 衝突警告

${latestCourse.lastModifiedBy} 在 ${latestCourse.lastModifiedAt} 修改了此課程

你的版本：v${course.version}
最新版本：v${latestCourse.version}

是否要覆蓋 ${latestCourse.lastModifiedBy} 的修改？
（建議先取消，重新載入後再編輯）
      `);

      if (!shouldOverwrite) {
        return; // 取消儲存
      }
    }

    // 版本一致或使用者選擇覆蓋，儲存資料
    course.version = (latestCourse.version || 0) + 1; // 版本號 +1
    course.lastModifiedBy = sessionManager.userName;
    course.lastModifiedAt = new Date().toISOString();

    await api.saveCourse(course);

    // 釋放鎖定
    await editLockManager.releaseLock('courseAssignments', course.id);

    alert('✅ 儲存成功！');
  } catch (error) {
    alert('❌ 儲存失敗: ' + error.message);
  }
}
```

### 範例 3：顯示「正在編輯」提示

```javascript
// 定期檢查並顯示誰正在編輯
async function showEditingStatus() {
  const locks = await editLockManager.getAllLocks('courseAssignments');

  const statusDiv = document.getElementById('editingStatus');

  if (locks.length === 0) {
    statusDiv.innerHTML = '目前沒有人正在編輯';
    return;
  }

  const html = locks.map(lock => {
    const timeAgo = getTimeAgo(lock.lockedAt);
    return `
      <div class="editing-badge">
        👤 ${lock.userName} 正在編輯課程 ${lock.recordId}
        <small>(${timeAgo})</small>
      </div>
    `;
  }).join('');

  statusDiv.innerHTML = html;
}

// 每 10 秒更新一次
setInterval(showEditingStatus, 10000);
```

---

## 🎯 完整流程示例

### 情境：10 個人同時使用系統

```
時間軸：

10:00  A 開啟頁面，註冊 session
10:01  B、C、D 也開啟頁面
       → 4 人都在線，互不干擾 ✅

10:05  A 開始編輯課程 101
       → 系統鎖定課程 101 給 A

10:06  B 也想編輯課程 101
       → ❌ 系統提示：「此課程正被 A 編輯中」

10:06  B 改為編輯課程 102
       → ✅ 成功！課程 102 沒有被鎖定

10:08  C 編輯課程 103
       D 編輯課程 104
       → ✅ 都可以！

10:10  A 儲存課程 101
       → 版本號 v1 → v2
       → 釋放鎖定

10:11  B 再次嘗試編輯課程 101
       → ✅ 成功！A 已經釋放鎖定了

結果：4 個人同時編輯 4 個不同課程，互不干擾 ✅
```

---

## ⚠️ 注意事項

### 1. 鎖定會自動過期

- **10 分鐘**無更新會自動釋放
- 如果編輯時間很長，系統會自動釋放鎖定
- 建議：長時間編輯時，定期儲存草稿

### 2. 網路斷線的處理

```javascript
// 頁面關閉時自動釋放鎖定
window.addEventListener('beforeunload', () => {
  editLockManager.releaseAllLocks();
});

// 但如果瀏覽器崩潰或強制關閉
// → 鎖定會在 10 分鐘後自動清理
```

### 3. 版本衝突的處理

當兩人同時編輯同一筆資料時：

```
方案 A：先到先贏
→ A 先取得鎖定，B 必須等待

方案 B：最後儲存贏
→ 都能編輯，但 B 儲存時會收到警告

目前系統：混合模式
→ 有鎖定提示，但可以選擇強制編輯
```

---

## 🔧 後端 API

### 鎖定相關

#### 取得鎖定
```
GET ?action=lock_acquire&table=courseAssignments&recordId=101&sessionId=xxx&userName=張三

Response:
{
  "ok": true,
  "locked": true,
  "ownLock": true
}
```

#### 釋放鎖定
```
GET ?action=lock_release&table=courseAssignments&recordId=101&sessionId=xxx

Response:
{
  "ok": true,
  "released": true
}
```

#### 檢查鎖定
```
GET ?action=lock_check&table=courseAssignments&recordId=101

Response:
{
  "ok": true,
  "lock": {
    "userName": "張三",
    "lockedAt": "2025-11-25T10:30:00Z",
    ...
  }
}
```

#### 列出所有鎖定
```
GET ?action=lock_list&table=courseAssignments

Response:
{
  "ok": true,
  "locks": [
    { "recordId": "101", "userName": "張三", ... },
    { "recordId": "102", "userName": "李四", ... }
  ]
}
```

---

## 📊 資料表結構

### activeSessions（線上使用者）

| 欄位 | 說明 |
|------|------|
| sessionId | Session ID |
| userName | 使用者名稱 |
| userEmail | 使用者 Email |
| pageUrl | 正在瀏覽的頁面 |
| lastActiveTime | 最後活動時間 |
| userAgent | 瀏覽器資訊 |
| kicked | 是否被踢出 |

### editLocks（編輯鎖定）

| 欄位 | 說明 |
|------|------|
| lockId | 鎖定 ID |
| table | 表格名稱 |
| recordId | 資料 ID |
| sessionId | Session ID |
| userName | 鎖定者名稱 |
| lockedAt | 鎖定時間 |

### 資料表新增欄位

所有資料表（teachers, courseAssignments, maritimeCourses）都新增：

| 欄位 | 說明 |
|------|------|
| version | 版本號（每次修改 +1） |
| lastModifiedBy | 最後修改者 |
| lastModifiedAt | 最後修改時間 |

---

## 🚀 部署步驟

### 1. 更新後端

將新的 `backend-api.gs` 部署到 Google Apps Script：

```
1. 開啟 Google Apps Script 專案
2. 複製新的程式碼
3. 部署新版本
4. Google Sheets 會自動建立新表格：
   - activeSessions
   - editLocks
5. 現有表格會自動新增欄位：
   - version
   - lastModifiedBy
   - lastModifiedAt
```

### 2. 更新前端

確保 `js/api.js` 已包含：
- `SessionManager`
- `EditLockManager`

### 3. 測試

開啟多個瀏覽器視窗測試：

```
□ 測試 1：兩人編輯不同課程 → 應該都成功
□ 測試 2：兩人編輯同一課程 → 應該有提示
□ 測試 3：關閉頁面後鎖定自動釋放
□ 測試 4：10 分鐘後鎖定自動過期
```

---

## 💡 最佳實踐

### 1. 提示使用者誰正在編輯

在頁面頂部顯示：

```javascript
👥 目前有 3 人在線：張三、李四、王五

🔒 正在編輯：
  - 張三正在編輯課程 101
  - 李四正在編輯教師資料
```

### 2. 定期儲存草稿

```javascript
// 每 2 分鐘自動儲存
setInterval(() => {
  saveDraft();
}, 2 * 60 * 1000);
```

### 3. 離開前提醒

```javascript
window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges()) {
    e.preventDefault();
    e.returnValue = '';
    return '你有未儲存的修改，確定要離開嗎？';
  }
});
```

---

## ❓ 常見問題

### Q1: 如果兩人真的需要同時編輯同一個課程怎麼辦？

A: 建議協調分工，或者：
- 一人編輯課程基本資料
- 另一人編輯課程備註
- 最後合併修改

### Q2: 鎖定會不會永久卡住？

A: 不會，鎖定會在以下情況自動釋放：
- 10 分鐘無更新
- 頁面關閉
- Session 過期（5 分鐘無活動）

### Q3: 可以強制解除別人的鎖定嗎？

A: 可以，保留了「踢人」功能作為最後手段。
管理員可以踢出使用者，自動釋放其所有鎖定。

### Q4: 效能如何？10 個人同時使用會不會很慢？

A: 不會！因為：
- 鎖定檢查只在需要時進行
- Session 心跳只有 30 秒一次
- 資料傳輸量很小
- Google Apps Script 可以處理更多並發

---

## 📈 效能指標

- **並發使用者**：50+ 人沒問題
- **鎖定檢查時間**：< 1 秒
- **Session 心跳**：每 30 秒
- **鎖定超時**：10 分鐘
- **Session 超時**：5 分鐘

---

**最後更新**：2025-11-25
**版本**：2.0.0
