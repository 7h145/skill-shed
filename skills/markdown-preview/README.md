# markdown-preview

Live browser preview for an ordered tree of Markdown files.

`markdown-preview` treats the `*.md` and `*.markdown` leaves in a directory tree as one document. Files and directories are traversed in deterministic natural filename order, Markdown leaves are concatenated depth-first, and the result is rendered through a local web UI.

## Usage

Ask your agent to preview a Markdown directory, for example:

```text
Use markdown-preview for markdown/
```

The agent should start the local preview server and give you a URL to open in your browser.

## Features

- Ordered, arbitrarily nested multi-file Markdown preview.
- Recursive live browser updates using native filesystem events or polling.
- Clickable rebuild timestamp for manual refreshes.
- Print-friendly output through `Print / Save as PDF`, with enhanced page furniture in modern Chromium.
- Raw concatenated Markdown view.
- Optional raw TeX view when Pandoc is available.
- Localhost-first behavior by default.

## File ordering

Each directory is traversed depth-first. Its immediate Markdown files and subdirectories are ordered naturally by name, so `2-chapter` precedes `10-appendix` and `3.2-section.md` precedes `3.10-section.md`.

For an explicit root order, add `.markdown-preview.json` to the Markdown directory:

```json
{
  "order": [
    "0-title.md",
    "1-abstract",
    "abbreviations",
    "2-introduction",
    "10-appendix"
  ]
}
```

Entries name immediate root files or directories. Listed entries come first in the given order; unlisted entries follow in natural order. Unknown or duplicate entries are reported as configuration errors.

## File watching

Native filesystem events are used by default. For container mounts, network filesystems, or other environments where events are unreliable, enable polling:

```bash
SKILL_DIR=/path/to/this/skill
node "$SKILL_DIR/server/index.js" --dir markdown --watch-mode poll --poll-interval 500
```

Polling is recursive but costs more filesystem I/O, so it is opt-in. The polling interval defaults to 500 milliseconds.

## Printing

`Print / Save as PDF` opens the browser print dialog. The print stylesheet hides the preview UI and applies print-friendly page margins, typography, and break handling in all browsers.

Modern Chromium additionally supports the CSS page-margin boxes used here. It prints no CSS-generated header and adds this footer:

```text
markdown-preview, <localized date> <localized time>                 x of y
```

The timestamp uses the browser locale, with ISO 8601 as a fallback. Firefox currently ignores CSS page-margin boxes, so its native print headers and page numbering remain the available fallback. Browser-supplied headers and footers may need to be disabled in the print dialog to avoid unwanted or duplicate page furniture.

This is intended for quick printable snapshots. Publication-quality PDF/TeX builds remain project-specific.

## Notes

- The agent handles dependency setup and server startup.
- Runtime artifacts should stay outside the Markdown source directory.
- Relative images and asset links in nested Markdown files resolve from the source file's directory.
- The watcher does not follow symlinks outside the document tree.
- See `SKILL.md` for agent instructions and operational details.

## Install

Install this skill through your agent harness, or copy this skill directory into
wherever your harness loads skills from.

Pi example:

```bash
pi install git:github.com/7h145/skill-shed
```

[npm skills](https://www.npmjs.com/package/skills) example:

```bash
npx skills add 7h145/skill-shed
```

## Development

From the `skill-shed` repository root:

```bash
npm install
npm run check
npm test
```
