import { readdirSync, readFileSync, statSync } from 'fs';
import { extname, isAbsolute, relative, resolve } from 'path';

import ts from 'typescript';

import { normalizePath } from './repositoryFacts.mjs';

export const MODULE_HEALTH_METRIC_KEYS = [
  'effectiveLines',
  'maxFunctionLines',
  'importCount',
  'crossLayerImports',
];

const MODULE_HEALTH_METRIC_INDEX = new Map(
  MODULE_HEALTH_METRIC_KEYS.map((metric, index) => [metric, index]),
);

export const MODULE_HEALTH_METRIC_TITLES = {
  crossLayerImports: (limit, context = 'module health') => `${context} over ${limit} cross-layer imports`,
  effectiveLines: (limit, context = 'global hard cap') => `${context} over ${limit} effective lines`,
  importCount: (limit, context = 'module health') => `${context} over ${limit} imports`,
  maxFunctionLines: (limit, context = 'module health') => `${context} over ${limit} function lines`,
};

export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

export function countEffectiveLines(source) {
  if (source.length === 0) {
    return 0;
  }

  // Preserve the historical 500-line hard cap semantics, but count logical lines
  // so comments and whitespace do not trigger structural alarms on their own.
  return stripComments(source)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .length;
}

function escapeRegexCharacter(character) {
  return character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function globToRegExp(pattern) {
  let result = '^';

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    const nextCharacter = pattern[index + 1];
    const thirdCharacter = pattern[index + 2];

    if (character === '*' && nextCharacter === '*') {
      if (thirdCharacter === '/') {
        result += '(?:.*/)?';
        index += 2;
      } else {
        result += '.*';
        index += 1;
      }
      continue;
    }

    if (character === '*') {
      result += '[^/]*';
      continue;
    }

    if (character === '?') {
      result += '[^/]';
      continue;
    }

    if (character === '{') {
      const closingBraceIndex = pattern.indexOf('}', index);
      if (closingBraceIndex !== -1) {
        const alternatives = pattern
          .slice(index + 1, closingBraceIndex)
          .split(',')
          .map((entry) => escapeRegexCharacter(entry));
        result += `(?:${alternatives.join('|')})`;
        index = closingBraceIndex;
        continue;
      }
    }

    result += escapeRegexCharacter(character);
  }

  result += '$';
  return new RegExp(result);
}

export function matchesAnyPattern(filePath, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(filePath));
}

