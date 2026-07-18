const $ = (id) => document.getElementById(id);
const defaults = { selectionMode: 'bubble', fontSize: 12, panelWidth: 380, theme: 'system', onlineLookup: true };
const WUDAO_DB_NAME = 'dictfloat-wudao-v1';
const WUDAO_STORE_NAME = 'packs';
const WUDAO_ACTIVE_PACK_ID = 'active';
const defaultDictionaries = () => [
  { id: 'pcie-starter', name: 'PCIe Starter', enabled: true, builtIn: true, createdAt: 0 },
  { id: 'my-glossary', name: 'My Glossary', enabled: true, builtIn: false, createdAt: Date.now() }
];

let entries = [];
let dictionaries = [];
let mdictSources = [];
let wudaoSource = null;
let sourceOrder = [];

void init();

async function init() {
  const data = await chrome.storage.local.get([
    'dictFloatSettings',
    'dictFloatEntries',
    'dictFloatDictionaries',
    'dictFloatMdictSources',
    'dictFloatWudaoSource',
    'dictFloatSourceOrder'
  ]);
  const settings = { ...defaults, ...(data.dictFloatSettings || {}) };
  entries = (Array.isArray(data.dictFloatEntries) ? data.dictFloatEntries : []).map(normalizeEntry);
  dictionaries = normalizeDictionaries(data.dictFloatDictionaries);
  mdictSources = Array.isArray(data.dictFloatMdictSources) ? data.dictFloatMdictSources.map(normalizeMdictSource) : [];
  wudaoSource = normalizeWudaoSource(data.dictFloatWudaoSource);
  sourceOrder = normalizeSourceOrder(data.dictFloatSourceOrder);

  for (const key of Object.keys(defaults)) {
    const element = $(key);
    if (!element) continue;
    if (element.type === 'checkbox') element.checked = !!settings[key];
    else element.value = settings[key];
  }

  ['selectionMode', 'fontSize', 'panelWidth', 'theme', 'onlineLookup'].forEach((id) => $(id).addEventListener('change', saveSettings));
  $('resetWindowPosition').addEventListener('click', resetWindowPosition);
  $('addDictionary').addEventListener('click', addDictionary);
  $('importMdictFiles').addEventListener('change', importMdictFiles);
  $('importMdictFolder').addEventListener('change', importMdictFiles);
  $('importWudaoFiles').addEventListener('change', importWudaoFiles);
  $('removeWudaoPack').addEventListener('click', removeWudaoPack);
  $('exportJson').addEventListener('click', exportJson);
  $('exportCsv').addEventListener('click', exportCsv);
  $('importFile').addEventListener('change', importFile);
  $('clearEntries').addEventListener('click', clearEntries);

  renderDictionaries();
  renderMdictSources();
  renderWudaoSource();
  renderSourceOrder();
  await chrome.storage.local.set({
    dictFloatDictionaries: dictionaries,
    dictFloatEntries: entries,
    dictFloatMdictSources: mdictSources,
    dictFloatWudaoSource: wudaoSource,
    dictFloatSourceOrder: sourceOrder
  });
}

async function saveSettings() {
  const settings = {
    selectionMode: $('selectionMode').value,
    fontSize: clamp(Number($('fontSize').value), 10, 15, 12),
    panelWidth: clamp(Number($('panelWidth').value), 320, 520, 380),
    theme: $('theme').value,
    onlineLookup: $('onlineLookup').checked,
    themeLockedByUser: true
  };
  $('fontSize').value = settings.fontSize;
  $('panelWidth').value = settings.panelWidth;
  await chrome.storage.local.set({ dictFloatSettings: settings });
  status('Saved. Open windows update immediately.');
}

async function resetWindowPosition() {
  await chrome.storage.local.remove('dictFloatPanelPosition');
  status('Window position reset. Reopen DictFloat to use the default position.');
}

