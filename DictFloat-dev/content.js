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
    settings: { selectionMode: 'bubble', compactMode: true, fontSize: 12, panelWidth: 380, showPhonetic: true, theme: 'system' },
    entries: [],
    history: [],
    position: null
  };

  const storage = chrome.storage.local;

  init();

  async function init() {
    const data = await storage.get(['dictFloatEntries', 'dictFloatSettings', 'dictFloatHistory', 'dictFloatPanelPosition']);
    state.entries = Array.isArray(data.dictFloatEntries) ? data.dictFloatEntries : [];
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
    if (changes.dictFloatEntries) state.entries = Array.isArray(changes.dictFloatEntries.newValue) ? changes.dictFloatEntries.newValue : [];
    if (changes.dictFloatHistory) state.history = Array.isArray(changes.dictFloatHistory.newValue) ? changes.dictFloatHistory.newValue : [];
    if (changes.dictFloatSettings) state.settings = { ...state.settings, ...(changes.dictFloatSettings.newValue || {}) };
    if (state.root?.isConnected && (changes.dictFloatEntries || changes.dictFloatSettings || changes.dictFloatHistory)) render();
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
    input.addEventListener('input', () => { state.query = input.value; state.selectedId = null; renderContentOnly(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') lookup(input.value); if (e.key === 'Escape') { input.value = ''; state.query = ''; renderContentOnly(); } });
    const clearBtn = el('button', 'dictfloat-search-clear', '×');
    clearBtn.type = 'button';
    clearBtn.title = 'Clear search';
    clearBtn.setAttribute('aria-label', 'Clear search');
    clearBtn.hidden = !input.value;
    clearBtn.addEventListener('click', () => {
      input.value = '';
      state.query = '';
      state.selectedId = null;
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
      if (entry) return fillEntry(box, entry);
    }
    if (!state.query.trim()) {
      const welcome = el('div', 'dictfloat-empty');
      welcome.innerHTML = '<div style="font-size:20px;margin-bottom:6px">⌕</div><strong>Search locally</strong><br><span>Type a word, phrase, abbreviation, or Chinese term.</span>';
      box.append(welcome);
      if (state.entries.length) {
        const div = el('div', 'dictfloat-divider'); box.append(div);
        const recent = el('div', 'dictfloat-meta', 'Starter glossary'); box.append(recent);
        state.entries.slice(0, 5).forEach(entry => box.append(resultItem(entry)));
      }
      return;
    }
    if (!results.length) {
      const empty = el('div', 'dictfloat-empty');
      empty.innerHTML = `<strong>No local result</strong><br><span>Try another spelling, alias, tag, or add it to your glossary.</span>`;
      const addCurrent = el('button', 'dictfloat-add-current', `+ Add “${truncate(state.query, 34)}”`);
      addCurrent.addEventListener('click', () => { state.view = 'add'; renderContentOnly(); updateTabs(); });
      empty.append(document.createElement('br'), addCurrent);
      box.append(empty); return;
    }
    results.forEach(entry => box.append(resultItem(entry)));
  }

  function resultItem(entry) {
    const item = el('article', 'dictfloat-result-item');
    item.append(el('div', 'dictfloat-result-title', entry.term));
    if (entry.chinese) item.append(el('div', 'dictfloat-result-preview', entry.chinese));
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
    const meta = [entry.category, entry.source].filter(Boolean).join(' · '); if (meta) box.append(el('div','dictfloat-meta',meta));
    const divider = el('div','dictfloat-divider'); box.append(divider);
    const actions = el('div','dictfloat-footer');
    const back = el('button','', '← Results'); back.addEventListener('click', () => { state.selectedId = null; renderContentOnly(); });
    const copy = el('button','', 'Copy'); copy.addEventListener('click', async () => { await navigator.clipboard.writeText(formatCopy(entry)); copy.textContent='Copied'; setTimeout(()=>copy.textContent='Copy',900); });
    const edit = el('button','', 'Edit'); edit.addEventListener('click', () => fillEditForm(box, entry));
    actions.append(back, el('span','grow'), copy, edit); box.append(actions);
  }

  function fillAddForm(box, editing) {
    // Preserve the just-looked-up text so building a personal glossary is one step.
    const entry = editing || { term: state.query.trim(), aliases:[], chinese:'', definition:'', tags:[], category:'', source:'My glossary' };
    box.append(el('div','dictfloat-meta', editing ? 'Edit local entry' : 'Add to My Glossary'));
    const form = el('form','dictfloat-add-form');
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
    form.addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(form); const term = String(fd.get('term')||'').trim(); const definition=String(fd.get('definition')||'').trim(); if (!term || !definition) return; const value = { ...entry, id: entry.id || crypto.randomUUID(), term, chinese:String(fd.get('chinese')||'').trim(), aliases:list(fd.get('aliases')), tags:list(fd.get('tags')), category:String(fd.get('category')||'').trim(), source:String(fd.get('source')||'').trim()||'My glossary', definition, updatedAt:Date.now() }; if (editing) state.entries = state.entries.map(x=>x.id===entry.id?value:x); else state.entries.unshift(value); await saveEntries(); state.view='lookup'; state.query=term; state.selectedId=value.id; renderContentOnly(); updateTabs(); });
    box.append(form);
  }

  function fillEditForm(box, entry) { box.innerHTML = ''; fillAddForm(box, entry); }
  function fillHistory(box) { if (!state.history.length) { box.append(el('div','dictfloat-empty','No lookup history yet.')); return; } state.history.forEach(h => { const entry = state.entries.find(e=>e.id===h.id); if (entry) box.append(resultItem(entry)); }); }

  function footer() {
    const foot = el('footer','dictfloat-footer');
    const settings = el('button','', '⚙ Settings'); settings.addEventListener('click', () => chrome.runtime.sendMessage({type:'DICTFLOAT_OPEN_OPTIONS'}));
    const mdx = el('button','', 'MDX'); mdx.title = 'MDX import is planned for a later version'; mdx.addEventListener('click', () => alert('MDX / MDD import is planned for DictFloat v0.3.\nThis v0.1 build supports local custom glossary entries and JSON / CSV import/export in Settings.'));
    foot.append(settings, el('span','grow'), mdx); return foot;
  }

  function lookup(raw) {
    const q = String(raw || '').trim(); state.query = q; state.view='lookup'; state.selectedId=null;
    const best = queryEntries(q)[0]; if (best) { state.selectedId = best.id; addHistory(best); }
    render(); requestAnimationFrame(()=>{ const input=state.root?.querySelector('.dictfloat-search input'); if(input){input.focus(); input.select();} });
  }

  async function addHistory(entry) {
    state.history = [{ id: entry.id, at: Date.now() }, ...state.history.filter(x => x.id !== entry.id)].slice(0, 30);
    await storage.set({ dictFloatHistory: state.history });
  }
  async function saveEntries() { await storage.set({ dictFloatEntries: state.entries }); }

  function queryEntries(raw) {
    const q = normalize(raw); if (!q) return state.entries.filter(e=>e.favorite).concat(state.entries.filter(e=>!e.favorite)).slice(0,20);
    return state.entries.map(entry => ({entry, score: score(entry,q)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score || a.entry.term.localeCompare(b.entry.term)).map(x=>x.entry);
  }
  function score(entry,q) {
    const term=normalize(entry.term), aliases=(entry.aliases||[]).map(normalize), chinese=normalize(entry.chinese), tags=(entry.tags||[]).map(normalize), def=normalize(entry.definition);
    if(term===q) return 100; if(aliases.includes(q)) return 95; if(term.startsWith(q)) return 82; if(aliases.some(x=>x.startsWith(q))) return 75; if(term.includes(q)) return 65; if(aliases.some(x=>x.includes(q))) return 58; if(chinese.includes(q)) return 52; if(tags.some(x=>x.includes(q))) return 42; if(def.includes(q)) return 20; return 0;
  }
  function normalize(s) { return String(s||'').toLowerCase().replace(/[\s_\-./]+/g,' ').trim(); }
  function list(value) { return String(value||'').split(',').map(x=>x.trim()).filter(Boolean); }
  function formatCopy(e) { return `${e.term}${e.chinese ? `\n${e.chinese}` : ''}\n${e.definition}${e.aliases?.length?`\nAliases: ${e.aliases.join(', ')}`:''}`; }
  function truncate(value, max) { const text = String(value || ''); return text.length > max ? `${text.slice(0, max - 1)}…` : text; }

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
