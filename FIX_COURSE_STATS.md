# 修復：派課管理統計功能

## 🐛 問題描述

使用者反應：
> "課程行事曆、課程類型分佈、今日課程總覽沒有跟著我點選的日期更動，之前說的那些功能連上後端就失敗了"

## 🔍 問題分析

### 1. 統計功能不更新

**原因**：
- 進入派課管理頁面時，沒有調用 `updateCourseView()` 來初始化統計
- 用戶需要手動選擇師資或改變日期才會觸發更新

### 2. teacherId 類型不匹配

**原因**：
- 從後端載入的數據可能將 `teacherId` 存為字串
- 從下拉選單取得的值也是字串
- 但在比較時使用了嚴格相等 `===`，導致 `"123" !== 123` 匹配失敗

**範例**：
```javascript
// 問題代碼
const monthCourses = courseAssignments.filter(course => {
  return course.teacherId === currentCourseTeacherId  // ❌ "123" !== 123
});
```

### 3. 數據載入時機問題

**原因**：
- 從後端載入數據時，只有在 `currentMode === 'courses'` 時才更新視圖
- 如果用戶在其他頁面時載入完成，統計不會更新

---

## ✅ 解決方案

### 1. 初始化時更新統計

在 `showCourseManagementView()` 中添加：

```javascript
function showCourseManagementView() {
  // ... 原有代碼 ...

  // ✨ 新增：更新課程視圖（如果已選擇師資）
  if (currentCourseTeacherId) {
    updateCourseView();
  }
}
```

### 2. 修復 teacherId 類型匹配

將所有 teacherId 比較改為 Number 轉換：

```javascript
// 修復前
course.teacherId === currentCourseTeacherId  // ❌

// 修復後
Number(course.teacherId) === Number(currentCourseTeacherId)  // ✅
```

**影響的函數**：
- `updateCourseStats()` - 本月時數、今日課程統計
- `getFilteredCourses()` - 已經使用 Number，保持不變

### 3. 改進數據載入處理

```javascript
async function loadCourseAssignmentsFromBackend() {
  try {
    const data = await api.list('courseAssignments');
    if (Array.isArray(data)) {
      if (data.length > 0) {
        courseAssignments = data;
        // ... 同步到行事曆 ...
      } else {
        console.log('📝 後端派課數據為空');
      }
    }
  } catch (error) {
    console.warn('⚠️ 無法從後端載入派課數據，使用本地數據:', error);
    // ✨ 降級使用本地數據
    if (courseAssignments.length > 0) {
      console.log('📌 使用本地派課數據，共', courseAssignments.length, '筆');
    }
  }
}
```

### 4. 添加調試日誌

在關鍵函數中添加 console.log：

```javascript
function updateCourseView() {
  console.log('🔄 更新課程視圖 - 師資ID:', currentCourseTeacherId);
  console.log('📦 當前 courseAssignments 總數:', courseAssignments.length);
  // ...
}

function updateCourseStats() {
  console.log('🔍 更新統計 - 師資ID:', currentCourseTeacherId, '過濾後課程數:', filteredCourses.length);
  console.log('📊 統計結果 - 總時數:', totalHours, '今日課程:', todayCourses);
  // ...
}

function renderCourseTypeCards() {
  console.log('🎨 渲染課程類型卡片 - 課程數:', filteredCourses.length);
  console.log('📈 課程類型統計:', typeCount);
  // ...
}
```

---

## 🧪 測試步驟

### 1. 打開瀏覽器開發者工具

按 `F12` 打開開發者工具，切換到 **Console** 標籤

### 2. 重新整理頁面

應該看到以下訊息：
```
✅ 派課數據已從後端載入，共 X 筆
✅ 派課數據已同步到行事曆，共 X 筆
```

### 3. 進入派課管理

點選「派課管理」，觀察 Console：
```
🔄 更新課程視圖 - 師資ID: null 日期範圍: 2025-11-01 ~ 2025-11-30
📦 當前 courseAssignments 總數: X
```

