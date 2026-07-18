(() => {
  if (window.__DICTFLOAT_LOADED__) return;
  window.__DICTFLOAT_LOADED__ = true;

  const state = {
    root: null,
    panel: null,
    bubble: null,
    minimized: false,
    query: '',
    view: 'lookup',
    selectedId: null,
    settings: { selectionMode: 'bubble', compactMode: true, fontSize: 12, panelWidth: 380, showPhonetic: true, theme: 'system', onlineLookup: true },
    entries: [],
    dictionaries: [],
    history: [],
    position: null,
    online: { query: '', status: 'idle', data: null, error: '' },
    draftEntry: null
  };

  const storage = chrome.storage.local;

  init();

  async function init() {
    const data = await storage.get(['dictFloatEntries', 'dictFloatDictionaries', 'dictFloatSettings', 'dictFloatHistory', 'dictFloatPanelPosition']);
    state.entries = Array.isArray(data.dictFloatEntries) ? data.dictFloatEntries : [];
    state.dictionaries = normalizeDictionaries(data.dictFloatDictionaries);
    state.entries = state.entries.map(entry => ({ ...entry, dictionaryId: entry.dictionaryId || inferDictionaryId(entry) }));
    state.settings = { ...state.settings, ...(data.dictFloatSettings || {}) };
    state.history = Array.isArray(data.dictFloatHistory) ? data.dictFloatHistory : [];
    state.position = data.dictFloatPanelPosition || null;
    document.addEventListener('mouseup', handleSelection, true);
    document.addEventListener('keydown', handleGlobalKeys, true);
    // Chrome exposes its light/dark preference through prefers-color-scheme.
    // Re-render an already-open panel immediately when Chrome/OS changes mode.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.settings.theme === 'system' && state.root?.isConnected) render();
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'DICTFLOAT_TOGGLE') toggle();
    if (message.type === 'DICTFLOAT_LOOKUP') {
      ensureRoot();
      open();
      lookup(message.query || '');
    }
  });

  // Keep an already-open panel in sync with changes made in the Options page.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.dictFloatEntries) state.entries = Array.isArray(changes.dictFloatEntries.newValue) ? changes.dictFloatEntries.newValue.map(entry => ({ ...entry, dictionaryId: entry.dictionaryId || inferDictionaryId(entry) })) : [];
    if (changes.dictFloatDictionaries) state.dictionaries = normalizeDictionaries(changes.dictFloatDictionaries.newValue);
    if (changes.dictFloatHistory) state.history = Array.isArray(changes.dictFloatHistory.newValue) ? changes.dictFloatHistory.newValue : [];
    if (changes.dictFloatSettings) state.settings = { ...state.settings, ...(changes.dictFloatSettings.newValue || {}) };
    if (state.root?.isConnected && (changes.dictFloatEntries || changes.dictFloatDictionaries || changes.dictFloatSettings || changes.dictFloatHistory)) render();
  });

  function ensureRoot() {
    if (state.root?.isConnected) return;
    state.root = document.createElement('div');
    state.root.id = 'dictfloat-root';
    document.documentElement.appendChild(state.root);
    render();
  }

  // The action icon calls this. Do not call ensureRoot before deciding whether
  // a panel already existed: ensureRoot() renders a panel immediately.
  function toggle() {
    if (!state.root?.isConnected) {
      ensureRoot();
      open();
      return;
    }
    if (state.minimized) {
      restore();
      return;
    }
    close();
  }

  function open() {
    ensureRoot();
    state.minimized = false;
    render();
    requestAnimationFrame(() => state.root.querySelector('.dictfloat-search input')?.focus());
  }

  function close() {
    if (state.root) state.root.remove();
    state.root = state.panel = null;
    removeBubble();
  }

  function render() {
    if (!state.root) return;
    const pos = getPosition();
    state.root.innerHTML = '';
    if (state.minimized) {
      const mini = el('button', 'dictfloat-minimized', '⌕');
      mini.title = 'Open DictFloat';
      mini.style.cssText = `position:fixed;left:${pos.left}px;top:${pos.top}px;z-index:2147483646;`;
      mini.addEventListener('click', restore);
      state.root.appendChild(mini);
      return;
    }

    const panel = el('section', `dictfloat-panel ${isDarkTheme() ? 'dark' : ''}`);
    state.panel = panel;
    panel.style.cssText = `position:fixed;left:${pos.left}px;top:${pos.top}px;z-index:2147483646;width:${Math.min(Math.max(+state.settings.panelWidth || 380, 320), 520)}px;font-size:${Math.min(Math.max(+state.settings.fontSize || 12, 10), 15)}px;`;
    panel.append(header(), searchBox(), tabs(), content(), footer());
    state.root.appendChild(panel);
    makeDraggable(panel, panel.querySelector('.dictfloat-head'));
  }

  function isDarkTheme() {
    if (state.settings.theme === 'dark') return true;
    if (state.settings.theme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function header() {
    const head = el('header', 'dictfloat-head');
    head.append(el('span', 'dictfloat-branddot'), el('strong', 'dictfloat-title', 'DictFloat'));
    const min = el('button', '', '—'); min.title = 'Minimize'; min.addEventListener('click', minimize);
    const closeBtn = el('button', '', '×'); closeBtn.title = 'Close'; closeBtn.addEventListener('click', close);
    head.append(min, closeBtn);
    return head;
  }

  function searchBox() {
    const wrap = el('div', 'dictfloat-search-wrap');
    const box = el('div', 'dictfloat-search');
    box.append(el('span', '', '⌕'));
    const input = document.createElement('input');
    input.type = 'text'; input.placeholder = 'Search word, phrase, or term…'; input.value = state.query;
    input.autocomplete = 'off'; input.spellcheck = false;
    input.addEventListener('input', () => { state.query = input.value; state.selectedId = null; state.online = { query: '', status: 'idle', data: null, error: '' }; renderContentOnly(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') lookup(input.value); if (e.key === 'Escape') { input.value = ''; state.query = ''; state.online = { query: '', status: 'idle', data: null, error: '' }; renderContentOnly(); } });
    const clearBtn = el('button', 'dictfloat-search-clear', '×');
    clearBtn.type = 'button';
    clearBtn.title = 'Clear search';
    clearBtn.setAttribute('aria-label', 'Clear search');
    clearBtn.hidden = !input.value;
    clearBtn.addEventListener('click', () => {
      input.value = '';
      state.query = '';
      state.selectedId = null;
      state.online = { query: '', status: 'idle', data: null, error: '' };
      clearBtn.hidden = true;
      renderContentOnly();
      input.focus();
    });
    input.addEventListener('input', () => { clearBtn.hidden = !input.value; });
    box.append(input, clearBtn);
    wrap.append(box); return wrap;
  }

  function tabs() {
    const wrap = el('div', 'dictfloat-tabs');
    const items = [['lookup', 'All'], ['history', 'History'], ['add', '+ Add']];
    for (const [id, label] of items) {
      const btn = el('button', `dictfloat-tab ${state.view === id ? 'active' : ''}`, label);
      btn.addEventListener('click', () => { state.view = id; state.selectedId = null; renderContentOnly(); updateTabs(); });
      wrap.append(btn);
    }
    return wrap;
  }

  function content() {
    const box = el('main', 'dictfloat-content'); box.id = 'dictfloat-content';
    fillContent(box); return box;
  }

  function renderContentOnly() {
    const box = state.root?.querySelector('#dictfloat-content'); if (!box) return;
    fillContent(box); updateTabs();
  }

  function updateTabs() {
    state.root?.querySelectorAll('.dictfloat-tab').forEach((node, idx) => {
      node.classList.toggle('active', ['lookup','history','add'][idx] === state.view);
    });
  }

  function fillContent(box) {
    box.innerHTML = '';
    if (state.view === 'add') return fillAddForm(box);
    if (state.view === 'history') return fillHistory(box);
    const results = queryEntries(state.query);
    if (state.selectedId) {
      const entry = state.entries.find(item => item.id === state.selectedId);
      if (entry) {
        fillEntry(box, entry);
        appendOnlineSection(box);
        return;
      }
    }
    if (!state.query.trim()) {
      if (state.entries.length) state.entries.slice(0, 5).forEach(entry => box.append(resultItem(entry)));
      return;
    }
    if (results.length) {
      results.forEach(entry => box.append(resultItem(entry)));
    }
    appendOnlineSection(box);
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
      const msg = el('div', 'dictfloat-online-status', 'Online lookup is unavailable right now.');
      msg.title = online.error || '';
      section.append(msg); box.append(section); return;
    }
    if (online.status !== 'done' || !online.data) return;
    const data = online.data;
    const label = el('div', 'dictfloat-online-label', 'Online');
    section.append(label);
    const row = el('div', 'dictfloat-term-row');
    row.append(el('div', 'dictfloat-term', data.term || state.query));
    section.append(row);
    if (data.phonetic) section.append(el('div', 'dictfloat-subtitle', data.phonetic));
    if (data.translation) section.append(el('div', 'dictfloat-cn', data.translation));
    if (Array.isArray(data.definitions) && data.definitions.length) {
      const defs = el('div', 'dictfloat-online-definitions');
      data.definitions.slice(0, 4).forEach((item) => {
        const line = el('div', 'dictfloat-online-definition');
        if (item.partOfSpeech) line.append(el('span', 'dictfloat-pos', item.partOfSpeech));
        line.append(document.createTextNode(item.definition));
        defs.append(line);
      });
      section.append(defs);
    }
    if (!data.translation && (!data.definitions || !data.definitions.length)) {
      section.append(el('div', 'dictfloat-online-status', 'No online definition was returned for this query.'));
    }
    const meta = el('div', 'dictfloat-meta', data.providers?.join(' · ') || 'Online lookup');
    section.append(meta);
    const actions = el('div', 'dictfloat-inline-actions');
    const save = el('button', '', '+ Save');
    save.addEventListener('click', () => {
      state.draftEntry = onlineToDraft(data);
      state.view = 'add';
      renderContentOnly(); updateTabs();
    });
    const copy = el('button', '', 'Copy');
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(formatOnlineCopy(data));
      copy.textContent = 'Copied'; setTimeout(() => copy.textContent = 'Copy', 900);
    });
    actions.append(save, copy); section.append(actions);
    box.append(section);
  }

  function resultItem(entry) {
    const item = el('article', 'dictfloat-result-item');
    item.append(el('div', 'dictfloat-result-title', entry.term));
    if (entry.chinese) item.append(el('div', 'dictfloat-result-preview', entry.chinese));
    const dictionary = dictionaryFor(entry.dictionaryId);
    if (dictionary) item.append(el('div', 'dictfloat-result-source', dictionary.name));
    item.addEventListener('click', () => { state.selectedId = entry.id; addHistory(entry); renderContentOnly(); });
    return item;
  }

  function fillEntry(box, entry) {
    const row = el('div', 'dictfloat-term-row'); row.append(el('div', 'dictfloat-term', entry.term));
    const star = el('button', `dictfloat-star ${entry.favorite ? 'on' : ''}`, entry.favorite ? '★' : '☆');
    star.title = entry.favorite ? 'Remove favorite' : 'Favorite';
    star.addEventListener('click', async () => { entry.favorite = !entry.favorite; await saveEntries(); fillEntry(box, entry); }); row.append(star); box.append(row);
    if (entry.aliases?.length) box.append(el('div','dictfloat-subtitle', entry.aliases.join(' · ')));
    if (entry.chinese) box.append(el('div','dictfloat-cn', entry.chinese));
    box.append(el('div','dictfloat-definition', entry.definition || 'No definition yet.'));
    if (entry.tags?.length) { const tags = el('div','dictfloat-tags'); entry.tags.forEach(t => tags.append(el('span','dictfloat-tag',t))); box.append(tags); }
    const dictionary = dictionaryFor(entry.dictionaryId);
    const meta = [dictionary?.name, entry.category, entry.source].filter(Boolean).join(' · '); if (meta) box.append(el('div','dictfloat-meta',meta));
    const divider = el('div','dictfloat-divider'); box.append(divider);
    const actions = el('div','dictfloat-footer');
    const back = el('button','', '← Results'); back.addEventListener('click', () => { state.selectedId = null; renderContentOnly(); });
    const copy = el('button','', 'Copy'); copy.addEventListener('click', async () => { await navigator.clipboard.writeText(formatCopy(entry)); copy.textContent='Copied'; setTimeout(()=>copy.textContent='Copy',900); });
    const edit = el('button','', 'Edit'); edit.addEventListener('click', () => fillEditForm(box, entry));
    actions.append(back, el('span','grow'), copy, edit); box.append(actions);
  }

  function fillAddForm(box, editing) {
    const defaultDictionaryId = defaultWritableDictionaryId();
    const entry = editing || state.draftEntry || { term: state.query.trim(), aliases:[], chinese:'', definition:'', tags:[], category:'', source:'My glossary', dictionaryId: defaultDictionaryId };
    box.append(el('div','dictfloat-meta', editing ? 'Edit local entry' : 'Add to a local glossary'));
    const form = el('form','dictfloat-add-form');
    const dictionaryLabel = el('label', 'full'); dictionaryLabel.textContent = 'Glossary';
    const dictionarySelect = document.createElement('select'); dictionarySelect.name = 'dictionaryId';
    writableDictionaries().forEach(dictionary => {
      const option = document.createElement('option'); option.value = dictionary.id; option.textContent = dictionary.name;
      if (dictionary.id === (entry.dictionaryId || defaultDictionaryId)) option.selected = true;
      dictionarySelect.append(option);
    });
    dictionaryLabel.append(dictionarySelect); form.append(dictionaryLabel);
    const fields = [
      ['term','Term *','text',''], ['chinese','Chinese','text',''], ['aliases','Aliases','text','comma-separated'], ['tags','Tags','text','comma-separated'], ['category','Category','text','PCIe / Firmware / English'], ['source','Source','text',''], ['definition','Definition *','textarea','']
    ];
    for (const [name,label,type,placeholder] of fields) {
      const lab = el('label', name === 'definition' ? 'full' : ''); lab.textContent = label;
      const input = document.createElement(type === 'textarea' ? 'textarea' : 'input'); input.name = name; input.placeholder = placeholder;
      input.value = Array.isArray(entry[name]) ? entry[name].join(', ') : (entry[name] || ''); lab.append(input); form.append(lab);
    }
    const buttons = el('div','dictfloat-footer'); buttons.style.gridColumn='1 / -1';
    const cancel = el('button','', 'Cancel'); cancel.type='button'; cancel.addEventListener('click', () => { state.view='lookup'; renderContentOnly(); updateTabs(); });
    const save = el('button','', editing ? 'Save changes' : 'Save entry'); save.type='submit';
    buttons.append(cancel, el('span','grow'), save); form.append(buttons);
    form.addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(form); const term = String(fd.get('term')||'').trim(); const definition=String(fd.get('definition')||'').trim(); if (!term || !definition) return; const value = { ...entry, id: entry.id || crypto.randomUUID(), dictionaryId: String(fd.get('dictionaryId') || defaultDictionaryId), term, chinese:String(fd.get('chinese')||'').trim(), aliases:list(fd.get('aliases')), tags:list(fd.get('tags')), category:String(fd.get('category')||'').trim(), source:String(fd.get('source')||'').trim()||'My glossary', definition, updatedAt:Date.now() }; if (editing) state.entries = state.entries.map(x=>x.id===entry.id?value:x); else state.entries.unshift(value); await saveEntries(); state.draftEntry = null; state.view='lookup'; state.query=term; state.selectedId=value.id; renderContentOnly(); updateTabs(); });
    box.append(form);
  }

  function fillEditForm(box, entry) { box.innerHTML = ''; fillAddForm(box, entry); }
  function fillHistory(box) { if (!state.history.length) { box.append(el('div','dictfloat-empty','No lookup history yet.')); return; } state.history.forEach(h => { const entry = state.entries.find(e=>e.id===h.id); if (entry) box.append(resultItem(entry)); }); }

  function footer() {
    const foot = el('footer','dictfloat-footer');
    const settings = el('button','', '⚙ Settings'); settings.addEventListener('click', () => chrome.runtime.sendMessage({type:'DICTFLOAT_OPEN_OPTIONS'}));
    const online = el('button','dictfloat-online-toggle', state.settings.onlineLookup ? 'Online: On' : 'Online: Off');
    online.title = 'Change online lookup in Settings';
    online.addEventListener('click', () => chrome.runtime.sendMessage({type:'DICTFLOAT_OPEN_OPTIONS'}));
    foot.append(settings, el('span','grow'), online); return foot;
  }

  function lookup(raw) {
    const q = String(raw || '').trim(); state.query = q; state.view='lookup'; state.selectedId=null; state.draftEntry = null;
    state.online = { query: q, status: state.settings.onlineLookup && q ? 'loading' : 'idle', data: null, error: '' };
    const best = queryEntries(q)[0]; if (best) { state.selectedId = best.id; addHistory(best); }
    render();
    if (state.settings.onlineLookup && q) lookupOnline(q);
    requestAnimationFrame(()=>{ const input=state.root?.querySelector('.dictfloat-search input'); if(input){input.focus(); input.select();} });
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
    state.history = [{ id: entry.id, at: Date.now() }, ...state.history.filter(x => x.id !== entry.id)].slice(0, 30);
    await storage.set({ dictFloatHistory: state.history });
  }
  async function saveEntries() { await storage.set({ dictFloatEntries: state.entries }); }

  function queryEntries(raw) {
    const enabledIds = new Set(state.dictionaries.filter(dictionary => dictionary.enabled !== false).map(dictionary => dictionary.id));
    const visible = state.entries.filter(entry => enabledIds.has(entry.dictionaryId || inferDictionaryId(entry)));
    const q = normalize(raw); if (!q) return visible.filter(e=>e.favorite).concat(visible.filter(e=>!e.favorite)).slice(0,20);
    return visible.map(entry => ({entry, score: score(entry,q)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score || a.entry.term.localeCompare(b.entry.term)).map(x=>x.entry);
  }
  function score(entry,q) {
    const term=normalize(entry.term), aliases=(entry.aliases||[]).map(normalize), chinese=normalize(entry.chinese), tags=(entry.tags||[]).map(normalize), def=normalize(entry.definition);
    if(term===q) return 100; if(aliases.includes(q)) return 95; if(term.startsWith(q)) return 82; if(aliases.some(x=>x.startsWith(q))) return 75; if(term.includes(q)) return 65; if(aliases.some(x=>x.includes(q))) return 58; if(chinese.includes(q)) return 52; if(tags.some(x=>x.includes(q))) return 42; if(def.includes(q)) return 20; return 0;
  }

  function normalizeDictionaries(input) {
    const defaults = [
      { id: 'pcie-starter', name: 'PCIe Starter', enabled: true, builtIn: true },
      { id: 'my-glossary', name: 'My Glossary', enabled: true, builtIn: false }
    ];
    const dictionaries = Array.isArray(input) ? input.filter(Boolean).map(item => ({ id: String(item.id || crypto.randomUUID()), name: String(item.name || 'Untitled glossary'), enabled: item.enabled !== false, builtIn: !!item.builtIn })) : [];
    defaults.forEach(item => { if (!dictionaries.some(dictionary => dictionary.id === item.id)) dictionaries.push(item); });
    return dictionaries;
  }
  function inferDictionaryId(entry) { return String(entry?.source || '').includes('DictFloat starter') ? 'pcie-starter' : 'my-glossary'; }
  function dictionaryFor(id) { return state.dictionaries.find(dictionary => dictionary.id === id) || null; }
  function writableDictionaries() { const writable = state.dictionaries.filter(dictionary => !dictionary.builtIn); return writable.length ? writable : state.dictionaries; }
  function defaultWritableDictionaryId() { return writableDictionaries().find(dictionary => dictionary.enabled !== false)?.id || writableDictionaries()[0]?.id || 'my-glossary'; }

  function normalize(s) { return String(s||'').toLowerCase().replace(/[\s_\-./]+/g,' ').trim(); }
  function list(value) { return String(value||'').split(',').map(x=>x.trim()).filter(Boolean); }
  function formatCopy(e) { return `${e.term}${e.chinese ? `\n${e.chinese}` : ''}\n${e.definition}${e.aliases?.length?`\nAliases: ${e.aliases.join(', ')}`:''}`; }

  function onlineToDraft(data) {
    const definition = (data.definitions || []).slice(0, 3).map(item => item.definition).filter(Boolean).join('\n') || data.translation || '';
    return { dictionaryId: defaultWritableDictionaryId(), term: data.term || state.query.trim(), aliases: [], chinese: data.translation || '', definition, tags: [], category: '', source: data.providers?.join(' + ') || 'Online lookup' };
  }
  function formatOnlineCopy(data) {
    const defs = (data.definitions || []).map(item => `${item.partOfSpeech ? `[${item.partOfSpeech}] ` : ''}${item.definition}`).join('\n');
    return `${data.term || state.query}${data.phonetic ? `\n${data.phonetic}` : ''}${data.translation ? `\n${data.translation}` : ''}${defs ? `\n${defs}` : ''}`;
  }

  function handleSelection(event) {
    if (event.target.closest?.('#dictfloat-root')) return;
    setTimeout(() => {
      const selection = window.getSelection(); const text = selection?.toString().trim();
      if (!text || text.length > 160 || state.settings.selectionMode === 'off') return removeBubble();
      const range = selection.getRangeAt?.(0); if (!range) return; const rect = range.getBoundingClientRect(); if (!rect.width && !rect.height) return;
      if (state.settings.selectionMode === 'auto') { removeBubble(); ensureRoot(); open(); lookup(text); return; }
      showBubble(text, rect);
    }, 10);
  }

  function showBubble(text, rect) {
    removeBubble(); const bubble = el('button','dictfloat-bubble','⌕'); bubble.title = `Look up “${text.slice(0, 42)}”`;
    const left = Math.min(window.innerWidth - 31, Math.max(6, rect.right + 5)); const top = Math.min(window.innerHeight - 31, Math.max(6, rect.top - 3));
    bubble.style.left=`${left}px`; bubble.style.top=`${top}px`; bubble.addEventListener('mousedown', e=>e.preventDefault()); bubble.addEventListener('click', () => { removeBubble(); ensureRoot(); open(); lookup(text); }); document.documentElement.appendChild(bubble); state.bubble=bubble;
  }
  function removeBubble() { state.bubble?.remove(); state.bubble=null; }

  function minimize() { state.minimized=true; render(); }
  function restore() { state.minimized=false; render(); requestAnimationFrame(()=>state.root?.querySelector('.dictfloat-search input')?.focus()); }
  function getPosition() { const w=Math.min(+state.settings.panelWidth||380, window.innerWidth-24); const fallback={ left: Math.max(12,window.innerWidth-w-28), top: Math.max(12,Math.min(88,window.innerHeight-320))}; const pos=state.position||fallback; return {left:Math.min(Math.max(6,pos.left),Math.max(6,window.innerWidth-w-6)), top:Math.min(Math.max(6,pos.top),Math.max(6,window.innerHeight-42))}; }
  function makeDraggable(panel, handle) { let start=null; handle.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return; start={x:e.clientX,y:e.clientY,left:parseInt(panel.style.left,10),top:parseInt(panel.style.top,10)}; handle.setPointerCapture(e.pointerId);}); handle.addEventListener('pointermove',e=>{if(!start)return; const width=panel.offsetWidth; const left=Math.min(Math.max(6,start.left+e.clientX-start.x),window.innerWidth-width-6); const top=Math.min(Math.max(6,start.top+e.clientY-start.y),window.innerHeight-42); panel.style.left=left+'px';panel.style.top=top+'px';}); handle.addEventListener('pointerup',async()=>{if(!start)return;state.position={left:parseInt(panel.style.left,10),top:parseInt(panel.style.top,10)};start=null;await storage.set({dictFloatPanelPosition:state.position});}); }
  function handleGlobalKeys(e) { if (e.key==='Escape' && state.root && !e.target.closest?.('#dictfloat-root')) removeBubble(); }
  function el(tag, cls='', text='') { const node=document.createElement(tag); if(cls)node.className=cls; if(text)node.textContent=text; return node; }
})();
