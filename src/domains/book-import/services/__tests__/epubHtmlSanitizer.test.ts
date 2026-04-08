import { describe, expect, it, vi } from 'vitest';

import { sanitizeEpubHtml } from '../epub/epubHtmlSanitizer';

describe('sanitizeEpubHtml', () => {
  it('removes blocked nodes and strips unsupported attributes and styles', () => {
    const root = sanitizeEpubHtml(`
      <html>
        <head>
          <title>Ignored</title>
          <script>alert(1)</script>
        </head>
        <body>
          <section class="top-nav">Skip me</section>
          <p onclick="evil()" title="intro" style="color: red; text-align: center; font-weight: bold">Body</p>
          <img
            src="images/cover.png"
            alt="Cover"
            width="640"
            style="width: 640px; position: absolute"
            data-plotmapai-image-key="img_1"
            onload="evil()"
          />
        </body>
      </html>
    `);

    const paragraph = root.querySelector('p');
    const image = root.querySelector('img');

    expect(root.querySelector('section')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
    expect(paragraph).not.toBeNull();
    expect(paragraph?.getAttribute('style')).toBe('text-align: center; font-weight: bold');
    expect(paragraph?.hasAttribute('onclick')).toBe(false);
    expect(paragraph?.hasAttribute('title')).toBe(false);
    expect(image?.getAttribute('data-plotmapai-image-key')).toBe('img_1');
    expect(image?.getAttribute('alt')).toBe('Cover');
    expect(image?.getAttribute('width')).toBe('640');
    expect(image?.getAttribute('style')).toBe('width: 640px');
    expect(image?.hasAttribute('src')).toBe(false);
    expect(image?.hasAttribute('onload')).toBe(false);
  });

  it('normalizes a leading BOM and xml declaration before parsing', () => {
    const NativeDOMParser = globalThis.DOMParser;
    let capturedSource = '';

    class CapturingDomParser {
      parseFromString(source: string): Document {
        capturedSource = source;
        return new NativeDOMParser().parseFromString(`
          <html>
            <body>
              <p>Body</p>
            </body>
          </html>
        `, 'text/html');
      }
    }

    vi.stubGlobal('DOMParser', CapturingDomParser);

    try {
      const root = sanitizeEpubHtml(`
        \uFEFF
        <?xml version="1.0" encoding="utf-8"?>
        <html>
          <body>
            <p>Body</p>
          </body>
        </html>
      `);

      expect(root.textContent).toContain('Body');
      expect(capturedSource.startsWith('\uFEFF')).toBe(false);
      expect(capturedSource.trimStart().startsWith('<?xml')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back to html parsing when xhtml parsing throws', () => {
    const NativeDOMParser = globalThis.DOMParser;
    const mimeTypes: string[] = [];

    class ThrowingDomParser {
      parseFromString(source: string, mimeType: DOMParserSupportedType): Document {
        mimeTypes.push(mimeType);
        if (mimeType === 'application/xhtml+xml') {
          throw new Error('xhtml parsing failed');
        }

        return new NativeDOMParser().parseFromString(source, 'text/html');
      }
    }

    vi.stubGlobal('DOMParser', ThrowingDomParser);

    try {
      const root = sanitizeEpubHtml('<html><body><p>Fallback</p></body></html>');

      expect(root.textContent).toContain('Fallback');
      expect(mimeTypes).toEqual([
        'application/xhtml+xml',
        'text/html',
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
