import { describe, expect, it } from 'vitest';

import {
  buildRichPaginationBlockSequence,
  projectRichBlocksToPaginationBlocks,
} from '../index';

describe('richPagination', () => {
  it('projects rich blocks into a flat pagination sequence with stable block indices', () => {
    const richBlocks = [
      {
        type: 'paragraph',
        children: [{
          type: 'text',
          text: 'Intro',
        }],
      },
      {
        type: 'poem',
        lines: [
          [{
            type: 'text',
            text: 'Line A',
          }],
          [{
            type: 'text',
            text: 'Line B',
          }],
        ],
      },
      {
        type: 'image',
        key: 'map',
        caption: [{
          type: 'text',
          text: 'World map',
        }],
      },
      {
        type: 'blockquote',
        children: [
          {
            type: 'paragraph',
            children: [{
              type: 'text',
              text: 'Quoted',
            }],
          },
        ],
      },
      {
        type: 'list',
        ordered: true,
        items: [
          [
            {
              type: 'paragraph',
              children: [{
                type: 'text',
                text: 'First',
              }],
            },
          ],
          [
            {
              type: 'paragraph',
              children: [{
                type: 'text',
                text: 'Second',
              }],
            },
          ],
        ],
      },
      {
        type: 'hr',
      },
    ] as const;

    const sequence = buildRichPaginationBlockSequence({
      chapterIndex: 2,
      richBlocks: [...richBlocks],
    });

    expect(sequence.map((entry) => ({
      blockIndex: entry.blockIndex,
      blockquoteDepth: entry.blockquoteDepth,
      listContext: entry.listContext
        ? {
          depth: entry.listContext.depth,
          itemIndex: entry.listContext.itemIndex,
          ordered: entry.listContext.ordered,
        }
        : null,
      showListMarker: entry.showListMarker,
      type: entry.block.type,
    }))).toEqual([
      {
        blockIndex: 1,
        blockquoteDepth: 0,
        listContext: null,
        showListMarker: false,
        type: 'paragraph',
      },
      {
        blockIndex: 2,
        blockquoteDepth: 0,
        listContext: null,
        showListMarker: false,
        type: 'paragraph',
      },
      {
        blockIndex: 3,
        blockquoteDepth: 0,
        listContext: null,
        showListMarker: false,
        type: 'paragraph',
      },
      {
        blockIndex: 4,
        blockquoteDepth: 0,
        listContext: null,
        showListMarker: false,
        type: 'image',
      },
      {
        blockIndex: 5,
        blockquoteDepth: 1,
        listContext: null,
        showListMarker: false,
        type: 'paragraph',
      },
      {
        blockIndex: 6,
        blockquoteDepth: 0,
        listContext: { depth: 1, itemIndex: 0, ordered: true },
        showListMarker: true,
        type: 'paragraph',
      },
      {
        blockIndex: 7,
        blockquoteDepth: 0,
        listContext: { depth: 1, itemIndex: 1, ordered: true },
        showListMarker: true,
        type: 'paragraph',
      },
      {
        blockIndex: 8,
        blockquoteDepth: 0,
        listContext: null,
        showListMarker: false,
        type: 'hr',
      },
    ]);

    expect(sequence[3]?.block).toMatchObject({
      caption: [{
        text: 'World map',
        type: 'text',
      }],
      key: 'map',
      type: 'image',
    });
  });

  it('emits pagination blocks without container wrappers as standalone leaves', () => {
    const blocks = projectRichBlocksToPaginationBlocks([
      {
        type: 'blockquote',
        children: [
          {
            type: 'paragraph',
            children: [{
              type: 'text',
              text: 'Quoted paragraph',
            }],
          },
        ],
      },
      {
        type: 'list',
        ordered: false,
        items: [[
          {
            type: 'paragraph',
            children: [{
              type: 'text',
              text: 'Bullet',
            }],
          },
        ]],
      },
    ]);

    expect(blocks).toEqual([
      expect.objectContaining({
        container: 'blockquote',
        sourceBlockType: 'blockquote',
        type: 'paragraph',
      }),
      expect.objectContaining({
        container: 'list-item',
        listContext: { depth: 1, itemIndex: 0, ordered: false },
        sourceBlockType: 'list',
        type: 'paragraph',
      }),
    ]);
  });
});
