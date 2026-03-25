import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

const mockDigest = vi.fn().mockResolvedValue(new ArrayBuffer(32));
Object.defineProperty(globalThis, 'crypto', {
  value: { subtle: { digest: mockDigest } },
  writable: true,
});

import { parseEpub } from '../epub/parser';

async function makeEpubFile(zip: JSZip, name: string): Promise<File> {
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buffer], name, { type: 'application/epub+zip' });
}

describe('parseEpub', () => {
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
});
