import type { OutputBundle, OutputChunk, Plugin } from 'rollup';

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { gzipSync } from 'zlib';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
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
const SHOULD_ANALYZE_BUNDLE = process.env.ANALYZE_BUNDLE === '1';

interface BundleChunkReport {
  dynamicImports: string[];
  facadeModuleId: string | null;
  fileName: string;
  gzipBytes: number;
  imports: string[];
  isDynamicEntry: boolean;
  isEntry: boolean;
  isWorker: boolean;
  moduleIds: string[];
  rawBytes: number;
}

interface BundleBudgetReport {
  chunks: BundleChunkReport[];
  generatedAt: string;
}

function isWorkerEntryChunk(chunk: OutputChunk): boolean {
  const moduleIds = [
    chunk.facadeModuleId,
    ...Object.keys(chunk.modules),
  ].filter((value): value is string => Boolean(value));

  return moduleIds.some((moduleId) => moduleId.includes('.worker.'));
}

function collectWorkerChunkFileNames(chunks: Map<string, OutputChunk>): Set<string> {
  const workerChunkFileNames = new Set<string>();
  const queue = [...chunks.values()]
    .filter((chunk) => isWorkerEntryChunk(chunk))
    .map((chunk) => chunk.fileName);

  while (queue.length > 0) {
    const fileName = queue.shift();
    if (!fileName || workerChunkFileNames.has(fileName)) {
      continue;
    }

    workerChunkFileNames.add(fileName);
    const chunk = chunks.get(fileName);
    if (!chunk) {
      continue;
    }

    chunk.imports.forEach((importedFileName) => {
      if (chunks.has(importedFileName)) {
        queue.push(importedFileName);
      }
    });
  }

  return workerChunkFileNames;
}

function createBundleBudgetReport(bundle: OutputBundle): BundleBudgetReport {
  const chunks = Object.values(bundle)
    .filter((output): output is OutputChunk => output.type === 'chunk');
  const chunkMap = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const workerChunkFileNames = collectWorkerChunkFileNames(chunkMap);

  return {
    chunks: chunks.map((chunk) => ({
      dynamicImports: [...chunk.dynamicImports],
      facadeModuleId: chunk.facadeModuleId,
      fileName: chunk.fileName,
      gzipBytes: gzipSync(Buffer.from(chunk.code)).byteLength,
      imports: [...chunk.imports],
      isDynamicEntry: chunk.isDynamicEntry,
      isEntry: chunk.isEntry,
      isWorker: workerChunkFileNames.has(chunk.fileName),
      moduleIds: Object.keys(chunk.modules).sort(),
      rawBytes: Buffer.byteLength(chunk.code, 'utf8'),
    })),
    generatedAt: new Date().toISOString(),
  };
}

function bundleBudgetReportPlugin(): Plugin {
  return {
    name: 'bundle-budget-report',
    generateBundle(_options, bundle) {
      const report = createBundleBudgetReport(bundle);
      this.emitFile({
        type: 'asset',
        fileName: 'analysis/bundle-budget-report.json',
        source: JSON.stringify(report, null, 2),
      });
    },
  };
}

function createBundleAnalyzerPlugins(): Plugin[] {
  if (!SHOULD_ANALYZE_BUNDLE) {
    return [];
  }

  return [
    visualizer({
      filename: 'dist/analysis/bundle-stats.html',
      gzipSize: true,
      open: false,
      template: 'treemap',
    }),
    visualizer({
      filename: 'dist/analysis/bundle-stats.json',
      gzipSize: true,
      open: false,
      template: 'raw-data',
    }),
  ];
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version}-${shortHash}`),
  },
  resolve: {
    alias: {
      '@application': resolve(__dirname, './src/application'),
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
    bundleBudgetReportPlugin(),
    ...createBundleAnalyzerPlugins(),
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
