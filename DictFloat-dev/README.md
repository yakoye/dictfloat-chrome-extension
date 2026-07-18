# DictFloat v0.3.8 — Linked MDX Performance Beta

DictFloat is a compact Chrome floating dictionary with local glossaries, Wudao offline lookup, online fallback, selection lookup, and **linked MDX text lookup**.

## What changed in v0.3.8 / 本版重点

- **Large MDX files are no longer fully imported or expanded into IndexedDB.**
  - DictFloat stores only a lightweight map: MDX header, Key Block map, Record Block map, and file handles.
  - The original `.mdx`, `.mdd`, `.css`, fonts, images, and audio stay in your selected local folder.
  - A lookup reads only the Key Block and Record Block needed for the queried word.
- **Indexing runs in a Worker.** Settings stays usable while a large MDX map is built.
- **MDD media is deliberately ignored for now.** Images, audio, fonts, and dictionary JavaScript are not loaded. This is intentional for speed and safety.
- **Original CSS can be used safely.** CSS is scoped to the MDX result body. JavaScript is never executed; imports, fonts, URLs, fixed positioning, high z-index layout escapes, and similar unsafe rules are removed.
- **The first dictionary in Lookup order is queried first.** Later MDX dictionaries continue in the background.
- **No nested result card.** Sources are separated only by a thin divider.

## Connect a dictionary folder / 连接词典文件夹

1. Open **Settings** → **MDX / MDD dictionaries**.
2. Click **Connect dictionary folder**.
3. Select one dictionary folder, e.g. `The little dict`, or select a parent folder such as `0-常用` to connect several dictionaries in one go.
4. Wait for `Linked · on-demand lookup`.
5. Open **Lookup order** and move your preferred dictionaries to the top.

For your preferred dictionaries, start with this order:

1. The Little Dict
2. 牛津高阶双解9
3. 朗文当代第六版（英汉）
4. Wudao · Offline
5. Online

## Original CSS / 原始 CSS

When a dictionary folder contains `.css`, DictFloat defaults to **Style: Original**:

- Keeps ordinary typography, colors, indentation, example/sense hierarchy, tables, and class-based dictionary layout.
- Does not execute `.js`, `jquery`, `fy.js`, switching scripts, or any other dictionary JavaScript.
- Does not load MDD images/audio or TTF/OTF fonts in this release.
- Click **Style: Original** to switch to **Style: Compact** if a particular dictionary style is too dense.

## Performance expectations / 性能预期

- Connecting a folder reads the lightweight block map only; it does not decode all definitions.
- The first lookup may need to read and decompress one Key Block and one or more Record Blocks.
- Repeated nearby queries reuse a small in-memory LRU cache (recent Key Blocks, Record Blocks, and CSS).
- If a source cannot be opened after Chrome restart, click **Reconnect** and select the same folder again. Chrome controls folder permissions.

## Current MDX limits / 当前限制

Supported in this beta:

- MDX v1/v2
- uncompressed and zlib/deflate Key/Record Blocks
- common `Encrypted=2` Key Block Info
- exact lookup with MDX `KeyCaseSensitive` and `StripKey` rules
- linked folder storage, ordering, enable/disable, folding, history

Not yet supported:

- LZO-compressed MDX
- MDX record encryption requiring a registration key
- MDD image/audio rendering
- TTF/OTF font loading
- dictionary JavaScript execution
- full visual reproduction of every MDict theme

## Update note / 更新说明

v0.3.0–v0.3.7 MDX sources used the old full-import path. Remove those old MDX source records in Settings, then reconnect the real dictionary folder in v0.3.8.
