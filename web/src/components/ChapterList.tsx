import { useEffect, useRef } from 'react';
import type { Chapter } from '../api/reader';
import { cn } from '../utils/cn';

interface ChapterListProps {
  chapters: Chapter[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export default function ChapterList({ chapters, currentIndex, onSelect }: ChapterListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active chapter
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }, [currentIndex]);

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
              "text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200",
                isActive 
                ? "bg-accent/20 text-accent font-medium shadow-sm"
                : "text-text-secondary hover:bg-muted-bg hover:text-text-primary"
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
