importScripts('mdict-db.js', 'mdict-core.js');

const MENU_ID = 'dictfloat-lookup-selection';
const CONTENT_RUNTIME_VERSION = chrome.runtime.getManifest().version;
const WUDAO_DB_NAME = 'dictfloat-wudao-v1';
const WUDAO_STORE_NAME = 'packs';
const WUDAO_ACTIVE_PACK_ID = 'active';
const wudaoIndexCache = new Map();

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
  if (message?.type === 'DICTFLOAT_WUDAO_LOOKUP') {
    lookupWudao(String(message.query || ''))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === 'DICTFLOAT_MDICT_LOOKUP') {
    lookupMdict(message.source || {}, String(message.query || ''))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === 'DICTFLOAT_BRIDGE_TRANSLATE') {
    translateWithWebBridge(String(message.text || ''), Array.isArray(message.providers) ? message.providers : [], sender?.tab?.id || null)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === 'DICTFLOAT_SENTENCE_API_TRANSLATE') {
    translateWithSentenceApi(String(message.text || ''), String(message.provider || ''))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === 'DICTFLOAT_CUSTOM_AI_TRANSLATE') {
    translateWithCustomAi(String(message.text || ''), String(message.providerId || ''))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === 'DICTFLOAT_CUSTOM_AI_TEST') {
    translateWithCustomAi(String(message.text || 'DictFloat is a compact floating dictionary for reading English webpages.'), String(message.providerId || ''), { allowDisabled: true })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === 'DICTFLOAT_WUDAO_RESET') {
    wudaoIndexCache.clear();
    sendResponse({ ok: true });
    return;
  }
  if (message?.type === 'DICTFLOAT_MDICT_CLEAR_CACHE') {
    globalThis.DictFloatMdictCore?.clearCache?.(message.sourceId || '');
    sendResponse({ ok: true });
    return;
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id || !info.selectionText) return;
  await sendToTab(tab.id, { type: 'DICTFLOAT_LOOKUP', query: info.selectionText.trim() }, info.frameId ?? 0);
});

async function sendToTab(tabId, message, frameId = 0) {
  const frameOptions = Number.isInteger(frameId) && frameId !== 0 ? { frameId } : undefined;
  const target = Number.isInteger(frameId) && frameId !== 0 ? { tabId, frameIds: [frameId] } : { tabId };
  try {
    const current = await probeContent(tabId, frameOptions);
    if (!current) {
      await chrome.scripting.executeScript({ target, files: ['content.js'] });
      await waitForCurrentContent(tabId, frameOptions);
    }
    await chrome.tabs.sendMessage(tabId, message, frameOptions);
    // A previous extension build may still have a listener in this tab.
    // Let the current build prune any host it left behind after this action.
    await chrome.tabs.sendMessage(tabId, { type: 'DICTFLOAT_REPAIR' }, frameOptions).catch(() => undefined);
  } catch (error) {
    console.warn('DictFloat cannot run on this page.', error);
  }
}

async function probeContent(tabId, frameOptions) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'DICTFLOAT_PING' }, frameOptions);
    return response?.version === CONTENT_RUNTIME_VERSION;
  } catch (_) {
    return false;
  }
}

async function waitForCurrentContent(tabId, frameOptions) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await probeContent(tabId, frameOptions)) return;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error('DictFloat content script did not initialize');
}