function getGlobBasePath(pattern) {
  const wildcardIndex = pattern.search(/[*?[{]/u);
  if (wildcardIndex === -1) {
    return pattern;
  }

  const lastSlashIndex = pattern.lastIndexOf('/', wildcardIndex);
  if (lastSlashIndex === -1) {
    return '';
  }

  return pattern.slice(0, lastSlashIndex).replace(/\/+$/u, '');
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

    results.push(normalizePath(relative(rootDirectory, absolutePath)));
  }

  return results;
}

function normalizeRequestedPath(rootDirectory, inputPath) {
  if (isAbsolute(inputPath)) {
    return normalizePath(relative(rootDirectory, inputPath));
  }

  return normalizePath(inputPath);
}

function shouldIncludeConfiguredFile(filePath, config) {
  return (
    config.fileExtensions.includes(extname(filePath))
    && matchesAnyPattern(filePath, config.includePatterns)
    && !matchesAnyPattern(filePath, config.ignorePatterns)
  );
}

function listSearchRoots(includePatterns, searchRoots) {
  if (searchRoots.length > 0) {
    return searchRoots;
  }

  return [...new Set(includePatterns
    .map((pattern) => getGlobBasePath(pattern))
    .filter((basePath) => basePath.length > 0))];
}

export function collectConfiguredFiles(
  rootDirectory,
  {
    requestedPaths = [],
    searchRoots = [],
    includePatterns,
    ignorePatterns = [],
    fileExtensions,
  },
) {
  const discoveredPaths = requestedPaths.length > 0
    ? requestedPaths
      .map((filePath) => normalizeRequestedPath(rootDirectory, filePath))
      .filter((filePath) => shouldIncludeConfiguredFile(filePath, {
        fileExtensions,
        ignorePatterns,
        includePatterns,
      }))
    : listSearchRoots(includePatterns, searchRoots)
      .flatMap((directory) => walkDirectory(rootDirectory, resolve(rootDirectory, directory)))
      .filter((filePath) => shouldIncludeConfiguredFile(filePath, {
        fileExtensions,
        ignorePatterns,
        includePatterns,
      }));

  return Object.fromEntries([...new Set(discoveredPaths)].sort().map((filePath) => [
    filePath,
    readFileSync(resolve(rootDirectory, filePath), 'utf8'),
  ]));
}

export function isPassThroughModuleFile(filePath, source, config) {
  if (!config.enabled) {
    return false;
  }
  if (!matchesAnyPattern(filePath, config.files)) {
    return false;
  }
  if (config.ignoreIndexFiles && (filePath.endsWith('/index.ts') || filePath.endsWith('/index.tsx'))) {
    return false;
  }

  const exportLinePattern = new RegExp(config.exportLinePattern);
  const exportStarLinePattern = new RegExp(config.exportStarLinePattern);
  const significantLines = stripComments(source)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (significantLines.length === 0) {
    return false;
  }

  return significantLines.every((line) => (
    exportLinePattern.test(line) || exportStarLinePattern.test(line)
  ));
}

export function findInvalidStableBarrelExports(filePath, source, stableBarrels) {
  const stableBarrel = stableBarrels.find((entry) => entry.path === filePath);
  if (!stableBarrel) {
    return [];
  }

  const allowedLines = new Set(stableBarrel.allowedLines);
  return stripComments(source)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !allowedLines.has(line))
    .map((line) => ({
      filePath,
      line,
      message: stableBarrel.message,
    }));
}

function getFunctionLikeName(node) {
  if (node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
  }

  if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
    return node.parent.name.text;
  }

  if (ts.isPropertyAssignment(node.parent)) {
    if (ts.isIdentifier(node.parent.name) || ts.isStringLiteral(node.parent.name)) {
      return node.parent.name.text;
    }
  }

  if (ts.isBinaryExpression(node.parent) && ts.isIdentifier(node.parent.left)) {
    return node.parent.left.text;
  }

  return '<anonymous>';
}

function resolveFileLayer(filePath) {
  if (filePath.startsWith('src/app/')) {
    return 'app';
  }
  if (filePath.startsWith('src/application/')) {
    return 'application';
  }
  if (filePath.startsWith('src/domains/')) {
    return 'domains';
  }
  if (filePath.startsWith('src/shared/')) {
    return 'shared';
  }
  if (filePath.startsWith('src/infra/')) {
    return 'infra';
  }

  return 'other';
}

function resolveImportLayer(specifier) {
  if (!specifier.startsWith('@')) {
    return 'other';
  }

  const segment = specifier.split('/')[0];
  if (segment === '@app') {
    return 'app';
  }
  if (segment === '@application') {
    return 'application';
  }
  if (segment === '@domains') {
    return 'domains';
  }
  if (segment === '@shared') {
    return 'shared';
  }
  if (segment === '@infra') {
    return 'infra';
  }

  return 'other';
}

