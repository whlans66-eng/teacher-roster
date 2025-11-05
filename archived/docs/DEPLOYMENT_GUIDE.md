# 教師管理系統後端部署指南

## 📋 目錄
1. [建立 Google Sheets 試算表](#1-建立-google-sheets-試算表)
2. [建立 Google Drive 資料夾](#2-建立-google-drive-資料夾)
3. [部署 Google Apps Script](#3-部署-google-apps-script)
4. [設定前端 API](#4-設定前端-api)
5. [測試整合](#5-測試整合)
6. [常見問題](#6-常見問題)

---

## 1. 建立 Google Sheets 試算表

### 步驟 1.1：建立新試算表
1. 前往 [Google Sheets](https://sheets.google.com)
2. 點選「空白試算表」建立新的試算表
3. 將試算表命名為「教師管理系統資料庫」（或任何你喜歡的名稱）

### 步驟 1.2：取得試算表 ID
1. 查看瀏覽器網址列的 URL
2. URL 格式：`https://docs.google.com/spreadsheets/d/【這裡是試算表ID】/edit`
3. 複製試算表 ID（例如：`1CPhI67yZt1W6FLV9Q02gjyJsdTP79pgUAc27ZZw3nJ4`）
4. **保存這個 ID**，稍後會用到

### 步驟 1.3：準備工作表（可選）
系統會自動建立以下三個工作表，你也可以手動預先建立：
- `teachers` - 教師資料
- `courseAssignments` - 派課資料
- `maritimeCourses` - 海事課程

> **注意**：如果你選擇手動建立，請確保工作表名稱完全一致（區分大小寫）

---

## 2. 建立 Google Drive 資料夾

### 步驟 2.1：建立資料夾
1. 前往 [Google Drive](https://drive.google.com)
2. 點選「新增」→「新資料夾」
3. 命名為「教師管理系統檔案」（或任何你喜歡的名稱）

### 步驟 2.2：取得資料夾 ID
1. 開啟剛建立的資料夾
2. 查看網址列的 URL
3. URL 格式：`https://drive.google.com/drive/folders/【這裡是資料夾ID】`
4. 複製資料夾 ID（例如：`1coJ2wsBu7I4qvM5eyViIu16POgEQL71n`）
5. **保存這個 ID**，稍後會用到

### 步驟 2.3：設定資料夾權限（可選）
- 如果需要其他人也能查看上傳的檔案，可以設定分享權限
- 點選資料夾右鍵 → 「共用」→ 設定權限

---

## 3. 部署 Google Apps Script

### 步驟 3.1：開啟 Apps Script 編輯器
1. 回到你的 Google Sheets 試算表
2. 點選頂部選單「擴充功能」→「Apps Script」
3. 會開啟一個新的 Apps Script 編輯器視窗

### 步驟 3.2：貼上後端程式碼
1. 刪除編輯器中預設的程式碼
2. 開啟專案中的 `backend-api.gs` 檔案
3. **完整複製** `backend-api.gs` 的所有內容
4. 貼到 Apps Script 編輯器中

### 步驟 3.3：修改設定
在程式碼的最上方找到「設定區」，修改以下三個參數：

```javascript
/***** 設定區 *****/
const TOKEN      = 'tr_demo_12345';  // 改成你自己的密碼（建議使用隨機字串）
const SHEET_ID   = '你的試算表ID';     // 步驟 1.2 取得的試算表 ID
const FOLDER_ID  = '你的資料夾ID';     // 步驟 2.2 取得的資料夾 ID
```

**建議的 TOKEN 範例**（請自行生成）：
- `mySecretToken_abc123xyz789`
- `TeacherSystem2025!@#`
- 或使用線上密碼生成器

### 步驟 3.4：儲存專案
1. 點選上方的「磁碟」圖示或按 `Ctrl + S` (Mac: `Cmd + S`)
2. 為專案命名（例如：「教師管理系統API」）

### 步驟 3.5：部署為網路應用程式
1. 點選右上角的「部署」按鈕
2. 選擇「新增部署作業」
3. 在「選取類型」點選「網路應用程式」
4. 設定以下選項：
   - **說明**：教師管理系統 API v1
   - **執行身分**：我
   - **具有存取權的使用者**：所有人
5. 點選「部署」
6. 首次部署需要授權，點選「授權存取權」
7. 選擇你的 Google 帳號
8. 如果出現「這個應用程式未經驗證」，點選「進階」→「前往『專案名稱』(不安全)」
9. 點選「允許」授權

### 步驟 3.6：複製 Web App URL
1. 部署完成後，會顯示「網路應用程式 URL」
2. **複製這個 URL**（格式類似：`https://script.google.com/macros/s/XXXXX.../exec`）
3. **保存這個 URL**，稍後會用到

> **重要提示**：每次修改 Apps Script 程式碼後，需要建立「新部署作業」或「管理部署作業」→「編輯」→「版本：新版本」才會生效

---

## 4. 設定前端 API

### 步驟 4.1：修改 API 設定檔
1. 開啟專案中的 `js/api.js` 檔案
2. 找到最上方的 `API_CONFIG` 設定區
3. 修改兩個參數：

```javascript
const API_CONFIG = {
  baseUrl: '你的 Web App URL',        // 步驟 3.6 複製的 URL
  token: 'tr_demo_12345',            // 與後端設定的 TOKEN 一致
  timeout: 30000
};
```

### 步驟 4.2：整合到 HTML 頁面
在你的 HTML 頁面中，加入以下 script 標籤（在其他 JS 檔案之前）：

```html
<!-- API 層：必須最先載入 -->
<script src="js/api.js"></script>

<!-- 其他 JS 檔案 -->
<script src="js/data.js"></script>
<script src="js/utils.js"></script>
<script src="js/ui.js"></script>
<script src="js/app.js"></script>
```

### 步驟 4.3：初始化資料同步
在頁面載入完成後，加入初始化程式碼：

```javascript
// 頁面載入時從後端同步資料
document.addEventListener('DOMContentLoaded', async function() {
  // 初始化資料同步
  await initializeDataSync();

  // 你原本的初始化程式碼...
  loadData();
  updateAllViews();
});

// 當資料變更時，儲存到後端
function saveData() {
  // 先儲存到 localStorage（原本的邏輯）
  localStorage.setItem('teachers', JSON.stringify(teachers));
  localStorage.setItem('courseAssignments', JSON.stringify(courseAssignments));
  localStorage.setItem('maritimeCourses', JSON.stringify(maritimeCourses));

  // 非同步儲存到後端（不阻塞 UI）
  syncManager.saveToBackend().catch(err => {
    console.error('後端同步失敗:', err);
  });
}
```

---

## 5. 測試整合

### 步驟 5.1：測試後端連線
1. 開啟瀏覽器的開發者工具（按 `F12`）
2. 切換到「主控台（Console）」分頁
3. 在網頁中執行以下程式碼：

```javascript
// 測試連線
api.ping().then(result => {
  console.log('✅ 連線成功:', result);
}).catch(error => {
  console.error('❌ 連線失敗:', error);
});
```

### 步驟 5.2：測試讀取資料
```javascript
// 讀取所有資料
api.listAll().then(data => {
  console.log('📊 所有資料:', data);
});

// 讀取教師資料
api.list('teachers').then(teachers => {
  console.log('👨‍🏫 教師資料:', teachers);
});
```

### 步驟 5.3：測試儲存資料
```javascript
// 測試儲存（先在 console 執行，確認成功後再整合）
const testTeacher = {
  id: Date.now(),
  name: '測試教師',
  email: 'test@example.com',
  teacherType: '內部',
  workLocation: '岸上',
  photoUrl: '',
  experiences: [],
  certificates: [],
  subjects: ['測試科目'],
  tags: ['測試']
};

api.save('teachers', [testTeacher]).then(result => {
  console.log('✅ 儲存成功:', result);
});
```

### 步驟 5.4：檢查 Google Sheets
1. 回到你的 Google Sheets 試算表
2. 應該會看到自動建立的工作表（teachers、courseAssignments、maritimeCourses）
3. 確認測試資料是否正確寫入

---

## 6. 常見問題

### Q1: 部署後修改程式碼沒有生效？
**A:** Google Apps Script 需要重新部署才會生效：
1. 開啟 Apps Script 編輯器
2. 點選「部署」→「管理部署作業」
3. 點選目前部署旁的「✏️ 編輯」
4. 在「版本」下拉選單選擇「新版本」
5. 點選「部署」

### Q2: 出現「Invalid token」錯誤？
**A:** 前端和後端的 TOKEN 不一致：
- 檢查 `backend-api.gs` 中的 `TOKEN`
- 檢查 `js/api.js` 中的 `API_CONFIG.token`
- 確保兩者完全相同（區分大小寫）

### Q3: 出現 CORS 錯誤？
**A:** Google Apps Script 部署時必須選擇「具有存取權的使用者：所有人」

### Q4: 資料沒有寫入 Google Sheets？
**A:** 檢查以下幾點：
1. SHEET_ID 是否正確
2. Apps Script 是否有授權存取試算表
3. 工作表名稱是否正確（teachers、courseAssignments、maritimeCourses）
4. 查看 Apps Script 的執行記錄檔（檢視 → 執行記錄）

### Q5: 上傳檔案失敗？
**A:** 檢查以下幾點：
1. FOLDER_ID 是否正確
2. Apps Script 是否有授權存取 Google Drive
3. 檔案大小是否超過限制（建議 < 10MB）

### Q6: 如何啟用自動同步？
**A:** 在頁面初始化時加入：

```javascript
// 啟用自動同步（每 5 分鐘）
syncManager.enableAutoSync(5);

// 停用自動同步
syncManager.disableAutoSync();
```

### Q7: 如何查看同步狀態？
**A:** 使用以下程式碼：

```javascript
// 取得最後同步時間
const lastSync = syncManager.getLastSyncTime();
console.log('最後同步時間:', lastSync);
```

### Q8: 可以只同步特定表格嗎？
**A:** 可以：

```javascript
// 只儲存教師資料到後端
syncManager.saveTable('teachers');

// 只儲存派課資料
syncManager.saveTable('courseAssignments');

// 只儲存海事課程
syncManager.saveTable('maritimeCourses');
```

---

## 🎉 完成！

完成以上步驟後，你的系統就具備以下功能：

✅ **雲端資料儲存** - 所有資料自動同步到 Google Sheets
✅ **檔案上傳** - 教師照片、證書等檔案上傳到 Google Drive
✅ **多裝置同步** - 不同裝置可以共用同一份資料
✅ **離線備援** - 無法連線時自動使用 localStorage
✅ **自動備份** - Google Sheets 自動保存歷史版本

---

## 📚 進階功能

### 自訂同步策略
你可以根據需求調整同步策略：

```javascript
// 策略 1：每次變更立即同步（即時性高，但請求頻繁）
function saveData() {
  localStorage.setItem('teachers', JSON.stringify(teachers));
  syncManager.saveToBackend();  // 立即同步
}

// 策略 2：定時自動同步（平衡效能與即時性）
syncManager.enableAutoSync(3);  // 每 3 分鐘自動同步

// 策略 3：手動同步（完全控制）
// 提供一個「同步到雲端」按鈕，由使用者決定何時同步
```

### 監控同步狀態
在 UI 上顯示同步狀態：

```javascript
async function syncNow() {
  showSyncStatus('正在同步...', 'info');
  try {
    await syncManager.saveToBackend();
    showSyncStatus('同步成功！', 'success');
  } catch (error) {
    showSyncStatus('同步失敗：' + error.message, 'error');
  }
}
```

---

## 🔒 安全性建議

1. **TOKEN 安全**
   - 不要在公開的程式碼庫中暴露 TOKEN
   - 定期更換 TOKEN
   - 使用複雜的隨機字串

2. **資料驗證**
   - 後端已包含基本的資料驗證
   - 前端應該也要驗證使用者輸入

3. **存取權限**
   - Google Sheets 和 Drive 資料夾建議設定適當的共用權限
   - 不要將敏感資料儲存在公開的試算表中

---

## 📞 需要協助？

如果遇到問題，請：
1. 檢查瀏覽器主控台的錯誤訊息
2. 檢查 Google Apps Script 的執行記錄（Apps Script 編輯器 → 檢視 → 執行記錄）
3. 確認所有設定參數都正確填寫
4. 參考上方的常見問題解答
