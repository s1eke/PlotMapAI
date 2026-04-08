import { readdirSync, readFileSync, statSync } from 'fs';
import { extname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

export const READER_FILE_LINE_LIMIT = 500;

const READER_SOURCE_DIRECTORIES = [
  'src/application/pages/reader',
  'src/domains',
];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const RESTRICTED_READER_IMPORT = /from\s+['"](@domains\/reader-(?:content|session|shell)(?:\/[^'"]*)?)['"]/g;
const READER_FAMILY_DEEP_IMPORT = /from\s+['"](@domains\/reader-[^/'"]+\/[^'"]+)['"]/g;
const PASS_THROUGH_EXPORT_LINE = /^export\s+(type\s+)?\{[^}]+\}\s+from\s+['"][^'"]+['"];?$/;
const PASS_THROUGH_EXPORT_STAR_LINE = /^export\s+\*\s+from\s+['"][^'"]+['"];?$/;
const READER_LAYOUT_ENGINE_ROOT_BARREL_PATH = 'src/domains/reader-layout-engine/index.ts';
const READER_CONTENT_ROOT_BARREL_PATH = 'src/domains/reader-content/index.ts';
const ALLOWED_READER_LAYOUT_ENGINE_ROOT_EXPORT_LINES = new Set([
  "export { PagedReaderContent } from './paged-runtime';",
  "export { usePagedReaderController as usePagedReaderViewportController } from './paged-runtime';",
  "export type { UsePagedReaderControllerResult as UsePagedReaderViewportControllerResult } from './paged-runtime';",
  "export { ScrollReaderContent } from './scroll-runtime';",
  "export { useScrollReaderController as useScrollReaderViewportController } from './scroll-runtime';",
  "export type { UseScrollReaderControllerResult as UseScrollReaderViewportControllerResult } from './scroll-runtime';",
  "export { SummaryReaderContent } from './layout-core';",
  "export { resolveReaderContentRootProps } from './layout-core';",
  "export type { ReaderContentRootProps, ReaderContentRootTheme } from './layout-core';",
  "export { clearReaderRenderCacheMemoryForNovel, deletePersistedReaderRenderCache } from './render-cache';",
]);
const ALLOWED_READER_CONTENT_ROOT_EXPORT_LINES = new Set([
  "export type { Chapter, ChapterContent, ReaderChapterCacheApi } from '@shared/contracts/reader';",
  "export { useReaderChapterData } from './hooks/useReaderChapterData';",
  'export type {',
  'ReaderHydrateDataResult,',
  'ReaderLoadActiveChapterParams,',
  'ReaderLoadActiveChapterResult,',
  'ReaderLoadActiveChapterRuntime,',
  'UseReaderChapterDataResult,',
  '} from \'./hooks/useReaderChapterData\';',
]);

function isReaderFamilyPath(filePath) {
  return filePath.startsWith('src/domains/reader-')
    || filePath.startsWith('src/application/pages/reader/');
}

function shouldIncludeFile(filePath) {
  return (
    isReaderFamilyPath(filePath)
    && SOURCE_EXTENSIONS.has(extname(filePath))
    && !filePath.includes('/__tests__/')
  );
}

function walkDirectory(rootDirectory, currentDirectory = rootDirectory) {
  const entries = readdirSync(currentDirectory).sort();
  const results = [];

  for (const entry of entries) {
    const absolutePath = resolve(currentDirectory, entry);
    const entryStats = statSync(absolutePath);
    if (entryStats.isDirectory()) {
      results.push(...walkDirectory(rootDirectory, absolutePath));
      continue;
    }

    results.push(relative(rootDirectory, absolutePath));
  }

  return results;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

export function countFileLines(source) {
  if (source.length === 0) {
    return 0;
  }

  return source.split(/\r?\n/).length;
}

export function findRestrictedReaderImports(filePath, source) {
  if (!filePath.startsWith('src/domains/reader-layout-engine/')) {
    return [];
  }

  const matches = [];
  for (const match of source.matchAll(RESTRICTED_READER_IMPORT)) {
    matches.push(match[1]);
  }

  return matches;
}

export function findReaderFamilyDeepImports(filePath, source) {
  if (!isReaderFamilyPath(filePath)) {
    return [];
  }

  const matches = [];
  for (const match of source.matchAll(READER_FAMILY_DEEP_IMPORT)) {
    matches.push(match[1]);
  }

  return matches;
}

export function isPassThroughReaderFile(filePath, source) {
  if (!filePath.startsWith('src/domains/reader-')) {
    return false;
  }
  if (filePath.endsWith('/index.ts') || filePath.endsWith('/index.tsx')) {
    return false;
  }

  const significantLines = stripComments(source)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (significantLines.length === 0) {
    return false;
  }

  return significantLines.every((line) => (
    PASS_THROUGH_EXPORT_LINE.test(line) || PASS_THROUGH_EXPORT_STAR_LINE.test(line)
  ));
}

export function findInvalidReaderLayoutEngineRootExports(filePath, source) {
  if (filePath !== READER_LAYOUT_ENGINE_ROOT_BARREL_PATH) {
    return [];
  }

  return stripComments(source)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !ALLOWED_READER_LAYOUT_ENGINE_ROOT_EXPORT_LINES.has(line));
}

