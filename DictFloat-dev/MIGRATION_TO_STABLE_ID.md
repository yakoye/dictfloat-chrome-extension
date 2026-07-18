# Move to DictFloat v0.5.3 / Stable development ID

`manifest.json` now contains a fixed public key so future unpacked builds retain the same Chrome extension ID. This first key-bearing build receives a new development ID relative to v0.4.x.

1. In the current v0.4.x Settings, click **Export backup**.
2. Load v0.5.3 from one permanent folder, such as `D:\work\chrome-extensions\DictFloat-dev`.
3. Open v0.5.3 Settings and click **Import backup**.
4. For each MDX source, use **Locate** only when the saved browser handle is unavailable. If it says **Access confirmation required**, click **Restore access**; do not use Find missing.
5. Future updates: overwrite this fixed folder and click **Reload** in `chrome://extensions`; do not remove the extension.

Backups carry editable glossaries, history, settings, source order and MDX/Wudao configuration. They never copy MDX/MDD or Wudao binary files.
