let msalInstance = null;
let currentAccount = null;
let userPermissions = null;

const SSO_TOKEN_KEY = 'sso_jwt';

// SSO token 處理

function decodeJwtPayload(token) {
    const parts = token.split('.');
    if (parts.length < 2) return null;

    // JWT payload 使用 base64url，不是純 base64
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
}

function getSsoToken() {
    const token = localStorage.getItem(SSO_TOKEN_KEY);
    if (!token) return null;
    try {
        const payload = decodeJwtPayload(token);
        if (!payload) {
            localStorage.removeItem(SSO_TOKEN_KEY);
            return null;
        }
        if (payload.exp && Date.now() / 1000 > payload.exp) {
            localStorage.removeItem(SSO_TOKEN_KEY);
            return null;
        }
        return token;
    } catch {
        localStorage.removeItem(SSO_TOKEN_KEY);
        return null;
    }
}

function isSsoUser() {
    return !!getSsoToken();
}

async function handleSsoCallback() {
    const params = new URLSearchParams(window.location.search);
    const encryptedToken = params.get('token');
    if (!encryptedToken) return false;

    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/auth/sso`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: encryptedToken })
        });
        const result = await response.json();

        if (!result.success || !result.token) {
            console.error('SSO 驗證失敗:', result.error);
            return false;
        }

        localStorage.setItem(SSO_TOKEN_KEY, result.token);

        // 僅在驗證成功後移除 URL token，避免暫時性失敗時無法重試
        history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
        return true;
    } catch (e) {
        console.error('SSO 請求失敗:', e);
        return false;
    }
}

// 防止 XSS：將字串中的 HTML 特殊字元轉義
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

// 判斷是否啟用本地繞過驗證
function isSkipValidation() {
    const isLocal = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1' ||
                    window.location.protocol === 'file:';
    return isLocal || (typeof CONFIG !== 'undefined' && CONFIG.SKIP_TOKEN_VALIDATION === true);
}
 
// 本地測試用的假資料
const MOCK_ACCOUNT = {
    username: 'local-dev@wanhai.com',
    name: 'Local Developer',
    accountIdentifier: 'mock-account-id'
};
const MOCK_PERMISSIONS = {
    allowed: true,
    isAdmin: true,
    isSuperAdmin: true,
    email: 'local-dev@wanhai.com'
};

// 初始化 MSAL
async function initializeMsal() {
	// 本地測試：直接跳過 MSAL 驗證
    if (isSkipValidation()) {
        currentAccount = MOCK_ACCOUNT;
        userPermissions = MOCK_PERMISSIONS;
        return currentAccount;
    }

    // SSO callback 處理：如果 URL 上有 ?token= 則先處理 SSO
    await handleSsoCallback();

    // 如果是 SSO 使用者（含剛完成 callback 或已有儲存的 SSO token）
    const ssoToken = getSsoToken();
    if (ssoToken) {
        await loadUserPermissions();
        if (userPermissions) {
            currentAccount = {
                username: userPermissions.email,
                name: userPermissions.email,
                isSsoGuest: true
            };
        }
        return currentAccount;
    }
	
    const msalConfig = {
        auth: {
            clientId: CONFIG.msal.clientId,
            authority: CONFIG.msal.authority,
            redirectUri: CONFIG.msal.redirectUri
        },
        cache: {
            cacheLocation: 'localStorage',
            storeAuthStateInCookie: false
        }
    };

    msalInstance = new msal.PublicClientApplication(msalConfig);
    await msalInstance.initialize();

    try {
        const response = await msalInstance.handleRedirectPromise();
        if (response) {
            currentAccount = response.account;
            msalInstance.setActiveAccount(currentAccount);
            await loadUserPermissions();
            return currentAccount;
        }
    } catch (error) {
        console.error('handleRedirectPromise error:', error);
    }

    // 檢查是否有已登入的帳戶
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
        currentAccount = accounts[0];
        msalInstance.setActiveAccount(currentAccount); 
        
        const testToken = await getAccessTokenSilent();
        if (testToken) {
            await loadUserPermissions();
        } else {
            console.log('Token 已過期，需要重新登入');
            localStorage.clear();
            sessionStorage.clear();
            currentAccount = null;
        }
    }

    return currentAccount;
}

// 載入使用者權限
async function loadUserPermissions(retryCount = 0) {
	// 本地測試：直接使用假資料
    if (isSkipValidation()) {
        userPermissions = MOCK_PERMISSIONS;
        return;
    }
	
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 秒
    
    try {
        const token = await getAccessTokenSilent();
        if (!token) {
            console.warn('無法取得 Token，權限設為 null');
            userPermissions = null;
            return;
        }

        const authController = new AbortController();
        const authTimer = setTimeout(() => authController.abort(), CONFIG.timeout);
        let response;
        try {
            response = await fetch(`${CONFIG.apiBaseUrl}/permissions/check`, {
                headers: { 'Authorization': `Bearer ${token}` },
                signal: authController.signal
            });
        } catch (fetchErr) {
            clearTimeout(authTimer);
            if (fetchErr.name === 'AbortError') {
                console.error('權限驗證請求逾時');
                userPermissions = null;
                return;
            }
            throw fetchErr;
        } finally {
            clearTimeout(authTimer);
        }
        
		// 404/502/503: 後端服務問題，禁用登入
		if ([404, 502, 503].includes(response.status)) {
			console.error(`後端服務異常 (${response.status})，請檢查部署狀態`);
			userPermissions = null;
			
			const errorMessages = {
				404: '後端服務尚未部署完成',
				502: '後端服務無法連線',
				503: '後端服務暫時無法使用'
			};
			
			const errorMsg = `系統維護中：${errorMessages[response.status] || '服務異常'}，請聯絡系統管理員。`;
			
			if (typeof showSystemAlert === 'function') {
				showSystemAlert(errorMsg, '系統錯誤');
			} else {
				alert(errorMsg);
			}
			
			// 禁用登入按鈕
			const loginBtn = document.getElementById('login-btn');
			if (loginBtn) {
				loginBtn.disabled = true;
				loginBtn.textContent = '系統維護中';
				loginBtn.style.opacity = '0.5';
				loginBtn.style.cursor = 'not-allowed';
			}
			
			if (typeof hideLoading === 'function') hideLoading();
			const loginPrompt = document.getElementById('login-prompt');
			if (loginPrompt) loginPrompt.style.display = 'block';
			
			return;
		}
		
		// 504: Gateway Timeout，顯示重試按鈕
		if (response.status === 504) {
			console.error('後端回應超時 (504)');
			userPermissions = null;
			
			if (typeof showSystemAlert === 'function') {
				showSystemAlert('伺服器回應超時，請稍後再試。', '連線逾時');
			} else {
				alert('伺服器回應超時，請稍後再試。');
			}
			
			if (typeof hideLoading === 'function') hideLoading();
			const loginPrompt = document.getElementById('login-prompt');
			if (loginPrompt) loginPrompt.style.display = 'block';
			
			// 不禁用按鈕，讓使用者可以重試
			return;
		}
		
        const result = await response.json();

        if (response.ok) {
			userPermissions = result;
			
			// 如果權限為 false 且未重試過，嘗試強制刷新 Token 並重試
			if (!result.allowed && retryCount === 0) {
				if (isSsoUser()) return; // SSO 使用者不做 Token 刷新
				console.warn('權限為 false，嘗試強制刷新 Token...');
				try {
					const refreshResponse = await msalInstance.acquireTokenSilent({
						scopes: CONFIG.msal.scopes,
						account: currentAccount,
						forceRefresh: true
					});
					if (refreshResponse?.idToken) {
						return await loadUserPermissions(1);
					}
				} catch (e) {
					console.warn('強制刷新失敗，導向重新登入:', e.message);
					localStorage.clear();
					sessionStorage.clear();
					userPermissions = null;
					currentAccount = null;
					return;
				}
			}
			
			console.log('✅ 權限載入成功:', userPermissions);
		} else {
			// 401: Token 已失效
			if (response.status === 401) {
				// SSO 使用者：JWT 過期，清除並回登入頁
				if (isSsoUser()) {
					localStorage.removeItem(SSO_TOKEN_KEY);
					userPermissions = null;
					currentAccount = null;
					window.location.href = 'index.html';
					return;
				}
				console.warn('Token 已失效 (401)，嘗試強制刷新...');
				try {
					const refreshResponse = await msalInstance.acquireTokenSilent({
						scopes: CONFIG.msal.scopes,
						account: currentAccount,
						forceRefresh: true
					});
					if (refreshResponse?.idToken && retryCount === 0) {
						return await loadUserPermissions(1);
					}
				} catch (e) {
					console.warn('401 強制刷新失敗，導向重新登入:', e.message);
				}
				localStorage.clear();
				sessionStorage.clear();
				userPermissions = null;
				currentAccount = null;
				if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
					window.location.href = 'index.html';
				}
				return;
			}
			
			// 500: 伺服器冷啟動錯誤，重試
			if (retryCount < MAX_RETRIES && response.status === 500) {
				console.warn(`⏳ 伺服器無回應，${RETRY_DELAY/1000}秒後重試... (${retryCount + 1}/${MAX_RETRIES})`);
				await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
				return await loadUserPermissions(retryCount + 1);
			}
			
			console.error('權限驗證失敗:', result);
			userPermissions = { allowed: false, isAdmin: false, isSuperAdmin: false };
        }
    } catch (error) {
        // 網路錯誤也嘗試重試
        if (retryCount < MAX_RETRIES) {
            console.warn(`⏳ 連線失敗，${RETRY_DELAY/1000}秒後重試... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return await loadUserPermissions(retryCount + 1);
        }
        console.error('載入權限失敗:', error);
        
        // 網路連線徹底失敗也設為 null，避免斷網被誤認為不在白名單
        userPermissions = null; 
    }
}

