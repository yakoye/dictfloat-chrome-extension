const $ = (id) => document.getElementById(id);
const defaults = { selectionMode: 'bubble', fontSize: 12, panelWidth: 380, theme: 'system', onlineLookup: true };
const WUDAO_DB_NAME = 'dictfloat-wudao-v1';
const WUDAO_STORE_NAME = 'packs';
const WUDAO_ACTIVE_PACK_ID = 'active';
const defaultDictionaries = () => [
  { id: 'pcie-starter', name: 'PCIe Starter', enabled: true, builtIn: true, sourceKind: 'built-in', createdAt: 0 },
  { id: 'my-glossary', name: 'My Glossary', enabled: true, builtIn: false, sourceKind: 'manual', createdAt: Date.now() }
];

let entries = [];
let dictionaries = [];
let mdictSources = [];
let wudaoSource = null;
let sourceOrder = [];
let draggedSourceKey = '';

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

  ['selectionMode', 'fontSize', 'panelWidth', 'theme', 'onlineLookup'].forEach((id) => $(id).addEventListener('change', async () => { await saveSettings(); renderDictionaryLibrary(); }));
  $('resetWindowPosition').addEventListener('click', resetWindowPosition);
  $('newGlossaryAction').addEventListener('click', async () => { closeAddSourceMenu(); await addDictionary(); });
  $('connectMdictFolder').addEventListener('click', async () => { closeAddSourceMenu(); await connectMdictFolder(); });
  $('cancelMdictIndex').addEventListener('click', cancelMdictIndex);
  $('importWudaoFiles').addEventListener('change', importWudaoFiles);
  $('exportJson').addEventListener('click', exportJson);
  $('exportCsv').addEventListener('click', exportCsv);
  $('importFile').addEventListener('change', importFile);
  $('clearEntries').addEventListener('click', clearEntries);
  $('toggleAddSource').addEventListener('click', toggleAddSourceMenu);
  document.addEventListener('click', (event) => {
    const wrap = document.querySelector('.library-add-wrap');
    if (wrap && !wrap.contains(event.target)) closeAddSourceMenu();
  });

  renderDictionaryLibrary();
  await chrome.storage.local.set({
    dictFloatDictionaries: dictionaries,
    dictFloatEntries: entries,
    dictFloatMdictSources: mdictSources,
    dictFloatWudaoSource: wudaoSource,
    dictFloatSourceOrder: sourceOrder
  });
}

function toggleAddSourceMenu() {
  const menu = $('addSourceMenu');
  const button = $('toggleAddSource');
  if (!menu || !button) return;
  const open = menu.hidden;
  menu.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
}

