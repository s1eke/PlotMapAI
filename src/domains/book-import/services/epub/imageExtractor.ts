import type JSZip from 'jszip';
import type { ChapterImageRef, OpfPackage } from './types';
import { findTagEnd, getAttribute, parseMarkupTag } from './markup';
import { resolveOpfPath } from './opf';

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

function decodeBase64(data: string): ArrayBuffer {
  const binary = atob(data);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

function decodeDataUriText(data: string): ArrayBuffer {
  const text = decodeURIComponent(data);
  const encoded = new TextEncoder().encode(text);
  const buffer = new ArrayBuffer(encoded.length);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

function extractInlineImageBlob(src: string): Blob | null {
  const separatorIndex = src.indexOf(',');
  if (separatorIndex === -1) {
    return null;
  }

  const meta = src.slice(0, separatorIndex);
  const data = src.slice(separatorIndex + 1);
  const mime = meta.match(/^data:([^;,]+)/u)?.[1] || 'image/png';
  const isBase64 = /;base64(?:;|$)/iu.test(meta);

  try {
    const payload = isBase64 ? decodeBase64(data) : decodeDataUriText(data);
    return new Blob([payload], { type: mime });
  } catch {
    return null;
  }
}

export async function extractChapterImages(
  html: string,
  zip: JSZip,
  opfDir: string,
): Promise<{ html: string; images: ChapterImageRef[] }> {
  const images: ChapterImageRef[] = [];
  let transformedHtml = '';
  let index = 0;

  while (index < html.length) {
    const tagStart = html.indexOf('<', index);
    if (tagStart === -1) {
      transformedHtml += html.slice(index);
      break;
    }

    transformedHtml += html.slice(index, tagStart);
    const tagEnd = findTagEnd(html, tagStart);
    if (tagEnd === -1) {
      transformedHtml += html.slice(tagStart);
      break;
    }

    const originalTag = html.slice(tagStart, tagEnd + 1);
    const parsedTag = parseMarkupTag(html.slice(tagStart + 1, tagEnd));
    if (!parsedTag || parsedTag.isSpecial || parsedTag.isClosing || parsedTag.localName !== 'img') {
      transformedHtml += originalTag;
      index = tagEnd + 1;
      continue;
    }

    const src = getAttribute(parsedTag.attributes, 'src');
    if (!src || src.startsWith('http:') || src.startsWith('https:')) {
      transformedHtml += originalTag;
      index = tagEnd + 1;
      continue;
    }

    if (src.startsWith('data:')) {
      const blob = extractInlineImageBlob(src);
      if (!blob) {
        transformedHtml += originalTag;
        index = tagEnd + 1;
        continue;
      }

      const key = generateImageKey();
      images.push({ imageKey: key, blob });
      transformedHtml += `[IMG:${key}]`;
      index = tagEnd + 1;
      continue;
    }

    const fullPath = resolveOpfPath(opfDir, src);
    const file = zip.file(fullPath);
    if (!file) {
      transformedHtml += originalTag;
      index = tagEnd + 1;
      continue;
    }

    try {
      const buffer = await file.async('arraybuffer');
      const key = generateImageKey();
      images.push({ imageKey: key, blob: new Blob([buffer], { type: getImageMimeType(fullPath) }) });
      transformedHtml += `[IMG:${key}]`;
    } catch {
      transformedHtml += originalTag;
    }

    index = tagEnd + 1;
  }

  return { html: transformedHtml, images };
}

export async function extractCoverBlob(opfPackage: OpfPackage): Promise<Blob | null> {
  const { manifest, metadata, opfDir, zip } = opfPackage;
  const imageItems = Array.from(manifest.values()).filter(item => item.mediaType.startsWith('image/'));
  let coverItem = undefined as (typeof imageItems)[number] | undefined;

  if (metadata.coverId) coverItem = manifest.get(metadata.coverId);

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
