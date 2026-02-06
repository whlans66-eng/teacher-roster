# Web 安全評估報告 - WHL MARITRAIN 教師排課管理系統

**評估日期：** 2026-02-06
**評估範圍：** 前端 (HTML/JS)、後端 (Google Apps Script)、認證機制、資料傳輸

---

## 總結：目前系統存在多項重大安全風險

| 嚴重等級 | 數量 | 說明 |
|---------|------|------|
| **嚴重 (Critical)** | 5 | 需立即修復，可能導致資料外洩或系統被入侵 |
| **高 (High)** | 4 | 應盡快修復，存在明顯攻擊面 |
| **中 (Medium)** | 4 | 建議改善，降低攻擊風險 |
| **低 (Low)** | 2 | 可列入技術債，逐步改進 |

---

## 嚴重 (Critical) 漏洞

### C1. API Token 寫死在前端原始碼中
- **檔案：** `js/api.js:10`
- **問題：** API 驗證 Token `tr_demo_12345` 直接寫在客戶端 JavaScript 中，任何人開啟瀏覽器開發者工具即可取得。
- **影響：** 等同於所有 API 端點完全無保護，攻擊者可以直接呼叫後端 API 讀取、修改、刪除所有資料。
- **建議修復：** 實作 server-side session 機制，登入後由後端核發不可預測的 session token，並在每次 API 請求驗證此 token 對應的使用者與權限。

### C2. 登入密碼透過 GET 參數傳輸
- **檔案：** `login.html:406`
- **問題：** 登入請求使用 GET 方法，帳號密碼附在 URL query string 中：
  ```
  ?action=login&username=XXX&password=XXX
  ```
- **影響：** 密碼會出現在瀏覽器歷史紀錄、伺服器日誌、代理伺服器日誌、以及網路監控設備中。
- **建議修復：** 改用 POST 方法，將帳號密碼放在 request body 中傳送。

### C3. 密碼以明文儲存
- **檔案：** `backend-api.gs:75`
- **問題：** 密碼在 Google Sheets 中以明文儲存，且比對時直接用 `u.password === password`。
- **影響：** 任何可以存取 Google Sheets 的人（協作者、管理員）都能看到所有使用者的密碼原文。若資料外洩，所有帳號密碼將完全暴露。
- **建議修復：** 使用不可逆的雜湊演算法（如 SHA-256 搭配 salt）儲存密碼，登入時比對雜湊值。

### C4. 寫死的預設帳號密碼 / 緊急後門
- **檔案：** `backend-api.gs:78, 481-483`
- **問題：**
  - 存在硬編碼的緊急後門：`admin` / `admin123`
  - 預設帳號密碼：`admin/admin123`、`teacher/teacher123`、`guest/guest123`
- **影響：** 這些帳號密碼是公開可見的（在 GitHub 上），任何人都可以直接登入系統。
- **建議修復：** 移除緊急後門、強制使用者在首次登入後更改密碼、使用強密碼策略。

### C5. 登入端點無暴力破解防護
- **檔案：** `backend-api.gs:65-90`
- **問題：** 登入 API 沒有任何頻率限制、帳號鎖定機制或驗證碼。
- **影響：** 攻擊者可以無限次嘗試帳號密碼組合進行暴力破解。
- **建議修復：** 實作登入失敗計數器，連續失敗數次後暫時鎖定帳號或加入 CAPTCHA 驗證。

---

## 高 (High) 漏洞

### H1. 權限控管僅在前端執行
- **檔案：** `js/auth.js` (全檔)
- **問題：** 角色權限控管（admin/teacher/guest）僅在前端 JavaScript 中檢查。後端只驗證靜態 Token，不驗證請求者的身份與角色。
- **影響：** 任何人只要有 Token（已在前端原始碼中暴露），就能執行所有操作，包含 admin 專屬的功能。前端的角色檢查可以被完全繞過。
- **建議修復：** 後端必須在每次請求中驗證使用者身份，並根據角色限制可執行的操作。

### H2. 儲存型 XSS（跨站腳本攻擊）
- **檔案：** `teacher-management.html:1719`、`course-management.html:1803` 等多處
- **問題：** 大量使用 `innerHTML` 直接將資料庫內容（教師名稱、ID、照片 URL 等）插入 DOM，未經過任何消毒（sanitization）處理。
  ```javascript
  // 範例：未經消毒的資料直接插入 HTML
  select.innerHTML += `<option value="${t.id}">${t.name}</option>`;
  photoBox.innerHTML = `<img src="${teacher.photo}" ...>`;
  ```
- **影響：** 如果攻擊者在教師名稱欄位填入 `<img onerror=alert(document.cookie) src=x>`，該腳本會在所有存取此頁面的使用者瀏覽器中執行，可竊取 session 資料。
- **建議修復：** 使用 `textContent` 設定文字內容，或實作 HTML escape 函數處理所有使用者輸入的資料後再插入 DOM。

