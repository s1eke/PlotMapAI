import JSZip from 'jszip';
import type { ParsedBook } from './bookParser';

interface ChapterImageRef {
  imageKey: string;
  blob: Blob;
}

let imageCounter = 0;

function generateImageKey(): string {
  return `img_${Date.now()}_${imageCounter++}`;
}

function resolveImagePath(opfDir: string, src: string): string {
  const clean = src.split('#')[0];
  if (opfDir) return `${opfDir}/${clean}`;
  return clean;
}

async function extractChapterImages(
  html: string,
  zip: JSZip,
  opfDir: string,
): Promise<{ html: string; images: ChapterImageRef[] }> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imgs = doc.querySelectorAll('img');
  const images: ChapterImageRef[] = [];

  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    if (!src || src.startsWith('data:') || src.startsWith('http:') || src.startsWith('https:')) {
      if (src.startsWith('data:')) {
        const key = generateImageKey();
        const parts = src.split(',');
        const mimeMatch = parts[0].match(/data:([^;]+)/);
        const mime = mimeMatch?.[1] || 'image/png';
        const binary = atob(parts[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        images.push({ imageKey: key, blob: new Blob([bytes], { type: mime }) });
        img.replaceWith(doc.createTextNode(`[IMG:${key}]`));
      }
      continue;
    }

    const fullPath = resolveImagePath(opfDir, src);
    const file = zip.file(fullPath);
    if (!file) continue;

    try {
      const buffer = await file.async('arraybuffer');
      const ext = fullPath.split('.').pop()?.toLowerCase() || '';
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'gif' ? 'image/gif'
        : ext === 'svg' ? 'image/svg+xml'
        : ext === 'webp' ? 'image/webp'
        : 'image/png';
      const key = generateImageKey();
      images.push({ imageKey: key, blob: new Blob([buffer], { type: mime }) });
      img.replaceWith(doc.createTextNode(`[IMG:${key}]`));
    } catch { /* skip unreadable images */ }
  }

  return { html: doc.documentElement.outerHTML, images };
}

const NAV_LINE_PATTERN = /^(?:chapter\s+\d+\s*[-–—]\s*\d+|第\s*\d+\s*[章节页]\s*[-–—]?\s*(?:第\s*\d+\s*[页节]?)?|(?:上一[章回页节篇]|下一[章回页节篇]|返回目录|目录|首页|末页|back|next|prev(?:ious)?|home|toc|contents?)(?:\s*[｜|]\s*(?:上一[章回页节篇]|下一[章回页节篇]|返回目录|目录|首页|末页|back|next|prev(?:ious)?|home|toc|contents?))*)$/iu;

const NON_CONTENT_TITLE = /^(?:cover|封面|table\s+of\s+contents?|目录|contents?|copyright|版权|title\s*page|书名页|half\s*title|dedication|献词|acknowledg?ments?|致谢|foreword|序言|preface|前言|about\s+the\s+author|关于作者|colophon|出版信息|imprint)$/iu;

