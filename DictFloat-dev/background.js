const MENU_ID = 'dictfloat-lookup-selection';

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Look up “%s” in DictFloat',
      contexts: ['selection']
    });
  });
  await migrateStorage();
});

chrome.runtime.onStartup.addListener(migrateStorage);
migrateStorage();

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'DICTFLOAT_TOGGLE' });
  } catch (_) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'DICTFLOAT_TOGGLE' });
    } catch (error) {
      console.warn('DictFloat cannot run on this page.', error);
    }
  }
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

async function migrateStorage() {
  const existing = await chrome.storage.local.get(['dictFloatEntries', 'dictFloatSettings', 'dictFloatDictionaries']);
  const settings = { ...defaultSettings(), ...(existing.dictFloatSettings || {}) };
  if (settings.theme === 'light' && !existing.dictFloatSettings?.themeLockedByUser) {
    // Legacy installs treated light as the old default. New default is system.
    settings.theme = 'system';
  }
  const dictionaries = normalizeDictionaries(existing.dictFloatDictionaries);
  let entries = Array.isArray(existing.dictFloatEntries) ? existing.dictFloatEntries : seedEntries();
  entries = entries.map((entry) => ({
    ...entry,
    dictionaryId: entry.dictionaryId || inferDictionaryId(entry),
    updatedAt: entry.updatedAt || Date.now()
  }));
  await chrome.storage.local.set({
    dictFloatSettings: settings,
    dictFloatDictionaries: dictionaries,
    dictFloatEntries: entries
  });
}

function defaultSettings() {
  return {
    selectionMode: 'bubble',
    compactMode: true,
    fontSize: 12,
    panelWidth: 380,
    showPhonetic: true,
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
  const defaults = defaultDictionaries();
  const source = Array.isArray(input) ? input : [];
  const mapped = source.filter(Boolean).map((item) => ({
    id: String(item.id || crypto.randomUUID()),
    name: String(item.name || 'Untitled glossary').trim() || 'Untitled glossary',
    enabled: item.enabled !== false,
    builtIn: !!item.builtIn,
    createdAt: item.createdAt || Date.now()
  }));
  for (const item of defaults) {
    if (!mapped.some((dictionary) => dictionary.id === item.id)) mapped.push(item);
  }
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
        .catch(() => ({ term: query, phonetic: '', definitions: [], providers: [] }))
    : Promise.resolve({ term: query, phonetic: '', definitions: [], providers: [] });

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
  if (!text || typeof text !== 'string') return '';
  return decodeEntities(text).trim();
}

function parseDictionary(data) {
  const first = Array.isArray(data) ? data[0] : null;
  if (!first) return { term: '', phonetic: '', definitions: [], providers: [] };
  const phonetic = first.phonetic || (first.phonetics || []).find((item) => item?.text)?.text || '';
  const definitions = [];
  for (const meaning of first.meanings || []) {
    for (const definition of meaning.definitions || []) {
      if (definition?.definition) definitions.push({ partOfSpeech: meaning.partOfSpeech || '', definition: String(definition.definition).trim() });
      if (definitions.length >= 4) break;
    }
    if (definitions.length >= 4) break;
  }
  return { term: first.word || '', phonetic, definitions, providers: [] };
}

function normalizeComparable(value) { return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function decodeEntities(value) { return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id || !info.selectionText) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'DICTFLOAT_LOOKUP', query: info.selectionText.trim(), open: true });
  } catch (error) {
    console.warn('DictFloat lookup failed.', error);
  }
});

function seedEntries() {
  const now = Date.now();
  return [
    { id: crypto.randomUUID(), dictionaryId: 'pcie-starter', term: 'PCIe', aliases: ['Peripheral Component Interconnect Express', 'PCI Express'], chinese: '高速外设互连标准', definition: 'A high-speed serial computer expansion bus standard used to connect devices such as GPUs, SSDs, NICs, and accelerators.', tags: ['PCIe', 'Interconnect'], category: 'PCIe', source: 'DictFloat starter glossary', updatedAt: now },
    { id: crypto.randomUUID(), dictionaryId: 'pcie-starter', term: 'RCB', aliases: ['Read Completion Boundary'], chinese: '读完成边界', definition: 'A PCIe boundary rule that constrains where Read Completion packets may be split.', tags: ['PCIe', 'Completion', 'TLP'], category: 'PCIe', source: 'DictFloat starter glossary', updatedAt: now },
    { id: crypto.randomUUID(), dictionaryId: 'pcie-starter', term: 'MPS', aliases: ['Max Payload Size', 'Maximum Payload Size'], chinese: '最大有效载荷大小', definition: 'The maximum payload size that a PCIe Transaction Layer Packet may carry.', tags: ['PCIe', 'TLP'], category: 'PCIe', source: 'DictFloat starter glossary', updatedAt: now },
    { id: crypto.randomUUID(), dictionaryId: 'pcie-starter', term: 'MRRS', aliases: ['Max Read Request Size', 'Maximum Read Request Size'], chinese: '最大读请求大小', definition: 'The maximum amount of data requested by a PCIe Memory Read Request.', tags: ['PCIe', 'TLP'], category: 'PCIe', source: 'DictFloat starter glossary', updatedAt: now },
    { id: crypto.randomUUID(), dictionaryId: 'pcie-starter', term: 'Completion Timeout', aliases: ['Cpl Timeout', 'Completion Time-out'], chinese: '完成超时', definition: 'The maximum allowed time to receive a Completion for a non-posted PCIe request before timeout handling is triggered.', tags: ['PCIe', 'Completion', 'Error Handling'], category: 'PCIe', source: 'DictFloat starter glossary', updatedAt: now }
  ];
}
