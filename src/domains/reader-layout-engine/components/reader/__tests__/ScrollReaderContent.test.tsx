import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { READER_CONTENT_CLASS_NAMES } from '@shared/reader-content';
import { projectTxtPlainTextToRichBlocks } from '@shared/text-processing';

const useReaderImageResourceMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@domains/reader-media', async (importOriginal) => ({
  ...await importOriginal<typeof import('@domains/reader-media')>(),
  useReaderImageResource: useReaderImageResourceMock,
}));

import ScrollReaderContent from '../ScrollReaderContent';
import { createFakeReaderTextLayoutEngine } from '../../../test/createFakeReaderTextLayoutEngine';
import {
  createReaderTypographyMetrics,
  measureScrollReaderChapterLayout,
  measureReaderChapterLayout,
} from '../../../utils/readerLayout';

const TEXT_LAYOUT_ENGINE = createFakeReaderTextLayoutEngine({ maxCharsPerLine: 28 });

function createScrollChapterLayout(content: string) {
  const chapter = {
    index: 0,
    title: 'Chapter 1',
    plainText: content,
    richBlocks: [],
    contentFormat: 'plain' as const,
    contentVersion: 1,
    wordCount: 100,
    totalChapters: 1,
    hasPrev: false,
    hasNext: false,
  };
  const typography = createReaderTypographyMetrics(18, 1.8, 24, 920);
  return {
    chapter,
    layout: measureReaderChapterLayout(
      chapter,
      920,
      typography,
      new Map(),
      undefined,
      TEXT_LAYOUT_ENGINE,
    ),
  };
}

function createRichScrollChapterLayout() {
  const chapter = {
    index: 0,
    title: 'Chapter 1',
    plainText: [
      'Section',
      '',
      'Heroic opening',
      '',
      'Remember the river.',
      '',
      'Pack lightly',
      '',
      'The wind remembers',
      'the river path',
      '',
      'The world map',
      '',
      'Return to the river note',
      '',
      'Route | Status',
      'North Lock | Open',
      '',
      'Margin note: ferries only after dusk.',
    ].join('\n'),
    richBlocks: [
      {
        type: 'heading',
        level: 2,
        children: [{
          type: 'text',
          text: 'Section',
        }],
      },
      {
        type: 'paragraph',
        anchorId: 'river-note',
        children: [
          {
            type: 'text',
            marks: ['bold'],
            text: 'Heroic',
          },
          {
            type: 'text',
            text: ' opening',
          },
        ],
      },
      {
        type: 'blockquote',
        children: [{
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'Remember the river.',
          }],
        }],
      },
      {
        type: 'list',
        ordered: false,
        items: [[{
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'Pack lightly',
          }],
        }]],
      },
      {
        type: 'poem',
        lines: [[{
          type: 'text',
          text: 'The wind remembers',
        }], [{
          type: 'text',
          text: 'the river path',
        }]],
      },
      {
        type: 'image',
        key: 'map',
        caption: [{
          type: 'text',
          text: 'The world map',
        }],
      },
      {
        type: 'hr',
      },
      {
        type: 'paragraph',
        children: [{
          type: 'link',
          href: '#river-note',
          children: [{
            type: 'text',
            text: 'Return to the river note',
          }],
        }],
      },
      {
        type: 'table',
        rows: [
          [
            {
              children: [{
                type: 'text',
                text: 'Route',
              }],
            },
            {
              children: [{
                type: 'text',
                text: 'Status',
              }],
            },
          ],
          [
            {
              children: [{
                type: 'text',
                text: 'North Lock',
              }],
            },
            {
              children: [{
                type: 'text',
                text: 'Open',
              }],
            },
          ],
        ],
      },
      {
        type: 'unsupported',
        originalTag: 'aside',
        fallbackText: 'Margin note: ferries only after dusk.',
      },
    ],
    contentFormat: 'rich' as const,
    contentVersion: 1,
    wordCount: 100,
    totalChapters: 1,
    hasPrev: false,
    hasNext: false,
  };
  const typography = createReaderTypographyMetrics(18, 1.8, 24, 920);

  return {
    chapter,
    layout: measureScrollReaderChapterLayout(
      chapter,
      920,
      typography,
      new Map([
        ['map', { width: 920, height: 460, aspectRatio: 2 }],
      ]),
      undefined,
      TEXT_LAYOUT_ENGINE,
    ),
  };
}

