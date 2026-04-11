import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import { extractChapterImages, extractCoverBlob } from '../epub/imageExtractor';
import { loadOpfPackage } from '../epub/opf';

describe('extractChapterImages', () => {
  it('extracts data-uri images and rewrites them as keyed img tags', async () => {
    const zip = new JSZip();
    const extracted = await extractChapterImages(
      '<html><body><img src="data:image/png;base64,aGVsbG8=" alt="Cover" width="640" style="width: 640px" /></body></html>',
      zip,
      '',
    );

    expect(extracted.images).toHaveLength(1);
    const document = new DOMParser().parseFromString(extracted.html, 'text/html');
    const image = document.querySelector('img');
    expect(image?.getAttribute('data-plotmapai-image-key')).toMatch(/^img_/u);
    expect(image?.getAttribute('alt')).toBe('Cover');
    expect(image?.getAttribute('width')).toBe('640');
    expect(image?.getAttribute('style')).toBe('width: 640px');
    expect(image?.getAttribute('src')).toBeNull();
  });

  it('extracts url-encoded inline svg images without requiring base64', async () => {
    const zip = new JSZip();
    const extracted = await extractChapterImages(
      '<html><body><img src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E" /></body></html>',
      zip,
      '',
    );

    expect(extracted.images).toHaveLength(1);
    expect(extracted.images[0].blob.type).toBe('image/svg+xml');
    await expect(extracted.images[0].blob.text()).resolves.toContain('<svg');
    expect(extracted.html).toContain('data-plotmapai-image-key="img_');
  });

  it('skips malformed inline data-uri images without aborting extraction', async () => {
    const zip = new JSZip();
    const html = '<html><body><img src="data:image/png;base64,%%%bad%%%" /></body></html>';

    await expect(extractChapterImages(html, zip, '')).resolves.toEqual({
      html,
      images: [],
    });
  });

  it('extracts zip-backed images relative to the opf directory', async () => {
    const zip = new JSZip();
    zip.file('OPS/images/pic.png', new Uint8Array([1, 2, 3]));

    const extracted = await extractChapterImages(
      '<html><body><img src="images/pic.png" /></body></html>',
      zip,
      'OPS',
    );

    expect(extracted.images).toHaveLength(1);
    expect(extracted.images[0].blob.type).toBe('image/png');
    expect(extracted.html).toContain('data-plotmapai-image-key="img_');
  });
});

describe('extractCoverBlob', () => {
  it('prefers the cover meta reference when available', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
    zip.file('OPS/content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata><meta name="cover" content="cover-image" /></metadata>
  <manifest>
    <item id="cover-image" href="images/cover.jpg" media-type="image/jpeg"/>
  </manifest>
</package>`);
    zip.file('OPS/images/cover.jpg', new Uint8Array([1, 2, 3]));

    const opfPackage = await loadOpfPackage(zip);
    const blob = await extractCoverBlob(opfPackage);

    expect(blob).not.toBeNull();
    expect(blob?.type).toBe('image/jpeg');
  });
});
