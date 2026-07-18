# DictFloat v0.1.2

A compact floating local dictionary Chrome extension.

## Implemented

- Click the toolbar icon to toggle a compact **webpage floating panel**.
- 12px default text; default width: 380px.
- Select text on a webpage → a pink lookup bubble appears → click to search.
- Optional automatic popup after selection (Settings).
- Right-click selected text → **Look up “…” in DictFloat**.
- Local search across term, aliases, Chinese meaning, tags, and definition.
- Add / edit / favorite entries directly inside the floating panel.
- Local lookup history.
- JSON / CSV import and export from the Settings page.
- Includes starter PCIe entries and a separate `assets/pcie-starter-glossary.json` sample file.
- Drag the floating panel; its position is stored locally.

## Intentionally not included yet

MDX / MDD parsing is **not implemented in v0.1.2**. Supporting MDX reliably requires a dedicated parser/indexer, large-file storage strategy, MDD resources/CSS handling, and a license review for any third-party implementation. The UI has a reserved MDX entry so v0.3 can add it without redesigning the workflow.

## Install on Chrome (Developer mode)

1. Unzip the package.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Choose the extracted `DictFloat` folder.
6. Pin DictFloat from the Chrome extensions menu.

## Notes

- Chrome blocks content scripts on some protected pages, including `chrome://` pages and the Chrome Web Store. DictFloat cannot display its floating window on those pages.
- The extension uses `<all_urls>` so the selection bubble can work across normal websites. All dictionary data is stored in `chrome.storage.local` and is not sent to a server.


## v0.1.2

- Fixed the toolbar icon action: first click now opens DictFloat reliably; click again closes it; clicking while minimized restores it.
- The open panel now refreshes when dictionary entries, history, or settings are changed in Options.

## v0.1.2

- A no-result search now provides a one-click **Add current term** action.
- The Add form pre-fills the last searched term.
