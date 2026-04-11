import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '@shared/errors';

const { mockEpubDomToRichBlocks, mockRunParseEpubTask } = vi.hoisted(() => ({
  mockEpubDomToRichBlocks: vi.fn(),
  mockRunParseEpubTask: vi.fn(),
}));

const mockDigest = vi.fn().mockResolvedValue(new ArrayBuffer(32));
Object.defineProperty(globalThis, 'crypto', {
  value: { subtle: { digest: mockDigest } },
  writable: true,
});

vi.mock('../epub/epubDomToRichBlocks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../epub/epubDomToRichBlocks')>();
  mockEpubDomToRichBlocks.mockImplementation(actual.epubDomToRichBlocks);
  return {
    ...actual,
    epubDomToRichBlocks: mockEpubDomToRichBlocks,
  };
});

vi.mock('../../workers/epubClient', () => ({
  runParseEpubTask: mockRunParseEpubTask,
}));

import { parseEpubCore } from '../epub/core';
import { parseEpub } from '../epub/parser';

async function makeEpubFile(zip: JSZip, name: string): Promise<File> {
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buffer], name, { type: 'application/epub+zip' });
}

describe('parseEpub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunParseEpubTask.mockResolvedValue({
      title: 'Worker Parsed',
      author: 'Author',
      description: '',
      coverBlob: null,
      chapters: [],
      rawText: '',
      encoding: 'utf-8',
      totalWords: 0,
      fileHash: 'hash',
      tags: [],
      images: [],
    });
  });

  it('delegates EPUB parsing to the worker client with progress, abort, and purification options', async () => {
    const file = new File(['epub'], 'book.epub', { type: 'application/epub+zip' });
    const controller = new AbortController();
    const onProgress = vi.fn();
    const purificationRules = [{
      pattern: 'foo',
      replacement: 'bar',
      is_regex: false,
      target_scope: 'text' as const,
      execution_stage: 'pre-ast' as const,
    }];

    const result = await parseEpub(file, {
      signal: controller.signal,
      onProgress,
      purificationRules,
    });

    expect(result).toMatchObject({ title: 'Worker Parsed' });
    expect(mockRunParseEpubTask).toHaveBeenCalledWith({
      file,
      purificationRules,
    }, {
      signal: controller.signal,
      onProgress,
    });
  });

  it('propagates AbortError from the worker client', async () => {
    const file = new File(['epub'], 'book.epub', { type: 'application/epub+zip' });
    mockRunParseEpubTask.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));

    await expect(parseEpub(file)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('propagates WORKER_UNAVAILABLE from the worker client', async () => {
    const file = new File(['epub'], 'book.epub', { type: 'application/epub+zip' });
    mockRunParseEpubTask.mockRejectedValueOnce({
      code: AppErrorCode.WORKER_UNAVAILABLE,
      kind: 'unsupported',
      source: 'book-import',
      userMessageKey: 'errors.WORKER_UNAVAILABLE',
    });

    await expect(parseEpub(file)).rejects.toMatchObject({
      code: AppErrorCode.WORKER_UNAVAILABLE,
      userMessageKey: 'errors.WORKER_UNAVAILABLE',
    });
  });
});

