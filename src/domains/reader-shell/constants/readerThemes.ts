import type {
  ReaderContentVisualToken,
} from '@shared/reader-rendering';

import { READER_CONTENT_VISUAL_TOKEN_NAMES } from '@shared/reader-rendering';

export interface ReaderThemeConfig {
  bg: string;
  contentVariables: Record<ReaderContentVisualToken, string>;
  headerBg: string;
  id: string;
  sidebarBg: string;
  text: string;
}

function createContentVariables(
  overrides: Record<ReaderContentVisualToken, string>,
): Record<ReaderContentVisualToken, string> {
  return overrides;
}

export const READER_THEMES = {
  paper: {
    id: 'paper',
    bg: 'bg-[#ffffff]',
    text: 'text-[#1a1a1a]',
    sidebarBg: 'bg-[#ffffff]',
    headerBg: 'bg-white',
    contentVariables: createContentVariables({
      [READER_CONTENT_VISUAL_TOKEN_NAMES.bg]: '#ffffff',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.surface]: 'rgba(248, 250, 252, 0.92)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.text]: '#1a1a1a',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.textMuted]: '#5f6368',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.border]: 'rgba(15, 23, 42, 0.16)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.accent]: '#ca8a04',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.link]: '#9a6700',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.selectionBg]: 'rgba(202, 138, 4, 0.22)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.imageRadius]: '16px',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.shadowSoft]: '0 16px 36px rgba(15, 23, 42, 0.10)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.focusRing]: 'rgba(202, 138, 4, 0.45)',
    }),
  },
  parchment: {
    id: 'parchment',
    bg: 'bg-[#f4ecd8]',
    text: 'text-[#5b4636]',
    sidebarBg: 'bg-[#f4ecd8]',
    headerBg: 'bg-[#f4ecd8]',
    contentVariables: createContentVariables({
      [READER_CONTENT_VISUAL_TOKEN_NAMES.bg]: '#f4ecd8',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.surface]: 'rgba(255, 249, 240, 0.66)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.text]: '#5b4636',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.textMuted]: '#7a6555',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.border]: 'rgba(91, 70, 54, 0.20)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.accent]: '#b7791f',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.link]: '#8c5b18',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.selectionBg]: 'rgba(183, 121, 31, 0.20)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.imageRadius]: '16px',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.shadowSoft]: '0 16px 32px rgba(91, 70, 54, 0.10)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.focusRing]: 'rgba(183, 121, 31, 0.42)',
    }),
  },
  green: {
    id: 'green',
    bg: 'bg-[#c7edcc]',
    text: 'text-[#2c3e50]',
    sidebarBg: 'bg-[#c7edcc]',
    headerBg: 'bg-[#c7edcc]',
    contentVariables: createContentVariables({
      [READER_CONTENT_VISUAL_TOKEN_NAMES.bg]: '#c7edcc',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.surface]: 'rgba(242, 250, 244, 0.78)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.text]: '#2c3e50',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.textMuted]: '#56736c',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.border]: 'rgba(44, 62, 80, 0.16)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.accent]: '#2f855a',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.link]: '#216749',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.selectionBg]: 'rgba(47, 133, 90, 0.18)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.imageRadius]: '16px',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.shadowSoft]: '0 16px 32px rgba(44, 62, 80, 0.10)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.focusRing]: 'rgba(47, 133, 90, 0.36)',
    }),
  },
  night: {
    id: 'night',
    bg: 'bg-[#1a1a1a]',
    text: 'text-[#d1d1d1]',
    sidebarBg: 'bg-[#1a1a1a]',
    headerBg: 'bg-[#1a1a1a]',
    contentVariables: createContentVariables({
      [READER_CONTENT_VISUAL_TOKEN_NAMES.bg]: '#1a1a1a',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.surface]: 'rgba(255, 255, 255, 0.06)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.text]: '#d1d1d1',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.textMuted]: '#9ca3af',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.border]: 'rgba(255, 255, 255, 0.14)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.accent]: '#f6c453',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.link]: '#ffd879',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.selectionBg]: 'rgba(246, 196, 83, 0.22)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.imageRadius]: '16px',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.shadowSoft]: '0 20px 44px rgba(0, 0, 0, 0.34)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.focusRing]: 'rgba(246, 196, 83, 0.46)',
    }),
  },
  auto: {
    id: 'auto',
    bg: 'bg-bg-primary',
    text: 'text-text-primary',
    sidebarBg: 'bg-bg-secondary',
    headerBg: 'bg-bg-primary',
    contentVariables: createContentVariables({
      [READER_CONTENT_VISUAL_TOKEN_NAMES.bg]: 'var(--bg-primary)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.surface]: 'var(--bg-secondary)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.text]: 'var(--text-primary)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.textMuted]: 'var(--text-secondary)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.border]: 'var(--border-color)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.accent]: 'var(--accent)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.link]: 'var(--accent)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.selectionBg]: 'color-mix(in srgb, var(--accent) 28%, transparent)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.imageRadius]: '16px',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.shadowSoft]: '0 16px 36px color-mix(in srgb, var(--text-primary) 10%, transparent)',
      [READER_CONTENT_VISUAL_TOKEN_NAMES.focusRing]: 'color-mix(in srgb, var(--accent) 50%, transparent)',
    }),
  },
} as const satisfies Record<string, ReaderThemeConfig>;
