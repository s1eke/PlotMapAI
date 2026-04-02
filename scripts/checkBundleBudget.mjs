import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { gzipSync } from 'zlib';

export const BUNDLE_BUDGET_KEYS = [
  'shellInitialJsGzip',
  'largestSharedChunkGzip',
  'largestLazyRouteChunkGzip',
  'largestWorkerChunkGzip',
];

const BUDGET_INCREMENT_BYTES = 5 * 1024;

function assertBundleMetric(value, key) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Bundle budget metric "${key}" must be a non-negative number.`);
  }
}

export function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

export function suggestBudget(bytes) {
  return (
    Math.ceil(bytes / BUDGET_INCREMENT_BYTES) * BUDGET_INCREMENT_BYTES
    + BUDGET_INCREMENT_BYTES
  );
}

export function validateBundleBudgetReport(report) {
  if (!report || typeof report !== 'object') {
    throw new Error('Bundle budget report must be an object.');
  }

  if (!Array.isArray(report.chunks)) {
    throw new Error('Bundle budget report must include a chunks array.');
  }

  report.chunks.forEach((chunk, index) => {
    if (!chunk || typeof chunk !== 'object') {
      throw new Error(`Chunk report at index ${index} must be an object.`);
    }

    if (typeof chunk.fileName !== 'string' || chunk.fileName.length === 0) {
      throw new Error(`Chunk report at index ${index} is missing a fileName.`);
    }

    assertBundleMetric(chunk.rawBytes, `chunks[${index}].rawBytes`);
    assertBundleMetric(chunk.gzipBytes, `chunks[${index}].gzipBytes`);

    if (!Array.isArray(chunk.imports) || !Array.isArray(chunk.dynamicImports)) {
      throw new Error(
        `Chunk report "${chunk.fileName}" must include imports and dynamicImports arrays.`,
      );
    }
  });

  return report;
}

function isWorkerChunkFileName(fileName) {
  const baseName = basename(fileName);
  return baseName.startsWith('worker-') || baseName.includes('.worker-');
}

function collectWorkerChunksFromBuild(reportPath) {
  const assetsDirectory = resolve(dirname(reportPath), '..', 'assets');
  if (!existsSync(assetsDirectory)) {
    return [];
  }

  return readdirSync(assetsDirectory)
    .filter((fileName) => fileName.endsWith('.js') && isWorkerChunkFileName(fileName))
    .map((fileName) => {
      const source = readFileSync(join(assetsDirectory, fileName), 'utf-8');

      return {
        dynamicImports: [],
        facadeModuleId: null,
        fileName: join('assets', fileName),
        gzipBytes: gzipSync(Buffer.from(source)).byteLength,
        imports: [],
        isDynamicEntry: false,
        isEntry: true,
        isWorker: true,
        moduleIds: [],
        rawBytes: Buffer.byteLength(source, 'utf8'),
      };
    });
}

export function augmentBundleBudgetReportWithWorkerChunks(report, reportPath) {
  const normalizedReport = validateBundleBudgetReport(report);
  const workerChunks = collectWorkerChunksFromBuild(reportPath);
  if (workerChunks.length === 0) {
    return normalizedReport;
  }

  const chunkMap = new Map(normalizedReport.chunks.map((chunk) => [chunk.fileName, chunk]));
  workerChunks.forEach((workerChunk) => {
    const existingChunk = chunkMap.get(workerChunk.fileName);
    if (existingChunk) {
      chunkMap.set(workerChunk.fileName, {
        ...existingChunk,
        isWorker: true,
      });
      return;
    }

    chunkMap.set(workerChunk.fileName, workerChunk);
  });

  return {
    ...normalizedReport,
    chunks: [...chunkMap.values()].sort((first, second) =>
      first.fileName.localeCompare(second.fileName)),
  };
}

function collectStaticChunkClosure(entryFileName, chunkMap) {
  const visited = new Set();
  const queue = [entryFileName];

  while (queue.length > 0) {
    const fileName = queue.shift();
    if (!fileName || visited.has(fileName)) {
      continue;
    }

    const chunk = chunkMap.get(fileName);
    if (!chunk) {
      continue;
    }

    visited.add(fileName);
    chunk.imports.forEach((importedFileName) => {
      if (chunkMap.has(importedFileName)) {
        queue.push(importedFileName);
      }
    });
  }

  return visited;
}

function getMaxGzipBytes(chunks) {
  if (chunks.length === 0) {
    return 0;
  }

  return Math.max(...chunks.map((chunk) => chunk.gzipBytes));
}

export function computeBundleBudgetSummary(report) {
  const normalizedReport = validateBundleBudgetReport(report);
  const chunkMap = new Map(normalizedReport.chunks.map((chunk) => [chunk.fileName, chunk]));
  const shellEntryChunk = normalizedReport.chunks.find((chunk) => (
    chunk.isEntry
    && !chunk.isDynamicEntry
    && !chunk.isWorker
  ));

  if (!shellEntryChunk) {
    throw new Error('Bundle budget report is missing a non-worker shell entry chunk.');
  }

  const shellChunkFileNames = collectStaticChunkClosure(shellEntryChunk.fileName, chunkMap);
  const shellInitialJsGzip = [...shellChunkFileNames]
    .map((fileName) => chunkMap.get(fileName))
    .filter((chunk) => Boolean(chunk) && !chunk.isWorker)
    .reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
  const largestSharedChunkGzip = getMaxGzipBytes(normalizedReport.chunks.filter((chunk) => (
    !chunk.isWorker
    && !chunk.isEntry
    && !chunk.isDynamicEntry
  )));
  const largestLazyRouteChunkGzip = getMaxGzipBytes(normalizedReport.chunks.filter((chunk) => (
    !chunk.isWorker
    && chunk.isDynamicEntry
  )));
  const largestWorkerChunkGzip = getMaxGzipBytes(
    normalizedReport.chunks.filter((chunk) => chunk.isWorker),
  );

  return {
    shellInitialJsGzip,
    largestSharedChunkGzip,
    largestLazyRouteChunkGzip,
    largestWorkerChunkGzip,
  };
}

export function validateBundleBudgetConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Bundle budget config must be an object.');
  }

  BUNDLE_BUDGET_KEYS.forEach((key) => {
    assertBundleMetric(config[key], key);
  });

  return config;
}

export function evaluateBundleBudget(report, budgetConfig) {
  const summary = computeBundleBudgetSummary(report);
  const budget = validateBundleBudgetConfig(budgetConfig);
  const suggestions = Object.fromEntries(BUNDLE_BUDGET_KEYS.map((key) => [
    key,
    suggestBudget(summary[key]),
  ]));
  const failures = BUNDLE_BUDGET_KEYS.flatMap((key) => (
    summary[key] > budget[key]
      ? [{
        actual: summary[key],
        budget: budget[key],
        key,
        suggestedBudget: suggestions[key],
      }]
      : []
  ));

  return {
    failures,
    suggestions,
    summary,
  };
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function writeJsonFile(filePath, value) {
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function printBudgetSummary(summary, budget) {
  console.log('Bundle budget summary:');
  BUNDLE_BUDGET_KEYS.forEach((key) => {
    console.log(`- ${key}: ${formatKiB(summary[key])} / ${formatKiB(budget[key])}`);
  });
}

export function runBundleBudgetCheck(argv = process.argv.slice(2)) {
  const reportPath = resolve(process.cwd(), argv[0] ?? 'dist/analysis/bundle-budget-report.json');
  const budgetPath = resolve(process.cwd(), argv[1] ?? 'scripts/bundle-budget.json');
  const report = augmentBundleBudgetReportWithWorkerChunks(readJsonFile(reportPath), reportPath);
  const budget = readJsonFile(budgetPath);
  const result = evaluateBundleBudget(report, budget);
  writeJsonFile(reportPath, report);

  printBudgetSummary(result.summary, budget);
  if (result.failures.length === 0) {
    console.log('Bundle budgets passed.');
    return result;
  }

  console.error('Bundle budgets exceeded:');
  result.failures.forEach((failure) => {
    console.error(
      `- ${failure.key}: actual ${formatKiB(failure.actual)} > budget ${formatKiB(failure.budget)} ` +
      `(suggested ${formatKiB(failure.suggestedBudget)})`,
    );
  });

  const error = new Error('Bundle budget check failed.');
  error.result = result;
  throw error;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBundleBudgetCheck();
}
