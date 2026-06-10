import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItFootnote from 'markdown-it-footnote';

function normalizeAssetUrl(url) {
  if (!url) return url;
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(url)) return url;
  return `/source/${url.split('/').map(encodeURIComponent).join('/')}`;
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
      symbol: '<svg class="header-anchor-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm.7 9.45a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 1 1-2.83-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25Z"></path></svg>',
    }),
  });

const defaultImageRule = markdown.renderer.rules.image;
markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const srcIndex = token.attrIndex('src');
  if (srcIndex >= 0) {
    token.attrs[srcIndex][1] = normalizeAssetUrl(token.attrs[srcIndex][1]);
  }
  return defaultImageRule
    ? defaultImageRule(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

const defaultLinkOpenRule = markdown.renderer.rules.link_open;
markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const hrefIndex = token.attrIndex('href');
  if (hrefIndex >= 0) {
    const href = token.attrs[hrefIndex][1];
    const isMarkdownLink = /\.(?:md|markdown)(?:[#?].*)?$/i.test(href);
    if (!isMarkdownLink) {
      token.attrs[hrefIndex][1] = normalizeAssetUrl(href);
    }
  }
  return defaultLinkOpenRule
    ? defaultLinkOpenRule(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

export function renderMarkdown(source) {
  return markdown.render(source || '');
}
