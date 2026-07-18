/*
 * DictFloat MDX text parser
 *
 * Supports locally imported MDict v1/v2 MDX files using no compression or
 * zlib/deflate blocks. Key-info encryption (Encrypted=2) is handled with
 * RIPEMD-128 as used by MDict. LZO-compressed dictionaries are detected and
 * reported clearly instead of pretending the import succeeded.
 *
 * The RIPEMD-128 helper below is adapted from the MIT-licensed mdict-js
 * implementation by Feng Dihai. See THIRD_PARTY_NOTICES.md.
 */
(() => {
  'use strict';

  const STRIP_KEY_RE = /[()., '/\\@_-]/g;

  function toNumber(bytes, offset, width) {
    let value = 0;
    for (let i = 0; i < width; i += 1) {
      value = value * 256 + bytes[offset + i];
      if (!Number.isSafeInteger(value)) throw new Error('This MDX uses offsets larger than browser-safe numbers.');
    }
    return value;
  }

  function u16(bytes, offset) { return (bytes[offset] << 8) | bytes[offset + 1]; }

  function readSlice(bytes, offset, length) {
    if (offset < 0 || length < 0 || offset + length > bytes.length) throw new Error('The MDX file is truncated or has an invalid block size.');
    return bytes.subarray(offset, offset + length);
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
    if (raw === 'utf-16' || raw === 'utf16' || raw === 'utf-16le') return { decoder: new TextDecoder('utf-16le'), utf16: true };
    if (raw === 'gbk' || raw === 'gb2312' || raw === 'gb18030') return { decoder: new TextDecoder('gb18030'), utf16: false };
    if (raw === 'big5') return { decoder: new TextDecoder('big5'), utf16: false };
    return { decoder: new TextDecoder('utf-8'), utf16: false };
  }

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
    else if (code === '01000000') throw new Error('This MDX uses LZO compression. DictFloat v0.3.7 supports uncompressed and zlib MDX blocks; LZO support is not included yet.');
    else throw new Error(`Unsupported MDX compression marker ${code}.`);
    if (expectedSize && output.length !== expectedSize) {
      // Some files report a slightly different size; retain a hard bound only
      // for clearly corrupt output.
      if (Math.abs(output.length - expectedSize) > 16) throw new Error('The MDX block decompressed to an unexpected size.');
    }
    return output;
  }

  function parseHeader(bytes) {
    if (bytes.length < 12) throw new Error('The MDX file is too small.');
    const headerLength = toNumber(bytes, 0, 4);
    if (!headerLength || headerLength > 1024 * 1024 || headerLength + 8 > bytes.length) throw new Error('Unable to read the MDict header.');
    const headerBytes = readSlice(bytes, 4, headerLength);
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
    const { decoder, utf16 } = decoderFor(attributes.Encoding || 'UTF-8');
    return {
      headerLength,
      nextOffset: 4 + headerLength + 4,
      attributes,
      version,
      encrypted,
      numberWidth: version >= 2 ? 8 : 4,
      decoder,
      utf16,
      lookup: {
        caseSensitive: String(attributes.KeyCaseSensitive || 'No').toLowerCase() === 'yes',
        stripKey: String(attributes.StripKey || 'Yes').toLowerCase() !== 'no'
      }
    };
  }

  async function parseMdx(file, options = {}) {
    const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    if (!file || !/\.mdx$/i.test(file.name || '')) throw new Error('Choose a .mdx file.');
    if (file.size > 750 * 1024 * 1024) throw new Error('This MDX is larger than 750 MB. Text-mode indexing is intentionally limited to avoid exhausting Chrome memory.');
    progress({ stage: 'read', message: `Reading ${file.name}…` });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const meta = parseHeader(bytes);
    const { version, numberWidth: width, decoder, utf16, encrypted } = meta;
    if (encrypted & 1) throw new Error('This MDX encrypts record blocks and needs a registration key; DictFloat cannot import it without that key.');

    progress({ stage: 'key-header', message: 'Reading MDX key header…' });
    let offset = meta.nextOffset;
    const keyHeaderLength = version >= 2 ? 40 : 16;
    const keyHeader = readSlice(bytes, offset, keyHeaderLength);
    offset += keyHeaderLength + (version >= 2 ? 4 : 0);
    let p = 0;
    const keyBlocksNum = toNumber(keyHeader, p, width); p += width;
    const entriesNum = toNumber(keyHeader, p, width); p += width;
    let keyBlockInfoDecompSize = 0;
    if (version >= 2) { keyBlockInfoDecompSize = toNumber(keyHeader, p, width); p += width; }
    const keyBlockInfoCompSize = toNumber(keyHeader, p, width); p += width;
    const keyBlocksTotalSize = toNumber(keyHeader, p, width);

    progress({ stage: 'key-info', message: 'Decoding MDX key index…' });
    const keyInfoCompressed = readSlice(bytes, offset, keyBlockInfoCompSize);
    offset += keyBlockInfoCompSize;
    let keyInfo = keyInfoCompressed;
    if (version >= 2) {
      if (compressionCode(keyInfoCompressed) !== '02000000') throw new Error('The MDX key index is not a supported zlib block.');
      const encryptedInfo = encrypted === 2;
      const toInflate = encryptedInfo ? mdxDecrypt(keyInfoCompressed) : keyInfoCompressed;
      keyInfo = await inflateDeflate(toInflate.subarray(8));
      if (keyBlockInfoDecompSize && Math.abs(keyInfo.length - keyBlockInfoDecompSize) > 16) throw new Error('The MDX key index could not be decoded correctly.');
    }

    const keyInfos = [];
    let infoPos = 0;
    let keyCompAcc = 0;
    let keyDecompAcc = 0;
    let entryAcc = 0;
    const termLengthWidth = version >= 2 ? 2 : 1;
    const terminatorBytes = version >= 2 ? 1 : 0;
    for (let blockIndex = 0; blockIndex < keyBlocksNum; blockIndex += 1) {
      const count = toNumber(keyInfo, infoPos, width); infoPos += width;
      const firstLen = toNumber(keyInfo, infoPos, termLengthWidth); infoPos += termLengthWidth;
      const firstBytesLength = (firstLen + terminatorBytes) * (utf16 ? 2 : 1);
      const firstKey = decoder.decode(readSlice(keyInfo, infoPos, Math.max(0, firstBytesLength - (utf16 ? 2 : 1)))).trim();
      infoPos += firstBytesLength;
      const lastLen = toNumber(keyInfo, infoPos, termLengthWidth); infoPos += termLengthWidth;
      const lastBytesLength = (lastLen + terminatorBytes) * (utf16 ? 2 : 1);
      const lastKey = decoder.decode(readSlice(keyInfo, infoPos, Math.max(0, lastBytesLength - (utf16 ? 2 : 1)))).trim();
      infoPos += lastBytesLength;
      const compSize = toNumber(keyInfo, infoPos, width); infoPos += width;
      const decompSize = toNumber(keyInfo, infoPos, width); infoPos += width;
      keyInfos.push({ count, firstKey, lastKey, compSize, decompSize, compAcc: keyCompAcc, decompAcc: keyDecompAcc, entryAcc });
      keyCompAcc += compSize;
      keyDecompAcc += decompSize;
      entryAcc += count;
    }
    if (entryAcc !== entriesNum) throw new Error('The MDX key index entry count is inconsistent.');
    if (keyCompAcc !== keyBlocksTotalSize) throw new Error('The MDX key index size is inconsistent.');

    const keyBlockStart = offset;
    offset += keyBlocksTotalSize;
    const keys = [];
    for (let blockIndex = 0; blockIndex < keyInfos.length; blockIndex += 1) {
      if (blockIndex % 8 === 0) progress({ stage: 'keys', message: `Indexing words… ${Math.round((blockIndex / Math.max(1, keyInfos.length)) * 100)}%` });
      const info = keyInfos[blockIndex];
      const block = readSlice(bytes, keyBlockStart + info.compAcc, info.compSize);
      const decoded = await decodeBlock(block, info.decompSize, false);
      let pos = 0;
      let count = 0;
      const zeroWidth = utf16 ? 2 : 1;
      while (pos < decoded.length) {
        const recordStart = toNumber(decoded, pos, width);
        pos += width;
        const textStart = pos;
        while (pos < decoded.length) {
          if ((!utf16 && decoded[pos] === 0) || (utf16 && decoded[pos] === 0 && decoded[pos + 1] === 0)) break;
          pos += zeroWidth;
        }
        if (pos >= decoded.length) throw new Error('An MDX key block ended before a key terminator.');
        const term = decoder.decode(decoded.subarray(textStart, pos)).trim();
        pos += zeroWidth;
        if (term) keys.push({ term, recordStart });
        count += 1;
      }
      if (count !== info.count) throw new Error('An MDX key block has an unexpected entry count.');
    }
    if (keys.length !== entriesNum) throw new Error('The MDX key list is incomplete.');

    progress({ stage: 'record-header', message: 'Reading MDX definitions…' });
    const recordHeaderLength = version >= 2 ? 32 : 16;
    const recordHeader = readSlice(bytes, offset, recordHeaderLength);
    offset += recordHeaderLength;
    p = 0;
    const recordBlocksNum = toNumber(recordHeader, p, width); p += width;
    const recordEntriesNum = toNumber(recordHeader, p, width); p += width;
    const recordInfoSize = toNumber(recordHeader, p, width); p += width;
    const recordBlocksTotalSize = toNumber(recordHeader, p, width);
    if (recordEntriesNum !== entriesNum) throw new Error('The MDX record entry count is inconsistent.');
    const recordInfo = readSlice(bytes, offset, recordInfoSize);
    offset += recordInfoSize;
    const recordBlockStart = offset;
    const recordInfos = [];
    let recordCompAcc = 0;
    let recordDecompAcc = 0;
    p = 0;
    for (let index = 0; index < recordBlocksNum; index += 1) {
      const compSize = toNumber(recordInfo, p, width); p += width;
      const decompSize = toNumber(recordInfo, p, width); p += width;
      recordInfos.push({ compSize, decompSize, compAcc: recordCompAcc, decompAcc: recordDecompAcc });
      recordCompAcc += compSize;
      recordDecompAcc += decompSize;
    }
    if (recordCompAcc !== recordBlocksTotalSize) throw new Error('The MDX record block size is inconsistent.');

    // Definitions may cross record-block boundaries. Keep only the current
    // definition open while walking the blocks, then finalize it when the
    // next key begins. This avoids truncating long Oxford / Longman entries
    // while also avoiding one enormous decompressed record buffer.
    const entries = [];
    let keyIndex = 0;
    let active = null;
    const joinBytes = (parts) => {
      const total = parts.reduce((sum, part) => sum + part.length, 0);
      const output = new Uint8Array(total);
      let at = 0;
      parts.forEach((part) => { output.set(part, at); at += part.length; });
      return output;
    };
    const finishActive = () => {
      if (!active) return;
      const definition = decoder.decode(joinBytes(active.parts)).replace(/\0+$/g, '').trim();
      entries.push({ term: active.term, definition });
      active = null;
    };

    for (let blockIndex = 0; blockIndex < recordInfos.length; blockIndex += 1) {
      progress({ stage: 'records', message: `Indexing definitions… ${Math.round((blockIndex / Math.max(1, recordInfos.length)) * 100)}%` });
      const info = recordInfos[blockIndex];
      const block = readSlice(bytes, recordBlockStart + info.compAcc, info.compSize);
      const decoded = await decodeBlock(block, info.decompSize, false);
      const blockStart = info.decompAcc;
      const blockEnd = blockStart + decoded.length;
      let localCursor = 0;

      // A valid key list is monotonic. Skip only impossible duplicate offsets
      // left behind by malformed source data rather than silently creating a
      // second panel or a blank definition.
      while (keyIndex < keys.length && keys[keyIndex].recordStart < blockStart) {
        if (!active) throw new Error('The MDX record offsets are out of order.');
        keyIndex += 1;
      }

      while (keyIndex < keys.length && keys[keyIndex].recordStart < blockEnd) {
        const next = keys[keyIndex];
        const nextLocal = Math.max(0, next.recordStart - blockStart);
        if (active) {
          active.parts.push(decoded.subarray(localCursor, nextLocal));
          finishActive();
        }
        active = { term: next.term, parts: [] };
        localCursor = nextLocal;
        keyIndex += 1;
      }

      if (active) active.parts.push(decoded.subarray(localCursor));
    }
    finishActive();
    if (entries.length !== entriesNum) throw new Error(`The MDX record index is incomplete (${entries.length}/${entriesNum} entries).`);
    progress({ stage: 'done', message: `Indexed ${entries.length.toLocaleString()} entries.` });
    return {
      header: {
        title: meta.attributes.Title || meta.attributes.title || '',
        description: meta.attributes.Description || meta.attributes.description || '',
        engineVersion: String(meta.attributes.GeneratedByEngineVersion || meta.attributes.EngineVersion || version),
        encoding: String(meta.attributes.Encoding || 'UTF-8'),
        encrypted: String(meta.attributes.Encrypted || '0'),
        keyCaseSensitive: String(meta.attributes.KeyCaseSensitive || ''),
        stripKey: String(meta.attributes.StripKey || '')
      },
      lookup: meta.lookup,
      entries
    };
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

  globalThis.DictFloatMdictCore = { parseMdx };
})();
