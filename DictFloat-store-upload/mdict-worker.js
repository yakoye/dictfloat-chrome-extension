/* Lightweight MDX index worker. It never reads MDD resources or expands all
 * definitions, so Settings stays responsive even for large dictionary files. */
importScripts('mdict-core.js');

let activeController = null;

self.onmessage = async (event) => {
  const message = event.data || {};
  if (message.type === 'cancel') {
    activeController?.abort();
    return;
  }
  if (message.type !== 'build-index') return;
  activeController = new AbortController();
  try {
    const index = await DictFloatMdictCore.buildLightIndex(message.file, {
      signal: activeController.signal,
      onProgress: (progress) => self.postMessage({ type: 'progress', requestId: message.requestId, progress })
    });
    self.postMessage({ type: 'done', requestId: message.requestId, index });
  } catch (error) {
    self.postMessage({
      type: 'error', requestId: message.requestId,
      error: String(error?.message || error),
      name: String(error?.name || 'Error')
    });
  } finally {
    activeController = null;
  }
};