export function collectModuleHealthMetrics(filePath, source) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const currentLayer = resolveFileLayer(filePath);
  let importCount = 0;
  let crossLayerImports = 0;
  const crossLayerImportSpecifiers = [];
  let maxFunctionLines = 0;
  let maxFunctionName = '<none>';
  let maxFunctionStartLine = 0;

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      importCount += 1;
      const specifier = node.moduleSpecifier.text ?? '';
      const targetLayer = resolveImportLayer(specifier);

      if (targetLayer !== 'other' && targetLayer !== currentLayer) {
        crossLayerImports += 1;
        crossLayerImportSpecifiers.push(specifier);
      }
    }

    if (
      ts.isFunctionDeclaration(node)
      || ts.isMethodDeclaration(node)
      || ts.isArrowFunction(node)
      || ts.isFunctionExpression(node)
    ) {
      const startLine =
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const endLine = sourceFile.getLineAndCharacterOfPosition(node.end).line + 1;
      const lineCount = endLine - startLine + 1;

      if (lineCount > maxFunctionLines) {
        maxFunctionLines = lineCount;
        maxFunctionName = getFunctionLikeName(node);
        maxFunctionStartLine = startLine;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    crossLayerImportSpecifiers,
    crossLayerImports,
    effectiveLines: countEffectiveLines(source),
    importCount,
    maxFunctionLines,
    maxFunctionName,
    maxFunctionStartLine,
  };
}

function buildMetricAllowlistIndex(metricAllowlist = []) {
  return new Map(metricAllowlist.map((entry) => [entry.path, new Set(entry.metrics)]));
}

function buildMetricViolation(metric, filePath, limit, metrics) {
  if (metric === 'effectiveLines') {
    return {
      actual: metrics.effectiveLines,
      filePath,
      limit,
      metric,
    };
  }

  if (metric === 'maxFunctionLines') {
    return {
      actual: metrics.maxFunctionLines,
      filePath,
      functionName: metrics.maxFunctionName,
      limit,
      metric,
      startLine: metrics.maxFunctionStartLine,
    };
  }

  if (metric === 'importCount') {
    return {
      actual: metrics.importCount,
      filePath,
      limit,
      metric,
    };
  }

  return {
    actual: metrics.crossLayerImports,
    filePath,
    limit,
    metric,
    specifiers: metrics.crossLayerImportSpecifiers,
  };
}

function sortMetricViolations(metricViolations) {
  return metricViolations.sort((left, right) => (
    (MODULE_HEALTH_METRIC_INDEX.get(left.metric) ?? Number.MAX_SAFE_INTEGER)
    - (MODULE_HEALTH_METRIC_INDEX.get(right.metric) ?? Number.MAX_SAFE_INTEGER)
    || left.filePath.localeCompare(right.filePath)
    || left.actual - right.actual
  ));
}

export function groupMetricViolations(metricViolations) {
  const groups = new Map();

  MODULE_HEALTH_METRIC_KEYS.forEach((metric) => {
    groups.set(metric, []);
  });

  metricViolations.forEach((violation) => {
    const entries = groups.get(violation.metric);
    if (entries) {
      entries.push(violation);
    }
  });

  return groups;
}

export function evaluateModuleHealth(files, config) {
  const metricAllowlist = buildMetricAllowlistIndex(config.metricAllowlist);
  const metricViolations = [];
  const passThroughFiles = [];
  const invalidStableBarrelExports = [];

  Object.entries(files).forEach(([filePath, source]) => {
    const metrics = collectModuleHealthMetrics(filePath, source);
    const allowlistedMetrics = metricAllowlist.get(filePath) ?? new Set();

    Object.entries(config.metricBudgets ?? {}).forEach(([metric, limit]) => {
      if (allowlistedMetrics.has(metric)) {
        return;
      }

      const actual = metrics[metric];
      if (typeof actual === 'number' && actual > limit) {
        metricViolations.push(buildMetricViolation(metric, filePath, limit, metrics));
      }
    });

    if (
      config.passThrough?.enabled
      && isPassThroughModuleFile(filePath, source, config.passThrough)
    ) {
      passThroughFiles.push(filePath);
    }

    invalidStableBarrelExports.push(
      ...findInvalidStableBarrelExports(filePath, source, config.stableBarrels ?? []),
    );
  });

  return {
    invalidStableBarrelExports: invalidStableBarrelExports.sort((left, right) => (
      left.filePath.localeCompare(right.filePath) || left.line.localeCompare(right.line)
    )),
    metricViolations: sortMetricViolations(metricViolations),
    passThroughFiles: passThroughFiles.sort(),
  };
}