function renderDictionaries() {
  const list = $('dictionaryList');
  list.textContent = '';
  dictionaries.forEach((dictionary) => {
    const row = document.createElement('div');
    row.className = 'dictionary-item';
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = dictionary.enabled !== false;
    enabled.title = 'Include this glossary in search';
    enabled.addEventListener('change', async () => {
      dictionary.enabled = enabled.checked;
      await saveDictionaries();
      status(`${dictionary.name} ${enabled.checked ? 'enabled' : 'disabled'}.`);
    });
    const info = document.createElement('div');
    info.className = 'dictionary-info';
    const name = document.createElement('div');
    name.className = 'dictionary-name';
    name.textContent = dictionary.name;
    const count = entries.filter((entry) => entry.dictionaryId === dictionary.id).length;
    const meta = document.createElement('div');
    meta.className = 'dictionary-meta';
    meta.textContent = `${count} ${count === 1 ? 'entry' : 'entries'}${dictionary.builtIn ? ' · built-in' : ''}`;
    info.append(name, meta);
    const actions = document.createElement('div');
    actions.className = 'dictionary-actions';
    if (!dictionary.builtIn) {
      const rename = makeButton('Rename', () => renameDictionary(dictionary));
      const remove = makeButton('Delete', () => deleteDictionary(dictionary), 'delete');
      actions.append(rename, remove);
    }
    row.append(enabled, info, actions);
    list.append(row);
  });
}

async function addDictionary() {
  const name = prompt('New glossary name:');
  if (!name?.trim()) return;
  dictionaries.push({ id: crypto.randomUUID(), name: name.trim(), enabled: true, builtIn: false, createdAt: Date.now() });
  await saveDictionaries();
  renderDictionaries();
  renderSourceOrder();
  status(`Created “${name.trim()}”.`);
}

async function renameDictionary(dictionary) {
  const name = prompt('Glossary name:', dictionary.name);
  if (!name?.trim() || name.trim() === dictionary.name) return;
  dictionary.name = name.trim();
  await saveDictionaries();
  renderDictionaries();
  renderSourceOrder();
  status('Glossary renamed.');
}

async function deleteDictionary(dictionary) {
  const count = entries.filter((entry) => entry.dictionaryId === dictionary.id).length;
  if (!confirm(`Delete “${dictionary.name}” and its ${count} local ${count === 1 ? 'entry' : 'entries'}?`)) return;
  entries = entries.filter((entry) => entry.dictionaryId !== dictionary.id);
  dictionaries = dictionaries.filter((item) => item.id !== dictionary.id);
  sourceOrder = normalizeSourceOrder(sourceOrder);
  await chrome.storage.local.set({ dictFloatEntries: entries, dictFloatDictionaries: dictionaries, dictFloatSourceOrder: sourceOrder });
  renderDictionaries();
  renderSourceOrder();
  status('Glossary deleted.');
}

async function saveDictionaries() {
  sourceOrder = normalizeSourceOrder(sourceOrder);
  await chrome.storage.local.set({ dictFloatDictionaries: dictionaries, dictFloatSourceOrder: sourceOrder });
  renderSourceOrder();
}

function sourceKeyForGlossary(dictionary) { return `glossary:${dictionary.id}`; }
function sourceKeyForMdict(source) { return `mdx:${source.id}`; }

function knownLookupSources() {
  const sources = dictionaries.map((dictionary) => ({
    key: sourceKeyForGlossary(dictionary),
    type: 'Glossary',
    name: dictionary.name,
    meta: `${entries.filter((entry) => entry.dictionaryId === dictionary.id).length} local entries`,
    enabled: dictionary.enabled !== false
  }));
  if (wudaoSource?.installed) {
    sources.push({
      key: 'wudao', type: 'Offline', name: 'Wudao · Offline',
      meta: wudaoSource.enabled ? 'Enabled for offline lookup' : 'Disabled',
      enabled: wudaoSource.enabled
    });
  }
  mdictSources.forEach((source) => sources.push({
    key: sourceKeyForMdict(source), type: 'MDX / MDD', name: source.name,
    meta: source.status === 'ready' ? 'Ready for lookup' : 'Header imported · decoder in progress',
    enabled: source.enabled !== false
  }));
  sources.push({ key: 'online', type: 'Online', name: 'Online', meta: 'Public online fallback', enabled: $('onlineLookup')?.checked !== false });
  return sources;
}