async function migrateStorage() {
  const existing = await chrome.storage.local.get([
    'dictFloatEntries',
    'dictFloatSettings',
    'dictFloatDictionaries',
    'dictFloatMdictSources',
    'dictFloatWudaoSource'
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
  const wudaoSource = normalizeWudaoSource(existing.dictFloatWudaoSource);
  await chrome.storage.local.set({
    dictFloatSettings: settings,
    dictFloatDictionaries: dictionaries,
    dictFloatEntries: entries,
    dictFloatMdictSources: mdictSources,
    dictFloatWudaoSource: wudaoSource
  });
}


function defaultSentenceTranslationConfigs() {
  return {
    microsoft: { endpoint: 'https://api.cognitive.microsofttranslator.com', region: '', from: 'en', to: 'zh-Hans' },
    hunyuan: { apiUrl: 'https://api.hunyuan.cloud.tencent.com/v1', model: '', maxTextLength: 8000, maxOutputTokens: 1600 },
    siliconflow: { apiUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct', maxTextLength: 8000, maxOutputTokens: 1600 },
    zhipu: { apiUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', maxTextLength: 8000, maxOutputTokens: 1600 },
    babellite: { apiUrl: '', model: '', maxTextLength: 8000, maxOutputTokens: 1600 }
  };
}

function defaultSettings() {
  return {
    selectionMode: 'bubble',
    fontSize: 12,
    panelWidth: 380,
    theme: 'system',
    onlineLookup: true,
    accent: 'green',
    translationProviders: { chrome: true, microsoft: false, hunyuan: false, siliconflow: false, zhipu: false, babellite: false, youdao: false, baidu: false, doubao: false, customAi: false },
    sentenceTranslationConfigs: defaultSentenceTranslationConfigs(),
    customAiProvider: defaultCustomAiProvider(),
    aiProviders: defaultAiProviders()
  };
}

function defaultCustomAiProvider() {
  return {
    id: 'ai_default_deepseek',
    enabled: false,
    providerName: 'DeepSeek 英语精析',
    apiUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    promptPreset: 'english_parse_quick',
    systemPrompt: '你是专业资深英语解析助手。只按【中文句式翻译】【中文意思翻译】【生词详解】【语法结构解析】四个栏目输出中文解析；禁止输出规整后原句、开场白和总结。生词详解放在语法结构解析前面，重要句子成分用括号附带中文直译。',
    userPromptTemplate: '请按照固定格式解析下面英文内容：\n\n{{text}}',
    temperature: 0.1,
    maxTextLength: 6000,
    maxOutputTokens: 1800
  };
}

function defaultAiProviders() {
  return [{ ...defaultCustomAiProvider() }];
}

function defaultDictionaries() {
  return [
    { id: 'pcie-starter', name: 'DictFloat Glossary', enabled: true, builtIn: true, locallyEditable: true, createdAt: 0 }
  ];
}

function normalizeDictionaries(input) {
  const source = Array.isArray(input) ? input : [];
  const mapped = source.filter(Boolean).map((item) => ({
    id: String(item.id || crypto.randomUUID()),
    name: String(item.name || 'Untitled glossary').trim() || 'Untitled glossary',
    enabled: item.enabled !== false,
    builtIn: !!item.builtIn,
    locallyEditable: item.locallyEditable === true || String(item.id || '') === 'pcie-starter',
    createdAt: item.createdAt || Date.now()
  }));
  const starter = mapped.find((dictionary) => dictionary.id === 'pcie-starter');
  if (!starter) mapped.push(defaultDictionaries()[0]);
  else { if (starter.name === 'PCIe Starter') starter.name = 'DictFloat Glossary'; starter.builtIn = true; starter.locallyEditable = true; }
  return mapped;
}

function inferDictionaryId(entry) {
  return String(entry?.source || '').includes('DictFloat starter') ? 'pcie-starter' : 'my-glossary';
}

async function lookupMdict(source, rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query || !source?.id) return null;
  if (!globalThis.DictFloatMdictDB || !globalThis.DictFloatMdictCore) throw new Error('MDX reader is unavailable. Reload DictFloat.');

  const health = await DictFloatMdictDB.inspectLinkedSource(source.id);
  if (!health.ready) {
    await markMdictSourceState(source.id, health.state || 'missing', health.message);
    throw new Error(health.message);
  }
  try {
    return await DictFloatMdictCore.lookupLinkedSource(health.source, query);
  } catch (error) {
    const message = String(error?.message || error || 'MDX lookup failed.');
    if (/metadata is missing|permission is not available|linked MDX file changed|linked MDX file/i.test(message)) {
      await markMdictSourceState(source.id, /permission/i.test(message) ? 'access' : 'missing', message);
    }
    throw error;
  }
}

async function markMdictSourceState(sourceId, state = 'missing', message = '') {
  try {
    const stored = await chrome.storage.local.get('dictFloatMdictSources');
    const sources = Array.isArray(stored.dictFloatMdictSources) ? stored.dictFloatMdictSources : [];
    let changed = false;
    const next = sources.map((item) => {
      if (String(item?.id) !== String(sourceId)) return item;
      changed = true;
      return { ...item, status: state, connectionMessage: String(message || (state === 'access' ? 'Access confirmation required.' : 'Linked MDX file is unavailable.')) };
    });
    if (changed) await chrome.storage.local.set({ dictFloatMdictSources: next });
  } catch (_) {
    // Lookup errors still reach the panel even if the summary cannot be updated.
  }
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


// ---------------------------------------------------------------------------
// Experimental translation web bridges
// ---------------------------------------------------------------------------
const WEB_BRIDGE_PROVIDERS = {
  // Youdao often redirects fanyi.youdao.com to f.youdao.com. Query both hosts
  // and keep the bridge tab inactive so we do not create a new visible tab on
  // every translation request after the redirect. DictFloat never re-focuses
  // the source tab during bridge work, avoiding surprise tab jumps.
  youdao: {
    key: 'youdao',
    name: 'Youdao Web Bridge',
    url: 'https://f.youdao.com/#/TextTranslate',
    queryUrls: ['https://fanyi.youdao.com/*', 'https://f.youdao.com/*'],
    requiredPattern: /(?:fanyi|f)\.youdao\.com\/.*(?:TextTranslate|AITranslate|#\/TextTranslate|#\/AITranslate)/i
  },
  baidu: {
    key: 'baidu',
    name: 'Baidu Web Bridge',
    url: 'https://fanyi.baidu.com/mtpe-individual/transText',
    queryUrls: ['https://fanyi.baidu.com/*'],
    requiredPattern: /fanyi\.baidu\.com\/mtpe-individual\/transText/i
  },
  doubao: {
    key: 'doubao',
    name: 'Doubao Web Bridge',
    url: 'https://www.doubao.com/chat/',
    queryUrls: ['https://www.doubao.com/*'],
    requiredPattern: /www\.doubao\.com\/chat/i
  }
};

async function translateWithWebBridge(rawText, providerKeys, sourceTabId = null) {
  const text = String(rawText || '').trim().replace(/\s+/g, ' ');
  if (!text) throw new Error('No text to translate.');
  if (text.length > 8000) throw new Error('Selected text is too long for web bridge translation.');
  const ordered = providerKeys.map((key) => String(key || '').toLowerCase()).filter((key) => WEB_BRIDGE_PROVIDERS[key]);
  if (!ordered.length) throw new Error('No web bridge translation provider is enabled.');
  const errors = [];
  for (const key of ordered) {
    try {
      const data = await translateWithOneWebBridge(key, text, sourceTabId);
      if (data?.translation) return data;
      throw new Error('No translation returned.');
    } catch (error) {
      errors.push(`${WEB_BRIDGE_PROVIDERS[key].name}: ${cleanBridgeError(error)}`);
    }
  }
  throw new Error(errors.join(' | ') || 'Web bridge translation failed.');
}

async function translateWithOneWebBridge(providerKey, text, sourceTabId = null) {
  const config = WEB_BRIDGE_PROVIDERS[providerKey];
  const tab = await ensureBridgeTab(config, sourceTabId);
  const response = await sendBridgeRequest(tab.id, { type: 'DICTFLOAT_WEB_BRIDGE_TRANSLATE', provider: providerKey, text }, config, sourceTabId);
  if (!response?.ok) throw new Error(response?.error || `${config.name} failed.`);
  return { ...response.data, provider: config.name };
}

async function ensureBridgeTab(config, sourceTabId = null) {
  const tabs = await chrome.tabs.query({ url: config.queryUrls }).catch(() => []);
  const existing = selectBestBridgeTab(tabs, config);
  if (existing?.id) {
    if (existing.status !== 'complete') await waitForTabComplete(existing.id, 12000).catch(() => undefined);
    if (needsBridgeNavigation(existing, config)) {
      await chrome.tabs.update(existing.id, { url: config.url, active: false }).catch(() => undefined);
      await waitForTabComplete(existing.id, 18000).catch(() => undefined);
    }
    return await chrome.tabs.get(existing.id).catch(() => existing);
  }
  const createOptions = { url: config.url, active: false };
  const sourceTab = sourceTabId ? await chrome.tabs.get(sourceTabId).catch(() => null) : null;
  if (sourceTab?.windowId != null) createOptions.windowId = sourceTab.windowId;
  if (Number.isInteger(sourceTab?.index)) createOptions.index = sourceTab.index + 1;
  const created = await chrome.tabs.create(createOptions);
  await waitForTabComplete(created.id, 18000).catch(() => undefined);
  return created;
}

function selectBestBridgeTab(tabs, config) {
  const usable = (Array.isArray(tabs) ? tabs : []).filter((tab) => tab.id && !tab.discarded);
  return usable.find((tab) => config.requiredPattern?.test(String(tab.url || ''))) || usable[0] || null;
}

function needsBridgeNavigation(tab, config) {
  const url = String(tab?.url || '');
  if (!url || /^chrome:|^edge:|^about:/i.test(url)) return false;
  return config.requiredPattern && !config.requiredPattern.test(url);
}

async function sendBridgeRequest(tabId, message, config, sourceTabId = null) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await injectBridgeScript(tabId);
      const response = await withTimeout(chrome.tabs.sendMessage(tabId, message), 90000, `${config.name} timed out.`);
      if (response) return response;
      throw new Error(`${config.name} returned no response.`);
    } catch (error) {
      lastError = error;
      const messageText = String(error?.message || error || '');
      const closed = /message channel closed|receiving end does not exist|could not establish connection|extension context invalidated/i.test(messageText);
      if (!closed && attempt >= 1) break;
      await waitForTabComplete(tabId, 12000).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 700 + attempt * 500));
    }
  }
  throw new Error(`${config.name} bridge did not return a stable response. ${cleanBridgeError(lastError)}`.trim());
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs))
  ]);
}

