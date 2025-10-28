# 🎯 快速開始指南

## 您現在擁有什麼？

我已經為您準備好了以下文件：

1. **integrated-features.js** - 包含所有新功能的JavaScript模組
2. **HOW-TO-INTEGRATE.md** - 詳細整合指南
3. **README-INTEGRATION.md** - 整合說明

## 🚀 最快的整合方式（3步驟）

### 步驟 1：在您的 HTML 中添加行事曆視圖

在主內容區（`<div class="content-area flex-1 p-6">`）的末尾，儀表板視圖之後，添加：

```html
<!-- 行事曆視圖 -->
<div id="calendarView" class="page-view">
    <div class="glass-effect rounded-2xl p-6 card-hover mb-8">
        <div class="flex items-center justify-between mb-6">
            <h3 class="text-2xl font-bold text-gray-800">📅 行事曆</h3>
            <div class="flex space-x-3">
                <button onclick="changeMonth(-1)" class="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-all shadow">
                    ← 上月
                </button>
                <button onclick="goToToday()" class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all shadow">
                    今天
                </button>
                <button onclick="changeMonth(1)" class="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-all shadow">
                    下月 →
                </button>
            </div>
        </div>
        
        <div class="text-center mb-6">
            <h2 id="currentCalendarMonth" class="text-2xl font-bold text-gray-800">2024年 1月</h2>
        </div>
        
        <div class="bg-white rounded-xl p-4 shadow-lg">
            <div class="grid grid-cols-7 gap-2 mb-2">
                <div class="text-center font-semibold text-red-600 py-2">日</div>
                <div class="text-center font-semibold text-gray-700 py-2">一</div>
                <div class="text-center font-semibold text-gray-700 py-2">二</div>
                <div class="text-center font-semibold text-gray-700 py-2">三</div>
                <div class="text-center font-semibold text-gray-700 py-2">四</div>
                <div class="text-center font-semibold text-gray-700 py-2">五</div>
                <div class="text-center font-semibold text-blue-600 py-2">六</div>
            </div>
            <div id="calendarGrid" class="grid grid-cols-7 gap-2"></div>
        </div>
    </div>
</div>
```

### 步驟 2：在側邊欄添加導航按鈕和本週課表

在側邊欄的師資選擇之前，添加：

```html
<!-- 導航選單 -->
<div class="mb-6 space-y-2">
    <button onclick="switchView('dashboard')" id="nav-dashboard" class="nav-btn active w-full text-left text-white flex items-center space-x-2">
        <span>📊</span>
        <span>儀表板</span>
    </button>
    <button onclick="switchView('calendar')" id="nav-calendar" class="nav-btn w-full text-left text-white flex items-center space-x-2">
        <span>📅</span>
        <span>行事曆</span>
    </button>
</div>
```

在側邊欄的「今日課程」之前，添加：

```html
<!-- 本週課表預覽 -->
<div class="glass-effect rounded-2xl p-4 mb-4">
    <h4 class="font-semibold text-gray-800 mb-3 text-sm">📅 本週課表</h4>
    <div id="weekSchedulePreview" class="space-y-2 max-h-60 overflow-y-auto">
        <!-- 本週課表將由JavaScript動態生成 -->
    </div>
</div>
```

### 步驟 3：在 `</body>` 之前添加腳本引用

```html
    <!-- 功能擴展模組 -->
    <script src="integrated-features.js"></script>
</body>
</html>
```

## 完成！

現在打開您的HTML文件，您將擁有：

- ✅ 美觀的界面（您原本的設計）
- ✅ 行事曆視圖（可切換查看）
- ✅ 智能衝堂檢查（新增課程時自動觸發）
- ✅ 派課行事曆同步（自動雙向同步）
- ✅ 本週課表預覽（側邊欄實時顯示）

## 測試功能

1. **測試衝堂檢查**：
   - 選擇一個老師
   - 新增一門課程
   - 再嘗試在相同時間新增另一門課
   - 應該會看到衝堂警告

2. **測試行事曆同步**：
   - 新增一門課程
   - 切換到行事曆視圖
   - 應該可以看到剛才新增的課程

3. **測試本週課表**：
   - 選擇有本週課程的老師
   - 側邊欄應該顯示本週的課程安排

## 🐛 如果遇到問題

打開瀏覽器控制台（F12），查看是否有錯誤訊息。

常見問題：
- 如果行事曆不顯示：檢查 `calendarGrid` 元素是否存在
- 如果衝堂檢查沒觸發：檢查 `integrated-features.js` 是否正確載入
- 如果本週課表是空的：檢查當前老師是否有本週的課程

## 💡 提示

所有新功能的代碼都在 `integrated-features.js` 中，您可以：
- 修改顏色方案
- 調整衝堂檢查邏輯
- 自定義提示訊息
- 擴展更多功能

祝您使用愉快！ 🎉
