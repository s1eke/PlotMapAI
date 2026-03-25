import type JSZip from 'jszip';
import type { ManifestItem, OpfPackage } from './types';

export function resolveOpfPath(opfDir: string, path: string): string {
  const cleanPath = path.split('#')[0];
  if (opfDir) return `${opfDir}/${cleanPath}`;
  return cleanPath;
}

export function getPackageChild(doc: Document, localName: string): Element | null {
  return Array.from(doc.documentElement.children).find(element => element.localName === localName) || null;
}

export function getChildElements(parent: Element | null, localName: string): Element[] {
  if (!parent) return [];
  return Array.from(parent.children).filter(element => element.localName === localName);
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

function getManifest(doc: Document): Map<string, ManifestItem> {
  const items = new Map<string, ManifestItem>();
  for (const element of getChildElements(getPackageChild(doc, 'manifest'), 'item')) {
    const id = element.getAttribute('id') || '';
    const href = element.getAttribute('href') || '';
    const mediaType = element.getAttribute('media-type') || '';
    if (id && href) items.set(id, { id, href, mediaType });
  }
  return items;
}

function getSpineItemIds(doc: Document): string[] {
  return getChildElements(getPackageChild(doc, 'spine'), 'itemref')
    .map(element => element.getAttribute('idref'))
    .filter((idref): idref is string => Boolean(idref));
}

export async function loadOpfPackage(zip: JSZip): Promise<OpfPackage> {
  const opfPath = await getOpfPath(zip);
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`OPF file not found: ${opfPath}`);
  const opfXml = await opfFile.async('text');
  const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');
  return {
    zip,
    opfPath,
    opfDir,
    opfDoc,
    manifest: getManifest(opfDoc),
    spineIds: getSpineItemIds(opfDoc),
  };
}