function cleanBridgeError(error) {
  const text = String(error?.message || error || '').trim();
  if (/A listener indicated an asynchronous response by returning true, but the message channel closed/i.test(text)) {
    return 'the translation page reloaded before returning a result; retry after the page is fully loaded.';
  }
  return text || 'unknown error';
}

function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Translation page did not finish loading.')); }, timeoutMs);
    const cleanup = () => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') { cleanup(); resolve(true); }
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') { cleanup(); resolve(true); }
    }).catch(() => undefined);
  });
}

async function injectBridgeScript(tabId) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['bridge.js'] });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw new Error(`Unable to inject bridge script: ${String(lastError?.message || lastError || 'unknown error')}`);
}



// ---------------------------------------------------------------------------
// Sentence translation API providers
// ---------------------------------------------------------------------------
const SENTENCE_API_LABELS = {
  microsoft: 'Microsoft Translator',
  hunyuan: 'Hunyuan Translation',
  siliconflow: 'SiliconFlow Translation',
  zhipu: 'Zhipu GLM Translation',
  babellite: 'babel-lite'
};

async function translateWithSentenceApi(rawText, providerKey) {
  const text = String(rawText || '').trim().replace(/\s+/g, ' ');
  const key = String(providerKey || '').toLowerCase();
  if (!text) throw new Error('No text to translate.');
  if (!SENTENCE_API_LABELS[key]) throw new Error('Unsupported sentence translation provider.');
  const data = await chrome.storage.local.get(['dictFloatSettings', 'dictFloatTranslationSecrets']);
  const settings = normalizeBackgroundSettings(data.dictFloatSettings);
  const configs = normalizeSentenceTranslationConfigs(settings.sentenceTranslationConfigs);
  const secrets = normalizeSentenceTranslationSecrets(data.dictFloatTranslationSecrets);
  if (key === 'microsoft') return translateWithMicrosoftTranslator(text, configs.microsoft, secrets.microsoft?.apiKey || '');
  return translateWithOpenAiCompatibleTranslation(text, key, configs[key], secrets[key]?.apiKey || '');
}

