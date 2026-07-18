const MENU_ID = 'dictfloat-lookup-selection';
const CONTENT_RUNTIME_VERSION = '0.3.2';

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Look up “%s” in DictFloat',
    contexts: ['selection']
  });
  await migrateStorage();
});

chrome.runtime.onStartup.addListener(migrateStorage);
void migrateStorage();

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await sendToTab(tab.id, { type: 'DICTFLOAT_TOGGLE' });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'DICTFLOAT_OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (message?.type === 'DICTFLOAT_ONLINE_LOOKUP') {
    lookupOnline(String(message.query || ''))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id || !info.selectionText) return;
  await sendToTab(tab.id, { type: 'DICTFLOAT_LOOKUP', query: info.selectionText.trim() });
});

async function sendToTab(tabId, message) {
  try {
    const current = await probeContent(tabId);
    if (!current) {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await waitForCurrentContent(tabId);
    }
    await chrome.tabs.sendMessage(tabId, message);
    // A previous extension build may still have a listener in this tab.
    // Let the current build prune any host it left behind after this action.
    await chrome.tabs.sendMessage(tabId, { type: 'DICTFLOAT_REPAIR' }).catch(() => undefined);
  } catch (error) {
    console.warn('DictFloat cannot run on this page.', error);
  }
}

async function probeContent(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'DICTFLOAT_PING' });
    return response?.version === CONTENT_RUNTIME_VERSION;
  } catch (_) {
    return false;
  }
}

async function waitForCurrentContent(tabId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await probeContent(tabId)) return;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error('DictFloat content script did not initialize');
}

async function migrateStorage() {
  const existing = await chrome.storage.local.get([
    'dictFloatEntries',
    'dictFloatSettings',
    'dictFloatDictionaries',
    'dictFloatMdictSources'
  ]);
  const settings = { ...defaultSettings(), ...(existing.dictFloatSettings || {}) };
  if (settings.theme === 'light' && !existing.dictFloatSettings?.themeLockedByUser) settings.theme = 'system';
  const dictionaries = normalizeDictionaries(existing.dictFloatDictionaries);
  let entries = Array.isArray(existing.dictFloatEntries) ? existing.dictFloatEntries : seedEntries();
  entries = entries.map((entry) => ({
    ...entry,
    dictionaryId: entry.dictionaryId || inferDictionaryId(entry),
    related: Array.isArray(entry.related) ? entry.related : [],
    updatedAt: entry.updatedAt || Date.now()
  }));
  const mdictSources = Array.isArray(existing.dictFloatMdictSources) ? existing.dictFloatMdictSources : [];
  await chrome.storage.local.set({
    dictFloatSettings: settings,
    dictFloatDictionaries: dictionaries,
    dictFloatEntries: entries,
    dictFloatMdictSources: mdictSources
  });
}

function defaultSettings() {
  return {
    selectionMode: 'bubble',
    fontSize: 12,
    panelWidth: 380,
    theme: 'system',
    onlineLookup: true
  };
}

function defaultDictionaries() {
  return [
    { id: 'pcie-starter', name: 'PCIe Starter', enabled: true, builtIn: true, createdAt: 0 },
    { id: 'my-glossary', name: 'My Glossary', enabled: true, builtIn: false, createdAt: Date.now() }
  ];
}

function normalizeDictionaries(input) {
  const source = Array.isArray(input) ? input : [];
  const mapped = source.filter(Boolean).map((item) => ({
    id: String(item.id || crypto.randomUUID()),
    name: String(item.name || 'Untitled glossary').trim() || 'Untitled glossary',
    enabled: item.enabled !== false,
    builtIn: !!item.builtIn,
    createdAt: item.createdAt || Date.now()
  }));
  defaultDictionaries().forEach((item) => {
    if (!mapped.some((dictionary) => dictionary.id === item.id)) mapped.push(item);
  });
  return mapped;
}

function inferDictionaryId(entry) {
  return String(entry?.source || '').includes('DictFloat starter') ? 'pcie-starter' : 'my-glossary';
}

