import JSZip from 'jszip';

interface TestFilePayload {
  buffer: Buffer;
  mimeType: string;
  name: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function createParagraphSeries(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, index) => (
    `<p>${prefix} ${index + 1}. The lantern-lit avenue folded into another rumor, and every footstep stretched the silence a little further.</p>`
  )).join('\n');
}

export const TEST_BOOK_TITLE = 'Smoke Test Atlas';
export const TEST_BOOK_CHAPTER_TITLE = 'Chapter One';

export const LONG_BOOK_TITLE = 'Long Scroll Register';
export const LONG_BOOK_CHAPTER_TITLE = 'Endless Corridor';

export async function buildTestEpubFile(): Promise<TestFilePayload> {
  const title = TEST_BOOK_TITLE;
  const chapterTitle = TEST_BOOK_CHAPTER_TITLE;
  const bodyHtml = [
    `<h1>${chapterTitle}</h1>`,
    '<p>The first sentence of the test book opens beneath a copper sky.</p>',
    '<p>The second paragraph continues the story with quiet deliberation.</p>',
    '<p>A third paragraph completes the minimal chapter structure.</p>',
  ].join('\n');

  return buildEpub(title, [{ id: 'chapter-1', title: chapterTitle, bodyHtml }], 'smoke-test.epub');
}

export async function buildLongTestEpubFile(): Promise<TestFilePayload> {
  const title = LONG_BOOK_TITLE;
  const chapterTitle = LONG_BOOK_CHAPTER_TITLE;
  const bodyHtml = [
    `<h1>${chapterTitle}</h1>`,
    createParagraphSeries('The corridor stretched further than any map admitted', 60),
  ].join('\n');

  return buildEpub(title, [{ id: 'chapter-1', title: chapterTitle, bodyHtml }], 'long-scroll.epub');
}

export function buildTestTxtFile(): TestFilePayload {
  const content = [
    TEST_BOOK_CHAPTER_TITLE,
    '',
    'The first sentence of the test book opens beneath a copper sky.',
    'The second paragraph continues the story with quiet deliberation.',
    'A third paragraph completes the minimal chapter structure.',
  ].join('\n');

  return {
    name: 'smoke-test.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(content, 'utf-8'),
  };
}

interface ChapterInput {
  bodyHtml: string;
  id: string;
  title: string;
}

async function buildEpub(
  title: string,
  chapters: ChapterInput[],
  fileName: string,
): Promise<TestFilePayload> {
  const zip = new JSZip();

  zip.file('META-INF/container.xml', [
    '<?xml version="1.0"?>',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
    '<rootfiles>',
    '<rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>',
    '</rootfiles>',
    '</container>',
  ].join(''));

  const chapterItems = chapters.map((ch) => (
    `<item id="${ch.id}" href="${ch.id}.xhtml" media-type="application/xhtml+xml"/>`
  )).join('\n');
  const spine = chapters.map((ch) => (
    `<itemref idref="${ch.id}"/>`
  )).join('\n');

  zip.file('content.opf', [
    '<?xml version="1.0"?>',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">',
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
    `<dc:title id="bookid">${escapeXml(title)}</dc:title>`,
    '<dc:language>en</dc:language>',
    '</metadata>',
    '<manifest>',
    chapterItems,
    '</manifest>',
    '<spine>',
    spine,
    '</spine>',
    '</package>',
  ].join('\n'));

  for (const chapter of chapters) {
    zip.file(`${chapter.id}.xhtml`, [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<html xmlns="http://www.w3.org/1999/xhtml">',
      '<head>',
      `<title>${escapeXml(chapter.title)}</title>`,
      '<meta charset="utf-8" />',
      '<style>body{font-family:Georgia,serif;line-height:1.7;padding:0 8px;}</style>',
      '</head>',
      '<body>',
      chapter.bodyHtml,
      '</body>',
      '</html>',
    ].join(''));
  }

  const buffer = await zip.generateAsync({ type: 'uint8array' });

  return {
    name: fileName,
    mimeType: 'application/epub+zip',
    buffer: Buffer.from(buffer),
  };
}
