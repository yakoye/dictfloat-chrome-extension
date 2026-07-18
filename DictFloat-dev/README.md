# DictFloat v0.4.5 — Backup & dictionary-root recovery

## What changed / 本版重点

- Adds **Backup & recovery** in Settings.
  - **Export backup** saves DictFloat settings, editable glossaries, history, window position, source order, folded sections, and dictionary connection metadata.
  - **Import backup** restores those settings safely.
  - Raw MDX/MDD files and the Wudao data pack are deliberately **not** copied into the backup.
- Adds **Reconnect dictionary root**.
  - Pick your parent dictionary folder once, for example `C:\Users\color\Downloads\0-常用`.
  - DictFloat scans subfolders, relinks saved MDX dictionaries by filename/size, rebuilds lightweight indices, and can re-import Wudao files when all four files are found.
- A backup restored on a new Chrome profile keeps MDX / Wudao in the Dictionary Library as **Reconnect required**, rather than silently losing the source record.
- Normal extension development no longer requires removing DictFloat. Keep one fixed unpacked folder and use Chrome's **Reload** button.

## Recommended development workflow / 推荐调试方式

1. Create one permanent development folder, for example:

   ```text
   D:\work\chrome-extensions\DictFloat-dev
   ```

2. Load this folder once in `chrome://extensions` with **Developer mode → Load unpacked**.
3. Before major changes, open DictFloat Settings → **Backup & recovery → Export backup**.
4. For every new build:
   - Replace the files inside the same `DictFloat-dev` folder.
   - Open `chrome://extensions` and click DictFloat's **Reload** icon.
   - Refresh the test webpage.
5. Do **not** remove the extension during normal development. Removing it clears Chrome extension storage.

## Restoring dictionaries after a mistaken removal / 误删扩展后的恢复

1. Load DictFloat again from the same fixed folder.
2. Open Settings → **Backup & recovery → Import backup**.
3. Click **Reconnect dictionary root**.
4. Select the common parent directory that contains your dictionaries.
5. Wait for DictFloat to relink MDX sources and restore Wudao if the four files are present.

MDX source configuration, names, enable state, CSS mode, and lookup order are restored. Original `.mdx`, `.mdd`, `.css`, and Wudao files continue to stay in your own folders.


## v0.4.5

- Selection lookup now listens from window capture, selectionchange, keyboard, touch, open ShadowRoot, and eligible child-frame contexts for reader-mode compatibility.
- Content scripts now run in all frames, including about:blank reader frames when Chrome permits injection.
