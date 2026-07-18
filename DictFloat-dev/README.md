# DictFloat v0.4.2 — Reader-mode window reliability

DictFloat is a compact Chrome floating dictionary for local glossaries, linked MDX text lookup, optional Wudao offline data, online fallback, and webpage selection lookup.

## v0.4.2 / 本版重点

### Reader-mode compatibility / 简读模式兼容

Some reading overlays create a full-screen fixed layer at the browser’s highest normal `z-index`. DictFloat now uses two protection layers whenever it opens:

1. Its unique root is moved to the end of `document.documentElement` and receives an inline maximum stacking fallback.
2. The visible DictFloat panel, minimized bar, and selection bubble use `popover="manual"` where supported, which places them in Chrome’s browser top layer above ordinary reader overlays.

This means the extension toolbar click no longer depends on the original article DOM remaining visible. The panel can be opened from normal webpages and from overlay-based reader modes using the same single DictFloat instance.

### Deterministic toolbar click / 图标点击更可靠

Toolbar open/lookup messages now acknowledge completion only after DictFloat has created or repaired its single root. This prevents a fast follow-up repair message from racing the first panel render.

### Single window still enforced / 仍坚持唯一窗口

The reader-mode fix keeps the existing single-window rules:

- one `#dictfloat-root` per document
- one visible panel or one minimized bar
- Search, History, Add, Edit, and Return replace content inside the same window
- stale content-script roots are removed before the current instance renders

## Upgrade notes / 更新说明

1. Replace the old extension folder with v0.4.2.
2. In `chrome://extensions`, click **Reload** for DictFloat.
3. Reload the webpage where you use reader mode, or close and reopen that tab.
4. Open your reader mode first, then click the DictFloat toolbar icon.

## Current dictionary capabilities

- local editable glossaries
- source ordering and source collapse
- optional Wudao offline pack
- linked MDX text lookup with on-demand block reads
- optional safe original CSS rendering for linked dictionaries
- online fallback

MDX/MDD media, custom dictionary JavaScript, external fonts, LZO blocks, and protected record blocks remain outside the current performance-first scope.