### H3. 無限制的檔案上傳
- **檔案：** `backend-api.gs:251-284`
- **問題：**
  - 未驗證上傳檔案類型（允許任意檔案，包含 .html、.js、.exe 等）
  - 未限制檔案大小
  - 未消毒檔案名稱
  - 上傳後自動設為 **公開連結可存取** (`ANYONE_WITH_LINK`)
- **影響：** 可被利用來上傳惡意檔案並通過系統的 Google Drive 分享連結散播。
- **建議修復：** 限制允許的檔案類型（白名單機制）、設定檔案大小上限、消毒檔案名稱。

### H4. Session Token 可預測
- **檔案：** `backend-api.gs:86`
- **問題：** 登入成功後產生的 token 為 `'token_' + new Date().getTime()`，僅是時間戳記，完全可預測。且此 token 在後續 API 請求中並未被驗證（只驗證靜態 API Token）。
- **影響：** Session token 機制形同虛設。
- **建議修復：** 使用加密安全的隨機數產生 session token，並在後端維護 session 狀態進行驗證。

---

## 中 (Medium) 漏洞

### M1. 缺乏 CSRF 防護
- **問題：** 所有表單與 API 呼叫都沒有 CSRF token。
- **影響：** 惡意網站可以在使用者不知情的情況下，偽造使用者的身份發送請求（例如修改或刪除資料）。
- **建議修復：** 實作 CSRF token 機制，或使用 SameSite Cookie 屬性。

### M2. 缺乏安全性 HTTP 標頭
- **問題：** 前端頁面未設定以下安全標頭：
  - `Content-Security-Policy` (CSP)
  - `X-Frame-Options` (防止 Clickjacking)
  - `X-Content-Type-Options`
  - `Strict-Transport-Security` (HSTS)
- **影響：** 網站容易受到 Clickjacking、MIME 類型混淆等攻擊。
- **建議修復：** 透過 meta tag 或伺服器端設定加入上述標頭（GitHub Pages 有部分預設保護，但建議明確設定）。

### M3. 敏感資料存在 localStorage
- **檔案：** `login.html:419-425`
- **問題：** 認證資料（包含 token、角色、使用者名稱）存在 localStorage 中。
- **影響：** localStorage 的資料不會過期，且容易被 XSS 攻擊讀取。搭配 H2 的 XSS 漏洞，攻擊者可以輕易竊取使用者的身份。
- **建議修復：** 使用 HttpOnly + Secure + SameSite Cookie 儲存 session 資料（需要後端支援），或至少僅使用 sessionStorage。

### M4. 錯誤訊息洩漏內部資訊
- **檔案：** `backend-api.gs:166`
- **問題：** 錯誤時直接回傳 `String(err)`，可能暴露內部實作細節。
- **影響：** 攻擊者可藉由錯誤訊息推測系統架構與實作細節。
- **建議修復：** 對外回傳通用錯誤訊息，詳細錯誤記錄在後端日誌中。

---

## 低 (Low) 漏洞

### L1. 整表覆寫無保護機制
- **檔案：** `backend-api.gs:188-216`
- **問題：** `save` action 會直接覆寫整個表格的所有資料，僅檢查不為空陣列，無其他確認機制。
- **影響：** 意外操作或惡意呼叫可能導致大量資料遺失。
- **建議修復：** 加入覆寫前的備份機制、操作確認步驟，或限制只有管理員可執行批次覆寫。

### L2. Google Sheets 公式注入風險
- **檔案：** `backend-api.gs` (_writeTable, _updateRow)
- **問題：** 寫入 Google Sheets 的欄位值未過濾以 `=`、`+`、`-`、`@` 開頭的內容。
- **影響：** 攻擊者可在輸入欄位中填入 Google Sheets 公式（如 `=IMPORTRANGE(...)`），在管理員開啟 Sheets 時觸發。
- **建議修復：** 在寫入 Sheets 前，若欄位值以特殊字元開頭，加上單引號前綴或過濾。

---

## 修復優先順序建議

| 優先順序 | 項目 | 理由 |
|---------|------|------|
| 1 | C1 + C4 | Token 暴露 + 預設密碼 = 系統門戶大開 |
| 2 | C2 + C3 | 密碼傳輸與儲存方式不安全 |
| 3 | H1 | 後端缺乏權限控管，前端保護可被繞過 |
| 4 | H2 | XSS 可竊取使用者身份 |
| 5 | C5 + H4 | 暴力破解防護 + Session 安全 |
| 6 | H3 | 檔案上傳安全 |
| 7 | M1-M4 | 安全性強化 |
| 8 | L1-L2 | 資料保護 |