const NON_CONTENT_HREF = /(?:^|\/)(?:cover|toc|title|copyright|dedication|front|back|acknowledg|preface|foreword|colophon|about)[^/]*$/iu;
const BLOCK_TAG_NAMES = new Set(['script', 'style', 'nav', 'header', 'footer']);
const STRUCTURAL_TAG_NAMES = new Set(['article', 'br', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ol', 'p', 'section', 'table', 'td', 'th', 'tr', 'ul']);

function isNonContentPage(title: string, href: string): boolean {
  return NON_CONTENT_TITLE.test(title.trim()) || NON_CONTENT_HREF.test(href);
}

function isHtmlWhitespace(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t' || char === '\f';
}

function isTagNameStartChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isTagNameChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return isTagNameStartChar(char)
    || (code >= 48 && code <= 57)
    || char === ':'
    || char === '_'
    || char === '-';
}

function findTagEnd(html: string, start: number): number {
  let quote: '"' | '\'' | null = null;

  for (let index = start + 1; index < html.length; index++) {
    const char = html[index];

    if (quote) {
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (char === '>') return index;
  }

  return -1;
}

function hasNavMarker(rawTagContent: string): boolean {
  let index = 0;

  while (index < rawTagContent.length) {
    while (index < rawTagContent.length && (isHtmlWhitespace(rawTagContent[index]) || rawTagContent[index] === '/')) {
      index++;
    }

    const nameStart = index;
    if (!isTagNameStartChar(rawTagContent[index] ?? '')) {
      index++;
      continue;
    }

    index++;
    while (index < rawTagContent.length && isTagNameChar(rawTagContent[index])) {
      index++;
    }

    const attributeName = rawTagContent.slice(nameStart, index).toLowerCase();
    while (index < rawTagContent.length && isHtmlWhitespace(rawTagContent[index])) {
      index++;
    }

    if (rawTagContent[index] !== '=') {
      continue;
    }

    index++;
    while (index < rawTagContent.length && isHtmlWhitespace(rawTagContent[index])) {
      index++;
    }

    let value = '';
    const quote = rawTagContent[index];

    if (quote === '"' || quote === '\'') {
      index++;
      const valueStart = index;
      while (index < rawTagContent.length && rawTagContent[index] !== quote) {
        index++;
      }
      value = rawTagContent.slice(valueStart, index);
      if (index < rawTagContent.length) index++;
    } else {
      const valueStart = index;
      while (
        index < rawTagContent.length
        && !isHtmlWhitespace(rawTagContent[index])
        && rawTagContent[index] !== '/'
      ) {
        index++;
      }
      value = rawTagContent.slice(valueStart, index);
    }

    if ((attributeName === 'class' || attributeName === 'id') && value.toLowerCase().includes('nav')) {
      return true;
    }
  }

  return false;
}

interface ParsedHtmlTag {
  name: string;
  isClosing: boolean;
  isSelfClosing: boolean;
  hasNavMarker: boolean;
  isSpecial: boolean;
}

function parseHtmlTag(rawTagContent: string): ParsedHtmlTag | null {
  let index = 0;
  while (index < rawTagContent.length && isHtmlWhitespace(rawTagContent[index])) {
    index++;
  }

  const marker = rawTagContent[index];
  if (!marker) return null;
  if (marker === '!' || marker === '?') {
    return {
      name: '',
      isClosing: false,
      isSelfClosing: true,
      hasNavMarker: false,
      isSpecial: true,
    };
  }

  let isClosing = false;
  if (marker === '/') {
    isClosing = true;
    index++;
    while (index < rawTagContent.length && isHtmlWhitespace(rawTagContent[index])) {
      index++;
    }
  }

  if (!isTagNameStartChar(rawTagContent[index] ?? '')) {
    return null;
  }

  const nameStart = index;
  index++;
  while (index < rawTagContent.length && isTagNameChar(rawTagContent[index])) {
    index++;
  }

  const name = rawTagContent.slice(nameStart, index).toLowerCase();
  let tail = rawTagContent.length - 1;
  while (tail >= index && isHtmlWhitespace(rawTagContent[tail])) {
    tail--;
  }

  return {
    name,
    isClosing,
    isSelfClosing: !isClosing && rawTagContent[tail] === '/',
    hasNavMarker: !isClosing && hasNavMarker(rawTagContent.slice(index)),
    isSpecial: false,
  };
}

function skipBlockedElement(html: string, tagEnd: number, tagName: string): number {
  let depth = 1;
  let index = tagEnd + 1;

  while (index < html.length) {
    const nextTagStart = html.indexOf('<', index);
    if (nextTagStart === -1) return html.length;

    if (html.startsWith('<!--', nextTagStart)) {
      const commentEnd = html.indexOf('-->', nextTagStart + 4);
      index = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }

    const nextTagEnd = findTagEnd(html, nextTagStart);
    if (nextTagEnd === -1) return html.length;

    const tag = parseHtmlTag(html.slice(nextTagStart + 1, nextTagEnd));
    if (tag && !tag.isSpecial && tag.name === tagName) {
      if (tag.isClosing) {
        depth--;
        if (depth === 0) return nextTagEnd + 1;
      } else if (!tag.isSelfClosing) {
        depth++;
      }
    }

    index = nextTagEnd + 1;
  }

  return html.length;
}

function decodeHtmlEntities(input: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: '\'',
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return input
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, entity: string) => {
      if (entity.startsWith('#x')) {
        const codePoint = Number.parseInt(entity.slice(2), 16);
        if (Number.isNaN(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) return match;
        return String.fromCodePoint(codePoint);
      }

      if (entity.startsWith('#')) {
        const codePoint = Number.parseInt(entity.slice(1), 10);
        if (Number.isNaN(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) return match;
        return String.fromCodePoint(codePoint);
      }

      return namedEntities[entity.toLowerCase()] ?? match;
    })
    .replace(/\u00a0/gu, ' ');
}

export function htmlToText(html: string): string {
  const textParts: string[] = [];
  let index = 0;

  while (index < html.length) {
    const nextTagStart = html.indexOf('<', index);
    if (nextTagStart === -1) {
      textParts.push(html.slice(index));
      break;
    }

    textParts.push(html.slice(index, nextTagStart));

    if (html.startsWith('<!--', nextTagStart)) {
      const commentEnd = html.indexOf('-->', nextTagStart + 4);
      index = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }

    const tagEnd = findTagEnd(html, nextTagStart);
    if (tagEnd === -1) {
      textParts.push(html.slice(nextTagStart));
      break;
    }

    const tag = parseHtmlTag(html.slice(nextTagStart + 1, tagEnd));
    if (tag?.isSpecial) {
      index = tagEnd + 1;
      continue;
    }

    if (!tag) {
      textParts.push(html.slice(nextTagStart, tagEnd + 1));
      index = tagEnd + 1;
      continue;
    }

    if (!tag.isClosing && (BLOCK_TAG_NAMES.has(tag.name) || tag.hasNavMarker)) {
      index = tag.isSelfClosing ? tagEnd + 1 : skipBlockedElement(html, tagEnd, tag.name);
      continue;
    }

    if (STRUCTURAL_TAG_NAMES.has(tag.name) && (tag.name === 'br' || tag.isClosing || tag.isSelfClosing)) {
      textParts.push('\n');
    }

    index = tagEnd + 1;
  }

  const text = decodeHtmlEntities(textParts.join(''))
    .replace(/\r\n?/gu, '\n')
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n */gu, '\n');
  const lines = text.split('\n');
  const filtered = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (NAV_LINE_PATTERN.test(trimmed)) return false;
    return true;
  });
  return filtered.join('\n').replace(/\n{3,}/gu, '\n\n').trim();
}