describe('parseEpubCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when container.xml is missing', async () => {
    const zip = new JSZip();
    zip.file('dummy.txt', 'not an epub');
    const file = await makeEpubFile(zip, 'bad.epub');
    await expect(parseEpubCore(file)).rejects.toThrow('container.xml');
  });

  it('returns a ParsedBook structure for valid epub', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
    zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title id="uid">Test Book</dc:title>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1"/>
  </spine>
</package>`);
    zip.file('ch1.xhtml', `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Some text content.</p></body></html>`);

    const file = await makeEpubFile(zip, 'test.epub');
    const result = await parseEpubCore(file);

    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('author');
    expect(result).toHaveProperty('chapters');
    expect(result).toHaveProperty('fileHash');
    expect(result).toHaveProperty('totalWords');
    expect(result).toHaveProperty('tags');
    expect(result).toHaveProperty('images');
    expect(result.fileHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.chapters[0]).toMatchObject({
      content: 'Some text content.',
      contentFormat: 'rich',
      richBlocks: [{
        type: 'paragraph',
        children: [{
          type: 'text',
          text: 'Some text content.',
        }],
      }],
    });
  });

  it('falls back to filename when title cannot be extracted', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
    zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata></metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`);
    zip.file('ch1.xhtml', `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body><p>text</p></body></html>`);

    const file = await makeEpubFile(zip, 'MyNovel.epub');
    const result = await parseEpubCore(file);
    expect(result.title).toBe('MyNovel');
  });

  it('returns empty chapters array when spine has no items', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
    zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata><title>Empty</title></metadata>
  <manifest></manifest>
  <spine></spine>
</package>`);

    const file = await makeEpubFile(zip, 'empty.epub');
    const result = await parseEpubCore(file);
    expect(result.chapters).toEqual([]);
  });

  it('strips a duplicated chapter heading from epub body content', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
    zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title id="uid">Test Book</dc:title>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1"/>
  </spine>
</package>`);
    zip.file('toc.ncx', `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="navPoint-1" playOrder="1">
      <navLabel><text>Chapter 1</text></navLabel>
      <content src="ch1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`);
    zip.file(
      'ch1.xhtml',
      `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <h1>Chapter 1</h1>
    <p>Body paragraph.</p>
  </body>
</html>`,
    );

    const file = await makeEpubFile(zip, 'test.epub');
    const result = await parseEpubCore(file);

    expect(result.chapters).toEqual([
      {
        title: 'Chapter 1',
        content: 'Body paragraph.',
        contentFormat: 'rich',
        richBlocks: [{
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'Body paragraph.',
          }],
        }],
      },
    ]);
  });

  it('applies pre-ast purification rules during epub parsing', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
    zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title id="uid">Test Book</dc:title>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1"/>
  </spine>
</package>`);
    zip.file('toc.ncx', `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="navPoint-1" playOrder="1">
      <navLabel><text>Chapter 1</text></navLabel>
      <content src="ch1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`);
    zip.file(
      'ch1.xhtml',
      `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <h1>Chapter 1</h1>
    <p>foo body</p>
    <figure>
      <img data-plotmapai-image-key="img_1" />
      <figcaption>Caption text</figcaption>
    </figure>
  </body>
</html>`,
    );

    const file = await makeEpubFile(zip, 'pre-ast.epub');
    const result = await parseEpubCore(file, {
      purificationRules: [
        {
          pattern: 'Chapter',
          replacement: 'Section',
          is_regex: false,
          target_scope: 'heading',
          execution_stage: 'pre-ast',
        },
        {
          pattern: 'foo',
          replacement: 'bar',
          is_regex: false,
          target_scope: 'text',
          execution_stage: 'pre-ast',
        },
        {
          pattern: 'Caption',
          replacement: 'Legend',
          is_regex: false,
          target_scope: 'caption',
          execution_stage: 'pre-ast',
        },
      ],
    });

    expect(result.chapters).toEqual([
      {
        title: 'Section 1',
        content: 'bar body\n\nLegend text',
        contentFormat: 'rich',
        richBlocks: [
          {
            type: 'paragraph',
            children: [{
              type: 'text',
              text: 'bar body',
            }],
          },
          {
            type: 'image',
            key: 'img_1',
            caption: [{
              type: 'text',
              text: 'Legend text',
            }],
          },
        ],
      },
    ]);
  });

  it('extracts packaged chapter images into rich image blocks', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
    zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title id="uid">Image Book</dc:title>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="img1" href="images/harbor-map.svg" media-type="image/svg+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`);
    zip.file('toc.ncx', `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="navPoint-1" playOrder="1">
      <navLabel><text>Harbor Map</text></navLabel>
      <content src="ch1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`);
    zip.file('ch1.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>Harbor Map</title>
    <meta charset="utf-8" />
    <style>body{font-family:Georgia,serif;line-height:1.7;padding:0 8px;}img{max-width:100%;height:auto;}figure{margin:1.5rem 0;}figcaption{font-size:0.95rem;color:#555;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #999;padding:6px 8px;}blockquote{border-left:3px solid #999;padding-left:12px;color:#444;}</style>
  </head>
  <body>
    <h1>Harbor Map</h1>
    <p>Before the chart.</p>
    <figure>
      <img src="images/harbor-map.svg" alt="Harbor map" />
      <figcaption>Chart caption</figcaption>
    </figure>
  </body>
</html>`);
    zip.file(
      'images/harbor-map.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="120" height="80" fill="#28536b" /></svg>',
    );

    const file = await makeEpubFile(zip, 'image-book.epub');
    const result = await parseEpubCore(file);

    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.blob.type).toBe('image/svg+xml');
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]).toMatchObject({
      contentFormat: 'rich',
      richBlocks: [
        {
          type: 'heading',
          children: [{
            type: 'text',
            text: 'Harbor Map',
          }],
        },
        {
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'Before the chart.',
          }],
        },
        {
          type: 'image',
          key: result.images[0]!.imageKey,
          alt: 'Harbor map',
          caption: [{
            type: 'text',
            text: 'Chart caption',
          }],
        },
      ],
    });
  });

  it('uses the bundled parser fallback when DOMParser is unavailable in the worker environment', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
    zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title id="uid">Fallback Parser</dc:title>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`);
    zip.file('ch1.xhtml', `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <p id="intro">Worker rich content.</p>
    <hr />
  </body>
</html>`);

    const file = await makeEpubFile(zip, 'fallback-parser.epub');
    const originalDomParser = globalThis.DOMParser;
    Object.defineProperty(globalThis, 'DOMParser', {
      configurable: true,
      value: undefined,
    });

    let result;
    try {
      result = await parseEpubCore(file);
    } finally {
      Object.defineProperty(globalThis, 'DOMParser', {
        configurable: true,
        value: originalDomParser,
      });
    }

    expect(result.chapters).toEqual([{
      title: 'ch1.xhtml',
      content: 'Worker rich content.\n\n---',
      contentFormat: 'rich',
      richBlocks: [
        {
          type: 'paragraph',
          anchorId: 'intro',
          children: [{
            type: 'text',
            text: 'Worker rich content.',
          }],
        },
        {
          type: 'hr',
        },
      ],
    }]);
  });

  it('falls back to structured paragraph projection when rich parsing throws for a chapter', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
    zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title id="uid">Fallback Book</dc:title>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`);
    zip.file('ch1.xhtml', `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <p>Fallback paragraph.</p>
  </body>
</html>`);

    const file = await makeEpubFile(zip, 'fallback.epub');
    const originalDomParser = globalThis.DOMParser;
    Object.defineProperty(globalThis, 'DOMParser', {
      configurable: true,
      value: class MockDomParser {
        parseFromString(): never {
          throw new Error('boom');
        }
      },
    });

    let result;
    try {
      result = await parseEpubCore(file);
    } finally {
      Object.defineProperty(globalThis, 'DOMParser', {
        configurable: true,
        value: originalDomParser,
      });
    }

    expect(result.chapters).toEqual([{
      title: 'ch1.xhtml',
      content: 'Fallback paragraph.',
      contentFormat: 'rich',
      richBlocks: [{
        type: 'paragraph',
        children: [{
          type: 'text',
          text: 'Fallback paragraph.',
        }],
      }],
    }]);
  });

  it('emits chapter-level epub progress details for import UIs', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
    zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title id="uid">Progress Book</dc:title>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`);
    zip.file('ch1.xhtml', `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Chapter one.</p></body></html>`);
    zip.file('ch2.xhtml', `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Chapter two.</p></body></html>`);

    const onProgress = vi.fn();
    const file = await makeEpubFile(zip, 'progress.epub');

    await parseEpubCore(file, { onProgress });

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'chapters',
      current: 1,
      total: 2,
      detail: expect.any(String),
    }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'chapters',
      current: 2,
      total: 2,
      detail: expect.any(String),
    }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'finalizing',
      detail: 'Progress Book',
      progress: 100,
    }));
  });
});
