const MENU_ID = 'dictfloat-lookup-selection';

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Look up “%s” in DictFloat',
      contexts: ['selection']
    });
  });

  const existing = await chrome.storage.local.get(['dictFloatEntries', 'dictFloatSettings']);
  if (!Array.isArray(existing.dictFloatEntries)) {
    await chrome.storage.local.set({ dictFloatEntries: seedEntries() });
  }
  if (!existing.dictFloatSettings) {
    await chrome.storage.local.set({
      dictFloatSettings: {
        selectionMode: 'bubble',
        compactMode: true,
        fontSize: 12,
        panelWidth: 380,
        showPhonetic: true,
        theme: 'light'
      }
    });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'DICTFLOAT_TOGGLE' });
  } catch (_) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'DICTFLOAT_TOGGLE' });
    } catch (error) {
      console.warn('DictFloat cannot run on this page.', error);
    }
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id || !info.selectionText) return;
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'DICTFLOAT_LOOKUP',
      query: info.selectionText.trim(),
      open: true
    });
  } catch (error) {
    console.warn('DictFloat lookup failed.', error);
  }
});

function seedEntries() {
  return [
    {
      id: crypto.randomUUID(),
      term: 'PCIe',
      aliases: ['Peripheral Component Interconnect Express', 'PCI Express'],
      chinese: '高速外设互连标准',
      definition: 'A high-speed serial computer expansion bus standard used to connect devices such as GPUs, SSDs, NICs, and accelerators.',
      tags: ['PCIe', 'Interconnect'],
      category: 'PCIe',
      source: 'DictFloat starter glossary',
      updatedAt: Date.now()
    },
    {
      id: crypto.randomUUID(),
      term: 'RCB',
      aliases: ['Read Completion Boundary'],
      chinese: '读完成边界',
      definition: 'A PCIe boundary rule that constrains where Read Completion packets may be split.',
      tags: ['PCIe', 'Completion', 'TLP'],
      category: 'PCIe',
      source: 'DictFloat starter glossary',
      updatedAt: Date.now()
    },
    {
      id: crypto.randomUUID(),
      term: 'MPS',
      aliases: ['Max Payload Size', 'Maximum Payload Size'],
      chinese: '最大有效载荷大小',
      definition: 'The maximum payload size that a PCIe Transaction Layer Packet may carry.',
      tags: ['PCIe', 'TLP'],
      category: 'PCIe',
      source: 'DictFloat starter glossary',
      updatedAt: Date.now()
    },
    {
      id: crypto.randomUUID(),
      term: 'MRRS',
      aliases: ['Max Read Request Size', 'Maximum Read Request Size'],
      chinese: '最大读请求大小',
      definition: 'The maximum amount of data requested by a PCIe Memory Read Request.',
      tags: ['PCIe', 'TLP'],
      category: 'PCIe',
      source: 'DictFloat starter glossary',
      updatedAt: Date.now()
    },
    {
      id: crypto.randomUUID(),
      term: 'Completion Timeout',
      aliases: ['Cpl Timeout', 'Completion Time-out'],
      chinese: '完成超时',
      definition: 'The maximum allowed time to receive a Completion for a non-posted PCIe request before timeout handling is triggered.',
      tags: ['PCIe', 'Completion', 'Error Handling'],
      category: 'PCIe',
      source: 'DictFloat starter glossary',
      updatedAt: Date.now()
    }
  ];
}
