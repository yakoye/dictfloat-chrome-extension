/* DictFloat local MDX index storage.
 * Imported dictionary text is stored only in this extension's IndexedDB.
 */
(() => {
  'use strict';
  const DB_NAME = 'dictfloat-mdict-v2';
  const DB_VERSION = 1;
  const PACKS = 'packs';
  const ENTRIES = 'entries';

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PACKS)) db.createObjectStore(PACKS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(ENTRIES)) {
          const store = db.createObjectStore(ENTRIES, { keyPath: 'id' });
          store.createIndex('sourceId', 'sourceId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open MDX storage.'));
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('MDX storage transaction failed.'));
      tx.onabort = () => reject(tx.error || new Error('MDX storage transaction was aborted.'));
    });
  }

  function requestResult(request, message) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error(message));
    });
  }

  function normalize(value, options = {}) {
    let text = String(value || '').trim();
    if (options.stripKey !== false) text = text.replace(/[()., '/\\@_-]/g, '');
    if (options.caseSensitive !== true) text = text.toLowerCase();
    return text.replace(/\s+/g, ' ');
  }

  // Keep deletion in its own transaction. Do not await a cursor while a later
  // transaction still expects to write: Chromium can otherwise auto-close it.
  async function clearSourceEntries(db, sourceId) {
    const tx = db.transaction(ENTRIES, 'readwrite');
    const index = tx.objectStore(ENTRIES).index('sourceId');
    const request = index.openCursor(IDBKeyRange.only(sourceId));
    request.onerror = () => tx.abort();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    await txDone(tx);
  }

  async function replacePack(source, entries) {
    const db = await openDb();
    try {
      await clearSourceEntries(db, source.id);
      const grouped = new Map();
      for (const entry of entries || []) {
        const normalized = normalize(entry.term, source.lookup || {});
        if (!normalized) continue;
        const list = grouped.get(normalized) || [];
        list.push({ term: String(entry.term || ''), definition: String(entry.definition || '') });
        grouped.set(normalized, list);
      }

      const tx = db.transaction([PACKS, ENTRIES], 'readwrite');
      const packStore = tx.objectStore(PACKS);
      const entryStore = tx.objectStore(ENTRIES);
      for (const [normalized, values] of grouped) {
        entryStore.put({ id: `${source.id}\u0000${normalized}`, sourceId: source.id, normalized, values });
      }
      packStore.put({
        id: source.id,
        recordCount: grouped.size,
        importedAt: Date.now(),
        parser: source.parser || 'dictfloat-mdx-text-v1'
      });
      await txDone(tx);
      return grouped.size;
    } finally {
      db.close();
    }
  }

  async function getEntry(source, query) {
    const normalized = normalize(query, source?.lookup || {});
    if (!normalized) return null;
    const db = await openDb();
    try {
      const tx = db.transaction(ENTRIES, 'readonly');
      const row = await requestResult(tx.objectStore(ENTRIES).get(`${source.id}\u0000${normalized}`), 'Unable to read the MDX entry.');
      await txDone(tx);
      return row;
    } finally {
      db.close();
    }
  }

  async function removePack(sourceId) {
    const db = await openDb();
    try {
      await clearSourceEntries(db, sourceId);
      const tx = db.transaction(PACKS, 'readwrite');
      tx.objectStore(PACKS).delete(sourceId);
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async function hasPack(sourceId) {
    const db = await openDb();
    try {
      const tx = db.transaction(PACKS, 'readonly');
      const row = await requestResult(tx.objectStore(PACKS).get(sourceId), 'Unable to read MDX pack metadata.');
      await txDone(tx);
      return row;
    } finally {
      db.close();
    }
  }

  globalThis.DictFloatMdictDB = { normalize, replacePack, getEntry, removePack, hasPack };
})();
