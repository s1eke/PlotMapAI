import { useState, useEffect, useMemo } from 'react';
import { readerApi } from '../api/readerApi';

const IMG_PATTERN = /\[IMG:([^\]]+)\]/g;

interface TextSegment {
  type: 'text' | 'image';
  value: string;
}

function parseParagraphSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  IMG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMG_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'image', value: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}

function InlineImage({ novelId, imageKey }: { novelId: number; imageKey: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    readerApi.getImageUrl(novelId, imageKey).then(result => {
      if (!revoked) {
        objectUrl = result;
        setUrl(result);
      } else if (result) {
        URL.revokeObjectURL(result);
      }
    });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [novelId, imageKey]);

  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      className="max-w-full mx-auto my-4 rounded-lg shadow-md"
      loading="lazy"
    />
  );
}

export interface ChapterParagraphProps {
  text: string;
  novelId: number;
  marginBottom: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function ChapterParagraph({ text, novelId, marginBottom, className, style }: ChapterParagraphProps) {
  const segments = useMemo(() => parseParagraphSegments(text), [text]);

  if (segments.length === 1 && segments[0].type === 'text') {
    return (
      <p className={className} style={{ marginBottom, ...style }}>
        {text}
      </p>
    );
  }

  return (
    <div style={{ marginBottom }}>
      {segments.map((seg, i) =>
        seg.type === 'image' ? (
          <InlineImage key={i} novelId={novelId} imageKey={seg.value} />
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
