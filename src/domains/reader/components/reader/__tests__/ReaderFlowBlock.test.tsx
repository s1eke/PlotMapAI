import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ReaderFlowBlock from '../ReaderFlowBlock';

describe('ReaderFlowBlock', () => {
  it('renders text lines with preserved spacing but without forcing line justification', () => {
    render(
      <ReaderFlowBlock
        imageRenderMode="paged"
        novelId={1}
        item={{
          blockIndex: 1,
          chapterIndex: 0,
          contentHeight: 32,
          font: '400 18px sans-serif',
          fontSizePx: 18,
          height: 32,
          key: '0:text:1:0',
          kind: 'text',
          lineHeightPx: 32,
          lineStartIndex: 0,
          lines: [{
            end: { graphemeIndex: 10, segmentIndex: 0 },
            lineIndex: 0,
            start: { graphemeIndex: 0, segmentIndex: 0 },
            text: '未过门吧？“王照希面上一红',
            width: 240,
          }],
          marginAfter: 0,
          marginBefore: 0,
        }}
      />,
    );

    const line = screen.getByText('未过门吧？“王照希面上一红').parentElement;
    expect(line).not.toHaveStyle({ textAlign: 'justify' });
    expect(line?.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it('renders terminal paragraph lines without injected justification helpers', () => {
    render(
      <ReaderFlowBlock
        imageRenderMode="paged"
        novelId={1}
        item={{
          blockIndex: 1,
          chapterIndex: 0,
          contentHeight: 32,
          font: '400 18px sans-serif',
          fontSizePx: 18,
          height: 48,
          key: '0:text:1:1',
          kind: 'text',
          lineHeightPx: 32,
          lineStartIndex: 1,
          lines: [{
            end: { graphemeIndex: 8, segmentIndex: 0 },
            lineIndex: 1,
            start: { graphemeIndex: 0, segmentIndex: 0 },
            text: '欲知后事如何？请看下回分解。',
            width: 260,
          }],
          marginAfter: 16,
          marginBefore: 0,
        }}
      />,
    );

    const line = screen.getByText('欲知后事如何？请看下回分解。').parentElement;
    expect(line?.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });
});
