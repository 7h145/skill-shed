---
name: markdown-preview
description: Preview a directory of ordered Markdown files as one live, browser-rendered document. Use when a user wants a reactive web preview of a multi-file Markdown document.
---

# markdown-preview

Preview a multi-file Markdown document in a browser.

The user provides a directory such as `markdown/`. The skill reads Markdown files from that directory, sorts them lexicographically by filename, concatenates them into one virtual document, renders the document to HTML, and serves it through a local web server with live updates when files change.

## Agent runtime environment

If you are running in a boxed/containerized agent environment, use the relevant `boxed-*` skills for host/container-safe workflows. The boxed skills live at <https://github.com/7h145/boxed-skills>. For this long-running preview server, prefer `boxed-tmux` so the process is visible, inspectable, and easy to stop.

If you are not running boxed/containerized, use ordinary `tmux`, your harness's background-process mechanism, or another appropriate inspectable process manager.

## First implementation scope

Do this first:

- Accept a Markdown directory from the user.
- Discover `*.md` and `*.markdown` files in that directory.
- Sort files lexicographically by filename.
- Concatenate them into one virtual document.
- Render to HTML, including footnotes and heading anchors.
- Serve a live web preview.
- Watch files and update the browser reactively.

## Setup

Set `SKILL_DIR` to this skill directory, then install dependencies there:

```bash
SKILL_DIR=/path/to/this/skill
cd "$SKILL_DIR" && npm install
```

This installs the lightweight preview server dependencies.

## Run directly

From the project root, run:

```bash
SKILL_DIR=/path/to/this/skill
node "$SKILL_DIR/server/index.js" --dir markdown --host 127.0.0.1 --port 4177
```

Options:

```text
--dir <path>     Markdown directory to preview. Required.
--host <host>    Bind host. Default: 127.0.0.1. Always use 127.0.0.1 unless the user explicitly requests a different bind host.
--port <port>    Bind port. Default: 4177.
```

Then open:

```text
http://127.0.0.1:4177
```

## User handoff

After starting or restarting the preview server, always report the browser URL directly and ask the user to open it.

Example:

```text
Markdown preview is running for `markdown/`.

Open this URL in your browser:

http://127.0.0.1:4177

Process: tmux window `markdown-preview`
```

If `boxed-dbus open-uri` is already available and verified in a boxed/containerized environment, you may offer or use it for a clickable host-side open action. If it is not available, do not bootstrap DBus just for this; print the URL and ask the user to open it manually.

## Run as a background process

Use an inspectable background process. Name the process/window `markdown-preview` when possible.

### Boxed/containerized agents

If the `boxed-tmux` skill is available and you are boxed/containerized, load it and follow its bootstrap pattern. Start the server in a persistent window, for example:

```bash
SKILL_DIR=/path/to/this/skill
WINDOW=markdown-preview
COMMAND="node \"$SKILL_DIR/server/index.js\" --dir markdown --host 127.0.0.1 --port 4177"
```

Always bind to `127.0.0.1` unless the user explicitly requests a different bind host.

### Non-boxed agents

Use normal `tmux` or another appropriate process manager, for example:

```bash
SKILL_DIR=/path/to/this/skill
tmux new-session -d -s markdown-preview "node \"$SKILL_DIR/server/index.js\" --dir markdown --host 127.0.0.1 --port 4177"
```

## Runtime behavior

The server provides:

- `GET /` — browser UI.
- `GET /api/render/html` — current rendered document metadata and HTML.
- `GET /api/render/markdown` — current concatenated Markdown.
- `GET /api/render/tex` — current document rendered as raw TeX via optional Pandoc.
- `POST /api/render/rebuild` — manually rescan/rebuild the document.
- `GET /api/events` — Server-Sent Events stream for live updates.
- `GET /source/<path>` — static files from the Markdown directory, useful for images/assets.

Runtime artifacts should stay outside the Markdown source directory. Prefer `.agents/run/markdown-preview/` if artifacts are needed later.

## Troubleshooting

- If the page loads but does not update, check the server logs in the tmux/background-process window.
- If images do not load, use paths relative to the Markdown directory or place assets below that directory.
- If the server is unreachable, keep `127.0.0.1` as the default and ask the user before binding to a different host or changing exposure/forwarding.
- If Node dependencies are missing, set `SKILL_DIR=/path/to/this/skill` and run `cd "$SKILL_DIR" && npm install`.
- If `/api/render/tex` reports `pandoc_missing`, ask the user before installing Pandoc. Pandoc is optional and only needed for raw TeX rendering. The error includes an `agentPrompt` field the user can copy/paste back to an agent.

## Metadata
* Author: thias <github.attic@typedef.net>, OpenAI gpt-5.5
* License: CC BY 4.0
* Version: 0.1
* Date: 2026-06-09
