export interface ReaderChromeThemeClasses {
  borderClassName: string;
  dividerClassName: string;
  hoverClassName: string;
  segmentedControlClassName: string;
}

export function getReaderChromeThemeClasses(readerTheme: string): ReaderChromeThemeClasses {
  const isNightTheme = readerTheme === 'night';
  const isAutoTheme = readerTheme === 'auto';

  return {
    borderClassName: isAutoTheme
      ? 'border-border-color/20'
      : isNightTheme
        ? 'border-white/10'
        : 'border-black/[0.06]',
    dividerClassName: isAutoTheme
      ? 'border-border-color/50'
      : isNightTheme
        ? 'border-white/10'
        : 'border-black/[0.08]',
    hoverClassName: isAutoTheme
      ? 'hover:bg-muted-bg'
      : isNightTheme
        ? 'hover:bg-white/10'
        : 'hover:bg-black/[0.05]',
    segmentedControlClassName: isAutoTheme
      ? 'bg-muted-bg/90 border-border-color/50 shadow-inner'
      : isNightTheme
        ? 'bg-white/[0.06] border-white/10 shadow-inner shadow-black/20'
        : 'bg-black/[0.035] border-black/[0.06] shadow-inner shadow-black/[0.04]',
  };
}
