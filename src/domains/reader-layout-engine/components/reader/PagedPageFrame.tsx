import type { ChapterContent } from '@shared/contracts/reader';
import type { CSSProperties } from 'react';
import type { PaginatedChapterLayout, PageSlice } from '../../layout-core/internal';
import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
} from '../../layout-core/internal';

import { READER_CONTENT_CLASS_NAMES } from '@shared/reader-content';
import { cn } from '@shared/utils/cn';

import {
  PAGED_VIEWPORT_TOP_PADDING_PX,
  ReaderFlowBlock,
} from '../../layout-core/internal';

interface PagedPageFrameProps {
  chapter: ChapterContent;
  headerBgClassName: string;
  layout: PaginatedChapterLayout;
  novelId: number;
  onImageActivate?: (payload: ReaderImageActivationPayload) => void;
  onRegisterImageElement?: (
    entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>,
    element: HTMLButtonElement | null,
  ) => void;
  pageBgClassName?: string;
  pageCount: number;
  pageIndex: number;
  pageSlice: PageSlice;
  pagedContentRef?: React.Ref<HTMLDivElement>;
  pagedViewportRef?: React.Ref<HTMLDivElement>;
  readerTheme: string;
  rootClassName: string;
  rootStyle: CSSProperties;
  textClassName: string;
}

export function PagedPageFrame({
  chapter,
  headerBgClassName,
  layout,
  novelId,
  onImageActivate,
  onRegisterImageElement,
  pageBgClassName,
  pageCount,
  pageIndex,
  pageSlice,
  pagedContentRef,
  pagedViewportRef,
  readerTheme,
  rootClassName,
  rootStyle,
  textClassName,
}: PagedPageFrameProps) {
  return (
    <div
      data-testid="paged-reader-page-frame"
      className={cn(rootClassName, 'flex h-full w-full flex-col')}
      style={rootStyle}
    >
      <div className={cn(READER_CONTENT_CLASS_NAMES.chapter, 'flex h-full w-full flex-col')}>
        <div
          className={cn(
            READER_CONTENT_CLASS_NAMES.chapterHeader,
            'w-full shrink-0 border-b border-border-color/20 backdrop-blur-sm',
            headerBgClassName,
          )}
        >
          <div className={cn('mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-8 md:px-12', textClassName)}>
            <h1 className={cn('truncate text-sm font-medium transition-colors', readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60')}>
              {chapter.title}
            </h1>
            {pageCount > 1 ? (
              <div className="whitespace-nowrap text-xs font-medium text-text-secondary">
                {pageIndex + 1} / {pageCount}
              </div>
            ) : null}
          </div>
        </div>

        <div className={cn('min-h-0 flex-1', pageBgClassName ?? headerBgClassName)}>
          <div className={cn('mx-auto h-full w-full max-w-[1400px] px-4 sm:px-8 md:px-12', textClassName)}>
            <div
              ref={pagedViewportRef}
              data-testid="paged-reader-measurement-viewport"
              className="h-full overflow-hidden"
              style={{ paddingTop: `${PAGED_VIEWPORT_TOP_PADDING_PX}px` }}
            >
              <div
                ref={pagedContentRef}
                data-testid="paged-reader-content-body"
                className="flex h-full"
                style={{
                  gap: layout.columnCount > 1 ? `${layout.columnGap}px` : '0px',
                }}
              >
                {pageSlice.columns.map((column) => (
                  <div
                    key={[
                      pageIndex,
                      column.items[0]?.key ?? 'empty',
                      column.items[column.items.length - 1]?.key ?? 'empty',
                    ].join(':')}
                    className={cn(
                      READER_CONTENT_CLASS_NAMES.content,
                      'flex min-w-0 flex-1 flex-col overflow-hidden',
                    )}
                    style={{
                      width: `${layout.columnWidth}px`,
                    }}
                  >
                    {column.items.map((item) => (
                      <ReaderFlowBlock
                        chapterTitle={chapter.title}
                        key={item.key}
                        imageRenderMode="paged"
                        item={item}
                        novelId={novelId}
                        onImageActivate={onImageActivate}
                        onRegisterImageElement={onRegisterImageElement}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
