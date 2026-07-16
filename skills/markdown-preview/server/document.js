import fs from 'node:fs/promises';
import path from 'node:path';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
const ORDER_CONFIG = '.markdown-preview.json';
const textCollator = new Intl.Collator('en', {
  numeric: false,
  sensitivity: 'base',
});

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function compareNames(a, b) {
  const aParts = a.match(/\d+|\D+/g) || [];
  const bParts = b.match(/\d+|\D+/g) || [];

  for (let index = 0; index < Math.min(aParts.length, bParts.length); index += 1) {
    const aPart = aParts[index];
    const bPart = bParts[index];
    const bothNumeric = /^\d+$/.test(aPart) && /^\d+$/.test(bPart);

    if (bothNumeric) {
      const numericOrder = BigInt(aPart) < BigInt(bPart) ? -1 : BigInt(aPart) > BigInt(bPart) ? 1 : 0;
      if (numericOrder !== 0) return numericOrder;
      if (aPart.length !== bPart.length) return aPart.length - bPart.length;
    } else {
      const textOrder = textCollator.compare(aPart, bPart);
      if (textOrder !== 0) return textOrder;
    }
  }

  if (aParts.length !== bParts.length) return aParts.length - bParts.length;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function isMarkdownFile(name) {
  return MARKDOWN_EXTENSIONS.has(path.extname(name).toLowerCase());
}

async function readRootOrder(markdownDir, childNames) {
  const configPath = path.join(markdownDir, ORDER_CONFIG);
  const source = await fs.readFile(configPath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (source === null) return null;

  let config;
  try {
    config = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid JSON in ${configPath}: ${error.message}`);
  }

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`${configPath} must contain a JSON object.`);
  }
  if (!Array.isArray(config.order) || config.order.some((entry) => typeof entry !== 'string')) {
    throw new Error(`${configPath} must contain an "order" array of root entry names.`);
  }

  const order = config.order.map((entry) => entry.replace(/\/$/, ''));
  const duplicates = order.filter((entry, index) => order.indexOf(entry) !== index);
  if (duplicates.length > 0) {
    throw new Error(`${configPath} contains duplicate order entries: ${[...new Set(duplicates)].join(', ')}`);
  }

  const childNameSet = new Set(childNames);
  const unknown = order.filter((entry) => !childNameSet.has(entry));
  if (unknown.length > 0) {
    throw new Error(`${configPath} references unknown root entries: ${unknown.join(', ')}`);
  }

  return order;
}

function orderChildren(children, explicitOrder = null) {
  const ranks = explicitOrder
    ? new Map(explicitOrder.map((name, index) => [name, index]))
    : null;

  return children.sort((a, b) => {
    const aRank = ranks?.get(a.name);
    const bRank = ranks?.get(b.name);
    if (aRank !== undefined || bRank !== undefined) {
      if (aRank === undefined) return 1;
      if (bRank === undefined) return -1;
      return aRank - bRank;
    }
    return compareNames(a.name, b.name);
  });
}

async function discoverDirectory(markdownDir, relativeDir = '') {
  const absoluteDir = path.join(markdownDir, relativeDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const children = [];

  for (const entry of entries) {
    const relativePath = relativeDir
      ? path.join(relativeDir, entry.name)
      : entry.name;

    if (entry.isDirectory()) {
      const directory = await discoverDirectory(markdownDir, relativePath);
      if (directory.children.length > 0) children.push(directory);
    } else if (entry.isFile() && isMarkdownFile(entry.name)) {
      children.push({
        type: 'file',
        name: entry.name,
        path: toPosixPath(relativePath),
      });
    }
  }

  const explicitOrder = relativeDir === ''
    ? await readRootOrder(markdownDir, children.map((child) => child.name))
    : null;

  return {
    type: 'directory',
    name: relativeDir ? path.basename(relativeDir) : path.basename(markdownDir),
    path: toPosixPath(relativeDir),
    children: orderChildren(children, explicitOrder),
  };
}

function flattenTree(node, files = []) {
  if (node.type === 'file') {
    files.push(node.path);
    return files;
  }

  for (const child of node.children) flattenTree(child, files);
  return files;
}

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

export async function buildDocumentTree(markdownDir) {
  return discoverDirectory(markdownDir);
}

export async function listMarkdownFiles(markdownDir) {
  return flattenTree(await buildDocumentTree(markdownDir));
}

export async function buildDocument(markdownDir) {
  const tree = await buildDocumentTree(markdownDir);
  const files = flattenTree(tree);
  const markdownDirName = path.basename(markdownDir);
  const parts = [];
  const sources = [];
  let currentLine = 0;

  for (const file of files) {
    const fullPath = path.join(markdownDir, ...file.split('/'));
    const sourceLabel = path.posix.join(markdownDirName, file);
    const content = (await fs.readFile(fullPath, 'utf8')).trimEnd();
    const prefix = `<!-- BEGIN ${sourceLabel} -->\n\n`;
    const suffix = `\n\n<!-- END ${sourceLabel} -->`;

    if (parts.length > 0) currentLine += 2;
    const startLine = currentLine + 2;
    const lineCount = content === '' ? 0 : content.split('\n').length;

    const part = `${prefix}${content}${suffix}`;
    parts.push(part);
    sources.push({
      file,
      directory: path.posix.dirname(file) === '.' ? '' : path.posix.dirname(file),
      startLine,
      endLine: startLine + lineCount,
    });
    currentLine += part.split('\n').length - 1;
  }

  return {
    markdown: parts.join('\n\n'),
    tree,
    sources,
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
