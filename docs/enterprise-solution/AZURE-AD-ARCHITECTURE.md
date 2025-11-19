# Azure AD 整合架構圖

使用 Mermaid 圖表展示 Azure AD 單一登入（SSO）整合後的完整架構。

---

## 1. 整體系統架構（整合 Azure AD）

```mermaid
graph TB
    subgraph "用戶 Users"
        U1[👤 公司員工<br/>Outlook 帳號]
        U2[👨‍🏫 外聘教師<br/>訪客帳號]
        U3[👥 訪客<br/>匿名訪問]
    end

    subgraph "Azure AD / Microsoft Entra ID"
        AAD[Azure AD 租戶]
        AAD_APP[已註冊應用程式<br/>Teacher Roster]
        AAD_USERS[(用戶目錄)]
        AAD_GROUPS[群組/部門]
    end

    subgraph "前端 Frontend"
        FE_LOGIN[登入頁面]
        FE_CALLBACK[OAuth 回調頁面]
        FE_APP[應用程式頁面]
        FE_AUTH[auth-helpers.js]
    end

    subgraph "後端 Backend - Node.js"
        BE_AUTH[認證路由<br/>/auth/*]
        BE_OAUTH[OAuth 處理]
        BE_GRAPH[Microsoft Graph API]
        BE_ROLE[角色分配服務]
        BE_JWT[JWT Token 產生]
        BE_API[業務 API]
    end

    subgraph "資料庫 Database"
        DB[(MySQL)]
        DB_USERS[users 表<br/>+ azure_id<br/>+ department]
        DB_ROLES[roles 表]
        DB_MAPPING[department_role_mapping]
    end

    %% 公司員工登入流程
    U1 -->|1. 點擊登入| FE_LOGIN
    FE_LOGIN -->|2. 導向 Azure AD| AAD
    AAD -->|3. Microsoft 登入頁| U1
    U1 -->|4. 輸入帳密| AAD
    AAD -->|5. 授權碼| FE_CALLBACK
    FE_CALLBACK -->|6. 授權碼| BE_OAUTH
    BE_OAUTH -->|7. 換取 Access Token| AAD_APP
    AAD_APP -->|8. Access Token| BE_OAUTH
    BE_OAUTH -->|9. 取得用戶資訊| BE_GRAPH
    BE_GRAPH -->|10. Graph API| AAD_USERS
    AAD_USERS -->|11. 用戶資料<br/>name, email, dept| BE_GRAPH
    BE_GRAPH -->|12. 用戶資料| BE_ROLE
    BE_ROLE -->|13. 查詢角色映射| DB_MAPPING
    BE_ROLE -->|14. 建立/更新用戶| DB_USERS
    BE_ROLE -->|15. 分配角色| DB_ROLES
    BE_ROLE -->|16. 用戶+角色| BE_JWT
    BE_JWT -->|17. 系統 JWT Token| FE_CALLBACK
    FE_CALLBACK -->|18. 儲存 Token| FE_AUTH
    FE_AUTH -->|19. 導向首頁| FE_APP

    %% 訪客流程
    U3 -->|直接訪問| FE_APP
    FE_APP -->|訪客身分| BE_API

    %% API 請求
    FE_APP -->|API 請求 + JWT| BE_API
    BE_API -->|查詢資料| DB

    style AAD fill:#0078d4,color:#fff
    style U1 fill:#c8e6c9
    style U3 fill:#f5f5f5
    style BE_JWT fill:#fff9c4
```

---

## 2. Azure AD 登入流程（詳細序列圖）

