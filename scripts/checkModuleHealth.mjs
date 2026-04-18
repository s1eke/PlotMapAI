import { fileURLToPath } from 'url';
import { resolve } from 'path';

import { loadArchitectureContract } from './architecture/contracts.mjs';
import {
  collectConfiguredFiles,
  evaluateModuleHealth,
  groupMetricViolations,
  MODULE_HEALTH_METRIC_KEYS,
  MODULE_HEALTH_METRIC_TITLES,
} from './architecture/moduleHealth.mjs';

function printWarningSection(title, lines) {
  if (lines.length === 0) {
    return;
  }

  console.warn(`Module health warning: ${title}`);
  lines.forEach((line) => {
    console.warn(`- ${line}`);
  });
}

function buildScopeConfig(metricDefaults, moduleHealth, scope) {
  return {
    metricAllowlist: scope.metricAllowlist,
    metricBudgets: {
      ...metricDefaults.metricBudgets,
      ...scope.metricBudgets,
    },
    passThrough: {
      ...moduleHealth.passThrough,
      enabled: scope.checkPassThroughReExports,
      files: scope.passThroughFiles,
      ignoreIndexFiles: true,
    },
    stableBarrels: scope.checkStableBarrels ? scope.stableBarrels : [],
  };
}

function evaluateModuleHealthScope(
  rootDirectory,
  metricDefaults,
  moduleHealth,
  scope,
  requestedPaths,
) {
  const files = collectConfiguredFiles(rootDirectory, {
    requestedPaths,
    includePatterns: scope.files,
    ignorePatterns: scope.ignores,
    fileExtensions: moduleHealth.fileExtensions,
  });

  return evaluateModuleHealth(
    files,
    buildScopeConfig(metricDefaults, moduleHealth, scope),
  );
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

export function runModuleHealthCheck(argv = process.argv.slice(2)) {
  const rootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const { metricDefaults, moduleHealth } = loadArchitectureContract(rootDirectory);
  const requestedPaths = argv.filter((argument) => argument !== '--strict');
  const results = moduleHealth.scopes.map((scope) => ({
    metricBudgets: {
      ...metricDefaults.metricBudgets,
      ...scope.metricBudgets,
    },
    result: evaluateModuleHealthScope(
      rootDirectory,
      metricDefaults,
      moduleHealth,
      scope,
      requestedPaths,
    ),
    scope,
  }));

  let warningCount = 0;
  results.forEach(({ metricBudgets, scope, result }) => {
    warningCount +=
      result.invalidStableBarrelExports.length
      + result.metricViolations.length
      + result.passThroughFiles.length;

    const violationsByMetric = groupMetricViolations(result.metricViolations);
    MODULE_HEALTH_METRIC_KEYS.forEach((metric) => {
      const metricBudget = metricBudgets[metric];
      if (!metricBudget) {
        return;
      }
      printWarningSection(
        `${scope.name} ${MODULE_HEALTH_METRIC_TITLES[metric](metricBudget)}`,
        (violationsByMetric.get(metric) ?? [])
          .map((violation) => formatMetricViolation(metric, violation)),
      );
    });
    printWarningSection(
      `${scope.name} pass-through re-export files`,
      result.passThroughFiles,
    );

    const stableBarrelWarnings = new Map();
    result.invalidStableBarrelExports.forEach(({ filePath, line, message }) => {
      const entries = stableBarrelWarnings.get(message) ?? [];
      entries.push(`${filePath} -> ${line}`);
      stableBarrelWarnings.set(message, entries);
    });
    stableBarrelWarnings.forEach((lines, message) => {
      printWarningSection(message, lines);
    });
  });

  if (warningCount === 0) {
    console.log('Module health checks passed.');
    return results;
  }

  throw new Error(`Module health checks found ${warningCount} warning(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runModuleHealthCheck();
}
