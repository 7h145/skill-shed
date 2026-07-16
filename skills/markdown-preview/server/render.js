import path from 'node:path';
import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItFootnote from 'markdown-it-footnote';

function splitUrlSuffix(url) {
  const index = url.search(/[?#]/);
  return index < 0
    ? { pathname: url, suffix: '' }
    : { pathname: url.slice(0, index), suffix: url.slice(index) };
}

function encodePath(pathname) {
  return pathname.split('/').map((segment) => {
    try {
      return encodeURIComponent(decodeURIComponent(segment));
    } catch {
      return encodeURIComponent(segment);
    }
  }).join('/');
}

function normalizeAssetUrl(url, sourceDirectory = '') {
  if (!url) return url;
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(url)) return url;

  const { pathname, suffix } = splitUrlSuffix(url);
  const resolved = path.posix.normalize(path.posix.join(sourceDirectory, pathname));
  if (resolved === '..' || resolved.startsWith('../')) return url;
  return `/source/${encodePath(resolved)}${suffix}`;
}

function sourceDirectoryForLine(sources, line) {
  const source = sources.find(({ startLine, endLine }) => line >= startLine && line < endLine);
  return source?.directory || '';
}

function rewriteSourceRelativeAssets(state) {
  const sources = state.env?.sources || [];

  for (const blockToken of state.tokens) {
    if (blockToken.type !== 'inline' || !blockToken.map || !blockToken.children) continue;
    const sourceDirectory = sourceDirectoryForLine(sources, blockToken.map[0]);

    for (const token of blockToken.children) {
      if (token.type === 'image') {
        const srcIndex = token.attrIndex('src');
        if (srcIndex >= 0) {
          token.attrs[srcIndex][1] = normalizeAssetUrl(token.attrs[srcIndex][1], sourceDirectory);
        }
      } else if (token.type === 'link_open') {
        const hrefIndex = token.attrIndex('href');
        if (hrefIndex < 0) continue;
        const href = token.attrs[hrefIndex][1];
        const isMarkdownLink = /\.(?:md|markdown)(?:[#?].*)?$/i.test(href);
        if (!isMarkdownLink) {
          token.attrs[hrefIndex][1] = normalizeAssetUrl(href, sourceDirectory);
        }
      }
    }
  }
}

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
})
  .use(markdownItFootnote)
  .use(markdownItAnchor, {
    level: [1, 2, 3, 4, 5, 6],
    permalink: markdownItAnchor.permalink.ariaHidden({
      placement: 'after',
      symbol: '<svg class="header-anchor-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm.7 9.45a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 1 1-2.83-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0-4.95-4.95l1.25-1.25Z"></path></svg>',
    }),
  });

markdown.core.ruler.after('inline', 'source-relative-assets', rewriteSourceRelativeAssets);

export function renderMarkdown(source, env = {}) {
  return markdown.render(source || '', env);
}
