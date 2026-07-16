#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocument, resolveMarkdownDirectory, safeSourcePath } from './document.js';
import { renderMarkdown } from './render.js';
import { hasPandoc, renderMarkdownToTex } from './tex.js';
import { createRebuildQueue, watchMarkdownDir } from './watch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

function parseArgs(argv) {
  const options = {
    host: '127.0.0.1',
    port: 4177,
    watchMode: 'events',
    pollInterval: 500,
    pollIntervalSet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') options.dir = argv[++i];
    else if (arg === '--host') options.host = argv[++i];
    else if (arg === '--port') options.port = Number(argv[++i]);
    else if (arg === '--watch-mode') options.watchMode = argv[++i];
    else if (arg === '--poll-interval') {
      options.pollInterval = Number(argv[++i]);
      options.pollIntervalSet = true;
    } else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!['events', 'poll'].includes(options.watchMode)) {
    throw new Error('--watch-mode must be either "events" or "poll".');
  }
  if (!Number.isInteger(options.pollInterval) || options.pollInterval < 50) {
    throw new Error('--poll-interval must be an integer of at least 50 milliseconds.');
  }
  if (options.pollIntervalSet && options.watchMode !== 'poll') {
    throw new Error('--poll-interval may only be used with --watch-mode poll.');
  }
  return options;
}

function printHelp() {
  console.log(`markdown-preview

Usage:
  node server/index.js --dir <markdown-dir> [options]

Options:
  --host <host>            Bind host. Default: 127.0.0.1.
  --port <port>            Bind port. Default: 4177.
  --watch-mode <mode>      Watch mode: events or poll. Default: events.
  --poll-interval <ms>     Polling interval in milliseconds. Default: 500; requires poll mode.
`);
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
}

async function sendFile(res, filePath) {
  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    sendText(res, 404, 'Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  }[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'content-type': contentType,
    'content-length': stat.size,
    'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=60',
  });
  fs.createReadStream(filePath).pipe(res);
}

async function createState(markdownDir) {
  const state = {
    markdownDir,
    document: null,
    html: '',
    error: null,
    clients: new Set(),
  };

  state.rebuild = async function rebuild(reason = 'manual') {
    try {
      const document = await buildDocument(markdownDir);
      const html = renderMarkdown(document.markdown, { sources: document.sources });
      state.document = document;
      state.html = html;
      state.error = null;
      broadcast(state, 'update', publicPayload(state, reason));
      console.log(`[markdown-preview] rebuilt (${reason}): ${document.fileCount} file(s)`);
    } catch (error) {
      state.error = String(error?.stack || error);
      broadcast(state, 'error', publicPayload(state, reason));
      console.error('[markdown-preview] rebuild failed:', error);
    }
  };

  state.requestRebuild = createRebuildQueue(state.rebuild);
  state.broadcastError = (reason) => broadcast(state, 'error', publicPayload(state, reason));

  await state.requestRebuild('initial');
  return state;
}

function publicPayload(state, reason = 'manual') {
  return {
    html: state.html,
    markdown: state.document?.markdown || '',
    files: state.document?.files || [],
    fileCount: state.document?.fileCount || 0,
    updatedAt: state.document?.updatedAt || new Date().toISOString(),
    markdownDir: state.markdownDir,
    error: state.error,
    reason,
  };
}

function broadcast(state, event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of state.clients) {
    client.write(data);
  }
}

function createServer(state) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');

      if (url.pathname === '/') {
        await sendFile(res, path.join(publicDir, 'index.html'));
      } else if (url.pathname === '/client.js') {
        await sendFile(res, path.join(publicDir, 'client.js'));
      } else if (url.pathname === '/style.css') {
        await sendFile(res, path.join(publicDir, 'style.css'));
      } else if (url.pathname === '/api/render/html') {
        sendJson(res, 200, publicPayload(state));
      } else if (url.pathname === '/api/render/markdown') {
        sendText(res, 200, state.document?.markdown || '', 'text/markdown; charset=utf-8');
      } else if (url.pathname === '/api/render/tex') {
        if (!(await hasPandoc())) {
          sendJson(res, 503, {
            error: 'pandoc_missing',
            message: 'Pandoc is required to render raw TeX.',
            suggestedInstall: 'apt-get update && apt-get install -y pandoc',
            agentPrompt: 'Please install Pandoc so markdown-preview can render raw TeX via /api/render/tex.',
          });
          return;
        }
        try {
          const tex = await renderMarkdownToTex(state.document?.markdown || '');
          sendText(res, 200, tex, 'text/x-tex; charset=utf-8');
        } catch (error) {
          sendJson(res, 500, {
            error: error.code === 'PANDOC_FAILED' ? 'pandoc_failed' : 'tex_render_failed',
            message: error.message,
            stderr: error.stderr || '',
          });
        }
      } else if (url.pathname === '/api/render/rebuild' && req.method === 'POST') {
        await state.requestRebuild('manual-refresh');
        sendJson(res, 200, publicPayload(state, 'manual-refresh'));
      } else if (url.pathname === '/api/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        });
        res.write(`event: update\ndata: ${JSON.stringify(publicPayload(state, 'connect'))}\n\n`);
        state.clients.add(res);
        req.on('close', () => state.clients.delete(res));
      } else if (url.pathname.startsWith('/source/')) {
        const sourcePath = safeSourcePath(state.markdownDir, url.pathname.slice('/source/'.length));
        await sendFile(res, sourcePath);
      } else {
        sendText(res, 404, 'Not found');
      }
    } catch (error) {
      sendText(res, 500, String(error?.stack || error));
    }
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const markdownDir = await resolveMarkdownDirectory(options.dir);
  const state = await createState(markdownDir);
  watchMarkdownDir(state, options);

  const server = createServer(state);
  server.listen(options.port, options.host, () => {
    const watcherDescription = options.watchMode === 'poll'
      ? `poll (${options.pollInterval} ms)`
      : 'events';
    console.log(`[markdown-preview] directory: ${markdownDir}`);
    console.log(`[markdown-preview] watcher: ${watcherDescription}`);
    console.log(`[markdown-preview] listening: http://${options.host}:${options.port}`);
  });
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
