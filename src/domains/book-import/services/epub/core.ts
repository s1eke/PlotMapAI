import JSZip from 'jszip';
import { computeHash } from '@shared/text-processing';
import { stripLeadingChapterTitle } from '@shared/text-processing';
import type { ParsedBook } from '../bookParser';
import type { BookImportProgress } from '../progress';
import { buildTocMap } from './toc';
import { htmlToText } from './htmlToText';
import { extractChapterImages, extractCoverBlob } from './imageExtractor';
import { extractBookMetadata, extractTitleFromHtml, isNonContentPage } from './metadata';
import { loadOpfPackage, resolveOpfPath } from './opf';
import type { ManifestItem } from './types';

export interface ParseEpubOptions {
  signal?: AbortSignal;
  onProgress?: (progress: BookImportProgress) => void;
}

function emitProgress(
  onProgress: ((progress: BookImportProgress) => void) | undefined,
  progress: BookImportProgress,
): void {
  onProgress?.(progress);
}

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted?.();
}

export async function parseEpubCore(
  file: File,
  options: ParseEpubOptions = {},
): Promise<ParsedBook> {
  const { onProgress, signal } = options;

  emitProgress(onProgress, { progress: 5, stage: 'hashing' });
  const fileBuffer = await file.arrayBuffer();
  const fileHashPromise = computeHash(fileBuffer);

  throwIfAborted(signal);
  emitProgress(onProgress, { progress: 15, stage: 'unzipping' });
  const zip = await JSZip.loadAsync(fileBuffer);

  throwIfAborted(signal);
  emitProgress(onProgress, { progress: 30, stage: 'opf' });
  const opfPackage = await loadOpfPackage(zip);
  const { author, description, tags, title } = extractBookMetadata(opfPackage.metadata, file.name);

  throwIfAborted(signal);
  emitProgress(onProgress, { progress: 42, stage: 'toc' });
  const tocMap = await buildTocMap(opfPackage);

  const chapters: Array<{ title: string; content: string }> = [];
  const images: Array<{ imageKey: string; blob: Blob }> = [];
  let chapterIndex = 0;

  const orderedItems = opfPackage.spineIds.length > 0
    ? opfPackage.spineIds
      .map((id) => opfPackage.manifest.get(id))
      .filter((item): item is ManifestItem => Boolean(item))
    : Array.from(opfPackage.manifest.values()).filter((item) =>
      item.mediaType.includes('xhtml') || item.mediaType.includes('html'));

  const totalItems = Math.max(orderedItems.length, 1);
  for (let index = 0; index < orderedItems.length; index += 1) {
    throwIfAborted(signal);
    emitProgress(onProgress, {
      progress: 50 + Math.round((index / totalItems) * 32),
      stage: 'chapters',
    });

    const item = orderedItems[index];
    const chapterFile = zip.file(resolveOpfPath(opfPackage.opfDir, item.href));
    if (!chapterFile) {
      continue;
    }

    let html = '';
    try {
      html = await chapterFile.async('text');
    } catch {
      continue;
    }

    const extracted = await extractChapterImages(html, zip, opfPackage.opfDir);
    images.push(...extracted.images);
    const text = htmlToText(extracted.html);
    if (!text) {
      continue;
    }

    const hrefBase = item.href.split('#')[0];
    let chapterTitle = tocMap.get(hrefBase) || extractTitleFromHtml(extracted.html);
    if (!chapterTitle) {
      chapterIndex += 1;
      chapterTitle = `Chapter ${chapterIndex}`;
    }
    if (isNonContentPage(chapterTitle, item.href)) {
      continue;
    }
    const content = stripLeadingChapterTitle(text, chapterTitle);
    if (!content) {
      continue;
    }

    chapters.push({ title: chapterTitle, content });
  }

  throwIfAborted(signal);
  emitProgress(onProgress, { progress: 86, stage: 'images' });
  const coverBlob = await extractCoverBlob(opfPackage).catch(() => null);

  const normalizedDescription = description && description.includes('<')
    ? htmlToText(description)
    : description;

  throwIfAborted(signal);
  emitProgress(onProgress, { progress: 96, stage: 'finalizing' });
  const fileHash = await fileHashPromise;

  emitProgress(onProgress, { progress: 100, stage: 'finalizing' });
  return {
    title,
    author,
    description: normalizedDescription,
    coverBlob,
    chapters,
    rawText: '',
    encoding: 'utf-8',
    totalWords: chapters.reduce((sum, chapter) => sum + chapter.content.length, 0),
    fileHash,
    tags,
    images,
  };
}
