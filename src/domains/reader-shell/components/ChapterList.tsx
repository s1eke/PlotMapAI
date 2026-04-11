import { useLayoutEffect, useRef } from 'react';
import type { Chapter } from '@shared/contracts/reader';
import { cn } from '@shared/utils/cn';

interface ChapterListProps {
  chapters: Chapter[];
  currentIndex: number;
  onSelect: (index: number) => void;
  contentTextColor?: string;
  isSidebarOpen?: boolean;
}

export default function ChapterList({
  chapters,
  currentIndex,
  onSelect,
  contentTextColor,
  isSidebarOpen,
}: ChapterListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const hasMountedRef = useRef(false);
  const previousCurrentIndexRef = useRef(currentIndex);
  const previousSidebarOpenRef = useRef(isSidebarOpen);

  // When the directory opens or first renders, jump directly to the active chapter
  // so the user doesn't see a long animated scroll from the top.
  useLayoutEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        const didOpenSidebar = Boolean(isSidebarOpen) && !previousSidebarOpenRef.current;
        const didChangeChapter = currentIndex !== previousCurrentIndexRef.current;
        const behavior: ScrollBehavior =
          !hasMountedRef.current || didOpenSidebar || !didChangeChapter
            ? 'auto'
            : 'smooth';

        activeEl.scrollIntoView({ block: 'center', behavior });
      }
    }

    hasMountedRef.current = true;
    previousCurrentIndexRef.current = currentIndex;
    previousSidebarOpenRef.current = isSidebarOpen;
  }, [currentIndex, isSidebarOpen]);

  return (
    <div
      ref={listRef}
      className="flex flex-col h-full overflow-y-auto hide-scrollbar py-4 px-3 space-y-1"
    >
      {chapters.map((ch) => {
        const isActive = ch.index === currentIndex;

        return (
          <button
            key={ch.index}
            data-active={isActive}
            onClick={() => onSelect(ch.index)}
            className={cn(
              'text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200',
              isActive
                ? 'bg-accent/20 text-accent font-medium shadow-sm'
                : cn(contentTextColor || 'text-text-secondary', 'hover:bg-brand-500/10 hover:text-text-primary opacity-80 hover:opacity-100'),
            )}
          >
            <div className="line-clamp-2 leading-relaxed">
              {ch.title}
            </div>
            {isActive && ch.wordCount > 0 && (
              <div className="text-xs text-accent/70 mt-1 font-normal">
                {ch.wordCount.toLocaleString()} words
              </div>
            )}
          </button>
        );
      })}

      {chapters.length === 0 && (
        <div className="text-center text-text-secondary py-8 text-sm">
          No chapters available
        </div>
      )}
    </div>
  );
}
