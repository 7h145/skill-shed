#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chokidar from 'chokidar';
import { buildDocument, resolveMarkdownDirectory, safeSourcePath } from './document.js';
import { renderMarkdown } from './render.js';
import { hasPandoc, renderMarkdownToTex } from './tex.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

function parseArgs(argv) {
  const options = { host: '127.0.0.1', port: 4177 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') options.dir = argv[++i];
    else if (arg === '--host') options.host = argv[++i];
    else if (arg === '--port') options.port = Number(argv[++i]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`markdown-preview\n\nUsage:\n  node server/index.js --dir <markdown-dir> [--host 127.0.0.1] [--port 4177]\n`);
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
      const html = await renderMarkdown(document.markdown);
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

  await state.rebuild('initial');
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
        await state.rebuild('manual-refresh');
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

function watchMarkdownDir(state) {
  let timer = null;
  const isMarkdownFile = (file) => /\.(?:md|markdown)$/i.test(file) && !file.includes(path.sep);
  const watcher = chokidar.watch(state.markdownDir, {
    ignoreInitial: true,
    depth: 0,
  });

  const schedule = (event, file) => {
    const relativeFile = path.relative(state.markdownDir, path.resolve(state.markdownDir, file));
    if (!isMarkdownFile(relativeFile)) return;
    clearTimeout(timer);
    timer = setTimeout(() => state.rebuild(`${event}:${relativeFile}`), 100);
  };

  watcher.on('add', (file) => schedule('add', file));
  watcher.on('change', (file) => schedule('change', file));
  watcher.on('unlink', (file) => schedule('unlink', file));
  watcher.on('error', (error) => {
    state.error = String(error?.stack || error);
    broadcast(state, 'error', publicPayload(state, 'watch-error'));
  });

  return watcher;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const markdownDir = await resolveMarkdownDirectory(options.dir);
  const state = await createState(markdownDir);
  watchMarkdownDir(state);

  const server = createServer(state);
  server.listen(options.port, options.host, () => {
    console.log(`[markdown-preview] directory: ${markdownDir}`);
    console.log(`[markdown-preview] listening: http://${options.host}:${options.port}`);
  });
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
