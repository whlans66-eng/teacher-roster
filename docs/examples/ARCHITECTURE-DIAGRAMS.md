# RBAC 架構圖與流程圖

本文檔使用 Mermaid 圖表展示 RBAC 系統的架構和流程。

> **提示**：這些圖表在支援 Mermaid 的 Markdown 編輯器中可以渲染（如 GitHub、VS Code with Mermaid extension）

---

## 1. 系統整體架構

```mermaid
graph TB
    subgraph "前端 Frontend"
        A[用戶瀏覽器] --> B[登入頁面]
        B --> C[認證狀態管理<br/>auth-helpers.js]
        C --> D[頁面訪問控制<br/>checkPageAccess]
        D --> E[UI 權限控制<br/>hasRole / canEdit]
    end

    subgraph "後端 Backend"
        F[Google Apps Script] --> G[Token 驗證<br/>verifyToken]
        G --> H[角色檢查<br/>requireRole]
        H --> I[權限檢查<br/>requirePermission]
        I --> J[資料過濾<br/>根據角色]
    end

    subgraph "資料層 Data"
        K[(Google Sheets)]
        K --> L[users 表]
        K --> M[sessions 表]
        K --> N[teachers 表]
        K --> O[其他業務表]
    end

    B -->|登入請求| F
    E -->|API 請求<br/>+ Token| F
    F -->|查詢用戶| L
    F -->|驗證 Session| M
    J -->|查詢資料| N
    J -->|返回過濾後資料| E

    style A fill:#e1f5ff
    style F fill:#fff4e1
    style K fill:#f0f0f0
```

---

## 2. 用戶登入流程

```mermaid
sequenceDiagram
    participant U as 用戶
    participant L as 登入頁面
    participant A as auth-helpers.js
    participant API as Backend API
    participant DB as Google Sheets

    U->>L: 輸入帳號密碼
    L->>API: POST /login<br/>{username, password}
    API->>DB: 查詢 users 表
    DB-->>API: 返回用戶資料

    alt 密碼正確
        API->>API: 產生 Token
        API->>DB: 儲存 Session
        API-->>L: {ok: true, user, token}
        L->>A: setAuthState(user, token)
        A->>A: 儲存到 localStorage
        L->>U: 導向首頁（根據角色）
    else 密碼錯誤
        API-->>L: {ok: false, error}
        L->>U: 顯示錯誤訊息
    end
```

---

## 3. API 請求權限驗證流程

```mermaid
flowchart TD
    Start([API 請求]) --> GetToken{攜帶 Token?}

    GetToken -->|否| SetVisitor[設定為訪客角色]
    GetToken -->|是| VerifyToken[驗證 Token]

    VerifyToken --> ValidToken{Token 有效?}
    ValidToken -->|否| Error1[返回錯誤:<br/>無效的 Token]
    ValidToken -->|是| CheckExpiry{是否過期?}

    CheckExpiry -->|是| Error2[返回錯誤:<br/>Token 已過期]
    CheckExpiry -->|否| GetUser[從 DB 取得用戶資料]

    GetUser --> CheckActive{用戶啟用?}
    CheckActive -->|否| Error3[返回錯誤:<br/>用戶已停用]
    CheckActive -->|是| SetAuthInfo[設定 authInfo<br/>{userId, role, permissions}]

    SetVisitor --> CheckPermission
    SetAuthInfo --> CheckPermission{檢查權限}

    CheckPermission -->|Admin| AllowAll[允許所有操作]
    CheckPermission -->|其他角色| CheckRole{符合要求?}

    CheckRole -->|是| FilterData[根據角色過濾資料]
    CheckRole -->|否| Error4[返回錯誤:<br/>權限不足]

    FilterData --> Success[返回資料]
    AllowAll --> Success

    Error1 --> End([結束])
    Error2 --> End
    Error3 --> End
    Error4 --> End
    Success --> End

    style Start fill:#e1f5ff
    style Success fill:#c8e6c9
    style Error1 fill:#ffcdd2
    style Error2 fill:#ffcdd2
    style Error3 fill:#ffcdd2
    style Error4 fill:#ffcdd2
```

---

## 4. 角色權限層級結構

