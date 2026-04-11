import { useState, useRef, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { AlignJustify, Columns2, List, MoreVertical, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/utils/cn';
import { READER_SLIDER_CONFIG, MOBILE_SLIDER_KEYS, OVERFLOW_SLIDER_KEYS } from '../constants/readerSliderConfig';
import { isPagedPageTurnMode, type ReaderPageTurnMode } from '../constants/pageTurnMode';
import { READER_THEME_DISPLAY } from '../constants/readerThemeConfig';
import {
  getIsDesktopViewport,
  READER_MENU_VARIANTS,
  READER_TOOLBAR_VARIANTS,
  type ReaderToolbarProps,
  type ResolvedSlider,
  SETTERS,
  type SliderKey,
  subscribeToDesktopViewport,
} from './readerToolbarShared';
import { getReaderChromeThemeClasses } from '../utils/readerChromeTheme';

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
  headerBgClassName,
  textClassName,
  setReaderTheme,
  hidden,
  isSidebarOpen,
  onToggleSidebar,
  onCloseSidebar,
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
  const {
    borderClassName,
    dividerClassName,
    hoverClassName,
  } = getReaderChromeThemeClasses(readerTheme);

  const toggleSlider = useCallback((key: SliderKey) => {
    setActiveSlider((prev) => (prev === key ? null : key));
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
      const btn = activeSlider ? buttonRefs.current[`${mode}-${activeSlider}`] : null;
      if (btn?.contains(target)) return;
      setActiveSlider(null);
      setOverflowOpen(false);
      setPageTurnModeOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [activeSlider, isDesktopViewport, overflowOpen, pageTurnModeOpen]);

  const resolvedSliders: ResolvedSlider[] = useMemo(() =>
    READER_SLIDER_CONFIG.map((cfg) => ({
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
  [sliders, t]);

  const desktopSliders = resolvedSliders;
  const mobileSliders = resolvedSliders.filter((s) => MOBILE_SLIDER_KEYS.includes(s.key));
  const overflowSliders = resolvedSliders.filter((s) => OVERFLOW_SLIDER_KEYS.includes(s.key));

  const themes = useMemo(() =>
    READER_THEME_DISPLAY.map((td) => ({ ...td, label: t(td.labelKey) })),
  [t]);

  const pageTurnModes = useMemo(() => ([
    { id: 'scroll', label: t('reader.pageTurnModes.scroll') },
    { id: 'cover', label: t('reader.pageTurnModes.cover') },
    { id: 'slide', label: t('reader.pageTurnModes.slide') },
    { id: 'none', label: t('reader.pageTurnModes.none') },
  ] satisfies Array<{ id: ReaderPageTurnMode; label: string }>), [t]);

  const mobileFontSlider = mobileSliders[0] ?? null;

  const runMobileAction = useCallback((action: () => void) => {
    if (isSidebarOpen) {
      if (onCloseSidebar) {
        onCloseSidebar();
      } else {
        onToggleSidebar?.();
      }
    }

    action();
  }, [isSidebarOpen, onCloseSidebar, onToggleSidebar]);

  const handleMobileSidebarToggle = useCallback(() => {
    setActiveSlider(null);
    setOverflowOpen(false);
    setPageTurnModeOpen(false);

    if (isSidebarOpen) {
      if (onCloseSidebar) {
        onCloseSidebar();
      } else {
        onToggleSidebar?.();
      }
      return;
    }

    onToggleSidebar?.();
  }, [isSidebarOpen, onCloseSidebar, onToggleSidebar]);

  const handleMobileSliderToggle = useCallback((key: SliderKey) => {
    runMobileAction(() => {
      setOverflowOpen(false);
      setPageTurnModeOpen(false);
      toggleSlider(key);
    });
  }, [runMobileAction, toggleSlider]);

  const handleMobilePageTurnToggle = useCallback(() => {
    runMobileAction(() => {
      setOverflowOpen(false);
      setActiveSlider(null);
      setPageTurnModeOpen((prev) => !prev);
    });
  }, [runMobileAction]);

  const handleMobileOverflowToggle = useCallback(() => {
    runMobileAction(() => {
      setPageTurnModeOpen(false);
      setActiveSlider(null);
      setOverflowOpen((prev) => !prev);
    });
  }, [runMobileAction]);

  function renderSliderButton(s: ResolvedSlider, mode: 'desktop' | 'mobile') {
    const isActiveMode = (mode === 'desktop') === isDesktopViewport;
    const isMobile = mode === 'mobile';

    return (
      <div key={`${mode}-${s.key}`} className="relative">
        <button
          ref={(el) => { buttonRefs.current[`${mode}-${s.key}`] = el; }}
          type="button"
          onClick={() => {
            if (isMobile) {
              handleMobileSliderToggle(s.key);
              return;
            }

            toggleSlider(s.key);
          }}
          className={cn(
            isMobile
              ? 'flex h-14 w-full flex-col items-center justify-center gap-1 rounded-2xl px-2 text-center transition-colors'
              : 'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
            activeSlider === s.key
              ? 'bg-accent text-white'
              : cn(textClassName, hoverClassName),
          )}
          title={s.label}
        >
          <s.icon className="w-4 h-4" />
          <span className={cn('font-medium', isMobile ? 'text-[11px]' : 'text-xs')}>{s.display}</span>
        </button>
        {activeSlider === s.key && isActiveMode && (
          <div
            ref={popoverRef}
            className={cn(
              'absolute border border-border-color bg-bg-secondary shadow-xl dark:bg-brand-800',
              isMobile
                ? 'bottom-full left-1/2 mb-2 w-[min(260px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl px-4 py-4'
                : 'bottom-full left-1/2 mb-3 min-w-[200px] -translate-x-1/2 rounded-xl px-5 py-4',
            )}
          >
            {!isMobile ? (
              <div className="absolute bottom-0 left-1/2 h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rotate-45 border-b border-r border-border-color bg-bg-secondary dark:bg-brand-800" />
            ) : null}
            <div className={cn('text-xs text-text-secondary', isMobile ? 'mb-3 text-left' : 'mb-2 text-center')}>{s.label}</div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={s.value}
                onChange={(e) => s.onChange(Number(e.target.value))}
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
          onChange={(e) => s.onChange(Number(e.target.value))}
          className="w-full accent-accent h-1.5 cursor-pointer"
        />
      </div>
    );
  }

  const currentPageTurnMode = pageTurnModes.find((mode) => mode.id === pageTurnMode);

  return (
    <>
      <motion.div
        initial={false}
        animate={hidden ? 'hidden' : 'visible'}
        variants={READER_TOOLBAR_VARIANTS}
        className={cn(
          'fixed bottom-6 left-1/2 z-40 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-border-color bg-bg-secondary/90 px-3 py-3 shadow-2xl backdrop-blur-xl hover:bg-bg-secondary dark:bg-brand-800/90 dark:hover:bg-brand-800 sm:flex sm:gap-4 sm:px-6 will-change-transform',
          hidden && 'pointer-events-none',
        )}
      >
        <div className="flex items-center gap-2 border-r border-border-color/50 pr-3 sm:pr-5">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev}
            className="rounded-full p-2 text-text-primary transition-colors hover:bg-muted-bg disabled:opacity-30 disabled:hover:bg-transparent"
            title={t(navigationMode === 'page' ? 'reader.prevPage' : 'reader.prev')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            className="rounded-full p-2 text-text-primary transition-colors hover:bg-muted-bg disabled:opacity-30 disabled:hover:bg-transparent"
            title={t(navigationMode === 'page' ? 'reader.nextPage' : 'reader.next')}
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        <div className="relative flex items-center gap-1 border-r border-border-color/50 pr-5">
          {desktopSliders.map((s) => renderSliderButton(s, 'desktop'))}
        </div>

        <div className="flex items-center gap-2 border-r border-border-color/50 pr-5">
          <button
            type="button"
            onClick={() => setPageTurnMode('scroll')}
            className={cn(
              'rounded-full p-2 transition-colors',
              !isPagedMode ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:bg-muted-bg hover:text-text-primary',
            )}
            title={t('reader.singleColumn')}
          >
            <AlignJustify className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setPageTurnMode('cover')}
            className={cn(
              'rounded-full p-2 transition-colors',
              isPagedMode ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:bg-muted-bg hover:text-text-primary',
            )}
            title={t('reader.twoColumn')}
          >
            <Columns2 className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {themes.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => setReaderTheme(theme.id)}
              className={cn(
                'flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border transition-all',
                readerTheme === theme.id ? 'scale-110 ring-2 ring-accent ring-offset-2 ring-offset-bg-secondary' : 'border-border-color hover:scale-105',
                theme.id === 'auto' && 'bg-gradient-to-tr from-white to-brand-900',
              )}
              style={{ backgroundColor: theme.id === 'auto' ? undefined : theme.color }}
              title={theme.label}
            >
              {theme.id === 'auto' ? <div className="sr-only">Auto</div> : null}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={false}
        animate={hidden ? 'hidden' : 'visible'}
        variants={READER_TOOLBAR_VARIANTS}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 border-t px-3 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] shadow-[0_-16px_40px_rgba(24,32,42,0.12)] backdrop-blur-xl sm:hidden will-change-transform',
          headerBgClassName,
          borderClassName,
          hidden && 'pointer-events-none',
        )}
      >
        <div className="grid grid-cols-4 gap-2">
          {onToggleSidebar ? (
            <button
              type="button"
              onClick={handleMobileSidebarToggle}
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-center transition-colors',
                isSidebarOpen ? 'bg-accent text-white shadow-sm' : cn(textClassName, hoverClassName),
              )}
              title={t('reader.contents')}
            >
              <List className="h-5 w-5" />
              <span className="text-[11px] font-medium">{t('reader.contents')}</span>
            </button>
          ) : (
            <div />
          )}

          <div className="relative">
            {mobileFontSlider ? renderSliderButton(mobileFontSlider, 'mobile') : null}
          </div>

          <div className="relative">
            <button
              ref={pageTurnModeBtnRef}
              type="button"
              onClick={handleMobilePageTurnToggle}
              className={cn(
                'flex h-14 w-full flex-col items-center justify-center gap-1 rounded-2xl px-2 text-center transition-colors',
                pageTurnModeOpen ? 'bg-accent text-white shadow-sm' : cn(textClassName, hoverClassName),
              )}
              title={t('reader.pageTurnMode')}
            >
              {isPagedMode ? <Columns2 className="h-5 w-5" /> : <AlignJustify className="h-5 w-5" />}
              <span className="text-[11px] font-medium">{currentPageTurnMode?.label ?? t('reader.pageTurnMode')}</span>
            </button>
            <AnimatePresence initial={false}>
              {pageTurnModeOpen ? (
                <motion.div
                  ref={pageTurnModeRef}
                  variants={READER_MENU_VARIANTS}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  className={cn(
                    'absolute bottom-full left-1/2 mb-2 w-[min(220px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border px-2 py-2 shadow-xl',
                    headerBgClassName,
                    borderClassName,
                  )}
                >
                  <div className="px-2 pb-2 pt-1 text-xs text-text-secondary">{t('reader.pageTurnMode')}</div>
                  <div className="space-y-1">
                    {pageTurnModes.map((mode) => (
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
                            : cn(textClassName, hoverClassName),
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

          <div className="relative">
            <button
              ref={overflowBtnRef}
              type="button"
              onClick={handleMobileOverflowToggle}
              className={cn(
                'flex h-14 w-full flex-col items-center justify-center gap-1 rounded-2xl px-2 text-center transition-colors',
                overflowOpen ? 'bg-accent text-white shadow-sm' : cn(textClassName, hoverClassName),
              )}
              title={t('reader.moreSettings')}
            >
              <MoreVertical className="h-5 w-5" />
              <span className="text-[11px] font-medium">{t('reader.moreSettings')}</span>
            </button>
            <AnimatePresence initial={false}>
              {overflowOpen ? (
                <motion.div
                  ref={overflowRef}
                  variants={READER_MENU_VARIANTS}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  className={cn(
                    'absolute bottom-full right-0 mb-2 w-[min(280px,calc(100vw-1.5rem))] space-y-4 rounded-2xl border px-5 py-4 shadow-xl',
                    headerBgClassName,
                    borderClassName,
                  )}
                >
                  {overflowSliders.map(renderSliderRow)}

                  <div className={cn('space-y-2 border-t pt-2', dividerClassName)}>
                    <span className="text-xs text-text-secondary">{t('reader.background')}</span>
                    <div className="flex items-center gap-3">
                      {themes.map((theme) => (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => setReaderTheme(theme.id)}
                          className={cn(
                            'flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border transition-all',
                            readerTheme === theme.id ? 'scale-110 ring-2 ring-accent ring-offset-2 ring-offset-bg-secondary' : 'border-border-color hover:scale-105',
                            theme.id === 'auto' && 'bg-gradient-to-tr from-white to-brand-900',
                          )}
                          style={{ backgroundColor: theme.id === 'auto' ? undefined : theme.color }}
                          title={theme.label}
                        >
                          {theme.id === 'auto' ? <div className="sr-only">Auto</div> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </>
  );
}
