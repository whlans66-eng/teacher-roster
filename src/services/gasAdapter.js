/**
 * gasAdapter.js — 暫時性的舊後端轉接層
 *
 * ⚠️ 這支檔案的存在目的就是為了被刪掉。
 *
 * 各領域模組（teachersApi、coursesApi…）一律用 REST 風格說話：
 *     callApi('/roster/teachers')
 *     callApi('/roster/teachers', { method: 'POST', body: {...} })
 *
 * 但目前的後端是 Google Apps Script，它只有「一個 URL + 一個 action 參數」，
 * 而且因為 GAS Web App 不能自訂 CORS 標頭，所有請求都必須避開 preflight：
 *   · GET  ：參數全部塞 query string，token 也是 query param（不是標頭）
 *   · POST ：只能用 application/x-www-form-urlencoded（CORS 安全清單內的
 *            content-type），物件欄位要各自 JSON.stringify
 *   · 回應 ：永遠 HTTP 200，成功失敗靠 {ok:true|false} 分辨
 *
 * 這些全部是 GAS 的權宜作法，不是業務契約，所以絕對不能外洩到這層之上。
 * 內網 REST API 上線後：config.js 的 backend 改成 'rest'，然後刪掉本檔。
 *
 * 舊實作對照：js/api.js 的 _get (:231)、_post (:307)、uploadFile (:190)
 */

import { CONFIG } from '../config.js';
import { ApiError, AuthError, normalizeThrown, withTimeout } from './apiErrors.js';

/**
 * REST 路徑 → GAS action 對照表。
 *
 * 每一列是 [方法, 路徑樣板, 翻譯函式]。翻譯函式收到 (params, body)，
 * 回傳 { action, verb, params }，其中 verb 決定走 GET 或 POST。
 *
 * GAS 端的 action 清單見 backend-api.gs:148-419。
 */
const ROUTES = [
  // ── 健康檢查 ──────────────────────────────────────────────────────
  ['GET', '/ping', () => ({ verb: 'GET', action: 'ping' })],

  // ── 登入（GAS 專屬：帳密換取 session token）────────────────────────
  ['POST', '/auth/login', (_p, body) => ({
    verb: 'POST',
    action: 'login',
    params: { username: body?.username, password: body?.password },
    // 登入本身不帶 token，否則後端會拿空字串去查 cache
    skipToken: true
  })],

  // ── 資料讀取 ──────────────────────────────────────────────────────
  ['GET', '/roster/all', () => ({ verb: 'GET', action: 'listall' })],
  ['GET', '/roster/versions', () => ({ verb: 'GET', action: 'getversions' })],
  ['GET', '/roster/:table', (p) => ({ verb: 'GET', action: 'list', params: { table: p.table } })],

  // ── 資料寫入 ──────────────────────────────────────────────────────
  // 整表覆寫，附帶版本指紋做樂觀鎖（backend-api.gs:285）
  ['POST', '/roster/batch', (_p, body) => ({
    verb: 'POST',
    action: 'batchsave',
    params: {
      tables: body?.tables,
      savedVersions: body?.savedVersions,
      forceOverwrite: body?.force ? 'true' : ''
    }
  })],
  ['POST', '/roster/:table', (p, body) => ({
    verb: 'POST',
    action: 'save',
    params: {
      table: p.table,
      data: body?.data,
      savedVersion: body?.savedVersion,
      forceOverwrite: body?.force ? 'true' : ''
    }
  })],
  // 單筆更新：後端早就實作好了（backend-api.gs:394）但舊前端從來沒叫過它。
  // 走這條路不需要整表指紋比對，因此也不會觸發衝突對話框。
  ['PUT', '/roster/:table/:id', (p, body) => ({
    verb: 'POST',
    action: 'update',
    params: { table: p.table, id: p.id, data: body?.data }
  })],

  // ── 檔案上傳（multipart，backend-api.gs:412）──────────────────────
  ['POST', '/files', () => ({ verb: 'MULTIPART', action: 'uploadfile' })],

  // ── AI 問答（長逾時，backend-api.gs:419）──────────────────────────
  ['POST', '/ai/ask', (_p, body) => ({
    verb: 'POST',
    action: 'askgemini',
    params: { prompt: body?.prompt, context: body?.context, history: body?.history },
    timeout: CONFIG.aiTimeout
  })]
];

