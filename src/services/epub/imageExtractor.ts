import type JSZip from 'jszip';
import type { ChapterImageRef, OpfPackage } from './types';
import { getChildElements, getPackageChild, resolveOpfPath } from './opf';

let imageCounter = 0;

function generateImageKey(): string {
  return `img_${Date.now()}_${imageCounter++}`;
}

function getImageMimeType(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() || '';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'svg') return 'image/svg+xml';
  if (extension === 'webp') return 'image/webp';
  return 'image/png';
}

export async function extractChapterImages(
  html: string,
  zip: JSZip,
  opfDir: string,
): Promise<{ html: string; images: ChapterImageRef[] }> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const images: ChapterImageRef[] = [];

  for (const image of doc.querySelectorAll('img')) {
    const src = image.getAttribute('src') || '';
    if (!src || src.startsWith('http:') || src.startsWith('https:')) continue;
    if (src.startsWith('data:')) {
      const key = generateImageKey();
      const [meta, data] = src.split(',');
      const mime = meta.match(/data:([^;]+)/)?.[1] || 'image/png';
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      images.push({ imageKey: key, blob: new Blob([bytes], { type: mime }) });
      image.replaceWith(doc.createTextNode(`[IMG:${key}]`));
      continue;
    }

    const fullPath = resolveOpfPath(opfDir, src);
    const file = zip.file(fullPath);
    if (!file) continue;
    try {
      const buffer = await file.async('arraybuffer');
      const key = generateImageKey();
      images.push({ imageKey: key, blob: new Blob([buffer], { type: getImageMimeType(fullPath) }) });
      image.replaceWith(doc.createTextNode(`[IMG:${key}]`));
    } catch {
      // skip unreadable images
    }
  }

  return { html: doc.documentElement.outerHTML, images };
}

export async function extractCoverBlob(opfPackage: OpfPackage): Promise<Blob | null> {
  const { manifest, opfDir, opfDoc, zip } = opfPackage;
  const imageItems = Array.from(manifest.values()).filter(item => item.mediaType.startsWith('image/'));
  let coverItem = undefined as (typeof imageItems)[number] | undefined;

  const coverMeta = getChildElements(getPackageChild(opfDoc, 'metadata'), 'meta')
    .find(element => element.getAttribute('name') === 'cover') || null;
  const coverId = coverMeta?.getAttribute('content') || '';
  if (coverId) coverItem = manifest.get(coverId);

  if (!coverItem) {
    coverItem = imageItems.find(item => {
      const href = item.href.toLowerCase();
      const id = item.id.toLowerCase();
      return href.includes('cover') || id.includes('cover');
    });
  }
  if (!coverItem) coverItem = imageItems[0];
  if (!coverItem) return null;

  const file = zip.file(resolveOpfPath(opfDir, coverItem.href));
  if (!file) return null;
  const data = await file.async('arraybuffer');
  return new Blob([data], { type: coverItem.mediaType });
}