```mermaid
sequenceDiagram
    autonumber

    actor User as 👤 公司員工
    participant FE as 前端應用
    participant BE as 後端 API
    participant AAD as Azure AD
    participant Graph as Microsoft Graph
    participant DB as 資料庫

    %% 登入流程
    rect rgb(230, 240, 255)
        Note over User,DB: 階段 1: Azure AD 認證
        User->>FE: 點擊「使用公司帳號登入」
        FE->>AAD: 導向 Microsoft 登入頁<br/>+ client_id, redirect_uri, scope
        AAD->>User: 顯示 Microsoft 登入頁面
        User->>AAD: 輸入 Outlook 帳號密碼

        alt 啟用 MFA
            AAD->>User: 要求多重要素驗證
            User->>AAD: 完成 MFA
        end

        AAD->>AAD: 驗證成功
        AAD->>FE: 重新導向 + 授權碼<br/>(redirect_uri?code=xxx)
    end

    %% Token 交換
    rect rgb(230, 255, 230)
        Note over User,DB: 階段 2: Token 交換與用戶資訊取得
        FE->>BE: 傳送授權碼
        BE->>AAD: 用授權碼換取 Token<br/>+ client_secret
        AAD->>BE: Access Token + ID Token

        BE->>Graph: 取得用戶資訊<br/>GET /v1.0/me<br/>+ Access Token
        Graph->>BE: 用戶資料<br/>{id, email, displayName,<br/>department, jobTitle}
    end

    %% 用戶建立與角色分配
    rect rgb(255, 243, 224)
        Note over User,DB: 階段 3: 用戶建立與角色分配
        BE->>DB: 查詢用戶 (by azure_id or email)

        alt 新用戶
            DB-->>BE: 用戶不存在
            BE->>DB: 建立用戶記錄<br/>INSERT INTO users
            BE->>BE: 分析部門<br/>department_role_mapping
            BE->>DB: 分配角色<br/>INSERT INTO user_roles
            Note over BE: 根據部門自動分配角色：<br/>「課務組」→ admin<br/>「教師」→ teacher<br/>「學員」→ student
        else 現有用戶
            DB-->>BE: 返回用戶資料
            BE->>DB: 更新用戶資訊<br/>UPDATE users<br/>SET department, last_sync_at
        end

        BE->>DB: 查詢用戶角色和權限
        DB-->>BE: 角色 + 權限列表
    end

    %% 系統 Token 產生
    rect rgb(255, 235, 238)
        Note over User,DB: 階段 4: 系統 Token 產生與登入完成
        BE->>BE: 產生系統 JWT Token<br/>{userId, email, role, permissions}
        BE->>FE: 返回系統 Token

        FE->>FE: 儲存 Token 到 localStorage<br/>setAuthState(user, token)

        alt 管理者
            FE->>User: 導向管理後台<br/>/admin/teachers.html
        else 教師
            FE->>User: 導向個人資料頁<br/>/my-profile.html
        else 學員
            FE->>User: 導向課表頁<br/>/my-schedule.html
        end
    end

    Note over User,FE: 登入完成！✅
```

---

## 3. 角色自動分配流程

```mermaid
flowchart TD
    Start([取得 Azure AD 用戶資訊]) --> GetDept[取得部門資訊<br/>department field]

    GetDept --> HasDept{有部門?}

    HasDept -->|否| DefaultRole[分配預設角色:<br/>student]
    HasDept -->|是| CheckMapping[檢查部門映射規則]

    CheckMapping --> Match1{包含<br/>課務組?}
    Match1 -->|是| AssignAdmin[分配角色:<br/>admin]
    Match1 -->|否| Match2

    Match2{包含<br/>教務處?}
    Match2 -->|是| AssignAdmin
    Match2 -->|否| Match3

    Match3{包含<br/>系統管理?}
    Match3 -->|是| AssignAdmin
    Match3 -->|否| Match4

    Match4{包含<br/>教師?}
    Match4 -->|是| AssignTeacher[分配角色:<br/>teacher]
    Match4 -->|否| Match5

    Match5{包含<br/>講師?}
    Match5 -->|是| AssignTeacher
    Match5 -->|否| Match6

    Match6{包含<br/>學員?}
    Match6 -->|是| AssignStudent[分配角色:<br/>student]
    Match6 -->|否| Match7

    Match7{包含<br/>學生?}
    Match7 -->|是| AssignStudent
    Match7 -->|否| DefaultRole

    AssignAdmin --> SaveDB[(儲存到資料庫<br/>user_roles)]
    AssignTeacher --> SaveDB
    AssignStudent --> SaveDB
    DefaultRole --> SaveDB

    SaveDB --> Done([角色分配完成])

    style Start fill:#e1f5ff
    style AssignAdmin fill:#ffccbc
    style AssignTeacher fill:#e1bee7
    style AssignStudent fill:#bbdefb
    style DefaultRole fill:#f5f5f5
    style Done fill:#c8e6c9
```

