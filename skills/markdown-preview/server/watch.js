import path from 'node:path';
import chokidar from 'chokidar';

const ORDER_CONFIG = '.markdown-preview.json';
const MARKDOWN_PATTERN = /\.(?:md|markdown)$/i;

function relativeSourcePath(markdownDir, file) {
  const absoluteFile = path.isAbsolute(file) ? file : path.resolve(markdownDir, file);
  const relative = path.relative(markdownDir, absoluteFile);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join('/');
}

export function isDocumentSourcePath(markdownDir, file) {
  const relative = relativeSourcePath(markdownDir, file);
  return relative !== null && (MARKDOWN_PATTERN.test(relative) || relative === ORDER_CONFIG);
}

export function createWatchOptions(markdownDir, { watchMode = 'events', pollInterval = 500 } = {}) {
  const usePolling = watchMode === 'poll';

  return {
    ignoreInitial: true,
    followSymlinks: false,
    usePolling,
    interval: usePolling ? pollInterval : undefined,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 50,
    },
    ignored: (file, stats) => Boolean(
      stats?.isFile() && !isDocumentSourcePath(markdownDir, file)
    ),
  };
}

export function createRebuildQueue(rebuild) {
  let pendingReason = null;
  let drainPromise = null;

  async function drain() {
    while (pendingReason !== null) {
      const reason = pendingReason;
      pendingReason = null;
      await rebuild(reason);
    }
  }

  return function requestRebuild(reason = 'manual') {
    pendingReason = reason;
    if (!drainPromise) {
      drainPromise = drain().finally(() => {
        drainPromise = null;
      });
    }
    return drainPromise;
  };
}

export function watchMarkdownDir(state, options = {}) {
  const {
    watchMode = 'events',
    pollInterval = 500,
    debounceMs = 100,
  } = options;
  let timer = null;

  const watcher = chokidar.watch(
    state.markdownDir,
    createWatchOptions(state.markdownDir, { watchMode, pollInterval }),
  );

  const schedule = (event, file, stats) => {
    if (stats?.isSymbolicLink() || !isDocumentSourcePath(state.markdownDir, file)) return;
    const relativeFile = relativeSourcePath(state.markdownDir, file);
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.requestRebuild(`${event}:${relativeFile}`);
    }, debounceMs);
  };

  watcher.on('add', (file, stats) => schedule('add', file, stats));
  watcher.on('change', (file, stats) => schedule('change', file, stats));
  watcher.on('unlink', (file) => schedule('unlink', file));
  watcher.on('error', (error) => {
    state.error = String(error?.stack || error);
    state.broadcastError?.('watch-error');
  });

  watcher.on('close', () => clearTimeout(timer));
  return watcher;
}
