# 🚀 快速開始指南

## ✅ 已完成的整合

恭喜！你的教師管理系統已經成功整合後端功能。以下是已經完成的工作：

### 📝 新增的檔案

1. **`backend-api.gs`** - Google Apps Script 後端 API
   - 支援三個資料表：teachers、courseAssignments、maritimeCourses
   - 提供完整的 CRUD 操作
   - 支援檔案上傳到 Google Drive

2. **`js/api.js`** - 前端 API 呼叫層
   - 封裝所有後端 API 呼叫
   - 提供自動同步管理
   - 支援離線模式

3. **`DEPLOYMENT_GUIDE.md`** - 詳細部署教學
   - 步驟說明
   - 常見問題解答
   - 進階功能

### 🔧 已修改的檔案

1. **`course-management.html`** - 派課管理系統
   - ✅ 已加入 API 層引用
   - ✅ 啟用自動同步
   - ✅ 頁面載入時從後端讀取資料
   - ✅ 資料變更時自動儲存到後端

2. **`maritime-courses.html`** - 海事課程系統
   - ✅ 已加入 API 層引用
   - ✅ 啟用自動同步
   - ✅ 頁面載入時從後端讀取資料
   - ✅ 資料變更時自動儲存到後端

---

## 🎯 下一步操作

### 第一步：部署 Google Apps Script

1. 開啟 `backend-api.gs` 檔案
2. 複製全部內容
3. 按照 `DEPLOYMENT_GUIDE.md` 的步驟 3 部署到 Google Apps Script
4. 取得 Web App URL

**預估時間：10-15 分鐘**

### 第二步：設定前端 API

1. 開啟 `js/api.js` 檔案
2. 修改 `API_CONFIG` 的兩個參數：
   ```javascript
   const API_CONFIG = {
     baseUrl: '你的 Web App URL',  // 貼上步驟一取得的 URL
     token: 'tr_demo_12345',       // 與後端 TOKEN 一致
     timeout: 30000
   };
   ```
3. 儲存檔案

**預估時間：2 分鐘**

### 第三步：測試整合

1. 開啟瀏覽器，前往派課管理或海事課程頁面
2. 按 `F12` 開啟開發者工具
3. 查看主控台（Console），應該會看到：
   ```
   ✅ 後端連線成功
   📥 從後端載入資料...
   ✅ 資料載入完成
   ```
4. 新增一筆測試資料，確認是否成功同步

**預估時間：5 分鐘**

---

## 📊 功能總覽

### 已整合的資料表

| 資料表 | 說明 | 使用頁面 |
|--------|------|----------|
| **teachers** | 教師基本資料 | teacher-management.html |
| **courseAssignments** | 派課記錄 | course-management.html |
| **maritimeCourses** | 海事課程 | maritime-courses.html |

### 資料同步流程

```
┌─────────────┐         ┌──────────────┐         ┌─────────────────┐
│   前端頁面   │ ◄────► │ localStorage │ ◄────► │ Google Sheets   │
│             │         │  (本地快取)   │         │  (雲端資料庫)    │
└─────────────┘         └──────────────┘         └─────────────────┘
     ▲                                                      ▲
     │                                                      │
     └──────────────── 檔案上傳 ──────────────────────────►│
                                                    Google Drive
```

### 同步策略

- **頁面載入時**：自動從後端拉取最新資料
- **資料變更時**：立即儲存到 localStorage，非同步同步到後端
- **離線模式**：如果無法連線到後端，自動使用本地資料
- **錯誤處理**：同步失敗時不影響使用者操作，並顯示警告訊息

---

## 🔍 驗證檢查清單

完成部署後，請確認以下項目：

### 後端檢查

- [ ] Google Sheets 已建立並取得 SHEET_ID
- [ ] Google Drive 資料夾已建立並取得 FOLDER_ID
- [ ] Google Apps Script 已部署並取得 Web App URL
- [ ] 後端 TOKEN 已設定
- [ ] 授權已完成（允許存取 Sheets 和 Drive）

### 前端檢查

- [ ] `js/api.js` 的 baseUrl 已更新
- [ ] `js/api.js` 的 token 與後端一致
- [ ] `course-management.html` 已引用 `js/api.js`
- [ ] `maritime-courses.html` 已引用 `js/api.js`