```mermaid
graph LR
    subgraph "角色層級 Role Levels"
        V[訪客<br/>Visitor<br/>Level 0]
        S[學員<br/>Student<br/>Level 1]
        T[教師<br/>Teacher<br/>Level 2]
        A[管理者<br/>Admin<br/>Level 3]
    end

    V -.升級.-> S
    S -.升級.-> T
    T -.升級.-> A

    subgraph "訪客權限"
        V1[查看教師基本資訊]
        V2[查看課程基本資訊]
        V3[填寫問卷<br/>透過分享連結]
    end

    subgraph "學員權限"
        S1[查看教師詳細資料]
        S2[查看課程詳細資訊]
        S3[查看課表]
        S4[填寫問卷]
    end

    subgraph "教師權限"
        T1[編輯自己的資料]
        T2[查看自己的派課]
        T3[查看自己的問卷結果]
        T4[匯出自己的資料]
    end

    subgraph "管理者權限"
        A1[教師 CRUD]
        A2[課程 CRUD]
        A3[派課 CRUD]
        A4[問卷 CRUD]
        A5[用戶管理]
        A6[系統設定]
    end

    V --> V1 & V2 & V3
    S --> S1 & S2 & S3 & S4
    T --> T1 & T2 & T3 & T4
    A --> A1 & A2 & A3 & A4 & A5 & A6

    style V fill:#f5f5f5
    style S fill:#e3f2fd
    style T fill:#e1bee7
    style A fill:#ffccbc
```

---

## 5. 前端頁面訪問控制流程

```mermaid
flowchart TD
    Start([頁面載入]) --> Restore[restoreAuthState<br/>恢復認證狀態]

    Restore --> GetPath[取得當前路徑]
    GetPath --> CheckReq{需要權限?}

    CheckReq -->|公開頁面| AllowAccess[允許訪問]
    CheckReq -->|需要權限| GetRole[取得當前角色]

    GetRole --> CompareLevel{角色等級<br/>足夠?}

    CompareLevel -->|是| AllowAccess
    CompareLevel -->|否| ShowAlert[顯示提示:<br/>請先登入]

    ShowAlert --> Redirect[導向登入頁<br/>with redirect 參數]

    AllowAccess --> InitPage[初始化頁面]
    InitPage --> RenderUI[根據角色<br/>渲染 UI]

    RenderUI --> End([頁面就緒])
    Redirect --> End

    style Start fill:#e1f5ff
    style AllowAccess fill:#c8e6c9
    style Redirect fill:#ffccbc
```

---

## 6. 教師資料查詢與過濾

```mermaid
flowchart LR
    subgraph "完整資料 Full Data"
        Full["教師資料<br/>────<br/>id, name<br/>email, phone<br/>teacherType<br/>workLocation<br/>photoUrl<br/>experiences<br/>certificates<br/>subjects<br/>tags (全部)<br/>created_by<br/>updated_by"]
    end

    Full -->|訪客| Filter1
    Full -->|學員| Filter2
    Full -->|教師| Filter3
    Full -->|管理者| NoFilter

    subgraph "訪客看到 Visitor"
        Filter1["基本資料<br/>────<br/>✅ id, name<br/>✅ photoUrl<br/>✅ tags (前3個)<br/>❌ 其他欄位"]
    end

    subgraph "學員看到 Student"
        Filter2["詳細資料<br/>────<br/>✅ 基本資料<br/>✅ email<br/>✅ teacherType<br/>✅ workLocation<br/>✅ experiences<br/>✅ certificates<br/>✅ subjects<br/>✅ tags (全部)<br/>❌ 建立/更新者"]
    end

    subgraph "教師看到 Teacher"
        Filter3["完整資料<br/>────<br/>✅ 所有欄位<br/>(但只能看自己的)"]
    end

    subgraph "管理者看到 Admin"
        NoFilter["完整資料<br/>────<br/>✅ 所有欄位<br/>✅ 所有教師"]
    end

    style Filter1 fill:#ffebee
    style Filter2 fill:#e1f5fe
    style Filter3 fill:#f3e5f5
    style NoFilter fill:#e8f5e9
```

---

## 7. 前端 UI 權限控制邏輯

```mermaid
flowchart TD
    Start([渲染教師卡片]) --> GetRole[取得當前角色]

    GetRole --> RenderBase[渲染基本資訊<br/>姓名、照片]

    RenderBase --> CheckVisitor{是訪客?}
    CheckVisitor -->|是| LimitTags[只顯示 3 個標籤]
    CheckVisitor -->|否| ShowType[顯示教師類型]

    LimitTags --> CheckViewDetail
    ShowType --> ShowAllTags[顯示所有標籤]

    ShowAllTags --> CheckViewDetail{可查看詳情?}

    CheckViewDetail -->|是<br/>hasRole student+| AddViewBtn[加入<br/>[查看詳情] 按鈕]
    CheckViewDetail -->|否| CheckEdit

    AddViewBtn --> CheckEdit{可編輯?}

    CheckEdit -->|是<br/>canEdit| AddEditBtn[加入<br/>[編輯] 按鈕]
    CheckEdit -->|否| CheckDelete

    AddEditBtn --> CheckDelete{可刪除?}

    CheckDelete -->|是<br/>hasRole admin| AddDeleteBtn[加入<br/>[刪除] 按鈕]
    CheckDelete -->|否| Done

    AddDeleteBtn --> Done([渲染完成])

    style Start fill:#e1f5ff
    style Done fill:#c8e6c9
```

