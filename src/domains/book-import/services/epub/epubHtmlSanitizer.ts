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
  'style',
]);

const IMAGE_ALLOWED_ATTRIBUTES = new Set([
  'alt',
  'data-plotmapai-image-key',
  'height',
  'width',
]);

function containsNavMarker(value: string | null): boolean {
  return value?.toLowerCase().includes('nav') ?? false;
}

function shouldRemoveElement(element: Element): boolean {
  if (BLOCKED_TAG_NAMES.has(element.localName)) {
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
  if (name.startsWith('on')) {
    return false;
  }

  if (GLOBAL_ALLOWED_ATTRIBUTES.has(name)) {
    return true;
  }

  if (element.localName === 'img' && IMAGE_ALLOWED_ATTRIBUTES.has(name)) {
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
    }
  }
}

function sanitizeTree(root: Element): void {
  const elements = Array.from(root.querySelectorAll('*'));
  for (const element of elements) {
    if (shouldRemoveElement(element)) {
      element.remove();
      continue;
    }

    sanitizeAttributes(element);
  }
}

function parseMarkup(parser: DOMParser, html: string, mimeType: DOMParserSupportedType): Document {
  return parser.parseFromString(html, mimeType);
}

function resolveSanitizedRoot(document: Document): Element {
  const body = document.querySelector('body');
  if (body) {
    return body;
  }

  return document.documentElement;
}

export function sanitizeEpubHtml(html: string): Element {
  const parser = new DOMParser();
  let document = parseMarkup(parser, html, 'application/xhtml+xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    document = parseMarkup(parser, html, 'text/html');
  }

  const root = resolveSanitizedRoot(document);
  sanitizeTree(root);
  return root;
}
