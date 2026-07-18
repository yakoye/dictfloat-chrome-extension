# DictFloat v0.3.2

Compact Chrome floating dictionary for local technical glossaries, selection lookup, and online fallback.

## v0.3.2 highlights / 本版重点

- **Shadow-DOM floating window**: the panel no longer inherits button, input, dark-mode, or focus styles from GitHub, documentation sites, or other host pages.
- **Reworked minimize**: the title-bar minus button now collapses to a compact DictFloat mini bar with a restore control, instead of a detached oversized lookup button.
- **Related terms**: local entries can store and click through related terms such as `MPS`, `MRRS`, `RCB`, and `Completion Timeout`.
- **History management**: the History tab now has a Clear action.
- **Reliable entry workflow**: every local entry can be opened from results or History, edited, saved, or deleted; starter entries remain local data and may be corrected directly.
- **Single-window guard**: stale roots left by a prior extension reload are removed before DictFloat opens, so one page keeps one DictFloat window.
- **Structured result cards**: each local result now shows Term, Aliases, Chinese, and Dictionary in a stable order.
- **MDX / MDD beta intake**: Settings can select local `.mdx` and optional matching `.mdd` files, parse the MDX XML header, identify engine / encoding metadata, pair matching MDD filenames, manage source enable state, and export/import source metadata with your backup.
- **MDX / MDD limitation in v0.3.2**: this build deliberately stops at local source registration and header validation. It does **not** yet decode compressed/encrypted key blocks or render MDX entries/resources. Dictionary files themselves are not copied into Chrome storage, so multi-GB files are never silently duplicated.

## Existing features / 已有功能

- Toolbar icon opens a compact, draggable 380px window by default.
- Small 12px default UI with light, dark, and Follow Chrome modes.
- Selected-text lookup bubble or optional automatic lookup.
- Local multi-glossary search: aliases, Chinese text, tags, related terms, and definitions are searchable.
- Local entry creation, editing, favorites, copying, history, JSON backup, and CSV import/export.
- Online English definition and Chinese/English translation fallback; saved online results can become local entries.

## Installation / 安装

1. Extract the ZIP to a stable folder.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder.
5. After an update, use the refresh button on the DictFloat extension card, then refresh any test page.

## MDX / MDD beta workflow / MDX / MDD 测试流程

Open **Settings** → **MDX / MDD dictionaries** → **Add MDX / MDD files**. Select one `.mdx` and its matching `.mdd` resources in the same picker. DictFloat reads metadata locally and lists the source. It will remain marked `Header ready · decoder next` until the actual MDX decoder is integrated.
