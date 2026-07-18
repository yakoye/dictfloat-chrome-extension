const $ = (id) => document.getElementById(id);
const defaultTranslationProviders = () => ({
  chrome: true,
  microsoft: false,
  hunyuan: false,
  siliconflow: false,
  zhipu: false,
  babellite: false,
  youdao: false,
  baidu: false,
  doubao: false,
  customAi: false
});
const SENTENCE_TRANSLATION_API_KEYS = ['microsoft', 'hunyuan', 'siliconflow', 'zhipu', 'babellite'];
function defaultSentenceTranslationConfigs() {
  return {
    microsoft: { endpoint: 'https://api.cognitive.microsofttranslator.com', region: '', from: 'en', to: 'zh-Hans' },
    hunyuan: { apiUrl: 'https://api.hunyuan.cloud.tencent.com/v1', model: '', maxTextLength: 8000, maxOutputTokens: 1600 },
    siliconflow: { apiUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct', maxTextLength: 8000, maxOutputTokens: 1600 },
    zhipu: { apiUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', maxTextLength: 8000, maxOutputTokens: 1600 },
    babellite: { apiUrl: '', model: '', maxTextLength: 8000, maxOutputTokens: 1600 }
  };
}
const AI_PROVIDER_LEGACY_ID = 'ai_legacy_custom';
const AI_PROVIDER_DEFAULT_DEEPSEEK_ID = 'ai_default_deepseek';
const AI_PROVIDER_PRESETS = {
  english_parse_quick: {
    label: '英语全能解析 · 简洁版',
    systemPrompt: `你是专业资深英语解析助手。你的任务是对用户输入的英文内容进行快速、简洁、清晰的中文解析。

必须严格遵守以下规则：

1. 只处理英文内容。
2. 如果用户输入不包含英文，统一只回复：请输入英文句子，我为你进行完整解析。
3. 后台会自动清理 PDF、网页、文档复制产生的多余换行、断行和多余空格，你不需要输出规整后的原句。
4. 遇到英文缩写，如 You've、I'm、don't、isn't，解析时按完整形式理解，例如 You've = You have。
5. 输出必须严格使用下面四个栏目，不能增加栏目，不能减少栏目。
6. 禁止输出开场白，例如“好的”“下面是”“我将为你解析”。
7. 禁止输出结尾总结，例如“最终输出”“总结如下”。
8. 禁止使用“第一步、第二步、第三步”这类流程标题。
9. 生词详解放在语法结构解析前面。
10. 生词只选择值得讲的词：高阶词、书面词、专业词、易混词、熟词僻义、固定搭配、句中有特殊含义的常用词。
11. 普通基础词如果没有特殊用法，可以忽略。
12. 生词格式统一为：单词 /音标/ 词性. 通用释义；本句含义；常用搭配。
13. 语法解析必须单独分行，明确句子类型、时态、主语、谓语、宾语、定语、状语、补语等。
14. 每个重要句子成分都要用括号附带中文直译。
15. 句子详解要说明重点动词、核心短语、特殊含义和句子真实表达。
16. 输出要紧凑，不要废话，但不能漏掉核心词义和核心语法。

固定输出格式如下：

【中文句式翻译】
...

【中文意思翻译】
...

【生词详解】
1. ...
2. ...
3. ...

【语法结构解析】
- 句子类型：...
- 句子时态：...
- 主语：...
- 谓语：...
- 宾语：...
- 定语：...
- 状语：...
- 补语：...
- 核心结构：...
- 句子详解：...`,
    userPromptTemplate: '请按照固定格式解析下面英文内容：\n\n{{text}}'
  },
  quick_translate: {
    label: '只翻译 · 简洁版',
    systemPrompt: '你是专业英语到中文翻译助手。只输出中文译文，不闲聊，不解释。译文要自然、准确、简洁。',
    userPromptTemplate: '请把下面英文翻译成自然中文：\n\n{{text}}'
  },
  tech_pcie: {
    label: '技术英文 · PCIe/芯片版',
    systemPrompt: '你是熟悉 PCIe、芯片、固件、硬件架构的技术英语解析助手。输出中文，保留必要英文术语和缩写，解释专业词在句中的技术含义。禁止闲聊。',
    userPromptTemplate: '请解析下面技术英文，按“中文翻译 / 结构解析 / 关键词术语”输出：\n\n{{text}}'
  }
};
const DEFAULT_AI_PRESET_ID = 'english_parse_quick';
function defaultCustomAiProvider() {
  const preset = AI_PROVIDER_PRESETS[DEFAULT_AI_PRESET_ID];
  return {
    providerName: 'DeepSeek 英语精析',
    apiUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    promptPreset: DEFAULT_AI_PRESET_ID,
    systemPrompt: preset.systemPrompt,
    userPromptTemplate: preset.userPromptTemplate,
    temperature: 0.1,
    maxTextLength: 6000,
    maxOutputTokens: 1800
  };
}
function defaultAiProviders() {
  return [{
    id: AI_PROVIDER_DEFAULT_DEEPSEEK_ID,
    enabled: false,
    ...defaultCustomAiProvider()
  }];
}
const defaults = { selectionMode: 'bubble', fontSize: 12, panelWidth: 380, theme: 'system', onlineLookup: true, accent: 'green', translationProviders: defaultTranslationProviders(), sentenceTranslationConfigs: defaultSentenceTranslationConfigs(), customAiProvider: defaultCustomAiProvider(), aiProviders: defaultAiProviders() };
const WUDAO_DB_NAME = 'dictfloat-wudao-v1';
const WUDAO_STORE_NAME = 'packs';
const WUDAO_ACTIVE_PACK_ID = 'active';
const BACKUP_FORMAT = 'dictfloat-backup';
const BACKUP_VERSION = 1;
const RECOVERY_SNAPSHOT_KEY = 'dictFloatRecoverySnapshots';
const RECOVERY_SNAPSHOT_LIMIT = 5;
const BACKUP_STORAGE_KEYS = [
  'dictFloatSettings', 'dictFloatEntries', 'dictFloatDictionaries',
  'dictFloatMdictSources', 'dictFloatWudaoSource', 'dictFloatSourceOrder',
  'dictFloatHistory', 'dictFloatPanelPosition', 'dictFloatCollapsedSources'
];
const defaultDictionaries = () => [
  { id: 'pcie-starter', name: 'DictFloat Glossary', enabled: true, builtIn: true, locallyEditable: true, sourceKind: 'built-in', createdAt: 0 }
];

let entries = [];
let dictionaries = [];
let mdictSources = [];
let wudaoSource = null;
let sourceOrder = [];
let draggedSourceKey = '';
let recoverySnapshots = [];
let aiProviders = [];
let aiSecrets = {};
let translationSecrets = {};
let expandedAiProviderId = '';

void init();

async function init() {
  const data = await chrome.storage.local.get([
    'dictFloatSettings',
    'dictFloatEntries',
    'dictFloatDictionaries',
    'dictFloatMdictSources',
    'dictFloatWudaoSource',
    'dictFloatSourceOrder',
    'dictFloatHistory',
    'dictFloatPanelPosition',
    'dictFloatCollapsedSources',
    'dictFloatCustomAiSecret',
    'dictFloatAiSecrets',
    'dictFloatTranslationSecrets',
    RECOVERY_SNAPSHOT_KEY
  ]);
  const settings = normalizeSettings(data.dictFloatSettings);
  aiProviders = normalizeAiProviders(settings.aiProviders, data.dictFloatSettings);
  aiSecrets = normalizeAiSecrets(data.dictFloatAiSecrets, data.dictFloatCustomAiSecret, aiProviders);
  translationSecrets = normalizeTranslationSecrets(data.dictFloatTranslationSecrets);
  applyAccent(settings.accent);
  entries = (Array.isArray(data.dictFloatEntries) ? data.dictFloatEntries : []).map(normalizeEntry);
  dictionaries = normalizeDictionaries(data.dictFloatDictionaries);
  const starterMigrationChanged = migrateStarterGlossaryEntries();
  mdictSources = Array.isArray(data.dictFloatMdictSources) ? data.dictFloatMdictSources.map(normalizeMdictSource) : [];
  wudaoSource = normalizeWudaoSource(data.dictFloatWudaoSource);
  sourceOrder = normalizeSourceOrder(data.dictFloatSourceOrder);
  recoverySnapshots = normalizeRecoverySnapshots(data[RECOVERY_SNAPSHOT_KEY]);
  await reconcileMdictSourceHealth();

  for (const key of ['selectionMode', 'fontSize', 'panelWidth', 'theme', 'onlineLookup', 'accent']) {
    const element = $(key);
    if (!element) continue;
    if (element.type === 'checkbox') element.checked = !!settings[key];
    else element.value = settings[key];
  }
  applyTranslationProviderSettings(settings.translationProviders);
  applySentenceTranslationConfigSettings(settings.sentenceTranslationConfigs, translationSecrets);
  renderAiProviders();

  ['selectionMode', 'fontSize', 'panelWidth', 'theme', 'onlineLookup', 'accent',
    'translateChrome', 'translateMicrosoft', 'translateHunyuan', 'translateSiliconFlow', 'translateZhipu', 'translateBabelLite', 'translateYoudaoBridge', 'translateBaiduBridge', 'translateDoubaoBridge'
  ].forEach((id) => $(id)?.addEventListener('change', async () => { await saveSettings(); renderDictionaryLibrary(); }));
  document.querySelectorAll('[data-translation-config], [data-translation-secret]').forEach((node) => {
    node.addEventListener('change', async () => { await saveSettings(); });
    node.addEventListener('input', debounce(async () => { await saveSettings({ quiet: true }); }, 450));
  });
  $('aiProviderList')?.addEventListener('change', handleAiProviderChange);
  $('aiProviderList')?.addEventListener('input', handleAiProviderInput);
  $('aiProviderList')?.addEventListener('click', handleAiProviderAction);
  $('addAiProvider')?.addEventListener('click', async () => { const provider = createAiProviderFromTemplate('blank'); aiProviders.push(provider); expandedAiProviderId = provider.id; renderAiProviders(); await saveSettings(); });
  $('addDeepSeekProvider')?.addEventListener('click', async () => { const provider = createAiProviderFromTemplate('deepseek'); aiProviders.push(provider); expandedAiProviderId = provider.id; renderAiProviders(); await saveSettings(); });
  $('resetWindowPosition').addEventListener('click', resetWindowPosition);
  $('newGlossaryAction').addEventListener('click', async () => { closeAddSourceMenu(); await addDictionary(); });
  $('connectMdictFolder').addEventListener('click', async () => { closeAddSourceMenu(); await connectMdictFolder(); });
  $('cancelMdictIndex').addEventListener('click', cancelMdictIndex);
  $('importWudaoFiles').addEventListener('change', importWudaoFiles);
  $('exportJson').addEventListener('click', exportJson);
  $('exportCsv').addEventListener('click', exportCsv);
  $('exportBackup').addEventListener('click', exportBackup);
  $('importBackup').addEventListener('change', importBackup);
  $('reconnectDictionaryRootInline')?.addEventListener('click', handleLibraryConnectionAction);
  $('entryManagerClose')?.addEventListener('click', closeEntryManager);
  $('entryManagerSearch')?.addEventListener('input', renderEntryManager);
  $('entryManagerAdd')?.addEventListener('click', () => openEntryEditor(null));
  $('entryEditorCancel')?.addEventListener('click', closeEntryEditor);
  $('entryEditorCancelSecondary')?.addEventListener('click', closeEntryEditor);
  $('entryEditorDelete')?.addEventListener('click', deleteEntryFromManager);
  $('entryEditorForm')?.addEventListener('submit', saveEntryEditor);
  $('importFile').addEventListener('change', importFile);
  $('clearEntries').addEventListener('click', clearEntries);
  $('toggleAddSource').addEventListener('click', toggleAddSourceMenu);
  document.addEventListener('click', (event) => {
    const wrap = document.querySelector('.library-add-wrap');
    if (wrap && !wrap.contains(event.target)) closeAddSourceMenu();
  });

  renderDictionaryLibrary();
  renderRecoverySnapshots();
  await chrome.storage.local.set({
    dictFloatDictionaries: dictionaries,
    dictFloatEntries: entries,
    dictFloatMdictSources: mdictSources,
    dictFloatWudaoSource: wudaoSource,
    dictFloatSourceOrder: sourceOrder,
    dictFloatAiSecrets: aiSecrets,
    dictFloatTranslationSecrets: translationSecrets,
    dictFloatSettings: { ...settings, aiProviders }
  });
}


function debounce(fn, wait = 300) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { void fn(...args); }, wait);
  };
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

