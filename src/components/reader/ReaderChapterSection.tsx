import type { CSSProperties } from 'react';
import ChapterParagraph from '../ChapterParagraph';
import { buildChapterRenderData } from '../../utils/readerPosition';

interface ReaderChapterSectionProps {
  title: string;
  content: string;
  novelId: number;
  paragraphSpacing: number;
  headingClassName?: string;
  headingStyle?: CSSProperties;
  paragraphClassName?: string;
  blankParagraphClassName?: string;
}

export default function ReaderChapterSection({
  title,
  content,
  novelId,
  paragraphSpacing,
  headingClassName,
  headingStyle,
  paragraphClassName,
  blankParagraphClassName,
}: ReaderChapterSectionProps) {
  const { paragraphs, skipLineIndex } = buildChapterRenderData(content, title);

  return (
    <>
      <h2 className={headingClassName} style={headingStyle}>{title}</h2>
      {paragraphs.map((paragraph, index) => {
        if (index === skipLineIndex) return null;
        if (!paragraph.trim()) {
          return (
            <div
              key={index}
              className={blankParagraphClassName}
              style={{ height: paragraphSpacing }}
              aria-hidden="true"
            />
          );
        }

        return (
          <ChapterParagraph
            key={index}
            text={paragraph}
            novelId={novelId}
            marginBottom={paragraphSpacing}
            className={paragraphClassName}
          />
        );
      })}
    </>
  );
}
