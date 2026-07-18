# DictFloat development update workflow

## One fixed extension folder / 固定一个开发目录

Use one permanent directory for Chrome's unpacked extension, for example:

```text
D:\work\chrome-extensions\DictFloat-dev
```

Load it once from `chrome://extensions`.

## Normal update / 日常更新

1. Extract a new DictFloat release to a temporary folder.
2. Copy its contents into `D:\work\chrome-extensions\DictFloat-dev` and replace files.
3. Open `chrome://extensions`.
4. Click the DictFloat **Reload** icon.
5. Refresh the test webpage.

Do not click **Remove** unless you intentionally want to uninstall the extension and erase its local Chrome data.

## Safe data workflow / 数据安全

- Before any high-impact Settings change, DictFloat creates one of five rolling local recovery snapshots.
- Keep an exported backup before major development work; snapshots are deliberately small and do not contain MDX/MDD or Wudao binary files.
- In Settings, use **Find missing** only when a previously connected dictionary is marked missing. It relinks only existing missing sources; it never imports additional dictionaries merely because they live under the selected parent directory.

## If an extension removal happened / 如果误删扩展

1. Load DictFloat again from the same fixed folder.
2. Import a previously exported backup.
3. Dictionary Library will show missing linked sources.
4. Click **Find missing** and choose the common dictionary directory only when needed.
5. DictFloat matches only the dictionaries already recorded in your backup. Other folders are ignored.

## After clicking Reload / 点击 Reload 后

Reloading an unpacked extension invalidates the content script already running in open tabs. DictFloat v0.4.8 suppresses the expected stale-script exception and asks you to refresh the page. For a clean test cycle:

1. Click **Reload** in `chrome://extensions`.
2. Refresh the current test tab once (`Ctrl + R` is enough).
3. Continue testing.

Clicking the DictFloat toolbar icon also checks the content-script version and reinjects the current script when required, but a normal page refresh remains the cleanest way to finish a development reload.


## Selection bubble behavior

The selection lookup control is intentionally created only after mouse/touch selection ends. It anchors above the selection’s upper-right edge, so it cannot sit in the normal left-to-right drag path.


## v0.5.5 stable development ID

This first key-bearing development build has a new ID relative to previous unpacked versions. Export a backup from the old build, load this source folder at a fixed path, then import the backup. Future builds using this key retain the same ID.