async function translateWithMicrosoftTranslator(text, config, apiKey) {
  const label = SENTENCE_API_LABELS.microsoft;
  if (!apiKey) throw new Error(`${label} API Key is empty.`);
  const endpoint = String(config?.endpoint || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(endpoint)) throw new Error(`${label} endpoint must start with http:// or https://`);
  const to = String(config?.to || 'zh-Hans').trim() || 'zh-Hans';
  const from = String(config?.from || 'en').trim();
  const url = new URL(`${endpoint}/translate`);
  url.searchParams.set('api-version', '3.0');
  if (from && from.toLowerCase() !== 'auto') url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  const headers = {
    'Content-Type': 'application/json',
    'Ocp-Apim-Subscription-Key': apiKey
  };
  const region = String(config?.region || '').trim();
  if (region) headers['Ocp-Apim-Subscription-Region'] = region;
  const response = await fetch(url.toString(), { method: 'POST', headers, body: JSON.stringify([{ Text: text }]) });
  const bodyText = await response.text();
  let body = null;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch (_) { body = null; }
  if (!response.ok) {
    const detail = body?.error?.message || body?.message || bodyText.slice(0, 240) || response.statusText;
    throw new Error(`${label} request failed (${response.status}): ${detail}`);
  }
  const translated = Array.isArray(body) ? body[0]?.translations?.[0]?.text : '';
  const clean = String(translated || '').trim();
  if (!clean) throw new Error(`${label} returned an empty response.`);
  return { translation: clean, provider: label, sourceText: text };
}