function normalizeSourceOrder(input) {
  const available = knownLookupSources().map((source) => source.key);
  const requested = Array.isArray(input) ? input.map(String) : [];
  return [...requested.filter((key) => available.includes(key)), ...available.filter((key) => !requested.includes(key))];
}

function renderSourceOrder() {
  const list = $('sourceOrderList');
  if (!list) return;
  sourceOrder = normalizeSourceOrder(sourceOrder);
  const sourceMap = new Map(knownLookupSources().map((source) => [source.key, source]));
  list.textContent = '';
  sourceOrder.forEach((key, index) => {
    const source = sourceMap.get(key);
    if (!source) return;
    const row = document.createElement('div');
    row.className = 'dictionary-item source-order-item';
    const indexDot = document.createElement('span');
    indexDot.className = 'source-order-index';
    indexDot.textContent = String(index + 1);
    const info = document.createElement('div');
    info.className = 'dictionary-info';
    const name = document.createElement('div');
    name.className = 'dictionary-name';
    name.textContent = source.name;
    const meta = document.createElement('div');
    meta.className = 'dictionary-meta';
    meta.textContent = `${source.type} · ${source.meta}${source.enabled ? '' : ' · disabled'}`;
    info.append(name, meta);
    const actions = document.createElement('div');
    actions.className = 'dictionary-actions order-actions';
    const up = makeButton('↑', () => moveSource(key, -1));
    const down = makeButton('↓', () => moveSource(key, 1));
    up.title = 'Move up';
    down.title = 'Move down';
    up.disabled = index === 0;
    down.disabled = index === sourceOrder.length - 1;
    actions.append(up, down);
    row.append(indexDot, info, actions);
    list.append(row);
  });
}

async function moveSource(key, delta) {
  const index = sourceOrder.indexOf(key);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= sourceOrder.length) return;
  [sourceOrder[index], sourceOrder[target]] = [sourceOrder[target], sourceOrder[index]];
  await chrome.storage.local.set({ dictFloatSourceOrder: sourceOrder });
  renderSourceOrder();
  status('Lookup order saved. The first source is shown first.');
}

async function importMdictFiles(event) {
  const files = [...(event.target.files || [])];
  event.target.value = '';
  if (!files.length) return;
  const mdxFiles = files.filter((file) => file.name.toLowerCase().endsWith('.mdx'));
  const mddFiles = files.filter((file) => file.name.toLowerCase().endsWith('.mdd'));
  if (!mdxFiles.length) {
    status('Choose at least one .mdx file.', true);
    return;
  }

  try {
    const newSources = [];
    for (const mdx of mdxFiles) {
      const header = await parseMdictHeader(mdx);
      const base = basename(mdx.name);
      const basePattern = new RegExp('^' + escapeRegExp(base) + '(?:\\.\\d+)?$', 'i');
      const matchingMdds = mddFiles.filter((file) => basePattern.test(basename(file.name)));
      const source = normalizeMdictSource({
        id: crypto.randomUUID(),
        name: header.title || base,
        enabled: true,
        fileName: mdx.name,
        fileSize: mdx.size,
        lastModified: mdx.lastModified,
        addedAt: Date.now(),
        header,
        mddFiles: matchingMdds.map((file) => ({ name: file.name, size: file.size, lastModified: file.lastModified })),
        status: 'header-ready'
      });
      mdictSources = mdictSources.filter((item) => !(item.fileName === source.fileName && item.fileSize === source.fileSize));
      mdictSources.unshift(source);
      newSources.push(source);
    }
    await saveMdictSources();
    renderMdictSources();
    renderSourceOrder();
    const pairCount = newSources.filter((source) => source.mddFiles.length).length;
    status(`Added ${newSources.length} MDX source${newSources.length === 1 ? '' : 's'}; ${pairCount} matched MDD resource pair${pairCount === 1 ? '' : 's'}.`);
  } catch (error) {
    status(`MDX import failed: ${error.message}`, true);
  }
}

