import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { loadOpfPackage, resolveOpfPath } from '../epub/opf';

describe('loadOpfPackage', () => {
  it('throws when container.xml is missing', async () => {
    const zip = new JSZip();
    zip.file('dummy.txt', 'not an epub');
    await expect(loadOpfPackage(zip)).rejects.toThrow('container.xml');
  });

  it('throws when rootfile is missing from container.xml', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles />
</container>`);
    await expect(loadOpfPackage(zip)).rejects.toThrow('No rootfile element');
  });

  it('loads manifest, spine, and opf directory metadata', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
    zip.file('OPS/content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`);

    const opfPackage = await loadOpfPackage(zip);

    expect(opfPackage.opfDir).toBe('OPS');
    expect(opfPackage.spineIds).toEqual(['ch1']);
    expect(opfPackage.manifest.get('ch1')?.href).toBe('chapter1.xhtml');
  });
});

describe('resolveOpfPath', () => {
  it('joins relative paths against the opf directory and strips anchors', () => {
    expect(resolveOpfPath('OPS', 'images/cover.jpg#frag')).toBe('OPS/images/cover.jpg');
    expect(resolveOpfPath('', 'chapter.xhtml#frag')).toBe('chapter.xhtml');
  });
});
