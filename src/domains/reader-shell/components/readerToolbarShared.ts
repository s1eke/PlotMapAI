import { AlignJustify } from 'lucide-react';

import type { ReaderPageTurnMode } from '../constants/pageTurnMode';

export interface SliderValues {
  fontSize: number;
  setFontSize: (size: number) => void;
  lineSpacing: number;
  setLineSpacing: (spacing: number) => void;
  paragraphSpacing: number;
  setParagraphSpacing: (spacing: number) => void;
}

export interface ReaderToolbarProps {
  sliders: SliderValues;
  pageTurnMode: ReaderPageTurnMode;
  setPageTurnMode: (mode: ReaderPageTurnMode) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  navigationMode: 'chapter' | 'page';
  readerTheme: string;
  headerBgClassName: string;
  textClassName: string;
  setReaderTheme: (theme: string) => void;
  hidden?: boolean;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onCloseSidebar?: () => void;
}

export type SliderKey = 'fontSize' | 'lineSpacing' | 'paragraphSpacing' | null;

export interface ResolvedSlider {
  key: Exclude<SliderKey, null>;
  icon: typeof AlignJustify;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

export const SETTERS: Record<string, keyof SliderValues> = {
  fontSize: 'setFontSize',
  lineSpacing: 'setLineSpacing',
  paragraphSpacing: 'setParagraphSpacing',
};

export const READER_TOOLBAR_VARIANTS = {
  hidden: {
    y: 'calc(100% + 24px)',
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: [0.32, 0.72, 0, 1],
    },
  },
  visible: {
    y: '0%',
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 420,
      damping: 34,
      mass: 0.9,
    },
  },
} as const;

export const READER_MENU_VARIANTS = {
  hidden: {
    opacity: 0,
    y: 8,
    scale: 0.98,
    transition: {
      duration: 0.16,
      ease: [0.32, 0.72, 0, 1],
    },
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 440,
      damping: 34,
      mass: 0.9,
    },
  },
} as const;

export function getIsDesktopViewport(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  return window.matchMedia('(min-width: 640px)').matches;
}

export function subscribeToDesktopViewport(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const mediaQuery = window.matchMedia('(min-width: 640px)');
  const handleChange = () => onStoreChange();

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }

  mediaQuery.addListener(handleChange);
  return () => mediaQuery.removeListener(handleChange);
}
