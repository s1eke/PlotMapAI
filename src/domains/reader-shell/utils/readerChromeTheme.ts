export interface ReaderChromeThemeClasses {
  borderClassName: string;
  dividerClassName: string;
  hoverClassName: string;
  segmentedControlClassName: string;
}

export function getReaderChromeThemeClasses(
  readerTheme: string,
): ReaderChromeThemeClasses {
  const isNightTheme = readerTheme === 'night';
  const isAutoTheme = readerTheme === 'auto';

  function resolveThemeClass(
    autoClassName: string,
    nightClassName: string,
    defaultClassName: string,
  ): string {
    if (isAutoTheme) return autoClassName;
    if (isNightTheme) return nightClassName;
    return defaultClassName;
  }

  return {
    borderClassName: resolveThemeClass(
      'border-border-color/20',
      'border-white/10',
      'border-black/[0.06]',
    ),
    dividerClassName: resolveThemeClass(
      'border-border-color/50',
      'border-white/10',
      'border-black/[0.08]',
    ),
    hoverClassName: resolveThemeClass(
      'hover:bg-muted-bg',
      'hover:bg-white/10',
      'hover:bg-black/[0.05]',
    ),
    segmentedControlClassName: resolveThemeClass(
      'bg-muted-bg/90 border-border-color/50 shadow-inner',
      'bg-white/[0.06] border-white/10 shadow-inner shadow-black/20',
      'bg-black/[0.035] border-black/[0.06] shadow-inner shadow-black/[0.04]',
    ),
  };
}
