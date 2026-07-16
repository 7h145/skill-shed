import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildDocument, buildDocumentTree, listMarkdownFiles } from '../server/document.js';
import { renderMarkdown } from '../server/render.js';

async function fixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-preview-'));
  await Promise.all(Object.entries(files).map(async ([name, content]) => {
    const fullPath = path.join(root, name);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }));
  return root;
}

test('discovers an arbitrary-depth tree and flattens it in natural pre-order', async (t) => {
  const root = await fixture({
    '0-title.md': '# Title',
    '00-index.md': '# Index',
    '2-chapter/2-chapter.md': '# Chapter 2',
    '2-chapter/3.2-section.md': '## 3.2',
    '2-chapter/3.10-section.md': '## 3.10',
    '2-chapter/4-subchapter/1-leaf.md': '### Leaf',
    '10-appendix/10-appendix.md': '# Appendix',
    'assets/not-markdown.txt': 'ignored',
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.symlink(path.join(root, '2-chapter'), path.join(root, 'linked-chapter'));

  assert.deepEqual(await listMarkdownFiles(root), [
    '0-title.md',
    '00-index.md',
    '2-chapter/2-chapter.md',
    '2-chapter/3.2-section.md',
    '2-chapter/3.10-section.md',
    '2-chapter/4-subchapter/1-leaf.md',
    '10-appendix/10-appendix.md',
  ]);

  const tree = await buildDocumentTree(root);
  assert.equal(tree.type, 'directory');
  assert.deepEqual(tree.children.map(({ name }) => name), [
    '0-title.md',
    '00-index.md',
    '2-chapter',
    '10-appendix',
  ]);
});

test('uses explicit root order and naturally orders unlisted entries afterward', async (t) => {
  const root = await fixture({
    '1-abstract/abstract.md': '# Abstract',
    '2-introduction/introduction.md': '# Introduction',
    '10-appendix/appendix.md': '# Appendix',
    'abbreviations/abbreviations.md': '# Abbreviations',
    '.markdown-preview.json': JSON.stringify({
      order: ['1-abstract', 'abbreviations', '2-introduction'],
    }),
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  assert.deepEqual(await listMarkdownFiles(root), [
    '1-abstract/abstract.md',
    'abbreviations/abbreviations.md',
    '2-introduction/introduction.md',
    '10-appendix/appendix.md',
  ]);
});

test('rejects unknown entries in explicit root order', async (t) => {
  const root = await fixture({
    'chapter.md': '# Chapter',
    '.markdown-preview.json': JSON.stringify({ order: ['missing.md'] }),
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(
    listMarkdownFiles(root),
    /references unknown root entries: missing\.md/,
  );
});

test('renders assets relative to the Markdown leaf while preserving Markdown links', async (t) => {
  const root = await fixture({
    'chapter/section.md': [
      '# Section',
      '',
      '![Plot](<images/plot one.png>)',
      '',
      '[Data](files/data.csv?download=1)',
      '',
      '[Other section](other.md)',
    ].join('\n'),
    'root.md': '![Root](root.png)',
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const document = await buildDocument(root);
  const html = renderMarkdown(document.markdown, { sources: document.sources });

  assert.match(html, /src="\/source\/chapter\/images\/plot%20one\.png"/);
  assert.match(html, /href="\/source\/chapter\/files\/data\.csv\?download=1"/);
  assert.match(html, /href="other\.md"/);
  assert.match(html, /src="\/source\/root\.png"/);
  assert.deepEqual(document.sources.map(({ file, directory }) => ({ file, directory })), [
    { file: 'chapter/section.md', directory: 'chapter' },
    { file: 'root.md', directory: '' },
  ]);
});
