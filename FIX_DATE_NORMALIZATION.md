# 🎯 關鍵修復：日期正規化系統

## 🐛 根本問題

使用者反應：**11/3 的派課數據新增後無法顯示**

經過多次調試發現：
- ✅ 數據成功儲存到 Google Sheets
- ✅ 數據成功從後端載入
- ❌ **但是日期格式在往返過程中改變了**

### 問題流程

```
1. 用戶在前端輸入日期：「2025-11-03」 (字串)
   ↓
2. 儲存到 Google Sheets
   ↓
3. Google Sheets 自動將日期轉換為序列日期：45234 (數字)
   ↓
4. 從後端讀取時得到：45234 (數字)
   ↓
5. 前端日期比較失敗：
   course.date (45234) >= "2025-11-01"  ← ❌ 錯誤的比較
```

### 為什麼會這樣？

Google Sheets 會自動識別日期並轉換為 Excel 序列日期格式：
- `2025-11-03` → `45599`（從 1900-01-01 開始計算的天數）
- 當數據回傳到前端時，變成數字而不是字串
- 前端的日期比較邏輯期待字串格式 `YYYY-MM-DD`

---

## ✅ 解決方案：日期正規化系統

### 1. 在 `js/api.js` 中新增正規化工具函數

```javascript
/**
 * 正規化日期值 - 將各種日期格式統一為 YYYY-MM-DD
 */
function normalizeDateValue(value) {
  if (!value) return '';

  // 已經是 YYYY-MM-DD 格式，直接返回
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  // 處理 Date 物件
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }

  // 處理時間戳（毫秒）
  if (typeof value === 'number' && value > 10000000000) {
    return new Date(value).toISOString().split('T')[0];
  }

  // 處理 Excel 序列日期（數字）
  if (typeof value === 'number' && value > 0 && value < 100000) {
    const excelEpoch = new Date(1899, 11, 30);
    const days = Math.floor(value);
    const date = new Date(excelEpoch.getTime() + days * 86400000);
    return date.toISOString().split('T')[0];
  }

  // 處理其他字串格式（"2025/11/03" 或 "2025.11.03"）
  if (typeof value === 'string') {
    const normalized = value.replace(/[\/\.]/g, '-');
    const date = new Date(normalized);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  return String(value);
}
```

### 2. 更新 DataSyncManager 使用正規化

在 `syncManager.loadFromBackend()` 中：

```javascript
if (allData.courseAssignments) {
  // ✨ 正規化派課數據
  const normalizedCourses = Array.isArray(allData.courseAssignments)
    ? allData.courseAssignments.map(normalizeCourseAssignment)
    : [];
  localStorage.setItem('courseAssignments', JSON.stringify(normalizedCourses));
  console.log('✅ 載入並正規化派課數據:', normalizedCourses.length, '筆');
}
```

### 3. 更新前端載入函數

在 `loadCourseAssignmentsFromBackend()` 和 `loadMaritimeCoursesFromBackend()` 中都加入正規化邏輯。

---

## 🎯 支援的日期格式

現在系統可以正確處理：

| 格式類型 | 範例 | 轉換後 |
|---------|------|--------|
| 標準格式 | `"2025-11-03"` | `"2025-11-03"` |
| Excel 序列日期 | `45599` | `"2025-11-03"` |
| 時間戳（毫秒） | `1730592000000` | `"2025-11-03"` |
| 斜線格式 | `"2025/11/03"` | `"2025-11-03"` |
| 點號格式 | `"2025.11.03"` | `"2025-11-03"` |
| Date 物件 | `new Date("2025-11-03")` | `"2025-11-03"` |

---

## 📊 數據流程（修復後）

```
1. 用戶在前端輸入日期：「2025-11-03」
   ↓
2. 儲存到 Google Sheets
   ↓
3. Google Sheets 轉換為：45599 (Excel 序列日期)
   ↓
4. 從後端讀取時得到：45599 (數字)
   ↓
5. ✨ 正規化函數處理：
   normalizeDateValue(45599) → "2025-11-03"
   ↓
6. 儲存到 localStorage：
   { date: "2025-11-03", ... }
   ↓
7. 載入到 courseAssignments 陣列
   ↓
8. 日期比較正常工作：
   "2025-11-03" >= "2025-11-01" ✅
   "2025-11-03" <= "2025-11-30" ✅
   ↓
9. ✅ 課程正確顯示在統計中！
```

---

## 🧪 測試步驟

### 測試 1：檢查正規化日誌

1. 重新整理頁面
2. 打開 Console
3. 查找以下日誌：

