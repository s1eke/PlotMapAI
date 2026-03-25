import type { OpfPackage } from './types';
import { getChildElements, getPackageChild, resolveOpfPath } from './opf';

export async function buildTocMap(opfPackage: OpfPackage): Promise<Map<string, string>> {
  const tocMap = new Map<string, string>();
  const { manifest, opfDir, opfDoc, zip } = opfPackage;

  let ncxPath = '';
  const spine = getPackageChild(opfDoc, 'spine');
  const ncxId = spine?.getAttribute('toc') || '';
  if (ncxId) {
    const ncxHref = manifest.get(ncxId)?.href || '';
    if (ncxHref) ncxPath = resolveOpfPath(opfDir, ncxHref);
  }

  if (ncxPath) {
    const ncxFile = zip.file(ncxPath);
    if (ncxFile) {
      try {
        const ncxXml = await ncxFile.async('text');
        const ncxDoc = new DOMParser().parseFromString(ncxXml, 'application/xml');
        const navPoints = ncxDoc.querySelectorAll('navPoint');
        for (const navPoint of navPoints) {
          const title = navPoint.querySelector('text')?.textContent?.trim() || '';
          const src = navPoint.querySelector('content')?.getAttribute('src') || '';
          const href = src.split('#')[0];
          if (title && href && !tocMap.has(href)) tocMap.set(href, title);
        }
      } catch {
        // ignore invalid ncx
      }
    }
  }

  if (tocMap.size === 0) {
    const navItem = getChildElements(getPackageChild(opfDoc, 'manifest'), 'item')
      .find(item => item.getAttribute('properties') === 'nav') || null;
    const navHref = navItem?.getAttribute('href') || '';
    const navPath = navHref ? resolveOpfPath(opfDir, navHref) : '';
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
        } catch {
          // ignore invalid nav document
        }
      }
    }
  }

  for (const element of getChildElements(getPackageChild(opfDoc, 'guide'), 'reference')) {
    const href = element.getAttribute('href')?.split('#')[0] || '';
    const title = element.getAttribute('title') || '';
    if (href && title && !tocMap.has(href)) tocMap.set(href, title);
  }

  if (tocMap.size === 0) {
    for (const item of manifest.values()) {
      if (item.mediaType.includes('xhtml') || item.mediaType.includes('html')) {
        tocMap.set(item.href.split('#')[0], item.href);
      }
    }
  }

  return tocMap;
}