async function translateWithOpenAiCompatibleTranslation(text, key, config, apiKey) {
  const label = SENTENCE_API_LABELS[key] || key;
  if (!apiKey) throw new Error(`${label} API Key is empty.`);
  const apiUrl = String(config?.apiUrl || '').trim();
  if (!apiUrl) throw new Error(`${label} API URL is empty.`);
  const model = String(config?.model || '').trim();
  if (!model) throw new Error(`${label} model is empty.`);
  const maxTextLength = clampNumber(Number(config?.maxTextLength), 100, 30000, 8000);
  if (text.length > maxTextLength) throw new Error(`Selected text is longer than ${label} Max Text Length (${maxTextLength}).`);
  const endpoint = normalizeCustomAiEndpoint(apiUrl);
  const messages = [
    { role: 'system', content: 'You are a translation engine. Translate the user text into Simplified Chinese. Only return the Chinese translation. Do not explain. Do not add notes. Preserve necessary technical terms when appropriate.' },
    { role: 'user', content: text }
  ];
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      max_tokens: clampNumber(Number(config?.maxOutputTokens), 128, 16000, 1600)
    })
  });
  const bodyText = await response.text();
  let body = null;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch (_) { body = null; }
  if (!response.ok) {
    const detail = body?.error?.message || body?.message || bodyText.slice(0, 240) || response.statusText;
    throw new Error(`${label} request failed (${response.status}): ${detail}`);
  }
  const content = extractOpenAiCompatibleContent(body).trim();
  if (!content) throw new Error(`${label} returned an empty response.`);
  return { translation: content, provider: label, sourceText: text };
}

function normalizeSentenceTranslationConfigs(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const defaults = defaultSentenceTranslationConfigs();
  const cleanProvider = (key) => {
    const value = raw[key] && typeof raw[key] === 'object' ? raw[key] : {};
    const fallback = defaults[key] || {};
    if (key === 'microsoft') {
      return {
        endpoint: String(value.endpoint || fallback.endpoint || '').trim(),
        region: String(value.region || fallback.region || '').trim(),
        from: String(value.from || fallback.from || 'en').trim(),
        to: String(value.to || fallback.to || 'zh-Hans').trim()
      };
    }
    return {
      apiUrl: String(value.apiUrl || fallback.apiUrl || '').trim(),
      model: String(value.model || fallback.model || '').trim(),
      maxTextLength: clampNumber(Number(value.maxTextLength), 100, 30000, fallback.maxTextLength || 8000),
      maxOutputTokens: clampNumber(Number(value.maxOutputTokens), 128, 16000, fallback.maxOutputTokens || 1600)
    };
  };
  return {
    microsoft: cleanProvider('microsoft'),
    hunyuan: cleanProvider('hunyuan'),
    siliconflow: cleanProvider('siliconflow'),
    zhipu: cleanProvider('zhipu'),
    babellite: cleanProvider('babellite')
  };
}

function normalizeSentenceTranslationSecrets(input) {
  const source = input && typeof input === 'object' ? input : {};
  const result = {};
  ['microsoft', 'hunyuan', 'siliconflow', 'zhipu', 'babellite'].forEach((key) => {
    const item = source[key] && typeof source[key] === 'object' ? source[key] : {};
    result[key] = { apiKey: String(item.apiKey || '').trim() };
  });
  return result;
}

// ---------------------------------------------------------------------------
// OpenAI-compatible Custom AI Provider
// API Key is stored separately in dictFloatCustomAiSecret and is deliberately
// excluded from normal backup/export lists.
// ---------------------------------------------------------------------------

