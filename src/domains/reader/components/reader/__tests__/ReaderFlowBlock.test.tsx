import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const useReaderImageResourceMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../../hooks/useReaderImageResource', () => ({
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
});
