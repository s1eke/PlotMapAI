import { describe, expect, it } from 'vitest';

import {
  buildChapterBlockSequence,
  buildChapterImageGalleryEntries,
} from '@shared/text-processing';

describe('chapterBlocks', () => {
  it('builds a stable block sequence for mixed text, images, and blank lines', () => {
    const chapter = {
      content: 'Intro [IMG:cover] tail\n\n\nSecond paragraph\n[IMG:map]\n',
      index: 2,
      title: 'Chapter 3',
    };

    expect(buildChapterBlockSequence(chapter)).toEqual([
      {
        blockIndex: 1,
        chapterIndex: 2,
        hasParagraphSpacingAfter: false,
        kind: 'text',
        paragraphIndex: 0,
        text: 'Intro ',
      },
      {
        blockIndex: 2,
        chapterIndex: 2,
        hasParagraphSpacingAfter: false,
        imageKey: 'cover',
        kind: 'image',
        paragraphIndex: 0,
      },
      {
        blockIndex: 3,
        chapterIndex: 2,
        hasParagraphSpacingAfter: false,
        kind: 'text',
        paragraphIndex: 0,
        text: ' tail',
      },
      {
        blockIndex: 4,
        chapterIndex: 2,
        kind: 'blank',
        paragraphIndex: 1,
      },
      {
        blockIndex: 5,
        chapterIndex: 2,
        hasParagraphSpacingAfter: true,
        kind: 'text',
        paragraphIndex: 3,
        text: 'Second paragraph',
      },
      {
        blockIndex: 6,
        chapterIndex: 2,
        hasParagraphSpacingAfter: false,
        imageKey: 'map',
        kind: 'image',
        paragraphIndex: 4,
      },
    ]);
  });

  it('derives gallery entries from the shared block sequence', () => {
    const chapter = {
      content: 'Preface\n[IMG:frontispiece]\nBody [IMG:diagram] tail',
      index: 0,
      title: 'Chapter 1',
    };

    expect(buildChapterImageGalleryEntries(chapter)).toEqual([
      {
        blockIndex: 2,
        chapterIndex: 0,
        imageKey: 'frontispiece',
        order: 0,
      },
      {
        blockIndex: 4,
        chapterIndex: 0,
        imageKey: 'diagram',
        order: 1,
      },
    ]);
  });
});
