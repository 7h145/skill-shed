# markdown-preview

Live browser preview for a directory of ordered Markdown files.

`markdown-preview` treats the `*.md` and `*.markdown` leaves in a directory tree as one document. Files and directories are traversed in deterministic natural filename order, Markdown leaves are concatenated depth-first, and the result is rendered through a local web UI.

## Usage

Ask your agent to preview a Markdown directory, for example:

```text
Use markdown-preview for markdown/
```

The agent should start the local preview server and give you a URL to open in your browser.

## Features

- Ordered, arbitrarily nested multi-file Markdown preview.
- Live browser updates when watched files change.
- Manual refresh action.
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

## Notes

- The agent handles dependency setup and server startup.
- Runtime artifacts should stay outside the Markdown source directory.
- Relative images and asset links in nested Markdown files resolve from the source file's directory.
- Until recursive watcher support lands, use the clickable rebuild timestamp after changing a nested file that does not trigger an automatic update.
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
