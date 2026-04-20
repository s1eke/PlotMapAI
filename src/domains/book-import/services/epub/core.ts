import JSZip from 'jszip';
import type { RichBlock } from '@shared/contracts';
import type { PurifyRule } from '@shared/text-processing';
import type { ParsedBook, ParsedChapter } from '../types';
import type { BookImportProgress } from '../progress';
import type { ManifestItem } from './types';

import {
  computeHash,
  projectPlainTextToRichBlocks,
  purify,
  stripLeadingChapterTitle,
} from '@shared/text-processing';
import { buildTocMap } from './toc';
import { epubDomToRichBlocks, getRichBlockText } from './epubDomToRichBlocks';
import { sanitizeEpubHtml } from './epubHtmlSanitizer';
import { purifyEpubDom } from './epubPreAstPurifier';
import { htmlToText } from './htmlToText';
import { extractChapterImages, extractCoverBlob } from './imageExtractor';
import { extractBookMetadata, extractTitleFromHtml, isNonContentPage } from './metadata';
import { loadOpfPackage, resolveOpfPath } from './opf';
import { normalizeRichBlocks } from './richTextNormalizer';
import { richTextToPlainText } from './richTextToPlainText';

export interface ParseEpubOptions {
  purificationRules?: PurifyRule[];
  signal?: AbortSignal;
  onProgress?: (progress: BookImportProgress) => void;
}

function normalizeBlockText(value: string): string {
  return value.replace(/[^\S\n]+/gu, ' ').trim();
}

function shouldStripLeadingTitleBlock(block: RichBlock, title: string): boolean {
  if (block.type !== 'heading' && block.type !== 'paragraph') {
    return false;
  }

  return normalizeBlockText(getRichBlockText(block)) === normalizeBlockText(title);
}

function stripLeadingTitleBlocks(blocks: RichBlock[], title: string): RichBlock[] {
  const normalizedTitle = normalizeBlockText(title);
  if (normalizedTitle.length === 0) {
    return blocks;
  }

  let index = 0;
  while (index < blocks.length && shouldStripLeadingTitleBlock(blocks[index], normalizedTitle)) {
    index += 1;
  }

  return blocks.slice(index);
}

function createFallbackChapter(
  title: string,
  html: string,
  purificationRules: PurifyRule[],
  bookTitle: string,
): ParsedChapter | null {
  const content = purify(
    stripLeadingChapterTitle(htmlToText(html), title),
    purificationRules,
    'text',
    bookTitle,
    'pre-ast',
  );
  if (!content) {
    return null;
  }

  return {
    title,
    content,
    contentFormat: 'rich',
    richBlocks: projectPlainTextToRichBlocks(content),
  };
}

function createRichChapter(
  title: string,
  html: string,
  purificationRules: PurifyRule[],
  bookTitle: string,
): ParsedChapter | null {
  const sanitizedRoot = sanitizeEpubHtml(html);
  purifyEpubDom(sanitizedRoot, purificationRules, bookTitle);
  const richBlocks = normalizeRichBlocks(stripLeadingTitleBlocks(
    epubDomToRichBlocks(sanitizedRoot),
    title,
  ));
  const content = stripLeadingChapterTitle(richTextToPlainText(richBlocks), title);
  if (!content) {
    return null;
  }

  return {
    title,
    content,
    contentFormat: 'rich',
    richBlocks,
  };
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
  const {
    onProgress,
    purificationRules = [],
    signal,
  } = options;

  emitProgress(onProgress, {
    progress: 5,
    stage: 'hashing',
    detail: file.name,
  });
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

  const chapters: ParsedChapter[] = [];
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
      current: index + 1,
      detail: orderedItems[index]?.href,
      progress: 50 + Math.round((index / totalItems) * 32),
      stage: 'chapters',
      total: totalItems,
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
    const hrefBase = item.href.split('#')[0];
    let chapterTitle = tocMap.get(hrefBase) || extractTitleFromHtml(extracted.html);
    if (!chapterTitle) {
      chapterIndex += 1;
      chapterTitle = `Chapter ${chapterIndex}`;
    }
    chapterTitle = purify(
      chapterTitle,
      purificationRules,
      'heading',
      title,
      'pre-ast',
    );
    if (isNonContentPage(chapterTitle, item.href)) {
      continue;
    }

    let chapter: ParsedChapter | null = null;
    try {
      chapter = createRichChapter(chapterTitle, extracted.html, purificationRules, title);
    } catch {
      chapter = createFallbackChapter(chapterTitle, extracted.html, purificationRules, title);
    }

    if (chapter) {
      emitProgress(onProgress, {
        current: index + 1,
        detail: chapter.title,
        progress: 50 + Math.round(((index + 1) / totalItems) * 32),
        stage: 'chapters',
        total: totalItems,
      });
      chapters.push(chapter);
    }
  }

  throwIfAborted(signal);
  emitProgress(onProgress, {
    progress: 86,
    stage: 'images',
    detail: `${images.length} extracted`,
  });
  const coverBlob = await extractCoverBlob(opfPackage).catch(() => null);

  const normalizedDescription = description && description.includes('<')
    ? htmlToText(description)
    : description;

  throwIfAborted(signal);
  emitProgress(onProgress, {
    progress: 96,
    stage: 'finalizing',
    detail: `${chapters.length} chapters`,
  });
  const fileHash = await fileHashPromise;

  emitProgress(onProgress, {
    progress: 100,
    stage: 'finalizing',
    detail: title,
  });
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