### 功能檢查

- [ ] 開啟派課管理頁面，主控台顯示連線成功
- [ ] 新增一筆派課資料，確認 Google Sheets 有更新
- [ ] 開啟海事課程頁面，主控台顯示連線成功
- [ ] 新增一筆海事課程，確認 Google Sheets 有更新
- [ ] 在不同裝置或瀏覽器開啟，確認資料同步

---

## ⚙️ 設定檔快速參考

### 後端設定（backend-api.gs）

```javascript
const TOKEN      = 'tr_demo_12345';  // 你的安全密碼
const SHEET_ID   = '你的試算表ID';
const FOLDER_ID  = '你的資料夾ID';
```

### 前端設定（js/api.js）

```javascript
const API_CONFIG = {
  baseUrl: 'https://script.google.com/macros/s/你的部署ID/exec',
  token: 'tr_demo_12345',  // 必須與後端 TOKEN 一致
  timeout: 30000
};
```

---

## 🐛 常見問題快速解決

### Q: 主控台顯示「Invalid token」？
**解決**：檢查前端 `js/api.js` 的 token 是否與後端 `backend-api.gs` 的 TOKEN 完全相同

### Q: 主控台顯示「後端同步失敗」？
**解決**：
1. 檢查 baseUrl 是否正確
2. 檢查 Google Apps Script 是否部署成功
3. 檢查網路連線

### Q: 資料沒有寫入 Google Sheets？
**解決**：
1. 檢查 SHEET_ID 是否正確
2. 檢查是否授權 Apps Script 存取試算表
3. 開啟 Apps Script 編輯器 → 檢視 → 執行記錄，查看錯誤訊息

### Q: 如何查看後端錯誤？
**解決**：
1. 開啟 Google Apps Script 編輯器
2. 點選左側「執行」圖示
3. 查看執行記錄檔

---

## 📱 行動裝置支援

此系統完全支援行動裝置：

- ✅ 響應式設計
- ✅ 觸控操作
- ✅ 離線模式
- ✅ 自動同步

在手機或平板上開啟頁面，資料會自動從雲端同步！

---

## 🔒 安全性提醒

1. **TOKEN 設定**
   - 不要使用預設的 `tr_demo_12345`
   - 建議使用複雜的隨機字串
   - 不要將 TOKEN 公開在程式碼庫中

2. **試算表權限**
   - 建議不要公開分享試算表
   - 只分享給需要存取的人員

3. **備份建議**
   - Google Sheets 會自動保存版本歷史
   - 建議定期匯出資料備份

---

## 📚 進階功能

### 啟用自動同步

在頁面初始化時加入以下程式碼（可選）：

```javascript
// 在 init() 函數的最後加入
syncManager.enableAutoSync(5);  // 每 5 分鐘自動同步
```

### 手動同步按鈕

在頁面上加入一個同步按鈕：

```html
<button onclick="manualSync()">🔄 同步到雲端</button>

<script>
async function manualSync() {
  try {
    showMessage('正在同步...', 'info');
    await syncManager.saveToBackend();
    showMessage('✅ 同步成功！', 'success');
  } catch (error) {
    showMessage('❌ 同步失敗：' + error.message, 'error');
  }
}
</script>
```

### 顯示最後同步時間

```javascript
const lastSync = syncManager.getLastSyncTime();
if (lastSync) {
  console.log('最後同步時間:', lastSync.toLocaleString('zh-TW'));
}
```

---

## 🎉 完成！

恭喜你完成後端整合！現在你的系統具備：

✅ 雲端資料儲存
✅ 多裝置同步
✅ 離線備援
✅ 自動備份
✅ 檔案上傳

**下一步**：按照「下一步操作」章節完成部署，開始使用！

---

## 📞 需要協助？

1. 查看 `DEPLOYMENT_GUIDE.md` 的詳細教學
2. 檢查瀏覽器主控台的錯誤訊息
3. 查看 Google Apps Script 的執行記錄
4. 參考本文件的「常見問題快速解決」

---

**最後更新：** 2025-11-02
**版本：** 1.0.0
