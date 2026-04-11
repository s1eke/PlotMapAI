import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('PWA icon assets', () => {
  it('exposes a committed brand source asset and generated icon set', () => {
    const assetPaths = [
      'public/brand-symbol.svg',
      'public/favicon.svg',
      'public/favicon.ico',
      'public/favicon-16x16.png',
      'public/favicon-32x32.png',
      'public/apple-touch-icon.png',
      'public/pwa-192x192.png',
      'public/pwa-512x512.png',
      'public/pwa-maskable-192x192.png',
      'public/pwa-maskable-512x512.png',
      'public/pwa-screenshots/bookshelf-mobile.png',
      'public/pwa-screenshots/book-detail-mobile.png',
      'public/pwa-screenshots/reader-mobile.png',
      'public/pwa-screenshots/character-graph-mobile.png',
      'public/pwa-screenshots/settings-mobile.png',
    ].map((relativePath) => resolve(process.cwd(), relativePath));

    for (const assetPath of assetPaths) {
      expect(existsSync(assetPath)).toBe(true);
      expect(statSync(assetPath).size).toBeGreaterThan(0);
    }

    const brandSvg = readFileSync(resolve(process.cwd(), 'public/brand-symbol.svg'), 'utf8');
    expect(brandSvg).toContain('<title>PlotMapAI Symbol</title>');
    expect(brandSvg).toContain('Minimal symbol for PlotMapAI');
  });

  it('uses dedicated maskable icon files in the manifest config', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain("src: 'pwa-maskable-192x192.png'");
    expect(viteConfig).toContain("src: 'pwa-maskable-512x512.png'");
    expect(viteConfig).not.toContain("purpose: 'any maskable'");
  });

  it('declares narrow-form-factor screenshots in the manifest config', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain('screenshots: [');
    expect(viteConfig).toContain("src: 'pwa-screenshots/bookshelf-mobile.png'");
    expect(viteConfig).toContain("src: 'pwa-screenshots/book-detail-mobile.png'");
    expect(viteConfig).toContain("src: 'pwa-screenshots/reader-mobile.png'");
    expect(viteConfig).toContain("src: 'pwa-screenshots/character-graph-mobile.png'");
    expect(viteConfig).toContain("src: 'pwa-screenshots/settings-mobile.png'");
    expect(viteConfig).toContain("form_factor: 'narrow'");
  });

  it('uses the light app surface as the default PWA colors', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain("const PWA_DEFAULT_SURFACE_COLOR = '#f8fafc'");
    expect(viteConfig).toContain('theme_color: PWA_DEFAULT_SURFACE_COLOR');
    expect(viteConfig).toContain('background_color: PWA_DEFAULT_SURFACE_COLOR');
  });

  it('registers native file handlers for supported novel formats', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain('file_handlers: [');
    expect(viteConfig).toContain("'application/epub+zip': ['.epub']");
    expect(viteConfig).toContain("'text/plain': ['.txt']");
  });

  it('lets the updated service worker take control immediately after activation', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain('workbox: {');
    expect(viteConfig).toContain('clientsClaim: true');
  });

  it('commits generated Android maskable icon assets', () => {
    const maskable192 = resolve(process.cwd(), 'public/pwa-maskable-192x192.png');
    const maskable512 = resolve(process.cwd(), 'public/pwa-maskable-512x512.png');

    expect(existsSync(maskable192)).toBe(true);
    expect(existsSync(maskable512)).toBe(true);
    expect(statSync(maskable192).size).toBeGreaterThan(0);
    expect(statSync(maskable512).size).toBeGreaterThan(0);
  });
});
