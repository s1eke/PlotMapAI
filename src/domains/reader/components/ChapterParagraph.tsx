import type { CSSProperties } from 'react';

import { useMemo } from 'react';

import { useReaderImageResource } from '../hooks/useReaderImageResource';
import { parseParagraphSegments } from '../utils/chapterImages';

function InlineImage({
  novelId,
  imageKey,
  imageRenderMode,
}: {
  novelId: number;
  imageKey: string;
  imageRenderMode: 'scroll' | 'paged';
}) {
  const url = useReaderImageResource(novelId, imageKey);

  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      className="block max-w-full mx-auto my-4 rounded-lg shadow-md"
      loading={imageRenderMode === 'paged' ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
    />
  );
}

export interface ChapterParagraphProps {
  text: string;
  novelId: number;
  marginBottom: number;
  className?: string;
  containerClassName?: string;
  imageRenderMode?: 'scroll' | 'paged';
  style?: CSSProperties;
}

export default function ChapterParagraph({
  text,
  novelId,
  marginBottom,
  className,
  containerClassName,
  imageRenderMode = 'scroll',
  style,
}: ChapterParagraphProps) {
  const segments = useMemo(() => parseParagraphSegments(text), [text]);

  if (segments.length === 1 && segments[0].type === 'text') {
    return (
      <p className={className} style={{ marginBottom, ...style }}>
        {text}
      </p>
    );
  }

  return (
    <div className={containerClassName} style={{ marginBottom }}>
      {segments.map((seg, i) =>
        seg.type === 'image' ? (
          <InlineImage
            key={i}
            novelId={novelId}
            imageKey={seg.value}
            imageRenderMode={imageRenderMode}
          />
        ) : (
          seg.value.trim() ? (
            <p key={i} className={className} style={style}>
              {seg.value}
            </p>
          ) : null
        ),
      )}
    </div>
  );
}