async function getAccessTokenSilent() {
    // SSO 使用者：直接回傳儲存的 JWT
    const ssoToken = getSsoToken();
    if (ssoToken) return ssoToken;

    if (!msalInstance || !currentAccount) {
        return null;
    }
    try {
        const response = await msalInstance.acquireTokenSilent({
            scopes: CONFIG.msal.scopes,
            account: currentAccount,
            forceRefresh: false
        });
        return response.idToken;
    } catch (error) {
        console.warn("靜默獲取 Token 失敗:", error.message);
        return null; 
    }
}

async function getAccessTokenWithFallback() {
    if (!msalInstance || !currentAccount) {
        return null;
    }
    
    try {
        // 先嘗試靜默獲取
        const response = await msalInstance.acquireTokenSilent({
            scopes: CONFIG.msal.scopes,
            account: currentAccount,
            forceRefresh: false
        });
        return response.idToken;
    } catch (error) {
        console.warn("Token 失效，導向重新登入:", error.message);
        localStorage.clear();
        sessionStorage.clear();
        userPermissions = null;
        currentAccount = null;
        if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
            window.location.href = 'index.html';
        }
        return null;
    }
}

// 獲取 Access Token（給 API 呼叫使用）
async function getAccessToken() {
    return await getAccessTokenSilent();
}