function applyAccent(accent) {
  document.body.dataset.accent = ['rose', 'green', 'blue'].includes(accent) ? accent : 'green';
}

function normalizeTranslationProviders(input) {
  const value = input && typeof input === 'object' ? input : {};
  return {
    chrome: value.chrome !== false,
    microsoft: value.microsoft === true,
    hunyuan: value.hunyuan === true,
    siliconflow: value.siliconflow === true,
    zhipu: value.zhipu === true,
    babellite: value.babellite === true,
    youdao: value.youdao === true,
    baidu: value.baidu === true,
    doubao: value.doubao === true,
    customAi: value.customAi === true
  };
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
      maxTextLength: clamp(Number(value.maxTextLength), 100, 30000, fallback.maxTextLength || 8000),
      maxOutputTokens: clamp(Number(value.maxOutputTokens), 128, 16000, fallback.maxOutputTokens || 1600)
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

function normalizeTranslationSecrets(input) {
  const source = input && typeof input === 'object' ? input : {};
  const result = {};
  SENTENCE_TRANSLATION_API_KEYS.forEach((key) => {
    const item = source[key] && typeof source[key] === 'object' ? source[key] : {};
    result[key] = { apiKey: String(item.apiKey || '').trim() };
  });
  return result;
}

function normalizeAiProvider(input, index = 0) {
  const defaults = defaultCustomAiProvider();
  const value = input && typeof input === 'object' ? input : {};
  const presetId = AI_PROVIDER_PRESETS[value.promptPreset] ? String(value.promptPreset) : 'custom';
  return {
    id: sanitizeAiProviderId(value.id) || createAiProviderId(),
    enabled: value.enabled === true,
    providerName: String(value.providerName || value.name || defaults.providerName).trim() || defaults.providerName,
    apiUrl: String(value.apiUrl || '').trim(),
    model: String(value.model || '').trim(),
    promptPreset: presetId,
    systemPrompt: String(value.systemPrompt || defaults.systemPrompt),
    userPromptTemplate: String(value.userPromptTemplate || defaults.userPromptTemplate),
    temperature: clamp(Number(value.temperature), 0, 2, defaults.temperature),
    maxTextLength: clamp(Number(value.maxTextLength), 100, 30000, defaults.maxTextLength),
    maxOutputTokens: clamp(Number(value.maxOutputTokens), 128, 16000, defaults.maxOutputTokens),
    order: Number.isFinite(Number(value.order)) ? Number(value.order) : index + 1
  };
}

function normalizeAiProviders(input, rawSettings = null) {
  if (Array.isArray(input) && input.length) {
    const seen = new Set();
    return input.map((item, index) => normalizeAiProvider(item, index)).filter((item) => {
      if (seen.has(item.id)) item.id = createAiProviderId();
      seen.add(item.id);
      return true;
    });
  }
  const migrated = migrateLegacyCustomAiProvider(rawSettings || input);
  return migrated ? [migrated] : defaultAiProviders();
}

function migrateLegacyCustomAiProvider(rawSettings) {
  const raw = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const legacy = raw.customAiProvider && typeof raw.customAiProvider === 'object' ? raw.customAiProvider : null;
  if (!legacy) return null;
  const oldDefault = {
    providerName: 'Custom AI', apiUrl: '', model: '',
    systemPrompt: '你是专业资深英语全能解析智能体。你必须严格按照指定流程解析用户输入的英文内容。输出使用中文，不闲聊，不省略核心内容。',
    userPromptTemplate: '请解析下面英文内容：\n\n{{text}}'
  };
  const configured = String(legacy.apiUrl || '').trim()
    || String(legacy.model || '').trim()
    || String(legacy.providerName || '').trim() !== oldDefault.providerName
    || String(legacy.systemPrompt || '') !== oldDefault.systemPrompt
    || String(legacy.userPromptTemplate || '') !== oldDefault.userPromptTemplate
    || raw.translationProviders?.customAi === true;
  if (!configured) return null;
  return normalizeAiProvider({
    id: AI_PROVIDER_LEGACY_ID,
    enabled: raw.translationProviders?.customAi === true,
    providerName: legacy.providerName || 'Custom AI',
    apiUrl: legacy.apiUrl || '',
    model: legacy.model || '',
    promptPreset: 'custom',
    systemPrompt: legacy.systemPrompt || oldDefault.systemPrompt,
    userPromptTemplate: legacy.userPromptTemplate || oldDefault.userPromptTemplate,
    temperature: legacy.temperature,
    maxTextLength: legacy.maxTextLength,
    maxOutputTokens: legacy.maxOutputTokens,
    order: 1
  });
}

function normalizeAiSecrets(input, legacySecret = null, providers = []) {
  const source = input && typeof input === 'object' ? input : {};
  const result = {};
  providers.forEach((provider) => {
    const item = source[provider.id] && typeof source[provider.id] === 'object' ? source[provider.id] : {};
    result[provider.id] = { apiKey: String(item.apiKey || '').trim() };
  });
  const legacyKey = legacySecret && typeof legacySecret === 'object' ? String(legacySecret.apiKey || '').trim() : '';
  if (legacyKey) {
    const legacyProvider = providers.find((item) => item.id === AI_PROVIDER_LEGACY_ID) || providers[0];
    if (legacyProvider && !result[legacyProvider.id]?.apiKey) result[legacyProvider.id] = { apiKey: legacyKey };
  }
  return result;
}

function sanitizeAiProviderId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function createAiProviderId() {
  try { return `ai_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`; }
  catch (_) { return `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
}

function createAiProviderFromTemplate(kind = 'blank') {
  const base = defaultCustomAiProvider();
  if (kind === 'deepseek') {
    return normalizeAiProvider({ id: createAiProviderId(), enabled: false, ...base, providerName: 'DeepSeek 英语精析', apiUrl: 'https://api.deepseek.com', model: 'deepseek-chat' });
  }
  if (kind === 'openai') {
    return normalizeAiProvider({ id: createAiProviderId(), enabled: false, ...base, providerName: 'OpenAI 英语精析', apiUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' });
  }
  return normalizeAiProvider({ id: createAiProviderId(), enabled: false, ...base, providerName: 'Custom AI', apiUrl: '', model: '' });
}

function normalizeSettings(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const ai = normalizeAiProviders(raw.aiProviders, raw);
  return {
    ...defaults,
    ...raw,
    translationProviders: normalizeTranslationProviders(raw.translationProviders || defaults.translationProviders),
    sentenceTranslationConfigs: normalizeSentenceTranslationConfigs(raw.sentenceTranslationConfigs || defaults.sentenceTranslationConfigs),
    customAiProvider: normalizeAiProvider(raw.customAiProvider || defaults.customAiProvider),
    aiProviders: ai
  };
}

function applyTranslationProviderSettings(input) {
  const providers = normalizeTranslationProviders(input);
  const map = {
    translateChrome: 'chrome',
    translateMicrosoft: 'microsoft',
    translateHunyuan: 'hunyuan',
    translateSiliconFlow: 'siliconflow',
    translateZhipu: 'zhipu',
    translateBabelLite: 'babellite',
    translateYoudaoBridge: 'youdao',
    translateBaiduBridge: 'baidu',
    translateDoubaoBridge: 'doubao'
  };
  Object.entries(map).forEach(([id, key]) => { const node = $(id); if (node) node.checked = !!providers[key]; });
}

function readTranslationProviderSettings() {
  return {
    chrome: $('translateChrome')?.checked !== false,
    microsoft: $('translateMicrosoft')?.checked === true,
    hunyuan: $('translateHunyuan')?.checked === true,
    siliconflow: $('translateSiliconFlow')?.checked === true,
    zhipu: $('translateZhipu')?.checked === true,
    babellite: $('translateBabelLite')?.checked === true,
    youdao: $('translateYoudaoBridge')?.checked === true,
    baidu: $('translateBaiduBridge')?.checked === true,
    doubao: $('translateDoubaoBridge')?.checked === true,
    customAi: false
  };
}

function applySentenceTranslationConfigSettings(configInput, secretInput) {
  const configs = normalizeSentenceTranslationConfigs(configInput);
  const secrets = normalizeTranslationSecrets(secretInput);
  const setValue = (id, value) => { const node = $(id); if (node) node.value = value ?? ''; };
  setValue('microsoftApiKey', secrets.microsoft.apiKey);
  setValue('microsoftRegion', configs.microsoft.region);
  setValue('microsoftEndpoint', configs.microsoft.endpoint);
  setValue('hunyuanApiKey', secrets.hunyuan.apiKey);
  setValue('hunyuanApiUrl', configs.hunyuan.apiUrl);
  setValue('hunyuanModel', configs.hunyuan.model);
  setValue('siliconflowApiKey', secrets.siliconflow.apiKey);
  setValue('siliconflowApiUrl', configs.siliconflow.apiUrl);
  setValue('siliconflowModel', configs.siliconflow.model);
  setValue('zhipuApiKey', secrets.zhipu.apiKey);
  setValue('zhipuApiUrl', configs.zhipu.apiUrl);
  setValue('zhipuModel', configs.zhipu.model);
  setValue('babelliteApiKey', secrets.babellite.apiKey);
  setValue('babelliteApiUrl', configs.babellite.apiUrl);
  setValue('babelliteModel', configs.babellite.model);
}

function readSentenceTranslationConfigSettings() {
  const read = (id) => String($(id)?.value || '').trim();
  translationSecrets = normalizeTranslationSecrets({
    microsoft: { apiKey: read('microsoftApiKey') },
    hunyuan: { apiKey: read('hunyuanApiKey') },
    siliconflow: { apiKey: read('siliconflowApiKey') },
    zhipu: { apiKey: read('zhipuApiKey') },
    babellite: { apiKey: read('babelliteApiKey') }
  });
  return normalizeSentenceTranslationConfigs({
    microsoft: { endpoint: read('microsoftEndpoint'), region: read('microsoftRegion'), from: 'en', to: 'zh-Hans' },
    hunyuan: { apiUrl: read('hunyuanApiUrl'), model: read('hunyuanModel') },
    siliconflow: { apiUrl: read('siliconflowApiUrl'), model: read('siliconflowModel') },
    zhipu: { apiUrl: read('zhipuApiUrl'), model: read('zhipuModel') },
    babellite: { apiUrl: read('babelliteApiUrl'), model: read('babelliteModel') }
  });
}

function renderAiProviders() {
  const list = $('aiProviderList');
  if (!list) return;
  list.textContent = '';
  aiProviders = normalizeAiProviders(aiProviders);
  if (!aiProviders.length) aiProviders = defaultAiProviders();
  aiProviders.forEach((provider, index) => list.append(createAiProviderCard(provider, index)));
  const count = $('aiProviderCount');
  if (count) count.textContent = `${aiProviders.filter((item) => item.enabled).length}/${aiProviders.length} enabled`;
}

function createAiProviderCard(provider, index) {
  const item = document.createElement('article');
  item.className = provider.id === expandedAiProviderId ? 'ai-provider-item' : 'ai-provider-item collapsed';
  item.dataset.providerId = provider.id;

  const head = document.createElement('div');
  head.className = 'ai-provider-head';
  const toggle = document.createElement('label');
  toggle.className = 'ai-provider-toggle';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = !!provider.enabled;
  checkbox.dataset.aiField = 'enabled';
  const titleWrap = document.createElement('span');
  const title = document.createElement('strong');
  title.textContent = `${index + 1}. ${provider.providerName || 'Custom AI'}`;
  const sub = document.createElement('small');
  sub.textContent = [provider.model || 'model not set', provider.apiUrl || 'API URL not set'].join(' · ');
  titleWrap.append(title, sub);
  toggle.append(checkbox, titleWrap);
  head.append(toggle);

  const controls = document.createElement('div');
  controls.className = 'ai-provider-controls';
  controls.append(
    makeAiActionButton(provider.id === expandedAiProviderId ? '▾' : '▸', 'toggle-details'),
    makeAiActionButton('↑', 'move-up', index === 0 ? true : false),
    makeAiActionButton('↓', 'move-down', index === aiProviders.length - 1 ? true : false),
    makeAiActionButton('Duplicate', 'duplicate'),
    makeAiActionButton('Delete', 'delete', aiProviders.length <= 1),
  );
  head.append(controls);
  item.append(head);

  const body = document.createElement('div');
  body.className = 'ai-provider-body';
  item.append(body);

  const grid = document.createElement('div');
  grid.className = 'custom-ai-grid ai-provider-grid';
  grid.append(
    aiField('Provider name', 'providerName', provider.providerName, 'text', 'DeepSeek 英语精析'),
    aiField('Model', 'model', provider.model, 'text', 'deepseek-chat / gpt-4o-mini'),
    aiField('API URL / Base URL', 'apiUrl', provider.apiUrl, 'url', 'https://api.deepseek.com', 'custom-ai-url'),
    aiField('API Key', 'apiKey', aiSecrets[provider.id]?.apiKey || '', 'password', 'sk-...', 'custom-ai-key')
  );
  body.append(grid);

  const showKey = document.createElement('label');
  showKey.className = 'toggle-row compact-toggle ai-show-key';
  const showText = document.createElement('span');
  showText.textContent = 'Show password';
  const showBox = document.createElement('input');
  showBox.type = 'checkbox';
  showBox.dataset.aiAction = 'show-key';
  showKey.append(showText, showBox);
  body.append(showKey);

  const nums = document.createElement('div');
  nums.className = 'custom-ai-grid numeric-grid';
  nums.append(
    aiField('Temperature', 'temperature', provider.temperature, 'number', '0.1', '', { min: '0', max: '2', step: '0.1' }),
    aiField('Max text length', 'maxTextLength', provider.maxTextLength, 'number', '6000', '', { min: '100', max: '30000', step: '100' }),
    aiField('Max output tokens', 'maxOutputTokens', provider.maxOutputTokens, 'number', '1800', '', { min: '128', max: '16000', step: '128' })
  );
  body.append(nums);

  const presetLabel = document.createElement('label');
  presetLabel.className = 'field';
  const presetSpan = document.createElement('span');
  presetSpan.textContent = 'Prompt preset';
  const preset = document.createElement('select');
  preset.dataset.aiField = 'promptPreset';
  [...Object.entries(AI_PROVIDER_PRESETS), ['custom', { label: '自定义' }]].forEach(([value, info]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = info.label;
    option.selected = provider.promptPreset === value;
    preset.append(option);
  });
  presetLabel.append(presetSpan, preset);
  body.append(presetLabel);

  body.append(aiTextAreaField('System Prompt', 'systemPrompt', provider.systemPrompt, 7));
  body.append(aiTextAreaField('User Prompt Template', 'userPromptTemplate', provider.userPromptTemplate, 4));

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.innerHTML = 'Use <code>{{text}}</code> where selected text should be inserted. Base URLs are automatically converted to <code>/chat/completions</code>. Modified prompts are saved and reused until you change them again.';
  body.append(hint);

  const actions = document.createElement('div');
  actions.className = 'actions ai-provider-actions';
  actions.append(makeAiActionButton('Test API', 'test'), makeAiActionButton('Reset prompt to preset', 'reset-prompt'));
  body.append(actions);
  const result = document.createElement('pre');
  result.className = 'custom-ai-test-result';
  result.hidden = true;
  result.dataset.aiTestResult = 'true';
  body.append(result);
  return item;
}

function aiField(labelText, field, value, type = 'text', placeholder = '', extraClass = '', attrs = {}) {
  const label = document.createElement('label');
  label.className = ['field', extraClass].filter(Boolean).join(' ');
  const span = document.createElement('span');
  span.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  input.value = value ?? '';
  input.placeholder = placeholder;
  input.dataset.aiField = field;
  if (field === 'apiKey') input.autocomplete = 'off';
  Object.entries(attrs).forEach(([key, val]) => input.setAttribute(key, val));
  label.append(span, input);
  return label;
}

function aiTextAreaField(labelText, field, value, rows = 4) {
  const label = document.createElement('label');
  label.className = 'field prompt-field';
  const span = document.createElement('span');
  span.textContent = labelText;
  const textarea = document.createElement('textarea');
  textarea.rows = rows;
  textarea.value = value || '';
  textarea.dataset.aiField = field;
  label.append(span, textarea);
  return label;
}

function makeAiActionButton(text, action, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.dataset.aiAction = action;
  button.disabled = disabled;
  return button;
}

function handleAiProviderInput(event) {
  const field = event.target?.dataset?.aiField;
  if (field === 'systemPrompt' || field === 'userPromptTemplate') {
    const card = event.target.closest('.ai-provider-item');
    const select = card?.querySelector('[data-ai-field="promptPreset"]');
    if (select) select.value = 'custom';
  }
}

async function handleAiProviderChange(event) {
  const field = event.target?.dataset?.aiField;
  if (!field) return;
  if (field === 'promptPreset' && event.target.value !== 'custom') {
    const card = event.target.closest('.ai-provider-item');
    applyPresetToCard(card, event.target.value);
  }
  collectAiProvidersFromDom();
  await saveSettings({ quiet: true });
  renderAiProviders();
  status('Saved. Open windows update immediately.');
}

async function handleAiProviderAction(event) {
  const action = event.target?.dataset?.aiAction;
  if (!action) return;
  const card = event.target.closest('.ai-provider-item');
  const id = card?.dataset?.providerId;
  if (action === 'toggle-details') {
    card?.classList.toggle('collapsed');
    const button = event.target;
    const isCollapsed = card?.classList.contains('collapsed');
    expandedAiProviderId = isCollapsed ? '' : String(id || '');
    if (button) button.textContent = isCollapsed ? '▸' : '▾';
    return;
  }
  if (action === 'show-key') {
    const input = card?.querySelector('[data-ai-field="apiKey"]');
    if (input) input.type = event.target.checked ? 'text' : 'password';
    return;
  }
  collectAiProvidersFromDom();
  const index = aiProviders.findIndex((item) => item.id === id);
  if (action === 'move-up' && index > 0) {
    [aiProviders[index - 1], aiProviders[index]] = [aiProviders[index], aiProviders[index - 1]];
    renderAiProviders(); await saveSettings(); return;
  }
  if (action === 'move-down' && index >= 0 && index < aiProviders.length - 1) {
    [aiProviders[index + 1], aiProviders[index]] = [aiProviders[index], aiProviders[index + 1]];
    renderAiProviders(); await saveSettings(); return;
  }
  if (action === 'duplicate' && index >= 0) {
    const copy = { ...aiProviders[index], id: createAiProviderId(), providerName: `${aiProviders[index].providerName} Copy`, enabled: false };
    aiProviders.splice(index + 1, 0, normalizeAiProvider(copy, index + 1));
    aiSecrets[copy.id] = { apiKey: '' };
    expandedAiProviderId = copy.id;
    renderAiProviders(); await saveSettings(); return;
  }
  if (action === 'delete' && index >= 0 && aiProviders.length > 1) {
    delete aiSecrets[aiProviders[index].id];
    aiProviders.splice(index, 1);
    renderAiProviders(); await saveSettings(); return;
  }
  if (action === 'reset-prompt' && card) {
    const preset = card.querySelector('[data-ai-field="promptPreset"]')?.value || DEFAULT_AI_PRESET_ID;
    applyPresetToCard(card, preset === 'custom' ? DEFAULT_AI_PRESET_ID : preset);
    collectAiProvidersFromDom();
    await saveSettings(); renderAiProviders(); return;
  }
  if (action === 'test' && id) {
    await testAiProvider(id);
  }
}

function applyPresetToCard(card, presetId) {
  const preset = AI_PROVIDER_PRESETS[presetId];
  if (!card || !preset) return;
  const system = card.querySelector('[data-ai-field="systemPrompt"]');
  const user = card.querySelector('[data-ai-field="userPromptTemplate"]');
  if (system) system.value = preset.systemPrompt;
  if (user) user.value = preset.userPromptTemplate;
}

function collectAiProvidersFromDom() {
  const rows = Array.from(document.querySelectorAll('.ai-provider-item'));
  const providers = [];
  const secrets = {};
  rows.forEach((card, index) => {
    const read = (field) => card.querySelector(`[data-ai-field="${field}"]`);
    const id = sanitizeAiProviderId(card.dataset.providerId) || createAiProviderId();
    providers.push(normalizeAiProvider({
      id,
      enabled: read('enabled')?.checked === true,
      providerName: read('providerName')?.value,
      apiUrl: read('apiUrl')?.value,
      model: read('model')?.value,
      promptPreset: read('promptPreset')?.value,
      systemPrompt: read('systemPrompt')?.value,
      userPromptTemplate: read('userPromptTemplate')?.value,
      temperature: Number(read('temperature')?.value),
      maxTextLength: Number(read('maxTextLength')?.value),
      maxOutputTokens: Number(read('maxOutputTokens')?.value),
      order: index + 1
    }, index));
    secrets[id] = { apiKey: String(read('apiKey')?.value || '').trim() };
  });
  aiProviders = providers.length ? providers : defaultAiProviders();
  aiSecrets = normalizeAiSecrets(secrets, null, aiProviders);
  return aiProviders;
}

async function testAiProvider(providerId) {
  collectAiProvidersFromDom();
  const card = document.querySelector(`.ai-provider-item[data-provider-id="${CSS.escape(providerId)}"]`);
  const output = card?.querySelector('[data-ai-test-result="true"]');
  if (output) { output.hidden = false; output.textContent = 'Testing AI Provider…'; }
  await saveSettings({ quiet: true });
  try {
    const response = await chrome.runtime.sendMessage({ type: 'DICTFLOAT_CUSTOM_AI_TEST', providerId, text: 'You\'ve hit your usage limit.' });
    if (!response?.ok) throw new Error(response?.error || 'AI Provider test failed.');
    if (output) output.textContent = String(response.data?.translation || '').trim() || 'AI Provider responded successfully.';
    status('AI Provider test completed.');
  } catch (error) {
    card?.classList.remove('collapsed');
    expandedAiProviderId = providerId;
    const toggle = card?.querySelector('[data-ai-action="toggle-details"]');
    if (toggle) toggle.textContent = '▾';
    if (output) output.textContent = `Test failed: ${String(error?.message || error)}`;
    status('AI Provider test failed.');
  }
}

async function saveSettings(options = {}) {
  collectAiProvidersFromDom();
  const settings = {
    selectionMode: $('selectionMode').value,
    fontSize: clamp(Number($('fontSize').value), 10, 15, 12),
    panelWidth: clamp(Number($('panelWidth').value), 320, 520, 380),
    theme: $('theme').value,
    onlineLookup: $('onlineLookup').checked,
    accent: $('accent').value,
    translationProviders: readTranslationProviderSettings(),
    sentenceTranslationConfigs: readSentenceTranslationConfigSettings(),
    customAiProvider: aiProviders[0] ? { ...aiProviders[0] } : defaultCustomAiProvider(),
    aiProviders,
    themeLockedByUser: true
  };
  $('fontSize').value = settings.fontSize;
  $('panelWidth').value = settings.panelWidth;
  await chrome.storage.local.set({ dictFloatSettings: settings, dictFloatAiSecrets: aiSecrets, dictFloatTranslationSecrets: translationSecrets });
  applyAccent(settings.accent);
  if (!options.quiet) status('Saved. Open windows update immediately.');
}

async function resetWindowPosition() {
  await chrome.storage.local.remove('dictFloatPanelPosition');
  status('Window position reset. Reopen DictFloat to use the default position.');
}

function renderDictionaries() { renderDictionaryLibrary(); }
function renderMdictSources() { renderDictionaryLibrary(); }
function renderWudaoSource() { renderDictionaryLibrary(); }
function renderSourceOrder() { renderDictionaryLibrary(); }

async function reconcileMdictSourceHealth() {
  if (!globalThis.DictFloatMdictDB?.inspectLinkedSource || !mdictSources.length) return;
  let changed = false;
  const updated = [];
  for (const source of mdictSources) {
    const next = { ...source };
    try {
      const health = await DictFloatMdictDB.inspectLinkedSource(source.id);
      const statusValue = health.ready ? 'ready' : (health.state || 'missing');
      const message = health.ready ? '' : String(health.message || 'Linked MDX file is unavailable.');
      if (next.status !== statusValue || next.connectionMessage !== message) { next.status = statusValue; next.connectionMessage = message; changed = true; }
    } catch (_) {
      if (next.status !== 'missing' || next.connectionMessage !== 'Saved MDX link is missing.') { next.status='missing'; next.connectionMessage='Saved MDX link is missing.'; changed=true; }
    }
    updated.push(normalizeMdictSource(next));
  }
  mdictSources = updated;
  if (changed) await chrome.storage.local.set({ dictFloatMdictSources: mdictSources });
}

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
    else if (key === 'wudao' && (wudaoSource?.installed || wudaoSource?.configured)) row = buildWudaoLibraryRow(index);
    else if (key === 'online') row = buildOnlineLibraryRow(index);
    if (row) list.append(row);
  });

  if (!list.children.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.textContent = 'No dictionary source yet. Use + Add source to connect a dictionary or create a glossary.';
    list.append(empty);
  }
  const missing = mdictSources.filter((source) => ['missing', 'changed'].includes(source.status));
  const access = mdictSources.filter((source) => source.status === 'access');
  const notice = $('libraryConnectionNotice');
  const noticeText = $('libraryConnectionNoticeText');
  const action = $('reconnectDictionaryRootInline');
  if (notice && noticeText && action) {
    notice.hidden = !(missing.length || access.length);
    if (missing.length) {
      noticeText.textContent = missing.length === 1 ? '1 linked dictionary file needs locating.' : `${missing.length} linked dictionary files need locating.`;
      action.textContent = 'Find missing'; action.dataset.action = 'find-missing';
    } else {
      noticeText.textContent = access.length === 1 ? '1 linked dictionary needs access confirmation.' : `${access.length} linked dictionaries need access confirmation.`;
      action.textContent = 'Restore access'; action.dataset.action = 'restore-access';
    }
  }
}

function makeLibraryBaseRow(index, key, enabled, title, kind, fileLine, stateLine, toggleHandler) {
  // Defensive argument recovery: do not ever stringify a callback into the UI
  // if a source row accidentally omits its state-line argument.
  if (typeof stateLine === 'function' && toggleHandler === undefined) {
    toggleHandler = stateLine;
    stateLine = '';
  }
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
  check.addEventListener('change', () => { if (typeof toggleHandler === 'function') void toggleHandler(check.checked); });
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
  state.textContent = typeof stateLine === 'string' ? stateLine : '';
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
  const fileLabel = dictionary.fileName ? `🔗 ${dictionary.fileName} · ${count} editable ${count === 1 ? 'entry' : 'entries'}` : `✎ ${count} editable ${count === 1 ? 'entry' : 'entries'}`;
  const kind = dictionary.builtIn ? 'Built-in · editable' : 'Glossary';
  const state = dictionary.builtIn ? 'Starter glossary · local edits stay on this device' : 'Editable locally · JSON / CSV export available';
  const { row, actions } = makeLibraryBaseRow(index, sourceKeyForGlossary(dictionary), dictionary.enabled, dictionary.name, kind, fileLabel, state, async (checked) => {
    dictionary.enabled = checked; await saveDictionaries(); renderDictionaryLibrary(); status(`${dictionary.name} ${checked ? 'enabled' : 'disabled'}.`);
  });
  actions.append(makeButton('Edit entries', () => openEntryManager(dictionary)));
  if (!dictionary.builtIn) { actions.append(makeButton('Rename', () => renameDictionary(dictionary))); actions.append(makeButton('Export', () => exportGlossary(dictionary))); actions.append(makeButton('Delete', () => deleteDictionary(dictionary), 'delete')); }
  else actions.append(makeButton('Export', () => exportGlossary(dictionary)));
  return row;
}

function buildMdictLibraryRow(source, index) {
  if (!source) return null;
  const css = source.cssFiles.length ? `${source.cssFiles.length} CSS` : 'Compact style';
  const mdd = source.mddFiles.length ? `${source.mddFiles.length} MDD` : 'No MDD';
  const fileLine = `🔗 ${source.fileName || source.name} · ${formatSize(source.fileSize)} · ${css} · ${mdd}`;
  const labels = { ready:`Linked · on-demand lookup · ${source.cssMode === 'compact' ? 'Compact style' : 'Original CSS'}`, access:'Access confirmation required · the linked folder is still remembered', changed:'MDX file changed · rebuild its lightweight index', missing:'File link is missing · locate this dictionary only' };
  const { row, actions } = makeLibraryBaseRow(
    index,
    sourceKeyForMdict(source),
    source.enabled,
    source.name,
    'Linked MDX',
    fileLine,
    labels[source.status] || labels.missing,
    async (checked) => {
      source.enabled = checked;
      await saveMdictSources();
      renderDictionaryLibrary();
      status(`${source.name} ${checked ? 'enabled' : 'disabled'}.`);
    }
  );
  actions.append(makeButton('Rename', () => renameMdictSource(source)));
  if (source.status === 'ready' || source.status === 'changed') actions.append(makeButton('Rebuild', () => rebuildMdictSource(source)));
  if (source.status === 'access') actions.append(makeButton('Restore access', () => restoreMdictSourceAccess(source)));
  if (source.status === 'missing') actions.append(makeButton('Locate', () => reconnectMdictSource(source)));
  if (source.cssFiles.length) actions.append(makeButton(source.cssMode === 'compact' ? 'Style: Compact' : 'Style: Original', () => toggleMdictStyle(source)));
  actions.append(makeButton('Export', () => exportMdictConfig(source)));
  actions.append(makeButton('Disconnect', () => removeMdictSource(source), 'delete'));
  return row;
}

function buildWudaoLibraryRow(index) {
  const names = wudaoSource.fileNames;
  const linked = !!wudaoSource.installed;
  const fileLine = linked
    ? `📦 ${names.enIndex} · ${names.enData} · ${names.zhIndex} · ${names.zhData} · ${formatSize(wudaoSource.totalSize)}`
    : `📦 ${names.enIndex} · ${names.enData} · ${names.zhIndex} · ${names.zhData}`;
  const state = linked
    ? `${wudaoSource.recordCounts.en.toLocaleString()} English · ${wudaoSource.recordCounts.zh.toLocaleString()} Chinese · stored locally`
    : 'Reconnect required · the data files are not included in backups';
  const { row, actions } = makeLibraryBaseRow(index, 'wudao', linked && wudaoSource.enabled, wudaoSource.name || 'Wudao · Offline', 'Offline pack', fileLine, state, async (checked) => {
    if (!wudaoSource.installed) return;
    wudaoSource.enabled = checked;
    await chrome.storage.local.set({ dictFloatWudaoSource: wudaoSource });
    renderDictionaryLibrary();
    status(`Wudao offline pack ${checked ? 'enabled' : 'disabled'}.`);
  });
  const enabledToggle = row.querySelector('input[type="checkbox"]');
  if (!linked && enabledToggle) {
    enabledToggle.disabled = true;
    enabledToggle.title = 'Reconnect the local Wudao files first';
  }
  actions.append(makeButton('Rename', renameWudaoSource));
  actions.append(makeButton(linked ? 'Replace' : 'Reconnect', linked ? () => $('importWudaoFiles').click() : reconnectDictionaryRoot));
  actions.append(makeButton('Export', exportWudaoConfig));
  actions.append(makeButton('Remove pack', removeWudaoPack, 'delete'));
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
  if (!(wudaoSource?.installed || wudaoSource?.configured)) return;
  const next = prompt('Dictionary display name:', wudaoSource.name || 'Wudao · Offline');
  if (!next?.trim() || next.trim() === (wudaoSource.name || 'Wudao · Offline')) return;
  wudaoSource.name = next.trim();
  await chrome.storage.local.set({ dictFloatWudaoSource: wudaoSource });
  renderDictionaryLibrary();
  status('Wudao display name updated.');
}

function exportWudaoConfig() {
  if (!(wudaoSource?.installed || wudaoSource?.configured)) return;
  download(`${safeFileName(wudaoSource.name || 'Wudao Offline')}.dictfloat-wudao.json`, JSON.stringify({
    format: 'dictfloat-wudao-config', version: 4, source: wudaoSource,
    note: 'This export contains settings only. The original four Wudao data files are not copied or redistributed.'
  }, null, 2), 'application/json');
  status('Exported Wudao source settings. The original four data files remain local.');
}

async function deleteDictionary(dictionary) {
  const count = entries.filter((entry) => entry.dictionaryId === dictionary.id).length;
  const approved = await confirmRisk({
    title: `Delete “${dictionary.name}”?`,
    message: 'This removes the editable glossary and its local entries from DictFloat.',
    impact: [
      `${count} local ${count === 1 ? 'entry' : 'entries'} will be removed.`,
      'Built-in glossary entries, linked MDX/MDD dictionaries, Wudao, history, and settings are not affected.',
      'A recovery snapshot will be created first.'
    ],
    confirmLabel: 'Delete glossary',
    requireText: count >= 20 ? dictionary.name : ''
  });
  if (!approved) return;
  await createRecoverySnapshot(`Before deleting glossary: ${dictionary.name}`);
  entries = entries.filter((entry) => entry.dictionaryId !== dictionary.id);
  dictionaries = dictionaries.filter((item) => item.id !== dictionary.id);
  sourceOrder = normalizeSourceOrder(sourceOrder);
  await chrome.storage.local.set({ dictFloatEntries: entries, dictFloatDictionaries: dictionaries, dictFloatSourceOrder: sourceOrder });
  renderDictionaries();
  renderSourceOrder();
  status(`Deleted “${dictionary.name}”. A recovery snapshot is available below.`);
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
  if (wudaoSource?.installed || wudaoSource?.configured) {
    sources.push({
      key: 'wudao', type: 'Offline', name: wudaoSource.name || 'Wudao · Offline',
      meta: wudaoSource.installed ? (wudaoSource.enabled ? 'Enabled for offline lookup' : 'Disabled') : 'Reconnect local data files',
      enabled: wudaoSource.installed && wudaoSource.enabled
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

async function restoreMdictSourceAccess(source) {
  try {
    const health = await DictFloatMdictDB.requestLinkedSourceAccess(source.id);
    source.status = health.ready ? 'ready' : (health.state || 'access');
    source.connectionMessage = health.ready ? '' : String(health.message || 'Access confirmation required.');
    await saveMdictSources(); renderDictionaryLibrary();
    status(health.ready ? `Access restored for “${source.name}”.` : `${source.name}: ${source.connectionMessage}`, !health.ready);
  } catch (error) { status(`Unable to restore access: ${error.message || error}`, true); }
}

async function restoreAllMdictAccess() {
  const targets = mdictSources.filter((source) => source.status === 'access');
  if (!targets.length) return;
  let restored=0;
  for (const source of targets) { const health=await DictFloatMdictDB.requestLinkedSourceAccess(source.id); source.status=health.ready?'ready':(health.state||'access'); source.connectionMessage=health.ready?'':String(health.message||'Access confirmation required.'); if(health.ready) restored+=1; }
  await saveMdictSources(); renderDictionaryLibrary();
  status(restored===targets.length ? `Access restored for ${restored} linked ${restored===1?'dictionary':'dictionaries'}.` : `Access restored for ${restored} of ${targets.length} linked dictionaries.`, restored!==targets.length);
}

async function handleLibraryConnectionAction() {
  if (mdictSources.some((source) => ['missing','changed'].includes(source.status))) return reconnectDictionaryRoot();
  return restoreAllMdictAccess();
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


async function reconnectDictionaryRoot() {
  if (!('showDirectoryPicker' in window)) {
    status('Folder relinking needs a current Chrome desktop build.', true);
    return;
  }
  const missingMdictSources = mdictSources.filter((source) => ['missing', 'changed'].includes(source.status));
  const needsWudao = !!(wudaoSource?.configured && !wudaoSource?.installed);
  const targets = missingMdictSources.length + (needsWudao ? 1 : 0);
  if (!targets) {
    status('No linked dictionary file needs locating. Existing links were left unchanged.');
    return;
  }
  try {
    const folderHandle = await window.showDirectoryPicker({ mode: 'read' });
    status('Scanning the selected dictionary root…');
    setMdictIndexBusy(true);
    const files = await collectDirectoryFiles(folderHandle);
    let recoveredMdx = 0;
    let missingMdx = 0;

    for (let index = 0; index < missingMdictSources.length; index += 1) {
      const source = missingMdictSources[index];
      const candidate = await findMdictCandidateForSource(source, files);
      if (!candidate) {
        source.status = 'reconnect';
        missingMdx += 1;
        continue;
      }
      status(`Relinking ${source.name} (${index + 1}/${missingMdictSources.length})…`);
      const linked = await linkMdictCandidate(folderHandle, candidate, files, source.id);
      linked.name = source.name || linked.name;
      linked.enabled = source.enabled !== false;
      linked.cssMode = source.cssMode === 'compact' ? 'compact' : linked.cssMode;
      const record = await DictFloatMdictDB.getLinkedSource(linked.id);
      if (record) {
        record.cssMode = linked.cssMode;
        await DictFloatMdictDB.putLinkedSource(record);
      }
      const at = mdictSources.findIndex((item) => item.id === source.id);
      if (at >= 0) mdictSources[at] = linked;
      recoveredMdx += 1;
    }

    let recoveredWudao = false;
    if (needsWudao) {
      const selected = await findWudaoFilesInDirectory(files, wudaoSource.fileNames);
      if (Object.values(selected).every(Boolean)) {
        status('Restoring Wudao offline data…');
        await installWudaoSelected(selected, {
          name: wudaoSource.name,
          enabled: wudaoSource.enabled !== false,
          quiet: true
        });
        recoveredWudao = true;
      } else if (!wudaoSource.installed) {
        wudaoSource = normalizeWudaoSource({ ...wudaoSource, installed: false, configured: true, needsReconnect: true, enabled: false });
      }
    }

    sourceOrder = normalizeSourceOrder(sourceOrder);
    await chrome.storage.local.set({
      dictFloatMdictSources: mdictSources,
      dictFloatWudaoSource: wudaoSource,
      dictFloatSourceOrder: sourceOrder
    });
    renderDictionaryLibrary();
    const missingText = missingMdx ? ` · ${missingMdx} MDX source${missingMdx === 1 ? '' : 's'} not found` : '';
    const wudaoText = (wudaoSource?.configured || wudaoSource?.installed) ? ` · Wudao ${recoveredWudao || wudaoSource?.installed ? 'ready' : 'not found'}` : '';
    status(`Recovery complete: ${recoveredMdx} MDX source${recoveredMdx === 1 ? '' : 's'} relinked${wudaoText}${missingText}.`);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    status(`Dictionary recovery failed: ${error.message || error}`, true);
  } finally {
    setMdictIndexBusy(false);
  }
}

async function findMdictCandidateForSource(source, files) {
  const candidates = files.filter((item) => item.kind === 'file' && /\.mdx$/i.test(item.name));
  const sameName = candidates.filter((item) => item.name === source.fileName);
  const sameBase = candidates.filter((item) => basename(item.name).toLowerCase() === basename(source.fileName).toLowerCase());
  const ordered = [...sameName, ...sameBase.filter((item) => !sameName.includes(item))];
  for (const candidate of ordered) {
    try {
      const file = await candidate.handle.getFile();
      if (!source.fileSize || file.size === source.fileSize) return candidate;
    } catch (_) {}
  }
  return ordered[0] || null;
}

async function findWudaoFilesInDirectory(files, expectedNames = {}) {
  const wanted = {
    enIndex: String(expectedNames.enIndex || 'en.ind').toLowerCase(),
    enData: String(expectedNames.enData || 'en.z').toLowerCase(),
    zhIndex: String(expectedNames.zhIndex || 'zh.ind').toLowerCase(),
    zhData: String(expectedNames.zhData || 'zh.z').toLowerCase()
  };
  const result = { enIndex: null, enData: null, zhIndex: null, zhData: null };
  for (const item of files) {
    if (item.kind !== 'file') continue;
    const name = item.name.toLowerCase();
    for (const [key, expected] of Object.entries(wanted)) {
      if (!result[key] && name === expected) {
        try { result[key] = await item.handle.getFile(); } catch (_) {}
      }
    }
  }
  return result;
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
    status: 'ready',
    connectionMessage: ''
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
  const approved = await confirmRisk({
    title: `Disconnect “${source.name}”?`,
    message: 'This removes DictFloat’s saved link and lightweight index for this dictionary.',
    impact: [
      `Original ${source.fileName || 'MDX'}, MDD, and CSS files on your computer will not be deleted.`,
      'The dictionary can be reconnected later from Dictionary Library.',
      'A recovery snapshot of its configuration will be created first.'
    ],
    confirmLabel: 'Disconnect source'
  });
  if (!approved) return;
  try {
    await createRecoverySnapshot(`Before disconnecting MDX: ${source.name}`);
    if (globalThis.DictFloatMdictDB) await DictFloatMdictDB.deleteLinkedSource(source.id);
    await chrome.runtime.sendMessage({ type: 'DICTFLOAT_MDICT_CLEAR_CACHE', sourceId: source.id });
    mdictSources = mdictSources.filter((item) => item.id !== source.id);
    sourceOrder = normalizeSourceOrder(sourceOrder);
    await saveMdictSources();
    await chrome.storage.local.set({ dictFloatSourceOrder: sourceOrder });
    renderMdictSources();
    renderSourceOrder();
    status(`Disconnected “${source.name}”. A recovery snapshot is available below.`);
  } catch (error) {
    status(`Unable to disconnect the MDX dictionary: ${error.message}`, true);
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
  const states = new Set(['ready','access','missing','changed','rebuilding']);
  let status = states.has(source.status) ? source.status : (source.status === 'reconnect' ? 'missing' : 'ready');
  if (status === 'ready' && Number(source.recordCount || 0) <= 0) status = 'missing';
  return {
    id: String(source.id || crypto.randomUUID()), name: String(source.name || basename(source.fileName) || 'Untitled MDX dictionary'), enabled: source.enabled !== false,
    fileName:String(source.fileName || ''), fileSize:Number(source.fileSize || 0), lastModified:Number(source.lastModified || 0), directoryPath:String(source.directoryPath || ''), linkedFolderName:String(source.linkedFolderName || ''), addedAt:Number(source.addedAt || Date.now()),
    header:{ title:String(source.header?.title || ''), description:String(source.header?.description || ''), engineVersion:String(source.header?.engineVersion || ''), encoding:String(source.header?.encoding || ''), encrypted:String(source.header?.encrypted || '0'), keyCaseSensitive:String(source.header?.keyCaseSensitive || ''), stripKey:String(source.header?.stripKey || '') },
    lookup:{ caseSensitive:source.lookup?.caseSensitive === true, stripKey:source.lookup?.stripKey !== false },
    mddFiles:Array.isArray(source.mddFiles) ? source.mddFiles.map((item)=>({name:String(item.name||''),size:Number(item.size||0),lastModified:Number(item.lastModified||0)})) : [],
    cssFiles:Array.isArray(source.cssFiles) ? source.cssFiles.map((item)=>({name:String(item.name||''),size:Number(item.size||0),lastModified:Number(item.lastModified||0)})) : [],
    recordCount:Number(source.recordCount||0), parser:String(source.parser||''), cssMode:source.cssMode === 'compact'?'compact':'safe-original', status,
    connectionMessage:status === 'ready' ? '' : String(source.connectionMessage || (status==='access'?'Access confirmation required.':'Linked MDX file is unavailable.'))
  };
}


async function exportBackup() {
  const snapshot = await chrome.storage.local.get(BACKUP_STORAGE_KEYS);
  const backup = buildBackupPayload(snapshot);
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  download(`dictfloat-backup-${stamp}.json`, JSON.stringify(backup, null, 2), 'application/json');
  status(`Backup exported: ${backup.entries.length} editable entries and ${backup.mdictSources.length} linked MDX source record${backup.mdictSources.length === 1 ? '' : 's'}.`);
}

function sourceForBackup(source) {
  const normalized = normalizeMdictSource(source);
  return { ...normalized, status: 'missing', connectionMessage: 'Saved MDX link is not included in backups.' };
}

function wudaoSourceForBackup(source) {
  const normalized = normalizeWudaoSource(source);
  if (!(normalized.installed || normalized.configured)) return null;
  return {
    ...normalized,
    installed: false,
    enabled: false,
    configured: true,
    needsReconnect: true,
    importedAt: 0
  };
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (parsed?.format !== BACKUP_FORMAT) throw new Error('This is not a DictFloat backup file. Use + Add source for a glossary JSON or CSV file.');
    const incomingEntries = Array.isArray(parsed.entries) ? parsed.entries.length : 0;
    const incomingGlossaries = Array.isArray(parsed.dictionaries) ? parsed.dictionaries.filter((item) => !item.builtIn).length : 0;
    const incomingMdx = Array.isArray(parsed.mdictSources) ? parsed.mdictSources.length : 0;
    const approved = await confirmRisk({
      title: 'Restore this backup?',
      message: `“${file.name}” will replace the current DictFloat configuration.`,
      impact: [
        `${incomingEntries} editable ${incomingEntries === 1 ? 'entry' : 'entries'} · ${incomingGlossaries} ${incomingGlossaries === 1 ? 'glossary' : 'glossaries'} · ${incomingMdx} linked MDX record${incomingMdx === 1 ? '' : 's'}.`,
        'A recovery snapshot of the current state will be created first.',
        'MDX/MDD links and Wudao data files are not contained in backups. Locate only the dictionaries that are missing.'
      ],
      confirmLabel: 'Restore backup',
      requireText: 'RESTORE'
    });
    if (!approved) return;
    await createRecoverySnapshot(`Before restoring backup: ${file.name}`);
    await applyBackupPayload(parsed);
    status(`Backup restored. Locate only the ${mdictSources.length} saved MDX source${mdictSources.length === 1 ? '' : 's'} that are missing${wudaoSource.configured ? ', then re-import Wudao' : ''}.`);
  } catch (error) {
    status(`Backup import failed: ${error.message || error}`, true);
  }
}

async function applyBackupPayload(parsed) {
  if (globalThis.DictFloatMdictDB?.clearLinkedSources) await DictFloatMdictDB.clearLinkedSources();
  await deleteWudaoPack().catch(() => undefined);
  await chrome.runtime.sendMessage({ type: 'DICTFLOAT_WUDAO_RESET' }).catch(() => undefined);

  entries = Array.isArray(parsed.entries) ? parsed.entries.map(normalizeEntry) : [];
  dictionaries = normalizeDictionaries(parsed.dictionaries);
  migrateStarterGlossaryEntries();
  mdictSources = Array.isArray(parsed.mdictSources)
    ? parsed.mdictSources.map((source) => normalizeMdictSource({ ...source, status: 'missing', connectionMessage: 'Saved MDX link is not included in backups.' }))
    : [];
  wudaoSource = parsed.wudaoSource
    ? normalizeWudaoSource({ ...parsed.wudaoSource, installed: false, enabled: false, configured: true, needsReconnect: true })
    : normalizeWudaoSource(null);
  sourceOrder = normalizeSourceOrder(parsed.sourceOrder);
  const restoredSettings = { ...defaults, ...(parsed.settings || {}) };
  const restoredHistory = Array.isArray(parsed.history) ? parsed.history : [];
  const restoredCollapsed = Array.isArray(parsed.collapsedSources) ? parsed.collapsedSources.map(String) : [];
  const restoredPosition = parsed.panelPosition && typeof parsed.panelPosition === 'object' ? parsed.panelPosition : null;

  await chrome.storage.local.set({
    dictFloatSettings: restoredSettings,
    dictFloatEntries: entries,
    dictFloatDictionaries: dictionaries,
    dictFloatMdictSources: mdictSources,
    dictFloatWudaoSource: wudaoSource,
    dictFloatSourceOrder: sourceOrder,
    dictFloatHistory: restoredHistory,
    dictFloatPanelPosition: restoredPosition,
    dictFloatCollapsedSources: restoredCollapsed
  });
  for (const key of Object.keys(defaults)) {
    const element = $(key);
    if (!element) continue;
    if (element.type === 'checkbox') element.checked = !!restoredSettings[key];
    else element.value = restoredSettings[key];
  }
  applyAccent(restoredSettings.accent);
  await reconcileMdictSourceHealth();
  renderDictionaryLibrary();
  renderRecoverySnapshots();
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
    let incomingWudaoSource = null;
    let incomingSourceOrder = [];
    const importedName = basenameForDisplay(file.name) || 'Imported glossary';
    if (file.name.toLowerCase().endsWith('.json')) {
      const json = JSON.parse(text);
      incoming = Array.isArray(json) ? json : (json.entries || []);
      incomingDictionaries = Array.isArray(json.dictionaries) ? json.dictionaries : (json.dictionary ? [json.dictionary] : []);
      incomingMdictSources = Array.isArray(json.mdictSources) ? json.mdictSources : [];
      incomingWudaoSource = json.wudaoSource || null;
      incomingSourceOrder = Array.isArray(json.sourceOrder) ? json.sourceOrder : [];
    } else {
      incoming = parseCsv(text);
    }

    let fallbackDictionary = null;
    const incomingNames = new Set(incoming.map((entry) => String(entry.dictionary || '').trim().toLowerCase()).filter(Boolean));
    const onlyStarterRows = incomingNames.size > 0 && [...incomingNames].every((name) => ['pcie starter', 'dictfloat glossary', 'dictfloat-glossary'].includes(name));
    if (!incomingDictionaries.length && incoming.length && !onlyStarterRows) {
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
    const fallbackId = fallbackDictionary?.id || incomingDictionaries[0]?.id || 'pcie-starter';
    incoming = incoming.map((entry) => normalizeEntry({
      ...entry,
      dictionaryId: entry.dictionaryId || dictionaryIdByName(entry.dictionary) || fallbackId,
      source: entry.source || file.name
    })).filter((entry) => entry.term && entry.definition);
    if (!incoming.length && !incomingMdictSources.length) throw new Error('No valid entries or MDX source records found.');
    const byKey = new Map(entries.map((entry) => [`${entry.dictionaryId}:${entry.term.toLowerCase()}`, entry]));
    let skippedDuplicates = 0;
    incoming.forEach((entry) => {
      const key = `${entry.dictionaryId}:${entry.term.toLowerCase()}`;
      if (byKey.has(key)) { skippedDuplicates += 1; return; }
      byKey.set(key, entry);
    });
    entries = [...byKey.values()];
    incomingMdictSources.map((raw) => normalizeMdictSource({ ...raw, status: 'missing', connectionMessage: 'Saved MDX link is not included in imports.' })).forEach((source) => {
      mdictSources = mdictSources.filter((item) => item.id !== source.id && !(item.fileName === source.fileName && item.fileSize === source.fileSize));
      mdictSources.push(source);
    });
    if (incomingWudaoSource) {
      wudaoSource = normalizeWudaoSource({ ...incomingWudaoSource, installed: false, enabled: false, configured: true, needsReconnect: true });
    }
    sourceOrder = normalizeSourceOrder(incomingSourceOrder.length ? incomingSourceOrder : sourceOrder);
    await chrome.storage.local.set({
      dictFloatEntries: entries,
      dictFloatDictionaries: dictionaries,
      dictFloatMdictSources: mdictSources,
      dictFloatWudaoSource: wudaoSource,
      dictFloatSourceOrder: sourceOrder
    });
    renderDictionaryLibrary();
    const recoveryHint = incomingMdictSources.length || incomingWudaoSource ? ' Locate only the imported missing dictionary records to restore local files.' : '';
    status(`Imported ${incoming.length - skippedDuplicates} editable ${incoming.length - skippedDuplicates === 1 ? 'entry' : 'entries'} from ${file.name}${skippedDuplicates ? ` · kept ${skippedDuplicates} existing duplicate${skippedDuplicates === 1 ? '' : 's'}` : ''}.${recoveryHint}`);
  } catch (error) {
    status(`Import failed: ${error.message}`, true);
  }
}

async function clearEntries() {
  const count = entries.length;
  if (!count) { status('There are no editable glossary entries to clear.'); return; }
  const approved = await confirmRisk({
    title: 'Clear all editable glossary entries?',
    message: 'This is a high-impact change. All editable entries across every glossary will be removed.',
    impact: [
      `${count} editable ${count === 1 ? 'entry' : 'entries'} will be permanently removed from the active library.`,
      'Linked MDX/MDD dictionaries, Wudao, history, and settings will not be affected.',
      'A recovery snapshot will be created first.'
    ],
    confirmLabel: `Clear ${count} ${count === 1 ? 'entry' : 'entries'}`,
    requireText: 'CLEAR'
  });
  if (!approved) return;
  await createRecoverySnapshot(`Before clearing ${count} editable glossary entries`);
  entries = [];
  await chrome.storage.local.set({ dictFloatEntries: [] });
  renderDictionaries();
  status(`Cleared ${count} editable ${count === 1 ? 'entry' : 'entries'}. A recovery snapshot is available below.`);
}

function normalizeEntry(entry) {
  return {
    id: entry.id || crypto.randomUUID(),
    dictionaryId: String(entry.dictionaryId || dictionaryIdByName(entry.dictionary) || 'pcie-starter'),
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

function migrateStarterGlossaryEntries() {
  const starter = dictionaries.find((dictionary) => dictionary.id === 'pcie-starter');
  if (!starter) return false;
  const legacy = dictionaries.filter((dictionary) => dictionary.id !== 'pcie-starter' && /^(?:pcie starter|dictfloat[- ]glossary)$/i.test(String(dictionary.name || '').trim()));
  if (!legacy.length) return false;
  const ids = new Set(legacy.map((dictionary) => dictionary.id));
  let changed = false;
  entries = entries.map((entry) => {
    if (!ids.has(entry.dictionaryId)) return entry;
    changed = true;
    return { ...entry, dictionaryId: 'pcie-starter', updatedAt: Number(entry.updatedAt || Date.now()) };
  });
  dictionaries = dictionaries.filter((dictionary) => !ids.has(dictionary.id));
  return changed;
}

function normalizeDictionaries(input) {
  const source = Array.isArray(input) ? input : [];
  const mapped = source.filter(Boolean).map((item) => ({ id:String(item.id || crypto.randomUUID()), name:String(item.name || 'Untitled glossary').trim() || 'Untitled glossary', enabled:item.enabled !== false, builtIn:!!item.builtIn, locallyEditable:item.locallyEditable === true || String(item.id||'')==='pcie-starter', sourceKind:String(item.sourceKind || (item.builtIn?'built-in':'manual')), fileName:String(item.fileName||''), createdAt:Number(item.createdAt||Date.now()) }));
  const starter=mapped.find((dictionary)=>dictionary.id==='pcie-starter');
  if (!starter) mapped.unshift(defaultDictionaries()[0]);
  else { if (starter.name === 'PCIe Starter') starter.name='DictFloat Glossary'; starter.builtIn=true; starter.locallyEditable=true; }
  return mapped.filter((dictionary)=>!(dictionary.id==='my-glossary' && !entries.some((entry)=>entry.dictionaryId==='my-glossary')));
}

function dictionaryFor(id) { return dictionaries.find((dictionary) => dictionary.id === id); }
function dictionaryIdByName(name) {
  const wanted = String(name || '').trim().toLowerCase();
  if (['pcie starter', 'dictfloat glossary', 'dictfloat-glossary'].includes(wanted)) return 'pcie-starter';
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

// ---------------------------------------------------------------------------
// Data safety / recovery
// ---------------------------------------------------------------------------
function normalizeRecoverySnapshots(input) {
  return (Array.isArray(input) ? input : []).filter((item) => item && item.data).map((item) => ({
    id: String(item.id || crypto.randomUUID()),
    label: String(item.label || 'Recovery snapshot'),
    createdAt: Number(item.createdAt || Date.now()),
    data: item.data
  })).sort((a, b) => b.createdAt - a.createdAt).slice(0, RECOVERY_SNAPSHOT_LIMIT);
}

function recoverySnapshotSummary(snapshot) {
  const data = snapshot?.data || {};
  const count = Array.isArray(data.entries) ? data.entries.length : 0;
  const glossaryCount = Array.isArray(data.dictionaries) ? data.dictionaries.filter((item) => !item.builtIn).length : 0;
  const historyCount = Array.isArray(data.history) ? data.history.length : 0;
  return `${count} editable ${count === 1 ? 'entry' : 'entries'} · ${glossaryCount} ${glossaryCount === 1 ? 'glossary' : 'glossaries'} · ${historyCount} history`;
}

function renderRecoverySnapshots() {
  const list = $('recoverySnapshotList');
  if (!list) return;
  list.textContent = '';
  if (!recoverySnapshots.length) {
    const empty = document.createElement('div');
    empty.className = 'recovery-snapshot-empty';
    empty.textContent = 'No recovery snapshot yet.';
    list.append(empty);
    return;
  }
  recoverySnapshots.forEach((snapshot) => {
    const row = document.createElement('div');
    row.className = 'recovery-snapshot';
    const info = document.createElement('div');
    info.className = 'recovery-snapshot-info';
    const title = document.createElement('div');
    title.className = 'recovery-snapshot-title';
    title.textContent = snapshot.label;
    const meta = document.createElement('div');
    meta.className = 'recovery-snapshot-meta';
    meta.textContent = `${new Date(snapshot.createdAt).toLocaleString()} · ${recoverySnapshotSummary(snapshot)}`;
    info.append(title, meta);
    const restore = makeButton('Restore', () => restoreRecoverySnapshot(snapshot));
    restore.title = 'Restore this snapshot';
    row.append(info, restore);
    list.append(row);
  });
}

function buildBackupPayload(snapshot = {}) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: chrome.runtime.getManifest().version,
    settings: snapshot.dictFloatSettings || { ...defaults },
    entries: Array.isArray(snapshot.dictFloatEntries) ? snapshot.dictFloatEntries : entries,
    dictionaries: Array.isArray(snapshot.dictFloatDictionaries) ? snapshot.dictFloatDictionaries : dictionaries,
    mdictSources: (Array.isArray(snapshot.dictFloatMdictSources) ? snapshot.dictFloatMdictSources : mdictSources).map(sourceForBackup),
    wudaoSource: wudaoSourceForBackup(snapshot.dictFloatWudaoSource || wudaoSource),
    sourceOrder: Array.isArray(snapshot.dictFloatSourceOrder) ? snapshot.dictFloatSourceOrder : sourceOrder,
    history: Array.isArray(snapshot.dictFloatHistory) ? snapshot.dictFloatHistory : [],
    panelPosition: snapshot.dictFloatPanelPosition || null,
    collapsedSources: Array.isArray(snapshot.dictFloatCollapsedSources) ? snapshot.dictFloatCollapsedSources : [],
    note: 'MDX/MDD and Wudao data files are not included. Their source configuration is preserved only.'
  };
}

async function createRecoverySnapshot(label) {
  const stored = await chrome.storage.local.get([...BACKUP_STORAGE_KEYS, RECOVERY_SNAPSHOT_KEY]);
  const snapshot = {
    id: crypto.randomUUID(),
    label: String(label || 'Before a DictFloat change'),
    createdAt: Date.now(),
    data: buildBackupPayload(stored)
  };
  recoverySnapshots = [snapshot, ...normalizeRecoverySnapshots(stored[RECOVERY_SNAPSHOT_KEY])].slice(0, RECOVERY_SNAPSHOT_LIMIT);
  await chrome.storage.local.set({ [RECOVERY_SNAPSHOT_KEY]: recoverySnapshots });
  renderRecoverySnapshots();
  return snapshot;
}

async function restoreRecoverySnapshot(snapshot) {
  if (!snapshot?.data) return;
  const approved = await confirmRisk({
    title: 'Restore recovery snapshot?',
    message: 'Current DictFloat settings and editable data will be replaced with this saved state.',
    impact: [
      recoverySnapshotSummary(snapshot),
      'A new recovery snapshot of the current state will be created first.',
      'Linked MDX/MDD and Wudao binary files are not contained in snapshots.'
    ],
    confirmLabel: 'Restore snapshot',
    requireText: 'RESTORE'
  });
  if (!approved) return;
  await createRecoverySnapshot(`Before restoring snapshot: ${snapshot.label}`);
  await applyBackupPayload(snapshot.data);
  status(`Restored snapshot: ${snapshot.label}`);
}

function confirmRisk(options = {}) {
  const dialog = $('safetyDialog');
  const title = $('safetyDialogTitle');
  const message = $('safetyDialogMessage');
  const impact = $('safetyDialogImpact');
  const inputWrap = $('safetyDialogInputWrap');
  const inputLabel = $('safetyDialogInputLabel');
  const input = $('safetyDialogInput');
  const cancel = $('safetyDialogCancel');
  const confirmButton = $('safetyDialogConfirm');
  if (!dialog || !title || !message || !impact || !inputWrap || !input || !cancel || !confirmButton) {
    return Promise.resolve(false);
  }
  const required = String(options.requireText || '');
  title.textContent = options.title || 'Confirm change';
  message.textContent = options.message || 'Please review this change before continuing.';
  impact.textContent = '';
  (Array.isArray(options.impact) ? options.impact : []).filter(Boolean).forEach((item) => {
    const row = document.createElement('li');
    row.textContent = String(item);
    impact.append(row);
  });
  impact.hidden = !impact.children.length;
  input.value = '';
  inputWrap.hidden = !required;
  inputLabel.textContent = required ? `Type ${required} to continue.` : '';
  confirmButton.textContent = options.confirmLabel || 'Continue';
  confirmButton.disabled = !!required;
  if (dialog.open) dialog.close();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.oncancel = null;
      cancel.onclick = null;
      confirmButton.onclick = null;
      input.oninput = null;
      try { if (dialog.open) dialog.close(); } catch (_) {}
      resolve(!!value);
    };
    const sync = () => { confirmButton.disabled = required ? input.value.trim() !== required : false; };
    input.oninput = sync;
    cancel.onclick = () => finish(false);
    confirmButton.onclick = () => {
      if (!confirmButton.disabled) finish(true);
    };
    dialog.oncancel = (event) => { event.preventDefault(); finish(false); };
    dialog.showModal();
    if (required) setTimeout(() => input.focus(), 0);
    else setTimeout(() => confirmButton.focus(), 0);
  });
}

let entryManagerDictionaryId = '';
let entryEditorEntryId = '';
function closeEntryManager(){ const d=$('entryManagerDialog'); if(d?.open)d.close(); entryManagerDictionaryId=''; }
function openEntryManager(dictionary){ entryManagerDictionaryId=dictionary.id; $('entryManagerTitle').textContent=`${dictionary.name} · entries`; $('entryManagerSearch').value=''; renderEntryManager(); $('entryManagerDialog')?.showModal(); }
function renderEntryManager(){ const list=$('entryManagerList'); if(!list||!entryManagerDictionaryId)return; const q=String($('entryManagerSearch')?.value||'').trim().toLocaleLowerCase(); const rows=entries.filter((entry)=>entry.dictionaryId===entryManagerDictionaryId).filter((entry)=>!q||[entry.term,entry.chinese,...(entry.aliases||[])].join(' ').toLocaleLowerCase().includes(q)).sort((a,b)=>String(a.term).localeCompare(String(b.term))); list.textContent=''; if(!rows.length){const e=document.createElement('div');e.className='entry-manager-empty';e.textContent=q?'No matching entries.':'No entries in this glossary yet.';list.append(e);return;} rows.forEach((entry)=>{const row=document.createElement('div');row.className='entry-manager-row';const info=document.createElement('div');info.className='entry-manager-info';const term=document.createElement('strong');term.textContent=entry.term;const sub=document.createElement('span');sub.textContent=[entry.aliases?.[0],entry.chinese].filter(Boolean).join(' · ');info.append(term,sub);row.append(info,makeButton('Edit',()=>openEntryEditor(entry)));list.append(row);}); }
function closeEntryEditor(){ const d=$('entryEditorDialog');if(d?.open)d.close();entryEditorEntryId=''; }
function openEntryEditor(entry){const dictionary=dictionaries.find((item)=>item.id===entryManagerDictionaryId);if(!dictionary)return;entryEditorEntryId=entry?.id||'';$('entryEditorTitle').textContent=entry?`Edit ${entry.term}`:`Add to ${dictionary.name}`;const v=entry||{term:'',aliases:[],chinese:'',definition:'',tags:[],related:[],category:'',source:dictionary.builtIn?'DictFloat Glossary':dictionary.name};const f=$('entryEditorForm');f.elements.term.value=v.term||'';f.elements.aliases.value=(v.aliases||[]).join(', ');f.elements.chinese.value=v.chinese||'';f.elements.definition.value=v.definition||'';f.elements.tags.value=(v.tags||[]).join(', ');f.elements.related.value=(v.related||[]).join(', ');f.elements.category.value=v.category||'';f.elements.source.value=v.source||'';const del=$('entryEditorDelete'); if(del) del.hidden=!entry; $('entryEditorDialog')?.showModal();setTimeout(()=>f.elements.term.focus(),0);}
function splitList(value){return String(value||'').split(',').map((item)=>item.trim()).filter(Boolean);}
async function deleteEntryFromManager(){
  const entry=entries.find((item)=>item.id===entryEditorEntryId); if(!entry)return;
  const approved=await confirmRisk({ title:`Delete “${entry.term}”?`, message:'This removes this editable entry from its glossary.', impact:['A small recovery snapshot will be created first.','Linked dictionaries and other entries are not affected.'], confirmLabel:'Delete entry' });
  if(!approved)return; await createRecoverySnapshot(`Before deleting entry: ${entry.term}`); entries=entries.filter((item)=>item.id!==entry.id); await chrome.storage.local.set({dictFloatEntries:entries}); closeEntryEditor(); renderEntryManager(); renderDictionaryLibrary(); status('Entry deleted. A recovery snapshot is available below.');
}
async function saveEntryEditor(event){event.preventDefault();const f=$('entryEditorForm');const dictionary=dictionaries.find((item)=>item.id===entryManagerDictionaryId);if(!dictionary)return;const term=String(f.elements.term.value||'').trim();const definition=String(f.elements.definition.value||'').trim();if(!term||!definition){status('Term and definition are required.',true);return;}const base=entries.find((entry)=>entry.id===entryEditorEntryId)||{};const next=normalizeEntry({...base,id:base.id||crypto.randomUUID(),dictionaryId:dictionary.id,term,aliases:splitList(f.elements.aliases.value),chinese:String(f.elements.chinese.value||'').trim(),definition,tags:splitList(f.elements.tags.value),related:splitList(f.elements.related.value),category:String(f.elements.category.value||'').trim(),source:String(f.elements.source.value||'').trim(),updatedAt:Date.now()});if(entryEditorEntryId)entries=entries.map((entry)=>entry.id===entryEditorEntryId?next:entry);else entries.unshift(next);await chrome.storage.local.set({dictFloatEntries:entries});closeEntryEditor();renderEntryManager();renderDictionaryLibrary();status(entryEditorEntryId?'Entry updated.':'Entry added.');}

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
  const configured = !!input.configured || !!input.installed || !!input.needsReconnect;
  const installed = !!input.installed;
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

async function importWudaoFiles(event) {
  const files = [...(event.target.files || [])];
  event.target.value = '';
  if (!files.length) return;
  try {
    if (wudaoSource?.installed) {
      const approved = await confirmRisk({
        title: 'Replace Wudao offline pack?',
        message: 'The selected four files will replace the Wudao data currently stored by DictFloat.',
        impact: [
          `Current local pack: ${formatSize(wudaoSource.totalSize)}.`,
          'The old pack will be removed from extension storage after the new files are validated.',
          'A recovery snapshot will keep the prior source configuration, not the old binary data.'
        ],
        confirmLabel: 'Replace pack',
        requireText: 'REPLACE'
      });
      if (!approved) return;
      await createRecoverySnapshot('Before replacing Wudao offline pack');
    }
    await installWudaoSelected(classifyWudaoFiles(files));
  } catch (error) {
    status(`Wudao import failed: ${error.message || error}`, true);
  }
}

async function installWudaoSelected(selected, options = {}) {
  const missing = Object.entries(selected).filter(([, file]) => !file).map(([key]) => wudaoLabel(key));
  if (missing.length) throw new Error(`Choose all four Wudao files together. Missing: ${missing.join(', ')}.`);
  const [enCount, zhCount] = await Promise.all([validateWudaoIndex(selected.enIndex), validateWudaoIndex(selected.zhIndex)]);
  const totalSize = Object.values(selected).reduce((sum, file) => sum + file.size, 0);
  const pack = { id: WUDAO_ACTIVE_PACK_ID, importedAt: Date.now(), files: selected };
  await writeWudaoPack(pack);
  await chrome.runtime.sendMessage({ type: 'DICTFLOAT_WUDAO_RESET' }).catch(() => undefined);
  wudaoSource = normalizeWudaoSource({
    installed: true,
    configured: true,
    needsReconnect: false,
    name: options.name || wudaoSource?.name || 'Wudao · Offline',
    enabled: options.enabled !== false,
    importedAt: pack.importedAt,
    totalSize,
    recordCounts: { en: enCount, zh: zhCount },
    fileNames: Object.fromEntries(Object.entries(selected).map(([key, file]) => [key, file.name]))
  });
  sourceOrder = normalizeSourceOrder(sourceOrder);
  await chrome.storage.local.set({ dictFloatWudaoSource: wudaoSource, dictFloatSourceOrder: sourceOrder });
  renderDictionaryLibrary();
  if (!options.quiet) status(`Wudao offline pack imported: ${enCount.toLocaleString()} English and ${zhCount.toLocaleString()} Chinese index entries.`);
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
  if (!(wudaoSource?.installed || wudaoSource?.configured)) return;
  const size = formatSize(wudaoSource.totalSize);
  const approved = await confirmRisk({
    title: `Remove “${wudaoSource.name || 'Wudao · Offline'}”?`,
    message: 'This removes DictFloat’s stored Wudao offline data pack.',
    impact: [
      `${size} of local extension storage will be released.`,
      'The four original files outside Chrome will not be deleted.',
      'A recovery snapshot will preserve the source configuration, but not the binary data pack.'
    ],
    confirmLabel: 'Remove Wudao pack'
  });
  if (!approved) return;
  try {
    await createRecoverySnapshot('Before removing Wudao offline pack');
    await deleteWudaoPack();
    await chrome.runtime.sendMessage({ type: 'DICTFLOAT_WUDAO_RESET' }).catch(() => undefined);
    wudaoSource = normalizeWudaoSource(null);
    await chrome.storage.local.set({ dictFloatWudaoSource: wudaoSource });
    sourceOrder = normalizeSourceOrder(sourceOrder);
    await chrome.storage.local.set({ dictFloatSourceOrder: sourceOrder });
    renderWudaoSource();
    renderSourceOrder();
    status('Wudao offline pack removed. Its source configuration is available in the latest recovery snapshot.');
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