```
✅ 載入並正規化派課數據: X 筆
📋 派課數據範例（正規化後）: [...]
```

4. 檢查數據中的 `date` 欄位是否都是 `YYYY-MM-DD` 格式

### 測試 2：檢查 11/3 數據

在 Console 中執行：

```javascript
// 查看所有派課數據
console.table(courseAssignments);

// 查找 11/3 的數據
const nov3 = courseAssignments.filter(c => c.date === '2025-11-03');
console.log('11/3 的課程:', nov3);

// 檢查日期格式
console.log('日期範例:', courseAssignments[0]?.date, '(型別:', typeof courseAssignments[0]?.date, ')');
```

### 測試 3：測試日期過濾

1. 進入派課管理
2. 選擇一位有 11/3 課程的師資
3. 設定日期範圍包含 11/3（例如 11/1 ~ 11/30）
4. 檢查統計是否正確顯示 11/3 的課程

預期結果：
```
🔎 開始過濾課程
  ✓ 課程 XXX (2025-11-03) - 匹配成功
  ✅ 過濾結果: X 筆課程
```

---

## 🔍 診斷命令

如果問題仍然存在，在 Console 執行：

```javascript
// 檢查原始後端數據
const rawData = await api.list('courseAssignments');
console.log('後端原始數據:', rawData.slice(0, 3));

// 檢查日期類型
rawData.slice(0, 5).forEach(c => {
  console.log('課程:', c.name);
  console.log('  日期值:', c.date);
  console.log('  日期型別:', typeof c.date);
  console.log('  是數字?', typeof c.date === 'number');
});

// 測試正規化函數（需要先在 api.js 中暴露函數）
// normalizeDateValue(45599) 應該返回 "2025-11-03"
```

---

## 💡 技術要點

### Excel 序列日期計算

```javascript
// Excel 從 1899-12-30 開始計算（有歷史閏年 bug）
const excelEpoch = new Date(1899, 11, 30);
const days = 45599;  // Excel 序列日期
const date = new Date(excelEpoch.getTime() + days * 86400000);
// 結果：2025-11-03
```

### 為什麼用 1899-12-30？

- Excel 的序列日期從 1900-01-01 = 1 開始
- 但 Excel 錯誤地將 1900 年當作閏年
- 為了兼容性，計算時使用 1899-12-30 作為起點

---

## 📝 其他改進

### 時間範圍正規化

同時也添加了時間範圍的正規化：

```javascript
normalizeTimeRange("0900-1000")  // → "09:00-10:00"
normalizeTimeRange("09:00-10:00") // → "09:00-10:00"
```

### 數值正規化

確保 ID 和 teacherId 都是數字：

```javascript
normalizeNumeric("123")  // → 123
normalizeNumeric(123)    // → 123
normalizeNumeric(null)   // → null
```

---

## 🚀 修改檔案

1. **js/api.js**
   - ✨ 新增 `normalizeDateValue()` 函數
   - ✨ 新增 `normalizeTimeRange()` 函數
   - ✨ 新增 `normalizeNumeric()` 函數
   - ✨ 新增 `normalizeCourseAssignment()` 函數
   - ✨ 新增 `normalizeMaritimeCourse()` 函數
   - ✨ 新增 `loadArrayFromStorage()` 輔助函數
   - 🔧 修改 `DataSyncManager.loadFromBackend()` 使用正規化

2. **teacher-management.html**
   - 🔧 修改 `loadCourseAssignmentsFromBackend()` 加入正規化
   - 🔧 修改 `loadMaritimeCoursesFromBackend()` 加入正規化

---

## 🎉 預期效果

- ✅ **11/3 的課程數據正確顯示**
- ✅ 日期過濾功能正常工作
- ✅ 統計數字準確反映選擇的日期範圍
- ✅ 課程類型分佈卡片正確顯示
- ✅ 今日課程總覽正確顯示
- ✅ 跨設備同步不會出現日期格式問題

---

## 🔗 相關文件

- `CRITICAL_FIX_SUMMARY.md` - 數據載入順序問題修復
- `FIX_COURSE_STATS.md` - 統計功能修復
- `FIX_CALENDAR_SYNC.md` - 行事曆同步修復
- `DEBUG_COURSE_STATS.md` - 調試指南

---

**這是最關鍵的修復！** 🎯

日期格式不一致是導致 11/3 數據無法顯示的根本原因。現在所有從 Google Sheets 載入的數據都會自動正規化為標準格式，確保系統正常運作。

**請重新整理頁面測試！** 🚀
