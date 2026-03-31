import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
let shortHash = 'unknown';
try {
  shortHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  // git not available (e.g. shallow clone, npm publish, Docker build)
}

const base = process.env.VITE_BASE || '/';
const PWA_DEFAULT_SURFACE_COLOR = '#f8fafc';

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version}-${shortHash}`),
  },
  resolve: {
    alias: {
      '@app': resolve(__dirname, './src/app'),
      '@domains': resolve(__dirname, './src/domains'),
      '@shared': resolve(__dirname, './src/shared'),
      '@infra': resolve(__dirname, './src/infra'),
      '@test': resolve(__dirname, './src/test'),
    },
  },
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'PlotMapAI',
        short_name: 'PlotMapAI',
        description: 'AI 驱动的小说阅读器，支持章节分析与人物关系图可视化',
        theme_color: PWA_DEFAULT_SURFACE_COLOR,
        background_color: PWA_DEFAULT_SURFACE_COLOR,
        display: 'standalone',
        id: base,
        start_url: base,
        scope: base,
        file_handlers: [
          {
            action: base,
            accept: {
              'application/epub+zip': ['.epub'],
              'text/plain': ['.txt'],
            },
          },
        ],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: 'pwa-screenshots/bookshelf-mobile.png',
            sizes: '800x1734',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Bookshelf page',
          },
          {
            src: 'pwa-screenshots/book-detail-mobile.png',
            sizes: '800x1734',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Book detail page',
          },
          {
            src: 'pwa-screenshots/reader-mobile.png',
            sizes: '800x1734',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Reader page',
          },
          {
            src: 'pwa-screenshots/character-graph-mobile.png',
            sizes: '800x1734',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Character graph page',
          },
          {
            src: 'pwa-screenshots/settings-mobile.png',
            sizes: '800x1734',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Settings page',
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
});