async function translateWithCustomAi(rawText, providerId = '', options = {}) {
  const text = String(rawText || '').trim();
  if (!text) throw new Error('No text to analyze.');
  const data = await chrome.storage.local.get(['dictFloatSettings', 'dictFloatAiSecrets', 'dictFloatCustomAiSecret']);
  const settings = normalizeBackgroundSettings(data.dictFloatSettings);
  const providers = normalizeBackgroundAiProviders(settings.aiProviders, settings);
  const config = providers.find((item) => item.id === providerId) || providers.find((item) => item.enabled) || providers[0];
  const secrets = normalizeBackgroundAiSecrets(data.dictFloatAiSecrets, data.dictFloatCustomAiSecret, providers);
  const apiKey = String(secrets[config.id]?.apiKey || '').trim();
  if (!config) throw new Error('AI Provider is not configured.');
  if (!config.enabled && providerId && !options.allowDisabled) throw new Error(`${config.providerName || 'AI Provider'} is disabled in Settings.`);
  if (!apiKey) throw new Error(`${config.providerName || 'AI Provider'} API Key is empty.`);
  if (!config.apiUrl) throw new Error(`${config.providerName || 'AI Provider'} API URL is empty.`);
  if (!config.model) throw new Error(`${config.providerName || 'AI Provider'} model is empty.`);
  if (text.length > config.maxTextLength) throw new Error(`Selected text is longer than ${config.providerName || 'AI Provider'} Max Text Length (${config.maxTextLength}).`);

  const endpoint = normalizeCustomAiEndpoint(config.apiUrl);
  const userPrompt = String(config.userPromptTemplate || defaultCustomAiProvider().userPromptTemplate).includes('{{text}}')
    ? String(config.userPromptTemplate || '').replaceAll('{{text}}', text)
    : `${String(config.userPromptTemplate || '').trim()}\n\n${text}`.trim();
  const messages = [
    { role: 'system', content: String(config.systemPrompt || defaultCustomAiProvider().systemPrompt) },
    { role: 'user', content: userPrompt }
  ];
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxOutputTokens
    })
  });
  const bodyText = await response.text();
  let body = null;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch (_) { body = null; }
  if (!response.ok) {
    const detail = body?.error?.message || body?.message || bodyText.slice(0, 240) || response.statusText;
    throw new Error(`${config.providerName || 'AI Provider'} request failed (${response.status}): ${detail}`);
  }
  const content = extractOpenAiCompatibleContent(body).trim();
  if (!content) throw new Error(`${config.providerName || 'AI Provider'} returned an empty response.`);
  return { translation: content, provider: config.providerName || 'AI Provider', sourceText: text };
}

