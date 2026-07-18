(() => {
  const RUNTIME_VERSION = '0.3.4';
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
  const DEFAULT_SETTINGS = {
    selectionMode: 'bubble',
    fontSize: 12,
    panelWidth: 380,
    theme: 'system',
    onlineLookup: true
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
    history: [],
    position: null,
    online: { query: '', status: 'idle', data: null, error: '' },
    wudao: { query: '', status: 'idle', data: null, error: '' },
    wudaoSource: { installed: false, enabled: false },
    draftEntry: null,
    cssPromise: null,
    destroyed: false,
    themeMedia: null,
    themeListener: null
  };

  const instance = { version: RUNTIME_VERSION, token: INSTANCE_TOKEN, destroy: destroyInstance };
  window.__DICTFLOAT_INSTANCE__ = instance;

  function isCurrentInstance() {
    return !state.destroyed && document.documentElement.dataset.dictfloatInstanceToken === INSTANCE_TOKEN;
  }

  function isOwnedHost(node) {
    return !!node && node.getAttribute?.('data-dictfloat-owner') === INSTANCE_TOKEN;
  }

  void init();

  async function init() {
    const data = await storage.get([
      'dictFloatEntries',
      'dictFloatDictionaries',
      'dictFloatSettings',
      'dictFloatHistory',
      'dictFloatPanelPosition',
      'dictFloatWudaoSource'
    ]);
    if (!isCurrentInstance()) return;
    state.entries = Array.isArray(data.dictFloatEntries) ? data.dictFloatEntries.map(normalizeEntry) : [];
    state.dictionaries = normalizeDictionaries(data.dictFloatDictionaries);
    state.settings = { ...DEFAULT_SETTINGS, ...(data.dictFloatSettings || {}) };
    state.history = Array.isArray(data.dictFloatHistory) ? data.dictFloatHistory : [];
    state.position = data.dictFloatPanelPosition || null;
    state.wudaoSource = normalizeWudaoSource(data.dictFloatWudaoSource);

    document.addEventListener('mouseup', handleSelection, true);
    document.addEventListener('keydown', handleGlobalKeys, true);
    state.themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
    state.themeListener = () => {
      if (!state.destroyed && state.settings.theme === 'system' && state.host?.isConnected) render();
    };
    state.themeMedia.addEventListener?.('change', state.themeListener);
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
    chrome.storage.onChanged.addListener(onStorageChanged);
    void ensureStyles();
    if (state.host?.isConnected) render();
  }

  function onRuntimeMessage(message, _sender, sendResponse) {
    if (!isCurrentInstance()) return;
    if (message?.type === 'DICTFLOAT_PING') {
      sendResponse({ version: RUNTIME_VERSION });
      return;
    }
    if (message?.type === 'DICTFLOAT_REPAIR') {
      if (state.host?.isConnected) pruneDuplicateRoots();
      return;
    }
    if (message?.type === 'DICTFLOAT_TOGGLE') void toggle();
    if (message?.type === 'DICTFLOAT_LOOKUP') void openAndLookup(message.query || '');
  }

  function onStorageChanged(changes, areaName) {
    if (!isCurrentInstance() || areaName !== 'local') return;
    if (changes.dictFloatEntries) state.entries = Array.isArray(changes.dictFloatEntries.newValue) ? changes.dictFloatEntries.newValue.map(normalizeEntry) : [];
    if (changes.dictFloatDictionaries) state.dictionaries = normalizeDictionaries(changes.dictFloatDictionaries.newValue);
    if (changes.dictFloatHistory) state.history = Array.isArray(changes.dictFloatHistory.newValue) ? changes.dictFloatHistory.newValue : [];
    if (changes.dictFloatSettings) state.settings = { ...DEFAULT_SETTINGS, ...(changes.dictFloatSettings.newValue || {}) };
    if (changes.dictFloatPanelPosition) state.position = changes.dictFloatPanelPosition.newValue || null;
    if (changes.dictFloatWudaoSource) state.wudaoSource = normalizeWudaoSource(changes.dictFloatWudaoSource.newValue);
    if (state.host?.isConnected && (changes.dictFloatEntries || changes.dictFloatDictionaries || changes.dictFloatHistory || changes.dictFloatSettings || changes.dictFloatPanelPosition || changes.dictFloatWudaoSource)) render();
  }

  function destroyInstance() {
    if (state.destroyed) return;
    state.destroyed = true;
    document.removeEventListener('mouseup', handleSelection, true);
    document.removeEventListener('keydown', handleGlobalKeys, true);
    state.themeMedia?.removeEventListener?.('change', state.themeListener);
    chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    removeBubble();
    if (isOwnedHost(state.host)) state.host.remove();
    state.host = null;
    state.mount = null;
    state.panel = null;
    state.visible = false;
    if (window.__DICTFLOAT_INSTANCE__ === instance) delete window.__DICTFLOAT_INSTANCE__;
  }

  async function ensureStyles() {
    if (!state.cssPromise) {
      state.cssPromise = fetch(chrome.runtime.getURL('content.css'))
        .then((response) => {
          if (!response.ok) throw new Error('Unable to load DictFloat styles');
          return response.text();
        });
    }
    return state.cssPromise;
  }

  async function ensureRoot(renderOnCreate = false) {
    if (!isCurrentInstance()) return false;

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
        // Append synchronously. This is the single, document-wide claim.
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
    pruneDuplicateRoots();
    if (renderOnCreate) render();
    return true;
  }

  function pruneDuplicateRoots() {
    if (!isCurrentInstance()) return;
    document.querySelectorAll(ROOT_SELECTOR).forEach((node) => {
      if (node !== state.host) node.remove();
    });
  }

  function clearMount() {
    if (!state.mount) return;
    [...state.mount.children].forEach((node) => {
      if (node.tagName !== 'STYLE') node.remove();
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
    panel.style.cssText = `position:fixed;left:${pos.left}px;top:${pos.top}px;width:${panelWidth()}px;font-size:${fontSize()}px;z-index:2147483646;pointer-events:auto;`;
    panel.append(header(), searchBox(), tabs(), content(), footer());
    state.mount.append(panel);
    makeDraggable(panel, panel.querySelector('.dictfloat-head'));
  }

  function renderMini(pos) {
    const mini = el('div', `dictfloat-mini${isDarkTheme() ? ' dark' : ''}`);
    mini.style.cssText = `position:fixed;left:${pos.left}px;top:${pos.top}px;z-index:2147483646;pointer-events:auto;`;
    mini.append(el('span', 'dictfloat-branddot'), el('span', 'dictfloat-mini-name', 'DictFloat'));
    const restoreButton = el('button', '', '⌃');
    restoreButton.type = 'button';
    restoreButton.title = 'Restore DictFloat';
    restoreButton.setAttribute('aria-label', 'Restore DictFloat');
    restoreButton.addEventListener('click', restore);
    mini.append(restoreButton);
    state.mount.append(mini);
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
    settingsButton.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'DICTFLOAT_OPEN_OPTIONS' }));
    const online = el('button', 'dictfloat-online-toggle', state.settings.onlineLookup ? 'Online: On' : 'Online: Off');
    online.type = 'button';
    online.title = 'Change online lookup in Settings';
    online.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'DICTFLOAT_OPEN_OPTIONS' }));
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
        appendWudaoSection(box);
        appendOnlineSection(box);
        return;
      }
      state.selectedId = null;
    }

    if (!state.query.trim()) {
      queryEntries('').slice(0, 8).forEach((entry) => box.append(resultItem(entry)));
      return;
    }

    queryEntries(state.query).forEach((entry) => box.append(resultItem(entry)));
    appendWudaoSection(box);
    appendOnlineSection(box);
  }

  function resultItem(entry) {
    const item = el('article', 'dictfloat-result-item');
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.append(el('div', 'dictfloat-result-title', entry.term));

    const summary = el('div', 'dictfloat-result-summary');
    if (entry.aliases?.length) summary.append(el('span', 'dictfloat-result-aliases', entry.aliases.join(' · ')));
    if (entry.chinese) {
      if (entry.aliases?.length) summary.append(document.createTextNode(' '));
      summary.append(el('span', 'dictfloat-result-chinese', entry.chinese));
    }
    if (summary.childNodes.length) item.append(summary);

    const dictionary = dictionaryFor(entry.dictionaryId);
    item.append(el('div', 'dictfloat-result-source', dictionary?.name || 'Local glossary'));
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
    void addHistory(entry);
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
    star.addEventListener('click', async () => {
      entry.favorite = !entry.favorite;
      await saveEntries();
      renderContentOnly();
    });
    row.append(star);
    box.append(row);

    const dictionary = dictionaryFor(entry.dictionaryId);
    const fields = el('div', 'dictfloat-entry-fields');
    if (entry.aliases?.length) fields.append(el('div', 'dictfloat-entry-aliases', entry.aliases.join(' · ')));
    if (entry.chinese) fields.append(el('div', 'dictfloat-entry-chinese', entry.chinese));
    fields.append(el('div', 'dictfloat-entry-meta', dictionary?.name || 'Local glossary'));
    if (entry.category) fields.append(el('div', 'dictfloat-entry-meta', entry.category));
    if (entry.source) fields.append(el('div', 'dictfloat-entry-meta', entry.source));
    box.append(fields);

    box.append(el('div', 'dictfloat-definition', entry.definition || 'No definition yet.'));

    if (entry.tags?.length) {
      const tags = el('div', 'dictfloat-tags');
      entry.tags.forEach((tag) => tags.append(el('span', 'dictfloat-tag', tag)));
      box.append(tags);
    }
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
    box.append(el('div', 'dictfloat-divider'));

    const actions = el('div', 'dictfloat-entry-actions');
    const back = el('button', '', '← Return');
    back.type = 'button';
    back.title = 'Return to results';
    back.addEventListener('click', returnToPreviousView);
    const copy = el('button', '', 'Copy');
    copy.type = 'button';
    copy.addEventListener('click', () => copyText(formatCopy(entry), copy));
    const edit = el('button', '', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => openEdit(entry));
    actions.append(back, el('span', 'grow'), copy, edit);
    box.append(actions);
  }

  function openEdit(entry) {
    state.formReturnState = { selectedId: entry.id, query: state.query, returnState: state.returnState };
    state.view = 'lookup';
    state.selectedId = null;
    state.editingId = entry.id;
    state.draftEntry = null;
    renderContentOnly();
  }

  function appendWudaoSection(box) {
    const lookup = state.wudao;
    if (!state.query.trim() || !state.wudaoSource.installed || !state.wudaoSource.enabled || lookup.query !== state.query.trim()) return;
    const section = el('section', 'dictfloat-wudao-section');
    if (lookup.status === 'loading') {
      section.append(el('div', 'dictfloat-wudao-status', 'Searching Wudao offline…'));
      box.append(section);
      return;
    }
    if (lookup.status === 'error') {
      const status = el('div', 'dictfloat-wudao-status', 'Wudao offline lookup is unavailable.');
      status.title = lookup.error || '';
      section.append(status);
      box.append(section);
      return;
    }
    if (lookup.status !== 'done' || !lookup.data) return;
    const data = lookup.data;
    section.append(el('div', 'dictfloat-wudao-label', 'Wudao · Offline'));
    section.append(el('div', 'dictfloat-term', data.term || state.query));
    if (data.phonetic) section.append(el('div', 'dictfloat-subtitle', data.phonetic));
    if (data.definitions?.length) {
      const definitions = el('div', 'dictfloat-wudao-definitions');
      data.definitions.slice(0, 8).forEach((definition) => definitions.append(el('div', 'dictfloat-wudao-definition', definition)));
      section.append(definitions);
    }
    if (data.examples?.length) {
      const examples = el('div', 'dictfloat-wudao-examples');
      data.examples.slice(0, 2).forEach((example) => examples.append(el('div', 'dictfloat-wudao-example', example)));
      section.append(examples);
    }
    if (!data.definitions?.length) section.append(el('div', 'dictfloat-wudao-status', 'No offline definition was returned for this query.'));
    const actions = el('div', 'dictfloat-inline-actions');
    const save = el('button', '', '+ Save');
    save.type = 'button';
    save.addEventListener('click', () => {
      state.draftEntry = wudaoToDraft(data);
      state.editingId = null;
      state.selectedId = null;
      state.view = 'add';
      renderContentOnly();
    });
    const copy = el('button', '', 'Copy');
    copy.type = 'button';
    copy.addEventListener('click', () => copyText(formatWudaoCopy(data), copy));
    actions.append(save, copy);
    section.append(actions);
    box.append(section);
  }

  function appendOnlineSection(box) {
    const online = state.online;
    if (!state.query.trim() || !state.settings.onlineLookup || online.query !== state.query.trim()) return;
    const section = el('section', 'dictfloat-online-section');
    if (online.status === 'loading') {
      section.append(el('div', 'dictfloat-online-status', 'Searching online…'));
      box.append(section);
      return;
    }
    if (online.status === 'error') {
      const status = el('div', 'dictfloat-online-status', 'Online lookup is unavailable right now.');
      status.title = online.error || '';
      section.append(status);
      box.append(section);
      return;
    }
    if (online.status !== 'done' || !online.data) return;

    const data = online.data;
    section.append(el('div', 'dictfloat-online-label', 'Online'));
    section.append(el('div', 'dictfloat-term', data.term || state.query));
    if (data.phonetic) section.append(el('div', 'dictfloat-subtitle', data.phonetic));
    if (data.translation) section.append(el('div', 'dictfloat-cn', data.translation));
    if (data.definitions?.length) {
      const definitions = el('div', 'dictfloat-online-definitions');
      data.definitions.slice(0, 4).forEach((item) => {
        const line = el('div', 'dictfloat-online-definition');
        if (item.partOfSpeech) line.append(el('span', 'dictfloat-pos', item.partOfSpeech));
        line.append(document.createTextNode(item.definition));
        definitions.append(line);
      });
      section.append(definitions);
    }
    if (!data.translation && !data.definitions?.length) section.append(el('div', 'dictfloat-online-status', 'No online definition was returned for this query.'));
    section.append(el('div', 'dictfloat-meta', data.providers?.join(' · ') || 'Online lookup'));

    const actions = el('div', 'dictfloat-inline-actions');
    const save = el('button', '', '+ Save');
    save.type = 'button';
    save.addEventListener('click', () => {
      state.draftEntry = onlineToDraft(data);
      state.editingId = null;
      state.view = 'add';
      renderContentOnly();
    });
    const copy = el('button', '', 'Copy');
    copy.type = 'button';
    copy.addEventListener('click', () => copyText(formatOnlineCopy(data), copy));
    actions.append(save, copy);
    section.append(actions);
    box.append(section);
  }

  function fillHistory(box) {
    if (!state.history.length) return;
    const head = el('div', 'dictfloat-history-head');
    head.append(el('span', '', 'Recent lookups'));
    const clear = el('button', '', 'Clear');
    clear.type = 'button';
    clear.addEventListener('click', async () => {
      state.history = [];
      await storage.set({ dictFloatHistory: [] });
      renderContentOnly();
    });
    head.append(clear);
    box.append(head);
    state.history.forEach((item) => {
      const entry = state.entries.find((entry) => entry.id === item.id);
      if (entry) box.append(resultItem(entry));
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
      remove.addEventListener('click', async () => {
        if (!confirm(`Delete “${editing.term}”?`)) return;
        state.entries = state.entries.filter((item) => item.id !== editing.id);
        state.history = state.history.filter((item) => item.id !== editing.id);
        await storage.set({ dictFloatEntries: state.entries.map(normalizeEntry), dictFloatHistory: state.history });
        state.editingId = null;
        state.selectedId = null;
        state.view = 'lookup';
        renderContentOnly();
      });
      controls.append(remove);
    }
    controls.append(save);
    form.append(controls);

    form.addEventListener('submit', async (event) => {
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
    });
    box.append(form);
  }

  function fillEditForm(box, entry) {
    state.editingId = entry.id;
    fillAddForm(box, entry);
  }

  function lookup(raw) {
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
    const best = queryEntries(query)[0];
    if (best) {
      // A direct lookup opens the best entry, but Return must still show the
      // matching result list rather than a blank / stacked old panel.
      state.returnState = { view: 'lookup', query, scrollTop: 0 };
      state.selectedId = best.id;
      void addHistory(best);
    }
    render();
    if (state.wudaoSource.installed && state.wudaoSource.enabled && query) void lookupWudao(query);
    if (state.settings.onlineLookup && query) void lookupOnline(query);
    focusSearch(true);
  }

  async function lookupWudao(query) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'DICTFLOAT_WUDAO_LOOKUP', query });
      if (state.query !== query) return;
      if (!response?.ok) throw new Error(response?.error || 'Wudao lookup failed');
      state.wudao = { query, status: 'done', data: response.data || null, error: '' };
    } catch (error) {
      if (state.query !== query) return;
      state.wudao = { query, status: 'error', data: null, error: String(error?.message || error) };
    }
    renderContentOnly();
  }

  async function lookupOnline(query) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'DICTFLOAT_ONLINE_LOOKUP', query });
      if (state.query !== query) return;
      if (!response?.ok) throw new Error(response?.error || 'Online lookup failed');
      state.online = { query, status: 'done', data: response.data || null, error: '' };
    } catch (error) {
      if (state.query !== query) return;
      state.online = { query, status: 'error', data: null, error: String(error?.message || error) };
    }
    renderContentOnly();
  }

  async function addHistory(entry) {
    state.history = [{ id: entry.id, at: Date.now() }, ...state.history.filter((item) => item.id !== entry.id)].slice(0, 50);
    await storage.set({ dictFloatHistory: state.history });
  }

  async function saveEntries() {
    await storage.set({ dictFloatEntries: state.entries.map(normalizeEntry) });
  }

  function queryEntries(raw) {
    const enabled = new Set(state.dictionaries.filter((dictionary) => dictionary.enabled !== false).map((dictionary) => dictionary.id));
    const visible = state.entries.filter((entry) => enabled.has(entry.dictionaryId));
    const query = normalize(raw);
    if (!query) return visible.filter((entry) => entry.favorite).concat(visible.filter((entry) => !entry.favorite)).slice(0, 20);
    return visible
      .map((entry) => ({ entry, score: score(entry, query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.term.localeCompare(b.entry.term))
      .map((item) => item.entry);
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

  function normalizeWudaoSource(source) {
    const input = source && typeof source === 'object' ? source : {};
    return {
      installed: !!input.installed,
      enabled: input.enabled !== false && !!input.installed,
      totalSize: Number(input.totalSize || 0),
      recordCounts: input.recordCounts || { en: 0, zh: 0 }
    };
  }

  function normalizeDictionaries(input) {
    const defaults = [
      { id: 'pcie-starter', name: 'PCIe Starter', enabled: true, builtIn: true },
      { id: 'my-glossary', name: 'My Glossary', enabled: true, builtIn: false }
    ];
    const dictionaries = Array.isArray(input)
      ? input.filter(Boolean).map((item) => ({
          id: String(item.id || crypto.randomUUID()),
          name: String(item.name || 'Untitled glossary').trim() || 'Untitled glossary',
          enabled: item.enabled !== false,
          builtIn: !!item.builtIn,
          createdAt: item.createdAt || Date.now()
        }))
      : [];
    defaults.forEach((item) => {
      if (!dictionaries.some((dictionary) => dictionary.id === item.id)) dictionaries.push(item);
    });
    return dictionaries;
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

  async function copyText(text, button) {
    try {
      await navigator.clipboard.writeText(text);
      const previous = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = previous; }, 900);
    } catch (_) {
      button.textContent = 'Copy failed';
      setTimeout(() => { button.textContent = 'Copy'; }, 900);
    }
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
  function formatWudaoCopy(data) {
    return [data.term || state.query, data.phonetic || '', ...(data.definitions || []), ...(data.examples || [])].filter(Boolean).join('\n');
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
  function formatCopy(entry) {
    return [
      entry.term,
      entry.aliases?.length ? entry.aliases.join(', ') : '',
      entry.chinese || '',
      entry.definition || '',
      entry.related?.length ? entry.related.join(', ') : ''
    ].filter(Boolean).join('\n');
  }
  function formatOnlineCopy(data) {
    const definitions = (data.definitions || []).map((item) => `${item.partOfSpeech ? `[${item.partOfSpeech}] ` : ''}${item.definition}`).join('\n');
    return `${data.term || state.query}${data.phonetic ? `\n${data.phonetic}` : ''}${data.translation ? `\n${data.translation}` : ''}${definitions ? `\n${definitions}` : ''}`;
  }

  function handleSelection(event) {
    if (!isCurrentInstance() || event.composedPath?.().includes(state.host)) return;
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (!text || text.length > 160 || state.settings.selectionMode === 'off') {
        removeBubble();
        return;
      }
      const range = selection.getRangeAt?.(0);
      if (!range) return;
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      if (state.settings.selectionMode === 'auto') {
        removeBubble();
        void openAndLookup(text);
        return;
      }
      void showBubble(text, rect);
    }, 10);
  }

  async function showBubble(text, rect) {
    if (!isCurrentInstance()) return;
    await ensureRoot(false);
    removeBubble();
    const bubble = el('button', 'dictfloat-bubble', '⌕');
    bubble.type = 'button';
    bubble.title = `Look up “${text.slice(0, 42)}”`;
    bubble.setAttribute('aria-label', 'Look up selected text');
    const left = Math.min(window.innerWidth - 31, Math.max(6, rect.right + 5));
    const top = Math.min(window.innerHeight - 31, Math.max(6, rect.top - 3));
    bubble.style.cssText = `position:fixed;left:${left}px;top:${top}px;z-index:2147483647;pointer-events:auto;`;
    bubble.addEventListener('mousedown', (event) => event.preventDefault());
    bubble.addEventListener('click', () => {
      removeBubble();
      void openAndLookup(text);
    });
    state.mount.append(bubble);
    state.bubble = bubble;
  }

  function removeBubble() {
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
    const fallback = {
      left: Math.max(12, window.innerWidth - width - 28),
      top: Math.max(12, Math.min(88, window.innerHeight - 320))
    };
    const pos = state.position || fallback;
    return {
      left: Math.min(Math.max(6, Number(pos.left) || fallback.left), Math.max(6, window.innerWidth - width - 6)),
      top: Math.min(Math.max(6, Number(pos.top) || fallback.top), Math.max(6, window.innerHeight - 38))
    };
  }

  function makeDraggable(panel, handle) {
    let drag = null;
    handle.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      drag = { x: event.clientX, y: event.clientY, left: parseInt(panel.style.left, 10), top: parseInt(panel.style.top, 10) };
      handle.setPointerCapture?.(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const width = panel.offsetWidth;
      const left = Math.min(Math.max(6, drag.left + event.clientX - drag.x), Math.max(6, window.innerWidth - width - 6));
      const top = Math.min(Math.max(6, drag.top + event.clientY - drag.y), Math.max(6, window.innerHeight - 40));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    });
    handle.addEventListener('pointerup', () => persistPanelPosition(panel, () => { drag = null; }));
    handle.addEventListener('pointercancel', () => { drag = null; });
  }

  function makeMiniDraggable(mini) {
    let drag = null;
    mini.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      drag = { x: event.clientX, y: event.clientY, left: parseInt(mini.style.left, 10), top: parseInt(mini.style.top, 10) };
      mini.setPointerCapture?.(event.pointerId);
    });
    mini.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const left = Math.min(Math.max(6, drag.left + event.clientX - drag.x), Math.max(6, window.innerWidth - mini.offsetWidth - 6));
      const top = Math.min(Math.max(6, drag.top + event.clientY - drag.y), Math.max(6, window.innerHeight - mini.offsetHeight - 6));
      mini.style.left = `${left}px`;
      mini.style.top = `${top}px`;
    });
    mini.addEventListener('pointerup', () => persistPanelPosition(mini, () => { drag = null; }));
    mini.addEventListener('pointercancel', () => { drag = null; });
  }

  async function persistPanelPosition(node, done) {
    state.position = { left: parseInt(node.style.left, 10), top: parseInt(node.style.top, 10) };
    done?.();
    await storage.set({ dictFloatPanelPosition: state.position });
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
