import { useState, useRef, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { AlignJustify, Columns2, List, MoreVertical, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/utils/cn';
import { READER_SLIDER_CONFIG, MOBILE_SLIDER_KEYS, OVERFLOW_SLIDER_KEYS } from '../constants/readerSliderConfig';
import { isPagedPageTurnMode, type ReaderPageTurnMode } from '../constants/pageTurnMode';
import { READER_THEME_DISPLAY } from '../constants/readerThemeConfig';

interface SliderValues {
  fontSize: number;
  setFontSize: (size: number) => void;
  lineSpacing: number;
  setLineSpacing: (spacing: number) => void;
  paragraphSpacing: number;
  setParagraphSpacing: (spacing: number) => void;
}

interface ReaderToolbarProps {
  sliders: SliderValues;
  pageTurnMode: ReaderPageTurnMode;
  setPageTurnMode: (mode: ReaderPageTurnMode) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  navigationMode: 'chapter' | 'page';
  readerTheme: string;
  setReaderTheme: (theme: string) => void;
  hidden?: boolean;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

type SliderKey = 'fontSize' | 'lineSpacing' | 'paragraphSpacing' | null;

interface ResolvedSlider {
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

const SETTERS: Record<string, keyof SliderValues> = {
  fontSize: 'setFontSize',
  lineSpacing: 'setLineSpacing',
  paragraphSpacing: 'setParagraphSpacing',
};

const READER_TOOLBAR_VARIANTS = {
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

const READER_MENU_VARIANTS = {
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

function getIsDesktopViewport(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  return window.matchMedia('(min-width: 640px)').matches;
}

function subscribeToDesktopViewport(onStoreChange: () => void): () => void {
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

export default function ReaderToolbar({
  sliders,
  pageTurnMode,
  setPageTurnMode,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  navigationMode,
  readerTheme,
  setReaderTheme,
  hidden,
  isSidebarOpen,
  onToggleSidebar,
}: ReaderToolbarProps) {
  const { t } = useTranslation();
  const [activeSlider, setActiveSlider] = useState<SliderKey>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [pageTurnModeOpen, setPageTurnModeOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const pageTurnModeRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const overflowBtnRef = useRef<HTMLButtonElement>(null);
  const pageTurnModeBtnRef = useRef<HTMLButtonElement>(null);
  const isDesktopViewport = useSyncExternalStore(
    subscribeToDesktopViewport,
    getIsDesktopViewport,
    () => true,
  );
  const isPagedMode = isPagedPageTurnMode(pageTurnMode);

  const toggleSlider = useCallback((key: SliderKey) => {
    setActiveSlider(prev => prev === key ? null : key);
  }, []);

  useEffect(() => {
    if (!activeSlider && !overflowOpen && !pageTurnModeOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (overflowRef.current?.contains(target)) return;
      if (pageTurnModeRef.current?.contains(target)) return;
      if (overflowBtnRef.current?.contains(target)) return;
      if (pageTurnModeBtnRef.current?.contains(target)) return;
      const mode = isDesktopViewport ? 'desktop' : 'mobile';
      const btn = activeSlider ? buttonRefs.current[mode + '-' + activeSlider] : null;
      if (btn?.contains(target)) return;
      setActiveSlider(null);
      setOverflowOpen(false);
      setPageTurnModeOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [activeSlider, isDesktopViewport, overflowOpen, pageTurnModeOpen]);

  const resolvedSliders: ResolvedSlider[] = useMemo(() =>
    READER_SLIDER_CONFIG.map(cfg => ({
      key: cfg.key,
      icon: cfg.icon,
      label: t(cfg.labelKey),
      value: sliders[cfg.key],
      display: cfg.format(sliders[cfg.key]),
      min: cfg.min,
      max: cfg.max,
      step: cfg.step,
      onChange: sliders[SETTERS[cfg.key]] as (v: number) => void,
    })),
    [sliders, t],
  );

  const desktopSliders = resolvedSliders;
  const mobileSliders = resolvedSliders.filter(s => MOBILE_SLIDER_KEYS.includes(s.key));
  const overflowSliders = resolvedSliders.filter(s => OVERFLOW_SLIDER_KEYS.includes(s.key));

  const themes = useMemo(() =>
    READER_THEME_DISPLAY.map(td => ({ ...td, label: t(td.labelKey) })),
    [t],
  );

  const pageTurnModes = useMemo(() => ([
    { id: 'scroll', label: t('reader.pageTurnModes.scroll') },
    { id: 'cover', label: t('reader.pageTurnModes.cover') },
    { id: 'slide', label: t('reader.pageTurnModes.slide') },
    { id: 'none', label: t('reader.pageTurnModes.none') },
  ] satisfies Array<{ id: ReaderPageTurnMode; label: string }>), [t]);

  function renderSliderButton(s: ResolvedSlider, mode: 'desktop' | 'mobile') {
    const isActiveMode = (mode === 'desktop') === isDesktopViewport;

    return (
      <div key={`${mode}-${s.key}`} className="relative">
        <button
          ref={el => { buttonRefs.current[mode + '-' + s.key] = el; }}
          onClick={() => toggleSlider(s.key)}
          className={cn(
            "px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm transition-colors",
            activeSlider === s.key ? "bg-accent text-white" : "hover:bg-muted-bg text-text-primary"
          )}
          title={s.label}
        >
          <s.icon className="w-4 h-4" />
          <span className="font-medium text-xs">{s.display}</span>
        </button>
        {activeSlider === s.key && isActiveMode && (
          <div
            ref={popoverRef}
            className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-bg-secondary dark:bg-brand-800 border border-border-color rounded-xl px-5 py-4 shadow-xl min-w-[200px]"
          >
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2.5 h-2.5 bg-bg-secondary dark:bg-brand-800 border-r border-b border-border-color" />
            <div className="text-xs text-text-secondary mb-2 text-center">{s.label}</div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={s.value}
                onChange={e => s.onChange(Number(e.target.value))}
                className="flex-1 accent-accent h-1.5 cursor-pointer"
              />
              <span className="text-sm font-mono text-text-primary min-w-[3.5ch] text-right">{s.display}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderSliderRow(s: ResolvedSlider) {
    return (
      <div key={s.key} className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">{s.label}</span>
          <span className="text-xs font-mono text-text-primary">{s.display}</span>
        </div>
        <input
          type="range"
          min={s.min}
          max={s.max}
          step={s.step}
          value={s.value}
          onChange={e => s.onChange(Number(e.target.value))}
          className="w-full accent-accent h-1.5 cursor-pointer"
        />
      </div>
    );
  }

  return (
    <motion.div
      initial={false}
      animate={hidden ? 'hidden' : 'visible'}
      variants={READER_TOOLBAR_VARIANTS}
      className={cn(
        'fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border-color bg-bg-secondary/90 px-3 py-3 shadow-2xl backdrop-blur-xl hover:bg-bg-secondary dark:bg-brand-800/90 dark:hover:bg-brand-800 sm:gap-4 sm:px-6 will-change-transform',
        hidden && 'pointer-events-none',
      )}
    >

      {/* Mobile: TOC button (first position, replaces prev/next) */}
      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          className={cn(
            "p-2 rounded-full transition-colors sm:hidden border-r border-border-color/50 pr-3",
            isSidebarOpen ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-primary hover:bg-muted-bg"
          )}
          title={t('reader.contents')}
        >
          <List className="w-5 h-5" />
        </button>
      )}

      <div className="hidden sm:flex items-center gap-2 border-r border-border-color/50 pr-3 sm:pr-5">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="p-2 rounded-full hover:bg-muted-bg disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-text-primary"
          title={t(navigationMode === 'page' ? 'reader.prevPage' : 'reader.prev')}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="p-2 rounded-full hover:bg-muted-bg disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-text-primary"
          title={t(navigationMode === 'page' ? 'reader.nextPage' : 'reader.next')}
        >
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      {/* Desktop: all sliders inline */}
      <div className="hidden sm:flex items-center gap-1 border-r border-border-color/50 pr-5 relative">
        {desktopSliders.map(s => renderSliderButton(s, 'desktop'))}
      </div>

      {/* Mobile: only font size */}
      <div className="flex sm:hidden items-center gap-1 border-r border-border-color/50 pr-3 relative">
        {mobileSliders.map(s => renderSliderButton(s, 'mobile'))}
      </div>

      <div className="flex items-center gap-2 border-r border-border-color/50 pr-3 sm:pr-5">
        <div className="relative sm:hidden">
          <button
            ref={pageTurnModeBtnRef}
            onClick={() => {
              setPageTurnModeOpen(prev => !prev);
              setOverflowOpen(false);
              setActiveSlider(null);
            }}
            className={cn(
              "p-2 rounded-full transition-colors",
              pageTurnModeOpen ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-primary hover:bg-muted-bg"
            )}
            title={t('reader.pageTurnMode')}
          >
            {isPagedMode ? <Columns2 className="w-5 h-5" /> : <AlignJustify className="w-5 h-5" />}
          </button>
          <AnimatePresence initial={false}>
            {pageTurnModeOpen ? (
              <motion.div
                ref={pageTurnModeRef}
                variants={READER_MENU_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="absolute bottom-full left-1/2 mb-3 min-w-[176px] -translate-x-1/2 rounded-xl border border-border-color bg-bg-secondary px-2 py-2 shadow-xl dark:bg-brand-800"
              >
                <div className="absolute bottom-0 left-1/2 h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rotate-45 border-b border-r border-border-color bg-bg-secondary dark:bg-brand-800" />
                <div className="px-2 pb-2 pt-1 text-xs text-text-secondary">{t('reader.pageTurnMode')}</div>
                <div className="space-y-1">
                  {pageTurnModes.map(mode => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setPageTurnMode(mode.id);
                        setPageTurnModeOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        pageTurnMode === mode.id
                          ? 'bg-accent text-white'
                          : 'text-text-primary hover:bg-muted-bg',
                      )}
                      title={mode.label}
                    >
                      <span>{mode.label}</span>
                      {pageTurnMode === mode.id ? <Check className="h-4 w-4" /> : null}
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Desktop: two separate buttons */}
        <button
          onClick={() => setPageTurnMode('scroll')}
          className={cn(
            "p-2 rounded-full transition-colors hidden sm:block",
            !isPagedMode ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-primary hover:bg-muted-bg"
          )}
          title={t('reader.singleColumn')}
        >
          <AlignJustify className="w-5 h-5" />
        </button>
        <button
          onClick={() => setPageTurnMode('cover')}
          className={cn(
            "p-2 rounded-full transition-colors hidden sm:block",
            isPagedMode ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-primary hover:bg-muted-bg"
          )}
          title={t('reader.twoColumn')}
        >
          <Columns2 className="w-5 h-5" />
        </button>
      </div>

      {/* Desktop: themes inline */}
      <div className="hidden sm:flex items-center gap-2">
        {themes.map(theme => (
          <button
            key={theme.id}
            onClick={() => setReaderTheme(theme.id)}
            className={cn(
              "w-6 h-6 rounded-full border transition-all flex items-center justify-center overflow-hidden",
              readerTheme === theme.id ? "ring-2 ring-accent ring-offset-2 ring-offset-bg-secondary scale-110" : "border-border-color hover:scale-105",
              theme.id === 'auto' && "bg-gradient-to-tr from-white to-brand-900"
            )}
            style={{ backgroundColor: theme.id === 'auto' ? undefined : theme.color }}
            title={theme.label}
          >
            {theme.id === 'auto' && <div className="sr-only">Auto</div>}
          </button>
        ))}
      </div>

      {/* Mobile: overflow menu for spacing + themes */}
      <div className="relative sm:hidden">
        <button
          ref={overflowBtnRef}
          onClick={() => {
            setOverflowOpen(prev => !prev);
            setPageTurnModeOpen(false);
            setActiveSlider(null);
          }}
          className={cn(
            "p-2 rounded-full transition-colors",
            overflowOpen ? "bg-accent text-white" : "text-text-primary hover:bg-muted-bg"
          )}
          title={t('reader.moreSettings')}
        >
          <MoreVertical className="w-5 h-5" />
        </button>
        <AnimatePresence initial={false}>
          {overflowOpen ? (
            <motion.div
              ref={overflowRef}
              variants={READER_MENU_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="absolute bottom-full right-0 mb-3 min-w-[220px] space-y-4 rounded-xl border border-border-color bg-bg-secondary px-5 py-4 shadow-xl dark:bg-brand-800"
            >
              <div className="absolute bottom-0 right-5 h-2.5 w-2.5 translate-y-1/2 rotate-45 border-b border-r border-border-color bg-bg-secondary dark:bg-brand-800" />

              {overflowSliders.map(renderSliderRow)}

              <div className="space-y-2 border-t border-border-color/50 pt-2">
                <span className="text-xs text-text-secondary">{t('reader.background')}</span>
                <div className="flex items-center gap-3">
                  {themes.map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => setReaderTheme(theme.id)}
                      className={cn(
                        "w-7 h-7 rounded-full border transition-all flex items-center justify-center overflow-hidden",
                        readerTheme === theme.id ? "ring-2 ring-accent ring-offset-2 ring-offset-bg-secondary scale-110" : "border-border-color hover:scale-105",
                        theme.id === 'auto' && "bg-gradient-to-tr from-white to-brand-900"
                      )}
                      style={{ backgroundColor: theme.id === 'auto' ? undefined : theme.color }}
                      title={theme.label}
                    >
                      {theme.id === 'auto' && <div className="sr-only">Auto</div>}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
