import type { ChapterContent } from '@shared/contracts/reader';
import type { CSSProperties } from 'react';
import type { PaginatedChapterLayout, PageSlice } from '../../layout-core/internal';
import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
} from '../../layout-core/internal';

import { READER_CONTENT_CLASS_NAMES } from '@shared/reader-rendering';
import { cn } from '@shared/utils/cn';

import {
  PAGED_VIEWPORT_TOP_PADDING_PX,
  ReaderFlowBlock,
} from '../../layout-core/internal';
import ReaderPageHeader from './ReaderPageHeader';

interface PagedPageFrameProps {
  chapter: ChapterContent;
  headerBgClassName: string;
  indicatorPageCount?: number;
  indicatorPageIndex?: number;
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
  showPageIndicator?: boolean;
  textClassName: string;
}

export function PagedPageFrame({
  chapter,
  headerBgClassName,
  indicatorPageCount,
  indicatorPageIndex,
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
  showPageIndicator = true,
  textClassName,
}: PagedPageFrameProps) {
  const hasIndicatorPage =
    typeof indicatorPageCount === 'number'
    && typeof indicatorPageIndex === 'number'
    && indicatorPageCount > 0;
  const resolvedIndicatorPageCount = hasIndicatorPage ? indicatorPageCount : pageCount;
  const resolvedIndicatorPageIndex = hasIndicatorPage ? indicatorPageIndex : pageIndex;

  return (
    <div
      data-testid="paged-reader-page-frame"
      data-indicator-page-count={resolvedIndicatorPageCount}
      data-indicator-page-index={resolvedIndicatorPageIndex}
      data-page-count={pageCount}
      data-page-index={pageIndex}
      className={cn(rootClassName, 'flex h-full w-full flex-col')}
      style={rootStyle}
    >
      <div className={cn(READER_CONTENT_CLASS_NAMES.chapter, 'flex h-full w-full flex-col')}>
        <ReaderPageHeader
          headerBgClassName={headerBgClassName}
          indicatorPageCount={resolvedIndicatorPageCount}
          indicatorPageIndex={resolvedIndicatorPageIndex}
          pageCount={pageCount}
          pageIndex={pageIndex}
          readerTheme={readerTheme}
          showPageIndicator={showPageIndicator}
          textClassName={textClassName}
          title={chapter.title}
        />

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
