# 修復：行事曆顯示派課數據

## 🐛 問題描述

使用者反應：**派課管理的數據從後端載入成功，但行事曆上沒有顯示**

## 🔍 根本原因

系統有兩個獨立的數據陣列：
- `courseAssignments[]` - 派課管理的數據
- `calendarEvents[]` - 行事曆顯示的事件

當從後端載入派課數據時，只更新了 `courseAssignments`，但沒有同步到 `calendarEvents`，導致行事曆無法顯示。

## ✅ 解決方案

### 新增函數：`syncCourseAssignmentsToCalendar()`

```javascript
function syncCourseAssignmentsToCalendar() {
  // 1. 先移除所有由派課產生的行事曆事件
  calendarEvents = calendarEvents.filter(e => !e.courseId);

  // 2. 將所有派課轉換為行事曆事件
  courseAssignments.forEach(course => {
    const teacher = teachers.find(t => t.id === course.teacherId);
    const teacherName = teacher ? teacher.name : '未知師資';

    calendarEvents.push({
      id: course.id,
      date: course.date,
      title: `${course.name} - ${teacherName}`,
      time: course.time,
      teacherId: course.teacherId,
      location: course.type,
      note: `課程類型：${course.type}`,
      color: getCourseTypeColor(course.type),
      courseId: course.id // 標記為派課產生的事件
    });
  });

  saveCalendarLocal();
}
```

### 修改點

#### 1. `loadCourseAssignmentsFromBackend()` 函數
從後端載入數據後，自動調用同步函數：

```javascript
async function loadCourseAssignmentsFromBackend() {
  // ... 載入數據

  // ✨ 新增：同步到行事曆
  syncCourseAssignmentsToCalendar();

  // ... 更新顯示
}
```

#### 2. `DOMContentLoaded` 事件處理
頁面初始化時確保同步：

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  // ... 載入師資數據

  // 載入派課數據
  await loadCourseAssignmentsFromBackend();

  // ✨ 新增：確保本地數據也同步到行事曆
  if (courseAssignments.length > 0) {
    syncCourseAssignmentsToCalendar();
  }
});
```

## 🎯 工作流程

### 從後端載入派課數據
```
1. 用戶打開頁面
2. 從後端載入 courseAssignments 數據
3. 自動調用 syncCourseAssignmentsToCalendar()
4. 將每筆派課轉換為行事曆事件
5. 行事曆正確顯示所有派課
```

### 新增派課記錄
```
1. 用戶新增派課
2. 加入到 courseAssignments 陣列
3. 同時加入到 calendarEvents 陣列（已有的邏輯）
4. 儲存到 localStorage 和後端
5. 行事曆即時顯示新派課
```

### 刪除派課記錄
```
1. 用戶刪除派課
2. 從 courseAssignments 移除
3. 從 calendarEvents 移除（透過 courseId 標記識別）
4. 同步到後端
5. 行事曆即時移除該事件
```

## 📊 數據關係

```
courseAssignments (派課數據)
  ↓ syncCourseAssignmentsToCalendar()
calendarEvents (行事曆事件)
  ↓ renderCalendar()
行事曆顯示
```

## 🔑 關鍵設計

### courseId 標記
每個由派課產生的行事曆事件都有 `courseId` 屬性：

```javascript
{
  id: 12345,
  courseId: 12345,  // ← 標記為派課產生的事件
  date: '2025-11-03',
  title: '數學課 - 王老師',
  // ...
}
```

這樣可以：
- 區分手動添加的事件和派課產生的事件
- 刪除派課時能找到對應的行事曆事件
- 同步時能正確更新派課事件而不影響手動事件

## 📝 測試步驟

1. **清空快取測試**
   - 清除瀏覽器 localStorage
   - 重新整理頁面
   - 檢查行事曆是否顯示從後端載入的派課數據

2. **新增派課測試**
   - 進入派課管理
   - 新增一筆派課記錄
   - 切換到行事曆
   - 確認新派課顯示在行事曆上

3. **刪除派課測試**
   - 刪除一筆派課記錄
   - 切換到行事曆
   - 確認該派課已從行事曆消失

4. **跨設備同步測試**
   - 在設備 A 新增派課
   - 在設備 B 打開頁面
   - 確認設備 B 的行事曆顯示設備 A 新增的派課

## ✨ 預期效果

- ✅ 行事曆正確顯示所有派課記錄
- ✅ 派課顏色根據課程類型自動設置
- ✅ 顯示師資名稱和課程資訊
- ✅ 新增/刪除派課時行事曆即時更新
- ✅ 支援跨設備數據同步

## 🚀 Git 提交

- Commit: `110883e`
- 分支: `claude/debug-branch-62-011CUkVnnPPd2xXAYqD1NJF8`
- 已推送到遠程倉庫

---

**修復完成！** 🎉 現在派課數據會正確顯示在行事曆上。
