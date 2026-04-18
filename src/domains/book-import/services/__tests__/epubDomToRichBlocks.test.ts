import { describe, expect, it } from 'vitest';

import { epubDomToRichBlocks } from '../epub/epubDomToRichBlocks';
import { sanitizeEpubHtml } from '../epub/epubHtmlSanitizer';
import { normalizeRichBlocks } from '../epub/richTextNormalizer';

describe('epubDomToRichBlocks', () => {
  it('maps supported rich structures into typed blocks including simple tables', () => {
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
      'table',
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
      type: 'table',
      rows: [[{
        children: [{ type: 'text', text: 'Cell' }],
      }]],
    });
  });

  it('keeps supported chapter-internal links and drops unresolved internal targets', () => {
    const root = sanitizeEpubHtml(`
      <html>
        <body>
          <p id="intro">Intro</p>
          <p><a href="#intro">Jump back</a> and <a href="#missing">skip missing</a>.</p>
          <hr id="divider" />
        </body>
      </html>
    `);

    const blocks = normalizeRichBlocks(epubDomToRichBlocks(root));

    expect(blocks).toMatchObject([
      {
        type: 'paragraph',
        anchorId: 'intro',
      },
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            href: '#intro',
            children: [{ type: 'text', text: 'Jump back' }],
          },
          { type: 'text', text: ' and skip missing.' },
        ],
      },
      {
        type: 'hr',
        anchorId: 'divider',
      },
    ]);
  });

  it('maps supported inline marks and downgrades unsupported rich structures deterministically', () => {
    const root = sanitizeEpubHtml(`
      <html>
        <body>
          <p>
            <u>Under</u>
            <s>Strike</s>
            <sup>1</sup>
            <sub>2</sub>
          </p>
          <table>
            <tr><td><img data-plotmapai-image-key="img_2" />Wide cell</td></tr>
          </table>
          <svg><text>Chart fallback</text></svg>
        </body>
      </html>
    `);

    const blocks = normalizeRichBlocks(epubDomToRichBlocks(root));

    expect(blocks).toMatchObject([
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Under', marks: ['underline'] },
          { type: 'text', text: 'Strike', marks: ['strike'] },
          { type: 'text', text: '1', marks: ['sup'] },
          { type: 'text', text: '2', marks: ['sub'] },
        ],
      },
      {
        type: 'unsupported',
        originalTag: 'table',
        fallbackText: 'Wide cell',
      },
      {
        type: 'unsupported',
        originalTag: 'svg',
        fallbackText: 'Chart fallback',
      },
    ]);
  });
});
