const CONFIG = {
    // 本地測試預設填本地後端 URL，正式部署前再換成 Azure Function URL
    apiBaseUrl: 'http://localhost:7071/api',
    SKIP_TOKEN_VALIDATION: true,
    msal: {
        clientId: '447e9736-5a17-47bb-a4fb-6f2b1da9206b',
        authority: 'https://login.microsoftonline.com/2b20eccf-1c1e-43ce-9340-0edfe3a2266f',
        redirectUri: window.location.origin,
        scopes: ['User.Read'],
    },
    timeout: 30000
};