async function fileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getOpfPath(zip: JSZip): Promise<string> {
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('META-INF/container.xml not found');
  const containerXml = await containerFile.async('text');
  const doc = new DOMParser().parseFromString(containerXml, 'application/xml');
  const rootfile = doc.querySelector('rootfile');
  if (!rootfile) throw new Error('No rootfile element in container.xml');
  const path = rootfile.getAttribute('full-path');
  if (!path) throw new Error('No full-path attribute in rootfile');
  return path;
}

function getNsResolver(): XPathNSResolver {
  return (prefix: string | null) => {
    if (prefix === 'dc') return 'http://purl.org/dc/elements/1.1/';
    if (prefix === 'opf') return 'http://www.idpf.org/2007/opf';
    return null;
  };
}

function getMetadataField(doc: Document, field: string): string {
  const nsResolver = getNsResolver();
  const node = doc.evaluate(
    `//opf:metadata/dc:${field}`,
    doc,
    nsResolver,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null,
  ).singleNodeValue as Element | null;
  return node?.textContent?.trim() || '';
}

function getMetadataTags(doc: Document): string[] {
  const nsResolver = getNsResolver();
  const result = doc.evaluate(
    '//opf:metadata/dc:subject',
    doc,
    nsResolver,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null,
  );
  const tags: string[] = [];
  for (let i = 0; i < result.snapshotLength; i++) {
    const text = (result.snapshotItem(i) as Element)?.textContent?.trim();
    if (text) tags.push(text);
  }
  return tags;
}

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
}

