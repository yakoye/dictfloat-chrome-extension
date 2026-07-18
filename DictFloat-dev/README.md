# DictFloat v0.2.0

A compact, page-level floating dictionary for Chrome. DictFloat is designed for reading technical documents: type a term, select text on a page, look it up, and save useful terms into your own local glossary.

## What is included

- Floating, draggable dictionary panel; default width 380px and text size 12px.
- Click the extension icon to open/close DictFloat in the active webpage.
- Select text to show the pink lookup bubble; choose automatic opening in Settings if desired.
- Local-first personal glossary with aliases, Chinese meanings, definitions, tags, categories, favorites, history, CSV/JSON import and export.
- Online lookup is enabled by default: English definitions come from Free Dictionary API and translations come from MyMemory. No API key is required for this v0.2 integration.
- Online results can be copied or saved as a new local glossary entry.
- Light/dark mode follows Chrome by default.

## Install for testing

1. Unzip the package.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `DictFloat` folder.
5. Pin the DictFloat icon and test it on a normal website.

Chrome does not allow extensions to inject the floating UI into internal pages such as `chrome://` pages, the Chrome Web Store, and some built-in PDF viewers.

## Online lookup privacy

Online lookup sends only the query that you explicitly submit with Enter or the selected text that you explicitly look up. It does not upload your local glossary or browsing-page content. You can turn online lookup off in Settings.

## Current scope

MDX / MDD import is reserved for v0.3. This build does not claim to parse `.mdx` or `.mdd` files.
