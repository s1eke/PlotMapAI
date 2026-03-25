import { getChildElements, getPackageChild } from './opf';

const NON_CONTENT_TITLE = /^(?:cover|封面|table\s+of\s+contents?|目录|contents?|copyright|版权|title\s*page|书名页|half\s*title|dedication|献词|acknowledg?ments?|致谢|foreword|序言|preface|前言|about\s+the\s+author|关于作者|colophon|出版信息|imprint)$/iu;
const NON_CONTENT_HREF = /(?:^|\/)(?:cover|toc|title|copyright|dedication|front|back|acknowledg|preface|foreword|colophon|about)[^/]*$/iu;

function getMetadataField(doc: Document, field: string): string {
  return getChildElements(getPackageChild(doc, 'metadata'), field)[0]?.textContent?.trim() || '';
}

function getMetadataTags(doc: Document): string[] {
  const tags: string[] = [];
  for (const element of getChildElements(getPackageChild(doc, 'metadata'), 'subject')) {
    const text = element.textContent?.trim();
    if (text) tags.push(text);
  }
  return tags;
}

export function extractBookMetadata(doc: Document, fileName: string): {
  title: string;
  author: string;
  description: string;
  tags: string[];
} {
  return {
    title: getMetadataField(doc, 'title') || fileName.replace(/\.epub$/i, ''),
    author: getMetadataField(doc, 'creator'),
    description: getMetadataField(doc, 'description'),
    tags: getMetadataTags(doc),
  };
}

export function extractTitleFromHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const titleElement = doc.querySelector('title');
  if (titleElement?.textContent?.trim()) return titleElement.textContent.trim();
  for (const selector of ['h1', 'h2', 'h3']) {
    const element = doc.querySelector(selector);
    if (element?.textContent?.trim()) return element.textContent.trim();
  }
  return '';
}

export function isNonContentPage(title: string, href: string): boolean {
  return NON_CONTENT_TITLE.test(title.trim()) || NON_CONTENT_HREF.test(href);
}