function getManifest(doc: Document): Map<string, ManifestItem> {
  const items = new Map<string, ManifestItem>();
  const nsResolver = getNsResolver();
  const result = doc.evaluate(
    '//opf:manifest/opf:item',
    doc,
    nsResolver,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null,
  );
  for (let i = 0; i < result.snapshotLength; i++) {
    const el = result.snapshotItem(i) as Element;
    const id = el.getAttribute('id') || '';
    const href = el.getAttribute('href') || '';
    const mediaType = el.getAttribute('media-type') || '';
    if (id && href) items.set(id, { id, href, mediaType });
  }
  return items;
}

function getSpineItemIds(doc: Document): string[] {
  const nsResolver = getNsResolver();
  const result = doc.evaluate(
    '//opf:spine/opf:itemref',
    doc,
    nsResolver,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null,
  );
  const ids: string[] = [];
  for (let i = 0; i < result.snapshotLength; i++) {
    const idref = (result.snapshotItem(i) as Element)?.getAttribute('idref');
    if (idref) ids.push(idref);
  }
  return ids;
}

async function buildTocMap(doc: Document, zip: JSZip, opfDir: string): Promise<Map<string, string>> {
  const tocMap = new Map<string, string>();
  const nsResolver = getNsResolver();

  // 1. Try NCX file (EPUB2)
  let ncxPath = '';
  const spine = doc.evaluate(
    '//opf:spine',
    doc,
    nsResolver,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null,
  ).singleNodeValue as Element | null;
  const ncxId = spine?.getAttribute('toc') || '';
  if (ncxId) {
    const ncxItem = doc.evaluate(
      `//opf:manifest/opf:item[@id="${ncxId}"]`,
      doc,
      nsResolver,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue as Element | null;
    const ncxHref = ncxItem?.getAttribute('href') || '';
    if (ncxHref) {
      ncxPath = opfDir ? `${opfDir}/${ncxHref}` : ncxHref;
    }
  }

  if (ncxPath) {
    const ncxFile = zip.file(ncxPath);
    if (ncxFile) {
      try {
        const ncxXml = await ncxFile.async('text');
        const ncxDoc = new DOMParser().parseFromString(ncxXml, 'application/xml');
        const navPoints = ncxDoc.querySelectorAll('navPoint');
        for (const point of navPoints) {
          const textEl = point.querySelector('text');
          const contentEl = point.querySelector('content');
          const title = textEl?.textContent?.trim() || '';
          const src = contentEl?.getAttribute('src') || '';
          if (title && src) {
            const href = src.split('#')[0];
            if (!tocMap.has(href)) tocMap.set(href, title);
          }
        }
      } catch { /* ignore */ }
    }
  }

  // 2. Try nav document (EPUB3)
  if (tocMap.size === 0) {
    let navPath = '';
    const navItem = doc.evaluate(
      '//opf:manifest/opf:item[@properties="nav"]',
      doc,
      nsResolver,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue as Element | null;
    if (navItem) {
      const navHref = navItem.getAttribute('href') || '';
      if (navHref) navPath = opfDir ? `${opfDir}/${navHref}` : navHref;
    }
    if (navPath) {
      const navFile = zip.file(navPath);
      if (navFile) {
        try {
          const navXml = await navFile.async('text');
          const navDoc = new DOMParser().parseFromString(navXml, 'application/xhtml+xml');
          const links = navDoc.querySelectorAll('nav[*|type="toc"] a, nav[epub\\:type="toc"] a, ol a');
          for (const link of links) {
            const href = (link as HTMLAnchorElement).getAttribute('href')?.split('#')[0] || '';
            const title = link.textContent?.trim() || '';
            if (href && title && !tocMap.has(href)) tocMap.set(href, title);
          }
        } catch { /* ignore */ }
      }
    }
  }

  // 3. Try guide/reference
  const guideResult = doc.evaluate(
    '//opf:guide/opf:reference',
    doc,
    nsResolver,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null,
  );
  for (let i = 0; i < guideResult.snapshotLength; i++) {
    const el = guideResult.snapshotItem(i) as Element;
    const href = el.getAttribute('href')?.split('#')[0] || '';
    const title = el.getAttribute('title') || '';
    if (href && title && !tocMap.has(href)) tocMap.set(href, title);
  }

  return tocMap;
}

function extractTitleFromHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const titleEl = doc.querySelector('title');
  if (titleEl?.textContent?.trim()) return titleEl.textContent.trim();
  for (const sel of ['h1', 'h2', 'h3']) {
    const el = doc.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  return '';
}

async function extractCoverBlob(
  zip: JSZip,
  opfDir: string,
  manifest: Map<string, ManifestItem>,
  doc: Document,
): Promise<Blob | null> {
  const imageItems = Array.from(manifest.values()).filter(item =>
    item.mediaType.startsWith('image/'),
  );

  let coverItem: ManifestItem | undefined;

  const nsResolver = getNsResolver();
  const coverMeta = doc.evaluate(
    '//opf:metadata/opf:meta[@name="cover"]',
    doc,
    nsResolver,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null,
  ).singleNodeValue as Element | null;
  if (coverMeta) {
    const coverId = coverMeta.getAttribute('content');
    if (coverId) coverItem = manifest.get(coverId);
  }

  if (!coverItem) {
    coverItem = imageItems.find(item => {
      const name = item.href.toLowerCase();
      const id = item.id.toLowerCase();
      return name.includes('cover') || id.includes('cover');
    });
  }

  if (!coverItem && imageItems.length > 0) {
    coverItem = imageItems[0];
  }

  if (!coverItem) return null;

  const fullPath = opfDir ? `${opfDir}/${coverItem.href}` : coverItem.href;
  const file = zip.file(fullPath);
  if (!file) return null;

  const data = await file.async('arraybuffer');
  return new Blob([data], { type: coverItem.mediaType });
}

export async function parseEpub(file: File): Promise<ParsedBook> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const opfPath = await getOpfPath(zip);
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/')) : '';

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`OPF file not found: ${opfPath}`);
  const opfXml = await opfFile.async('text');
  const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');

  const title = getMetadataField(opfDoc, 'title') || file.name.replace(/\.epub$/i, '');
  const author = getMetadataField(opfDoc, 'creator');
  const description = getMetadataField(opfDoc, 'description');
  const tags = getMetadataTags(opfDoc);

  const manifest = getManifest(opfDoc);
  const spineIds = getSpineItemIds(opfDoc);
  const tocMap = await buildTocMap(opfDoc, zip, opfDir);

  const chapters: Array<{ title: string; content: string }> = [];
  const allImages: ChapterImageRef[] = [];
  let chapterIdx = 0;

  const orderedItems = spineIds.length > 0
    ? spineIds.map(id => manifest.get(id)).filter((item): item is ManifestItem => !!item)
    : Array.from(manifest.values()).filter(item =>
        item.mediaType.includes('xhtml') || item.mediaType.includes('html'),
      );

  for (const item of orderedItems) {
    const fullPath = opfDir ? `${opfDir}/${item.href}` : item.href;
    const chapterFile = zip.file(fullPath);
    if (!chapterFile) continue;

    let html: string;
    try {
      html = await chapterFile.async('text');
    } catch {
      continue;
    }

    const { html: cleanedHtml, images } = await extractChapterImages(html, zip, opfDir);
    allImages.push(...images);

    const text = htmlToText(cleanedHtml);
    if (!text) continue;

    const hrefBase = item.href.split('#')[0];
    let chapterTitle = tocMap.get(hrefBase) || '';

    if (!chapterTitle) {
      chapterTitle = extractTitleFromHtml(cleanedHtml);
    }

    if (!chapterTitle) {
      chapterIdx++;
      chapterTitle = `Chapter ${chapterIdx}`;
    }

    if (isNonContentPage(chapterTitle, item.href)) continue;

    chapters.push({ title: chapterTitle, content: text });
  }

  const totalWords = chapters.reduce((sum, ch) => sum + ch.content.length, 0);

  let coverBlob: Blob | null = null;
  try {
    coverBlob = await extractCoverBlob(zip, opfDir, manifest, opfDoc);
  } catch {
    coverBlob = null;
  }

  const hash = await fileHash(file);

  let desc = description;
  if (desc && desc.includes('<')) {
    desc = htmlToText(desc);
  }

  return {
    title,
    author,
    description: desc,
    coverBlob,
    chapters,
    rawText: '',
    encoding: 'utf-8',
    totalWords,
    fileHash: hash,
    tags,
    images: allImages,
  };
}