function renderMdictSources() {
  const list = $('mdictSourceList');
  list.textContent = '';
  if (!mdictSources.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.textContent = 'No MDX / MDD source has been added yet.';
    list.append(empty);
    return;
  }

  mdictSources.forEach((source) => {
    const row = document.createElement('div');
    row.className = 'dictionary-item';
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = source.enabled !== false;
    enabled.title = 'Enable this MDX source in DictFloat lookup order';
    enabled.addEventListener('change', async () => {
      source.enabled = enabled.checked;
      await saveMdictSources();
      status(`${source.name} ${enabled.checked ? 'enabled' : 'disabled'}.`);
    });
    const info = document.createElement('div');
    info.className = 'dictionary-info';
    const name = document.createElement('div');
    name.className = 'dictionary-name';
    name.textContent = source.name;
    const meta = document.createElement('div');
    meta.className = 'dictionary-meta';
    const engine = source.header.engineVersion ? `Engine ${source.header.engineVersion}` : 'MDict header';
    const encoding = source.header.encoding || 'encoding unknown';
    const mdd = source.mddFiles.length ? `${source.mddFiles.length} MDD resource file${source.mddFiles.length === 1 ? '' : 's'}` : 'no MDD resources attached';
    meta.textContent = `${source.fileName} · ${formatSize(source.fileSize)} · ${engine} · ${encoding} · ${mdd}`;
    const state = document.createElement('div');
    state.className = 'source-status';
    state.textContent = source.status === 'ready' ? 'Ready for lookup' : 'Header imported · lookup decoder in progress';
    info.append(name, meta, state);
    const actions = document.createElement('div');
    actions.className = 'dictionary-actions';
    actions.append(makeButton('Remove', () => removeMdictSource(source), 'delete'));
    row.append(enabled, info, actions);
    list.append(row);
  });
}

async function removeMdictSource(source) {
  if (!confirm(`Remove the MDX source record for “${source.name}”? The original files on disk are not changed.`)) return;
  mdictSources = mdictSources.filter((item) => item.id !== source.id);
  sourceOrder = normalizeSourceOrder(sourceOrder);
  await saveMdictSources();
  await chrome.storage.local.set({ dictFloatSourceOrder: sourceOrder });
  renderMdictSources();
  renderSourceOrder();
  status('MDX source record removed.');
}

async function saveMdictSources() {
  sourceOrder = normalizeSourceOrder(sourceOrder);
  await chrome.storage.local.set({ dictFloatMdictSources: mdictSources, dictFloatSourceOrder: sourceOrder });
}

async function parseMdictHeader(file) {
  if (file.size < 12) throw new Error('The file is too small to be an MDX dictionary.');
  const prefix = new Uint8Array(await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).arrayBuffer());
  const headerLength = readU32BE(prefix, 0);
  if (!headerLength || headerLength > 1024 * 1024 || 4 + headerLength + 4 > file.size) {
    throw new Error('Unable to read an MDict header. The file may be encrypted or not be a valid MDX file.');
  }
  const headerBytes = prefix.slice(4, 4 + headerLength);
  const headerText = decodeMdictHeader(headerBytes);
  if (!/<Dictionary\b/i.test(headerText)) throw new Error('This file does not contain a recognizable MDict Dictionary header.');
  const attributes = parseXmlAttributes(headerText);
  return {
    title: attributes.Title || attributes.title || '',
    description: attributes.Description || attributes.description || '',
    engineVersion: attributes.GeneratedByEngineVersion || attributes.EngineVersion || attributes.Version || '',
    encoding: attributes.Encoding || attributes.encoding || '',
    encrypted: attributes.Encrypted || attributes.encrypted || '0',
    keyCaseSensitive: attributes.KeyCaseSensitive || '',
    stripKey: attributes.StripKey || ''
  };
}

