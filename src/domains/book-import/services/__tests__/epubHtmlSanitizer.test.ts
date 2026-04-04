import { describe, expect, it } from 'vitest';

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
});