---

## 4. 用戶類型與登入方式

```mermaid
graph LR
    subgraph "用戶類型 User Types"
        T1[公司員工<br/>Internal Staff]
        T2[外聘講師<br/>External Teacher]
        T3[訪客<br/>Visitor]
    end

    subgraph "認證方式 Authentication"
        A1[Azure AD SSO<br/>Outlook 帳號]
        A2[Azure AD 訪客帳號<br/>Guest Account]
        A3[匿名訪問<br/>Anonymous]
    end

    subgraph "角色分配 Role Assignment"
        R1[自動分配<br/>根據部門]
        R2[手動分配<br/>管理者設定]
        R3[固定角色<br/>visitor]
    end

    T1 -->|登入方式| A1
    A1 -->|角色來源| R1

    T2 -->|選項 1| A2
    T2 -->|選項 2| Manual[手動建立帳號]
    A2 -->|角色來源| R2
    Manual -->|角色來源| R2

    T3 -->|登入方式| A3
    A3 -->|角色來源| R3

    style T1 fill:#c8e6c9
    style T2 fill:#fff9c4
    style T3 fill:#f5f5f5
    style A1 fill:#0078d4,color:#fff
    style R1 fill:#4caf50,color:#fff
```

---

## 5. 資料庫結構（整合 Azure AD）

```mermaid
erDiagram
    AZURE_AD ||--o{ USERS : "sync from"
    USERS ||--o{ USER_ROLES : "has"
    ROLES ||--o{ USER_ROLES : "assigned to"
    DEPARTMENT_MAPPING ||--|| ROLES : "maps to"

    AZURE_AD {
        string id "Azure AD 用戶 ID"
        string userPrincipalName "user@company.com"
        string displayName "顯示名稱"
        string mail "Email"
        string department "部門"
        string jobTitle "職稱"
    }

    USERS {
        int id PK
        string azure_id UK "Azure AD 用戶 ID"
        string email UK
        string username
        string full_name
        string department "從 Azure AD 同步"
        string job_title "從 Azure AD 同步"
        boolean is_active
        timestamp last_sync_at "最後同步時間"
        timestamp created_at
    }

    USER_ROLES {
        int id PK
        int user_id FK
        int role_id FK
        timestamp assigned_at
    }

    ROLES {
        int id PK
        string name "admin/teacher/student/visitor"
        string display_name
        string description
    }

    DEPARTMENT_MAPPING {
        int id PK
        string department_pattern "部門關鍵字"
        int role_id FK
        int priority "優先級"
    }
```

---

## 6. API 請求認證流程（整合 Azure AD Token）