/** 把 '/roster/:table' 樣板與實際路徑比對，取出路徑參數 */
function matchRoute(method, path) {
  const cleanPath = path.split('?')[0];
  const parts = cleanPath.split('/').filter(Boolean);

  for (const [routeMethod, template, translate] of ROUTES) {
    if (routeMethod !== method) continue;
    const templateParts = template.split('/').filter(Boolean);
    if (templateParts.length !== parts.length) continue;

    const params = {};
    let matched = true;
    for (let i = 0; i < templateParts.length; i += 1) {
      const t = templateParts[i];
      if (t.startsWith(':')) params[t.slice(1)] = decodeURIComponent(parts[i]);
      else if (t !== parts[i]) { matched = false; break; }
    }
    if (matched) return { translate, params };
  }
  return null;
}

/** GAS 回應信封拆解：永遠 HTTP 200，成敗看 ok 欄位 */
function unwrap(result) {
  if (!result || typeof result !== 'object') {
    throw new ApiError('後端回應格式不正確');
  }
  if (result.ok === false) {
    // 舊後端用這個字串表示 session 失效（backend-api.gs:102）
    if (result.error === 'Unauthorized') throw new AuthError();
    throw new ApiError(result.error || '請求失敗');
  }
  // 拆掉信封，只留資料。保留 conflict / rateLimited 等業務旗標給領域模組判斷。
  const { ok, ...rest } = result;
  return rest;
}

async function parseJson(response) {
  if (!response.ok) throw new ApiError(`後端回傳狀態碼 ${response.status}`, { status: response.status });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('後端回應不是 JSON，請確認 Apps Script 部署狀態');
  }
}

/**
 * 把一個 REST 風格請求翻譯成 GAS 請求並執行。
 * 只有 apiClient.js 會呼叫這支。
 */
export async function gasRequest(path, options = {}, tokenProvider = async () => null) {
  const method = (options.method || 'GET').toUpperCase();
  const route = matchRoute(method, path);

  if (!route) {
    throw new ApiError(
      `舊後端沒有對應的路由：${method} ${path}。` +
        `請在 services/gasAdapter.js 的 ROUTES 補上，或等內網 API 上線後改用 backend: 'rest'。`
    );
  }

  const spec = route.translate(route.params, options.body) || {};
  const token = spec.skipToken ? '' : (await tokenProvider()) || '';
  const timeout = spec.timeout || options.timeout || CONFIG.timeout;
  const [signal, cleanup] = withTimeout(timeout);

  if (CONFIG.debug) console.log('[gas]', method, path, '→ action=' + spec.action);

  try {
    // ── 檔案上傳：multipart ────────────────────────────────────────
    if (spec.verb === 'MULTIPART') {
      const formData = options.body instanceof FormData ? options.body : new FormData();
      formData.append('action', spec.action);
      formData.append('token', token);
      const response = await fetch(CONFIG.gas.baseUrl, { method: 'POST', body: formData, signal });
      return unwrap(await parseJson(response));
    }

    // ── 讀取：query string ────────────────────────────────────────
    if (spec.verb === 'GET') {
      const url = new URL(CONFIG.gas.baseUrl);
      url.searchParams.append('token', token);
      url.searchParams.append('action', spec.action);
      Object.entries(spec.params || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        url.searchParams.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
      });
      const response = await fetch(url.toString(), { method: 'GET', signal });
      return unwrap(await parseJson(response));
    }

    // ── 寫入：form-urlencoded（避開 CORS preflight）────────────────
    const form = new URLSearchParams();
    form.append('token', token);
    form.append('action', spec.action);
    Object.entries(spec.params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    });

    const response = await fetch(CONFIG.gas.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form.toString(),
      signal
    });
    return unwrap(await parseJson(response));
  } catch (error) {
    throw normalizeThrown(error);
  } finally {
    cleanup();
  }
}