async function lookupOnline(rawQuery) {
  const query = rawQuery.trim().replace(/\s+/g, ' ');
  if (!query || query.length > 160) throw new Error('Invalid query');
  const isChinese = /[\u3400-\u9fff]/.test(query);
  const translationPair = isChinese ? 'zh-CN|en' : 'en|zh-CN';
  const translationPromise = fetchJson(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=${encodeURIComponent(translationPair)}`
  ).then(parseMyMemory).catch(() => '');
  const canUseDictionary = !isChinese && /^[A-Za-z][A-Za-z\s'’-]{0,80}$/.test(query);
  const dictionaryPromise = canUseDictionary
    ? fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query)}`)
        .then(parseDictionary)
        .catch(() => ({ term: query, phonetic: '', definitions: [] }))
    : Promise.resolve({ term: query, phonetic: '', definitions: [] });
  const [translation, dictionary] = await Promise.all([translationPromise, dictionaryPromise]);
  const cleanTranslation = normalizeComparable(translation) === normalizeComparable(query) ? '' : translation;
  const providers = [];
  if (dictionary.definitions.length || dictionary.phonetic) providers.push('Free Dictionary API');
  if (cleanTranslation) providers.push('MyMemory');
  if (!providers.length) throw new Error('No online result');
  return {
    term: dictionary.term || query,
    phonetic: dictionary.phonetic || '',
    definitions: dictionary.definitions || [],
    translation: cleanTranslation,
    providers
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseMyMemory(data) {
  const text = data?.responseData?.translatedText;
  return typeof text === 'string' ? decodeEntities(text).trim() : '';
}

function parseDictionary(data) {
  const first = Array.isArray(data) ? data[0] : null;
  if (!first) return { term: '', phonetic: '', definitions: [] };
  const phonetic = first.phonetic || (first.phonetics || []).find((item) => item?.text)?.text || '';
  const definitions = [];
  for (const meaning of first.meanings || []) {
    for (const definition of meaning.definitions || []) {
      if (definition?.definition) definitions.push({ partOfSpeech: meaning.partOfSpeech || '', definition: String(definition.definition).trim() });
      if (definitions.length >= 4) break;
    }
    if (definitions.length >= 4) break;
  }
  return { term: first.word || '', phonetic, definitions };
}

function normalizeComparable(value) { return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function decodeEntities(value) {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function seedEntries() {
  const now = Date.now();
  return [
    { id: crypto.randomUUID(), dictionaryId: 'pcie-starter', term: 'PCIe', aliases: ['Peripheral Component Interconnect Express', 'PCI Express'], chinese: '高速外设互连标准', definition: 'A high-speed serial computer expansion bus standard used to connect devices such as GPUs, SSDs, NICs, and accelerators.', tags: ['PCIe', 'Interconnect'], related: ['MPS', 'MRRS', 'RCB'], category: 'PCIe', source: 'DictFloat starter glossary', updatedAt: now },
    { id: crypto.randomUUID(), dictionaryId: 'pcie-starter', term: 'RCB', aliases: ['Read Completion Boundary'], chinese: '读完成边界', definition: 'A PCIe boundary rule that constrains where Read Completion packets may be split.', tags: ['PCIe', 'Completion', 'TLP'], related: ['Completion Timeout', 'MPS'], category: 'PCIe', source: 'DictFloat starter glossary', updatedAt: now },
    { id: crypto.randomUUID(), dictionaryId: 'pcie-starter', term: 'MPS', aliases: ['Max Payload Size', 'Maximum Payload Size'], chinese: '最大有效载荷大小', definition: 'The maximum payload size that a PCIe Transaction Layer Packet may carry.', tags: ['PCIe', 'TLP'], related: ['MRRS', 'RCB'], category: 'PCIe', source: 'DictFloat starter glossary', updatedAt: now },
    { id: crypto.randomUUID(), dictionaryId: 'pcie-starter', term: 'MRRS', aliases: ['Max Read Request Size', 'Maximum Read Request Size'], chinese: '最大读请求大小', definition: 'The maximum amount of data requested by a PCIe Memory Read Request.', tags: ['PCIe', 'TLP'], related: ['MPS', 'Completion Timeout'], category: 'PCIe', source: 'DictFloat starter glossary', updatedAt: now },
    { id: crypto.randomUUID(), dictionaryId: 'pcie-starter', term: 'Completion Timeout', aliases: ['Cpl Timeout', 'Completion Time-out'], chinese: '完成超时', definition: 'The maximum allowed time to receive a Completion for a non-posted PCIe request before timeout handling is triggered.', tags: ['PCIe', 'Completion', 'Error Handling'], related: ['RCB', 'MRRS'], category: 'PCIe', source: 'DictFloat starter glossary', updatedAt: now }
  ];
}