```mermaid
flowchart TD
    Start([前端 API 請求]) --> HasToken{請求包含<br/>JWT Token?}

    HasToken -->|否| CheckPublic{公開端點?}
    CheckPublic -->|是| AllowAnonymous[允許訪客訪問<br/>role = visitor]
    CheckPublic -->|否| Deny1[❌ 返回 401<br/>Unauthorized]

    HasToken -->|是| VerifyJWT[驗證 JWT Token]
    VerifyJWT --> ValidJWT{JWT 有效?}

    ValidJWT -->|否| Deny2[❌ 返回 401<br/>Invalid Token]
    ValidJWT -->|是| CheckExpiry{Token<br/>過期?}

    CheckExpiry -->|是| RefreshOption{可刷新?}
    RefreshOption -->|是| RefreshToken[刷新 Token]
    RefreshOption -->|否| Deny3[❌ 返回 401<br/>Token Expired]

    CheckExpiry -->|否| ExtractUser[提取用戶資訊<br/>userId, role, permissions]
    RefreshToken --> ExtractUser

    ExtractUser --> LoadFromDB[從資料庫載入<br/>完整用戶資料]
    LoadFromDB --> CheckActive{用戶<br/>啟用?}

    CheckActive -->|否| Deny4[❌ 返回 403<br/>User Inactive]
    CheckActive -->|是| CheckPermission{檢查<br/>權限}

    AllowAnonymous --> CheckPermission

    CheckPermission -->|Admin| AllowAll[✅ 允許所有操作]
    CheckPermission -->|其他角色| MatchRole{符合<br/>要求?}

    MatchRole -->|是| FilterData[根據角色<br/>過濾資料]
    MatchRole -->|否| Deny5[❌ 返回 403<br/>Forbidden]

    FilterData --> Success[✅ 返回資料]
    AllowAll --> Success

    Success --> LogAudit[記錄審計日誌]
    LogAudit --> End([完成])

    Deny1 --> End
    Deny2 --> End
    Deny3 --> End
    Deny4 --> End
    Deny5 --> End

    style Start fill:#e1f5ff
    style Success fill:#c8e6c9
    style Deny1 fill:#ffcdd2
    style Deny2 fill:#ffcdd2
    style Deny3 fill:#ffcdd2
    style Deny4 fill:#ffcdd2
    style Deny5 fill:#ffcdd2
```

---

## 7. 部署架構圖

```mermaid
graph TB
    subgraph "Azure Cloud"
        AAD[Azure AD<br/>Microsoft Entra ID]
        AAD_APP[已註冊應用程式]
    end

    subgraph "您的伺服器 Your Server"
        subgraph "前端 Frontend"
            NGINX[Nginx<br/>Web Server]
            FE_FILES[靜態檔案<br/>HTML/CSS/JS]
        end

        subgraph "後端 Backend"
            NODE[Node.js<br/>Express Server<br/>Port 3001]
            PM2[PM2<br/>Process Manager]
        end

        subgraph "資料庫 Database"
            MYSQL[MySQL 8.0<br/>Port 3306]
            BACKUP[備份服務<br/>Daily Backup]
        end
    end

    subgraph "用戶端 Client"
        BROWSER[瀏覽器<br/>Chrome/Edge/Safari]
    end

    %% 連接關係
    BROWSER -->|HTTPS| NGINX
    NGINX -->|靜態檔案| FE_FILES
    NGINX -->|API 請求<br/>/api/*| NODE

    NODE -->|OAuth| AAD
    AAD -->|Token| NODE
    AAD_APP -.配置.-> AAD

    NODE -->|SQL Query| MYSQL
    MYSQL -->|每日備份| BACKUP

    PM2 -.管理.-> NODE

    style AAD fill:#0078d4,color:#fff
    style NGINX fill:#009639,color:#fff
    style NODE fill:#339933,color:#fff
    style MYSQL fill:#4479a1,color:#fff
```

---

## 8. 安全架構層次

```mermaid
graph LR
    subgraph "安全層次 Security Layers"
        L1[第 1 層<br/>Azure AD 認證]
        L2[第 2 層<br/>JWT Token 驗證]
        L3[第 3 層<br/>角色檢查]
        L4[第 4 層<br/>權限檢查]
        L5[第 5 層<br/>資料過濾]
    end

    L1 -->|通過| L2
    L2 -->|通過| L3
    L3 -->|通過| L4
    L4 -->|通過| L5
    L5 --> Success[✅ 訪問成功]

    L1 -.失敗.-> Fail1[❌ 導向登入]
    L2 -.失敗.-> Fail2[❌ 401 未授權]
    L3 -.失敗.-> Fail3[❌ 403 權限不足]
    L4 -.失敗.-> Fail4[❌ 403 權限不足]

    style L1 fill:#0078d4,color:#fff
    style L2 fill:#106ebe,color:#fff
    style L3 fill:#005a9e,color:#fff
    style L4 fill:#004578,color:#fff
    style L5 fill:#003050,color:#fff
    style Success fill:#c8e6c9
```

---

## 9. 錯誤處理流程

