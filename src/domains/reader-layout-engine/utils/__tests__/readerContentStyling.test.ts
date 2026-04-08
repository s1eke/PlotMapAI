import { describe, expect, it } from 'vitest';

import {
  READER_CONTENT_CLASS_NAMES,
  READER_CONTENT_MODE_CLASSES,
  READER_CONTENT_THEME_CLASSES,
} from '@domains/reader-shell/constants/readerContentContract';
import {
  READER_CONTENT_MEASURED_TOKEN_NAMES,
  READER_CONTENT_VISUAL_TOKEN_NAMES,
} from '@shared/reader-content';
import { READER_THEMES } from '@domains/reader-shell/constants/readerThemes';

import { resolveReaderContentRootProps } from '../readerContentStyling';

describe('readerContentStyling', () => {
  it('builds root classes with mode and theme modifiers', () => {
    const result = resolveReaderContentRootProps({
      contentWidth: 920,
      fontSize: 18,
      lineSpacing: 1.8,
      mode: 'scroll',
      paragraphSpacing: 24,
      readerTheme: 'night',
      theme: READER_THEMES.night,
    });

    expect(result.rootClassName).toContain(READER_CONTENT_CLASS_NAMES.root);
    expect(result.rootClassName).toContain(READER_CONTENT_MODE_CLASSES.scroll);
    expect(result.rootClassName).toContain(READER_CONTENT_THEME_CLASSES.night);
  });

  it('serializes measured typography tokens as px values', () => {
    const result = resolveReaderContentRootProps({
      contentWidth: 920,
      fontSize: 18,
      lineSpacing: 1.8,
      mode: 'scroll',
      paragraphSpacing: 24,
      readerTheme: 'paper',
      theme: READER_THEMES.paper,
    });
    const style = result.rootStyle as Record<string, string>;

    expect(style[READER_CONTENT_MEASURED_TOKEN_NAMES.fontSize]).toBe('18px');
    expect(style[READER_CONTENT_MEASURED_TOKEN_NAMES.lineHeight]).toBe('32.4px');
    expect(style[READER_CONTENT_MEASURED_TOKEN_NAMES.paragraphGap]).toBe('24px');
    expect(style[READER_CONTENT_VISUAL_TOKEN_NAMES.text]).toBe(
      READER_THEMES.paper.contentVariables[READER_CONTENT_VISUAL_TOKEN_NAMES.text],
    );
  });

  it('uses the provided content width when resolving heading typography', () => {
    const scrollResult = resolveReaderContentRootProps({
      contentWidth: 920,
      fontSize: 18,
      lineSpacing: 1.8,
      mode: 'scroll',
      paragraphSpacing: 24,
      readerTheme: 'paper',
      theme: READER_THEMES.paper,
    });
    const pagedResult = resolveReaderContentRootProps({
      contentWidth: 420,
      fontSize: 18,
      lineSpacing: 1.8,
      mode: 'paged',
      paragraphSpacing: 24,
      readerTheme: 'paper',
      theme: READER_THEMES.paper,
    });
    const scrollStyle = scrollResult.rootStyle as Record<string, string>;
    const pagedStyle = pagedResult.rootStyle as Record<string, string>;

    expect(scrollStyle[READER_CONTENT_MEASURED_TOKEN_NAMES.headingFontSize]).toBe('28px');
    expect(pagedStyle[READER_CONTENT_MEASURED_TOKEN_NAMES.headingFontSize]).toBe('24.3px');
  });
});
