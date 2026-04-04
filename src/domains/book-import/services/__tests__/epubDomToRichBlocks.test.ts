import { describe, expect, it } from 'vitest';

import { epubDomToRichBlocks } from '../epub/epubDomToRichBlocks';
import { sanitizeEpubHtml } from '../epub/epubHtmlSanitizer';
import { normalizeRichBlocks } from '../epub/richTextNormalizer';

describe('epubDomToRichBlocks', () => {
  it('maps supported P0 structures into rich blocks and degrades unsupported blocks', () => {
    const root = sanitizeEpubHtml(`
      <html>
        <body>
          <h2 align="center">Heading</h2>
          <p style="text-align: right"><strong>Bold</strong><br /><em>Italic</em></p>
          <blockquote><p>Quoted</p></blockquote>
          <ul>
            <li>First</li>
            <li><p>Second</p></li>
          </ul>
          <figure>
            <img data-plotmapai-image-key="img_1" alt="Map" width="320" />
            <figcaption>World map</figcaption>
          </figure>
          <table><tr><td>Cell</td></tr></table>
        </body>
      </html>
    `);

    const blocks = normalizeRichBlocks(epubDomToRichBlocks(root));

    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'blockquote',
      'list',
      'image',
      'unsupported',
    ]);
    expect(blocks[0]).toMatchObject({
      type: 'heading',
      level: 2,
      align: 'center',
      children: [{ type: 'text', text: 'Heading' }],
    });
    expect(blocks[1]).toMatchObject({
      type: 'paragraph',
      align: 'right',
      children: [
        { type: 'text', text: 'Bold', marks: ['bold'] },
        { type: 'lineBreak' },
        { type: 'text', text: 'Italic', marks: ['italic'] },
      ],
    });
    expect(blocks[2]).toMatchObject({
      type: 'blockquote',
      children: [{
        type: 'paragraph',
        children: [{ type: 'text', text: 'Quoted' }],
      }],
    });
    expect(blocks[3]).toMatchObject({
      type: 'list',
      ordered: false,
      items: [
        [{ type: 'paragraph', children: [{ type: 'text', text: 'First' }] }],
        [{ type: 'paragraph', children: [{ type: 'text', text: 'Second' }] }],
      ],
    });
    expect(blocks[4]).toMatchObject({
      type: 'image',
      key: 'img_1',
      alt: 'Map',
      width: 320,
      caption: [{ type: 'text', text: 'World map' }],
    });
    expect(blocks[5]).toMatchObject({
      type: 'unsupported',
      originalTag: 'table',
      fallbackText: 'Cell',
    });
  });
});
