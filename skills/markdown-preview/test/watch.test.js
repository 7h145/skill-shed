import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createRebuildQueue,
  createWatchOptions,
  isDocumentSourcePath,
  watchMarkdownDir,
} from '../server/watch.js';

async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for watcher event.');
}

function waitForReady(watcher) {
  return new Promise((resolve, reject) => {
    watcher.once('ready', resolve);
    watcher.once('error', reject);
  });
}

test('recognizes nested Markdown and only the root order configuration', () => {
  const root = path.resolve('/tmp/document');
  assert.equal(isDocumentSourcePath(root, path.join(root, 'chapter', 'leaf.md')), true);
  assert.equal(isDocumentSourcePath(root, path.join(root, 'chapter', 'leaf.MARKDOWN')), true);
  assert.equal(isDocumentSourcePath(root, path.join(root, '.markdown-preview.json')), true);
  assert.equal(isDocumentSourcePath(root, path.join(root, 'chapter', '.markdown-preview.json')), false);
  assert.equal(isDocumentSourcePath(root, path.join(root, 'image.png')), false);
  assert.equal(isDocumentSourcePath(root, path.resolve(root, '..', 'outside.md')), false);
});

test('constructs event and polling watcher options', () => {
  const root = path.resolve('/tmp/document');
  const events = createWatchOptions(root, { watchMode: 'events', pollInterval: 900 });
  const poll = createWatchOptions(root, { watchMode: 'poll', pollInterval: 900 });

  assert.equal(events.usePolling, false);
  assert.equal(events.interval, undefined);
  assert.equal(events.followSymlinks, false);
  assert.equal(poll.usePolling, true);
  assert.equal(poll.interval, 900);
  assert.equal(poll.followSymlinks, false);
});

test('serializes rebuilds and coalesces pending requests', async () => {
  const calls = [];
  let releaseFirst;
  const firstBlocked = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const requestRebuild = createRebuildQueue(async (reason) => {
    calls.push(reason);
    if (calls.length === 1) await firstBlocked;
  });

  const first = requestRebuild('first');
  const second = requestRebuild('second');
  const third = requestRebuild('third');
  releaseFirst();
  await Promise.all([first, second, third]);

  assert.deepEqual(calls, ['first', 'third']);
});

test('polling watcher rebuilds for nested Markdown and root order changes', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-preview-watch-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const reasons = [];
  const state = {
    markdownDir: root,
    requestRebuild: async (reason) => {
      reasons.push(reason);
    },
    broadcastError: () => {},
  };
  const watcher = watchMarkdownDir(state, {
    watchMode: 'poll',
    pollInterval: 50,
    debounceMs: 10,
  });
  t.after(() => watcher.close());
  await waitForReady(watcher);

  const nestedFile = path.join(root, 'chapter', 'section.md');
  await fs.mkdir(path.dirname(nestedFile), { recursive: true });
  await fs.writeFile(nestedFile, '# Section');
  await waitFor(() => reasons.some((reason) => reason === 'add:chapter/section.md'));

  await fs.writeFile(nestedFile, '# Changed section');
  await waitFor(() => reasons.some((reason) => reason === 'change:chapter/section.md'));

  const configFile = path.join(root, '.markdown-preview.json');
  await fs.writeFile(configFile, '{"order":["chapter"]}');
  await waitFor(() => reasons.some((reason) => reason === 'add:.markdown-preview.json'));

  await fs.rm(nestedFile);
  await waitFor(() => reasons.some((reason) => reason === 'unlink:chapter/section.md'));
});
