(() => {
  if (window.__DICTFLOAT_WEB_BRIDGE_LOADED__) return;
  window.__DICTFLOAT_WEB_BRIDGE_LOADED__ = true;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'DICTFLOAT_WEB_BRIDGE_TRANSLATE') return;
    translate(String(message.provider || ''), String(message.text || ''))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });

  async function translate(provider, rawText) {
    const text = normalizeInput(rawText);
    if (!text) throw new Error('No text was provided.');
    await waitForPageReady();
    await waitForAppSettled();
    if (provider === 'doubao') return translateWithDoubao(text);
    if (provider === 'youdao') return translateWithGenericPage(text, provider);
    if (provider === 'baidu') return translateWithGenericPage(text, provider);
    throw new Error(`Unsupported bridge provider: ${provider}`);
  }

  async function translateWithDoubao(text) {
    const before = snapshotTextBlocks('doubao');
    const prompt = `请将下面英文翻译成自然、准确的中文。只输出中文译文，不要解释，不要闲聊。\n\n${text}`;
    const input = await waitForEditable('doubao', 15000);
    if (!input) throw new Error('Doubao input box was not found. Please open Doubao and make sure you are logged in.');
    setEditableText(input, prompt);
    await sleep(180);
    const sent = clickSend(['[data-testid="chat_input_send_button"]', '[aria-label*="发送"]', '[aria-label*="Send"]']) || pressEnter(input);
    if (!sent) throw new Error('Doubao send button was not found.');
    const answer = await waitForNewAnswer(before, { provider: 'doubao', minLength: 2, timeout: 70000, sourceText: prompt });
    return { translation: cleanupAnswer(answer), sourceText: text };
  }

  async function translateWithGenericPage(text, provider) {
    const before = snapshotTextBlocks(provider);
    const input = await waitForEditable(provider, 18000);
    if (!input) throw new Error(`${providerLabel(provider)} input box was not found. Open the translation page once and try again.`);
    clearEditable(input);
    await sleep(60);
    setEditableText(input, text);
    await sleep(300);
    clickTranslateButton(provider);
    const result = await waitForNewAnswer(before, { provider, minLength: 1, timeout: 45000, sourceText: text });
    return { translation: cleanupAnswer(result), sourceText: text };
  }

  function providerLabel(provider) {
    return ({ youdao: 'Youdao Web Bridge', baidu: 'Baidu Web Bridge', doubao: 'Doubao Web Bridge' })[provider] || provider;
  }

  function normalizeInput(value) { return String(value || '').replace(/\r?\n+/g, ' ').replace(/\s{2,}/g, ' ').trim(); }
  function waitForPageReady() {
    if (document.readyState === 'complete' || document.readyState === 'interactive') return Promise.resolve();
    return new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }
  async function waitForAppSettled() { await sleep(400); }

  async function waitForEditable(provider, timeout = 15000) {
    const started = Date.now();
    let found = null;
    while (Date.now() - started < timeout) {
      found = provider === 'doubao' ? findDoubaoInput() : findProviderEditable(provider);
      if (found) return found;
      await sleep(350);
    }
    return found;
  }

  function findProviderEditable(provider) {
    const selectors = provider === 'youdao' ? [
      'textarea#js_fanyi_input', '#js_fanyi_input', '#inputOriginal',
      'textarea[placeholder*="请输入"]', 'textarea[placeholder*="粘贴"]', 'textarea[placeholder*="输入"]',
      '[contenteditable="true"][data-placeholder*="输入"]', '[contenteditable="true"][placeholder*="输入"]',
      '[role="textbox"]', 'textarea', 'input[type="text"]', '[contenteditable="true"]'
    ] : [
      '#baidu_translate_input', 'textarea#baidu_translate_input', '#translate-input',
      'textarea[placeholder*="请输入"]', 'textarea[placeholder*="粘贴"]', 'textarea[placeholder*="输入"]',
      '[contenteditable="true"][data-placeholder*="输入"]', '[contenteditable="true"][placeholder*="输入"]',
      '[role="textbox"]', 'textarea', 'input[type="text"]', '[contenteditable="true"]'
    ];
    return firstVisible(selectors) || largestEditable();
  }

  function findDoubaoInput() {
    return firstVisible([
      '[data-testid="chat_input_input"]', '[contenteditable="true"][data-testid*="chat"]',
      'textarea[placeholder*="发"]', 'textarea[placeholder*="问"]', 'textarea', '[role="textbox"]', '[contenteditable="true"]'
    ]) || largestEditable();
  }

  function largestEditable() {
    return Array.from(document.querySelectorAll('textarea,input[type="text"],[contenteditable="true"],[role="textbox"]'))
      .filter(isUsableEditable).sort((a, b) => areaOf(b) - areaOf(a))[0] || null;
  }
  function firstVisible(selectors) {
    for (const selector of selectors) {
      const node = Array.from(document.querySelectorAll(selector)).find(isUsableEditable);
      if (node) return node;
    }
    return null;
  }
  function areaOf(node) { const rect = node.getBoundingClientRect(); return Math.max(0, rect.width) * Math.max(0, rect.height); }
  function isUsableEditable(node) {
    if (!isVisible(node)) return false;
    if (node.disabled || node.readOnly) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 40 && rect.height > 14;
  }
  function isVisible(node) {
    if (!node || !node.isConnected) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function clearEditable(node) { setEditableText(node, ''); }
  function setEditableText(node, text) {
    node.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    node.focus?.();
    if (node instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter ? setter.call(node, text) : (node.value = text);
    } else if (node instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter ? setter.call(node, text) : (node.value = text);
    } else {
      const selection = window.getSelection?.();
      try { const range = document.createRange(); range.selectNodeContents(node); selection?.removeAllRanges?.(); selection?.addRange?.(range); } catch (_) {}
      node.textContent = text;
    }
    dispatchTextEvents(node, text);
  }
  function dispatchTextEvents(node, text) {
    [
      new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }),
      new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }),
      new Event('change', { bubbles: true }),
      new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true })
    ].forEach((event) => { try { node.dispatchEvent(event); } catch (_) {} });
  }

  function clickSend(extraSelectors = []) {
    for (const selector of extraSelectors) {
      const button = Array.from(document.querySelectorAll(selector)).find(isClickable);
      if (button) { button.click(); return true; }
    }
    return clickButtonByText(/^(发送|Send)$/i) || clickButtonByText(/发送|Send/i);
  }
  function clickTranslateButton(provider) {
    const providerSelectors = provider === 'youdao'
      ? ['#js_fanyi_translate_btn', '.transBtn', '[class*="transBtn"]', '[class*="translateBtn"]']
      : ['.translate-button', '[class*="translate-button"]', '[class*="trans-btn"]', '[class*="translateBtn"]'];
    for (const selector of providerSelectors) {
      const button = Array.from(document.querySelectorAll(selector)).find(isClickable);
      if (button) { button.click(); return true; }
    }
    return clickButtonByText(/^(翻译|Translate)$/i) || clickButtonByText(/翻译|Translate|开始|转写|提交/i) || false;
  }
  function clickButtonByText(pattern) {
    const buttons = Array.from(document.querySelectorAll('button,[role="button"],a,input[type="button"],input[type="submit"]'));
    const target = buttons.find((node) => isClickable(node) && pattern.test(buttonText(node)));
    if (target) { target.click(); return true; }
    return false;
  }
  function buttonText(node) { return String(node.innerText || node.textContent || node.value || node.getAttribute('aria-label') || node.title || '').replace(/\s+/g, ' ').trim(); }
  function isClickable(node) { return isVisible(node) && !node.disabled && node.getAttribute('aria-disabled') !== 'true'; }
  function pressEnter(node) {
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    node.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    return true;
  }

  function snapshotTextBlocks(provider) { return new Set(collectResultCandidates(provider).map((item) => item.text)); }
  async function waitForNewAnswer(before, { provider = '', minLength = 1, timeout = 30000, sourceText = '' } = {}) {
    const start = Date.now();
    let last = '';
    while (Date.now() - start < timeout) {
      const candidates = collectResultCandidates(provider).map((item) => item.text)
        .filter((text) => text.length >= minLength)
        .filter((text) => !before.has(text))
        .filter((text) => !isMostlySame(text, sourceText))
        .filter((text) => !/^(翻译|Translate|发送|Send|复制|Copy|登录|Login|原文|译文)$/i.test(text));
      if (candidates.length) {
        last = candidates.sort((a, b) => scoreCandidate(b, provider) - scoreCandidate(a, provider))[0];
        await sleep(provider === 'doubao' ? 1200 : 700);
        const after = collectResultCandidates(provider).map((item) => item.text)
          .filter((text) => !before.has(text))
          .filter((text) => !isMostlySame(text, sourceText))
          .sort((a, b) => scoreCandidate(b, provider) - scoreCandidate(a, provider))[0] || last;
        return cleanupAnswer(scoreCandidate(after, provider) >= scoreCandidate(last, provider) ? after : last);
      }
      await sleep(450);
    }
    throw new Error(last ? 'Translation did not finish in time.' : 'No translated result appeared.');
  }

  function collectResultCandidates(provider = '') {
    const selectors = provider === 'doubao' ? [
      '[data-testid="message_text_content"]', '[data-testid="union_message"]', '[class*="message"] [class*="content"]', '[role="article"]'
    ] : provider === 'youdao' ? [
      '#js_fanyi_output_resultOutput', '#js_fanyi_output_result', '.transTarget', '[class*="transTarget"]', '[class*="target"]', '[class*="Target"]', '[class*="output"]', '[class*="Output"]', '[class*="result"]', '[class*="Result"]'
    ] : provider === 'baidu' ? [
      '#translate-output', '#transTarget', '[class*="trans-right"]', '[class*="target"]', '[class*="Target"]', '[class*="output"]', '[class*="Output"]', '[class*="result"]', '[class*="Result"]'
    ] : [
      '[data-testid="message_text_content"]', '[data-testid="union_message"]', '[class*="result"]', '[class*="Result"]', '[class*="target"]', '[class*="Target"]', '[class*="output"]', '[class*="Output"]', '[class*="translation"]', '[class*="Translation"]', '[class*="trans"]', '[class*="Trans"]', '[role="article"]', 'main p', 'section p'
    ];
    const seen = new Set();
    const out = [];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => {
        if (!isVisible(node) || isEditableLike(node)) return;
        const text = normalizeBlockText(node.innerText || node.textContent || '');
        if (!text || text.length > 8000 || seen.has(text)) return;
        seen.add(text);
        out.push({ node, text });
      });
    }
    return out;
  }
  function isEditableLike(node) { return !!node.closest?.('textarea,input,[contenteditable="true"],[role="textbox"]'); }
  function normalizeBlockText(value) { return String(value || '').replace(/\u200b/g, '').replace(/\r/g, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); }
  function cleanupAnswer(value) { return normalizeBlockText(value).replace(/^AI\s*[:：]?\s*/i, '').trim(); }
  function scoreCandidate(text, provider = '') {
    let score = Math.min(1000, text.length);
    if (/[\u3400-\u9fff]/.test(text)) score += 260;
    if (provider === 'doubao' && /【|\n- |\n\d+\./.test(text)) score += 60;
    if (/翻译|译文|中文|简明|详细/.test(text)) score -= 80;
    return score;
  }
  function isMostlySame(a, b) {
    const left = String(a || '').replace(/\s+/g, '').toLowerCase();
    const right = String(b || '').replace(/\s+/g, '').toLowerCase();
    if (!left || !right) return false;
    return left === right || (left.includes(right) && right.length > 20) || (right.includes(left) && left.length > 20);
  }
})();