// 新增：給 api.js 使用，API 呼叫失敗時可觸發重新登入
async function getToken() {
    const token = await getAccessTokenSilent();
    if (!token && currentAccount) {
        // Token 失效，嘗試帶 fallback 的版本
        return await getAccessTokenWithFallback();
    }
    return token;
}

// 權限判斷 Helper
function isAllowed() { return userPermissions && userPermissions.allowed; }
function isAdmin() { return userPermissions && userPermissions.isAdmin; }
function isSuperAdmin() { return userPermissions && userPermissions.isSuperAdmin; }
function getCurrentUser() { return currentAccount; }
function isLoggedIn() { return currentAccount !== null && userPermissions && userPermissions.allowed; }

// 驗證並執行登入 (綁定在登入按鈕)
function validateAndLogin() {
    const emailInput = document.getElementById('login-email');
    const errorDiv = document.getElementById('email-error');
    const email = emailInput.value.trim().toLowerCase();
    
    errorDiv.style.display = 'none';
    
    if (!email) {
        errorDiv.textContent = '請輸入 Email';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (!email.endsWith('@wanhai.com')) {
       errorDiv.textContent = '此系統僅供萬海員工使用';
       errorDiv.style.display = 'block';
       return;
    }
	
	if (typeof showLoading === 'function') {
        showLoading('正在進行身分驗證，請稍候...');
    }
    
    // 清除舊資料
    userPermissions = null;
    currentAccount = null;
    sessionStorage.clear(); 
    localStorage.clear();
    
    loginWithHint(email);
}

// 執行 MSAL 登入導向
async function loginWithHint(email) {
    if (!msalInstance) {
        alert('系統尚未初始化');
        return;
    }

    try {
        await msalInstance.loginRedirect({
            scopes: CONFIG.msal.scopes,
            loginHint: email,           
            domainHint: 'wanhai.com'
        });
    } catch (err) {
        console.error("登入導向失敗:", err);
    }
}

// 登出函式
async function logout() {
    localStorage.removeItem(SSO_TOKEN_KEY);
    localStorage.clear();
    sessionStorage.clear();
    userPermissions = null;
    currentAccount = null;

    if (!msalInstance) {
        window.location.href = 'index.html';
        return;
    }

    const account = msalInstance.getActiveAccount() || currentAccount;

    try {
        await msalInstance.logoutRedirect({
            account: account,
            postLogoutRedirectUri: CONFIG.msal.redirectUri
        });
    } catch (error) {
        console.error('登出失敗:', error);
        window.location.reload();
    }
}

// 內頁初始化 (安全防迴圈版本)
async function initPageWithAuth(callback) {	
    try {
        fetch(`${CONFIG.apiBaseUrl}/ping`).catch(() => {});
        if (!window._pingInterval) {
            window._pingInterval = setInterval(() => {
                fetch(`${CONFIG.apiBaseUrl}/ping`).catch(() => {});
            }, 5 * 60 * 1000);
        }
        const account = await initializeMsal();
        
        if (account && userPermissions === null) {
            console.log('🔄 權限為 null，嘗試重新載入...');
            await loadUserPermissions();
        }
        
        // 如果沒權限，不要跳轉，直接把畫面換成登入提示        
        // 情境 A: 已經登入，但被資料庫(白名單)拒絕存取
        if (account && userPermissions && userPermissions.allowed === false) {
            console.warn('帳號不在白名單內', { email: account.username });
            const safeAccountUsername = escapeHtml(account.username);
            
            document.getElementById('root').innerHTML = `
                <div class="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
                    <div class="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md w-full border border-slate-200">
                        <div class="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        </div>
                        <h2 class="text-2xl font-bold text-slate-800 mb-2">權限不足</h2>
                        <p class="text-slate-500 mb-2">您的帳號 <span class="font-bold text-blue-600">${safeAccountUsername}</span> 已登入，但不在系統白名單內。</p>
                        <p class="text-slate-500 text-sm mb-8">請聯絡系統管理員開通權限，或切換其他帳號。</p>
                        <button onclick="logout()" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-4 rounded-xl transition duration-200 flex items-center justify-center gap-2">
                            登出 / 切換帳號
                        </button>
                    </div>
                </div>
            `;
            return; // 阻斷後續渲染
        }

        // 情境 B: 完全沒登入，或是 Token 遺失/過期/連線異常
        if (!account || !userPermissions) {
            console.warn('身分驗證未通過 (未登入或 Token 異常)', { hasAccount: !!account });
            
            document.getElementById('root').innerHTML = `
                <div class="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
                    <div class="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md w-full border border-slate-200">
                        <div class="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                        </div>
                        <h2 class="text-2xl font-bold text-slate-800 mb-2">身分驗證失敗</h2>
                        <p class="text-slate-500 mb-8">您目前尚未登入，或是憑證已過期。</p>
                        <button onclick="loginWithHint('')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition duration-200 flex items-center justify-center gap-2">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                            使用 Microsoft 帳號登入
                        </button>
                    </div>
                </div>
            `;
            return; // 阻斷後續渲染
        }
                
        const userNameEl = document.getElementById('user-name');
        if (userNameEl) userNameEl.textContent = account.name || account.username;
        
        updateUIByPermission();
        
        if (typeof callback === 'function') await callback(account);

    } catch (error) {
        console.error('頁面初始化過程出錯:', error);
        const safeErrorMessage = escapeHtml(error?.message || '未知錯誤');
        
        document.getElementById('root').innerHTML = `
            <div class="min-h-screen flex items-center justify-center bg-slate-50">
                <div class="bg-white p-6 rounded-xl shadow-lg border-l-4 border-red-500 max-w-md text-center">
                    <h3 class="font-bold text-lg text-red-600 mb-2">系統載入嚴重錯誤</h3>
                    <p class="text-slate-600 text-sm">${safeErrorMessage}</p>
                </div>
            </div>
        `;
    }
}

function updateUIByPermission() {
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin() ? '' : 'none';
    });
    document.querySelectorAll('.super-admin-only').forEach(el => {
        el.style.display = isSuperAdmin() ? '' : 'none';
    });
    document.querySelectorAll('.viewer-only').forEach(el => {
        el.style.display = isAdmin() ? 'none' : '';
    });
}