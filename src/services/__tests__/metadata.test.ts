import { describe, expect, it } from 'vitest';
import { extractBookMetadata, extractTitleFromHtml, isNonContentPage } from '../epub/metadata';

describe('metadata helpers', () => {
  it('extracts metadata fields and falls back to filename for missing title', () => {
    const doc = new DOMParser().parseFromString(`<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:creator>Author</dc:creator>
    <dc:description>Desc</dc:description>
    <dc:subject>tag-a</dc:subject>
    <dc:subject>tag-b</dc:subject>
  </metadata>
</package>`, 'application/xml');

    const metadata = extractBookMetadata(doc, 'Fallback.epub');

    expect(metadata.title).toBe('Fallback');
    expect(metadata.author).toBe('Author');
    expect(metadata.description).toBe('Desc');
    expect(metadata.tags).toEqual(['tag-a', 'tag-b']);
  });

  it('extracts a title from html title or heading tags', () => {
    expect(extractTitleFromHtml('<html><head><title>Document Title</title></head><body></body></html>')).toBe('Document Title');
    expect(extractTitleFromHtml('<html><body><h1>Heading Title</h1></body></html>')).toBe('Heading Title');
  });

  it('detects non-content cover and toc pages', () => {
    expect(isNonContentPage('Cover', 'cover.xhtml')).toBe(true);
    expect(isNonContentPage('Chapter 1', 'chapter1.xhtml')).toBe(false);
  });
});