function createTxtRichScrollChapterLayout(content: string) {
  const chapter = {
    index: 0,
    title: 'Chapter 1',
    plainText: content,
    richBlocks: projectTxtPlainTextToRichBlocks(content),
    contentFormat: 'rich' as const,
    contentVersion: 1,
    wordCount: content.length,
    totalChapters: 1,
    hasPrev: false,
    hasNext: false,
  };
  const typography = createReaderTypographyMetrics(18, 1.8, 24, 920);

  return {
    chapter,
    layout: measureScrollReaderChapterLayout(
      chapter,
      920,
      typography,
      new Map(),
      undefined,
      TEXT_LAYOUT_ENGINE,
    ),
  };
}

describe('ScrollReaderContent', () => {
  beforeEach(() => {
    useReaderImageResourceMock.mockReset();
  });

  it('renders sticky chapter chrome plus the full static chapter tree in scroll mode', () => {
    const { chapter, layout } = createScrollChapterLayout('Text');

    render(
      <ScrollReaderContent
        chapters={[{
          index: 0,
          chapter,
          layout,
        }]}
        novelId={1}
        readerTheme="auto"
        rootClassName="pm-reader pm-reader--scroll pm-reader--theme-auto"
        rootStyle={{}}
        textClassName=""
        headerBgClassName=""
        onChapterElement={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chapter 1', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByTestId('scroll-reader-content-body')).toBeInTheDocument();
    expect(screen.getByTestId('scroll-reader-content-body')).toHaveClass(
      READER_CONTENT_CLASS_NAMES.content,
    );
    expect(screen.getByTestId('scroll-reader-content-body').closest('.pm-reader')).toHaveClass(
      READER_CONTENT_CLASS_NAMES.root,
      'pm-reader--scroll',
      'pm-reader--theme-auto',
    );
    expect(screen.queryByTestId('paged-reader-page-frame')).not.toBeInTheDocument();
  });

  it('renders the body heading from chapter.title even when the layout heading text is stale', () => {
    const { chapter, layout } = createScrollChapterLayout('Text');
    const staleLayout = {
      ...layout,
      metrics: layout.metrics.map((metric, metricIndex) => (
        metricIndex === 0
          ? {
            ...metric,
            block: {
              ...metric.block,
              text: 'Wrong Heading',
            },
          }
          : metric
      )),
    };

    render(
      <ScrollReaderContent
        chapters={[{
          index: 0,
          chapter,
          layout: staleLayout,
        }]}
        novelId={1}
        readerTheme="auto"
        rootClassName="pm-reader pm-reader--scroll pm-reader--theme-auto"
        rootStyle={{}}
        textClassName=""
        headerBgClassName=""
        onChapterElement={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Chapter 1', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wrong Heading', level: 2 })).not.toBeInTheDocument();
  });

  it('lets the scroll reader text body inherit the global sans font stack', () => {
    const { chapter, layout } = createScrollChapterLayout('Text');

    render(
      <ScrollReaderContent
        chapters={[{
          index: 0,
          chapter,
          layout,
        }]}
        novelId={1}
        readerTheme="auto"
        rootClassName="pm-reader pm-reader--scroll pm-reader--theme-auto"
        rootStyle={{}}
        textClassName=""
        headerBgClassName=""
        onChapterElement={() => {}}
      />,
    );

    expect(screen.getByTestId('scroll-reader-content-body')).not.toHaveClass('font-serif');
  });

  it('allows sticky chapter titles to wrap instead of truncating long titles', () => {
    const { chapter, layout } = createScrollChapterLayout('Text');
    const longTitle = 'Chapter 1 with a very long title that should wrap instead of truncating';

    render(
      <ScrollReaderContent
        chapters={[{
          index: 0,
          chapter: {
            ...chapter,
            title: longTitle,
          },
          layout,
        }]}
        novelId={1}
        readerTheme="auto"
        rootClassName="pm-reader pm-reader--scroll pm-reader--theme-auto"
        rootStyle={{}}
        textClassName=""
        headerBgClassName=""
        onChapterElement={() => {}}
      />,
    );

    const stickyTitle = screen.getByRole('heading', { name: longTitle, level: 1 });
    expect(stickyTitle).toHaveClass('break-words');
    expect(stickyTitle).toHaveClass('whitespace-normal');
    expect(stickyTitle).not.toHaveClass('truncate');
  });

  it('renders only the windowed block range when one is provided', () => {
    const { chapter, layout } = createScrollChapterLayout('First paragraph\nSecond paragraph');

    const { container } = render(
      <ScrollReaderContent
        chapters={[{
          index: 0,
          chapter,
          layout,
        }]}
        novelId={1}
        readerTheme="auto"
        rootClassName="pm-reader pm-reader--scroll pm-reader--theme-auto"
        rootStyle={{}}
        textClassName=""
        headerBgClassName=""
        onChapterElement={() => {}}
        visibleBlockRangeByChapter={new Map([
          [0, { startIndex: 1, endIndex: 1 }],
        ])}
      />,
    );

    expect(screen.getByText('First paragraph')).toBeInTheDocument();
    expect(screen.queryByText('Second paragraph')).not.toBeInTheDocument();
    const fragments = container.querySelectorAll('[data-testid="reader-flow-text-fragment"]');
    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.children).toHaveLength(0);
  });

  it('renders rich blocks in scroll mode and keeps image activation aligned to block indices', async () => {
    useReaderImageResourceMock.mockReturnValue('blob:map');
    const onImageActivate = vi.fn();
    const onRegisterImageElement = vi.fn();
    const { chapter, layout } = createRichScrollChapterLayout();
    const user = userEvent.setup();

    const { container } = render(
      <ScrollReaderContent
        chapters={[{
          index: 0,
          chapter,
          layout,
        }]}
        novelId={1}
        onChapterElement={() => {}}
        onImageActivate={onImageActivate}
        onRegisterImageElement={onRegisterImageElement}
        readerTheme="auto"
        rootClassName="pm-reader pm-reader--scroll pm-reader--theme-auto"
        rootStyle={{}}
        textClassName=""
        headerBgClassName=""
      />,
    );

    expect(screen.getByRole('heading', { name: 'Section', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Heroic').tagName).toBe('STRONG');
    expect(screen.getByText('Remember the river.').closest('[style]')).toBeTruthy();
    expect(screen.getByText('Pack lightly')).toBeInTheDocument();
    expect(screen.getByText('The wind remembers')).toBeInTheDocument();
    expect(screen.getByText('the river path')).toBeInTheDocument();
    expect(screen.getByText('The world map')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to the river note' })).toHaveClass(
      READER_CONTENT_CLASS_NAMES.inlineLink,
    );
    expect(screen.getByTestId('reader-flow-table')).toBeInTheDocument();
    expect(screen.getByText('Route').closest('td')).toHaveClass(
      READER_CONTENT_CLASS_NAMES.tableCell,
    );
    const unsupportedFragment = Array.from(
      container.querySelectorAll('[data-testid="reader-flow-text-fragment"]'),
    ).find((element) => element.textContent === 'Margin note: ferries only after dusk.');
    expect(unsupportedFragment).toHaveClass(READER_CONTENT_CLASS_NAMES.blockUnsupported);
    expect(screen.getByTestId('reader-flow-hr')).toBeInTheDocument();
    expect(document.querySelector(`.${READER_CONTENT_CLASS_NAMES.listMarker}`)).toBeTruthy();
    expect(screen.getByText('The wind remembers').closest(`.${READER_CONTENT_CLASS_NAMES.poemLine}`)).toBeTruthy();
    expect(screen.getByTestId('reader-flow-image-caption')).toHaveClass(
      READER_CONTENT_CLASS_NAMES.imageCaption,
    );

    const imageButton = screen.getByRole('button', { name: 'reader.imageViewer.title' });
    await user.click(imageButton);

    expect(onRegisterImageElement).toHaveBeenCalledWith({
      blockIndex: 7,
      chapterIndex: 0,
      imageKey: 'map',
    }, expect.anything());
    expect(onImageActivate).toHaveBeenCalledWith(expect.objectContaining({
      blockIndex: 7,
      chapterIndex: 0,
      imageKey: 'map',
      sourceElement: imageButton,
    }));
  });

  it('renders TXT-derived rich paragraphs as separate flow fragments in scroll mode', () => {
    const { chapter, layout } = createTxtRichScrollChapterLayout('第一行\n第二行');
    const { container } = render(
      <ScrollReaderContent
        chapters={[{
          index: 0,
          chapter,
          layout,
        }]}
        novelId={1}
        readerTheme="auto"
        rootClassName="pm-reader pm-reader--scroll pm-reader--theme-auto"
        rootStyle={{}}
        textClassName=""
        headerBgClassName=""
        onChapterElement={() => {}}
      />,
    );

    const fragments = Array.from(
      container.querySelectorAll('[data-testid="reader-flow-text-fragment"]'),
    );
    expect(fragments).toHaveLength(3);
    expect(fragments.map((fragment) => fragment.textContent)).toEqual([
      'Chapter 1',
      '第一行',
      '第二行',
    ]);
  });
});
