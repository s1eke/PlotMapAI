import { describe, expect, it } from 'vitest';
import { READER_SLIDER_CONFIG, MOBILE_SLIDER_KEYS, OVERFLOW_SLIDER_KEYS } from '../readerSliderConfig';
import { READER_THEME_DISPLAY } from '../readerThemeConfig';
import { READER_THEMES } from '../readerThemes';

describe('READER_SLIDER_CONFIG', () => {
  it('exports exactly 3 slider configs', () => {
    expect(READER_SLIDER_CONFIG).toHaveLength(3);
  });

  it('has valid min < max for every slider', () => {
    for (const cfg of READER_SLIDER_CONFIG) {
      expect(cfg.min).toBeLessThan(cfg.max);
      expect(cfg.step).toBeGreaterThan(0);
    }
  });

  it('each config has required keys', () => {
    for (const cfg of READER_SLIDER_CONFIG) {
      expect(cfg).toHaveProperty('key');
      expect(cfg).toHaveProperty('icon');
      expect(cfg).toHaveProperty('labelKey');
      expect(cfg).toHaveProperty('format');
      expect(typeof cfg.format).toBe('function');
    }
  });

  it('format returns string for boundary values', () => {
    for (const cfg of READER_SLIDER_CONFIG) {
      expect(typeof cfg.format(cfg.min)).toBe('string');
      expect(typeof cfg.format(cfg.max)).toBe('string');
    }
  });

  it('covers expected slider keys', () => {
    const keys = READER_SLIDER_CONFIG.map((c) => c.key);
    expect(keys).toContain('fontSize');
    expect(keys).toContain('lineSpacing');
    expect(keys).toContain('paragraphSpacing');
  });
});

describe('MOBILE_SLIDER_KEYS', () => {
  it('contains only fontSize', () => {
    expect(MOBILE_SLIDER_KEYS).toEqual(['fontSize']);
  });
});

describe('OVERFLOW_SLIDER_KEYS', () => {
  it('contains lineSpacing and paragraphSpacing', () => {
    expect(OVERFLOW_SLIDER_KEYS).toEqual(['lineSpacing', 'paragraphSpacing']);
  });

  it('does not overlap with MOBILE_SLIDER_KEYS', () => {
    const overlap = OVERFLOW_SLIDER_KEYS.filter((k) => MOBILE_SLIDER_KEYS.includes(k));
    expect(overlap).toHaveLength(0);
  });
});

describe('READER_THEME_DISPLAY', () => {
  it('exports exactly 5 theme display configs', () => {
    expect(READER_THEME_DISPLAY).toHaveLength(5);
  });

  it('each config has id, color, and labelKey', () => {
    for (const cfg of READER_THEME_DISPLAY) {
      expect(typeof cfg.id).toBe('string');
      expect(cfg.id.length).toBeGreaterThan(0);
      expect(typeof cfg.color).toBe('string');
      expect(cfg.color.length).toBeGreaterThan(0);
      expect(typeof cfg.labelKey).toBe('string');
      expect(cfg.labelKey.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids', () => {
    const ids = READER_THEME_DISPLAY.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('READER_THEMES', () => {
  it('exports a record with at least 5 themes', () => {
    const keys = Object.keys(READER_THEMES);
    expect(keys.length).toBeGreaterThanOrEqual(5);
  });

  it('each theme has required fields', () => {
    for (const [key, theme] of Object.entries(READER_THEMES)) {
      expect(theme.id).toBe(key);
      expect(typeof theme.bg).toBe('string');
      expect(theme.bg.length).toBeGreaterThan(0);
      expect(typeof theme.text).toBe('string');
      expect(theme.text.length).toBeGreaterThan(0);
      expect(typeof theme.sidebarBg).toBe('string');
      expect(theme.sidebarBg.length).toBeGreaterThan(0);
    }
  });

  it('theme display ids match reader theme keys', () => {
    const displayIds = READER_THEME_DISPLAY.map((c) => c.id);
    const themeKeys = Object.keys(READER_THEMES);
    for (const id of displayIds) {
      expect(themeKeys).toContain(id);
    }
  });
});