function decodeMdictHeader(bytes) {
  const hasAlternatingNulls = bytes.length > 4 && bytes[1] === 0 && bytes[3] === 0;
  const text = hasAlternatingNulls
    ? new TextDecoder('utf-16le').decode(bytes)
    : new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return text.replace(/^\uFEFF/, '').replace(/\0/g, '').trim();
}

function parseXmlAttributes(text) {
  const root = text.match(/<Dictionary\b[^>]*>/i)?.[0] || text;
  const attrs = {};
  root.replace(/([A-Za-z][\w.-]*)\s*=\s*(["'])(.*?)\2/g, (_all, key, _quote, value) => {
    attrs[key] = decodeXml(value);
    return _all;
  });
  return attrs;
}

function readU32BE(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function decodeXml(value) {
  return String(value || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function basename(filename) {
  return String(filename || '').replace(/\.(mdx|mdd)$/i, '');
}
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function normalizeMdictSource(source) {
  return {
    id: String(source.id || crypto.randomUUID()),
    name: String(source.name || basename(source.fileName) || 'Untitled MDX dictionary'),
    enabled: source.enabled !== false,
    fileName: String(source.fileName || ''),
    fileSize: Number(source.fileSize || 0),
    lastModified: Number(source.lastModified || 0),
    addedAt: Number(source.addedAt || Date.now()),
    header: {
      title: String(source.header?.title || ''),
      description: String(source.header?.description || ''),
      engineVersion: String(source.header?.engineVersion || ''),
      encoding: String(source.header?.encoding || ''),
      encrypted: String(source.header?.encrypted || '0'),
      keyCaseSensitive: String(source.header?.keyCaseSensitive || ''),
      stripKey: String(source.header?.stripKey || '')
    },
    mddFiles: Array.isArray(source.mddFiles) ? source.mddFiles.map((item) => ({ name: String(item.name || ''), size: Number(item.size || 0), lastModified: Number(item.lastModified || 0) })) : [],
    status: 'header-ready'
  };
}

function exportJson() {
  download('dictfloat-glossaries.json', JSON.stringify({
    format: 'dictfloat-glossaries',
    version: 3,
    dictionaries,
    entries,
    mdictSources,
    sourceOrder
  }, null, 2), 'application/json');
  status(`Exported ${entries.length} entries, ${dictionaries.length} glossaries, and ${mdictSources.length} MDX source record${mdictSources.length === 1 ? '' : 's'}.`);
}

function exportCsv() {
  const headers = ['dictionary', 'term', 'aliases', 'chinese', 'definition', 'tags', 'related', 'category', 'source'];
  const csv = [headers.join(','), ...entries.map((entry) => headers.map((key) => {
    const value = key === 'dictionary'
      ? (dictionaryFor(entry.dictionaryId)?.name || 'My Glossary')
      : (Array.isArray(entry[key]) ? entry[key].join(', ') : (entry[key] || ''));
    return csvEscape(value);
  }).join(','))].join('\n');
  download('dictfloat-glossary.csv', csv, 'text/csv;charset=utf-8');
  status(`Exported ${entries.length} entries as CSV.`);
}

async function importFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    let incoming = [];
    let incomingDictionaries = [];
    let incomingMdictSources = [];
    let incomingSourceOrder = [];
    if (file.name.toLowerCase().endsWith('.json')) {
      const json = JSON.parse(text);
      incoming = Array.isArray(json) ? json : (json.entries || []);
      incomingDictionaries = Array.isArray(json.dictionaries) ? json.dictionaries : [];
      incomingMdictSources = Array.isArray(json.mdictSources) ? json.mdictSources : [];
      incomingSourceOrder = Array.isArray(json.sourceOrder) ? json.sourceOrder : [];
    } else {
      incoming = parseCsv(text).map((row) => ({ ...row, dictionaryId: dictionaryIdByName(row.dictionary) || 'my-glossary' }));
    }
    incomingDictionaries.forEach((dictionary) => {
      if (!dictionaries.some((item) => item.id === dictionary.id)) dictionaries.push({
        ...dictionary,
        id: String(dictionary.id || crypto.randomUUID()),
        name: String(dictionary.name || 'Imported glossary'),
        enabled: dictionary.enabled !== false,
        builtIn: false
      });
    });
    incoming = incoming.map(normalizeEntry).filter((entry) => entry.term && entry.definition);
    if (!incoming.length && !incomingMdictSources.length) throw new Error('No valid entries or MDX source records found.');
    const byKey = new Map(entries.map((entry) => [`${entry.dictionaryId}:${entry.term.toLowerCase()}`, entry]));
    incoming.forEach((entry) => byKey.set(`${entry.dictionaryId}:${entry.term.toLowerCase()}`, entry));
    entries = [...byKey.values()];
    incomingMdictSources.map(normalizeMdictSource).forEach((source) => {
      mdictSources = mdictSources.filter((item) => item.id !== source.id && !(item.fileName === source.fileName && item.fileSize === source.fileSize));
      mdictSources.push(source);
    });
    sourceOrder = normalizeSourceOrder(incomingSourceOrder.length ? incomingSourceOrder : sourceOrder);
    await chrome.storage.local.set({ dictFloatEntries: entries, dictFloatDictionaries: dictionaries, dictFloatMdictSources: mdictSources, dictFloatSourceOrder: sourceOrder });
    renderDictionaries();
    renderMdictSources();
    renderSourceOrder();
    status(`Imported ${incoming.length} entries and ${incomingMdictSources.length} MDX source record${incomingMdictSources.length === 1 ? '' : 's'}.`);
  } catch (error) {
    status(`Import failed: ${error.message}`, true);
  }
}

async function clearEntries() {
  if (!confirm('Clear every DictFloat glossary entry? Export a JSON backup first if you may need them later.')) return;
  entries = [];
  await chrome.storage.local.set({ dictFloatEntries: [] });
  renderDictionaries();
  status('All glossary entries cleared. MDX source records were kept.');
}

function normalizeEntry(entry) {
  return {
    id: entry.id || crypto.randomUUID(),
    dictionaryId: String(entry.dictionaryId || dictionaryIdByName(entry.dictionary) || 'my-glossary'),
    term: String(entry.term || '').trim(),
    aliases: arr(entry.aliases),
    chinese: String(entry.chinese || '').trim(),
    definition: String(entry.definition || '').trim(),
    tags: arr(entry.tags),
    related: arr(entry.related),
    category: String(entry.category || '').trim(),
    source: String(entry.source || '').trim() || 'Imported glossary',
    favorite: !!entry.favorite,
    updatedAt: entry.updatedAt || Date.now()
  };
}

function normalizeDictionaries(input) {
  const result = Array.isArray(input)
    ? input.filter(Boolean).map((item) => ({
      id: String(item.id || crypto.randomUUID()),
      name: String(item.name || 'Untitled glossary').trim() || 'Untitled glossary',
      enabled: item.enabled !== false,
      builtIn: !!item.builtIn,
      createdAt: item.createdAt || Date.now()
    }))
    : [];
  defaultDictionaries().forEach((item) => {
    if (!result.some((dictionary) => dictionary.id === item.id)) result.push(item);
  });
  return result;
}

function dictionaryFor(id) { return dictionaries.find((dictionary) => dictionary.id === id); }
function dictionaryIdByName(name) {
  const wanted = String(name || '').trim().toLowerCase();
  return dictionaries.find((dictionary) => dictionary.name.toLowerCase() === wanted)?.id;
}
function arr(value) {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((item) => item.trim())) rows.push(row);
      row = []; cell = ''; continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  const headers = (rows.shift() || []).map((item) => item.trim().toLowerCase());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}
function csvEscape(value) { const string = String(value); return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string; }
function download(name, text, type) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([text], { type }));
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
}
function makeButton(text, handler, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  if (className) button.className = className;
  button.addEventListener('click', handler);
  return button;
}
function status(message, error = false) {
  const node = $('status');
  node.textContent = message;
  node.style.color = error ? '#b42318' : '';
}
function formatSize(size) {
  if (!size) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const power = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
  const value = size / (1024 ** power);
  return `${value >= 10 || power === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[power]}`;
}
function clamp(value, min, max, fallback) { return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback; }


