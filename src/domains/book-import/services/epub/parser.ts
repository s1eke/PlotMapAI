import JSZip from 'jszip';
import type { ParsedBook } from '../bookParser';
import { buildTocMap } from './toc';
import { htmlToText } from './htmlToText';
import { extractChapterImages, extractCoverBlob } from './imageExtractor';
import { extractBookMetadata, extractTitleFromHtml, isNonContentPage } from './metadata';
import { loadOpfPackage, resolveOpfPath } from './opf';
import type { ManifestItem } from './types';

async function fileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function parseEpub(file: File): Promise<ParsedBook> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const opfPackage = await loadOpfPackage(zip);
  const { author, description, tags, title } = extractBookMetadata(opfPackage.opfDoc, file.name);
  const tocMap = await buildTocMap(opfPackage);
  const chapters: Array<{ title: string; content: string }> = [];
  const images: Array<{ imageKey: string; blob: Blob }> = [];
  let chapterIndex = 0;

  const orderedItems = opfPackage.spineIds.length > 0
    ? opfPackage.spineIds
        .map(id => opfPackage.manifest.get(id))
        .filter((item): item is ManifestItem => Boolean(item))
    : Array.from(opfPackage.manifest.values()).filter(item =>
        item.mediaType.includes('xhtml') || item.mediaType.includes('html'),
      );

  for (const item of orderedItems) {
    const chapterFile = zip.file(resolveOpfPath(opfPackage.opfDir, item.href));
    if (!chapterFile) continue;

    let html = '';
    try {
      html = await chapterFile.async('text');
    } catch {
      continue;
    }

    const extracted = await extractChapterImages(html, zip, opfPackage.opfDir);
    images.push(...extracted.images);
    const text = htmlToText(extracted.html);
    if (!text) continue;

    const hrefBase = item.href.split('#')[0];
    let chapterTitle = tocMap.get(hrefBase) || extractTitleFromHtml(extracted.html);
    if (!chapterTitle) {
      chapterIndex += 1;
      chapterTitle = `Chapter ${chapterIndex}`;
    }
    if (isNonContentPage(chapterTitle, item.href)) continue;
    chapters.push({ title: chapterTitle, content: text });
  }

  const normalizedDescription = description && description.includes('<')
    ? htmlToText(description)
    : description;

  return {
    title,
    author,
    description: normalizedDescription,
    coverBlob: await extractCoverBlob(opfPackage).catch(() => null),
    chapters,
    rawText: '',
    encoding: 'utf-8',
    totalWords: chapters.reduce((sum, chapter) => sum + chapter.content.length, 0),
    fileHash: await fileHash(file),
    tags,
    images,
  };
}
