# DictFloat development update workflow

## v0.4.6: linked MDX health

MDX metadata in Settings and the actual local `FileSystemFileHandle` are stored separately. After any extension removal, ID change, profile reset, or lost file permission, use **Reconnect dictionary root** once. The library will now show this condition explicitly instead of leaving stale sources marked ready.

# DictFloat Development Update Guide / DictFloat 开发更新指南

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

## Safe recovery / 安全恢复

Before large debugging changes, export a backup from:

```text
DictFloat Settings → Backup & recovery → Export backup
```

The backup contains settings and editable data. It does not redistribute your MDX/MDD or Wudao files. After restore, use **Reconnect dictionary root** and choose your common dictionary directory.