// ---------------------------------------------------------------------------
// Optional Wudao offline pack. The original data is user-selected; this
// extension intentionally does not ship or redistribute the data files.
// ---------------------------------------------------------------------------

function normalizeWudaoSource(source) {
  const input = source && typeof source === 'object' ? source : {};
  return {
    installed: !!input.installed,
    enabled: input.enabled !== false && !!input.installed,
    importedAt: Number(input.importedAt || 0),
    totalSize: Number(input.totalSize || 0),
    recordCounts: {
      en: Number(input.recordCounts?.en || 0),
      zh: Number(input.recordCounts?.zh || 0)
    },
    fileNames: {
      enIndex: String(input.fileNames?.enIndex || 'en.ind'),
      enData: String(input.fileNames?.enData || 'en.z'),
      zhIndex: String(input.fileNames?.zhIndex || 'zh.ind'),
      zhData: String(input.fileNames?.zhData || 'zh.z')
    },
    source: 'Wudao-dict local data pack'
  };
}

async function importWudaoFiles(event) {
  const files = [...(event.target.files || [])];
  event.target.value = '';
  if (!files.length) return;
  const selected = classifyWudaoFiles(files);
  const missing = Object.entries(selected).filter(([, file]) => !file).map(([key]) => wudaoLabel(key));
  if (missing.length) {
    status(`Choose all four Wudao files together. Missing: ${missing.join(', ')}.`, true);
    return;
  }
  try {
    const [enCount, zhCount] = await Promise.all([validateWudaoIndex(selected.enIndex), validateWudaoIndex(selected.zhIndex)]);
    const totalSize = Object.values(selected).reduce((sum, file) => sum + file.size, 0);
    const pack = {
      id: WUDAO_ACTIVE_PACK_ID,
      importedAt: Date.now(),
      files: selected
    };
    await writeWudaoPack(pack);
    await chrome.runtime.sendMessage({ type: 'DICTFLOAT_WUDAO_RESET' }).catch(() => undefined);
    wudaoSource = normalizeWudaoSource({
      installed: true,
      enabled: true,
      importedAt: pack.importedAt,
      totalSize,
      recordCounts: { en: enCount, zh: zhCount },
      fileNames: Object.fromEntries(Object.entries(selected).map(([key, file]) => [key, file.name]))
    });
    await chrome.storage.local.set({ dictFloatWudaoSource: wudaoSource });
    renderWudaoSource();
    sourceOrder = normalizeSourceOrder(sourceOrder);
    await chrome.storage.local.set({ dictFloatSourceOrder: sourceOrder });
    renderSourceOrder();
    status(`Wudao offline pack imported: ${enCount.toLocaleString()} English and ${zhCount.toLocaleString()} Chinese index entries.`);
  } catch (error) {
    status(`Wudao import failed: ${error.message}`, true);
  }
}

