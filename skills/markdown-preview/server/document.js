import fs from 'node:fs/promises';
import path from 'node:path';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);

export async function resolveMarkdownDirectory(inputDir, cwd = process.cwd()) {
  if (!inputDir) {
    throw new Error('Missing required --dir <path> option.');
  }

  const resolved = path.resolve(cwd, inputDir);
  const stat = await fs.stat(resolved).catch(() => null);

  if (!stat) {
    throw new Error(`Markdown directory does not exist: ${resolved}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Markdown path is not a directory: ${resolved}`);
  }

  return resolved;
}

export async function listMarkdownFiles(markdownDir) {
  const entries = await fs.readdir(markdownDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .filter((entry) => MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: false, sensitivity: 'base' }));
}

export async function buildDocument(markdownDir) {
  const files = await listMarkdownFiles(markdownDir);
  const markdownDirName = path.basename(markdownDir);
  const parts = [];

  for (const file of files) {
    const fullPath = path.join(markdownDir, file);
    const sourceLabel = path.join(markdownDirName, file);
    const content = await fs.readFile(fullPath, 'utf8');
    parts.push(`<!-- BEGIN ${sourceLabel} -->\n\n${content.trimEnd()}\n\n<!-- END ${sourceLabel} -->`);
  }

  const markdown = parts.join('\n\n');

  return {
    markdown,
    files,
    fileCount: files.length,
    updatedAt: new Date().toISOString(),
  };
}

export function safeSourcePath(markdownDir, requestPath) {
  const decoded = decodeURIComponent(requestPath.replace(/^\/+/, ''));
  const resolved = path.resolve(markdownDir, decoded);
  const root = path.resolve(markdownDir);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('Refusing to serve a path outside the Markdown directory.');
  }

  return resolved;
}