function closeAddSourceMenu() {
  const menu = $('addSourceMenu');
  const button = $('toggleAddSource');
  if (!menu || !button) return;
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
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

function renderDictionaries() { renderDictionaryLibrary(); }
function renderMdictSources() { renderDictionaryLibrary(); }
function renderWudaoSource() { renderDictionaryLibrary(); }
function renderSourceOrder() { renderDictionaryLibrary(); }

function renderDictionaryLibrary() {
  const list = $('librarySourceList');
  if (!list) return;
  sourceOrder = normalizeSourceOrder(sourceOrder);
  list.textContent = '';
  const sourceMap = new Map(knownLookupSources().map((source) => [source.key, source]));

  sourceOrder.forEach((key, index) => {
    const summary = sourceMap.get(key);
    if (!summary) return;
    let row;
    if (key.startsWith('glossary:')) row = buildGlossaryLibraryRow(dictionaries.find((item) => sourceKeyForGlossary(item) === key), index);
    else if (key.startsWith('mdx:')) row = buildMdictLibraryRow(mdictSources.find((item) => sourceKeyForMdict(item) === key), index);
    else if (key === 'wudao' && wudaoSource?.installed) row = buildWudaoLibraryRow(index);
    else if (key === 'online') row = buildOnlineLibraryRow(index);
    if (row) list.append(row);
  });

  if (!list.children.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.textContent = 'No dictionary source yet. Use + Add source to connect a dictionary or create a glossary.';
    list.append(empty);
  }
}

function makeLibraryBaseRow(index, key, enabled, title, kind, fileLine, stateLine, toggleHandler) {
  const row = document.createElement('div');
  row.className = 'dictionary-item library-source-item';
  row.dataset.sourceKey = key;

  const drag = document.createElement('span');
  drag.className = 'source-drag-handle';
  drag.textContent = '⠿';
  drag.title = 'Drag to change lookup order';
  drag.setAttribute('aria-label', 'Drag to change lookup order');
  drag.setAttribute('role', 'button');
  drag.draggable = true;

  const order = document.createElement('span');
  order.className = 'source-order-index';
  order.textContent = String(index + 1);
  order.title = `Lookup order ${index + 1}`;
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = enabled !== false;
  check.title = 'Include this source in lookup';
  check.addEventListener('change', () => toggleHandler(check.checked));
  const info = document.createElement('div');
  info.className = 'dictionary-info';
  const titleLine = document.createElement('div');
  titleLine.className = 'library-title-line';
  const name = document.createElement('div');
  name.className = 'dictionary-name';
  name.textContent = title;
  const chip = document.createElement('span');
  chip.className = 'library-kind';
  chip.textContent = kind;
  titleLine.append(name, chip);
  const file = document.createElement('div');
  file.className = 'dictionary-meta library-file-link';
  file.textContent = fileLine;
  const state = document.createElement('div');
  state.className = 'source-status';
  state.textContent = stateLine;
  info.append(titleLine, file, state);
  const actions = document.createElement('div');
  actions.className = 'dictionary-actions library-actions';
  row.append(drag, order, check, info, actions);
  attachSourceDragHandlers(row, drag, key);
  return { row, actions };
}

function attachSourceDragHandlers(row, handle, key) {
  handle.addEventListener('dragstart', (event) => {
    draggedSourceKey = key;
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', key);
  });
  handle.addEventListener('dragend', () => {
    draggedSourceKey = '';
    document.querySelectorAll('.library-source-item').forEach((node) => node.classList.remove('is-dragging', 'drop-before', 'drop-after'));
  });
  row.addEventListener('dragover', (event) => {
    const sourceKey = draggedSourceKey || event.dataTransfer.getData('text/plain');
    if (!sourceKey || sourceKey === key) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const before = event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
    row.classList.toggle('drop-before', before);
    row.classList.toggle('drop-after', !before);
  });
  row.addEventListener('dragleave', (event) => {
    if (!row.contains(event.relatedTarget)) row.classList.remove('drop-before', 'drop-after');
  });
  row.addEventListener('drop', async (event) => {
    const sourceKey = draggedSourceKey || event.dataTransfer.getData('text/plain');
    if (!sourceKey || sourceKey === key) return;
    event.preventDefault();
    const before = row.classList.contains('drop-before');
    row.classList.remove('drop-before', 'drop-after');
    await moveSourceByDrag(sourceKey, key, before);
  });
}

async function moveSourceByDrag(sourceKey, targetKey, before) {
  const next = [...sourceOrder];
  const from = next.indexOf(sourceKey);
  if (from < 0) return;
  next.splice(from, 1);
  const target = next.indexOf(targetKey);
  if (target < 0) return;
  next.splice(before ? target : target + 1, 0, sourceKey);
  sourceOrder = normalizeSourceOrder(next);
  await chrome.storage.local.set({ dictFloatSourceOrder: sourceOrder });
  renderDictionaryLibrary();
}

function buildGlossaryLibraryRow(dictionary, index) {
  if (!dictionary) return null;
  const count = entries.filter((entry) => entry.dictionaryId === dictionary.id).length;
  const fileLabel = dictionary.fileName
    ? `🔗 ${dictionary.fileName} · ${count} editable ${count === 1 ? 'entry' : 'entries'}`
    : `✎ Editable glossary · ${count} ${count === 1 ? 'entry' : 'entries'}`;
  const kind = dictionary.builtIn ? 'Built-in' : 'Glossary';
  const state = dictionary.builtIn ? 'Included with DictFloat · read-only source' : 'Editable locally · JSON / CSV export available';
  const { row, actions } = makeLibraryBaseRow(index, sourceKeyForGlossary(dictionary), dictionary.enabled, dictionary.name, kind, fileLabel, state, async (checked) => {
    dictionary.enabled = checked;
    await saveDictionaries();
    renderDictionaryLibrary();
    status(`${dictionary.name} ${checked ? 'enabled' : 'disabled'}.`);
  });
  if (!dictionary.builtIn) {
    actions.append(makeButton('Rename', () => renameDictionary(dictionary)));
    actions.append(makeButton('Export', () => exportGlossary(dictionary)));
    actions.append(makeButton('Remove', () => deleteDictionary(dictionary), 'delete'));
  }
  return row;
}

function buildMdictLibraryRow(source, index) {
  if (!source) return null;
  const css = source.cssFiles.length ? `${source.cssFiles.length} CSS` : 'Compact style';
  const mdd = source.mddFiles.length ? `${source.mddFiles.length} MDD` : 'No MDD';
  const fileLine = `🔗 ${source.fileName || source.name} · ${formatSize(source.fileSize)} · ${css} · ${mdd}`;
  const state = source.status === 'ready'
    ? `Linked · on-demand lookup · ${source.cssMode === 'compact' ? 'Compact style' : 'Original CSS'}`
    : 'Reconnect required · original file was not copied into Chrome';
  const { row, actions } = makeLibraryBaseRow(index, sourceKeyForMdict(source), source.enabled, source.name, 'Linked MDX', fileLine, state, async (checked) => {
    source.enabled = checked;
    await saveMdictSources();
    renderDictionaryLibrary();
    status(`${source.name} ${checked ? 'enabled' : 'disabled'}.`);
  });
  actions.append(makeButton('Rename', () => renameMdictSource(source)));
  if (source.status === 'ready') actions.append(makeButton('Rebuild', () => rebuildMdictSource(source)));
  else actions.append(makeButton('Reconnect', () => reconnectMdictSource(source)));
  if (source.cssFiles.length) {
    const style = makeButton(source.cssMode === 'compact' ? 'Style: Compact' : 'Style: Original', () => toggleMdictStyle(source));
    style.title = 'Toggle safe original CSS / DictFloat compact style';
    actions.append(style);
  }
  actions.append(makeButton('Export', () => exportMdictConfig(source)));
  actions.append(makeButton('Remove', () => removeMdictSource(source), 'delete'));
  return row;
}

function buildWudaoLibraryRow(index) {
  const names = wudaoSource.fileNames;
  const fileLine = `📦 ${names.enIndex} · ${names.enData} · ${names.zhIndex} · ${names.zhData} · ${formatSize(wudaoSource.totalSize)}`;
  const state = `${wudaoSource.recordCounts.en.toLocaleString()} English · ${wudaoSource.recordCounts.zh.toLocaleString()} Chinese · stored locally`;
  const { row, actions } = makeLibraryBaseRow(index, 'wudao', wudaoSource.enabled, wudaoSource.name || 'Wudao · Offline', 'Offline pack', fileLine, state, async (checked) => {
    wudaoSource.enabled = checked;
    await chrome.storage.local.set({ dictFloatWudaoSource: wudaoSource });
    renderDictionaryLibrary();
    status(`Wudao offline pack ${checked ? 'enabled' : 'disabled'}.`);
  });
  actions.append(makeButton('Rename', renameWudaoSource));
  actions.append(makeButton('Replace', () => $('importWudaoFiles').click()));
  actions.append(makeButton('Export', exportWudaoConfig));
  actions.append(makeButton('Remove', removeWudaoPack, 'delete'));
  return row;
}

function buildOnlineLibraryRow(index) {
  const { row, actions } = makeLibraryBaseRow(index, 'online', $('onlineLookup')?.checked !== false, 'Online', 'Fallback', '☁ Public dictionary and translation services', 'Only the actively queried term is sent online', async (checked) => {
    $('onlineLookup').checked = checked;
    await saveSettings();
    renderDictionaryLibrary();
  });
  return row;
}


async function addDictionary() {
  const name = prompt('New glossary name:');
  if (!name?.trim()) return;
  dictionaries.push({ id: crypto.randomUUID(), name: name.trim(), enabled: true, builtIn: false, sourceKind: 'manual', createdAt: Date.now() });
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

function exportGlossary(dictionary) {
  const selectedEntries = entries.filter((entry) => entry.dictionaryId === dictionary.id);
  download(`${safeFileName(dictionary.name)}.dictfloat.json`, JSON.stringify({
    format: 'dictfloat-glossary', version: 4, dictionary, entries: selectedEntries
  }, null, 2), 'application/json');
  status(`Exported ${selectedEntries.length} ${selectedEntries.length === 1 ? 'entry' : 'entries'} from “${dictionary.name}”.`);
}

function exportMdictConfig(source) {
  const config = { format: 'dictfloat-linked-mdx-config', version: 4, source: {
    ...source,
    // Handles stay inside the local browser database and are never exported.
    fileHandle: undefined, folderHandle: undefined
  }};
  download(`${safeFileName(source.name)}.dictfloat-mdx.json`, JSON.stringify(config, null, 2), 'application/json');
  status(`Exported the connection settings for “${source.name}”. Reconnect the local folder after restoring on another computer.`);
}

async function renameMdictSource(source) {
  const next = prompt('Dictionary display name:', source.name);
  if (!next?.trim() || next.trim() === source.name) return;
  source.name = next.trim();
  await saveMdictSources();
  renderDictionaryLibrary();
  status('Dictionary display name updated.');
}

async function renameWudaoSource() {
  if (!wudaoSource?.installed) return;
  const next = prompt('Dictionary display name:', wudaoSource.name || 'Wudao · Offline');
  if (!next?.trim() || next.trim() === (wudaoSource.name || 'Wudao · Offline')) return;
  wudaoSource.name = next.trim();
  await chrome.storage.local.set({ dictFloatWudaoSource: wudaoSource });
  renderDictionaryLibrary();
  status('Wudao display name updated.');
}

function exportWudaoConfig() {
  if (!wudaoSource?.installed) return;
  download(`${safeFileName(wudaoSource.name || 'Wudao Offline')}.dictfloat-wudao.json`, JSON.stringify({
    format: 'dictfloat-wudao-config', version: 4, source: wudaoSource,
    note: 'This export contains settings only. The original four Wudao data files are not copied or redistributed.'
  }, null, 2), 'application/json');
  status('Exported Wudao source settings. The original four data files remain local.');
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
      key: 'wudao', type: 'Offline', name: wudaoSource.name || 'Wudao · Offline',
      meta: wudaoSource.enabled ? 'Enabled for offline lookup' : 'Disabled',
      enabled: wudaoSource.enabled
    });
  }
  mdictSources.forEach((source) => sources.push({
    key: sourceKeyForMdict(source), type: 'MDX / MDD', name: source.name,
    meta: source.status === 'ready' ? `${(source.recordCount || 0).toLocaleString()} headwords · linked, on-demand text` : 'Reconnect folder to create a lightweight index',
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


let activeMdictWorker = null;
let activeMdictRequestId = '';

async function connectMdictFolder() {
  if (!('showDirectoryPicker' in window)) {
    status('This Chrome build does not support folder linking. Update Chrome and try again.', true);
    return;
  }
  try {
    const folderHandle = await window.showDirectoryPicker({ mode: 'read' });
    const files = await collectDirectoryFiles(folderHandle);
    const mdxCandidates = selectMdxCandidates(files);
    if (!mdxCandidates.length) throw new Error('No .mdx file was found in the selected folder.');

    const imported = [];
    for (let index = 0; index < mdxCandidates.length; index += 1) {
      const candidate = mdxCandidates[index];
      status(`Connecting ${candidate.name} (${index + 1}/${mdxCandidates.length})…`);
      const existing = mdictSources.find((item) => item.fileName === candidate.name && item.directoryPath === candidate.directoryPath);
      const source = await linkMdictCandidate(folderHandle, candidate, files, existing?.id || null);
      mdictSources = mdictSources.filter((item) => item.id !== source.id && !(item.fileName === source.fileName && item.directoryPath === source.directoryPath));
      mdictSources.unshift(source);
      imported.push(source);
      await saveMdictSources();
      renderMdictSources();
      renderSourceOrder();
    }
    status(`Connected ${imported.length} MDX dictionar${imported.length === 1 ? 'y' : 'ies'} with lightweight, on-demand lookup.`);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    status(`MDX connection failed: ${error.message || error}`, true);
  } finally {
    setMdictIndexBusy(false);
  }
}

async function reconnectMdictSource(source) {
  if (!('showDirectoryPicker' in window)) {
    status('Folder relinking needs a current Chrome desktop build.', true);
    return;
  }
  try {
    const folderHandle = await window.showDirectoryPicker({ mode: 'read' });
    const files = await collectDirectoryFiles(folderHandle);
    const candidate = files.find((item) => item.kind === 'file' && /\.mdx$/i.test(item.name) && item.name === source.fileName)
      || selectMdxCandidates(files).find((item) => basename(item.name) === basename(source.fileName));
    if (!candidate) throw new Error(`Could not find ${source.fileName} in the selected folder.`);
    status(`Reconnecting ${candidate.name}…`);
    const linked = await linkMdictCandidate(folderHandle, candidate, files, source.id);
    const at = mdictSources.findIndex((item) => item.id === source.id);
    if (at >= 0) mdictSources[at] = linked;
    else mdictSources.unshift(linked);
    await saveMdictSources();
    renderMdictSources();
    renderSourceOrder();
    status(`Reconnected “${linked.name}”.`);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    status(`Reconnect failed: ${error.message || error}`, true);
  } finally {
    setMdictIndexBusy(false);
  }
}

function cancelMdictIndex() {
  if (activeMdictWorker) {
    activeMdictWorker.postMessage({ type: 'cancel' });
    status('Cancelling lightweight index…');
  }
}

function setMdictIndexBusy(busy) {
  const connect = $('connectMdictFolder');
  const cancel = $('cancelMdictIndex');
  if (connect) connect.disabled = !!busy;
  if (cancel) cancel.hidden = !busy;
}

async function collectDirectoryFiles(directoryHandle) {
  const output = [];
  async function walk(handle, path = '') {
    for await (const [name, child] of handle.entries()) {
      const relativePath = path ? `${path}/${name}` : name;
      if (child.kind === 'directory') await walk(child, relativePath);
      else output.push({ kind: 'file', name, path: relativePath, directoryPath: path, handle: child });
    }
  }
  await walk(directoryHandle);
  return output;
}

function selectMdxCandidates(files) {
  const all = files.filter((item) => item.kind === 'file' && /\.mdx$/i.test(item.name));
  const byDirectory = new Map();
  all.forEach((item) => {
    const list = byDirectory.get(item.directoryPath) || [];
    list.push(item); byDirectory.set(item.directoryPath, list);
  });
  const picked = [];
  byDirectory.forEach((list) => {
    const preferred = list.find((item) => !/(大小写不敏感|case[- ]?insensitive)/i.test(item.name)) || list[0];
    picked.push(preferred);
  });
  return picked;
}

function resourcesForCandidate(candidate, files) {
  const own = files.filter((item) => item.kind === 'file' && (item.directoryPath === candidate.directoryPath || item.directoryPath.startsWith(`${candidate.directoryPath}/`)));
  const base = basename(candidate.name);
  const mdds = own.filter((item) => /\.mdd$/i.test(item.name) && new RegExp(`^${escapeRegExp(base)}(?:\\.\\d+)?\\.mdd$`, 'i').test(item.name));
  const css = own.filter((item) => /\.css$/i.test(item.name));
  return { mdds, css };
}

async function linkMdictCandidate(folderHandle, candidate, allFiles, reuseId) {
  const file = await candidate.handle.getFile();
  setMdictIndexBusy(true);
  const index = await buildLightMdictIndex(file, (progress) => {
    const percentage = Number.isFinite(progress?.fraction) ? ` ${Math.round(progress.fraction * 100)}%` : '';
    status(`${candidate.name}: ${progress?.message || 'Building lightweight index…'}${percentage}`);
  });
  const resources = resourcesForCandidate(candidate, allFiles);
  const source = normalizeMdictSource({
    id: reuseId || crypto.randomUUID(),
    name: index.header?.title || basename(candidate.name),
    enabled: true,
    fileName: candidate.name,
    fileSize: file.size,
    lastModified: file.lastModified,
    directoryPath: candidate.directoryPath,
    linkedFolderName: folderHandle.name || 'Selected folder',
    addedAt: Date.now(),
    header: index.header,
    lookup: index.lookup,
    mddFiles: await Promise.all(resources.mdds.map(async (item) => {
      const resource = await item.handle.getFile();
      return { name: item.path, size: resource.size, lastModified: resource.lastModified };
    })),
    cssFiles: await Promise.all(resources.css.map(async (item) => {
      const resource = await item.handle.getFile();
      return { name: item.path, size: resource.size, lastModified: resource.lastModified };
    })),
    recordCount: index.entryCount,
    parser: 'dictfloat-linked-mdx-v1',
    cssMode: resources.css.length ? 'safe-original' : 'compact',
    status: 'ready'
  });
  index.fileSize = file.size;
  index.lastModified = file.lastModified;
  await DictFloatMdictDB.putLinkedSource({
    id: source.id,
    folderHandle,
    mdxHandle: candidate.handle,
    mddHandles: resources.mdds.map((item) => ({ name: item.path, handle: item.handle })),
    cssHandles: resources.css.map((item) => ({ name: item.path, handle: item.handle })),
    index,
    cssMode: source.cssMode,
    linkedAt: Date.now()
  });
  await chrome.runtime.sendMessage({ type: 'DICTFLOAT_MDICT_CLEAR_CACHE', sourceId: source.id });
  return source;
}

function buildLightMdictIndex(file, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(chrome.runtime.getURL('mdict-worker.js'));
    const requestId = crypto.randomUUID();
    activeMdictWorker = worker;
    activeMdictRequestId = requestId;
    worker.onmessage = (event) => {
      const message = event.data || {};
      if (message.requestId !== requestId) return;
      if (message.type === 'progress') onProgress(message.progress || {});
      if (message.type === 'done') {
        worker.terminate();
        if (activeMdictRequestId === requestId) { activeMdictWorker = null; activeMdictRequestId = ''; }
        resolve(message.index);
      }
      if (message.type === 'error') {
        worker.terminate();
        if (activeMdictRequestId === requestId) { activeMdictWorker = null; activeMdictRequestId = ''; }
        reject(Object.assign(new Error(message.error || 'MDX index failed.'), { name: message.name || 'Error' }));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      if (activeMdictRequestId === requestId) { activeMdictWorker = null; activeMdictRequestId = ''; }
      reject(new Error(event.message || 'MDX index worker failed.'));
    };
    worker.postMessage({ type: 'build-index', requestId, file });
  });
}


async function rebuildMdictSource(source) {
  try {
    const linked = await DictFloatMdictDB.getLinkedSource(source.id);
    if (!linked?.mdxHandle) throw new Error('The original linked folder is not available. Use Reconnect.');
    const allowed = !linked.mdxHandle.queryPermission || (await linked.mdxHandle.queryPermission({ mode: 'read' })) === 'granted';
    if (!allowed) throw new Error('Chrome needs folder permission again. Use Reconnect.');
    const file = await linked.mdxHandle.getFile();
    status(`Rebuilding lightweight map for ${source.fileName}…`);
    setMdictIndexBusy(true);
    const index = await buildLightMdictIndex(file, (progress) => {
      const percentage = Number.isFinite(progress?.fraction) ? ` ${Math.round(progress.fraction * 100)}%` : '';
      status(`${source.fileName}: ${progress?.message || 'Rebuilding…'}${percentage}`);
    });
    index.fileSize = file.size;
    index.lastModified = file.lastModified;
    linked.index = index;
    linked.cssMode = source.cssMode;
    await DictFloatMdictDB.putLinkedSource(linked);
    source.recordCount = index.entryCount;
    source.header = index.header;
    source.lookup = index.lookup;
    source.fileSize = file.size;
    source.lastModified = file.lastModified;
    source.status = 'ready';
    await saveMdictSources();
    await chrome.runtime.sendMessage({ type: 'DICTFLOAT_MDICT_CLEAR_CACHE', sourceId: source.id });
    renderMdictSources();
    renderSourceOrder();
    status(`Rebuilt “${source.name}” without copying its definitions.`);
  } catch (error) {
    status(`Rebuild failed: ${error.message || error}`, true);
  } finally {
    setMdictIndexBusy(false);
  }
}

async function toggleMdictStyle(source) {
  source.cssMode = source.cssMode === 'compact' ? 'safe-original' : 'compact';
  try {
    const linked = await DictFloatMdictDB.getLinkedSource(source.id);
    if (linked) { linked.cssMode = source.cssMode; await DictFloatMdictDB.putLinkedSource(linked); }
    await saveMdictSources();
    await chrome.runtime.sendMessage({ type: 'DICTFLOAT_MDICT_CLEAR_CACHE', sourceId: source.id });
    renderMdictSources();
    status(`${source.name}: ${source.cssMode === 'compact' ? 'compact style' : 'safe original CSS'} enabled.`);
  } catch (error) {
    status(`Style update failed: ${error.message || error}`, true);
  }
}

async function removeMdictSource(source) {
  if (!confirm(`Remove “${source.name}” and its local MDX text index? Your original files on disk are not changed.`)) return;
  try {
    if (globalThis.DictFloatMdictDB) await DictFloatMdictDB.deleteLinkedSource(source.id);
    await chrome.runtime.sendMessage({ type: 'DICTFLOAT_MDICT_CLEAR_CACHE', sourceId: source.id });
    mdictSources = mdictSources.filter((item) => item.id !== source.id);
    sourceOrder = normalizeSourceOrder(sourceOrder);
    await saveMdictSources();
    await chrome.storage.local.set({ dictFloatSourceOrder: sourceOrder });
    renderMdictSources();
    renderSourceOrder();
    status('MDX dictionary removed.');
  } catch (error) {
    status(`Unable to remove the MDX dictionary: ${error.message}`, true);
  }
}

async function saveMdictSources() {
  sourceOrder = normalizeSourceOrder(sourceOrder);
  await chrome.storage.local.set({ dictFloatMdictSources: mdictSources, dictFloatSourceOrder: sourceOrder });
}

function basename(filename) {
  return String(filename || '').replace(/\.(mdx|mdd)$/i, '');
}
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function normalizeMdictSource(source) {
  const status = source.status === 'ready' && Number(source.recordCount || 0) > 0 ? 'ready' : 'reconnect';
  return {
    id: String(source.id || crypto.randomUUID()),
    name: String(source.name || basename(source.fileName) || 'Untitled MDX dictionary'),
    enabled: source.enabled !== false,
    fileName: String(source.fileName || ''),
    fileSize: Number(source.fileSize || 0),
    lastModified: Number(source.lastModified || 0),
    directoryPath: String(source.directoryPath || ''),
    linkedFolderName: String(source.linkedFolderName || ''),
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
    lookup: {
      caseSensitive: source.lookup?.caseSensitive === true,
      stripKey: source.lookup?.stripKey !== false
    },
    mddFiles: Array.isArray(source.mddFiles) ? source.mddFiles.map((item) => ({ name: String(item.name || ''), size: Number(item.size || 0), lastModified: Number(item.lastModified || 0) })) : [],
    cssFiles: Array.isArray(source.cssFiles) ? source.cssFiles.map((item) => ({ name: String(item.name || ''), size: Number(item.size || 0), lastModified: Number(item.lastModified || 0) })) : [],
    recordCount: Number(source.recordCount || 0),
    parser: String(source.parser || ''),
    cssMode: source.cssMode === 'compact' ? 'compact' : 'safe-original',
    status
  };
}


function exportJson() {
  download('dictfloat-glossaries.json', JSON.stringify({
    format: 'dictfloat-glossaries',
    version: 4,
    dictionaries,
    entries,
    mdictSources,
    wudaoSource,
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
    const importedName = basenameForDisplay(file.name) || 'Imported glossary';
    if (file.name.toLowerCase().endsWith('.json')) {
      const json = JSON.parse(text);
      incoming = Array.isArray(json) ? json : (json.entries || []);
      incomingDictionaries = Array.isArray(json.dictionaries) ? json.dictionaries : (json.dictionary ? [json.dictionary] : []);
      incomingMdictSources = Array.isArray(json.mdictSources) ? json.mdictSources : [];
      incomingSourceOrder = Array.isArray(json.sourceOrder) ? json.sourceOrder : [];
    } else {
      incoming = parseCsv(text);
    }

    let fallbackDictionary = null;
    if (!incomingDictionaries.length && incoming.length) {
      fallbackDictionary = { id: crypto.randomUUID(), name: importedName, enabled: true, builtIn: false, sourceKind: 'imported', fileName: file.name, importedAt: Date.now(), createdAt: Date.now() };
      incomingDictionaries = [fallbackDictionary];
    }
    incomingDictionaries.forEach((dictionary) => {
      const normalized = {
        ...dictionary,
        id: String(dictionary.id || crypto.randomUUID()),
        name: String(dictionary.name || importedName || 'Imported glossary'),
        enabled: dictionary.enabled !== false,
        builtIn: false,
        sourceKind: 'imported',
        fileName: String(dictionary.fileName || file.name),
        importedAt: Number(dictionary.importedAt || Date.now()),
        createdAt: dictionary.createdAt || Date.now()
      };
      const existing = dictionaries.find((item) => item.id === normalized.id || (item.fileName && item.fileName === normalized.fileName));
      if (existing) Object.assign(existing, normalized);
      else dictionaries.push(normalized);
    });
    const fallbackId = fallbackDictionary?.id || incomingDictionaries[0]?.id || 'my-glossary';
    incoming = incoming.map((entry) => normalizeEntry({
      ...entry,
      dictionaryId: entry.dictionaryId || dictionaryIdByName(entry.dictionary) || fallbackId,
      source: entry.source || file.name
    })).filter((entry) => entry.term && entry.definition);
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
    renderDictionaryLibrary();
    status(`Imported ${incoming.length} editable ${incoming.length === 1 ? 'entry' : 'entries'} from ${file.name}.`);
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
      sourceKind: String(item.sourceKind || (item.fileName ? 'imported' : (item.builtIn ? 'built-in' : 'manual'))),
      fileName: String(item.fileName || ''),
      importedAt: Number(item.importedAt || 0),
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
function safeFileName(value) { return String(value || 'dictfloat').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'dictfloat'; }
function basenameForDisplay(value) { return String(value || '').replace(/\.[^/.]+$/, '').trim(); }

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
    name: String(input.name || 'Wudao · Offline'),
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
      name: wudaoSource?.name || 'Wudao · Offline',
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
