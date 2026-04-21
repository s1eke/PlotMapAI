import type { OpfPackage } from './types';
import { extractTextContent, findElements, getAttribute } from './markup';
import { resolveOpfPath } from './opf';

function isHtmlManifestItem(mediaType: string): boolean {
  return mediaType.includes('xhtml') || mediaType.includes('html');
}

function addTocEntries(
  tocMap: Map<string, string>,
  entries: Array<{ href: string; title: string }>,
): void {
  for (const entry of entries) {
    if (entry.href && entry.title && !tocMap.has(entry.href)) {
      tocMap.set(entry.href, entry.title);
    }
  }
}

function parseNcxEntries(ncxXml: string): Array<{ href: string; title: string }> {
  return findElements(ncxXml, 'navPoint')
    .map((navPoint) => {
      const title = extractTextContent(findElements(navPoint.innerContent, 'text')[0]?.innerContent || '');
      const href = getAttribute(
        findElements(navPoint.innerContent, 'content')[0]?.attributes || {},
        'src',
      ).split('#')[0];
      return { href, title };
    })
    .filter((entry) => Boolean(entry.href) && Boolean(entry.title));
}

function parseNavEntries(navXml: string): Array<{ href: string; title: string }> {
  const entries: Array<{ href: string; title: string }> = [];

  for (const nav of findElements(navXml, 'nav')) {
    if (getAttribute(nav.attributes, 'type').toLowerCase() !== 'toc') {
      continue;
    }

    for (const link of findElements(nav.innerContent, 'a')) {
      const href = getAttribute(link.attributes, 'href').split('#')[0];
      const title = extractTextContent(link.innerContent);
      if (href && title) {
        entries.push({ href, title });
      }
    }
  }

  return entries;
}

export async function buildTocMap(opfPackage: OpfPackage): Promise<Map<string, string>> {
  const tocMap = new Map<string, string>();
  const { guideReferences, manifest, opfDir, spineTocId, zip } = opfPackage;

  let ncxPath = '';
  if (spineTocId) {
    const ncxHref = manifest.get(spineTocId)?.href || '';
    if (ncxHref) ncxPath = resolveOpfPath(opfDir, ncxHref);
  }

  if (ncxPath) {
    const ncxFile = zip.file(ncxPath);
    if (ncxFile) {
      try {
        const ncxXml = await ncxFile.async('text');
        addTocEntries(tocMap, parseNcxEntries(ncxXml));
      } catch {
        // 忽略无效的 ncx
      }
    }
  }

  if (tocMap.size === 0) {
    const navItem = Array.from(manifest.values())
      .find((item) => item.properties.split(/\s+/u).includes('nav'));
    const navHref = navItem?.href || '';
    const navPath = navHref ? resolveOpfPath(opfDir, navHref) : '';
    if (navPath) {
      const navFile = zip.file(navPath);
      if (navFile) {
        try {
          const navXml = await navFile.async('text');
          addTocEntries(tocMap, parseNavEntries(navXml));
        } catch {
          // 忽略无效的 nav 文档
        }
      }
    }
  }

  addTocEntries(tocMap, guideReferences);

  if (tocMap.size === 0) {
    for (const item of manifest.values()) {
      if (isHtmlManifestItem(item.mediaType)) {
        tocMap.set(item.href.split('#')[0], item.href);
      }
    }
  }

  return tocMap;
}
