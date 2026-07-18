# DictFloat v0.3.6

Compact Chrome floating dictionary for selected-text lookup, local professional glossaries, Wudao offline data, and online fallback.

## v0.3.6 highlights / 本版重点

### Ordered lookup sources / 查询来源排序

- A new **Lookup order** section is available in Settings.
- Use **↑ / ↓** to decide the display priority of:
  - each local glossary, such as PCIe Starter, GPU, Firmware, or My Glossary;
  - Wudao · Offline;
  - every imported MDX / MDD source;
  - Online fallback.
- The order is stored locally and included in JSON backup/export.
- A query now renders matching sources from top to bottom in the order you choose.

### Collapsible dictionary sections / 词典结果可折叠

- Every source is rendered as one compact expandable section inside the **same DictFloat window**.
- Click the source header to collapse or expand it.
- Collapse state is saved locally, so a source stays folded until you expand it again.
- This is designed for multi-dictionary results: keep the dictionary you are reading open and fold the rest.

### Unified result headers / 统一的结果标题行

- Wudao results use one compact header line:

  ```text
  girl   [ɡɝl] · [gɜːl]                 Wudao · Offline
  ```

- Online results use the same structure:

  ```text
  girl   /ɡɜːl/                                   Online
  ```

- The source remains on the right; the term and pronunciation stay on the left.

### History now records the query / History 记录查询词

- Search-box Enter, selection lookup, right-click lookup, related-term lookup, and History re-query all keep a single deduplicated query record.
- History stores query words such as `girl`, `MPS`, and `Completion Timeout`, rather than depending on one local glossary entry.
- Clicking a History item re-runs the lookup in the same floating window.

### Single-window stability / 单窗口稳定性

- The content-runtime version is now aligned with the extension manifest/background runtime.
- Lookup, detail, Return, History, Add, Edit, minimize, and restore use one document-owned DictFloat root and one panel.
- Return restores the earlier source-result view instead of stacking another panel.

### MDX / MDD import improvement / MDX / MDD 导入改进

- Settings now supports **Import dictionary folder** as well as manual multi-file selection.
- Multi-part resources such as `TLD.mdd`, `TLD.1.mdd` … `TLD.6.mdd` and Oxford-style `.mdd`, `.1.mdd`, `.2.mdd` are grouped with the matching MDX source.
- Imported MDX / MDD sources appear in Lookup order and can be positioned now.
- **Important:** v0.3.6 still does not decode MDX key/record blocks or render MDX entries. It only handles source metadata, source grouping, enable/disable controls, and order. The next decoder stage is the real MDX lookup implementation.

## Existing capabilities / 已有功能

- Toolbar icon opens a compact, draggable floating window.
- Default 12px typography; Light, Dark, and Follow Chrome themes.
- Selected-text lookup bubble or optional auto-open behavior.
- Local multi-glossary search across term, aliases, Chinese text, tags, related terms, and definitions.
- Local entry creation, edit, delete, favorite, copy, JSON backup, and CSV import/export.
- Wudao offline English–Chinese / Chinese–English data pack support.
- Online English definition plus Chinese/English translation fallback without an API key.

## Wudao offline workflow / 无道离线包

1. In Settings, open **Wudao offline dictionary**.
2. Click **Import Wudao files**.
3. Select all four files together: `en.ind`, `en.z`, `zh.ind`, and `zh.z`.
4. Once the panel says **Ready for offline lookup**, query a word in DictFloat.

The selected files are copied to DictFloat's local IndexedDB. Removing the pack removes only DictFloat's local copy, not the original files on your computer.

## MDX / MDD beta workflow / MDX / MDD 测试流程

1. Open **Settings** → **MDX / MDD dictionaries**.
2. Use **Import dictionary folder** for a complete dictionary folder, or select one `.mdx` with its matching `.mdd` files.
3. DictFloat reads headers and associates multi-part MDD resources.
4. Use **Lookup order** to place that dictionary in the future display order.

For dictionaries with external `.js`, the scripts are never executed. CSS, fonts, images, audio, and actual MDX entry rendering belong to later decoder/resource stages.

## Installation / 安装

1. Extract the ZIP to a stable folder.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder.
5. After an update, use the refresh button on the DictFloat card and refresh any currently open test page.
