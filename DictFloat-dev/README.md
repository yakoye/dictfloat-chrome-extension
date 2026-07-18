# DictFloat v0.5.4 — Data safety & recovery snapshots

## What changed / 本版重点

- All destructive Settings actions now use one explicit DictFloat confirmation dialog instead of browser-default prompts.
  - Delete a glossary.
  - Disconnect an MDX source.
  - Remove or replace the Wudao offline pack.
  - Restore a backup.
  - Clear every editable glossary entry.
- High-impact actions automatically create a small local recovery snapshot before changing data.
  - Keeps the newest five snapshots.
  - Snapshots include settings, editable glossaries, history, source order, and dictionary source configuration.
  - MDX/MDD original files and Wudao binary data are never copied or redistributed.
- **Clear all glossary entries** now requires typing `CLEAR`.
- Restoring an external backup or a recovery snapshot requires typing `RESTORE`.
- Deleting a glossary containing 20 or more entries requires typing its glossary name.
- Replacing a Wudao pack requires typing `REPLACE`.
- Clearing query history now asks for confirmation and offers **Undo** for 15 seconds.
- Importing JSON / CSV now keeps an existing same-term entry by default instead of silently overwriting an edited entry.
- The root-folder recovery button is no longer shown in Backup & recovery. When links are actually missing, Dictionary Library shows **Find missing**. It scans only sources that are already missing and never auto-adds other dictionaries found under the selected folder.

## Normal development workflow / 推荐调试方式

1. Keep one permanent unpacked extension directory, for example:

   ```text
   D:\work\chrome-extensions\DictFloat-dev
   ```

2. Load it once in `chrome://extensions`.
3. For every build, replace files inside that same directory and press DictFloat **Reload**.
4. Do not remove the extension during normal development. Removal clears Chrome extension storage.
5. Use **Export backup** before major experiments. Recovery snapshots are an additional local guard, not a replacement for an exported backup.

## Recovery behavior / 恢复说明

- Snapshot restore brings back DictFloat settings and editable data.
- MDX/MDD records are restored as configuration; Chrome may ask you to reconnect the original directory if its file permission/handle is gone.
- Wudao snapshot records its source configuration only. The 83 MB data pack is not duplicated in snapshots.

## v0.4.9 — Selection bubble placement

- The pink selection lookup button now appears above the selected text’s upper-right edge.
- It is hidden throughout an active mouse/touch selection drag, preventing it from blocking rightward selection.

## v0.4.8 — Safe reload recovery / 安全刷新恢复

- Fixes an internal version-handshake mismatch that could cause the background worker to reinject the content script unnecessarily after a reload.
- A stale page script now handles Chrome's `Extension context invalidated` condition gracefully instead of leaving an unhandled promise error in DevTools.
- If an old page script is still present after you press **Reload** in `chrome://extensions`, it shows a short in-panel notice: **“DictFloat was updated. Refresh this page to continue.”**
- Toolbar actions, local storage writes, source-collapse state, drag-position persistence, and asynchronous lookup calls now use guarded extension API calls so the expected reload transition does not surface as an uncaught error.


## v0.5.4

- Stable development extension ID via the manifest public key. The first migration changes the unpacked extension ID once; export a backup from the previous build before loading this release, then import it and locate only any genuinely missing MDX sources.
- Linked MDX sources distinguish **Ready**, **Access confirmation required**, **File missing**, and **File changed**.
- Accent choices: Rose, Green, Blue.
- The built-in DictFloat Glossary is locally editable; Settings includes an entry editor.
- The floating window opens with a clean empty result area.
- Selection bubble uses an anchored callout and tests four screen-safe positions to avoid fixed selection toolbars.