function normalizeCustomAiEndpoint(input) {
  const raw = String(input || '').trim();
  if (!/^https?:\/\//i.test(raw)) throw new Error('AI Provider API URL must start with http:// or https://');
  const cleaned = raw.replace(/\/+$/, '');
  return /\/chat\/completions$/i.test(cleaned) ? cleaned : `${cleaned}/chat/completions`;
}

function extractOpenAiCompatibleContent(body) {
  const choice = Array.isArray(body?.choices) ? body.choices[0] : null;
  const messageContent = choice?.message?.content;
  if (Array.isArray(messageContent)) {
    return messageContent.map((part) => part?.text || part?.content || '').join('');
  }
  if (typeof messageContent === 'string') return messageContent;
  if (typeof choice?.text === 'string') return choice.text;
  if (typeof body?.output_text === 'string') return body.output_text;
  return '';
}

function normalizeBackgroundSettings(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const providers = raw.translationProviders && typeof raw.translationProviders === 'object' ? raw.translationProviders : {};
  const aiProviders = normalizeBackgroundAiProviders(raw.aiProviders, raw);
  return {
    ...defaultSettings(),
    ...raw,
    translationProviders: {
      chrome: providers.chrome !== false,
      microsoft: providers.microsoft === true,
      hunyuan: providers.hunyuan === true,
      siliconflow: providers.siliconflow === true,
      zhipu: providers.zhipu === true,
      babellite: providers.babellite === true,
      youdao: providers.youdao === true,
      baidu: providers.baidu === true,
      doubao: providers.doubao === true,
      customAi: providers.customAi === true
    },
    sentenceTranslationConfigs: normalizeSentenceTranslationConfigs(raw.sentenceTranslationConfigs || defaultSentenceTranslationConfigs()),
    customAiProvider: normalizeBackgroundCustomAiProvider(raw.customAiProvider),
    aiProviders
  };
}

function normalizeBackgroundCustomAiProvider(input) {
  return normalizeBackgroundAiProvider(input || defaultCustomAiProvider(), 0);
}

function normalizeBackgroundAiProvider(input, index = 0) {
  const defaults = defaultCustomAiProvider();
  const value = input && typeof input === 'object' ? input : {};
  return {
    id: String(value.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || `ai_${index + 1}`,
    enabled: value.enabled === true,
    providerName: String(value.providerName || value.name || defaults.providerName).trim() || defaults.providerName,
    apiUrl: String(value.apiUrl || '').trim(),
    model: String(value.model || '').trim(),
    promptPreset: String(value.promptPreset || 'custom'),
    systemPrompt: String(value.systemPrompt || defaults.systemPrompt),
    userPromptTemplate: String(value.userPromptTemplate || defaults.userPromptTemplate),
    temperature: clampNumber(Number(value.temperature), 0, 2, defaults.temperature),
    maxTextLength: clampNumber(Number(value.maxTextLength), 100, 30000, defaults.maxTextLength),
    maxOutputTokens: clampNumber(Number(value.maxOutputTokens), 128, 16000, defaults.maxOutputTokens),
    order: Number.isFinite(Number(value.order)) ? Number(value.order) : index + 1
  };
}

function normalizeBackgroundAiProviders(input, rawSettings = null) {
  if (Array.isArray(input) && input.length) return input.map((item, index) => normalizeBackgroundAiProvider(item, index));
  const raw = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  if (raw.customAiProvider && typeof raw.customAiProvider === 'object') {
    const legacy = raw.customAiProvider;
    const configured = String(legacy.apiUrl || '').trim() || String(legacy.model || '').trim() || raw.translationProviders?.customAi === true;
    if (configured) return [normalizeBackgroundAiProvider({ id: 'ai_legacy_custom', enabled: raw.translationProviders?.customAi === true, ...legacy }, 0)];
  }
  return defaultAiProviders();
}

function normalizeBackgroundAiSecrets(input, legacySecret = null, providers = []) {
  const source = input && typeof input === 'object' ? input : {};
  const result = {};
  providers.forEach((provider) => {
    const item = source[provider.id] && typeof source[provider.id] === 'object' ? source[provider.id] : {};
    result[provider.id] = { apiKey: String(item.apiKey || '').trim() };
  });
  const legacyKey = legacySecret && typeof legacySecret === 'object' ? String(legacySecret.apiKey || '').trim() : '';
  if (legacyKey) {
    const legacyProvider = providers.find((item) => item.id === 'ai_legacy_custom') || providers[0];
    if (legacyProvider && !result[legacyProvider.id]?.apiKey) result[legacyProvider.id] = { apiKey: legacyKey };
  }
  return result;
}

function clampNumber(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}


// ---------------------------------------------------------------------------
// Optional Wudao data pack
// The pack is intentionally user-imported and stored in IndexedDB, rather
// than bundled in DictFloat. A Wudao pack contains en.ind / en.z / zh.ind /
// zh.z. The *.ind file maps a word to an offset in the matching zlib stream.
// ---------------------------------------------------------------------------

function normalizeWudaoSource(source) {
  const input = source && typeof source === 'object' ? source : {};
  const installed = !!input.installed;
  const configured = !!input.configured || installed || !!input.needsReconnect;
  return {
    installed,
    configured,
    needsReconnect: configured && !installed,
    name: String(input.name || 'Wudao · Offline'),
    enabled: input.enabled !== false && installed,
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

async function lookupWudao(rawQuery) {
  const query = String(rawQuery || '').trim().replace(/\s+/g, ' ');
  if (!query || query.length > 160) return null;
  const source = normalizeWudaoSource((await chrome.storage.local.get('dictFloatWudaoSource')).dictFloatWudaoSource);
  if (!source.installed || !source.enabled) return null;

  const direction = /[\u3400-\u9fff]/.test(query) ? 'zh' : 'en';
  const normalizedQuery = direction === 'en' ? query.toLowerCase() : query;
  const pack = await readWudaoPack();
  if (!pack?.files) throw new Error('The Wudao data pack is unavailable. Re-import the four files in Settings.');

  const indexKey = direction === 'en' ? 'enIndex' : 'zhIndex';
  const dataKey = direction === 'en' ? 'enData' : 'zhData';
  const index = await getWudaoIndex(indexKey, pack.files[indexKey], pack.files[dataKey]?.size || 0);
  const range = index.get(normalizedQuery);
  if (!range) return null;

  const dataBlob = pack.files[dataKey];
  if (!(dataBlob instanceof Blob)) throw new Error('The Wudao data file is unavailable. Re-import the pack in Settings.');
  const compressed = new Uint8Array(await dataBlob.slice(range.start, range.end).arrayBuffer());
  if (!compressed.byteLength) return null;
  const raw = await inflateZlib(compressed);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(raw);
  return direction === 'en' ? parseWudaoEnglish(text, query) : parseWudaoChinese(text, query);
}

async function getWudaoIndex(key, indexBlob, dataSize) {
  if (wudaoIndexCache.has(key)) return wudaoIndexCache.get(key);
  if (!(indexBlob instanceof Blob)) throw new Error('The Wudao index is unavailable. Re-import the pack in Settings.');
  const text = await indexBlob.text();
  const rows = text.split(/\r?\n/).filter(Boolean);
  const map = new Map();
  const parsed = [];
  for (const row of rows) {
    const separator = row.lastIndexOf('|');
    if (separator <= 0) continue;
    const word = row.slice(0, separator);
    const start = Number(row.slice(separator + 1));
    if (!word || !Number.isFinite(start) || start < 0) continue;
    parsed.push([word, start]);
  }
  for (let index = 0; index < parsed.length; index += 1) {
    const [word, start] = parsed[index];
    const end = index + 1 < parsed.length ? parsed[index + 1][1] : dataSize;
    if (end > start) map.set(word, { start, end });
  }
  wudaoIndexCache.set(key, map);
  return map;
}

async function inflateZlib(bytes) {
  const formats = ['deflate', 'deflate-raw'];
  let lastError = null;
  for (const format of formats) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Unable to decompress this Wudao record: ${String(lastError?.message || lastError || 'unknown error')}`);
}

function parseWudaoEnglish(text, fallbackTerm) {
  const fields = String(text || '').split('|');
  const paraphrase = safeJson(fields[5], []);
  const sentences = safeJson(fields[8], []);
  return normalizeWudaoResult({
    term: fields[0] || fallbackTerm,
    phonetic: [fields[2], fields[3], fields[4]].filter(Boolean).join(' · '),
    definitions: flattenWudaoValue(paraphrase, 8),
    examples: flattenWudaoValue(sentences, 4),
    direction: 'en-zh'
  });
}

function parseWudaoChinese(text, fallbackTerm) {
  const fields = String(text || '').split('|');
  const paraphrase = safeJson(fields[3], []);
  const desc = safeJson(fields[4], []);
  const sentences = safeJson(fields[5], []);
  return normalizeWudaoResult({
    term: fields[0] || fallbackTerm,
    phonetic: fields[2] || '',
    definitions: flattenWudaoValue(paraphrase, 8).concat(flattenWudaoValue(desc, 5)).slice(0, 10),
    examples: flattenWudaoValue(sentences, 4),
    direction: 'zh-en'
  });
}

function normalizeWudaoResult(value) {
  const definitions = uniqueStrings(value.definitions || []);
  const examples = uniqueStrings(value.examples || []);
  return {
    term: String(value.term || '').trim(),
    phonetic: String(value.phonetic || '').trim(),
    definitions,
    examples,
    direction: value.direction || '',
    provider: 'Wudao offline dictionary'
  };
}

function safeJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (_) { return value; }
}

function flattenWudaoValue(value, limit = 8) {
  const lines = [];
  const visit = (current, prefix = '') => {
    if (lines.length >= limit || current == null) return;
    if (typeof current === 'string' || typeof current === 'number') {
      const text = String(current).replace(/\s+/g, ' ').trim();
      if (text && text !== 'null' && text !== 'undefined') lines.push(prefix ? `${prefix} ${text}`.trim() : text);
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item) => visit(item, prefix));
      return;
    }
    if (typeof current === 'object') {
      Object.entries(current).forEach(([key, item]) => {
        const label = /^[a-z.]{1,16}$/i.test(key) ? key : '';
        visit(item, label || prefix);
      });
    }
  };
  visit(value);
  return uniqueStrings(lines).slice(0, limit);
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function openWudaoDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WUDAO_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WUDAO_STORE_NAME)) db.createObjectStore(WUDAO_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open Wudao local storage'));
  });
}

async function readWudaoPack() {
  const db = await openWudaoDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(WUDAO_STORE_NAME, 'readonly').objectStore(WUDAO_STORE_NAME).get(WUDAO_ACTIVE_PACK_ID);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Unable to read Wudao local storage'));
    });
  } finally {
    db.close();
  }
}