---

## 8. 資料表關聯圖

```mermaid
erDiagram
    USERS ||--o{ SESSIONS : "has"
    USERS ||--o| TEACHERS : "is"
    USERS ||--o{ COURSE_ASSIGNMENTS : "created_by"
    USERS ||--o{ SURVEYS : "created_by"

    TEACHERS ||--o{ COURSE_ASSIGNMENTS : "assigned_to"
    TEACHERS ||--o{ SURVEYS : "evaluated_by"

    COURSES ||--o{ COURSE_ASSIGNMENTS : "assigned_in"

    SURVEY_TEMPLATES ||--o{ SURVEYS : "based_on"
    SURVEYS ||--o{ SURVEY_RESPONSES : "has"

    USERS {
        string id PK
        string username UK
        string email UK
        string password_hash
        string full_name
        string role "visitor/student/teacher/admin"
        boolean is_active
        datetime created_at
    }

    SESSIONS {
        string session_id PK
        string user_id FK
        string token UK
        datetime expires_at
        datetime created_at
    }

    TEACHERS {
        string id PK
        string user_id FK "nullable"
        string name
        string email
        string teacher_type "full_time/part_time/adjunct"
        string work_location
        json experiences
        json certificates
        json tags
    }

    COURSE_ASSIGNMENTS {
        string id PK
        string teacher_id FK
        string course_id FK
        date course_date
        string status
        string created_by FK
    }

    SURVEYS {
        string id PK
        string template_id FK
        string teacher_id FK
        string status
        string created_by FK
    }
```

---

## 9. 完整登入到訪問資料流程

```mermaid
sequenceDiagram
    autonumber

    actor User as 👤 用戶
    participant Login as 登入頁
    participant Helper as auth-helpers.js
    participant Page as 教師列表頁
    participant API as Backend API
    participant DB as 資料庫

    %% 登入階段
    rect rgb(230, 240, 255)
        Note over User,DB: 登入階段
        User->>Login: 輸入帳號密碼
        Login->>API: POST /login
        API->>DB: 驗證用戶
        DB-->>API: 用戶資料 + 角色
        API->>DB: 建立 Session
        API-->>Login: Token + 用戶資訊
        Login->>Helper: setAuthState(user, token)
        Helper->>Helper: 儲存到 localStorage
    end

    %% 頁面訪問階段
    rect rgb(230, 255, 230)
        Note over User,DB: 訪問頁面階段
        User->>Page: 訪問教師列表
        Page->>Helper: checkPageAccess()
        Helper->>Helper: 恢復認證狀態

        alt 權限足夠
            Helper-->>Page: ✅ 允許訪問
            Page->>API: GET /list?table=teachers<br/>+ Token

            API->>DB: 驗證 Token
            DB-->>API: 有效 Session
            API->>DB: 查詢 teachers 表
            DB-->>API: 完整教師資料

            API->>API: 根據角色過濾資料

            alt 訪客
                API-->>Page: 基本資料（姓名、照片、3個標籤）
            else 學員
                API-->>Page: 詳細資料（含經歷、證照）
            else 教師
                API-->>Page: 完整資料（所有欄位）
            else 管理者
                API-->>Page: 完整資料 + 管理功能
            end

            Page->>Helper: 根據角色渲染 UI
            Helper->>Page: 動態調整顯示內容
            Page->>User: 顯示頁面
        else 權限不足
            Helper-->>Page: ❌ 拒絕訪問
            Page->>Login: 導向登入頁
            Login->>User: 提示登入
        end
    end
```

---

## 10. 權限檢查決策樹