function classifyWudaoFiles(files) {
  const result = { enIndex: null, enData: null, zhIndex: null, zhData: null };
  files.forEach((file) => {
    const name = file.name.toLowerCase();
    if (name === 'en.ind') result.enIndex = file;
    else if (name === 'en.z') result.enData = file;
    else if (name === 'zh.ind') result.zhIndex = file;
    else if (name === 'zh.z') result.zhData = file;
  });
  return result;
}

function wudaoLabel(key) {
  return ({ enIndex: 'en.ind', enData: 'en.z', zhIndex: 'zh.ind', zhData: 'zh.z' })[key] || key;
}

async function validateWudaoIndex(file) {
  if (file.size < 32) throw new Error(`${file.name} is too small to be a Wudao index.`);
  const text = await file.text();
  const rows = text.split(/\r?\n/).filter(Boolean);
  const valid = rows.filter((row) => /^.+\|\d+$/.test(row)).length;
  if (valid < 100) throw new Error(`${file.name} does not look like a Wudao index file.`);
  return valid;
}

function renderWudaoSource() {
  const list = $('wudaoSourceStatus');
  if (!list) return;
  list.textContent = '';
  const row = document.createElement('div');
  row.className = 'dictionary-item';
  if (!wudaoSource?.installed) {
    const info = document.createElement('div');
    info.className = 'dictionary-info';
    info.append(Object.assign(document.createElement('div'), { className: 'dictionary-name', textContent: 'No local Wudao pack' }));
    info.append(Object.assign(document.createElement('div'), { className: 'dictionary-meta', textContent: 'Import the four data files to enable offline English–Chinese and Chinese–English lookup.' }));
    row.append(info);
    list.append(row);
    $('removeWudaoPack').disabled = true;
    return;
  }
  $('removeWudaoPack').disabled = false;
  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabled.checked = wudaoSource.enabled !== false;
  enabled.title = 'Use this local Wudao pack during lookup';
  enabled.addEventListener('change', async () => {
    wudaoSource.enabled = enabled.checked;
    await chrome.storage.local.set({ dictFloatWudaoSource: wudaoSource });
    renderWudaoSource();
    renderSourceOrder();
    status(`Wudao offline pack ${wudaoSource.enabled ? 'enabled' : 'disabled'}.`);
  });
  const info = document.createElement('div');
  info.className = 'dictionary-info';
  const name = document.createElement('div');
  name.className = 'dictionary-name';
  name.textContent = 'Wudao offline dictionary';
  const meta = document.createElement('div');
  meta.className = 'dictionary-meta';
  meta.textContent = `${wudaoSource.recordCounts.en.toLocaleString()} English · ${wudaoSource.recordCounts.zh.toLocaleString()} Chinese · ${formatSize(wudaoSource.totalSize)} stored locally`;
  const ready = document.createElement('div');
  ready.className = 'wudao-status wudao-ready';
  ready.textContent = wudaoSource.enabled ? 'Ready for offline lookup' : 'Stored locally · disabled';
  info.append(name, meta, ready);
  row.append(enabled, info);
  list.append(row);
}

