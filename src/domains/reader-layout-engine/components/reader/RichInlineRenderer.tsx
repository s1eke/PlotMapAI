import type { ReactNode } from 'react';
import type { Mark, RichInline } from '@shared/contracts';

import { READER_CONTENT_CLASS_NAMES } from '@shared/reader-content';
import { getRichInlineTypographyStyle } from '../../utils/richInlineTypography';

function getMarkStyle(
  mark: Mark,
  baseFont: string | undefined,
  baseFontSizePx: number | undefined,
) {
  if (!baseFont || typeof baseFontSizePx !== 'number') {
    return undefined;
  }

  if (mark === 'underline' || mark === 'strike') {
    return undefined;
  }

  return getRichInlineTypographyStyle({
    baseFont,
    baseFontSizePx,
    marks: [mark],
  });
}

function applyMark(
  content: ReactNode,
  mark: Mark,
  key: string,
  baseFont: string | undefined,
  baseFontSizePx: number | undefined,
): ReactNode {
  const style = getMarkStyle(mark, baseFont, baseFontSizePx);

  if (mark === 'bold') {
    return <strong key={key} style={style}>{content}</strong>;
  }

  if (mark === 'italic') {
    return <em key={key} style={style}>{content}</em>;
  }

  if (mark === 'underline') {
    return <u key={key}>{content}</u>;
  }

  if (mark === 'strike') {
    return <s key={key}>{content}</s>;
  }

  if (mark === 'sup') {
    return <sup key={key} style={style}>{content}</sup>;
  }

  return <sub key={key} style={style}>{content}</sub>;
}

function renderInlineChild(
  inline: RichInline,
  key: string,
  baseFont: string | undefined,
  baseFontSizePx: number | undefined,
): ReactNode {
  if (inline.type === 'lineBreak') {
    return <br key={key} />;
  }

  if (inline.type === 'link') {
    return (
      <a
        key={key}
        href={inline.href}
        className={READER_CONTENT_CLASS_NAMES.inlineLink}
      >
        <RichInlineRenderer
          baseFont={baseFont}
          baseFontSizePx={baseFontSizePx}
          inlines={inline.children}
          keyPrefix={`${key}:link`}
        />
      </a>
    );
  }

  let content: ReactNode = inline.text;
  for (const [markIndex, mark] of (inline.marks ?? []).entries()) {
    content = applyMark(content, mark, `${key}:mark:${markIndex}:${mark}`, baseFont, baseFontSizePx);
  }

  return <span key={key}>{content}</span>;
}

interface RichInlineRendererProps {
  baseFont?: string;
  baseFontSizePx?: number;
  inlines: RichInline[];
  keyPrefix?: string;
}

export default function RichInlineRenderer({
  baseFont,
  baseFontSizePx,
  inlines,
  keyPrefix = 'inline',
}: RichInlineRendererProps) {
  return (
    <>
      {inlines.map((inline, index) => renderInlineChild(
        inline,
        `${keyPrefix}:${index}`,
        baseFont,
        baseFontSizePx,
      ))}
    </>
  );
}
