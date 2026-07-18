/*
 * DictFloat linked-MDX storage.
 *
 * Only light metadata, File System Access handles, and key/record block maps
 * are stored here. Raw MDX/MDD files stay in the user-selected folder.
 */
(() => {
  'use strict';

  const DB_NAME = 'dictfloat-mdict-linked-v1';
  const DB_VERSION = 1;
  const SOURCES = 'sources';

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SOURCES)) db.createObjectStore(SOURCES, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open DictFloat local dictionary metadata.'));
    });
  }

  function requestResult(request, message) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error(message));
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('Dictionary metadata transaction aborted.'));
      tx.onerror = () => reject(tx.error || new Error('Dictionary metadata transaction failed.'));
    });
  }

  async function putLinkedSource(source) {
    const db = await openDb();
    try {
      const tx = db.transaction(SOURCES, 'readwrite');
      tx.objectStore(SOURCES).put(source);
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async function getLinkedSource(id) {
    const db = await openDb();
    try {
      const tx = db.transaction(SOURCES, 'readonly');
      const row = await requestResult(tx.objectStore(SOURCES).get(String(id)), 'Unable to read linked dictionary metadata.');
      await txDone(tx);
      return row;
    } finally {
      db.close();
    }
  }

  async function deleteLinkedSource(id) {
    const db = await openDb();
    try {
      const tx = db.transaction(SOURCES, 'readwrite');
      tx.objectStore(SOURCES).delete(String(id));
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async function clearLinkedSources() {
    const db = await openDb();
    try {
      const tx = db.transaction(SOURCES, 'readwrite');
      tx.objectStore(SOURCES).clear();
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async function hasReadPermission(handle) {
    if (!handle?.queryPermission) return true;
    try {
      return (await handle.queryPermission({ mode: 'read' })) === 'granted';
    } catch (_) {
      return false;
    }
  }

  // A source summary in chrome.storage.local is intentionally light-weight.
  // The actual FileSystemFileHandle plus block index live here in IndexedDB.
  // Keep this health probe explicit so the UI never labels a stale summary as
  // “Linked” when its real on-demand file connection no longer exists.
  async function inspectLinkedSource(id) {
    const source = await getLinkedSource(id);
    if (!source || !source.mdxHandle || !source.index) {
      return { ready:false, source:source || null, state:'missing', code:'missing-link', message:'Saved MDX link is missing.' };
    }
    try {
      const permission = source.mdxHandle.queryPermission ? await source.mdxHandle.queryPermission({ mode:'read' }) : 'granted';
      if (permission !== 'granted') return { ready:false, source, state:'access', code:'permission', message:'Access confirmation required.' };
      const file = await source.mdxHandle.getFile();
      if (!file) return { ready:false, source, state:'missing', code:'file-unavailable', message:'Linked MDX file is unavailable.' };
      if (Number(source.index?.fileSize || 0) && Number(source.index.fileSize) !== Number(file.size)) {
        return { ready:false, source, state:'changed', code:'file-changed', message:'Linked MDX file changed. Rebuild its lightweight index.' };
      }
      return { ready:true, source, state:'ready', code:'ready', message:'' };
    } catch (error) {
      const missing=/notfound/i.test(String(error?.name || ''));
      return { ready:false, source, state:missing?'missing':'access', code:missing?'file-unavailable':'permission', message:missing?'Linked MDX file is unavailable.':'Access confirmation required.', detail:String(error?.message || error || '') };
    }
  }

  // Must run from a user gesture: restores access for the remembered source.
  async function requestLinkedSourceAccess(id) {
    const source = await getLinkedSource(id);
    if (!source || !source.mdxHandle || !source.index) return { ready:false, source:source || null, state:'missing', code:'missing-link', message:'Saved MDX link is missing.' };
    try {
      const permission = source.mdxHandle.requestPermission ? await source.mdxHandle.requestPermission({ mode:'read' }) : 'granted';
      if (permission !== 'granted') return { ready:false, source, state:'access', code:'permission', message:'Access was not granted.' };
      return await inspectLinkedSource(id);
    } catch (error) {
      return { ready:false, source, state:'access', code:'permission', message:'Access confirmation required.', detail:String(error?.message || error || '') };
    }
  }

  globalThis.DictFloatMdictDB = {
    putLinkedSource,
    getLinkedSource,
    deleteLinkedSource,
    clearLinkedSources,
    hasReadPermission,
    inspectLinkedSource,
    requestLinkedSourceAccess
  };
})();
