# 🚀 師資派課管理系統 - 完整整合指南

## 方案一：使用擴展模組（推薦）

### 步驟 1：在您的 HTML 底部（`</body>` 之前）添加：

```html
<!-- 功能擴展模組 -->
<script src="integrated-features.js"></script>
```

### 步驟 2：確保您的HTML中已包含以下元素：

```html
<!-- 在側邊欄導航選單中 -->
<button onclick="switchView('dashboard')" id="nav-dashboard" class="nav-btn active ...">
    <span>📊</span><span>儀表板</span>
</button>
<button onclick="switchView('calendar')" id="nav-calendar" class="nav-btn ...">
    <span>📅</span><span>行事曆</span>
</button>

<!-- 在側邊欄中添加本週課表區域 -->
<div class="glass-effect rounded-2xl p-4 mb-4">
    <h4 class="font-semibold text-gray-800 mb-3 text-sm">📅 本週課表</h4>
    <div id="weekSchedulePreview" class="space-y-2 max-h-60 overflow-y-auto">
        <!-- 本週課表將由JavaScript動態生成 -->
    </div>
</div>

<!-- 在主內容區添加行事曆視圖 -->
<div id="calendarView" class="page-view">
    <div class="glass-effect rounded-2xl p-6 card-hover mb-8">
        <div class="flex items-center justify-between mb-6">
            <h3 class="text-2xl font-bold text-gray-800">📅 行事曆</h3>
            <div class="flex space-x-3">
                <button onclick="changeMonth(-1)" class="...">← 上月</button>
                <button onclick="goToToday()" class="...">今天</button>
                <button onclick="changeMonth(1)" class="...">下月 →</button>
            </div>
        </div>
        <div class="text-center mb-6">
            <h2 id="currentCalendarMonth" class="text-2xl font-bold text-gray-800">2024年 1月</h2>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-lg">
            <div class="grid grid-cols-7 gap-2 mb-2">
                <div class="text-center font-semibold text-red-600 py-2">日</div>
                <div class="text-center font-semibold text-gray-700 py-2">一</div>
                <!-- ... 其他星期標題 -->
            </div>
            <div id="calendarGrid" class="grid grid-cols-7 gap-2">
                <!-- 將由 JavaScript 動態生成 -->
            </div>
        </div>
    </div>
</div>
```

### 步驟 3：在CSS中添加必要樣式：

```css
/* 行事曆樣式 */
.calendar-day {
    min-height: 120px;
    transition: all 0.3s ease;
    cursor: pointer;
}

.calendar-day:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}

.calendar-event {
    font-size: 0.7rem;
    padding: 2px 4px;
    margin-bottom: 2px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
}

.calendar-event:hover {
    transform: scale(1.05);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* 導航按鈕 */
.nav-btn {
    padding: 0.75rem 1.5rem;
    border-radius: 0.75rem;
    font-weight: 500;
    transition: all 0.3s ease;
    cursor: pointer;
}

.nav-btn:hover {
    transform: translateX(5px);
}

.nav-btn.active {
    background: rgba(255, 255, 255, 0.2);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* 頁面視圖 */
.page-view {
    display: none;
}

.page-view.active {
    display: block;
}
```

## 方案二：使用預先整合的完整文件

如果您想要一個開箱即用的完整版本，請使用：

```bash
cp final-complete.html index.html
```

這個文件已經整合了所有功能，包括：
- ✅ 美觀的漸變玻璃擬態設計
- ✅ 師資管理（含大頭貼上傳）
- ✅ 完整的統計分析
- ✅ 行事曆視圖與管理
- ✅ 智能衝堂檢查
- ✅ 派課與行事曆自動同步
- ✅ 本週課表預覽
- ✅ 本地數據儲存

## 🎯 新功能說明

### 1. 智能衝堂檢查

當您新增課程時，系統會自動檢查：
- 該老師在同一時段是否已有其他課程
- 檢查範圍包含「派課管理」和「行事曆」
- 如有衝突，會顯示警告對話框
- 您可以選擇「繼續派課」或「取消」

### 2. 派課與行事曆自動同步

- 新增課程時，自動在行事曆上創建對應事件
- 刪除課程時，自動刪除行事曆上的對應事件
- 行事曆事件會顯示課程名稱、老師姓名和時間
- 使用課程類型對應的顏色標記

### 3. 本週課表預覽

在側邊欄顯示當前老師本週的課程安排：
- 按日期排列
- 顯示每天的課程時間和名稱
- 即時更新
- 沒有課程時顯示「本週無排課」

### 4. 行事曆視圖

完整的月曆視圖：
- 顯示所有派課和行事曆事件
- 可切換上/下月
- 快速跳轉到今天
- 不同課程類型使用不同顏色
- 懸停顯示完整資訊

## 📱 使用方式

### 切換視圖

在側邊欄點擊：
- 「📊 儀表板」- 查看統計和課程時間軸
- 「📅 行事曆」- 查看月曆和所有事件

### 新增課程

1. 選擇師資
2. 點擊「➕ 新增課程」
3. 填寫課程資訊
4. 系統自動檢查衝堂
5. 確認後自動同步到行事曆

### 查看本週課表

在側邊欄「📅 本週課表」區域自動顯示當前選中老師的本週排課

## 🐛 故障排除

### 如果功能無法正常運作：

1. 確認 `integrated-features.js` 已正確載入
2. 打開瀏覽器控制台（F12）查看錯誤訊息
3. 確認所有必要的HTML元素ID都存在
4. 清除瀏覽器緩存後重新載入

### 常見問題：

**Q: 新增課程後行事曆沒有同步？**
A: 確認 `saveCalendarEvents()` 函數有被調用，檢查瀏覽器 localStorage

**Q: 衝堂檢查沒有觸發？**
A: 確認 `checkTeacherConflict()` 函數已載入，檢查課程時間格式是否正確（HH:MM）

**Q: 本週課表顯示空白？**
A: 確認 `currentTeacher` 變數有正確設定，且該老師有本週的課程

## 📞 技術支援

如有問題，請檢查：
1. 瀏覽器控制台的錯誤訊息
2. localStorage 中的數據
3. 所有函數是否正確載入

---

**祝您使用愉快！** 🎉
