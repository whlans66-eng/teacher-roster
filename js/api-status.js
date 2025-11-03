(function(global) {
  const DEFAULT_OPTIONS = {
    badgeId: 'apiStatusBadge',
    messageId: 'apiStatusMessage',
    detailId: 'apiStatusDetail',
    buttonId: 'apiStatusButton',
    initialMessage: '尚未檢查 API 連線狀態',
    initialDetail: null,
    autoAttachButtonHandler: true,
    autoCheckOnInit: false,
    exposeGlobal: true,
    onManualSuccess: null,
    onManualError: null
  };

  const STATUS_CLASSES = {
    idle: {
      badge: 'bg-gray-100 text-gray-600 border-gray-200',
      text: 'text-gray-700'
    },
    checking: {
      badge: 'bg-blue-50 text-blue-600 border-blue-200',
      text: 'text-blue-600'
    },
    success: {
      badge: 'bg-green-100 text-green-700 border-green-200',
      text: 'text-green-700'
    },
    error: {
      badge: 'bg-red-100 text-red-700 border-red-200',
      text: 'text-red-700'
    }
  };

  let currentOptions = { ...DEFAULT_OPTIONS };
  let lastCheckedAt = null;

  function getElement(id) {
    if (!id) return null;
    return document.getElementById(id);
  }

  function formatDateTimeForStatus(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function buildBaseDetailMessage() {
    if (typeof API_CONFIG !== 'undefined' && API_CONFIG?.baseUrl) {
      return `目前設定的 API URL：${API_CONFIG.baseUrl}`;
    }
    return '請先完成 Google Apps Script 部署並設定允許此網域存取。';
  }

  function updateApiStatusUI(status, message, detail) {
    const badge = getElement(currentOptions.badgeId);
    const messageEl = getElement(currentOptions.messageId);
    const detailEl = getElement(currentOptions.detailId);

    if (badge) {
      badge.textContent =
        status === 'checking' ? '檢測中…' :
        status === 'success' ? '連線正常' :
        status === 'error' ? '連線失敗' :
        '尚未檢查';

      badge.className = 'status-badge';
      const classConfig = STATUS_CLASSES[status] || STATUS_CLASSES.idle;
      if (classConfig?.badge) {
        badge.className += ' ' + classConfig.badge;
      }
    }

    if (messageEl) {
      messageEl.textContent = message || '';
      messageEl.className = 'text-sm font-medium ' + ((STATUS_CLASSES[status] && STATUS_CLASSES[status].text) || 'text-gray-700');
    }

    if (detailEl) {
      if (detail) {
        detailEl.textContent = detail;
        detailEl.classList.remove('hidden');
      } else {
        detailEl.textContent = '';
        detailEl.classList.add('hidden');
      }
    }
  }

  function setApiStatusButtonLoading(isLoading) {
    const button = getElement(currentOptions.buttonId);
    if (!button) return;

    if (isLoading) {
      button.disabled = true;
      button.classList.add('opacity-60', 'cursor-not-allowed');
      button.innerHTML = '<span class="mr-2">⏳</span>檢測中...';
    } else {
      button.disabled = false;
      button.classList.remove('opacity-60', 'cursor-not-allowed');
      button.innerHTML = '<span class="mr-2">🩺</span>測試 API 連線';
    }
  }

  async function performApiStatusCheck(manual = false) {
    if (typeof api === 'undefined' || typeof api.ping !== 'function') {
      updateApiStatusUI('error', 'API 尚未初始化', '請確認 js/api.js 已正確載入。');
      if (manual && typeof currentOptions.onManualError === 'function') {
        currentOptions.onManualError('API 尚未初始化', new Error('API 尚未初始化'));
      }
      return { status: 'error', error: new Error('API 尚未初始化') };
    }

    setApiStatusButtonLoading(true);
    updateApiStatusUI('checking', '正在測試 API 連線...', '請稍候，通常會在 1 秒內完成檢查。');

    const startedAt = performance.now();

    try {
      const result = await api.ping();

      if (!result?.ok) {
        throw new Error(result?.error || 'API 回應未標示 ok');
      }

      const elapsed = Math.round(performance.now() - startedAt);
      lastCheckedAt = new Date();

      const detailParts = [
        `最後檢查時間：${formatDateTimeForStatus(lastCheckedAt)}`,
        `延遲：約 ${elapsed} ms`
      ];

      if (result?.timestamp) {
        const serverTime = formatDateTimeForStatus(new Date(result.timestamp));
        if (serverTime) {
          detailParts.push(`伺服器時間：${serverTime}`);
        }
      }

      if (typeof API_CONFIG !== 'undefined' && API_CONFIG?.baseUrl) {
        detailParts.push(`目前 API URL：${API_CONFIG.baseUrl}`);
      }

      updateApiStatusUI('success', 'API 連線正常', detailParts.join('｜'));

      if (manual && typeof currentOptions.onManualSuccess === 'function') {
        currentOptions.onManualSuccess({ result, elapsed, lastCheckedAt });
      }

      return { status: 'success', result, elapsed, lastCheckedAt };
    } catch (error) {
      const errorMessage = error?.message || String(error);
      const detailParts = [`原因：${errorMessage}`];

      if (typeof API_CONFIG !== 'undefined' && API_CONFIG?.baseUrl) {
        detailParts.push(`目前 API URL：${API_CONFIG.baseUrl}`);
      }

      updateApiStatusUI('error', 'API 連線失敗', detailParts.join('｜'));

      if (manual && typeof currentOptions.onManualError === 'function') {
        currentOptions.onManualError(errorMessage, error);
      }

      return { status: 'error', error };
    } finally {
      setApiStatusButtonLoading(false);
    }
  }

  function initializeApiStatusCard(options = {}) {
    currentOptions = { ...DEFAULT_OPTIONS, ...options };

    const initialDetail = currentOptions.initialDetail || buildBaseDetailMessage();
    updateApiStatusUI('idle', currentOptions.initialMessage, initialDetail);

    if (currentOptions.autoAttachButtonHandler) {
      const button = getElement(currentOptions.buttonId);
      if (button) {
        button.addEventListener('click', event => {
          event.preventDefault();
          performApiStatusCheck(true);
        });
      }
    }

    if (currentOptions.exposeGlobal) {
      global.checkApiStatus = manual => performApiStatusCheck(Boolean(manual));
    }

    if (currentOptions.autoCheckOnInit) {
      performApiStatusCheck(false);
    }

    return {
      check: performApiStatusCheck,
      update: updateApiStatusUI,
      getLastChecked: () => lastCheckedAt
    };
  }

  global.initializeApiStatusCard = initializeApiStatusCard;
  global.ApiStatusHelper = {
    init: initializeApiStatusCard,
    check: performApiStatusCheck,
    formatDateTimeForStatus
  };
})(typeof window !== 'undefined' ? window : this);
