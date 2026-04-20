import { fileURLToPath, pathToFileURL } from 'url';
import { resolve } from 'path';

import { loadArchitectureContract } from './architecture/contracts.mjs';
import {
  collectConfiguredFiles,
  evaluateModuleHealth,
  findInvalidStableBarrelExports,
  groupMetricViolations,
  matchesAnyPattern,
  MODULE_HEALTH_METRIC_KEYS,
  MODULE_HEALTH_METRIC_TITLES,
  isPassThroughModuleFile,
} from './architecture/moduleHealth.mjs';

const {
  metricDefaults: METRIC_DEFAULTS,
  readerArchitecture: READER_ARCHITECTURE,
} = loadArchitectureContract();
const READER_LAYOUT_ENGINE_ROOT_BARREL = READER_ARCHITECTURE.stableBarrels.find(
  (entry) => entry.path === 'src/domains/reader-layout-engine/index.ts',
);
const READER_CONTENT_ROOT_BARREL = READER_ARCHITECTURE.stableBarrels.find(
  (entry) => entry.path === 'src/domains/reader-content/index.ts',
);

function findImportMatches(source, pattern) {
  return [...source.matchAll(new RegExp(pattern, 'g'))].map((match) => match[1]);
}

function buildReaderModuleHealthConfig(options = {}) {
  return {
    metricAllowlist: READER_ARCHITECTURE.metricAllowlist,
    metricBudgets: {
      ...METRIC_DEFAULTS.metricBudgets,
      ...READER_ARCHITECTURE.metricBudgets,
      ...options.metricBudgets,
    },
    passThrough: {
      ...READER_ARCHITECTURE.passThrough,
      enabled: true,
    },
    stableBarrels: READER_ARCHITECTURE.stableBarrels,
  };
}

export function findRestrictedReaderImports(filePath, source) {
  if (!matchesAnyPattern(filePath, READER_ARCHITECTURE.restrictedImports.files)) {
    return [];
  }

  return findImportMatches(source, READER_ARCHITECTURE.restrictedImports.pattern);
}

export function findReaderFamilyDeepImports(filePath, source) {
  if (!matchesAnyPattern(filePath, READER_ARCHITECTURE.includeFiles)) {
    return [];
  }

  return findImportMatches(source, READER_ARCHITECTURE.deepImports.pattern);
}

export function isPassThroughReaderFile(filePath, source) {
  return isPassThroughModuleFile(filePath, source, {
    ...READER_ARCHITECTURE.passThrough,
    enabled: true,
  });
}

export function findInvalidReaderLayoutEngineRootExports(filePath, source) {
  if (!READER_LAYOUT_ENGINE_ROOT_BARREL) {
    return [];
  }

  return findInvalidStableBarrelExports(filePath, source, [READER_LAYOUT_ENGINE_ROOT_BARREL])
    .map((entry) => entry.line);
}

export function findInvalidReaderContentRootExports(filePath, source) {
  if (!READER_CONTENT_ROOT_BARREL) {
    return [];
  }

  return findInvalidStableBarrelExports(filePath, source, [READER_CONTENT_ROOT_BARREL])
    .map((entry) => entry.line);
}

export function evaluateReaderArchitecture(files, options = {}) {
  const moduleHealthResult = evaluateModuleHealth(files, buildReaderModuleHealthConfig(options));
  const restrictedImports = [];
  const readerFamilyDeepImports = [];

  Object.entries(files).forEach(([filePath, source]) => {
    findRestrictedReaderImports(filePath, source).forEach((specifier) => {
      restrictedImports.push({ filePath, specifier });
    });

    findReaderFamilyDeepImports(filePath, source).forEach((specifier) => {
      readerFamilyDeepImports.push({ filePath, specifier });
    });
  });

  return {
    invalidReaderContentRootExports: moduleHealthResult.invalidStableBarrelExports
      .filter((entry) => entry.filePath === READER_CONTENT_ROOT_BARREL?.path)
      .map(({ filePath, line }) => ({ filePath, line })),
    invalidRootBarrelExports: moduleHealthResult.invalidStableBarrelExports
      .filter((entry) => entry.filePath === READER_LAYOUT_ENGINE_ROOT_BARREL?.path)
      .map(({ filePath, line }) => ({ filePath, line })),
    metricViolations: moduleHealthResult.metricViolations,
    passThroughFiles: moduleHealthResult.passThroughFiles,
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
  return collectConfiguredFiles(rootDirectory, {
    requestedPaths,
    searchRoots: READER_ARCHITECTURE.sourceDirectories,
    includePatterns: READER_ARCHITECTURE.includeFiles,
    ignorePatterns: READER_ARCHITECTURE.ignoreFiles,
    fileExtensions: READER_ARCHITECTURE.fileExtensions,
  });
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

function formatMetricViolation(metric, violation) {
  if (metric === 'maxFunctionLines') {
    return `${violation.filePath} -> ${violation.functionName} @ line ${violation.startLine} (${violation.actual} > ${violation.limit})`;
  }

  if (metric === 'crossLayerImports') {
    return `${violation.filePath} -> ${violation.actual} imports [${violation.specifiers.join(', ')}]`;
  }

  return `${violation.filePath} (${violation.actual} > ${violation.limit})`;
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
    + result.metricViolations.length
    + result.readerFamilyDeepImports.length
    + result.restrictedImports.length
    + result.passThroughFiles.length;

  const metricViolationsByType = groupMetricViolations(result.metricViolations);
  const metricBudgets = {
    ...METRIC_DEFAULTS.metricBudgets,
    ...READER_ARCHITECTURE.metricBudgets,
  };
  MODULE_HEALTH_METRIC_KEYS.forEach((metric) => {
    const metricBudget = metricBudgets[metric];
    if (!metricBudget) {
      return;
    }
    printWarningSection(
      MODULE_HEALTH_METRIC_TITLES[metric](metricBudget),
      (metricViolationsByType.get(metric) ?? [])
        .map((violation) => formatMetricViolation(metric, violation)),
    );
  });
  printWarningSection(
    READER_ARCHITECTURE.restrictedImports.message,
    result.restrictedImports.map(({ filePath, specifier }) => `${filePath} -> ${specifier}`),
  );
  printWarningSection(
    READER_ARCHITECTURE.deepImports.message,
    result.readerFamilyDeepImports.map(({ filePath, specifier }) => `${filePath} -> ${specifier}`),
  );
  printWarningSection(
    READER_ARCHITECTURE.passThrough.message,
    result.passThroughFiles,
  );
  printWarningSection(
    READER_CONTENT_ROOT_BARREL?.message ?? 'reader-content root barrel exporting non-stable symbols',
    result.invalidReaderContentRootExports.map(({ filePath, line }) => `${filePath} -> ${line}`),
  );
  printWarningSection(
    READER_LAYOUT_ENGINE_ROOT_BARREL?.message ?? 'reader-layout-engine root barrel exporting non-stable symbols',
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReaderArchitectureCheck();
}
