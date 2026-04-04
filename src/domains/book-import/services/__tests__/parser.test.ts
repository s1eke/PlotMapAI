import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

const { mockEpubDomToRichBlocks } = vi.hoisted(() => ({
  mockEpubDomToRichBlocks: vi.fn(),
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

import { parseEpubCore } from '../epub/core';
import { parseEpub } from '../epub/parser';

async function makeEpubFile(zip: JSZip, name: string): Promise<File> {
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buffer], name, { type: 'application/epub+zip' });
}

describe('parseEpub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when container.xml is missing', async () => {
    const zip = new JSZip();
    zip.file('dummy.txt', 'not an epub');
    const file = await makeEpubFile(zip, 'bad.epub');
    await expect(parseEpub(file)).rejects.toThrow('container.xml');
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
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`);
    zip.file('ch1.xhtml', `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Some text content.</p></body></html>`);

    const file = await makeEpubFile(zip, 'test.epub');
    const result = await parseEpub(file);

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
    const result = await parseEpub(file);
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
    const result = await parseEpub(file);
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
    const result = await parseEpub(file);

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

  it('falls back to plain chapter projection when rich parsing throws for a chapter', async () => {
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
      contentFormat: 'plain',
      richBlocks: [],
    }]);
  });
});
