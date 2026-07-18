# DictFloat v0.4.0 — Unified Dictionary Library

DictFloat is a compact Chrome floating dictionary for local glossaries, linked MDX text lookup, optional Wudao offline data, online fallback, and webpage selection lookup.

## v0.4.0 / 本版重点

### Unified Dictionary Library / 统一词典库

Settings now manages every lookup source in one **Dictionary Library** instead of splitting Wudao, MDX/MDD, local glossaries, and lookup order into separate sections.

Each source is one row with:

- enable / disable checkbox
- order number and `↑ / ↓` controls
- source type
- file/package identity
- source-specific actions

Examples:

```text
🔗 TLD.mdx · 181 MB · 1 CSS · 7 MDD
📦 en.ind · en.z · zh.ind · zh.z · 83 MB
🔗 pcie-notes.csv · 126 editable entries
```

### Per-source controls / 每个来源独立管理

- **Linked MDX/MDD**: Rename display name, Rebuild / Reconnect, Original / Compact CSS mode, Export source config, Remove.
- **Wudao Offline**: Rename, Replace the four local data files, Export source config, Remove.
- **Editable glossary / imported JSON/CSV**: Rename, Export its own JSON, Remove.
- **Online fallback**: enable / disable and reorder in the same library.

`Export` for linked MDX and Wudao exports **source settings only**. It never copies or redistributes dictionary files. Glossary export contains the actual editable entries.

### Add source menu / 统一添加入口

Use **+ Add source** to:

1. Create empty glossary
2. Import JSON / CSV glossary
3. Import Wudao offline pack
4. Connect MDX / MDD dictionary folder

## Linked MDX performance architecture

Large MDX files are linked rather than fully copied into IndexedDB:

- DictFloat stores a lightweight MDX block map and file handles.
- Raw `.mdx`, `.mdd`, `.css`, images, audio, fonts, and scripts remain in your local dictionary folder.
- Index building runs in a Worker.
- Lookup reads only the required Key Block and Record Block, then uses a small in-memory cache for nearby repeated queries.
- MDD media and dictionary JavaScript remain disabled in this performance-first phase.

## Original CSS / 原始 CSS

When a connected folder contains a `.css` file, **Style: Original** is available:

- It is scoped to the dictionary result area.
- Standard typography, colors, indentation, numbered senses, examples, and tables are retained where safe.
- Dictionary JavaScript, external imports, fonts, external URLs, fixed-position rules, and layout escape rules are blocked.
- Switch to **Style: Compact** where an original theme is too dense for the small floating panel.

## Recommended order / 推荐顺序

For the current word dictionaries:

1. The Little Dict
2. 牛津高阶双解9
3. 朗文当代第六版（英汉）
4. Wudao · Offline
5. Online

Move your own PCIe / GPU glossary above the general dictionaries if you want technical terms to appear first.

## Current MDX limits / 当前限制

Supported in this beta:

- MDX v1/v2
- uncompressed and zlib/deflate Key/Record Blocks
- common `Encrypted=2` Key Block Info
- linked folder lookup, source ordering, enable/disable, and scoped CSS modes

Not yet supported:

- LZO-compressed MDX
- MDX record encryption requiring a registration key
- MDD image/audio rendering
- TTF/OTF font loading
- dictionary JavaScript execution
- full visual reproduction of every MDict theme
