import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { loadOpfPackage } from '../epub/opf';
import { buildTocMap } from '../epub/toc';

async function createOpfPackage(opfXml: string, extraFiles: Record<string, string>): Promise<Awaited<ReturnType<typeof loadOpfPackage>>> {
  const zip = new JSZip();
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
  zip.file('content.opf', opfXml);
  for (const [path, content] of Object.entries(extraFiles)) {
    zip.file(path, content);
  }
  return loadOpfPackage(zip);
}

describe('buildTocMap', () => {
  it('reads titles from an NCX file', async () => {
    const opfPackage = await createOpfPackage(`<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1"/>
  </spine>
</package>`, {
      'toc.ncx': `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <navMap>
    <navPoint id="nav1">
      <navLabel><text>Chapter One</text></navLabel>
      <content src="chapter1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`,
    });

    const tocMap = await buildTocMap(opfPackage);
    expect(tocMap.get('chapter1.xhtml')).toBe('Chapter One');
  });

  it('falls back to the EPUB3 nav document when ncx is unavailable', async () => {
    const opfPackage = await createOpfPackage(`<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`, {
      'nav.xhtml': `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <ol><li><a href="chapter1.xhtml">Nav Title</a></li></ol>
    </nav>
  </body>
</html>`,
    });

    const tocMap = await buildTocMap(opfPackage);
    expect(tocMap.get('chapter1.xhtml')).toBe('Nav Title');
  });

  it('falls back to guide references when ncx and nav are unavailable', async () => {
    const opfPackage = await createOpfPackage(`<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
  <guide>
    <reference type="text" title="Guide Title" href="chapter1.xhtml"/>
  </guide>
</package>`, {});

    const tocMap = await buildTocMap(opfPackage);
    expect(tocMap.get('chapter1.xhtml')).toBe('Guide Title');
  });
});