```mermaid
flowchart TD
    Start([Azure AD 登入]) --> TryLogin[嘗試登入]

    TryLogin --> LoginSuccess{登入<br/>成功?}

    LoginSuccess -->|是| GetToken[取得 Access Token]
    LoginSuccess -->|否| LoginError

    LoginError{錯誤類型?}
    LoginError -->|帳號不存在| E1[顯示錯誤:<br/>請聯絡管理員]
    LoginError -->|密碼錯誤| E2[顯示錯誤:<br/>密碼錯誤]
    LoginError -->|MFA 失敗| E3[顯示錯誤:<br/>多重驗證失敗]
    LoginError -->|帳號停用| E4[顯示錯誤:<br/>帳號已停用]

    GetToken --> TokenSuccess{Token<br/>有效?}
    TokenSuccess -->|否| E5[顯示錯誤:<br/>Token 無效]
    TokenSuccess -->|是| GetUserInfo[取得用戶資訊]

    GetUserInfo --> GraphSuccess{Graph API<br/>成功?}
    GraphSuccess -->|否| E6[顯示錯誤:<br/>無法取得用戶資訊]
    GraphSuccess -->|是| CheckDept{有部門<br/>資訊?}

    CheckDept -->|否| W1[⚠️ 警告:<br/>無部門資訊<br/>分配預設角色]
    CheckDept -->|是| AssignRole[分配角色]
    W1 --> AssignRole

    AssignRole --> CreateUser[建立/更新用戶]
    CreateUser --> DBSuccess{資料庫<br/>操作成功?}

    DBSuccess -->|否| E7[顯示錯誤:<br/>系統錯誤]
    DBSuccess -->|是| GenJWT[產生系統 JWT]

    GenJWT --> Redirect[導向首頁]

    E1 & E2 & E3 & E4 & E5 & E6 & E7 --> RetryOption{允許<br/>重試?}
    RetryOption -->|是| BackToLogin[返回登入頁]
    RetryOption -->|否| ContactAdmin[顯示:<br/>請聯絡管理員]

    BackToLogin --> End([結束])
    ContactAdmin --> End
    Redirect --> End

    style Start fill:#e1f5ff
    style Redirect fill:#c8e6c9
    style E1 fill:#ffcdd2
    style E2 fill:#ffcdd2
    style E3 fill:#ffcdd2
    style E4 fill:#ffcdd2
    style E5 fill:#ffcdd2
    style E6 fill:#ffcdd2
    style E7 fill:#ffcdd2
    style W1 fill:#fff9c4
```

---

## 使用說明

這些圖表使用 Mermaid 語法，可以在以下環境中查看：

1. **GitHub**: 直接在 GitHub 上查看此 Markdown 文件
2. **VS Code**: 安裝 Mermaid Preview 擴充套件
3. **線上編輯器**:
   - https://mermaid.live/
   - https://mermaid-js.github.io/mermaid-live-editor/

## 圖表說明

| 圖表編號 | 圖表名稱 | 用途 |
|---------|---------|------|
| 1 | 整體系統架構 | 了解 Azure AD 整合後的完整架構 |
| 2 | Azure AD 登入流程 | 詳細的登入序列圖 |
| 3 | 角色自動分配流程 | 了解如何根據部門分配角色 |
| 4 | 用戶類型與登入方式 | 不同用戶的認證方式 |
| 5 | 資料庫結構 | Azure AD 整合後的資料庫設計 |
| 6 | API 請求認證流程 | 包含 Token 驗證和權限檢查 |
| 7 | 部署架構圖 | 生產環境的部署架構 |
| 8 | 安全架構層次 | 多層安全防護機制 |
| 9 | 錯誤處理流程 | 登入過程的錯誤處理 |

## 相關文件

- [AZURE-AD-INTEGRATION.md](AZURE-AD-INTEGRATION.md) - Azure AD 整合詳細規劃
- [RBAC-PLANNING.md](RBAC-PLANNING.md) - RBAC 系統規劃
- [ARCHITECTURE-DIAGRAMS.md](examples/ARCHITECTURE-DIAGRAMS.md) - 基礎架構圖
