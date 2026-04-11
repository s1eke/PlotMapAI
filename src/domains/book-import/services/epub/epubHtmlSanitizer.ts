import { DOMParser as XmldomDOMParser } from '@xmldom/xmldom';

const LEADING_BOM_PATTERN = /^\uFEFF+/u;
const LEADING_XML_DECLARATION_PATTERN = /^\s*<\?xml[\s\S]*?\?>\s*/iu;

const BLOCKED_TAG_NAMES = new Set([
  'head',
  'header',
  'footer',
  'link',
  'meta',
  'nav',
  'script',
  'style',
  'title',
]);

const ALLOWED_STYLE_PROPERTIES = new Set([
  'font-style',
  'font-weight',
  'height',
  'text-align',
  'text-decoration',
  'text-indent',
  'vertical-align',
  'width',
]);

const GLOBAL_ALLOWED_ATTRIBUTES = new Set([
  'align',
  'id',
  'style',
]);

const ANCHOR_ALLOWED_ATTRIBUTES = new Set([
  'href',
]);

const IMAGE_ALLOWED_ATTRIBUTES = new Set([
  'alt',
  'data-plotmapai-image-key',
  'height',
  'width',
]);

const ELEMENT_NODE = 1;
function getLocalName(element: Element): string {
  return (element.localName || element.tagName || '').toLowerCase();
}

function containsNavMarker(value: string | null): boolean {
  return value?.toLowerCase().includes('nav') ?? false;
}

function shouldRemoveElement(element: Element): boolean {
  if (BLOCKED_TAG_NAMES.has(getLocalName(element))) {
    return true;
  }

  return containsNavMarker(element.getAttribute('class'))
    || containsNavMarker(element.getAttribute('id'));
}

function sanitizeStyleAttribute(styleValue: string): string {
  return styleValue
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separatorIndex = declaration.indexOf(':');
      if (separatorIndex === -1) {
        return '';
      }

      const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
      const value = declaration.slice(separatorIndex + 1).trim();
      if (!ALLOWED_STYLE_PROPERTIES.has(property) || value.length === 0) {
        return '';
      }

      return `${property}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');
}

function isAllowedAttribute(element: Element, name: string): boolean {
  const localName = getLocalName(element);

  if (name.startsWith('on')) {
    return false;
  }

  if (GLOBAL_ALLOWED_ATTRIBUTES.has(name)) {
    return true;
  }

  if (localName === 'img' && IMAGE_ALLOWED_ATTRIBUTES.has(name)) {
    return true;
  }

  if (localName === 'a' && ANCHOR_ALLOWED_ATTRIBUTES.has(name)) {
    return true;
  }

  return false;
}

function sanitizeAttributes(element: Element): void {
  const attributes = Array.from(element.attributes);
  for (const attribute of attributes) {
    const name = attribute.name.toLowerCase();
    if (!isAllowedAttribute(element, name)) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (name === 'style') {
      const sanitizedStyle = sanitizeStyleAttribute(attribute.value);
      if (sanitizedStyle.length > 0) {
        element.setAttribute('style', sanitizedStyle);
      } else {
        element.removeAttribute(attribute.name);
      }
      continue;
    }

    if (attribute.value.trim().length === 0) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (getLocalName(element) === 'a' && name === 'href' && !attribute.value.trim().startsWith('#')) {
      element.removeAttribute(attribute.name);
    }
  }
}

function collectDescendantElements(root: Element): Element[] {
  const elements: Element[] = [];
  const queue = Array.from(root.childNodes);

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || next.nodeType !== ELEMENT_NODE) {
      continue;
    }

    const element = next as Element;
    elements.push(element);
    queue.push(...Array.from(element.childNodes));
  }

  return elements;
}

function removeElement(element: Element): void {
  element.parentNode?.removeChild(element);
}

function sanitizeTree(root: Element): void {
  const elements = collectDescendantElements(root);
  for (const element of elements) {
    if (shouldRemoveElement(element)) {
      removeElement(element);
      continue;
    }

    sanitizeAttributes(element);
  }
}

function normalizeMarkupForParsing(html: string): string {
  return html
    .replace(LEADING_BOM_PATTERN, '')
    .replace(LEADING_XML_DECLARATION_PATTERN, '')
    .replace(LEADING_BOM_PATTERN, '');
}

function hasParserError(document: Document): boolean {
  return document.getElementsByTagName('parsererror').length > 0;
}

function parseMarkup(
  html: string,
  mimeType: DOMParserSupportedType,
): Document | null {
  try {
    const parser = createDomParser();
    const document = parser.parseFromString(html, mimeType);
    return hasParserError(document) ? null : document;
  } catch {
    return null;
  }
}

function createDomParser(): DOMParser {
  if (typeof globalThis.DOMParser !== 'undefined') {
    return new globalThis.DOMParser();
  }

  return new XmldomDOMParser({
    onError: () => {},
  }) as unknown as DOMParser;
}

function resolveSanitizedRoot(document: Document): Element {
  const body = document.getElementsByTagName('body')[0];
  if (body) {
    return body;
  }

  return document.documentElement;
}

export function sanitizeEpubHtml(html: string): Element {
  const normalizedMarkup = normalizeMarkupForParsing(html);
  const document = parseMarkup(normalizedMarkup, 'application/xhtml+xml')
    ?? parseMarkup(normalizedMarkup, 'text/html');
  if (!document) {
    throw new Error('Failed to parse EPUB chapter markup');
  }

  const root = resolveSanitizedRoot(document);
  sanitizeTree(root);
  return root;
}
