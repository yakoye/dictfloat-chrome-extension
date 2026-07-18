(() => {
  const RUNTIME_VERSION = (() => {
    try { return chrome.runtime.getManifest().version; } catch (_) { return '0.5.14'; }
  })();
  // -------------------------------------------------------------------------
  // Single-window ownership guard
  //
  // Chrome can leave older content-script listeners alive after an extension
  // reload. A JS global is not enough to fence those listeners because they
  // may live in another isolated world. The document dataset is shared by all
  // of them, so only the newest token may react to messages or mouse events.
  // -------------------------------------------------------------------------
  try { window.__DICTFLOAT_INSTANCE__?.destroy?.(); } catch (_) {}
  const INSTANCE_TOKEN = `${RUNTIME_VERSION}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
  const ROOT_SELECTOR = '[data-dictfloat-root="true"], [data-dictfloat="true"], #dictfloat-root';
  document.documentElement.dataset.dictfloatRuntimeVersion = RUNTIME_VERSION;
  document.documentElement.dataset.dictfloatInstanceToken = INSTANCE_TOKEN;
  window.__DICTFLOAT_LOADED__ = true;

  const storage = chrome.storage.local;
  let extensionContextInvalidated = false;
  const RECOVERY_SNAPSHOT_KEY = 'dictFloatRecoverySnapshots';
  const RECOVERY_SNAPSHOT_LIMIT = 5;
  const RECOVERY_STORAGE_KEYS = [
    'dictFloatSettings', 'dictFloatEntries', 'dictFloatDictionaries',
    'dictFloatMdictSources', 'dictFloatWudaoSource', 'dictFloatSourceOrder',
    'dictFloatHistory', 'dictFloatPanelPosition', 'dictFloatCollapsedSources'
  ];
  const DEFAULT_SETTINGS = {
    selectionMode: 'bubble',
    fontSize: 12,
    panelWidth: 380,
    theme: 'system',
    onlineLookup: true,
    accent: 'green'
  };

  const state = {
    host: null,
    mount: null,
    panel: null,
    bubble: null,
    visible: false,
    minimized: false,
    query: '',
    returnState: null,
    formReturnState: null,
    view: 'lookup',
    selectedId: null,
    editingId: null,
    settings: { ...DEFAULT_SETTINGS },
    entries: [],
    dictionaries: [],
    mdictSources: [],
    history: [],
    sourceOrder: [],
    collapsedSources: new Set(),
    position: null,
    online: { query: '', status: 'idle', data: null, error: '' },
    wudao: { query: '', status: 'idle', data: null, error: '' },
    mdx: new Map(),
    wudaoSource: { installed: false, enabled: false },
    draftEntry: null,
    cssPromise: null,
    rootPromise: null,
    destroyed: false,
    themeMedia: null,
    themeListener: null,
    dragCleanup: null,
    selectionTimer: null,
    // Keep the lookup bubble out of the active drag path. Showing it while
    // the pointer is still selecting text can intercept a rightward drag.
    selectionPointerActive: false,
    selectionLastPointerAt: 0,
    historyUndo: null
  };

  const instance = { version: RUNTIME_VERSION, token: INSTANCE_TOKEN, destroy: destroyInstance };
  window.__DICTFLOAT_INSTANCE__ = instance;

  function isExtensionContextAvailable() {
    try {
      return !extensionContextInvalidated && !!chrome?.runtime?.id && !!chrome?.storage?.local;
    } catch (_) {
      return false;
    }
  }

  function isContextInvalidatedError(error) {
    const message = String(error?.message || error || '');
    return !isExtensionContextAvailable() || /extension context invalidated|context invalidated|message port closed|receiving end does not exist|could not establish connection/i.test(message);
  }

  function showContextInvalidatedNotice() {
    if (!state.mount?.isConnected) return;
    if (state.mount.querySelector('.dictfloat-context-notice')) return;
    const notice = document.createElement('div');
    notice.className = 'dictfloat-context-notice';
    notice.textContent = 'DictFloat was updated. Refresh this page to continue.';
    notice.style.cssText = [
      'position:fixed', 'left:16px', 'right:16px', 'bottom:16px',
      'z-index:2147483647', 'pointer-events:auto', 'padding:10px 12px',
      'border:1px solid #f0a3c9', 'border-radius:10px', 'background:#fff',
      'color:#2f3a50', 'font:12px/1.4 system-ui,sans-serif',
      'box-shadow:0 8px 24px rgba(20,30,50,.18)', 'text-align:center'
    ].join(';');
    state.mount.append(notice);
  }

  function handleContextInvalidation(error) {
    if (extensionContextInvalidated) return;
    extensionContextInvalidated = true;
    state.selectionTimer && clearTimeout(state.selectionTimer);
    state.selectionTimer = null;
    state.historyUndo?.timer && clearTimeout(state.historyUndo.timer);
    state.historyUndo = null;
    // Do not call Chrome APIs here: they are precisely what just became invalid.
    try { window.removeEventListener('pointerdown', handleSelectionStart, true); } catch (_) {}
    try { window.removeEventListener('mousedown', handleSelectionStart, true); } catch (_) {}
    try { window.removeEventListener('touchstart', handleSelectionStart, true); } catch (_) {}
    try { window.removeEventListener('mouseup', handleSelection, true); } catch (_) {}
    try { window.removeEventListener('pointerup', handleSelection, true); } catch (_) {}
    try { window.removeEventListener('touchend', handleSelection, true); } catch (_) {}
    try { window.removeEventListener('keyup', handleSelectionKeyup, true); } catch (_) {}
    try { document.removeEventListener('selectionchange', handleSelectionChange, true); } catch (_) {}
    try { document.removeEventListener('keydown', handleGlobalKeys, true); } catch (_) {}
    try { state.themeMedia?.removeEventListener?.('change', state.themeListener); } catch (_) {}
    try { state.dragCleanup?.(); } catch (_) {}
    showContextInvalidatedNotice();
    // Expected during extension reload. Keep DevTools clean while making the
    // required recovery action visible to the user.
    void error;
  }

  function handleAsyncError(error) {
    if (isContextInvalidatedError(error)) {
      handleContextInvalidation(error);
      return;
    }
    console.error('DictFloat action failed.', error);
  }

  function guardedAsync(handler) {
    return (...args) => {
      Promise.resolve(handler(...args)).catch(handleAsyncError);
    };
  }

  async function safeStorageGet(keys) {
    if (!isExtensionContextAvailable()) {
      handleContextInvalidation();
      return null;
    }
    try {
      return await storage.get(keys);
    } catch (error) {
      if (isContextInvalidatedError(error)) {
        handleContextInvalidation(error);
        return null;
      }
      throw error;
    }
  }

  async function safeStorageSet(value) {
    if (!isExtensionContextAvailable()) {
      handleContextInvalidation();
      return false;
    }
    try {
      await storage.set(value);
      return true;
    } catch (error) {
      if (isContextInvalidatedError(error)) {
        handleContextInvalidation(error);
        return false;
      }
      throw error;
    }
  }

  async function safeRuntimeSend(message) {
    if (!isExtensionContextAvailable()) {
      handleContextInvalidation();
      return null;
    }
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (isContextInvalidatedError(error)) {
        handleContextInvalidation(error);
        return null;
      }
      throw error;
    }
  }

  function isCurrentInstance() {
    return !extensionContextInvalidated && !state.destroyed && document.documentElement.dataset.dictfloatInstanceToken === INSTANCE_TOKEN;
  }

  function isOwnedHost(node) {
    return !!node && node.getAttribute?.('data-dictfloat-owner') === INSTANCE_TOKEN;
  }

  void init().catch(handleAsyncError);

  async function init() {
    const data = await safeStorageGet([
      'dictFloatEntries',
      'dictFloatDictionaries',
      'dictFloatSettings',
      'dictFloatHistory',
      'dictFloatPanelPosition',
      'dictFloatWudaoSource',
      'dictFloatMdictSources',
      'dictFloatSourceOrder',
      'dictFloatCollapsedSources'
    ]);
    if (!data || !isCurrentInstance()) return;
    state.entries = Array.isArray(data.dictFloatEntries) ? data.dictFloatEntries.map(normalizeEntry) : [];
    state.dictionaries = normalizeDictionaries(data.dictFloatDictionaries);
    state.settings = { ...DEFAULT_SETTINGS, ...(data.dictFloatSettings || {}) };
    state.mdictSources = normalizeMdictSources(data.dictFloatMdictSources);
    state.history = normalizeHistory(data.dictFloatHistory, state.entries);
    state.position = data.dictFloatPanelPosition || null;
    state.wudaoSource = normalizeWudaoSource(data.dictFloatWudaoSource);
    state.sourceOrder = normalizeSourceOrder(data.dictFloatSourceOrder);
    state.collapsedSources = new Set(Array.isArray(data.dictFloatCollapsedSources) ? data.dictFloatCollapsedSources.map(String) : []);

    // Reader-mode extensions may stop mouse events at document level or render
    // their content inside a ShadowRoot / about:blank iframe. Listen from window
    // capture phase first, then use selectionchange and keyboard fallbacks.
    // A bubble must only appear after the selection gesture ends. During an
    // active drag it would sit immediately to the right of the text and can
    // steal the pointer when the user keeps extending the selection.
    window.addEventListener('pointerdown', handleSelectionStart, true);
    window.addEventListener('mousedown', handleSelectionStart, true);
    window.addEventListener('touchstart', handleSelectionStart, true);
    window.addEventListener('mouseup', handleSelection, true);
    window.addEventListener('pointerup', handleSelection, true);
    window.addEventListener('touchend', handleSelection, true);
    window.addEventListener('keyup', handleSelectionKeyup, true);
    document.addEventListener('selectionchange', handleSelectionChange, true);
    document.addEventListener('keydown', handleGlobalKeys, true);
    state.themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
    state.themeListener = () => {
      if (!state.destroyed && state.settings.theme === 'system' && state.host?.isConnected) render();
    };
    state.themeMedia.addEventListener?.('change', state.themeListener);
    try { chrome.runtime.onMessage.addListener(onRuntimeMessage); } catch (error) { handleContextInvalidation(error); return; }
    try { chrome.storage.onChanged.addListener(onStorageChanged); } catch (error) { handleContextInvalidation(error); return; }
    void ensureStyles().catch(handleAsyncError);
    if (state.host?.isConnected) render();
  }

  function onRuntimeMessage(message, _sender, sendResponse) {
    if (!isCurrentInstance()) return;
    if (message?.type === 'DICTFLOAT_PING') {
      sendResponse({ version: RUNTIME_VERSION });
      return;
    }
    if (message?.type === 'DICTFLOAT_REPAIR') {
      void repairWindowHost().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }
    if (message?.type === 'DICTFLOAT_TOGGLE') {
      void toggle().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }
    if (message?.type === 'DICTFLOAT_LOOKUP') {
      void openAndLookup(message.query || '').then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }
  }

  function onStorageChanged(changes, areaName) {
    if (!isCurrentInstance() || areaName !== 'local') return;
    if (changes.dictFloatEntries) state.entries = Array.isArray(changes.dictFloatEntries.newValue) ? changes.dictFloatEntries.newValue.map(normalizeEntry) : [];
    if (changes.dictFloatDictionaries) state.dictionaries = normalizeDictionaries(changes.dictFloatDictionaries.newValue);
    if (changes.dictFloatMdictSources) state.mdictSources = normalizeMdictSources(changes.dictFloatMdictSources.newValue);
    if (changes.dictFloatHistory) state.history = normalizeHistory(changes.dictFloatHistory.newValue, state.entries);
    if (changes.dictFloatSettings) state.settings = { ...DEFAULT_SETTINGS, ...(changes.dictFloatSettings.newValue || {}) };
    if (changes.dictFloatPanelPosition) state.position = changes.dictFloatPanelPosition.newValue || null;
    if (changes.dictFloatWudaoSource) state.wudaoSource = normalizeWudaoSource(changes.dictFloatWudaoSource.newValue);
    if (changes.dictFloatSourceOrder) state.sourceOrder = normalizeSourceOrder(changes.dictFloatSourceOrder.newValue);
    if (changes.dictFloatCollapsedSources) state.collapsedSources = new Set(Array.isArray(changes.dictFloatCollapsedSources.newValue) ? changes.dictFloatCollapsedSources.newValue.map(String) : []);
    if (state.host?.isConnected && (changes.dictFloatEntries || changes.dictFloatDictionaries || changes.dictFloatMdictSources || changes.dictFloatHistory || changes.dictFloatSettings || changes.dictFloatPanelPosition || changes.dictFloatWudaoSource || changes.dictFloatSourceOrder || changes.dictFloatCollapsedSources)) render();
  }

  function destroyInstance() {
    if (state.destroyed) return;
    state.destroyed = true;
    window.removeEventListener('pointerdown', handleSelectionStart, true);
    window.removeEventListener('mousedown', handleSelectionStart, true);
    window.removeEventListener('touchstart', handleSelectionStart, true);
    window.removeEventListener('mouseup', handleSelection, true);
    window.removeEventListener('pointerup', handleSelection, true);
    window.removeEventListener('touchend', handleSelection, true);
    window.removeEventListener('keyup', handleSelectionKeyup, true);
    document.removeEventListener('selectionchange', handleSelectionChange, true);
    document.removeEventListener('keydown', handleGlobalKeys, true);
    if (state.selectionTimer) clearTimeout(state.selectionTimer);
    state.selectionTimer = null;
    if (state.historyUndo?.timer) clearTimeout(state.historyUndo.timer);
    state.historyUndo = null;
    state.themeMedia?.removeEventListener?.('change', state.themeListener);
    try { chrome.runtime.onMessage.removeListener(onRuntimeMessage); } catch (_) {}
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch (_) {}
    state.dragCleanup?.();
    state.dragCleanup = null;
    removeBubble();
    if (state.mount) {
      [...state.mount.children].forEach((node) => hideFromTopLayer(node));
    }
    if (isOwnedHost(state.host)) state.host.remove();
    state.host = null;
    state.mount = null;
    state.panel = null;
    state.visible = false;
    if (window.__DICTFLOAT_INSTANCE__ === instance) delete window.__DICTFLOAT_INSTANCE__;
  }

  async function ensureStyles() {
    if (!state.cssPromise) {
      if (!isExtensionContextAvailable()) {
        handleContextInvalidation();
        return Promise.reject(new Error('Extension context invalidated.'));
      }
      state.cssPromise = fetch(chrome.runtime.getURL('content.css'))
        .then((response) => {
          if (!response.ok) throw new Error('Unable to load DictFloat styles');
          return response.text();
        });
    }
    return state.cssPromise;
  }

  function applyAccent() {
    const accent = ['rose', 'green', 'blue'].includes(state.settings.accent) ? state.settings.accent : 'green';
    if (state.host) state.host.dataset.accent = accent;
  }

  async function ensureRoot(renderOnCreate = false) {
    if (!isCurrentInstance()) return false;
    // Serialize root creation. A toolbar click, a selection bubble and a repair
    // message can otherwise arrive in the same event turn on complex reader pages.
    if (state.rootPromise) return state.rootPromise;
    state.rootPromise = (async () => {
      // Reuse only our own root. Anything else is stale and is removed before
      // the asynchronous stylesheet fetch can create a race.
      if (!isOwnedHost(state.host) || !state.host?.isConnected || !state.mount) {
        document.querySelectorAll(ROOT_SELECTOR).forEach((node) => {
          if (!isOwnedHost(node)) node.remove();
        });
        let host = document.querySelector('#dictfloat-root');
        if (host && !isOwnedHost(host)) {
          host.remove();
          host = null;
        }
        if (!host) {
          host = document.createElement('div');
          host.id = 'dictfloat-root';
          host.setAttribute('data-dictfloat', 'true');
          host.setAttribute('data-dictfloat-root', 'true');
          host.setAttribute('data-dictfloat-owner', INSTANCE_TOKEN);
          document.documentElement.append(host);
        }
        state.host = host;
        state.mount = host.shadowRoot || host.attachShadow({ mode: 'open' });
        if (!state.mount.querySelector('style[data-dictfloat-style="true"]')) {
          const style = document.createElement('style');
          style.setAttribute('data-dictfloat-style', 'true');
          state.mount.append(style);
          try {
            const css = await ensureStyles();
            if (!isCurrentInstance() || !isOwnedHost(host)) return false;
            style.textContent = css;
          } catch (error) {
            style.textContent = ':host{all:initial}';
            console.warn('DictFloat styles could not be loaded.', error);
          }
        }
      }
      if (!isCurrentInstance() || !isOwnedHost(state.host)) return false;
      promoteHost(state.host);
      applyAccent();
      pruneDuplicateRoots();
      if (renderOnCreate) render();
      return true;
    })();
    try {
      return await state.rootPromise;
    } finally {
      state.rootPromise = null;
    }
  }

  function promoteHost(host) {
    if (!host || !host.isConnected) return;
    // Keep the root as the final html child. This matches the stable model used
    // by the user's other floating extensions: fixed positioning + the maximum
    // normal stacking layer, without browser popover positioning.
    host.style.setProperty('all', 'initial', 'important');
    host.style.setProperty('position', 'fixed', 'important');
    host.style.setProperty('inset', '0', 'important');
    host.style.setProperty('display', 'block', 'important');
    host.style.setProperty('visibility', 'visible', 'important');
    host.style.setProperty('opacity', '1', 'important');
    host.style.setProperty('z-index', '2147483647', 'important');
    host.style.setProperty('pointer-events', 'none', 'important');
    host.removeAttribute('popover');
    if (host.parentNode !== document.documentElement || document.documentElement.lastElementChild !== host) {
      document.documentElement.append(host);
    }
  }

  async function repairWindowHost() {
    await ensureRoot(false);
    if (!isCurrentInstance() || !state.host) return;
    promoteHost(state.host);
    pruneDuplicateRoots();
  }

  function showInTopLayer(node) {
    // Manual popovers ignore the panel's fixed coordinates in some Chrome
    // builds and make pointer dragging unreliable. DictFloat intentionally
    // uses the same fixed-root strategy as Quick Note Float / RegCalc64.
    // Remove any legacy popover state left by v0.4.2, then rely on the root's
    // final-DOM position and max normal z-index.
    if (!node) return false;
    hideFromTopLayer(node);
    node.removeAttribute('popover');
    return false;
  }

  function hideFromTopLayer(node) {
    if (!node) return;
    try {
      if (typeof node.hidePopover === 'function' && node.matches?.(':popover-open')) node.hidePopover();
    } catch (_) {}
    try { node.removeAttribute('popover'); } catch (_) {}
  }

  function pruneDuplicateRoots() {
    if (!isCurrentInstance()) return;
    document.querySelectorAll(ROOT_SELECTOR).forEach((node) => {
      if (node !== state.host) node.remove();
    });
  }

  function clearMount() {
    state.dragCleanup?.();
    state.dragCleanup = null;
    if (!state.mount) return;
    [...state.mount.children].forEach((node) => {
      if (node.tagName !== 'STYLE') {
        hideFromTopLayer(node);
        node.remove();
      }
    });
  }

  async function toggle() {
    if (!isCurrentInstance()) return;
    await ensureRoot(false);
    if (!isCurrentInstance()) return;
    if (state.visible && !state.minimized) {
      close();
      return;
    }
    state.visible = true;
    state.minimized = false;
    render();
    focusSearch();
  }

  async function openAndLookup(query) {
    if (!isCurrentInstance()) return;
    await ensureRoot(false);
    if (!isCurrentInstance()) return;
    state.visible = true;
    state.minimized = false;
    lookup(query);
  }

  async function open() {
    if (!isCurrentInstance()) return;
    await ensureRoot(false);
    if (!isCurrentInstance()) return;
    state.visible = true;
    state.minimized = false;
    render();
    focusSearch();
  }

  function close() {
    if (!isCurrentInstance()) return;
    removeBubble();
    state.visible = false;
    state.minimized = false;
    state.panel = null;
    clearMount();
  }

  function render() {
    if (!isCurrentInstance() || !state.mount || !isOwnedHost(state.host)) return;
    promoteHost(state.host);
    pruneDuplicateRoots();
    clearMount();
    state.panel = null;
    if (!state.visible) return;
    const pos = getPosition();
    if (state.minimized) {
      renderMini(pos);
      return;
    }
    const panel = el('section', `dictfloat-panel${isDarkTheme() ? ' dark' : ''}`);
    state.panel = panel;
    panel.style.cssText = `position:fixed;left:${pos.left}px;top:${pos.top}px;width:${panelWidth()}px;font-size:${fontSize()}px;z-index:2147483647;pointer-events:auto;`;
    panel.append(header(), searchBox(), tabs(), content(), footer());
    state.mount.append(panel);
    showInTopLayer(panel);
    makeDraggable(panel, panel.querySelector('.dictfloat-head'));
  }

  function renderMini(pos) {
    const mini = el('div', `dictfloat-mini${isDarkTheme() ? ' dark' : ''}`);
    mini.style.cssText = `position:fixed;left:${pos.left}px;top:${pos.top}px;z-index:2147483647;pointer-events:auto;`;
    mini.append(el('span', 'dictfloat-branddot'), el('span', 'dictfloat-mini-name', 'DictFloat'));
    const restoreButton = el('button', '', '⌃');
    restoreButton.type = 'button';
    restoreButton.title = 'Restore DictFloat';
    restoreButton.setAttribute('aria-label', 'Restore DictFloat');
    restoreButton.addEventListener('click', restore);
    mini.append(restoreButton);
    state.mount.append(mini);
    showInTopLayer(mini);
    makeMiniDraggable(mini);
  }

  function isDarkTheme() {
    if (state.settings.theme === 'dark') return true;
    if (state.settings.theme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function panelWidth() { return clamp(Number(state.settings.panelWidth), 320, 520, 380); }
  function fontSize() { return clamp(Number(state.settings.fontSize), 10, 15, 12); }

  function header() {
    const head = el('header', 'dictfloat-head');
    head.append(el('span', 'dictfloat-branddot'), el('strong', 'dictfloat-title', 'DictFloat'));

    const min = el('button', 'dictfloat-icon-btn', '−');
    min.type = 'button';
    min.title = 'Minimize';
    min.setAttribute('aria-label', 'Minimize DictFloat');
    min.addEventListener('click', minimize);

    const closeButton = el('button', 'dictfloat-icon-btn dictfloat-close', '×');
    closeButton.type = 'button';
    closeButton.title = 'Close';
    closeButton.setAttribute('aria-label', 'Close DictFloat');
    closeButton.addEventListener('click', close);
    head.append(min, closeButton);
    return head;
  }

  function searchBox() {
    const wrap = el('div', 'dictfloat-search-wrap');
    const box = el('div', 'dictfloat-search');
    box.append(el('span', 'dictfloat-search-icon', '⌕'));

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search word, phrase, or term…';
    input.value = state.query;
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Search DictFloat');

    const clear = el('button', 'dictfloat-search-clear', '×');
    clear.type = 'button';
    clear.title = 'Clear search';
    clear.setAttribute('aria-label', 'Clear search');
    clear.hidden = !input.value;

    input.addEventListener('input', () => {
      state.query = input.value;
      state.selectedId = null;
      state.editingId = null;
      state.online = { query: '', status: 'idle', data: null, error: '' };
      state.wudao = { query: '', status: 'idle', data: null, error: '' };
      clear.hidden = !input.value;
      renderContentOnly();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        lookup(input.value);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        clearSearch();
      }
    });
    clear.addEventListener('click', () => {
      clearSearch();
      focusSearch();
    });
    box.append(input, clear);
    wrap.append(box);
    return wrap;
  }

  function clearSearch() {
    state.query = '';
    state.selectedId = null;
    state.editingId = null;
    state.online = { query: '', status: 'idle', data: null, error: '' };
      state.wudao = { query: '', status: 'idle', data: null, error: '' };
    const input = state.mount?.querySelector('.dictfloat-search input');
    if (input) input.value = '';
    renderContentOnly();
  }

  // Small in-panel safety dialog. Used only for destructive operations in the
  // floating window; search × stays immediate because it never deletes data.
  function confirmInPanel(options = {}) {
    if (!state.panel?.isConnected) return Promise.resolve(false);
    state.panel.querySelector('.dictfloat-confirm-layer')?.remove();
    const required = String(options.requireText || '');
    const layer = el('div', 'dictfloat-confirm-layer');
    const card = el('section', 'dictfloat-confirm-card');
    const title = el('strong', 'dictfloat-confirm-title', options.title || 'Confirm change');
    const message = el('div', 'dictfloat-confirm-message', options.message || 'Please review this change before continuing.');
    card.append(title, message);
    const details = Array.isArray(options.details) ? options.details.filter(Boolean) : [];
    if (details.length) {
      const list = el('ul', 'dictfloat-confirm-details');
      details.forEach((item) => list.append(el('li', '', String(item))));
      card.append(list);
    }
    let input = null;
    if (required) {
      const label = el('label', 'dictfloat-confirm-input');
      label.append(document.createTextNode(`Type ${required} to continue.`));
      input = document.createElement('input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      label.append(input);
      card.append(label);
    }
    const actions = el('div', 'dictfloat-confirm-actions');
    const cancel = el('button', '', 'Cancel');
    cancel.type = 'button';
    const approve = el('button', 'dictfloat-confirm-danger', options.confirmLabel || 'Continue');
    approve.type = 'button';
    approve.disabled = !!required;
    actions.append(cancel, approve);
    card.append(actions);
    layer.append(card);
    state.panel.append(layer);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (accepted) => {
        if (settled) return;
        settled = true;
        layer.remove();
        resolve(!!accepted);
      };
      const sync = () => { approve.disabled = required ? input.value.trim() !== required : false; };
      input?.addEventListener('input', sync);
      cancel.addEventListener('click', () => finish(false));
      approve.addEventListener('click', () => { if (!approve.disabled) finish(true); });
      layer.addEventListener('click', (event) => { if (event.target === layer) finish(false); });
      setTimeout(() => (input || approve).focus(), 0);
    });
  }

  async function createContentRecoverySnapshot(label) {
    const data = await safeStorageGet([...RECOVERY_STORAGE_KEYS, RECOVERY_SNAPSHOT_KEY]);
    if (!data) return false;
    const current = Array.isArray(data[RECOVERY_SNAPSHOT_KEY]) ? data[RECOVERY_SNAPSHOT_KEY] : [];
    const snapshot = {
      id: crypto.randomUUID(),
      label: String(label || 'Before a DictFloat change'),
      createdAt: Date.now(),
      data: {
        format: 'dictfloat-backup', version: 1, exportedAt: new Date().toISOString(),
        settings: data.dictFloatSettings || state.settings,
        entries: Array.isArray(data.dictFloatEntries) ? data.dictFloatEntries : state.entries,
        dictionaries: Array.isArray(data.dictFloatDictionaries) ? data.dictFloatDictionaries : state.dictionaries,
        mdictSources: Array.isArray(data.dictFloatMdictSources) ? data.dictFloatMdictSources : state.mdictSources,
        wudaoSource: data.dictFloatWudaoSource || state.wudaoSource,
        sourceOrder: Array.isArray(data.dictFloatSourceOrder) ? data.dictFloatSourceOrder : state.sourceOrder,
        history: Array.isArray(data.dictFloatHistory) ? data.dictFloatHistory : state.history,
        panelPosition: data.dictFloatPanelPosition || state.position,
        collapsedSources: Array.isArray(data.dictFloatCollapsedSources) ? data.dictFloatCollapsedSources : [...state.collapsedSources],
        note: 'Recovery snapshot: local MDX/MDD and Wudao binary files are not copied.'
      }
    };
    const valid = current.filter((item) => item && item.data).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    return await safeStorageSet({ [RECOVERY_SNAPSHOT_KEY]: [snapshot, ...valid].slice(0, RECOVERY_SNAPSHOT_LIMIT) });
  }

  function showHistoryUndo(previousHistory) {
    state.historyUndo?.timer && clearTimeout(state.historyUndo.timer);
    state.panel?.querySelector('.dictfloat-undo-bar')?.remove();
    const bar = el('div', 'dictfloat-undo-bar', 'History cleared.');
    const undo = el('button', '', 'Undo');
    undo.type = 'button';
    const restore = async () => {
      if (!state.historyUndo) return;
      const history = state.historyUndo.history;
      state.historyUndo = null;
      bar.remove();
      state.history = history;
      await safeStorageSet({ dictFloatHistory: history });
      renderContentOnly();
    };
    undo.addEventListener('click', guardedAsync(restore));
    bar.append(undo);
    state.panel?.append(bar);
    const timer = setTimeout(() => {
      if (state.historyUndo?.timer === timer) {
        state.historyUndo = null;
        bar.remove();
      }
    }, 15000);
    state.historyUndo = { history: previousHistory, timer };
  }

  function tabs() {
    const wrap = el('div', 'dictfloat-tabs');
    const items = [['lookup', 'All'], ['history', 'History'], ['add', '+ Add']];
    for (const [id, label] of items) {
      const button = el('button', `dictfloat-tab${state.view === id ? ' active' : ''}`, label);
      button.type = 'button';
      button.addEventListener('click', () => {
        state.view = id;
        state.selectedId = null;
        state.editingId = null;
        state.returnState = null;
        state.draftEntry = null;
        renderContentOnly();
      });
      wrap.append(button);
    }
    return wrap;
  }

  function content() {
    const box = el('main', 'dictfloat-content');
    box.id = 'dictfloat-content';
    fillContent(box);
    return box;
  }

  function footer() {
    const foot = el('footer', 'dictfloat-footer');
    const settingsButton = el('button', '', '⚙ Settings');
    settingsButton.type = 'button';
    settingsButton.addEventListener('click', () => { void safeRuntimeSend({ type: 'DICTFLOAT_OPEN_OPTIONS' }).catch(handleAsyncError); });
    const online = el('button', 'dictfloat-online-toggle', state.settings.onlineLookup ? 'Online: On' : 'Online: Off');
    online.type = 'button';
    online.title = 'Change online lookup in Settings';
    online.addEventListener('click', () => { void safeRuntimeSend({ type: 'DICTFLOAT_OPEN_OPTIONS' }).catch(handleAsyncError); });
    foot.append(settingsButton, el('span', 'grow'), online);
    return foot;
  }

  function renderContentOnly() {
    // Only replace the one existing content region. This keeps the cursor in
    // the search field while typing and still cannot create a second panel.
    if (!isCurrentInstance() || !state.visible || state.minimized) return;
    pruneDuplicateRoots();
    const box = state.mount?.querySelector('#dictfloat-content');
    if (!box) {
      render();
      return;
    }
    const keepScroll = box.scrollTop;
    fillContent(box);
    updateTabs();
    if (state.view === 'lookup' || state.view === 'history') box.scrollTop = keepScroll;
  }

  function updateTabs() {
    const current = ['lookup', 'history', 'add'];
    state.mount?.querySelectorAll('.dictfloat-tab').forEach((node, index) => node.classList.toggle('active', current[index] === state.view));
  }

  function fillContent(box) {
    box.textContent = '';
    if (state.view === 'add') {
      fillAddForm(box);
      return;
    }
    if (state.view === 'history') {
      fillHistory(box);
      return;
    }

    if (state.editingId) {
      const editing = state.entries.find((item) => item.id === state.editingId);
      if (editing) {
        fillAddForm(box, editing);
        return;
      }
      state.editingId = null;
    }

    if (state.selectedId) {
      const entry = state.entries.find((item) => item.id === state.selectedId);
      if (entry) {
        fillEntry(box, entry);
        return;
      }
      state.selectedId = null;
    }

    if (!state.query.trim()) {
      fillDailyLine(box);
      return;
    }

    appendOrderedLookupSections(box);
  }

  const DAILY_LINES = [
    ['Let one clear thought be enough for this moment.', '此刻，只要有一个清晰的念头就够了。'],
    ['The smallest light still changes the shape of the dark.', '再微小的光，也会改变黑暗的形状。'],
    ['Slow is not stopped; it is a different way of moving forward.', '慢不是停下，而是另一种向前。'],
    ['Leave a little room in the day for a thought to arrive.', '给一天留一点空处，让一个念头抵达。'],
    ['What you tend quietly will grow in its own season.', '你安静照料的事物，会在自己的季节里生长。'],
    ['A good question can be the beginning of a long answer.', '一个好问题，常是一段长答案的开始。'],
    ['The next step becomes visible after the first calm breath.', '先平静地呼吸一次，下一步才会显现。'],
    ['Keep the mind open, and the road keeps unfolding.', '心保持打开，路便会继续展开。'],
    ['Precision begins with noticing what is already here.', '精确，始于看见眼前已经存在的事物。'],
    ['A quiet page can hold a very large future.', '安静的一页，也能容纳很大的未来。'],
    ['Build slowly enough to understand what you are building.', '造得慢一点，才更懂自己正在造什么。'],
    ['The day does not need to be perfect to be meaningful.', '一天不必完美，依然可以有意义。'],
    ['Small proof is often stronger than a loud promise.', '微小的证据，常比响亮的承诺更有力量。'],
    ['Read carefully; the world often hides in one word.', '认真阅读，世界常藏在一个词里。']
  ];

  function fillDailyLine(box) {
    const dayNumber = Math.floor(Date.now() / 86400000);
    const [english, chinese] = DAILY_LINES[dayNumber % DAILY_LINES.length];
    const card = el('section', 'dictfloat-daily-line');
    card.append(el('div', 'dictfloat-daily-en', english));
    card.append(el('div', 'dictfloat-daily-zh', chinese));
    box.append(card);
  }

  function appendOrderedLookupSections(box) {
    const query = state.query.trim();
    let appended = 0;
    for (const source of orderedLookupSources()) {
      if (source.kind === 'glossary') {
        const entries = queryEntriesForDictionary(query, source.id);
        if (entries.length) {
          appendGlossarySection(box, source, entries);
          appended += 1;
        }
        continue;
      }
      if (source.kind === 'wudao') {
        appended += appendWudaoSection(box, source) ? 1 : 0;
        continue;
      }
      if (source.kind === 'mdx') {
        appended += appendMdictSection(box, source) ? 1 : 0;
        continue;
      }
      if (source.kind === 'online') {
        appended += appendOnlineSection(box, source) ? 1 : 0;
      }
    }
    // Keep an empty result area quiet. The search field and source list already
    // explain the action; a second generic ‘no result’ message is visual noise.
  }

  function appendGlossarySection(box, source, entries) {
    // A multi-match list is grouped by its dictionary once. Repeating the
    // typed query in the header adds noise, so the header becomes
    // “DictFloat Glossary · 5 matches”; each row then carries the real term.
    const primary = selectPrimaryGlossaryEntry(entries, state.query);
    const multiple = entries.length > 1;
    const section = createSourceSection({
      key: source.key,
      term: multiple ? source.name : (primary?.term || state.query),
      detail: multiple ? `${entries.length} matches` : '',
      badge: multiple ? '' : source.name,
      tone: 'local'
    });
    if (entries.length === 1 && primary) section.body.append(glossaryPreviewItem(primary));
    else entries.forEach((entry) => section.body.append(resultItem(entry, { showSource: false })));
    box.append(section.node);
  }

  function selectPrimaryGlossaryEntry(entries, rawQuery) {
    const query = String(rawQuery || '').trim().toLocaleLowerCase();
    return entries.find((entry) => String(entry.term || '').trim().toLocaleLowerCase() === query) || entries[0] || null;
  }

  function primaryAlias(entry) {
    return String(entry?.aliases?.[0] || '').trim();
  }

  function glossaryPreviewItem(entry) {
    const item = el('article', 'dictfloat-glossary-preview');
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.title = 'Open and edit this glossary entry';

    // Keep the compact preview to two information lines: Chinese first,
    // then one representative alias. Full aliases remain available in detail.
    if (entry.chinese) item.append(el('div', 'dictfloat-preview-chinese', entry.chinese));
    const alias = primaryAlias(entry);
    if (alias) item.append(el('div', 'dictfloat-preview-alias', alias));
    if (entry.definition) item.append(el('div', 'dictfloat-glossary-preview-definition', entry.definition));

    const open = () => showEntry(entry);
    item.addEventListener('click', open);
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
    return item;
  }

  function createSourceSection({ key, term, detail = '', badge = '', tone = '', onSave = null }) {
    const collapsed = state.collapsedSources.has(key);
    const section = el('section', `dictfloat-source-section${collapsed ? ' collapsed' : ''}${tone ? ` ${tone}` : ''}`);
    // The source header is deliberately a single row rather than nested buttons:
    // this lets the compact save icon sit immediately before the dictionary name.
    const header = el('div', 'dictfloat-source-header');
    header.tabIndex = 0;
    header.setAttribute('role', 'button');
    header.setAttribute('aria-expanded', String(!collapsed));
    header.title = collapsed ? 'Expand dictionary result' : 'Collapse dictionary result';

    const left = el('span', 'dictfloat-source-left');
    left.append(el('span', 'dictfloat-source-term', term));
    if (detail) left.append(el('span', 'dictfloat-source-detail', detail));
    const badgeNode = badge ? el('span', 'dictfloat-source-badge', badge) : null;
    const chevron = el('span', 'dictfloat-source-chevron', collapsed ? '›' : '⌄');
    header.append(left);

    if (typeof onSave === 'function') {
      const save = el('button', 'dictfloat-source-save', '+');
      save.type = 'button';
      save.title = 'Save to my glossary';
      save.setAttribute('aria-label', 'Save to my glossary');
      save.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onSave();
      });
      header.append(save);
    }

    if (badgeNode) header.append(badgeNode);
    header.append(chevron);
    const toggle = () => { void toggleSourceCollapse(key).catch(handleAsyncError); };
    header.addEventListener('click', (event) => {
      if (event.target.closest('.dictfloat-source-save')) return;
      toggle();
    });
    header.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
    });

    const body = el('div', 'dictfloat-source-body');
    body.hidden = collapsed;
    section.append(header, body);
    return { node: section, body };
  }

  async function toggleSourceCollapse(key) {
    const stringKey = String(key);
    if (state.collapsedSources.has(stringKey)) state.collapsedSources.delete(stringKey);
    else state.collapsedSources.add(stringKey);
    await safeStorageSet({ dictFloatCollapsedSources: [...state.collapsedSources] });
    renderContentOnly();
  }

  function resultItem(entry, { showSource = true } = {}) {
    const item = el('article', 'dictfloat-result-item');
    item.tabIndex = 0;
    item.setAttribute('role', 'button');

    // Search results use a predictable two-line reading order:
    // term + Chinese on line one, then one primary alias below.
    const topLine = el('div', 'dictfloat-result-topline');
    topLine.append(el('span', 'dictfloat-result-title', entry.term));
    if (entry.chinese) topLine.append(el('span', 'dictfloat-result-chinese', entry.chinese));
    item.append(topLine);

    const alias = primaryAlias(entry);
    if (alias) item.append(el('div', 'dictfloat-result-aliases', alias));

    if (showSource) {
      const dictionary = dictionaryFor(entry.dictionaryId);
      item.append(el('div', 'dictfloat-result-source', dictionary?.name || 'Local glossary'));
    }
    const openItem = () => showEntry(entry);
    item.addEventListener('click', openItem);
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openItem();
      }
    });
    return item;
  }

  function showEntry(entry) {
    // Preserve the exact list the user came from, including History and its
    // scroll position. Return restores this state in the same panel.
    if (!state.selectedId) {
      const contentNode = state.mount?.querySelector('#dictfloat-content');
      state.returnState = {
        view: state.view === 'history' ? 'history' : 'lookup',
        query: state.query,
        scrollTop: Number(contentNode?.scrollTop || 0)
      };
    }
    state.view = 'lookup';
    state.editingId = null;
    state.selectedId = entry.id;
    state.query = entry.term;
    state.draftEntry = null;
    void addHistoryQuery(entry.term).catch(handleAsyncError);
    render();
  }

  function returnToPreviousView() {
    const previous = state.returnState || { view: 'lookup', query: '', scrollTop: 0 };
    state.view = previous.view;
    state.query = previous.query;
    state.selectedId = null;
    state.editingId = null;
    state.draftEntry = null;
    state.returnState = null;
    render();
    requestAnimationFrame(() => {
      const contentNode = state.mount?.querySelector('#dictfloat-content');
      if (contentNode) contentNode.scrollTop = previous.scrollTop || 0;
    });
  }

  function fillEntry(box, entry) {
    const row = el('div', 'dictfloat-term-row');
    row.append(el('div', 'dictfloat-term', entry.term));
    const star = el('button', `dictfloat-star${entry.favorite ? ' on' : ''}`, entry.favorite ? '★' : '☆');
    star.type = 'button';
    star.title = entry.favorite ? 'Remove favorite' : 'Favorite';
    star.addEventListener('click', guardedAsync(async () => {
      entry.favorite = !entry.favorite;
      await saveEntries();
      renderContentOnly();
    }));
    row.append(star);
    box.append(row);

    const dictionary = dictionaryFor(entry.dictionaryId);
    const fields = el('div', 'dictfloat-entry-fields');
    // Definition-facing facts first. Source bookkeeping is deliberately moved
    // below the content so it does not interrupt reading.
    if (entry.chinese) fields.append(el('div', 'dictfloat-entry-chinese', entry.chinese));
    if (entry.aliases?.length) fields.append(el('div', 'dictfloat-entry-aliases', entry.aliases.join(' · ')));
    if (fields.childNodes.length) box.append(fields);

    box.append(el('div', 'dictfloat-definition', entry.definition || 'No definition yet.'));

    appendEntryTags(box, entry.tags || []);
    if (entry.related?.length) {
      const related = el('div', 'dictfloat-related');
      entry.related.forEach((term) => {
        const button = el('button', '', term);
        button.type = 'button';
        button.title = `Look up ${term}`;
        button.addEventListener('click', () => lookup(term));
        related.append(button);
      });
      box.append(related);
    }

    const provenance = entryProvenance(entry, dictionary);
    if (provenance) box.append(el('div', 'dictfloat-entry-provenance', provenance));
    box.append(el('div', 'dictfloat-divider'));

    const actions = el('div', 'dictfloat-entry-actions');
    const back = el('button', '', '← Return');
    back.type = 'button';
    back.title = 'Return to results';
    back.addEventListener('click', returnToPreviousView);
    const edit = el('button', '', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => openEdit(entry));
    actions.append(back, el('span', 'grow'), edit);
    box.append(actions);
  }

  function appendEntryTags(box, tags) {
    const safeTags = Array.isArray(tags) ? tags.filter(Boolean).map(String) : [];
    if (!safeTags.length) return;
    const wrap = el('div', 'dictfloat-tags');
    const initialCount = 2;
    safeTags.slice(0, initialCount).forEach((tag) => wrap.append(el('span', 'dictfloat-tag', tag)));
    if (safeTags.length > initialCount) {
      const more = el('button', 'dictfloat-tag dictfloat-tag-more', `+${safeTags.length - initialCount}`);
      more.type = 'button';
      more.title = safeTags.slice(initialCount).join(' · ');
      more.addEventListener('click', () => {
        safeTags.slice(initialCount).forEach((tag) => wrap.insertBefore(el('span', 'dictfloat-tag', tag), more));
        more.remove();
      });
      wrap.append(more);
    }
    box.append(wrap);
  }

  function entryProvenance(entry, dictionary) {
    const parts = [dictionary?.name || 'Local glossary'];
    if (entry.category) parts.push(entry.category);
    if (dictionary?.builtIn) parts.push('Built-in');
    else if (dictionary?.locallyEditable) parts.push('Local');
    const source = String(entry.source || '').trim();
    // “DictFloat starter glossary” only repeats Built-in; omit it.
    if (source && !/^dictfloat starter glossary$/i.test(source) && !parts.includes(source)) parts.push(source);
    return parts.filter(Boolean).join(' · ');
  }

  function openEdit(entry) {
    state.formReturnState = { selectedId: entry.id, query: state.query, returnState: state.returnState };
    state.view = 'lookup';
    state.selectedId = null;
    state.editingId = entry.id;
    state.draftEntry = null;
    renderContentOnly();
  }

  function appendWudaoSection(box, source = { key: 'wudao', name: 'Wudao · Offline' }) {
    const lookup = state.wudao;
    if (!state.query.trim() || !state.wudaoSource.installed || !state.wudaoSource.enabled || lookup.query !== state.query.trim()) return false;
    const data = lookup.data || {};
    const section = createSourceSection({
      key: source.key,
      term: data.term || state.query,
      detail: formatWudaoPhonetic(data.phonetic || ''),
      badge: 'Wudao · Offline',
      tone: 'wudao',
      onSave: lookup.status === 'done' && lookup.data ? () => {
        state.draftEntry = wudaoToDraft(data);
        state.editingId = null;
        state.selectedId = null;
        state.view = 'add';
        renderContentOnly();
      } : null
    });

    if (lookup.status === 'loading') section.body.append(el('div', 'dictfloat-wudao-status', 'Searching Wudao offline…'));
    else if (lookup.status === 'error') {
      const status = el('div', 'dictfloat-wudao-status', 'Wudao offline lookup is unavailable.');
      status.title = lookup.error || '';
      section.body.append(status);
    } else if (lookup.status === 'done' && lookup.data) {
      if (data.definitions?.length) {
        const definitions = el('div', 'dictfloat-wudao-definitions');
        data.definitions.slice(0, 8).forEach((definition) => definitions.append(el('div', 'dictfloat-wudao-definition', definition)));
        section.body.append(definitions);
      }
      if (data.examples?.length) {
        const examples = el('div', 'dictfloat-wudao-examples');
        data.examples.slice(0, 2).forEach((example) => examples.append(el('div', 'dictfloat-wudao-example', example)));
        section.body.append(examples);
      }
      if (!data.definitions?.length) section.body.append(el('div', 'dictfloat-wudao-status', 'No offline definition was returned for this query.'));
    }
    box.append(section.node);
    return true;
  }

  function appendMdictSection(box, source) {
    const lookup = state.mdx.get(source.id);
    if (!state.query.trim() || !lookup || lookup.query !== state.query.trim()) return false;
    if (lookup.status === 'done' && !lookup.data) return false;
    const data = lookup.data || {};
    const section = createSourceSection({
      key: source.key,
      term: data.term || state.query,
      detail: data.phonetic || '',
      badge: source.name,
      tone: 'mdx',
      onSave: lookup.status === 'done' && data.definitions?.length ? () => {
        state.draftEntry = mdictToDraft(data, source.name);
        state.editingId = null;
        state.selectedId = null;
        state.view = 'add';
        renderContentOnly();
      } : null
    });
    if (lookup.status === 'loading') {
      section.body.append(el('div', 'dictfloat-online-status', 'Searching linked MDX…'));
    } else if (lookup.status === 'error') {
      const status = el('div', 'dictfloat-online-status', /access confirmation|required/i.test(String(lookup.error || '')) ? 'MDX access confirmation required.' : 'MDX file needs locating.');
      status.title = lookup.error || '';
      const action = el('button', 'dictfloat-mdx-reconnect', 'Settings');
      action.type = 'button';
      action.title = 'Open Settings and restore the linked dictionary connection';
      action.addEventListener('click', () => { void safeRuntimeSend({ type: 'DICTFLOAT_OPEN_OPTIONS' }).catch(handleAsyncError); });
      const line = el('div', 'dictfloat-mdx-error-line');
      line.append(status, action);
      section.body.append(line);
    } else if (lookup.status === 'done' && data.definitions?.length) {
      const scopeId = `dictfloat-mdx-${String(source.id).replace(/[^a-z0-9_-]/gi, '')}`;
      const darkReadable = isDarkTheme();
      const definition = el('div', `dictfloat-mdx-html${darkReadable ? ' dictfloat-mdx-dark-readable' : ''}`);
      definition.id = scopeId;
      if (data.stylesheet && source.cssMode !== 'compact') {
        const style = document.createElement('style');
        style.textContent = scopeMdictCss(data.stylesheet, `#${scopeId}`, darkReadable);
        section.node.append(style);
      }
      if (darkReadable) {
        const readableStyle = document.createElement('style');
        readableStyle.textContent = mdictDarkReadableCss(`#${scopeId}`);
        section.node.append(readableStyle);
      }
      data.definitions.slice(0, 4).forEach((item, index) => {
        if (index > 0) definition.append(el('div', 'dictfloat-mdx-duplicate-term', item.term || data.term));
        definition.append(safeMdictHtml(item.definition, darkReadable));
      });
      section.body.append(definition);
    }
    box.append(section.node);
    return true;
  }

  function safeMdictHtml(raw, darkReadable = false) {
    const output = document.createElement('div');
    let source = String(raw || '');
    // Some dictionaries encode line-based text rather than semantic HTML.
    // Preserve those line breaks before DOMParser would collapse them.
    if (!/<(?:br|p|div|li|table|tr|ol|ul|h[1-6])\b/i.test(source)) source = source.replace(/\r?\n/g, '<br>');
    const doc = new DOMParser().parseFromString(source, 'text/html');
    doc.querySelectorAll('script,style,link,iframe,frame,object,embed,form,input,button,video,audio,source,img,svg,canvas').forEach((node) => node.remove());
    doc.querySelectorAll('*').forEach((node) => {
      [...node.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const rawValue = String(attr.value || '').trim();
        const value = rawValue.toLowerCase();
        if (name === 'style') {
          const safeStyle = safeMdictInlineStyle(rawValue, darkReadable);
          if (safeStyle) node.setAttribute('style', safeStyle);
          else node.removeAttribute(attr.name);
          return;
        }
        // Older MDX skins often use <font color> and bgcolor attributes rather
        // than CSS. In dark mode retain their hue, but remap it into a readable
        // palette instead of letting black ink or white paper leak through.
        if (darkReadable && name === 'color') {
          const adapted = adaptMdictColorForDark(rawValue, 'text');
          if (adapted) node.style.color = adapted;
          node.removeAttribute(attr.name);
          return;
        }
        if (darkReadable && name === 'bgcolor') {
          const adapted = adaptMdictColorForDark(rawValue, 'background');
          if (adapted) node.style.backgroundColor = adapted;
          node.removeAttribute(attr.name);
          return;
        }
        if (name.startsWith('on') || name === 'src' || name === 'href' || value.startsWith('javascript:')) node.removeAttribute(attr.name);
      });
    });
    const fragment = document.createDocumentFragment();
    while (doc.body.firstChild) fragment.append(doc.body.firstChild);
    output.append(fragment);
    if (!output.textContent.trim()) output.textContent = String(raw || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return output;
  }

  function safeMdictInlineStyle(raw, darkReadable = false) {
    const allowed = new Set([
      'color', 'background', 'background-color', 'font-weight', 'font-style', 'font-size',
      'line-height', 'text-decoration', 'text-align', 'vertical-align',
      'white-space', 'margin', 'margin-left', 'margin-right', 'margin-top',
      'margin-bottom', 'padding', 'padding-left', 'padding-right', 'padding-top',
      'padding-bottom', 'border', 'border-left', 'border-right', 'border-top',
      'border-bottom', 'border-color', 'border-style', 'border-width',
      'display', 'float', 'clear', 'list-style', 'list-style-type', 'text-indent'
    ]);
    const output = [];
    for (const declaration of String(raw || '').split(';')) {
      const separator = declaration.indexOf(':');
      if (separator < 1) continue;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      if (!allowed.has(property) || !value) continue;
      if (/url\s*\(|expression\s*\(|@import|javascript:/i.test(value)) continue;
      if (property === 'display' && /^(?:none|contents)$/i.test(value)) continue;
      if (darkReadable && property === 'text-shadow') continue;
      if (darkReadable && property === 'color') {
        const adapted = adaptMdictColorForDark(value, 'text');
        if (adapted) output.push(`${property}:${adapted}`);
        continue;
      }
      if (darkReadable && /^(?:background|background-color)$/i.test(property)) {
        const adapted = adaptMdictColorForDark(value, 'background');
        if (adapted) output.push(`${property}:${adapted}`);
        continue;
      }
      output.push(`${property}:${value}`);
    }
    return output.join(';');
  }

  function scopeMdictCss(raw, scope, darkReadable = false) {
    // CSS is never executed; this conservative transformer keeps ordinary
    // typography/class rules but removes external imports, URLs, fonts and
    // layout escape hatches. Every selector is rooted at this result only.
    let css = String(raw || '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@(?:import|charset|namespace)\s+[^;]+;/gi, '')
      .replace(/@font-face\s*\{[\s\S]*?\}/gi, '')
      .replace(/@(?:media|supports|keyframes)[^{]*\{[\s\S]*?\}\s*\}/gi, '')
      .replace(/url\s*\([^)]*\)/gi, 'none');
    const rules = [];
    for (const part of css.split('}')) {
      const brace = part.indexOf('{');
      if (brace < 0) continue;
      const selectorText = part.slice(0, brace).trim();
      if (!selectorText || selectorText.startsWith('@')) continue;
      let declarations = part.slice(brace + 1)
        .replace(/(?:^|;)\s*(?:position\s*:\s*(?:fixed|sticky)|z-index\s*:[^;]*|behavior\s*:[^;]*|filter\s*:[^;]*|animation[^;]*|transition[^;]*)/gi, ';');
      if (darkReadable) declarations = adaptMdictCssDeclarationsForDark(declarations);
      if (!declarations.trim()) continue;
      const selectors = selectorText.split(',').map((selector) => {
        let normalized = selector.trim();
        if (!normalized) return '';
        normalized = normalized.replace(/\b(?:html|body)\b/gi, scope);
        if (normalized === '*') return `${scope} *`;
        if (normalized.startsWith(scope)) return normalized;
        return `${scope} ${normalized}`;
      }).filter(Boolean);
      if (selectors.length) rules.push(`${selectors.join(',')} {${declarations}}`);
    }
    return rules.join('\n');
  }

  function adaptMdictCssDeclarationsForDark(raw) {
    const out = [];
    for (const declaration of String(raw || '').split(';')) {
      const separator = declaration.indexOf(':');
      if (separator < 1) continue;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      if (!property || !value) continue;
      if (property === 'text-shadow') continue;
      if (property === 'color') {
        const adapted = adaptMdictColorForDark(value, 'text');
        if (adapted) out.push(`${property}:${adapted}`);
        continue;
      }
      if (/^(?:background|background-color)$/i.test(property)) {
        const adapted = adaptMdictColorForDark(value, 'background');
        if (adapted) out.push(`${property}:${adapted}`);
        continue;
      }
      out.push(`${property}:${value}`);
    }
    return out.join(';');
  }

  function adaptMdictColorForDark(raw, role = 'text') {
    const important = /\s*!important\s*$/i.test(String(raw || '')) ? ' !important' : '';
    const rgb = parseMdictCssColor(String(raw || '').replace(/\s*!important\s*$/i, '').trim());
    if (!rgb) return role === 'text' ? `#dbe7f5${important}` : '';
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    if (role === 'background') {
      // Keep the source hue only as a restrained tint: source skins commonly
      // use bright paper fills that become glare in DictFloat dark mode.
      if (hsl.s < 0.10) return `rgba(148,163,184,.10)${important}`;
      const tint = hslToRgb(hsl.h, Math.min(0.72, Math.max(0.42, hsl.s)), 0.56);
      return `rgba(${tint.r},${tint.g},${tint.b},.16)${important}`;
    }
    if (hsl.s < 0.12) {
      const neutral = hsl.l < 0.38 ? '#dbe7f5' : hsl.l > 0.83 ? '#f8fbff' : '#cbd8e8';
      return `${neutral}${important}`;
    }
    const bright = hslToRgb(hsl.h, Math.min(0.84, Math.max(0.46, hsl.s)), Math.min(0.79, Math.max(0.66, hsl.l)));
    return `${rgbToHex(bright.r, bright.g, bright.b)}${important}`;
  }

  function parseMdictCssColor(value) {
    const source = String(value || '').trim().toLowerCase();
    if (!source || /^(?:transparent|inherit|initial|unset|currentcolor|none)$/i.test(source)) return null;
    const named = {
      black: [0, 0, 0], white: [255, 255, 255], gray: [128, 128, 128], grey: [128, 128, 128],
      red: [220, 38, 38], green: [22, 163, 74], blue: [37, 99, 235], navy: [30, 64, 175],
      teal: [13, 148, 136], cyan: [8, 145, 178], aqua: [6, 182, 212], purple: [147, 51, 234],
      magenta: [217, 70, 239], fuchsia: [192, 38, 211], orange: [234, 88, 12], yellow: [202, 138, 4],
      gold: [202, 138, 4], brown: [146, 64, 14], pink: [219, 39, 119], maroon: [185, 28, 28],
      olive: [101, 163, 13], silver: [148, 163, 184]
    };
    if (named[source]) {
      const [r, g, b] = named[source];
      return { r, g, b };
    }
    const hex = source.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
      const raw = hex[1];
      if (raw.length === 3 || raw.length === 4) {
        return { r: parseInt(raw[0] + raw[0], 16), g: parseInt(raw[1] + raw[1], 16), b: parseInt(raw[2] + raw[2], 16) };
      }
      if (raw.length >= 6) return { r: parseInt(raw.slice(0, 2), 16), g: parseInt(raw.slice(2, 4), 16), b: parseInt(raw.slice(4, 6), 16) };
    }
    const rgb = source.match(/^rgba?\(\s*([^,]+),\s*([^,]+),\s*([^,\)]+)(?:,[^\)]*)?\)$/i);
    if (rgb) {
      const channel = (item) => item.includes('%') ? Math.round(Math.max(0, Math.min(100, Number.parseFloat(item))) * 2.55) : Math.round(Math.max(0, Math.min(255, Number.parseFloat(item))));
      return { r: channel(rgb[1]), g: channel(rgb[2]), b: channel(rgb[3]) };
    }
    const hsl = source.match(/^hsla?\(\s*([-+\d.]+)(?:deg)?\s*,\s*([-+\d.]+)%\s*,\s*([-+\d.]+)%(?:\s*,[^\)]*)?\)$/i);
    if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
    return null;
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d) + (g < b ? 6 : 0);
      else if (max === g) h = ((b - r) / d) + 2;
      else h = ((r - g) / d) + 4;
      h *= 60;
    }
    return { h, s, l };
  }

  function hslToRgb(h, s, l) {
    h = ((Number(h) % 360) + 360) % 360;
    const c = (1 - Math.abs((2 * l) - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - (c / 2);
    let rp = 0, gp = 0, bp = 0;
    if (h < 60) [rp, gp, bp] = [c, x, 0];
    else if (h < 120) [rp, gp, bp] = [x, c, 0];
    else if (h < 180) [rp, gp, bp] = [0, c, x];
    else if (h < 240) [rp, gp, bp] = [0, x, c];
    else if (h < 300) [rp, gp, bp] = [x, 0, c];
    else [rp, gp, bp] = [c, 0, x];
    return { r: Math.round((rp + m) * 255), g: Math.round((gp + m) * 255), b: Math.round((bp + m) * 255) };
  }

  function rgbToHex(r, g, b) {
    return `#${[r, g, b].map((item) => Math.max(0, Math.min(255, Math.round(item))).toString(16).padStart(2, '0')).join('')}`;
  }

  function mdictDarkReadableCss(scope) {
    // This comes after an adapted dictionary stylesheet. It only supplies the
    // dark base surface and structural fallback; semantic source hues remain.
    return `
${scope} { color:#e7eef8; background:transparent; text-shadow:none !important; }
${scope} :where(p,div,span,font,li,dd,dt,td,th,em,i,b,strong,a,small,sup,sub) { text-shadow:none !important; border-color:#34445e !important; }
${scope} :where(table,tr,tbody,thead,tfoot,ol,ul) { border-color:#34445e !important; }
${scope} :where(b,strong) { font-weight:750 !important; }
${scope} :where(.pos,.part,.gram,[class*="pos"],[class*="gram"],[class*="wordclass"],[class*="pron"]) { color:#93c5fd !important; }
${scope} :where(.example,.examples,[class*="example"],[class*="examp"],[class*="note"]) { color:#c7d5e8 !important; }
${scope} :where(hr) { border-color:#34445e !important; }
`;
  }

  function mdictToDraft(data, sourceName) {
    const first = data.definitions?.[0] || {};
    const text = mdictText(first.definition || '');
    return {
      term: data.term || state.query,
      aliases: [],
      chinese: '',
      definition: text,
      tags: ['MDX'],
      related: [],
      category: '',
      source: sourceName
    };
  }

  function mdictText(raw) {
    const doc = new DOMParser().parseFromString(String(raw || ''), 'text/html');
    return String(doc.body.textContent || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  }

  function appendOnlineSection(box, source = { key: 'online', name: 'Online' }) {
    const online = state.online;
    if (!state.query.trim() || !state.settings.onlineLookup || online.query !== state.query.trim()) return false;
    const data = online.data || {};
    const section = createSourceSection({
      key: source.key,
      term: data.term || state.query,
      detail: data.phonetic || '',
      badge: 'Online',
      tone: 'online',
      onSave: online.status === 'done' && online.data ? () => {
        state.draftEntry = onlineToDraft(data);
        state.editingId = null;
        state.view = 'add';
        renderContentOnly();
      } : null
    });

    if (online.status === 'loading') section.body.append(el('div', 'dictfloat-online-status', 'Searching online…'));
    else if (online.status === 'error') {
      const status = el('div', 'dictfloat-online-status', 'Online lookup is unavailable right now.');
      status.title = online.error || '';
      section.body.append(status);
    } else if (online.status === 'done' && online.data) {
      if (data.translation) section.body.append(el('div', 'dictfloat-cn', data.translation));
      if (data.definitions?.length) {
        const definitions = el('div', 'dictfloat-online-definitions');
        data.definitions.slice(0, 4).forEach((item) => {
          const line = el('div', 'dictfloat-online-definition');
          if (item.partOfSpeech) line.append(el('span', 'dictfloat-pos', item.partOfSpeech));
          line.append(document.createTextNode(item.definition));
          definitions.append(line);
        });
        section.body.append(definitions);
      }
      if (!data.translation && !data.definitions?.length) section.body.append(el('div', 'dictfloat-online-status', 'No online definition was returned for this query.'));
    }
    box.append(section.node);
    return true;
  }

  function formatWudaoPhonetic(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.split(' · ').map((item) => {
      const clean = item.trim();
      if (!clean) return '';
      return clean.startsWith('[') || clean.startsWith('/') ? clean : `[${clean}]`;
    }).filter(Boolean).join(' · ');
  }

  function fillHistory(box) {
    if (!state.history.length) return;

    // Keep History visually consistent with All: the same clean result rows,
    // not a collection of tag-like chips. Only the timestamp is secondary.
    const head = el('div', 'dictfloat-history-head');
    const clear = el('button', '', 'Clear');
    clear.type = 'button';
    clear.title = 'Clear history';
    clear.setAttribute('aria-label', 'Clear history');
    clear.addEventListener('click', guardedAsync(async () => {
      const count = state.history.length;
      const approved = await confirmInPanel({
        title: 'Clear query history?',
        message: 'This removes recent lookups from DictFloat.',
        details: [
          `${count} ${count === 1 ? 'lookup' : 'lookups'} will be cleared.`,
          'Glossaries, MDX/MDD dictionaries, Wudao, and settings are not affected.',
          'You can undo this change for 15 seconds.'
        ],
        confirmLabel: 'Clear history'
      });
      if (!approved) return;
      const previousHistory = state.history.map((item) => ({ ...item }));
      state.history = [];
      await safeStorageSet({ dictFloatHistory: [] });
      renderContentOnly();
      showHistoryUndo(previousHistory);
    }));
    head.append(clear);
    box.append(head);

    state.history.forEach((item) => {
      const query = String(item.query || '').trim();
      if (!query) return;

      const button = el('button', 'dictfloat-result-item dictfloat-history-item');
      button.type = 'button';
      button.append(el('div', 'dictfloat-result-title', query));
      button.append(el('div', 'dictfloat-result-source dictfloat-history-time', relativeTime(item.at)));
      button.addEventListener('click', () => lookup(query, { fromHistory: true }));
      box.append(button);
    });
  }

  function fillAddForm(box, editing = null) {
    const defaultDictionaryId = defaultWritableDictionaryId();
    const entry = editing || state.draftEntry || {
      term: state.query.trim(),
      aliases: [],
      chinese: '',
      definition: '',
      tags: [],
      related: [],
      category: '',
      source: 'My glossary',
      dictionaryId: defaultDictionaryId
    };
    box.append(el('div', 'dictfloat-meta', editing ? 'Edit entry' : 'Add to a local glossary'));
    const form = el('form', 'dictfloat-add-form');
    const validation = el('div', 'dictfloat-form-message');
    validation.hidden = true;

    const glossaryLabel = el('label', 'full');
    glossaryLabel.append(document.createTextNode('Glossary'));
    const glossary = document.createElement('select');
    glossary.name = 'dictionaryId';
    const choices = editing ? state.dictionaries : writableDictionaries();
    choices.forEach((dictionary) => {
      const option = document.createElement('option');
      option.value = dictionary.id;
      option.textContent = dictionary.name;
      option.selected = dictionary.id === (entry.dictionaryId || defaultDictionaryId);
      glossary.append(option);
    });
    glossaryLabel.append(glossary);
    form.append(glossaryLabel);

    const fields = [
      ['term', 'Term *', 'text', ''],
      ['chinese', 'Chinese', 'text', ''],
      ['aliases', 'Aliases', 'text', 'comma-separated'],
      ['tags', 'Tags', 'text', 'comma-separated'],
      ['related', 'Related terms', 'text', 'comma-separated'],
      ['category', 'Category', 'text', 'PCIe / Firmware / English'],
      ['source', 'Source', 'text', ''],
      ['definition', 'Definition *', 'textarea', '']
    ];
    fields.forEach(([name, label, type, placeholder]) => {
      const field = el('label', name === 'definition' ? 'full' : '');
      field.append(document.createTextNode(label));
      const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
      input.name = name;
      input.placeholder = placeholder;
      input.value = Array.isArray(entry[name]) ? entry[name].join(', ') : (entry[name] || '');
      if (name === 'term' || name === 'definition') input.required = true;
      field.append(input);
      form.append(field);
    });
    form.append(validation);

    const controls = el('div', 'dictfloat-form-controls');
    const cancel = el('button', '', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      state.draftEntry = null;
      state.editingId = null;
      state.view = 'lookup';
      if (editing) {
        const back = state.formReturnState || { selectedId: editing.id, query: editing.term, returnState: state.returnState };
        state.selectedId = back.selectedId;
        state.query = back.query;
        state.returnState = back.returnState || null;
        state.formReturnState = null;
      }
      renderContentOnly();
    });
    const save = el('button', '', editing ? 'Save changes' : 'Save entry');
    save.type = 'submit';
    controls.append(cancel, el('span', 'grow'));
    if (editing) {
      const remove = el('button', 'dictfloat-delete-entry', 'Delete');
      remove.type = 'button';
      remove.addEventListener('click', guardedAsync(async () => {
        const approved = await confirmInPanel({
          title: `Delete “${editing.term}”?`,
          message: 'This removes this editable entry from its glossary.',
          details: ['A small recovery snapshot will be created first.', 'Linked dictionaries and other glossary entries are not affected.'],
          confirmLabel: 'Delete entry'
        });
        if (!approved) return;
        await createContentRecoverySnapshot(`Before deleting entry: ${editing.term}`);
        state.entries = state.entries.filter((item) => item.id !== editing.id);
        state.history = state.history.filter((item) => item.id !== editing.id);
        await safeStorageSet({ dictFloatEntries: state.entries.map(normalizeEntry), dictFloatHistory: state.history });
        state.editingId = null;
        state.selectedId = null;
        state.view = 'lookup';
        renderContentOnly();
      }));
      controls.append(remove);
    }
    controls.append(save);
    form.append(controls);

    form.addEventListener('submit', guardedAsync(async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const term = String(formData.get('term') || '').trim();
      const definition = String(formData.get('definition') || '').trim();
      if (!term || !definition) {
        validation.textContent = 'Term and definition are required.';
        validation.hidden = false;
        return;
      }
      const value = normalizeEntry({
        ...entry,
        id: entry.id || crypto.randomUUID(),
        dictionaryId: String(formData.get('dictionaryId') || defaultDictionaryId),
        term,
        chinese: String(formData.get('chinese') || '').trim(),
        aliases: list(formData.get('aliases')),
        tags: list(formData.get('tags')),
        related: list(formData.get('related')),
        category: String(formData.get('category') || '').trim(),
        source: String(formData.get('source') || '').trim() || 'My glossary',
        definition,
        updatedAt: Date.now()
      });
      if (editing) state.entries = state.entries.map((item) => item.id === editing.id ? value : item);
      else state.entries.unshift(value);
      await saveEntries();
      state.draftEntry = null;
      state.editingId = null;
      state.formReturnState = null;
      state.view = 'lookup';
      state.query = term;
      state.selectedId = value.id;
      renderContentOnly();
    }));
    box.append(form);
  }

  function fillEditForm(box, entry) {
    state.editingId = entry.id;
    fillAddForm(box, entry);
  }

  function lookup(raw, { fromHistory = false } = {}) {
    const query = String(raw || '').trim();
    state.query = query;
    state.view = 'lookup';
    state.selectedId = null;
    state.editingId = null;
    state.draftEntry = null;
    state.returnState = null;
    state.formReturnState = null;
    state.online = { query, status: state.settings.onlineLookup && query ? 'loading' : 'idle', data: null, error: '' };
    state.wudao = { query, status: state.wudaoSource.installed && state.wudaoSource.enabled && query ? 'loading' : 'idle', data: null, error: '' };
    state.mdx = new Map();
    state.mdictSources.filter((source) => source.enabled !== false && source.status === 'ready').forEach((source) => {
      state.mdx.set(source.id, { query, status: 'loading', data: null, error: '' });
    });
    if (query) void addHistoryQuery(query).catch(handleAsyncError);
    render();
    if (state.wudaoSource.installed && state.wudaoSource.enabled && query) void lookupWudao(query).catch(handleAsyncError);
    const mdxSources = state.mdictSources.filter((source) => source.enabled !== false && source.status === 'ready' && query);
    if (mdxSources.length) void lookupMdictInOrder(mdxSources, query).catch(handleAsyncError);
    if (state.settings.onlineLookup && query) void lookupOnline(query).catch(handleAsyncError);
    focusSearch(true);
  }

  async function lookupWudao(query) {
    try {
      const response = await safeRuntimeSend({ type: 'DICTFLOAT_WUDAO_LOOKUP', query });
      if (state.query !== query) return;
      if (!response?.ok) throw new Error(response?.error || 'Wudao lookup failed');
      state.wudao = { query, status: 'done', data: response.data || null, error: '' };
    } catch (error) {
      if (isContextInvalidatedError(error)) { handleContextInvalidation(error); return; }
      if (state.query !== query) return;
      state.wudao = { query, status: 'error', data: null, error: String(error?.message || error) };
    }
    renderContentOnly();
  }

  async function lookupMdictInOrder(sources, query) {
    // The first dictionary in Lookup order gets the disk/CPU budget first.
    // Later dictionaries continue in the background so the primary result is
    // responsive even when several large MDX files are connected.
    for (const source of sources) {
      if (state.query !== query || state.destroyed) return;
      await lookupMdict(source, query);
    }
  }

  async function lookupMdict(source, query) {
    try {
      const response = await safeRuntimeSend({ type: 'DICTFLOAT_MDICT_LOOKUP', source, query });
      if (state.query !== query) return;
      if (!response?.ok) throw new Error(response?.error || 'MDX lookup failed');
      state.mdx.set(source.id, { query, status: 'done', data: response.data || null, error: '' });
    } catch (error) {
      if (isContextInvalidatedError(error)) { handleContextInvalidation(error); return; }
      if (state.query !== query) return;
      state.mdx.set(source.id, { query, status: 'error', data: null, error: String(error?.message || error) });
    }
    renderContentOnly();
  }

  async function lookupOnline(query) {
    try {
      const response = await safeRuntimeSend({ type: 'DICTFLOAT_ONLINE_LOOKUP', query });
      if (state.query !== query) return;
      if (!response?.ok) throw new Error(response?.error || 'Online lookup failed');
      state.online = { query, status: 'done', data: response.data || null, error: '' };
    } catch (error) {
      if (isContextInvalidatedError(error)) { handleContextInvalidation(error); return; }
      if (state.query !== query) return;
      state.online = { query, status: 'error', data: null, error: String(error?.message || error) };
    }
    renderContentOnly();
  }

  async function addHistoryQuery(rawQuery) {
    const query = String(rawQuery || '').trim();
    if (!query) return;
    state.history = [{ query, at: Date.now() }, ...state.history.filter((item) => normalize(item.query) !== normalize(query))].slice(0, 50);
    await safeStorageSet({ dictFloatHistory: state.history });
  }

  async function saveEntries() {
    await safeStorageSet({ dictFloatEntries: state.entries.map(normalizeEntry) });
  }

  function queryEntries(raw) {
    const enabled = new Set(state.dictionaries.filter((dictionary) => dictionary.enabled !== false).map((dictionary) => dictionary.id));
    const visible = state.entries.filter((entry) => enabled.has(entry.dictionaryId));
    return scoreEntries(visible, raw);
  }

  function queryEntriesForDictionary(raw, dictionaryId) {
    const dictionary = dictionaryFor(dictionaryId);
    if (!dictionary || dictionary.enabled === false) return [];
    return scoreEntries(state.entries.filter((entry) => entry.dictionaryId === dictionaryId), raw);
  }

  function scoreEntries(entries, raw) {
    const query = normalize(raw);
    if (!query) return entries.filter((entry) => entry.favorite).concat(entries.filter((entry) => !entry.favorite)).slice(0, 20);
    return entries
      .map((entry) => ({ entry, score: score(entry, query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.term.localeCompare(b.entry.term))
      .map((item) => item.entry);
  }

  function knownLookupSources() {
    const local = state.dictionaries.map((dictionary) => ({
      key: `glossary:${dictionary.id}`,
      kind: 'glossary',
      id: dictionary.id,
      name: dictionary.name,
      enabled: dictionary.enabled !== false
    }));
    const sources = [...local];
    if (state.wudaoSource.installed) sources.push({ key: 'wudao', kind: 'wudao', id: 'wudao', name: 'Wudao · Offline', enabled: state.wudaoSource.enabled });
    state.mdictSources.forEach((source) => sources.push({ key: `mdx:${source.id}`, kind: 'mdx', id: source.id, name: source.name, enabled: source.enabled !== false }));
    sources.push({ key: 'online', kind: 'online', id: 'online', name: 'Online', enabled: state.settings.onlineLookup });
    return sources;
  }

  function normalizeSourceOrder(input) {
    const available = knownLookupSources().map((source) => source.key);
    const requested = Array.isArray(input) ? input.map(String) : [];
    return [...requested.filter((key) => available.includes(key)), ...available.filter((key) => !requested.includes(key))];
  }

  function orderedLookupSources() {
    const sourceMap = new Map(knownLookupSources().map((source) => [source.key, source]));
    const order = normalizeSourceOrder(state.sourceOrder);
    if (order.join('|') !== state.sourceOrder.join('|')) state.sourceOrder = order;
    return order.map((key) => sourceMap.get(key)).filter((source) => source && source.enabled !== false);
  }

  function relativeTime(time) {
    const delta = Math.max(0, Date.now() - Number(time || 0));
    if (delta < 60_000) return 'just now';
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
    return `${Math.floor(delta / 86_400_000)}d`;
  }

  function score(entry, query) {
    const term = normalize(entry.term);
    const aliases = (entry.aliases || []).map(normalize);
    const chinese = normalize(entry.chinese);
    const tags = (entry.tags || []).map(normalize);
    const related = (entry.related || []).map(normalize);
    const definition = normalize(entry.definition);
    if (term === query) return 100;
    if (aliases.includes(query)) return 95;
    if (term.startsWith(query)) return 82;
    if (aliases.some((item) => item.startsWith(query))) return 75;
    if (term.includes(query)) return 65;
    if (aliases.some((item) => item.includes(query))) return 58;
    if (chinese.includes(query)) return 52;
    if (related.some((item) => item.includes(query))) return 46;
    if (tags.some((item) => item.includes(query))) return 42;
    if (definition.includes(query)) return 20;
    return 0;
  }

  function normalizeHistory(input, entries) {
    const seen = new Set();
    const resolved = [];
    for (const item of Array.isArray(input) ? input : []) {
      const legacy = item?.id ? entries.find((entry) => entry.id === item.id)?.term : '';
      const query = String(item?.query || legacy || '').trim();
      const key = normalize(query);
      if (!query || seen.has(key)) continue;
      seen.add(key);
      resolved.push({ query, at: Number(item?.at || Date.now()) });
    }
    return resolved.slice(0, 50);
  }

  function normalizeMdictSources(input) {
    return Array.isArray(input) ? input.filter(Boolean).map((source) => ({
      id: String(source.id || crypto.randomUUID()),
      name: String(source.name || source.fileName || 'Untitled MDX dictionary'),
      enabled: source.enabled !== false,
      status: ['ready','access','missing','changed','rebuilding'].includes(source.status) ? source.status : (source.status === 'reconnect' ? 'missing' : (Number(source.recordCount || 0) > 0 ? 'ready' : 'missing')),
      parser: String(source.parser || ''),
      fileName: String(source.fileName || ''),
      fileSize: Number(source.fileSize || 0),
      recordCount: Number(source.recordCount || 0),
      cssMode: source.cssMode === 'compact' ? 'compact' : 'safe-original',
      lookup: {
        caseSensitive: source.lookup?.caseSensitive === true,
        stripKey: source.lookup?.stripKey !== false
      },
      mddFiles: Array.isArray(source.mddFiles) ? source.mddFiles : [],
      cssFiles: Array.isArray(source.cssFiles) ? source.cssFiles : []
    })) : [];
  }

  function normalizeWudaoSource(source) {
    const input = source && typeof source === 'object' ? source : {};
    const installed = !!input.installed;
    return {
      installed,
      configured: !!input.configured || installed || !!input.needsReconnect,
      needsReconnect: !!input.needsReconnect && !installed,
      name: String(input.name || 'Wudao · Offline'),
      enabled: input.enabled !== false && installed,
      totalSize: Number(input.totalSize || 0),
      recordCounts: input.recordCounts || { en: 0, zh: 0 }
    };
  }

  function normalizeDictionaries(input) {
    const source = Array.isArray(input) ? input : [];
    const mapped = source.filter(Boolean).map((item) => ({ id:String(item.id || crypto.randomUUID()), name:String(item.name || 'Untitled glossary').trim() || 'Untitled glossary', enabled:item.enabled !== false, builtIn:!!item.builtIn, locallyEditable:item.locallyEditable === true || String(item.id||'')==='pcie-starter', sourceKind:String(item.sourceKind || (item.builtIn?'built-in':'manual')), fileName:String(item.fileName||''), createdAt:Number(item.createdAt||Date.now()) }));
    const starter=mapped.find((dictionary)=>dictionary.id==='pcie-starter');
    if(!starter) mapped.unshift({id:'pcie-starter',name:'DictFloat Glossary',enabled:true,builtIn:true,locallyEditable:true,sourceKind:'built-in',createdAt:0});
    else { if(starter.name==='PCIe Starter')starter.name='DictFloat Glossary'; starter.builtIn=true;starter.locallyEditable=true; }
    return mapped.filter((dictionary)=>!(dictionary.id==='my-glossary' && !state.entries.some((entry)=>entry.dictionaryId==='my-glossary')));
  }

  function normalizeEntry(entry) {
    return {
      id: entry.id || crypto.randomUUID(),
      dictionaryId: String(entry.dictionaryId || inferDictionaryId(entry)),
      term: String(entry.term || '').trim(),
      aliases: Array.isArray(entry.aliases) ? entry.aliases : list(entry.aliases),
      chinese: String(entry.chinese || '').trim(),
      definition: String(entry.definition || '').trim(),
      tags: Array.isArray(entry.tags) ? entry.tags : list(entry.tags),
      related: Array.isArray(entry.related) ? entry.related : list(entry.related),
      category: String(entry.category || '').trim(),
      source: String(entry.source || '').trim(),
      favorite: !!entry.favorite,
      updatedAt: entry.updatedAt || Date.now()
    };
  }

  function inferDictionaryId(entry) {
    return String(entry?.source || '').includes('DictFloat starter') ? 'pcie-starter' : 'my-glossary';
  }
  function dictionaryFor(id) { return state.dictionaries.find((dictionary) => dictionary.id === id) || null; }
  function writableDictionaries() {
    const writable = state.dictionaries.filter((dictionary) => !dictionary.builtIn);
    return writable.length ? writable : state.dictionaries;
  }
  function defaultWritableDictionaryId() {
    return writableDictionaries().find((dictionary) => dictionary.enabled !== false)?.id || writableDictionaries()[0]?.id || 'my-glossary';
  }

  function cloneForGlossary(entry) {
    return {
      ...normalizeEntry(entry),
      id: undefined,
      dictionaryId: defaultWritableDictionaryId(),
      source: `Copied from ${dictionaryFor(entry.dictionaryId)?.name || 'local glossary'}`,
      favorite: false,
      updatedAt: Date.now()
    };
  }
  function wudaoToDraft(data) {
    return {
      dictionaryId: defaultWritableDictionaryId(),
      term: data.term || state.query.trim(),
      aliases: [],
      chinese: '',
      definition: (data.definitions || []).slice(0, 6).join('\n'),
      tags: ['Wudao'],
      related: [],
      category: '',
      source: data.provider || 'Wudao offline dictionary'
    };
  }
  function onlineToDraft(data) {
    const definition = (data.definitions || []).slice(0, 3).map((item) => item.definition).filter(Boolean).join('\n') || data.translation || '';
    return {
      dictionaryId: defaultWritableDictionaryId(),
      term: data.term || state.query.trim(),
      aliases: [],
      chinese: data.translation || '',
      definition,
      tags: [],
      related: [],
      category: '',
      source: data.providers?.join(' + ') || 'Online lookup'
    };
  }
  // Selection handling deliberately has several entry points. Some reader-mode
  // extensions intercept mouseup at document level, while others render the
  // reading copy in an open ShadowRoot or an about:blank frame. Window-capture
  // receives composed pointer events before a reader can stop them; selection-
  // change and keyboard paths cover drag selection and Shift+Arrow selection.
  function handleSelectionStart(event) {
    if (!isCurrentInstance() || eventIsFromDictFloat(event)) return;
    state.selectionPointerActive = true;
    state.selectionLastPointerAt = Date.now();
    // Never leave a clickable element inside the path of a new selection.
    removeBubble();
  }

  function handleSelection(event) {
    if (!isCurrentInstance() || eventIsFromDictFloat(event)) return;
    state.selectionPointerActive = false;
    state.selectionLastPointerAt = Date.now();
    // Let the browser settle the final Range before calculating its anchor.
    scheduleSelectionCheck(event, 70);
  }

  function handleSelectionKeyup(event) {
    if (!isCurrentInstance() || eventIsFromDictFloat(event)) return;
    if (event.key === 'Shift' || event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
      // Keyboard selection has no pointer drag, so a short settle delay is enough.
      scheduleSelectionCheck(event, 80);
    }
  }

  function handleSelectionChange(event) {
    if (!isCurrentInstance()) return;
    // Do not show a bubble halfway through a mouse/touch drag. This is the
    // source of the rightward-selection stutter seen on dense reading pages.
    if (state.selectionPointerActive) return;
    scheduleSelectionCheck(event, 140);
  }

  function eventIsFromDictFloat(event) {
    const path = event?.composedPath?.() || [];
    return path.includes(state.host) || path.includes(state.panel) || path.includes(state.bubble);
  }

  function scheduleSelectionCheck(event, delay = 40) {
    if (state.selectionTimer) clearTimeout(state.selectionTimer);
    const contextNode = selectionContextNode(event);
    state.selectionTimer = setTimeout(() => {
      state.selectionTimer = null;
      inspectSelection(contextNode);
    }, delay);
  }

  function selectionContextNode(event) {
    const path = event?.composedPath?.();
    if (Array.isArray(path) && path.length) {
      return path.find((node) => node && node.nodeType === Node.ELEMENT_NODE) || null;
    }
    return event?.target?.nodeType === Node.ELEMENT_NODE ? event.target : null;
  }

  function inspectSelection(contextNode) {
    if (!isCurrentInstance()) return;
    // A queued selectionchange can arrive after pointerdown. Keep the bubble
    // hidden until pointerup/touchend has finalized the selection.
    if (state.selectionPointerActive) return;
    const snapshot = getSelectionSnapshot(contextNode);
    const text = snapshot?.text || '';
    if (!text || text.length > 160 || state.settings.selectionMode === 'off') {
      removeBubble();
      return;
    }
    if (!snapshot?.rect || (!snapshot.rect.width && !snapshot.rect.height)) return;
    if (state.settings.selectionMode === 'auto') {
      removeBubble();
      void openAndLookup(text);
      return;
    }
    void showBubble(text, snapshot.rect);
  }

  function getSelectionSnapshot(contextNode) {
    const candidates = [];
    const pushSelection = (selection) => {
      if (!selection || !selection.rangeCount) return;
      const text = String(selection.toString?.() || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      const range = selection.getRangeAt(0);
      const rect = rectForRange(range);
      if (rect) candidates.push({ text, rect });
    };

    // The normal document selection is still the common path.
    pushSelection(window.getSelection?.());
    if (document.getSelection && document.getSelection() !== window.getSelection?.()) pushSelection(document.getSelection());

    // Chrome exposes getSelection() on open ShadowRoots. This catches reader
    // copies that keep their selectable article inside a shadow tree.
    const root = contextNode?.getRootNode?.();
    if (root && root !== document && typeof root.getSelection === 'function') pushSelection(root.getSelection());
    if (contextNode?.shadowRoot && typeof contextNode.shadowRoot.getSelection === 'function') pushSelection(contextNode.shadowRoot.getSelection());

    // Text inputs are not the main reader use case, but this makes the lookup
    // bubble consistent for selected words in editable fields as well.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      const start = Number(active.selectionStart ?? 0);
      const end = Number(active.selectionEnd ?? 0);
      if (end > start) {
        const text = String(active.value || '').slice(start, end).replace(/\s+/g, ' ').trim();
        if (text) candidates.push({ text, rect: active.getBoundingClientRect() });
      }
    }

    return candidates.find((item) => item.rect && (item.rect.width || item.rect.height)) || null;
  }

  function rectForRange(range) {
    if (!range) return null;
    const clientRects = [...(range.getClientRects?.() || [])]
      .filter((item) => Number.isFinite(item?.left) && Number.isFinite(item?.top) && (item.width || item.height));
    // For a multi-line selection, the bubble belongs at the upper-right of the
    // selection block, not next to the final character where a drag may end.
    if (clientRects.length) {
      clientRects.sort((a, b) => (a.top - b.top) || (b.right - a.right));
      return clientRects[0];
    }
    const rect = range.getBoundingClientRect?.();
    if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
    return rect;
  }

  async function showBubble(text, rect) {
    if (!isCurrentInstance()) return;
    await ensureRoot(false);
    removeBubble();

    // Keep the selection trigger deliberately simple: one small round button.
    // Its preferred position is roughly two lines above the selection so it
    // clears webpage copy/edit toolbars; below is only a fallback near the top.
    const bubble = el('button', 'dictfloat-bubble', '⌕');
    bubble.type = 'button';
    bubble.title = `Look up “${text.slice(0, 42)}”`;
    bubble.setAttribute('aria-label', 'Look up selected text');

    const size = 22;
    const position = chooseBubblePosition(rect, size, 8, 8);
    bubble.dataset.anchor = position.anchor;
    bubble.style.cssText = `position:fixed;left:${position.left}px;top:${position.top}px;z-index:2147483647;pointer-events:auto;`;
    bubble.addEventListener('mousedown', (event) => event.preventDefault());
    bubble.addEventListener('click', () => { removeBubble(); void openAndLookup(text); });
    state.mount.append(bubble);
    state.bubble = bubble;
  }

  function chooseBubblePosition(rect, size, gap, edge) {
    const twoLines = 40;
    const sideGap = 10;
    const raw = [
      { anchor: 'above-right', left: rect.right + sideGap, top: rect.top - size - twoLines },
      { anchor: 'above-left', left: rect.left - size - sideGap, top: rect.top - size - twoLines },
      { anchor: 'below-right', left: rect.right + sideGap, top: rect.bottom + twoLines },
      { anchor: 'below-left', left: rect.left - size - sideGap, top: rect.bottom + twoLines }
    ];
    const candidates = raw.map((item) => {
      const overflow = (item.left < edge ? 30 : 0)
        + (item.top < edge ? 30 : 0)
        + (item.left + size > window.innerWidth - edge ? 30 : 0)
        + (item.top + size > window.innerHeight - edge ? 30 : 0);
      return {
        ...item,
        left: Math.min(window.innerWidth - size - edge, Math.max(edge, item.left)),
        top: Math.min(window.innerHeight - size - edge, Math.max(edge, item.top)),
        overflow
      };
    });
    return candidates.sort((a, b) => {
      const aScore = (a.overflow * 100) + bubbleCollisionScore(a, size) + bubbleAnchorPenalty(a, rect);
      const bScore = (b.overflow * 100) + bubbleCollisionScore(b, size) + bubbleAnchorPenalty(b, rect);
      return aScore - bScore;
    })[0];
  }

  function bubbleAnchorPenalty(candidate, rect) {
    let penalty = 0;
    // Prefer the elevated position whenever there is room, then choose the
    // other side before dropping below the selection.
    if (candidate.anchor.startsWith('below')) penalty += 24;
    if (candidate.anchor.startsWith('above') && rect.top < 66) penalty += 80;
    if (candidate.anchor.startsWith('below') && (window.innerHeight - rect.bottom) < 66) penalty += 80;
    if (candidate.anchor.endsWith('right') && (window.innerWidth - rect.right) < 46) penalty += 10;
    if (candidate.anchor.endsWith('left') && rect.left < 46) penalty += 10;
    return penalty;
  }

  function bubbleCollisionScore(candidate, size) {
    const points = [
      [candidate.left + size / 2, candidate.top + size / 2],
      [candidate.left + 4, candidate.top + 4],
      [candidate.left + size - 4, candidate.top + size - 4]
    ];
    let score = 0;
    for (const [x, y] of points) {
      const nodes = document.elementsFromPoint?.(x, y) || [];
      for (const node of nodes.slice(0, 8)) {
        if (!(node instanceof Element) || state.host?.contains(node) || node === document.documentElement || node === document.body) continue;
        const style = getComputedStyle(node);
        const z = Number.parseInt(style.zIndex, 10);
        const floating = ['fixed', 'sticky'].includes(style.position) || (Number.isFinite(z) && z >= 1000);
        const semantic = /(?:menu|toolbar|popover|tooltip|selection|composer|chatgpt|assistant|copy|edit)/i.test(`${node.getAttribute('role') || ''} ${node.className || ''} ${node.id || ''}`);
        if (floating || semantic) score += 12;
      }
    }
    return score;
  }

  function removeBubble() {
    hideFromTopLayer(state.bubble);
    state.bubble?.remove();
    state.bubble = null;
  }

  function minimize() {
    if (!isCurrentInstance()) return;
    state.minimized = true;
    render();
  }
  function restore() {
    if (!isCurrentInstance()) return;
    state.minimized = false;
    render();
    focusSearch();
  }

  function focusSearch(select = false) {
    requestAnimationFrame(() => {
      const input = state.mount?.querySelector('.dictfloat-search input');
      input?.focus();
      if (select && input?.value) input.select();
    });
  }

  function getPosition() {
    const width = Math.min(panelWidth(), Math.max(280, window.innerWidth - 24));
    // Default to the upper-right 10% zone requested for DictFloat. A saved
    // location always wins, and both dimensions are clamped after a resize.
    const rightGap = Math.max(18, Math.round(window.innerWidth * 0.10));
    const topGap = Math.max(18, Math.round(window.innerHeight * 0.10));
    const fallback = {
      left: Math.max(12, window.innerWidth - width - rightGap),
      top: Math.max(12, Math.min(topGap, window.innerHeight - 320))
    };
    const pos = state.position || fallback;
    const left = Number(pos.left);
    const top = Number(pos.top);
    return {
      left: Math.min(Math.max(6, Number.isFinite(left) ? left : fallback.left), Math.max(6, window.innerWidth - width - 6)),
      top: Math.min(Math.max(6, Number.isFinite(top) ? top : fallback.top), Math.max(6, window.innerHeight - 38))
    };
  }

  function makeDraggable(panel, handle) {
    bindDraggable(panel, handle);
  }

  function makeMiniDraggable(mini) {
    bindDraggable(mini, mini);
  }

  function bindDraggable(node, handle) {
    let drag = null;
    const previousUserSelect = { value: '', priority: '' };

    const endDrag = (persist = true) => {
      if (!drag) return;
      drag = null;
      node.classList.remove('dictfloat-dragging');
      document.documentElement.style.setProperty('user-select', previousUserSelect.value, previousUserSelect.priority);
      if (persist) void persistPanelPosition(node).catch(handleAsyncError);
    };

    const onMove = (event) => {
      if (!drag) return;
      event.preventDefault();
      const width = node.offsetWidth || panelWidth();
      const height = node.offsetHeight || 40;
      const left = Math.min(Math.max(6, drag.left + event.clientX - drag.x), Math.max(6, window.innerWidth - width - 6));
      const top = Math.min(Math.max(6, drag.top + event.clientY - drag.y), Math.max(6, window.innerHeight - height - 6));
      node.style.left = `${Math.round(left)}px`;
      node.style.top = `${Math.round(top)}px`;
    };

    const onUp = () => endDrag(true);
    const onCancel = () => endDrag(false);

    const onDown = (event) => {
      if (event.button !== 0 || event.target.closest?.('button, input, textarea, select, a, label')) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = node.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      previousUserSelect.value = document.documentElement.style.getPropertyValue('user-select');
      previousUserSelect.priority = document.documentElement.style.getPropertyPriority('user-select');
      document.documentElement.style.setProperty('user-select', 'none', 'important');
      node.classList.add('dictfloat-dragging');
      try { handle.setPointerCapture?.(event.pointerId); } catch (_) {}
    };

    // Use window capture listeners instead of relying only on pointermove on the
    // header. This keeps dragging reliable when the pointer leaves the titlebar
    // or crosses a reader-mode overlay.
    handle.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);

    state.dragCleanup?.();
    state.dragCleanup = () => {
      handle.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      endDrag(false);
    };
  }

  async function persistPanelPosition(node, done) {
    state.position = { left: parseInt(node.style.left, 10), top: parseInt(node.style.top, 10) };
    done?.();
    await safeStorageSet({ dictFloatPanelPosition: state.position });
  }

  function handleGlobalKeys(event) {
    if (!isCurrentInstance()) return;
    if (event.key === 'Escape' && state.host && !event.composedPath?.().includes(state.host)) removeBubble();
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }
  function normalize(value) { return String(value || '').toLowerCase().replace(/[\s_\-./]+/g, ' ').trim(); }
  function list(value) { return String(value || '').split(',').map((item) => item.trim()).filter(Boolean); }
  function el(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
})();
