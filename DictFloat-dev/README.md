# DictFloat v0.3.4

Compact Chrome floating dictionary for local technical glossaries, selection lookup, online fallback, and optional offline Wudao data.

## v0.3.4 highlights / 本版重点

- **Single-window rewrite / 单窗口重构**: all entry points now reuse one document-owned DictFloat root. Lookup, detail, History, Add, Edit, Return, minimize, and restore only switch the content inside that one panel.
- **Stale-script guard / 旧脚本防护**: each injected runtime receives a document-level ownership token. After an extension refresh or reinjection, earlier listeners become inactive and cannot create another floating window.
- **Return restores the prior page / Return 恢复原页面**: Return restores the originating result list or History view inside the same panel, including its previous search query and scroll position.

- **Optional Wudao offline pack**: DictFloat now understands the Wudao-dict four-file layout: `en.ind`, `en.z`, `zh.ind`, and `zh.z`.
- **Real local lookup**: after a user imports those four files, English–Chinese and Chinese–English entries are queried locally. The extension reads the index offsets, opens only the needed compressed record, decompresses it in the extension worker, and renders the definition in the floating panel.
- **No bundled Wudao data**: the data pack is deliberately not copied into this ZIP. It must be selected from a local copy the user is permitted to use. Imported files are held only in DictFloat's IndexedDB and can be removed from Settings at any time.
- **Local-data control**: Settings shows pack status, entry counts, stored size, a per-pack enable switch, and a remove action.
- **Save Wudao results**: an offline Wudao result can be copied or saved into any writable DictFloat glossary, then edited like any other local term.

## Existing features / 已有功能

- Toolbar icon opens one compact, draggable floating window by default.
- Small 12px default UI with light, dark, and Follow Chrome modes.
- Selected-text lookup bubble or optional automatic lookup.
- Local multi-glossary search: aliases, Chinese text, tags, related terms, and definitions are searchable.
- Local entry creation, editing, favorites, copying, history, JSON backup, and CSV import/export.
- Online English definition and Chinese/English translation fallback; saved online results can become local entries.
- MDX / MDD intake: Settings can read MDX header metadata and record MDX/MDD source pairs.

## Wudao offline workflow / 无道词典离线包流程

1. Obtain a local copy of the Wudao-dict data files through a source you are permitted to use.
2. In the local copy, open `wudao-dict/dict`.
3. Open **DictFloat Settings** → **Wudao offline dictionary**.
4. Click **Import Wudao files** and select all four files together:
   - `en.ind`
   - `en.z`
   - `zh.ind`
   - `zh.z`
5. Once the status says **Ready for offline lookup**, query an English or Chinese word in DictFloat and press Enter.

The import copies the selected data files into the browser profile's DictFloat IndexedDB so lookup continues working after the Settings page closes. Remove local pack deletes that copy only; it does not change the source files you selected.

## MDX / MDD beta workflow / MDX / MDD 测试流程

Open **Settings** → **MDX / MDD dictionaries** → **Add MDX / MDD files**. Select one `.mdx` and its matching `.mdd` resources in the same picker. DictFloat currently reads metadata locally and lists the source. It does **not** yet decode compressed/encrypted key blocks or render MDX entries/resources.

## Installation / 安装

1. Extract the ZIP to a stable folder.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder.
5. After an update, use the refresh button on the DictFloat extension card, then refresh any test page.
