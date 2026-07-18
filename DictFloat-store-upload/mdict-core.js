/*
 * DictFloat lightweight linked-MDX reader.
 *
 * The import stage reads only the MDX header, Key Block Info, and Record Block
 * Info. It intentionally does NOT expand all definitions or copy an MDX/MDD
 * into IndexedDB. Lookups read one Key Block plus the needed Record Block(s)
 * directly from the linked user file and cache only a few recent blocks.
 */
(() => {
  'use strict';

  const STRIP_KEY_RE = /[()., '/\\@_-]/g;
  const sourceCaches = new Map();

  function toNumber(bytes, offset, width) {
    let value = 0;
    for (let i = 0; i < width; i += 1) {
      value = value * 256 + bytes[offset + i];
      if (!Number.isSafeInteger(value)) throw new Error('This MDX uses offsets larger than browser-safe numbers.');
    }
    return value;
  }

  function readSlice(bytes, offset, length) {
    if (offset < 0 || length < 0 || offset + length > bytes.length) throw new Error('The MDX file is truncated or has an invalid block size.');
    return bytes.subarray(offset, offset + length);
  }

  async function readRange(file, offset, length) {
    if (!file || offset < 0 || length < 0 || offset + length > file.size) throw new Error('The linked MDX file changed or is truncated. Reconnect the dictionary folder.');
    return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
  }

  function parseXmlAttributes(text) {
    const root = text.match(/<(?:Dictionary|Library_Data)\b[^>]*>/i)?.[0] || text;
    const attrs = {};
    root.replace(/([A-Za-z][\w.-]*)\s*=\s*(["'])(.*?)\2/g, (_all, key, _quote, value) => {
      attrs[key] = decodeEntities(value);
      return _all;
    });
    return attrs;
  }

  function decodeEntities(value) {
    return String(value || '')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function decoderFor(encoding) {
    const raw = String(encoding || '').trim().toLowerCase();
    if (raw === 'utf-16' || raw === 'utf16' || raw === 'utf-16le') return { encoding: 'utf-16le', utf16: true };
    if (raw === 'gbk' || raw === 'gb2312' || raw === 'gb18030') return { encoding: 'gb18030', utf16: false };
    if (raw === 'big5') return { encoding: 'big5', utf16: false };
    return { encoding: 'utf-8', utf16: false };
  }

  function makeDecoder(index) { return new TextDecoder(index.encoding || 'utf-8'); }

  async function inflateDeflate(bytes) {
    if (!('DecompressionStream' in globalThis)) throw new Error('This Chrome build does not provide DecompressionStream for MDX zlib blocks.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function compressionCode(block) {
    if (block.length < 8) throw new Error('An MDX compression block is too short.');
    return `${block[0].toString(16).padStart(2, '0')}${block[1].toString(16).padStart(2, '0')}${block[2].toString(16).padStart(2, '0')}${block[3].toString(16).padStart(2, '0')}`;
  }

  async function decodeBlock(block, expectedSize, encrypted = false) {
    const code = compressionCode(block);
    let payload = block.subarray(8);
    if (encrypted) payload = mdxDecrypt(block).subarray(8);
    let output;
    if (code === '00000000') output = payload;
    else if (code === '02000000') output = await inflateDeflate(payload);
    else if (code === '01000000') throw new Error('This MDX uses LZO compression. DictFloat currently supports uncompressed and zlib MDX blocks.');
    else throw new Error(`Unsupported MDX compression marker ${code}.`);
    if (expectedSize && Math.abs(output.length - expectedSize) > 16) throw new Error('The MDX block decompressed to an unexpected size.');
    return output;
  }

  function normalize(value, lookup = {}) {
    let text = String(value || '').trim();
    if (lookup.stripKey !== false) text = text.replace(STRIP_KEY_RE, '');
    if (lookup.caseSensitive !== true) text = text.toLowerCase();
    return text.replace(/\s+/g, ' ');
  }

  async function parseHeaderFromFile(file) {
    const lengthBytes = await readRange(file, 0, 4);
    const headerLength = toNumber(lengthBytes, 0, 4);
    if (!headerLength || headerLength > 1024 * 1024 || headerLength + 8 > file.size) throw new Error('Unable to read the MDict header.');
    const headerBytes = await readRange(file, 4, headerLength);
    const alternatingNulls = headerBytes.length > 3 && headerBytes[1] === 0 && headerBytes[3] === 0;
    const text = (alternatingNulls ? new TextDecoder('utf-16le') : new TextDecoder('utf-8')).decode(headerBytes)
      .replace(/^\uFEFF/, '').replace(/\0/g, '').trim();
    if (!/<(?:Dictionary|Library_Data)\b/i.test(text)) throw new Error('This file does not contain a recognizable MDict header.');
    const attributes = parseXmlAttributes(text);
    const version = Number.parseFloat(attributes.GeneratedByEngineVersion || attributes.EngineVersion || attributes.Version || '1.0');
    if (!Number.isFinite(version) || version < 1) throw new Error('Unsupported MDict engine version.');
    const encryptionText = String(attributes.Encrypted || '0').trim();
    let encrypted = 0;
    if (encryptionText && encryptionText !== 'No') encrypted = encryptionText === 'Yes' ? 1 : Number.parseInt(encryptionText, 10) || 0;
    const decoderInfo = decoderFor(attributes.Encoding || 'UTF-8');
    return {
      nextOffset: 4 + headerLength + 4,
      attributes,
      version,
      encrypted,
      numberWidth: version >= 2 ? 8 : 4,
      encoding: decoderInfo.encoding,
      utf16: decoderInfo.utf16,
      lookup: {
        caseSensitive: String(attributes.KeyCaseSensitive || 'No').toLowerCase() === 'yes',
        stripKey: String(attributes.StripKey || 'Yes').toLowerCase() !== 'no'
      }
    };
  }

  function publicHeader(meta) {
    const a = meta.attributes;
    return {
      title: a.Title || a.title || '',
      description: a.Description || a.description || '',
      engineVersion: String(a.GeneratedByEngineVersion || a.EngineVersion || meta.version),
      encoding: String(a.Encoding || 'UTF-8'),
      encrypted: String(a.Encrypted || '0'),
      keyCaseSensitive: String(a.KeyCaseSensitive || ''),
      stripKey: String(a.StripKey || '')
    };
  }

  function throwIfCancelled(signal) {
    if (signal?.aborted) throw new DOMException('Indexing cancelled.', 'AbortError');
  }

  async function buildLightIndex(file, options = {}) {
    const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    const signal = options.signal;
    if (!file || !/\.mdx$/i.test(file.name || '')) throw new Error('Choose a .mdx file.');
    throwIfCancelled(signal);
    progress({ stage: 'header', fraction: 0.03, message: 'Reading dictionary header…' });
    const meta = await parseHeaderFromFile(file);
    if (meta.encrypted & 1) throw new Error('This MDX encrypts record blocks and needs a registration key; DictFloat cannot read it without that key.');

    throwIfCancelled(signal);
    progress({ stage: 'key-header', fraction: 0.10, message: 'Reading key block map…' });
    let offset = meta.nextOffset;
    const width = meta.numberWidth;
    const keyHeaderLength = meta.version >= 2 ? 40 : 16;
    const keyHeader = await readRange(file, offset, keyHeaderLength);
    offset += keyHeaderLength + (meta.version >= 2 ? 4 : 0);
    let p = 0;
    const keyBlocksNum = toNumber(keyHeader, p, width); p += width;
    const entriesNum = toNumber(keyHeader, p, width); p += width;
    let keyBlockInfoDecompSize = 0;
    if (meta.version >= 2) { keyBlockInfoDecompSize = toNumber(keyHeader, p, width); p += width; }
    const keyBlockInfoCompSize = toNumber(keyHeader, p, width); p += width;
    const keyBlocksTotalSize = toNumber(keyHeader, p, width);
    if (!keyBlocksNum || !entriesNum) throw new Error('This MDX contains no usable dictionary entries.');

    const keyInfoCompressed = await readRange(file, offset, keyBlockInfoCompSize);
    offset += keyBlockInfoCompSize;
    let keyInfo = keyInfoCompressed;
    if (meta.version >= 2) {
      if (compressionCode(keyInfoCompressed) !== '02000000') throw new Error('The MDX key index is not a supported zlib block.');
      const decrypted = meta.encrypted === 2 ? mdxDecrypt(keyInfoCompressed) : keyInfoCompressed;
      keyInfo = await inflateDeflate(decrypted.subarray(8));
      if (keyBlockInfoDecompSize && Math.abs(keyInfo.length - keyBlockInfoDecompSize) > 16) throw new Error('The MDX key index could not be decoded correctly.');
    }

    throwIfCancelled(signal);
    progress({ stage: 'key-info', fraction: 0.42, message: 'Building lightweight key map…' });
    const decoder = makeDecoder(meta);
    const keyBlocks = [];
    let infoPos = 0;
    let keyCompAcc = 0;
    let keyDecompAcc = 0;
    let entryAcc = 0;
    const termLengthWidth = meta.version >= 2 ? 2 : 1;
    const terminatorBytes = meta.version >= 2 ? 1 : 0;
    for (let blockIndex = 0; blockIndex < keyBlocksNum; blockIndex += 1) {
      throwIfCancelled(signal);
      const count = toNumber(keyInfo, infoPos, width); infoPos += width;
      const firstLen = toNumber(keyInfo, infoPos, termLengthWidth); infoPos += termLengthWidth;
      const firstBytesLength = (firstLen + terminatorBytes) * (meta.utf16 ? 2 : 1);
      const firstKey = decoder.decode(readSlice(keyInfo, infoPos, Math.max(0, firstBytesLength - (meta.utf16 ? 2 : 1)))).trim();
      infoPos += firstBytesLength;
      const lastLen = toNumber(keyInfo, infoPos, termLengthWidth); infoPos += termLengthWidth;
      const lastBytesLength = (lastLen + terminatorBytes) * (meta.utf16 ? 2 : 1);
      const lastKey = decoder.decode(readSlice(keyInfo, infoPos, Math.max(0, lastBytesLength - (meta.utf16 ? 2 : 1)))).trim();
      infoPos += lastBytesLength;
      const compSize = toNumber(keyInfo, infoPos, width); infoPos += width;
      const decompSize = toNumber(keyInfo, infoPos, width); infoPos += width;
      keyBlocks.push({
        count, firstKey, lastKey,
        firstNorm: normalize(firstKey, meta.lookup), lastNorm: normalize(lastKey, meta.lookup),
        compSize, decompSize, compAcc: keyCompAcc, decompAcc: keyDecompAcc, entryAcc
      });
      keyCompAcc += compSize;
      keyDecompAcc += decompSize;
      entryAcc += count;
    }
    if (entryAcc !== entriesNum || keyCompAcc !== keyBlocksTotalSize) throw new Error('The MDX key map is inconsistent.');
    const keyBlockStart = offset;
    offset += keyBlocksTotalSize;

    throwIfCancelled(signal);
    progress({ stage: 'record-info', fraction: 0.72, message: 'Reading definition block map…' });
    const recordHeaderLength = meta.version >= 2 ? 32 : 16;
    const recordHeader = await readRange(file, offset, recordHeaderLength);
    offset += recordHeaderLength;
    p = 0;
    const recordBlocksNum = toNumber(recordHeader, p, width); p += width;
    const recordEntriesNum = toNumber(recordHeader, p, width); p += width;
    const recordInfoSize = toNumber(recordHeader, p, width); p += width;
    const recordBlocksTotalSize = toNumber(recordHeader, p, width);
    if (recordEntriesNum !== entriesNum) throw new Error('The MDX record count does not match its key count.');
    const recordInfo = await readRange(file, offset, recordInfoSize);
    offset += recordInfoSize;
    const recordBlockStart = offset;
    const recordBlocks = [];
    let recordCompAcc = 0;
    let recordDecompAcc = 0;
    p = 0;
    for (let index = 0; index < recordBlocksNum; index += 1) {
      const compSize = toNumber(recordInfo, p, width); p += width;
      const decompSize = toNumber(recordInfo, p, width); p += width;
      recordBlocks.push({ compSize, decompSize, compAcc: recordCompAcc, decompAcc: recordDecompAcc });
      recordCompAcc += compSize;
      recordDecompAcc += decompSize;
    }
    if (recordCompAcc !== recordBlocksTotalSize) throw new Error('The MDX record map is inconsistent.');
    progress({ stage: 'done', fraction: 1, message: `Ready · ${entriesNum.toLocaleString()} headwords · no definitions copied.` });
    return {
      format: 'dictfloat-linked-mdx-v1',
      header: publicHeader(meta),
      lookup: meta.lookup,
      encoding: meta.encoding,
      utf16: meta.utf16,
      version: meta.version,
      numberWidth: width,
      keyBlockStart,
      recordBlockStart,
      recordDataSize: recordDecompAcc,
      entryCount: entriesNum,
      keyBlocks,
      recordBlocks
    };
  }

  function sourceCache(sourceId) {
    const id = String(sourceId || 'unknown');
    if (!sourceCaches.has(id)) sourceCaches.set(id, { keyBlocks: new Map(), recordBlocks: new Map(), css: null });
    return sourceCaches.get(id);
  }

  function lruGet(map, key) {
    if (!map.has(key)) return null;
    const value = map.get(key);
    map.delete(key); map.set(key, value);
    return value;
  }

  function lruSet(map, key, value, max) {
    map.set(key, value);
    while (map.size > max) map.delete(map.keys().next().value);
    return value;
  }

  function findKeyBlock(index, normalized) {
    const blocks = index.keyBlocks || [];
    let low = 0; let high = blocks.length - 1; let answer = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (String(blocks[middle].lastNorm || '') >= normalized) { answer = middle; high = middle - 1; }
      else low = middle + 1;
    }
    return answer;
  }

  async function decodeKeyBlock(file, sourceId, index, blockIndex) {
    const cache = sourceCache(sourceId);
    const cached = lruGet(cache.keyBlocks, blockIndex);
    if (cached) return cached;
    const info = index.keyBlocks[blockIndex];
    if (!info) return [];
    const block = await readRange(file, index.keyBlockStart + info.compAcc, info.compSize);
    const decoded = await decodeBlock(block, info.decompSize, false);
    const width = index.numberWidth;
    const decoder = makeDecoder(index);
    const zeroWidth = index.utf16 ? 2 : 1;
    const entries = [];
    let pos = 0;
    while (pos < decoded.length) {
      if (pos + width > decoded.length) throw new Error('A Key Block ended before a record offset.');
      const recordStart = toNumber(decoded, pos, width); pos += width;
      const textStart = pos;
      if (index.utf16) {
        while (pos + 1 < decoded.length && !(decoded[pos] === 0 && decoded[pos + 1] === 0)) pos += 2;
      } else {
        while (pos < decoded.length && decoded[pos] !== 0) pos += 1;
      }
      if (pos >= decoded.length || (index.utf16 && pos + 1 >= decoded.length)) throw new Error('A Key Block ended before a key terminator.');
      const term = decoder.decode(decoded.subarray(textStart, pos)).trim();
      pos += zeroWidth;
      if (term) entries.push({ term, norm: normalize(term, index.lookup), recordStart });
    }
    return lruSet(cache.keyBlocks, blockIndex, entries, 10);
  }

  function findRecordBlock(index, offset) {
    const blocks = index.recordBlocks || [];
    let low = 0; let high = blocks.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const block = blocks[middle];
      if (offset < block.decompAcc) high = middle - 1;
      else if (offset >= block.decompAcc + block.decompSize) low = middle + 1;
      else return middle;
    }
    return -1;
  }

  function normalizedRawKey(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  }

  async function nextKeyAfter(file, sourceId, index, blockIndex, itemIndex) {
    const same = await decodeKeyBlock(file, sourceId, index, blockIndex);
    if (itemIndex + 1 < same.length) return same[itemIndex + 1];
    if (blockIndex + 1 < index.keyBlocks.length) {
      const following = await decodeKeyBlock(file, sourceId, index, blockIndex + 1);
      return following[0] || null;
    }
    return null;
  }

  async function decodeRecordBlock(file, sourceId, index, blockIndex) {
    const cache = sourceCache(sourceId);
    const cached = lruGet(cache.recordBlocks, blockIndex);
    if (cached) return cached;
    const info = index.recordBlocks[blockIndex];
    if (!info) throw new Error('The MDX record map is incomplete.');
    const block = await readRange(file, index.recordBlockStart + info.compAcc, info.compSize);
    const decoded = await decodeBlock(block, info.decompSize, false);
    return lruSet(cache.recordBlocks, blockIndex, decoded, 5);
  }

  function concatBytes(parts) {
    const total = parts.reduce((sum, value) => sum + value.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
  }

  async function readDefinitionRange(file, sourceId, index, start, end) {
    if (end < start || start < 0 || end > index.recordDataSize) throw new Error('The MDX definition range is invalid.');
    const first = findRecordBlock(index, start);
    const last = findRecordBlock(index, Math.max(start, end - 1));
    if (first < 0 || last < 0) throw new Error('The MDX record block for this word could not be found.');
    const parts = [];
    for (let blockIndex = first; blockIndex <= last; blockIndex += 1) {
      const info = index.recordBlocks[blockIndex];
      const decoded = await decodeRecordBlock(file, sourceId, index, blockIndex);
      const localStart = Math.max(0, start - info.decompAcc);
      const localEnd = Math.min(decoded.length, end - info.decompAcc);
      if (localEnd > localStart) parts.push(decoded.subarray(localStart, localEnd));
    }
    return makeDecoder(index).decode(concatBytes(parts)).replace(/\0+$/g, '').trim();
  }

  function phoneticFromDefinition(definition) {
    const plain = String(definition || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
    const slash = plain.match(/\/[\w\sˈˌəɜɪʊɔɑæʌθðŋʃʒː.\-]+\//u);
    if (slash) return slash[0];
    const bracket = plain.match(/\[[^\]\n]{1,60}\]/);
    return bracket ? bracket[0] : '';
  }

  async function readSafeStylesheet(sourceRecord) {
    const cache = sourceCache(sourceRecord.id);
    if (cache.css !== null) return cache.css;
    const handles = Array.isArray(sourceRecord.cssHandles) ? sourceRecord.cssHandles : [];
    const pieces = [];
    for (const item of handles.slice(0, 4)) {
      try {
        const allowed = !item.handle?.queryPermission || (await item.handle.queryPermission({ mode: 'read' })) === 'granted';
        if (!allowed) continue;
        const file = await item.handle.getFile();
        if (file.size > 512 * 1024) continue;
        pieces.push(await file.text());
      } catch (_) { /* a missing optional CSS file should not block text lookup */ }
    }
    cache.css = pieces.join('\n');
    return cache.css;
  }

  function redirectTargetFromDefinition(definition) {
    // MDict redirect entries are stored as a tiny value such as
    // "@@@LINK=homogeneous". They are not a user-facing definition.
    const plain = decodeEntities(String(definition || ''))
      .replace(/\uFEFF|\0/g, '')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim();
    const match = plain.match(/^@{1,4}LINK\s*=\s*([^\r\n]+?)\s*$/i);
    return match ? String(match[1] || '').trim() : '';
  }

  async function matchingKeysForNormalized(file, sourceId, index, normalized) {
    const candidate = findKeyBlock(index, normalized);
    if (candidate < 0) return [];
    const compatibleBlocks = [];
    for (let blockIndex = 0; blockIndex < index.keyBlocks.length; blockIndex += 1) {
      const block = index.keyBlocks[blockIndex];
      if (String(block.firstNorm || '') <= normalized && String(block.lastNorm || '') >= normalized) compatibleBlocks.push(blockIndex);
    }
    if (!compatibleBlocks.length) compatibleBlocks.push(candidate);

    const matches = [];
    for (const blockIndex of compatibleBlocks) {
      const keys = await decodeKeyBlock(file, sourceId, index, blockIndex);
      keys.forEach((item, itemIndex) => {
        if (item.norm === normalized) matches.push({ ...item, blockIndex, itemIndex });
      });
    }
    return matches;
  }

  function rankKeyForQuery(item, rawQuery) {
    const exactRaw = normalizedRawKey(rawQuery);
    const raw = normalizedRawKey(item.term);
    if (raw === exactRaw) return 0;
    if (raw.replace(/[._-]+$/g, '') === exactRaw) return 1;
    if (raw.replace(/^[._-]+/g, '') === exactRaw) return 2;
    return 10 + Math.abs(raw.length - exactRaw.length);
  }

  function rankedUniqueMatches(matches, rawQuery, limit = 4) {
    if (!matches.length) return [];
    const bestRank = Math.min(...matches.map((item) => rankKeyForQuery(item, rawQuery)));
    return matches
      .filter((item) => rankKeyForQuery(item, rawQuery) === bestRank)
      .sort((left, right) => left.recordStart - right.recordStart)
      .filter((item, position, all) => position === 0 || item.recordStart !== all[position - 1].recordStart)
      .slice(0, limit);
  }

  async function definitionForMatch(file, sourceId, index, found) {
    const next = await nextKeyAfter(file, sourceId, index, found.blockIndex, found.itemIndex);
    const end = next ? next.recordStart : index.recordDataSize;
    return readDefinitionRange(file, sourceId, index, found.recordStart, end);
  }

  async function resolveRedirectDefinition(file, sourceId, index, found, definition, visited = new Set(), depth = 0) {
    const target = redirectTargetFromDefinition(definition);
    if (!target) return definition;
    if (depth >= 3) return `Linked entry: ${target}`;

    const visitKey = `${found.recordStart}|${normalizedRawKey(target)}`;
    if (visited.has(visitKey)) return `Linked entry: ${target}`;
    const nextVisited = new Set(visited);
    nextVisited.add(visitKey);

    const normalizedTarget = normalize(target, index.lookup || {});
    const candidates = rankedUniqueMatches(
      await matchingKeysForNormalized(file, sourceId, index, normalizedTarget),
      target,
      12
    );
    if (!candidates.length) return `Linked entry: ${target}`;

    // Prefer another record for the same headword. Dictionaries often keep a
    // redirect and the actual entry under the identical raw spelling.
    const ordered = [...candidates.filter((item) => item.recordStart !== found.recordStart), ...candidates.filter((item) => item.recordStart === found.recordStart)];
    for (const candidate of ordered) {
      const candidateDefinition = await definitionForMatch(file, sourceId, index, candidate);
      const resolved = await resolveRedirectDefinition(file, sourceId, index, candidate, candidateDefinition, nextVisited, depth + 1);
      if (resolved && !/^Linked entry:/i.test(resolved)) return resolved;
    }
    return `Linked entry: ${target}`;
  }

  async function lookupLinkedSource(sourceRecord, rawQuery) {
    const query = String(rawQuery || '').trim();
    if (!query) return null;
    if (!sourceRecord?.mdxHandle || !sourceRecord?.index) throw new Error('Dictionary metadata is missing. Reconnect the dictionary folder.');
    const granted = !sourceRecord.mdxHandle.queryPermission || (await sourceRecord.mdxHandle.queryPermission({ mode: 'read' })) === 'granted';
    if (!granted) throw new Error('Folder permission is not available. Open Settings and reconnect this dictionary folder.');
    const file = await sourceRecord.mdxHandle.getFile();
    const index = sourceRecord.index;
    if (Number(index.fileSize || 0) && Math.abs(Number(index.fileSize) - file.size) > 0) throw new Error('The linked MDX file changed. Rebuild its lightweight index.');
    const normalized = normalize(query, index.lookup || {});
    const selected = rankedUniqueMatches(
      await matchingKeysForNormalized(file, sourceRecord.id, index, normalized),
      query
    );
    if (!selected.length) return null;

    const definitions = [];
    for (const found of selected) {
      const rawDefinition = await definitionForMatch(file, sourceRecord.id, index, found);
      const definition = await resolveRedirectDefinition(file, sourceRecord.id, index, found, rawDefinition);
      definitions.push({ term: found.term || query, definition });
    }
    const firstDefinition = definitions[0]?.definition || '';
    return {
      term: selected[0]?.term || query,
      phonetic: phoneticFromDefinition(firstDefinition),
      definitions,
      sourceId: sourceRecord.id,
      stylesheet: sourceRecord.cssMode === 'safe-original' ? await readSafeStylesheet(sourceRecord) : ''
    };
  }

  function clearCache(sourceId) {
    if (sourceId) sourceCaches.delete(String(sourceId));
    else sourceCaches.clear();
  }

  // --- RIPEMD-128 / MDict key-info decryption (MIT-derived helper) ---
  // Kept intentionally close to the upstream MIT implementation. MDict uses
  // this only for Encrypted=2 key-index metadata, not for normal record text.
  function ripemdAsUint32Array(arr) {
    return new Uint32Array(arr);
  }

  function ripemdConcat(a, b) {
    if (!a && !b) throw new Error('RIPEMD-128 needs valid byte input.');
    if (!b || b.length === 0) return a;
    if (!a || a.length === 0) return b;
    const c = new a.constructor(a.length + b.length);
    c.set(a);
    c.set(b, a.length);
    return c;
  }

  function ripemdRotl(x, n) {
    return (x >>> (32 - n)) | (x << n);
  }

  const RIPEMD_S = [
    [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
    [7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12],
    [11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5],
    [11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12],
    [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6],
    [9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11],
    [9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5],
    [15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8]
  ].map(ripemdAsUint32Array);

  const RIPEMD_X = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    [7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8],
    [3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12],
    [1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2],
    [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12],
    [6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2],
    [15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13],
    [8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14]
  ].map(ripemdAsUint32Array);

  const RIPEMD_K = ripemdAsUint32Array([
    0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc,
    0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x00000000
  ]);

  const RIPEMD_F = [
    (x, y, z) => x ^ y ^ z,
    (x, y, z) => (x & y) | (~x & z),
    (x, y, z) => (x | ~y) ^ z,
    (x, y, z) => (x & z) | (y & ~z)
  ];

  function ripemd128(data) {
    let aa; let bb; let cc; let dd;
    let aaa; let bbb; let ccc; let ddd;
    let i; let l; let r; let rr; let t; let tmp; let x;
    const hash = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]);
    let bytes = data.length;
    const padding = new Uint8Array((bytes % 64 < 56 ? 56 : 120) - (bytes % 64));
    padding[0] = 0x80;
    data = new Uint32Array(ripemdConcat(data, padding).buffer);
    bytes <<= 3;
    x = ripemdConcat(data, [bytes, (bytes >> 31) >> 1]);
    for (i = 0, t = 0, l = x.length; i < l; i += 16, t = 0) {
      aa = aaa = hash[0];
      bb = bbb = hash[1];
      cc = ccc = hash[2];
      dd = ddd = hash[3];
      for (; t < 64; ++t) {
        r = ~~(t / 16);
        aa = ripemdRotl(aa + RIPEMD_F[r](bb, cc, dd) + x[i + RIPEMD_X[r][t % 16]] + RIPEMD_K[r], RIPEMD_S[r][t % 16]);
        tmp = dd; dd = cc; cc = bb; bb = aa; aa = tmp;
      }
      for (; t < 128; ++t) {
        r = ~~(t / 16);
        rr = ~~((63 - (t % 64)) / 16);
        aaa = ripemdRotl(aaa + RIPEMD_F[rr](bbb, ccc, ddd) + x[i + RIPEMD_X[r][t % 16]] + RIPEMD_K[r], RIPEMD_S[r][t % 16]);
        tmp = ddd; ddd = ccc; ccc = bbb; bbb = aaa; aaa = tmp;
      }
      ddd = hash[1] + cc + ddd;
      hash[1] = hash[2] + dd + aaa;
      hash[2] = hash[3] + aa + bbb;
      hash[3] = hash[0] + bb + ccc;
      hash[0] = ddd;
    }
    return new Uint8Array(hash.buffer);
  }

  function mdxDecrypt(block) {
    const seed = new Uint8Array(8);
    seed.set(block.subarray(4, 8), 0); seed.set([0x95, 0x36, 0x00, 0x00], 4);
    const key = ripemd128(seed);
    const out = new Uint8Array(block.length);
    out.set(block.subarray(0, 8));
    let previous = 0x36;
    for (let i = 8; i < block.length; i += 1) {
      const source = block[i];
      out[i] = ((((source >>> 4) | (source << 4)) & 0xff) ^ previous ^ ((i - 8) & 0xff) ^ key[(i - 8) % key.length]) & 0xff;
      previous = source;
    }
    return out;
  }



  globalThis.DictFloatMdictCore = { buildLightIndex, lookupLinkedSource, clearCache, normalize };
})();