```mermaid
flowchart TD
    Start{操作類型?}

    Start -->|查看列表| ViewList
    Start -->|查看詳情| ViewDetail
    Start -->|編輯| Edit
    Start -->|刪除| Delete
    Start -->|建立| Create

    %% 查看列表
    ViewList{資源類型?}
    ViewList -->|教師列表| AllowView[✅ 允許<br/>但根據角色過濾]
    ViewList -->|課程列表| AllowView
    ViewList -->|派課列表| CheckLogin1

    CheckLogin1{已登入?}
    CheckLogin1 -->|是| FilterOwn1[✅ 允許<br/>教師只看自己的]
    CheckLogin1 -->|否| Deny1[❌ 拒絕]

    %% 查看詳情
    ViewDetail{已登入?}
    ViewDetail -->|是| AllowDetail[✅ 允許]
    ViewDetail -->|否| Deny2[❌ 拒絕]

    %% 編輯
    Edit{是管理者?}
    Edit -->|是| AllowEdit1[✅ 允許]
    Edit -->|否| CheckOwner

    CheckOwner{編輯自己的?}
    CheckOwner -->|是| CheckRole1{是教師?}
    CheckOwner -->|否| Deny3[❌ 拒絕]

    CheckRole1 -->|是| AllowEdit2[✅ 允許]
    CheckRole1 -->|否| Deny4[❌ 拒絕]

    %% 刪除
    Delete{是管理者?}
    Delete -->|是| AllowDelete[✅ 允許]
    Delete -->|否| Deny5[❌ 拒絕]

    %% 建立
    Create{資源類型?}
    Create -->|問卷回覆| AllowCreate1[✅ 所有人允許]
    Create -->|其他| CheckAdmin

    CheckAdmin{是管理者?}
    CheckAdmin -->|是| AllowCreate2[✅ 允許]
    CheckAdmin -->|否| Deny6[❌ 拒絕]

    style AllowView fill:#c8e6c9
    style AllowDetail fill:#c8e6c9
    style AllowEdit1 fill:#c8e6c9
    style AllowEdit2 fill:#c8e6c9
    style AllowDelete fill:#c8e6c9
    style AllowCreate1 fill:#c8e6c9
    style AllowCreate2 fill:#c8e6c9
    style FilterOwn1 fill:#fff9c4

    style Deny1 fill:#ffcdd2
    style Deny2 fill:#ffcdd2
    style Deny3 fill:#ffcdd2
    style Deny4 fill:#ffcdd2
    style Deny5 fill:#ffcdd2
    style Deny6 fill:#ffcdd2
```

---

## 11. 實施步驟流程圖

```mermaid
gantt
    title RBAC 實施時程規劃
    dateFormat YYYY-MM-DD
    section 準備階段
    閱讀規劃文檔           :done, prep1, 2025-11-19, 1d
    設計資料庫結構         :done, prep2, after prep1, 1d
    建立測試帳號           :prep3, after prep2, 1d

    section 後端開發
    建立 users/sessions 表  :backend1, after prep3, 1d
    實作登入 API           :backend2, after backend1, 2d
    實作 Token 驗證        :backend3, after backend2, 1d
    實作權限檢查           :backend4, after backend3, 2d
    實作資料過濾           :backend5, after backend4, 2d

    section 前端開發
    建立登入頁面           :frontend1, after backend2, 2d
    整合 auth-helpers.js   :frontend2, after frontend1, 1d
    修改導航選單           :frontend3, after frontend2, 1d
    修改教師列表頁         :frontend4, after frontend3, 2d
    修改其他頁面           :frontend5, after frontend4, 3d

    section 測試與部署
    功能測試              :test1, after frontend5, 2d
    權限測試              :test2, after test1, 2d
    修正 Bug              :test3, after test2, 2d
    正式部署              :deploy, after test3, 1d
```

---

## 使用說明

這些圖表可以在以下環境中查看：

1. **GitHub**：直接在 GitHub 上查看此 Markdown 文件
2. **VS Code**：安裝 Mermaid 擴充套件
3. **線上編輯器**：
   - https://mermaid.live/
   - https://mermaid-js.github.io/mermaid-live-editor/

複製圖表代碼到這些編輯器中即可渲染出視覺化圖表。

---

## 圖表說明

| 圖表編號 | 圖表名稱 | 用途 |
|---------|---------|------|
| 1 | 系統整體架構 | 了解前後端和資料層的關係 |
| 2 | 用戶登入流程 | 了解登入過程的交互 |
| 3 | API 請求權限驗證流程 | 了解後端如何驗證權限 |
| 4 | 角色權限層級結構 | 了解各角色的權限範圍 |
| 5 | 前端頁面訪問控制流程 | 了解前端如何控制頁面訪問 |
| 6 | 教師資料查詢與過濾 | 了解不同角色看到的資料差異 |
| 7 | 前端 UI 權限控制邏輯 | 了解 UI 元素的顯示邏輯 |
| 8 | 資料表關聯圖 | 了解資料庫結構 |
| 9 | 完整登入到訪問資料流程 | 了解端到端的完整流程 |
| 10 | 權限檢查決策樹 | 了解各種操作的權限判斷 |
| 11 | 實施步驟流程圖 | 了解實施的時程規劃 |

---

## 相關文件

- [RBAC-PLANNING.md](../RBAC-PLANNING.md) - 完整規劃文檔
- [README.md](README.md) - 範例使用說明
- [auth-helpers.js](auth-helpers.js) - 前端權限控制
- [backend-rbac-example.gs](backend-rbac-example.gs) - 後端權限控制
