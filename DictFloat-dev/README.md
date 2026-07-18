# DictFloat v0.2.4

Compact floating Chrome dictionary with local-first technical glossaries.

## v0.2.4
- Fixed forced Light theme: the floating panel is now fully opaque white even if Chrome and the webpage are dark.
- Added multi-glossary management in Settings: create, rename, enable/disable, or delete local glossaries.
- Search respects enabled glossaries only.
- New and saved online entries can be assigned to a chosen local glossary.
- JSON export/import preserves glossary grouping; CSV includes a `dictionary` column.

## Existing features
- Toolbar click opens a compact 380px floating window.
- Selection lookup with a pink bubble or optional auto-open.
- Local glossary search plus online definition/translation fallback.
- History, favorites, import/export, and editable entries.

MDX/MDD import remains planned for v0.3; this release establishes the multi-source data model it needs.


## v0.2.4

- Fixed the Settings layout: font size, panel width, and their `px` units stay on one line.
- Fixed the online lookup switch row so its label and checkbox remain aligned.
- Added a concise v0.3 MDX/MDD development status card; local glossary sources are already separated for the upcoming importer.
