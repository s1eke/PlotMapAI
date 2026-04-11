import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import ChapterParagraph from '../ChapterParagraph';
import { buildChapterRenderData } from '@shared/utils/readerPosition';

interface ReaderChapterSectionProps {
  title: string;
  content: string;
  novelId: number;
  paragraphSpacing: number;
  imageRenderMode?: 'scroll' | 'paged';
  headingClassName?: string;
  headingStyle?: CSSProperties;
  paragraphClassName?: string;
  mixedParagraphClassName?: string;
  blankParagraphClassName?: string;
}

export default function ReaderChapterSection({
  title,
  content,
  novelId,
  paragraphSpacing,
  imageRenderMode = 'scroll',
  headingClassName,
  headingStyle,
  paragraphClassName,
  mixedParagraphClassName,
  blankParagraphClassName,
}: ReaderChapterSectionProps) {
  const { paragraphs, skipLineIndex } = buildChapterRenderData(content, title);
  const paragraphEntries = useMemo(() => {
    let cursor = 0;
    return paragraphs.map((paragraph) => {
      const key = `${cursor}:${paragraph}`;
      cursor += paragraph.length + 1;
      return {
        key,
        paragraph,
      };
    });
  }, [paragraphs]);

  return (
    <>
      <h2 className={headingClassName} style={headingStyle}>{title}</h2>
      {paragraphEntries.map(({ key, paragraph }, index) => {
        if (index === skipLineIndex) return null;
        if (!paragraph.trim()) {
          return (
            <div
              key={`${key}:blank`}
              className={blankParagraphClassName}
              style={{ height: paragraphSpacing }}
              aria-hidden="true"
            />
          );
        }

        return (
          <ChapterParagraph
            key={key}
            text={paragraph}
            novelId={novelId}
            marginBottom={paragraphSpacing}
            className={paragraphClassName}
            containerClassName={mixedParagraphClassName}
            imageRenderMode={imageRenderMode}
          />
        );
      })}
    </>
  );
}
