import type { ParsedBook } from './bookParser';
import { debugLog } from '@app/debug/service';

import { detectAndConvert } from './encoding';
import { detectChapters, splitByChapters } from './chapterDetector';

async function computeHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function parseTxt(
  file: File,
  tocRules: Array<{ rule: string }>,
): Promise<ParsedBook> {
  const rawBytes = await file.arrayBuffer();
  const { text: rawText, encoding } = detectAndConvert(rawBytes);
  debugLog('TXT', `encoding=${encoding}, text length=${rawText.length}`);

  let title = file.name;
  if (title.toLowerCase().endsWith('.txt')) {
    title = title.slice(0, -4);
  }

  const chaptersInfo = detectChapters(rawText, tocRules);
  debugLog('TXT', `detected ${chaptersInfo.length} chapter headings`);
  const chapters = splitByChapters(rawText, chaptersInfo);
  debugLog('TXT', `split into ${chapters.length} chapters`);
  const logCount = Math.min(chapters.length, 5);
  for (let i = 0; i < logCount; i++) {
    debugLog('TXT', `  ch[${i}]: "${chapters[i].title}" (${chapters[i].content.length} chars)`);
  }
  if (chapters.length > 10) debugLog('TXT', `  ... ${chapters.length - 10} more chapters ...`);
  for (let i = Math.max(logCount, chapters.length - 5); i < chapters.length; i++) {
    if (i < logCount) continue;
    debugLog('TXT', `  ch[${i}]: "${chapters[i].title}" (${chapters[i].content.length} chars)`);
  }

  const totalWords = chapters.reduce((sum, ch) => sum + ch.content.length, 0);
  const fileHash = await computeHash(rawBytes);

  return {
    title,
    author: '',
    description: '',
    coverBlob: null,
    chapters,
    rawText,
    encoding,
    totalWords,
    fileHash,
    tags: [],
    images: [],
  };
}
