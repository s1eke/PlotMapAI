import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { READER_CONTENT_CLASS_NAMES } from '@shared/reader-content';

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

import ReaderFlowBlock from '../ReaderFlowBlock';

describe('ReaderFlowBlock', () => {
  afterEach(() => {
    useReaderImageResourceMock.mockReset();
  });

  it('renders text fragments as a single preserved-whitespace node instead of per-line wrappers', () => {
    render(
      <ReaderFlowBlock
        imageRenderMode="paged"
        novelId={1}
        item={{
          blockIndex: 1,
          chapterIndex: 0,
          contentHeight: 96,
          font: '400 18px sans-serif',
          fontSizePx: 18,
          height: 96,
          key: '0:text:1:0',
          kind: 'text',
          lineHeightPx: 32,
          lineStartIndex: 0,
          lines: [
            {
              end: { graphemeIndex: 10, segmentIndex: 0 },
              lineIndex: 0,
              start: { graphemeIndex: 0, segmentIndex: 0 },
              text: '  未过门吧？',
              width: 240,
            },
            {
              end: { graphemeIndex: 10, segmentIndex: 0 },
              lineIndex: 1,
              start: { graphemeIndex: 0, segmentIndex: 0 },
              text: '',
              width: 0,
            },
            {
              end: { graphemeIndex: 20, segmentIndex: 0 },
              lineIndex: 2,
              start: { graphemeIndex: 10, segmentIndex: 0 },
              text: '欲知后事如何？',
              width: 260,
            },
          ],
          marginAfter: 0,
          marginBefore: 0,
        }}
      />,
    );

    const fragment = screen.getByTestId('reader-flow-text-fragment');
    expect(fragment.tagName).toBe('DIV');
    expect(fragment.textContent).toBe('  未过门吧？\n\u00a0\n欲知后事如何？');
    expect(fragment).toHaveStyle({
      overflow: 'hidden',
      whiteSpace: 'pre',
    });
    expect(fragment.children).toHaveLength(0);
    expect(fragment).not.toHaveStyle({ textAlign: 'justify' });
  });

  it('renders rich inline styling for paged text fragments', () => {
    render(
      <ReaderFlowBlock
        imageRenderMode="paged"
        novelId={1}
        item={{
          blockIndex: 3,
          chapterIndex: 0,
          contentHeight: 64,
          font: '400 18px sans-serif',
          fontSizePx: 18,
          height: 64,
          indent: 2,
          key: '0:text:3:0',
          kind: 'text',
          lineHeightPx: 32,
          lineStartIndex: 0,
          lines: [
            {
              end: { graphemeIndex: 5, segmentIndex: 0 },
              lineIndex: 0,
              start: { graphemeIndex: 0, segmentIndex: 0 },
              text: 'Bold ',
              width: 200,
            },
            {
              end: { graphemeIndex: 9, segmentIndex: 0 },
              lineIndex: 1,
              start: { graphemeIndex: 5, segmentIndex: 0 },
              text: 'Link',
              width: 180,
            },
          ],
          marginAfter: 0,
          marginBefore: 0,
          renderRole: 'rich-text',
          richLineFragments: [
            [
              {
                marks: ['bold'],
                text: 'Bold',
                type: 'text',
              },
              {
                text: ' ',
                type: 'text',
              },
            ],
            [
              {
                children: [
                  {
                    marks: ['italic'],
                    text: 'Link',
                    type: 'text',
                  },
                ],
                href: '#target',
                type: 'link',
              },
            ],
          ],
          text: 'Bold Link',
        }}
      />,
    );

    const fragment = screen.getByTestId('reader-flow-text-fragment');
    expect(fragment.querySelector('strong')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Link' })).toHaveAttribute('href', '#target');
    expect(screen.getByRole('link', { name: 'Link' })).toHaveClass(
      READER_CONTENT_CLASS_NAMES.inlineLink,
    );
    expect(fragment.querySelector('em')).not.toBeNull();
    expect(fragment.firstElementChild).toHaveStyle({ paddingLeft: '2em' });
    expect(fragment).toHaveClass(
      READER_CONTENT_CLASS_NAMES.block,
      READER_CONTENT_CLASS_NAMES.blockParagraph,
    );
  });

  it('renders heading fragments as a single h2 node', () => {
    render(
      <ReaderFlowBlock
        chapterTitle="Chapter One"
        imageRenderMode="paged"
        novelId={1}
        item={{
          blockIndex: 0,
          chapterIndex: 0,
          contentHeight: 64,
          font: '700 24px sans-serif',
          fontSizePx: 24,
          height: 64,
          key: '0:heading:0:0',
          kind: 'heading',
          lineHeightPx: 32,
          lineStartIndex: 0,
          lines: [
            {
              end: { graphemeIndex: 7, segmentIndex: 0 },
              lineIndex: 0,
              start: { graphemeIndex: 0, segmentIndex: 0 },
              text: 'Chapter',
              width: 120,
            },
            {
              end: { graphemeIndex: 9, segmentIndex: 0 },
              lineIndex: 1,
              start: { graphemeIndex: 7, segmentIndex: 0 },
              text: 'One',
              width: 80,
            },
          ],
          marginAfter: 0,
          marginBefore: 0,
          text: 'Wrong Title',
        }}
      />,
    );

    const fragment = screen.getByRole('heading', { level: 2 });
    expect(fragment).toHaveAttribute('data-testid', 'reader-flow-text-fragment');
    expect(fragment.textContent).toBe('Chapter One');
    expect(fragment.children).toHaveLength(0);
    expect(fragment).toHaveClass(
      READER_CONTENT_CLASS_NAMES.block,
      READER_CONTENT_CLASS_NAMES.blockHeading,
    );
  });

  it('prefers the original heading text when line fragments are incomplete', () => {
    const rawTitle = '第36章 命途的起点，以及【记忆】的游戏';

    render(
      <ReaderFlowBlock
        chapterTitle={rawTitle}
        imageRenderMode="paged"
        novelId={1}
        item={{
          blockIndex: 0,
          chapterIndex: 0,
          contentHeight: 96,
          font: '700 24px sans-serif',
          fontSizePx: 24,
          height: 96,
          key: '0:heading:0:0',
          kind: 'heading',
          lineHeightPx: 32,
          lineStartIndex: 0,
          lines: [
            {
              end: { graphemeIndex: 4, segmentIndex: 0 },
              lineIndex: 0,
              start: { graphemeIndex: 0, segmentIndex: 0 },
              text: '第36章',
              width: 120,
            },
            {
              end: { graphemeIndex: 9, segmentIndex: 0 },
              lineIndex: 1,
              start: { graphemeIndex: 4, segmentIndex: 0 },
              text: '忆】的游戏',
              width: 140,
            },
          ],
          marginAfter: 0,
          marginBefore: 0,
          text: '第36章 忆】的游戏',
        }}
      />,
    );

    const fragment = screen.getByRole('heading', { level: 2 });
    expect(fragment.textContent).toBe(rawTitle);
    expect(fragment).toHaveStyle({
      overflowWrap: 'anywhere',
      whiteSpace: 'pre-wrap',
    });
  });

  it('keeps the image branch unchanged for paged rendering', () => {
    useReaderImageResourceMock.mockReturnValue('blob:reader-image');

    const { container } = render(
      <ReaderFlowBlock
        imageRenderMode="paged"
        novelId={1}
        item={{
          blockIndex: 2,
          chapterIndex: 0,
          displayHeight: 240,
          displayWidth: 180,
          edge: 'start',
          height: 256,
          imageKey: 'cover',
          key: '0:image:2',
          kind: 'image',
          marginAfter: 16,
          marginBefore: 0,
        }}
      />,
    );

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute('src', 'blob:reader-image');
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveClass('object-contain', 'object-center');
    expect(container.firstElementChild).toHaveClass(
      READER_CONTENT_CLASS_NAMES.block,
      READER_CONTENT_CLASS_NAMES.blockImage,
    );
  });

  it('renders rich image captions with explicit sup and bold styling', () => {
    useReaderImageResourceMock.mockReturnValue('blob:reader-image');

    render(
      <ReaderFlowBlock
        imageRenderMode="paged"
        novelId={1}
        item={{
          blockIndex: 8,
          captionFont: '400 18px sans-serif',
          captionFontSizePx: 18,
          captionLineHeightPx: 24,
          captionLines: [{
            end: { graphemeIndex: 8, segmentIndex: 0 },
            lineIndex: 0,
            start: { graphemeIndex: 0, segmentIndex: 0 },
            text: 'A2 bold',
            width: 120,
          }],
          captionRichLineFragments: [[
            {
              text: 'A',
              type: 'text',
            },
            {
              marks: ['sup'],
              text: '2',
              type: 'text',
            },
            {
              text: ' ',
              type: 'text',
            },
            {
              marks: ['bold'],
              text: 'bold',
              type: 'text',
            },
          ]],
          captionSpacing: 8,
          chapterIndex: 0,
          displayHeight: 180,
          displayWidth: 240,
          edge: 'start',
          height: 220,
          imageKey: 'captioned',
          key: '0:image:8',
          kind: 'image',
          marginAfter: 0,
          marginBefore: 0,
        }}
      />,
    );

    const caption = screen.getByTestId('reader-flow-image-caption');
    expect(caption.querySelector('sup')).not.toBeNull();
    expect(caption.querySelector('strong')).not.toBeNull();
    expect(caption.querySelector('sup')).toHaveStyle({
      fontSize: '13.5px',
    });
  });

  it('uses an expanded hit target for images and prevents bubbling to the reader viewport', () => {
    useReaderImageResourceMock.mockReturnValue('blob:reader-image');
    const onImageActivate = vi.fn();
    const onParentClick = vi.fn();

    render(
      <div onClick={onParentClick}>
        <ReaderFlowBlock
          imageRenderMode="scroll"
          novelId={1}
          onImageActivate={onImageActivate}
          item={{
            blockIndex: 4,
            chapterIndex: 2,
            displayHeight: 180,
            displayWidth: 240,
            edge: 'start',
            height: 196,
            imageKey: 'diagram',
            key: '2:image:4',
            kind: 'image',
            marginAfter: 16,
            marginBefore: 0,
          }}
        />
      </div>,
    );

    const hitTarget = screen.getByRole('button', { name: 'reader.imageViewer.title' });
    expect(hitTarget).toHaveClass('-inset-3', 'cursor-zoom-in');

    fireEvent.pointerDown(hitTarget, { pointerId: 1 });
    fireEvent.click(hitTarget);

    expect(onImageActivate).toHaveBeenCalledWith(expect.objectContaining({
      blockIndex: 4,
      chapterIndex: 2,
      imageKey: 'diagram',
      sourceElement: hitTarget,
    }));
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('renders table blocks with semantic table and cell classes', () => {
    render(
      <ReaderFlowBlock
        imageRenderMode="paged"
        novelId={1}
        item={{
          blockIndex: 5,
          chapterIndex: 0,
          contentHeight: 64,
          font: '400 18px sans-serif',
          fontSizePx: 18,
          height: 64,
          key: '0:text:5:0',
          kind: 'text',
          lineHeightPx: 32,
          lineStartIndex: 0,
          lines: [],
          marginAfter: 0,
          marginBefore: 0,
          renderRole: 'table',
          tableRows: [[{
            children: [{
              text: 'Alpha',
              type: 'text',
            }],
          }]],
          text: 'Alpha',
        }}
      />,
    );

    expect(screen.getByTestId('reader-flow-table')).toHaveClass(
      READER_CONTENT_CLASS_NAMES.block,
      READER_CONTENT_CLASS_NAMES.blockTable,
    );
    const tableCell = screen.getByText('Alpha').closest('td');
    expect(tableCell).not.toBeNull();
    expect(tableCell).toHaveClass(READER_CONTENT_CLASS_NAMES.tableCell);
  });

  it('renders unsupported list items with semantic fallback and marker classes', () => {
    const { container } = render(
      <ReaderFlowBlock
        imageRenderMode="paged"
        novelId={1}
        item={{
          blockIndex: 6,
          chapterIndex: 0,
          contentHeight: 32,
          font: '400 18px sans-serif',
          fontSizePx: 18,
          height: 32,
          key: '0:text:6:0',
          kind: 'text',
          lineHeightPx: 32,
          lineStartIndex: 0,
          lines: [{
            end: { graphemeIndex: 4, segmentIndex: 0 },
            lineIndex: 0,
            start: { graphemeIndex: 0, segmentIndex: 0 },
            text: 'Beta',
            width: 80,
          }],
          listContext: {
            depth: 1,
            itemIndex: 0,
            ordered: true,
          },
          marginAfter: 0,
          marginBefore: 0,
          originalTag: 'table',
          renderRole: 'unsupported',
          showListMarker: true,
          text: 'Beta',
        }}
      />,
    );

    expect(screen.getByTestId('reader-flow-table-fallback')).toHaveClass(
      READER_CONTENT_CLASS_NAMES.block,
      READER_CONTENT_CLASS_NAMES.blockUnsupported,
    );
    expect(container.querySelector(`.${READER_CONTENT_CLASS_NAMES.listMarker}`)).toHaveTextContent('1.');
  });
});
