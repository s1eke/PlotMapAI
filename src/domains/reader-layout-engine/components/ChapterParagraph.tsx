import type { CSSProperties } from 'react';

import { useMemo } from 'react';

import { useReaderImageResource } from '@domains/reader-media';
import { parseParagraphSegments } from '@shared/text-processing';

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
  const segments = useMemo(() => {
    let cursor = 0;
    return parseParagraphSegments(text).map((segment) => {
      const key = `${segment.type}:${cursor}:${segment.value}`;
      cursor += segment.value.length;
      return {
        ...segment,
        key,
      };
    });
  }, [text]);

  if (segments.length === 1 && segments[0].type === 'text') {
    return (
      <p className={className} style={{ marginBottom, ...style }}>
        {text}
      </p>
    );
  }

  return (
    <div className={containerClassName} style={{ marginBottom }}>
      {segments.map((seg) => {
        if (seg.type === 'image') {
          return (
            <InlineImage
              key={seg.key}
              novelId={novelId}
              imageKey={seg.value}
              imageRenderMode={imageRenderMode}
            />
          );
        }

        if (!seg.value.trim()) {
          return null;
        }

        return (
          <p key={seg.key} className={className} style={style}>
            {seg.value}
          </p>
        );
      })}
    </div>
  );
}
