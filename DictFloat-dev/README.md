# DictFloat v0.4.7 — Data safety & recovery snapshots

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
