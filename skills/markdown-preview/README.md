# markdown-preview

Live browser preview for a directory of ordered Markdown files.

`markdown-preview` treats all top-level `*.md` and `*.markdown` files in a directory as one document. Files are sorted lexicographically by filename, concatenated, rendered to HTML, and served through a local web UI that updates when files change.

## Usage

Ask your agent to preview a Markdown directory, for example:

```text
Use markdown-preview for markdown/
```

The agent should start the local preview server and give you a URL to open in your browser.

## Features

- Ordered multi-file Markdown preview.
- Live browser updates when files change.
- Manual refresh action.
- Raw concatenated Markdown view.
- Optional raw TeX view when Pandoc is available.
- Localhost-first behavior by default.

## File ordering

Files are ordered lexicographically by filename. Use names such as:

```text
001-intro.md
002-background.md
010-results.md
```

## Notes

- The agent handles dependency setup and server startup.
- Runtime artifacts should stay outside the Markdown source directory.
- See `SKILL.md` for agent instructions and operational details.