export function findInvalidReaderContentRootExports(filePath, source) {
  if (filePath !== READER_CONTENT_ROOT_BARREL_PATH) {
    return [];
  }

  return stripComments(source)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !ALLOWED_READER_CONTENT_ROOT_EXPORT_LINES.has(line));
}

export function evaluateReaderArchitecture(
  files,
  options = {},
) {
  const maxFileLines = options.maxFileLines ?? READER_FILE_LINE_LIMIT;
  const oversizedFiles = [];
  const restrictedImports = [];
  const readerFamilyDeepImports = [];
  const passThroughFiles = [];
  const invalidReaderContentRootExports = [];
  const invalidRootBarrelExports = [];

  Object.entries(files).forEach(([filePath, source]) => {
    const lineCount = countFileLines(source);
    if (lineCount > maxFileLines) {
      oversizedFiles.push({ filePath, lineCount });
    }

    findRestrictedReaderImports(filePath, source).forEach((specifier) => {
      restrictedImports.push({ filePath, specifier });
    });

    findReaderFamilyDeepImports(filePath, source).forEach((specifier) => {
      readerFamilyDeepImports.push({ filePath, specifier });
    });

    if (isPassThroughReaderFile(filePath, source)) {
      passThroughFiles.push(filePath);
    }

    findInvalidReaderContentRootExports(filePath, source).forEach((line) => {
      invalidReaderContentRootExports.push({ filePath, line });
    });

    findInvalidReaderLayoutEngineRootExports(filePath, source).forEach((line) => {
      invalidRootBarrelExports.push({ filePath, line });
    });
  });

  return {
    invalidReaderContentRootExports: invalidReaderContentRootExports.sort((left, right) => (
      left.filePath.localeCompare(right.filePath) || left.line.localeCompare(right.line)
    )),
    invalidRootBarrelExports: invalidRootBarrelExports.sort((left, right) => (
      left.filePath.localeCompare(right.filePath) || left.line.localeCompare(right.line)
    )),
    oversizedFiles: oversizedFiles.sort((left, right) => right.lineCount - left.lineCount),
    passThroughFiles: passThroughFiles.sort(),
    readerFamilyDeepImports: readerFamilyDeepImports.sort((left, right) => (
      left.filePath.localeCompare(right.filePath)
      || left.specifier.localeCompare(right.specifier)
    )),
    restrictedImports: restrictedImports.sort((left, right) => (
      left.filePath.localeCompare(right.filePath)
      || left.specifier.localeCompare(right.specifier)
    )),
  };
}

function collectReaderFiles(rootDirectory, requestedPaths = []) {
  const requested = new Set(requestedPaths.filter((path) => shouldIncludeFile(path)));
  const discoveredPaths = requested.size > 0
    ? [...requested]
    : READER_SOURCE_DIRECTORIES.flatMap((directory) => {
      const absoluteDirectory = resolve(rootDirectory, directory);
      return walkDirectory(rootDirectory, absoluteDirectory)
        .filter((filePath) => shouldIncludeFile(filePath));
    });

  return Object.fromEntries(discoveredPaths.map((filePath) => [
    filePath,
    readFileSync(resolve(rootDirectory, filePath), 'utf8'),
  ]));
}

function printWarningSection(title, lines) {
  if (lines.length === 0) {
    return;
  }

  console.warn(`Reader architecture warning: ${title}`);
  lines.forEach((line) => {
    console.warn(`- ${line}`);
  });
}

export function runReaderArchitectureCheck(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const rootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const strict = argv.includes('--strict') || env.READER_ARCHITECTURE_STRICT === '1';
  const requestedPaths = argv.filter((argument) => argument !== '--strict');
  const files = collectReaderFiles(rootDirectory, requestedPaths);
  const result = evaluateReaderArchitecture(files);
  const warningCount =
    result.invalidReaderContentRootExports.length
    + result.invalidRootBarrelExports.length
    + result.oversizedFiles.length
    + result.readerFamilyDeepImports.length
    + result.restrictedImports.length
    + result.passThroughFiles.length;

  printWarningSection(
    `files over ${READER_FILE_LINE_LIMIT} lines`,
    result.oversizedFiles.map(({ filePath, lineCount }) => `${filePath} (${lineCount} lines)`),
  );
  printWarningSection(
    'reader-layout-engine importing reader-shell / reader-content / reader-session',
    result.restrictedImports.map(({ filePath, specifier }) => `${filePath} -> ${specifier}`),
  );
  printWarningSection(
    'reader-family code importing reader-domain internals instead of barrels/relative paths',
    result.readerFamilyDeepImports.map(({ filePath, specifier }) => `${filePath} -> ${specifier}`),
  );
  printWarningSection(
    'pass-through re-export files in the Reader family',
    result.passThroughFiles,
  );
  printWarningSection(
    'reader-content root barrel exporting non-stable symbols',
    result.invalidReaderContentRootExports.map(({ filePath, line }) => `${filePath} -> ${line}`),
  );
  printWarningSection(
    'reader-layout-engine root barrel exporting non-stable symbols',
    result.invalidRootBarrelExports.map(({ filePath, line }) => `${filePath} -> ${line}`),
  );

  if (warningCount === 0) {
    console.log('Reader architecture checks passed.');
    return result;
  }

  if (strict) {
    throw new Error(`Reader architecture checks found ${warningCount} warning(s).`);
  }

  console.warn(`Reader architecture checks found ${warningCount} warning(s).`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runReaderArchitectureCheck();
}
