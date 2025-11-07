# 教師排課管理系統 - 系統流程圖

## 📋 目錄
1. [整體系統架構](#整體系統架構)
2. [認證流程](#認證流程)
3. [教師管理流程](#教師管理流程)
4. [派課管理流程](#派課管理流程)
5. [問卷管理流程](#問卷管理流程)
6. [權限檢查流程](#權限檢查流程)
7. [數據流架構](#數據流架構)

---

## 整體系統架構

```mermaid
graph TB
    subgraph 用戶端
        A[Web 瀏覽器] --> B[HTML/JS 前端]
    end

    subgraph 後端服務
        B --> C[API Gateway<br/>Port: 3001]
        C --> D[認證中間件<br/>JWT驗證]
        D --> E[權限中間件<br/>RBAC檢查]
        E --> F[業務路由層]

        F --> G[教師管理 API]
        F --> H[課程管理 API]
        F --> I[派課管理 API]
        F --> J[問卷管理 API]
        F --> K[用戶管理 API]
    end

    subgraph 數據層
        G --> L[(MySQL 8.0<br/>Port: 3306)]
        H --> L
        I --> L
        J --> L
        K --> L
    end

    subgraph 安全層
        M[Rate Limiter<br/>限流保護] --> C
        N[Helmet<br/>安全頭] --> C
        O[CORS<br/>跨域控制] --> C
        P[Audit Logger<br/>操作日誌] --> L
    end

    D --> P
    E --> P

    style A fill:#e1f5ff
    style L fill:#ffe1e1
    style C fill:#fff4e1
```

---

## 認證流程

### 用戶註冊與登錄

```mermaid
sequenceDiagram
    participant U as 用戶
    participant F as 前端
    participant API as 後端 API
    participant DB as 數據庫
    participant JWT as JWT 服務

    rect rgb(200, 220, 240)
    note right of U: 用戶註冊流程
    U->>F: 1. 輸入註冊資料
    F->>API: 2. POST /api/auth/register
    API->>API: 3. 驗證輸入格式
    API->>DB: 4. 檢查用戶是否存在
    DB-->>API: 5. 查詢結果
    alt 用戶已存在
        API-->>F: 6a. 錯誤：用戶已存在
        F-->>U: 7a. 顯示錯誤訊息
    else 用戶不存在
        API->>API: 6b. bcrypt 加密密碼
        API->>DB: 7b. 創建新用戶<br/>(預設角色: viewer)
        API->>DB: 8b. 記錄操作日誌
        API-->>F: 9b. 成功：返回用戶資料
        F-->>U: 10b. 註冊成功提示
    end
    end

    rect rgb(220, 240, 200)
    note right of U: 用戶登錄流程
    U->>F: 11. 輸入帳號密碼
    F->>API: 12. POST /api/auth/login
    API->>DB: 13. 查詢用戶
    DB-->>API: 14. 返回用戶資料
    alt 用戶不存在或密碼錯誤
        API-->>F: 15a. 錯誤：認證失敗
        F-->>U: 16a. 顯示錯誤訊息
    else 認證成功
        API->>JWT: 15b. 生成 JWT Token<br/>(7天有效期)
        JWT-->>API: 16b. 返回 Token
        API->>DB: 17b. 查詢用戶權限
        DB-->>API: 18b. 返回角色與權限
        API->>DB: 19b. 記錄登錄日誌
        API-->>F: 20b. 返回 Token + 用戶資料
        F->>F: 21b. 儲存 Token 到 localStorage
        F-->>U: 22b. 跳轉到主頁
    end
    end
```

### API 請求認證

```mermaid
flowchart TD
    A[用戶發送 API 請求] --> B{請求頭包含<br/>Authorization?}

    B -->|否| C[返回 401<br/>未授權]
    B -->|是| D[提取 JWT Token]

    D --> E{Token 格式<br/>正確?}
    E -->|否| C
    E -->|是| F[驗證 Token 簽名]

    F --> G{簽名有效?}
    G -->|否| C
    G -->|是| H{Token 未<br/>過期?}

    H -->|否| I[返回 401<br/>Token 已過期]
    H -->|是| J[從 Token 解析<br/>用戶 ID]

    J --> K[查詢數據庫<br/>獲取用戶資料]

    K --> L{用戶存在且<br/>啟用?}
    L -->|否| M[返回 403<br/>用戶不存在或已停用]
    L -->|是| N[查詢用戶角色<br/>和權限]

    N --> O[將用戶資料<br/>附加到請求]

    O --> P[執行權限檢查]

    P --> Q{有權限?}
    Q -->|否| R[返回 403<br/>權限不足]
    Q -->|是| S[繼續處理業務邏輯]

    S --> T[記錄操作日誌]
    T --> U[返回結果]

    style C fill:#ffcccc
    style I fill:#ffcccc
    style M fill:#ffcccc
    style R fill:#ffcccc
    style U fill:#ccffcc
```

---

## 教師管理流程

### 新增/編輯教師

```mermaid
flowchart TD
    A[開始：管理員操作] --> B{操作類型}

    B -->|新增| C1[點擊「新增教師」]
    B -->|編輯| C2[點擊「編輯」按鈕]

    C1 --> D[顯示教師表單]
    C2 --> D1[載入現有資料]
    D1 --> D

    D --> E[填寫基本資料]
    E --> E1[姓名、Email、類型]
    E1 --> E2[工作地點]

    E2 --> F[添加經歷/證照]
    F --> F1{需要添加?}
    F1 -->|是| F2[動態新增項目]
    F2 --> F1
    F1 -->|否| G

    G[選擇授課科目] --> H[添加標籤]

    H --> I{上傳照片?}
    I -->|是| J[選擇檔案]
    J --> K[預覽照片]
    K --> L
    I -->|否| L[點擊儲存]

    L --> M[前端驗證]
    M --> N{格式正確?}
    N -->|否| O[顯示錯誤提示]
    O --> E

    N -->|是| P{操作類型}
    P -->|新增| Q1[POST /api/teachers]
    P -->|編輯| Q2[PUT /api/teachers/:id<br/>包含 version]

    Q1 --> R[後端驗證權限]
    Q2 --> R

    R --> S{有權限?}
    S -->|否| T[返回 403]
    T --> U[顯示錯誤訊息]

    S -->|是| V[驗證資料完整性]
    V --> W{資料有效?}
    W -->|否| X[返回驗證錯誤]
    X --> U

    W -->|是| Y{編輯操作?}
    Y -->|是| Z[檢查樂觀鎖<br/>version]
    Z --> AA{版本匹配?}
    AA -->|否| AB[返回 409<br/>數據已被修改]
    AB --> U

    AA -->|是| AC[更新數據庫]
    Y -->|否| AC

    AC --> AD[記錄操作日誌]
    AD --> AE[返回成功結果]
    AE --> AF[重新載入教師列表]
    AF --> AG[顯示成功訊息]
    AG --> AH[結束]

    style T fill:#ffcccc
    style X fill:#ffcccc
    style AB fill:#ffcccc
    style AH fill:#ccffcc
```

### 教師列表查詢

```mermaid
flowchart LR
    A[用戶進入教師管理頁] --> B[發送 GET /api/teachers]

    B --> C{包含搜尋條件?}
    C -->|是| D[應用篩選器]
    C -->|否| E[查詢所有教師]

    D --> D1[姓名關鍵字]
    D --> D2[教師類型]
    D --> D3[工作地點]
    D --> D4[授課科目]

    D1 --> F
    D2 --> F
    D3 --> F
    D4 --> F
    E --> F[查詢數據庫]

    F --> G[應用分頁]
    G --> H[計算總筆數]
    H --> I[返回結果]

    I --> J[渲染教師卡片]
    J --> K[顯示分頁導航]
    K --> L[綁定操作按鈕]

    L --> M{用戶操作}
    M -->|查看| N[顯示詳細資料]
    M -->|編輯| O[開啟編輯表單]
    M -->|刪除| P[確認刪除]
    M -->|搜尋| Q[更新篩選條件]

    Q --> B

    style I fill:#e1f5ff
    style J fill:#e1ffe1
```

---

## 派課管理流程

### 派課流程（含衝突檢查）

```mermaid
flowchart TD
    A[開始：派課操作] --> B[選擇教師]

    B --> C[選擇課程]
    C --> D[選擇日期]
    D --> E[選擇時間範圍]
    E --> E1[開始時間]
    E1 --> E2[結束時間]

    E2 --> F[選擇課程類型]
    F --> F1[正課/補課/實習/<br/>實作/專案]

    F1 --> G[前端即時衝突檢查]

    G --> H[查詢該教師<br/>當日所有派課]

    H --> I{檢測時間重疊?}

    I -->|是| J[標記衝突]
    J --> K[顯示衝突提示<br/>紅色警告]
    K --> L{用戶選擇}
    L -->|調整時間| E
    L -->|強制儲存| M[用戶確認覆蓋]

    I -->|否| N[顯示可用提示<br/>綠色確認]

    M --> O{確認強制儲存?}
    O -->|否| E
    O -->|是| P

    N --> P[點擊儲存]

    P --> Q[POST /api/assignments]
    Q --> R[後端驗證權限]

    R --> S{有權限?}
    S -->|否| T[返回 403]
    T --> U[顯示錯誤訊息]

    S -->|是| V[後端衝突檢查]
    V --> W{檢測衝突?}

    W -->|是| X{強制儲存標記?}
    X -->|否| Y[返回 409<br/>時間衝突]
    Y --> U
    X -->|是| Z[記錄警告日誌]
    Z --> AA

    W -->|否| AA[寫入數據庫]
    AA --> AB[更新教師月時數]
    AB --> AC[記錄操作日誌]
    AC --> AD[返回成功]

    AD --> AE[重新渲染行事曆]
    AE --> AF[更新統計數據]
    AF --> AG[顯示成功訊息]
    AG --> AH[結束]

    style T fill:#ffcccc
    style Y fill:#ffcccc
    style K fill:#fff4cc
    style N fill:#ccffcc
    style AH fill:#ccffcc
```

### 行事曆檢視

```mermaid
sequenceDiagram
    participant U as 用戶
    participant C as 行事曆組件
    participant API as 後端 API
    participant DB as 數據庫

    U->>C: 1. 進入行事曆頁面
    C->>C: 2. 初始化月曆視圖

    C->>API: 3. GET /api/assignments<br/>?start_date=2025-11-01<br/>&end_date=2025-11-30
    API->>DB: 4. 查詢派課資料
    DB-->>API: 5. 返回派課列表
    API-->>C: 6. 返回 JSON 資料

    C->>C: 7. 解析派課資料
    C->>C: 8. 按日期分組
    C->>C: 9. 渲染日曆格子

    loop 每個日期
        C->>C: 10. 繪製派課方塊
        C->>C: 11. 根據時間排序
        C->>C: 12. 偵測時間衝突
        alt 有衝突
            C->>C: 13a. 標記紅色邊框
        else 無衝突
            C->>C: 13b. 正常顯示
        end
    end

    C-->>U: 14. 顯示完整月曆

    rect rgb(240, 240, 200)
    note right of U: 用戶互動
    U->>C: 15. 點擊派課方塊
    C->>C: 16. 顯示派課詳情彈窗
    C-->>U: 17. 顯示教師、課程、時間

    U->>C: 18. 點擊編輯按鈕
    C->>C: 19. 開啟編輯表單
    C->>C: 20. 預填現有資料
    C-->>U: 21. 顯示編輯介面
    end

    rect rgb(200, 240, 220)
    note right of U: 月份切換
    U->>C: 22. 點擊上/下月按鈕
    C->>C: 23. 更新日期範圍
    C->>API: 24. 重新請求派課資料
    API->>DB: 25. 查詢新月份資料
    DB-->>API: 26. 返回資料
    API-->>C: 27. 返回 JSON
    C->>C: 28. 重新渲染月曆
    C-->>U: 29. 顯示新月份
    end
```

---

## 問卷管理流程

### 問卷創建與發布

```mermaid
flowchart TD
    A[開始：創建問卷] --> B[進入問卷管理頁]

    B --> C[點擊「新增問卷」]
    C --> D[選擇問卷類型]

    D --> E{使用模板?}
    E -->|是| F[選擇問卷模板]
    F --> G[載入模板內容]
    G --> H
    E -->|否| H[空白問卷]

    H --> I[設定問卷基本資料]
    I --> I1[問卷標題]
    I1 --> I2[問卷說明]
    I2 --> I3[開始/結束日期]

    I3 --> J[添加問題]
    J --> K{問題類型}

    K -->|單選| L1[設定選項]
    K -->|多選| L2[設定選項 + 最多選幾項]
    K -->|文字| L3[短文/長文]
    K -->|評分| L4[分數範圍]
    K -->|日期| L5[日期格式]

    L1 --> M{繼續添加?}
    L2 --> M
    L3 --> M
    L4 --> M
    L5 --> M

    M -->|是| J
    M -->|否| N[預覽問卷]

    N --> O{確認無誤?}
    O -->|否| P[返回編輯]
    P --> I

    O -->|是| Q[儲存問卷]
    Q --> R[POST /api/surveys]

    R --> S[驗證權限]
    S --> T{有權限?}
    T -->|否| U[返回 403]

    T -->|是| V[寫入數據庫]
    V --> W[生成問卷 ID]
    W --> X[生成分享連結]
    X --> Y[記錄操作日誌]

    Y --> Z[返回問卷資料]
    Z --> AA[顯示成功訊息]
    AA --> AB[顯示分享連結]

    AB --> AC{發布問卷?}
    AC -->|否| AD[儲存為草稿]
    AC -->|是| AE[更新狀態為「進行中」]

    AE --> AF[複製分享連結]
    AF --> AG[發送通知<br/>Email/LINE]

    AG --> AH[結束]
    AD --> AH

    style U fill:#ffcccc
    style AH fill:#ccffcc
```

### 問卷填寫流程

```mermaid
sequenceDiagram
    participant S as 學員
    participant F as 問卷表單
    participant API as 後端 API
    participant DB as 數據庫

    S->>F: 1. 開啟問卷連結
    F->>API: 2. GET /api/surveys/:id
    API->>DB: 3. 查詢問卷資料
    DB-->>API: 4. 返回問卷內容

    API->>API: 5. 檢查問卷狀態
    alt 問卷已結束
        API-->>F: 6a. 返回 410<br/>問卷已關閉
        F-->>S: 7a. 顯示「問卷已結束」
    else 問卷可填寫
        API-->>F: 6b. 返回問卷內容
        F->>F: 7b. 渲染問卷題目
        F-->>S: 8b. 顯示問卷
    end

    rect rgb(230, 240, 250)
    note right of S: 填寫過程
    loop 每個問題
        S->>F: 9. 填寫/選擇答案
        F->>F: 10. 即時驗證
        alt 必填未填
            F->>F: 11a. 標記錯誤
            F-->>S: 12a. 提示必填
        else 格式錯誤
            F->>F: 11b. 標記錯誤
            F-->>S: 12b. 提示格式要求
        else 驗證通過
            F->>F: 11c. 更新狀態
        end
    end
    end

    S->>F: 13. 點擊「送出」
    F->>F: 14. 最終驗證

    alt 有錯誤
        F-->>S: 15a. 捲動到錯誤處
        F-->>S: 16a. 提示修正
    else 驗證通過
        F->>API: 15b. POST /api/surveys/:id/responses
        API->>DB: 16b. 儲存回應
        DB-->>API: 17b. 返回成功
        API->>DB: 18b. 更新回應計數
        API->>DB: 19b. 記錄提交日誌
        API-->>F: 20b. 返回成功
        F-->>S: 21b. 顯示「感謝您的填寫」
    end
```

---

## 權限檢查流程

### RBAC 權限驗證

```mermaid
flowchart TD
    A[API 請求到達] --> B[認證中間件]
    B --> C{Token 有效?}
    C -->|否| D[返回 401<br/>未授權]

    C -->|是| E[提取用戶資料]
    E --> F[權限中間件]

    F --> G[檢查路由權限需求]
    G --> H{需要特定權限?}

    H -->|否| I[允許訪問<br/>公開 API]

    H -->|是| J[從 Token 獲取用戶角色]
    J --> K[查詢角色權限映射]

    K --> L{用戶是 admin?}
    L -->|是| M[允許所有操作<br/>admin 擁有全部權限]

    L -->|否| N[檢查具體權限]
    N --> O{操作類型}

    O -->|查看| P{需要 view 權限?}
    O -->|創建| Q{需要 create 權限?}
    O -->|更新| R{需要 update 權限?}
    O -->|刪除| S{需要 delete 權限?}

    P --> T[檢查是否擁有<br/>resource.view]
    Q --> U[檢查是否擁有<br/>resource.create]
    R --> V[檢查是否擁有<br/>resource.update]
    S --> W[檢查是否擁有<br/>resource.delete]

    T --> X{有權限?}
    U --> X
    V --> X
    W --> X

    X -->|否| Y{是否擁有<br/>_own 權限?}

    Y -->|是| Z{資源屬於<br/>當前用戶?}
    Z -->|是| M
    Z -->|否| AA[返回 403<br/>權限不足]

    Y -->|否| AA
    X -->|是| M

    M --> AB[繼續執行業務邏輯]
    I --> AB

    AB --> AC[記錄操作日誌]
    AC --> AD[返回結果]

    style D fill:#ffcccc
    style AA fill:#ffcccc
    style M fill:#ccffcc
    style I fill:#ccffcc
    style AD fill:#e1f5ff
```

### 角色權限矩陣

```mermaid
graph LR
    subgraph 角色 Roles
        R1[admin<br/>系統管理員]
        R2[manager<br/>課程管理員]
        R3[teacher<br/>教師]
        R4[viewer<br/>訪客]
    end

    subgraph 教師權限
        P1[teacher.view_all]
        P2[teacher.create]
        P3[teacher.update]
        P4[teacher.update_own]
        P5[teacher.delete]
    end

    subgraph 課程權限
        P6[course.view_all]
        P7[course.create]
        P8[course.update]
        P9[course.delete]
    end

    subgraph 派課權限
        P10[assignment.view_all]
        P11[assignment.view_own]
        P12[assignment.create]
        P13[assignment.update]
        P14[assignment.delete]
    end

    subgraph 問卷權限
        P15[survey.view_all]
        P16[survey.create]
        P17[survey.update]
        P18[survey.respond]
    end

    subgraph 系統權限
        P19[system.settings]
        P20[system.logs]
        P21[user.manage]
    end

    R1 -.->|全部權限| P1
    R1 -.-> P2
    R1 -.-> P3
    R1 -.-> P5
    R1 -.-> P6
    R1 -.-> P7
    R1 -.-> P8
    R1 -.-> P9
    R1 -.-> P10
    R1 -.-> P12
    R1 -.-> P13
    R1 -.-> P14
    R1 -.-> P15
    R1 -.-> P16
    R1 -.-> P17
    R1 -.-> P19
    R1 -.-> P20
    R1 -.-> P21

    R2 -->|業務權限| P1
    R2 --> P2
    R2 --> P3
    R2 --> P6
    R2 --> P7
    R2 --> P8
    R2 --> P10
    R2 --> P12
    R2 --> P13
    R2 --> P15
    R2 --> P16
    R2 --> P17

    R3 -->|自己的資料| P4
    R3 --> P11
    R3 --> P18

    R4 -->|只讀| P18

    style R1 fill:#ff9999
    style R2 fill:#ffcc99
    style R3 fill:#99ccff
    style R4 fill:#cccccc
```

---

## 數據流架構

### 請求生命週期

```mermaid
flowchart TB
    A[HTTP 請求到達] --> B[Rate Limiter<br/>檢查請求頻率]

    B --> C{超過限制?}
    C -->|是| D[返回 429<br/>Too Many Requests]

    C -->|否| E[Helmet<br/>設定安全頭]
    E --> F[CORS 檢查]
    F --> G{允許的來源?}
    G -->|否| H[返回 CORS 錯誤]

    G -->|是| I[路由匹配]
    I --> J{需要認證?}

    J -->|否| K[公開路由<br/>直接處理]

    J -->|是| L[認證中間件]
    L --> M[驗證 JWT Token]
    M --> N{Token 有效?}
    N -->|否| O[返回 401]

    N -->|是| P[載入用戶資料]
    P --> Q[權限中間件]
    Q --> R[檢查操作權限]
    R --> S{有權限?}
    S -->|否| T[返回 403]

    S -->|是| U[業務邏輯處理]
    K --> U

    U --> V{操作類型}
    V -->|讀取| W[SELECT 查詢]
    V -->|創建| X[INSERT 操作]
    V -->|更新| Y[UPDATE 操作<br/>檢查樂觀鎖]
    V -->|刪除| Z[DELETE 操作]

    W --> AA[數據庫執行]
    X --> AA
    Y --> AA
    Z --> AA

    AA --> AB{成功?}
    AB -->|否| AC[資料庫錯誤]
    AC --> AD[錯誤處理中間件]

    AB -->|是| AE[記錄操作日誌]
    AE --> AF{需要記錄?}
    AF -->|是| AG[INSERT audit_logs]
    AG --> AH
    AF -->|否| AH[格式化回應]

    AH --> AI[返回 JSON 結果]

    AD --> AJ[記錄錯誤日誌]
    AJ --> AK[返回錯誤回應]

    style D fill:#ffcccc
    style H fill:#ffcccc
    style O fill:#ffcccc
    style T fill:#ffcccc
    style AC fill:#ffcccc
    style AK fill:#ffcccc
    style AI fill:#ccffcc
```

### 數據庫 ER 關係圖（簡化版）

```mermaid
erDiagram
    users ||--o{ user_roles : has
    users {
        int id PK
        string username UK
        string email UK
        string password_hash
        boolean is_active
        timestamp created_at
    }

    roles ||--o{ user_roles : assigned_to
    roles ||--o{ role_permissions : has
    roles {
        int id PK
        string name UK
        string display_name
    }

    permissions ||--o{ role_permissions : granted_by
    permissions {
        int id PK
        string name UK
        string resource
        string action
    }

    user_roles {
        int user_id FK
        int role_id FK
    }

    role_permissions {
        int role_id FK
        int permission_id FK
    }

    teachers {
        int id PK
        string name
        string email UK
        enum teacher_type
        string work_location
        json experiences
        json certificates
        json subjects
        json tags
        int version
    }

    courses {
        int id PK
        string name
        enum category
        enum method
        text description
    }

    course_assignments {
        int id PK
        int teacher_id FK
        int course_id FK
        date course_date
        time start_time
        time end_time
        enum type
        enum status
    }

    teachers ||--o{ course_assignments : teaches
    courses ||--o{ course_assignments : scheduled_in

    survey_templates {
        int id PK
        string title
        json structure
    }

    surveys {
        int id PK
        int template_id FK
        string title
        enum status
        datetime start_date
        datetime end_date
    }

    survey_responses {
        int id PK
        int survey_id FK
        json answers
        timestamp submitted_at
    }

    survey_templates ||--o{ surveys : based_on
    surveys ||--o{ survey_responses : receives

    audit_logs {
        int id PK
        int user_id FK
        string action
        string resource
        json details
        string ip_address
        timestamp created_at
    }

    users ||--o{ audit_logs : performs
```

---

## 📊 關鍵性能指標

### API 回應時間目標
- **認證 API**: < 200ms
- **查詢 API**: < 300ms
- **寫入 API**: < 500ms
- **複雜查詢**: < 1000ms

### 安全限制
- **登錄限流**: 5 次/分鐘/IP
- **API 限流**: 100 次/分鐘/Token
- **Token 有效期**: 7 天
- **密碼強度**: 最少 8 字元，包含大小寫和數字

### 數據庫性能
- **連接池**: 10 連接
- **查詢超時**: 30 秒
- **樂觀鎖**: version 字段防止並發衝突

---

## 🔗 相關文檔

- [完整系統文檔](./README.md)
- [快速開始指南](./QUICK_START.md)
- [Azure 部署指南](./AZURE_SETUP.md)
- [API 參考文檔](./API_REFERENCE.md)
- [檢查清單](./CHECKLIST.md)

---

**文檔版本**: 1.0
**最後更新**: 2025-11-07
**系統版本**: teacher-roster v2.0