### 4. 選擇師資

選擇一位師資，應該看到：
```
🔄 更新課程視圖 - 師資ID: 12345
📦 當前 courseAssignments 總數: X
🔍 更新統計 - 師資ID: 12345 過濾後課程數: Y
📊 統計結果 - 總時數: Z ...
🎨 渲染課程類型卡片 - 課程數: Y
📈 課程類型統計: { 正課: 3, 補課: 2 }
```

### 5. 改變日期範圍

改變起始或結束日期，統計應該即時更新

### 6. 檢查統計卡片

確認以下區域正確顯示：
- **總時數** - 顯示數字而非 0
- **課程總數** - 顯示數字而非 0
- **本月時數** - 顯示本月的時數
- **今日課程** - 顯示今天的課程數
- **課程類型分佈** - 顯示彩色卡片（正課、補課等）

---

## 📊 預期結果

### 正常情況

✅ 選擇師資後，所有統計立即更新
✅ 改變日期範圍後，統計即時更新
✅ 課程類型分佈顯示彩色卡片
✅ 本月時數、今日課程正確顯示
✅ Console 顯示詳細的調試信息

### 異常情況處理

如果 Console 顯示：
```
📦 當前 courseAssignments 總數: 0
```

**可能原因**：
1. 後端沒有派課數據
2. API 連線失敗
3. localStorage 被清空

**解決方法**：
1. 檢查後端 Google Sheets 是否有數據
2. 測試 API 連線（點擊「測試 API 連線」按鈕）
3. 手動新增一筆派課測試

---

## 🔧 技術細節

### 數據流程

```
頁面載入
  ↓
loadCourseAssignmentsFromBackend()
  ↓
courseAssignments 陣列更新
  ↓
[用戶進入派課管理頁面]
  ↓
showCourseManagementView()
  ↓
updateCourseView() ← 如果已選擇師資
  ↓
├─ updateCourseStats() ← 計算統計數字
├─ renderCourseTypeCards() ← 渲染類型卡片
├─ renderCourseTimeline() ← 渲染時間軸
└─ renderTeacherWeekSchedule() ← 渲染週課表
```

### 關鍵變數

```javascript
courseAssignments = [
  {
    id: 12345,
    teacherId: 101,        // ← 可能是字串 "101" 或數字 101
    name: "數學課",
    date: "2025-11-03",
    time: "09:00-10:00",
    type: "正課",
    note: "第一章"
  },
  // ...
]
```

### 過濾邏輯

```javascript
function getFilteredCourses(teacherId) {
  return courseAssignments.filter(course => {
    // 師資匹配（轉換為數字比較）
    const matchTeacher = Number(course.teacherId) === Number(teacherId);

    // 日期範圍匹配
    const inDateRange = (!currentCourseStartDate || !currentCourseEndDate) ||
                       (course.date >= currentCourseStartDate &&
                        course.date <= currentCourseEndDate);

    return matchTeacher && inDateRange;
  });
}
```

---

## 🚀 Git 提交

- **Commit**: `359d976`
- **分支**: `claude/debug-branch-62-011CUkVnnPPd2xXAYqD1NJF8`
- **狀態**: ✅ 已推送到遠程倉庫

---

## 📝 後續建議

如果問題仍然存在，請提供以下信息：

1. **Console 截圖** - 完整的調試日誌
2. **派課數據範例** - localStorage 中的 courseAssignments 內容
3. **操作步驟** - 具體的操作順序
4. **錯誤訊息** - 任何紅色的錯誤信息

可以使用以下命令在 Console 中查看數據：

```javascript
// 查看派課數據
console.log('courseAssignments:', JSON.parse(localStorage.getItem('courseAssignments')));

// 查看當前選擇
console.log('當前師資ID:', currentCourseTeacherId);
console.log('日期範圍:', currentCourseStartDate, '~', currentCourseEndDate);

// 手動觸發更新
updateCourseView();
```

---

**修復完成！請重新整理頁面並按照測試步驟操作** 🎉