async function removeWudaoPack() {
  if (!wudaoSource?.installed) return;
  if (!confirm('Remove the local Wudao data pack from DictFloat? Your original files outside Chrome are not changed.')) return;
  try {
    await deleteWudaoPack();
    await chrome.runtime.sendMessage({ type: 'DICTFLOAT_WUDAO_RESET' }).catch(() => undefined);
    wudaoSource = normalizeWudaoSource(null);
    await chrome.storage.local.set({ dictFloatWudaoSource: wudaoSource });
    sourceOrder = normalizeSourceOrder(sourceOrder);
    await chrome.storage.local.set({ dictFloatSourceOrder: sourceOrder });
    renderWudaoSource();
    renderSourceOrder();
    status('Wudao offline pack removed.');
  } catch (error) {
    status(`Unable to remove Wudao pack: ${error.message}`, true);
  }
}

function openWudaoDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WUDAO_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WUDAO_STORE_NAME)) db.createObjectStore(WUDAO_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open local dictionary storage.'));
  });
}

async function writeWudaoPack(pack) {
  const db = await openWudaoDb();
  try {
    await new Promise((resolve, reject) => {
      const request = db.transaction(WUDAO_STORE_NAME, 'readwrite').objectStore(WUDAO_STORE_NAME).put(pack, WUDAO_ACTIVE_PACK_ID);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Unable to store local Wudao data.'));
    });
  } finally { db.close(); }
}

async function deleteWudaoPack() {
  const db = await openWudaoDb();
  try {
    await new Promise((resolve, reject) => {
      const request = db.transaction(WUDAO_STORE_NAME, 'readwrite').objectStore(WUDAO_STORE_NAME).delete(WUDAO_ACTIVE_PACK_ID);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Unable to delete local Wudao data.'));
    });
  } finally { db.close(); }
}
