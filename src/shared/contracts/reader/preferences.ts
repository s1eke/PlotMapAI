export const READER_PAGE_TURN_MODES = ['scroll', 'cover', 'slide', 'none'] as const;

export type ReaderPageTurnMode = (typeof READER_PAGE_TURN_MODES)[number];

export function isPagedPageTurnMode(mode: ReaderPageTurnMode): boolean {
  return mode !== 'scroll';
}

export function toReaderModeFromPageTurnMode(mode: ReaderPageTurnMode): 'scroll' | 'paged' {
  return mode === 'scroll' ? 'scroll' : 'paged';
}
