const NAV_LINE_PATTERN = /^(?:chapter\s+\d+\s*[-–—]\s*\d+|第\s*\d+\s*[章节页]\s*[-–—]?\s*(?:第\s*\d+\s*[页节]?)?|(?:上一[章回页节篇]|下一[章回页节篇]|返回目录|目录|首页|末页|back|next|prev(?:ious)?|home|toc|contents?)(?:\s*[｜|]\s*(?:上一[章回页节篇]|下一[章回页节篇]|返回目录|目录|首页|末页|back|next|prev(?:ious)?|home|toc|contents?))*)$/iu;
const BLOCK_TAG_NAMES = new Set(['script', 'style', 'nav', 'header', 'footer']);
const STRUCTURAL_TAG_NAMES = new Set(['article', 'br', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ol', 'p', 'section', 'table', 'td', 'th', 'tr', 'ul']);

function isHtmlWhitespace(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t' || char === '\f';
}

function isTagNameStartChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isTagNameChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return isTagNameStartChar(char) || (code >= 48 && code <= 57) || char === ':' || char === '_' || char === '-';
}

function findTagEnd(html: string, start: number): number {
  let quote: '"' | '\'' | null = null;
  for (let index = start + 1; index < html.length; index += 1) {
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
      index += 1;
    }
    const nameStart = index;
    if (!isTagNameStartChar(rawTagContent[index] ?? '')) {
      index += 1;
      continue;
    }
    index += 1;
    while (index < rawTagContent.length && isTagNameChar(rawTagContent[index])) index += 1;
    const attributeName = rawTagContent.slice(nameStart, index).toLowerCase();
    while (index < rawTagContent.length && isHtmlWhitespace(rawTagContent[index])) index += 1;
    if (rawTagContent[index] !== '=') continue;
    index += 1;
    while (index < rawTagContent.length && isHtmlWhitespace(rawTagContent[index])) index += 1;
    const quote = rawTagContent[index];
    let value = '';
    if (quote === '"' || quote === '\'') {
      index += 1;
      const valueStart = index;
      while (index < rawTagContent.length && rawTagContent[index] !== quote) index += 1;
      value = rawTagContent.slice(valueStart, index);
      if (index < rawTagContent.length) index += 1;
    } else {
      const valueStart = index;
      while (index < rawTagContent.length && !isHtmlWhitespace(rawTagContent[index]) && rawTagContent[index] !== '/') {
        index += 1;
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
  while (index < rawTagContent.length && isHtmlWhitespace(rawTagContent[index])) index += 1;
  const marker = rawTagContent[index];
  if (!marker) return null;
  if (marker === '!' || marker === '?') {
    return { name: '', isClosing: false, isSelfClosing: true, hasNavMarker: false, isSpecial: true };
  }
  let isClosing = false;
  if (marker === '/') {
    isClosing = true;
    index += 1;
    while (index < rawTagContent.length && isHtmlWhitespace(rawTagContent[index])) index += 1;
  }
  if (!isTagNameStartChar(rawTagContent[index] ?? '')) return null;
  const nameStart = index;
  index += 1;
  while (index < rawTagContent.length && isTagNameChar(rawTagContent[index])) index += 1;
  const name = rawTagContent.slice(nameStart, index).toLowerCase();
  let tail = rawTagContent.length - 1;
  while (tail >= index && isHtmlWhitespace(rawTagContent[tail])) tail -= 1;
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
        depth -= 1;
        if (depth === 0) return nextTagEnd + 1;
      } else if (!tag.isSelfClosing) {
        depth += 1;
      }
    }
    index = nextTagEnd + 1;
  }
  return html.length;
}

function decodeHtmlEntities(input: string): string {
  const namedEntities: Record<string, string> = { amp: '&', apos: '\'', gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return input
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, entity: string) => {
      if (entity.startsWith('#x')) {
        const codePoint = Number.parseInt(entity.slice(2), 16);
        return Number.isNaN(codePoint) || codePoint < 0 || codePoint > 0x10FFFF ? match : String.fromCodePoint(codePoint);
      }
      if (entity.startsWith('#')) {
        const codePoint = Number.parseInt(entity.slice(1), 10);
        return Number.isNaN(codePoint) || codePoint < 0 || codePoint > 0x10FFFF ? match : String.fromCodePoint(codePoint);
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
    return !trimmed || !NAV_LINE_PATTERN.test(trimmed);
  });
  return filtered.join('\n').replace(/\n{3,}/gu, '\n\n').trim();
}
