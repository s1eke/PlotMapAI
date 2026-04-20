import { readFileSync } from 'fs';
import { extname, resolve } from 'path';

import { MODULE_HEALTH_METRIC_KEYS, matchesAnyPattern } from './moduleHealth.mjs';
import { createRepositoryFacts, REPOSITORY_ROOT } from './repositoryFacts.mjs';

const ARCHITECTURE_CONTRACT_PATH = 'scripts/architecture/contracts/architecture.json';
const TABLE_OWNERSHIP_CONTRACT_PATH = 'scripts/architecture/contracts/table-ownership.json';

function fail(message) {
  throw new Error(message);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${label} must be a non-empty string.`);
  }
}

function assertStringArray(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)) {
    fail(`${label} must be an array of non-empty strings.`);
  }
  if (!allowEmpty && value.length === 0) {
    fail(`${label} must not be empty.`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') {
    fail(`${label} must be a boolean.`);
  }
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    fail(`${label} must be a positive integer.`);
  }
}

function assertRegexPattern(value, label) {
  assertNonEmptyString(value, label);
  try {
    // Validate that contract-supplied regexes compile before any gate consumes them.
    RegExp(value, 'g');
  } catch (error) {
    fail(`${label} must be a valid regular expression: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readContractJson(rootDirectory, relativePath) {
  const absolutePath = resolve(rootDirectory, relativePath);
  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    fail(`Failed to load ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
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

function assertExistingPath(pattern, label, facts) {
  const basePath = getGlobBasePath(pattern);
  if (basePath.length === 0 || !facts.pathExists(basePath)) {
    fail(`${label} references a missing path: ${pattern}`);
  }
}

function assertRestrictedImportEntries(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty array.`);
  }

  value.forEach((entry, index) => {
    assertObject(entry, `${label}[${index}]`);
    assertStringArray(entry.group, `${label}[${index}].group`);
    assertNonEmptyString(entry.message, `${label}[${index}].message`);
  });
}

function assertPatternArray(value, label, facts, { allowEmpty = false } = {}) {
  assertStringArray(value, label, { allowEmpty });
  value.forEach((pattern, index) => {
    assertExistingPath(pattern, `${label}[${index}]`, facts);
  });
}

function assertStableBarrels(value, label, facts, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail(`${label} must ${allowEmpty ? 'be an array.' : 'be a non-empty array.'}`);
  }

  value.forEach((barrel, index) => {
    assertObject(barrel, `${label}[${index}]`);
    assertNonEmptyString(barrel.path, `${label}[${index}].path`);
    assertExistingPath(barrel.path, `${label}[${index}].path`, facts);
    assertNonEmptyString(barrel.message, `${label}[${index}].message`);
    assertStringArray(barrel.allowedLines, `${label}[${index}].allowedLines`);
  });
}

function assertMetricBudgets(
  value,
  label,
  { allowEmpty = false, allowEffectiveLines = true } = {},
) {
  assertObject(value, label);
  const entries = Object.entries(value);

  if (!allowEmpty && entries.length === 0) {
    fail(`${label} must not be empty.`);
  }

  entries.forEach(([metric, budget]) => {
    if (!MODULE_HEALTH_METRIC_KEYS.includes(metric)) {
      fail(`${label}.${metric} is not a supported module health metric.`);
    }
    if (!allowEffectiveLines && metric === 'effectiveLines') {
      fail(`${label}.effectiveLines must be declared in architecture contract.metricDefaults.metricBudgets.`);
    }
    assertPositiveInteger(budget, `${label}.${metric}`);
  });
}

function assertMetricAllowlist(
  value,
  label,
  facts,
  {
    enabledMetrics,
    filePatterns,
    ignorePatterns = [],
  },
) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array.`);
  }

  value.forEach((entry, index) => {
    const entryLabel = `${label}[${index}]`;
    assertObject(entry, entryLabel);
    assertNonEmptyString(entry.path, `${entryLabel}.path`);
    assertExistingPath(entry.path, `${entryLabel}.path`, facts);
    if (
      !matchesAnyPattern(entry.path, filePatterns)
      || matchesAnyPattern(entry.path, ignorePatterns)
    ) {
      fail(`${entryLabel}.path must resolve to a file covered by this scope: ${entry.path}`);
    }
    assertStringArray(entry.metrics, `${entryLabel}.metrics`);
    entry.metrics.forEach((metric, metricIndex) => {
      if (!enabledMetrics.has(metric)) {
        fail(`${entryLabel}.metrics[${metricIndex}] references a metric that is not enabled for this scope: ${metric}`);
      }
    });
    assertNonEmptyString(entry.reason, `${entryLabel}.reason`);
  });
}

function isDependencyGraphScopeFile(filePath, dependencyGraph) {
  const normalizedPath = filePath.replaceAll('\\', '/');
  return (
    dependencyGraph.sourceDirectories.some((directory) => (
      normalizedPath === directory || normalizedPath.startsWith(`${directory}/`)
    ))
    && dependencyGraph.fileExtensions.includes(extname(normalizedPath))
    && !(new RegExp(dependencyGraph.excludePathPattern).test(normalizedPath))
  );
}

function createCycleBaselineKey(files) {
  return [...new Set(files)].sort().join('|');
}

function validateDependencyGraph(dependencyGraph, facts) {
  assertObject(dependencyGraph, 'architecture contract.dependencyGraph');
  assertPatternArray(
    dependencyGraph.sourceDirectories,
    'architecture contract.dependencyGraph.sourceDirectories',
    facts,
  );
  assertStringArray(
    dependencyGraph.fileExtensions,
    'architecture contract.dependencyGraph.fileExtensions',
  );
  dependencyGraph.fileExtensions.forEach((extension, index) => {
    if (!extension.startsWith('.')) {
      fail(`architecture contract.dependencyGraph.fileExtensions[${index}] must start with a dot.`);
    }
  });
  assertRegexPattern(
    dependencyGraph.includeOnly,
    'architecture contract.dependencyGraph.includeOnly',
  );
  assertRegexPattern(
    dependencyGraph.excludePathPattern,
    'architecture contract.dependencyGraph.excludePathPattern',
  );
  assertNonEmptyString(
    dependencyGraph.tsConfig,
    'architecture contract.dependencyGraph.tsConfig',
  );
  assertExistingPath(
    dependencyGraph.tsConfig,
    'architecture contract.dependencyGraph.tsConfig',
    facts,
  );

  if (!Array.isArray(dependencyGraph.allowedDomainDependencies)) {
    fail('architecture contract.dependencyGraph.allowedDomainDependencies must be an array.');
  }
  const seenAllowedDomains = new Set();
  dependencyGraph.allowedDomainDependencies.forEach((entry, index) => {
    assertObject(entry, `architecture contract.dependencyGraph.allowedDomainDependencies[${index}]`);
    assertNonEmptyString(
      entry.from,
      `architecture contract.dependencyGraph.allowedDomainDependencies[${index}].from`,
    );
    if (!facts.domainNames.includes(entry.from)) {
      fail(
        `architecture contract.dependencyGraph.allowedDomainDependencies[${index}].from references an unknown domain: ${entry.from}`,
      );
    }
    if (seenAllowedDomains.has(entry.from)) {
      fail(
        `architecture contract.dependencyGraph.allowedDomainDependencies contains a duplicate source domain: ${entry.from}`,
      );
    }
    seenAllowedDomains.add(entry.from);
    assertStringArray(
      entry.to,
      `architecture contract.dependencyGraph.allowedDomainDependencies[${index}].to`,
    );
    const seenTargetDomains = new Set();
    entry.to.forEach((targetDomain, targetIndex) => {
      if (!facts.domainNames.includes(targetDomain)) {
        fail(
          `architecture contract.dependencyGraph.allowedDomainDependencies[${index}].to[${targetIndex}] references an unknown domain: ${targetDomain}`,
        );
      }
      if (targetDomain === entry.from) {
        fail(
          `architecture contract.dependencyGraph.allowedDomainDependencies[${index}].to[${targetIndex}] must not repeat the source domain: ${targetDomain}`,
        );
      }
      if (seenTargetDomains.has(targetDomain)) {
        fail(
          `architecture contract.dependencyGraph.allowedDomainDependencies[${index}].to contains a duplicate target domain: ${targetDomain}`,
        );
      }
      seenTargetDomains.add(targetDomain);
    });
  });

  if (!Array.isArray(dependencyGraph.cycleBaseline)) {
    fail('architecture contract.dependencyGraph.cycleBaseline must be an array.');
  }
  const baselineKeys = new Set();
  dependencyGraph.cycleBaseline.forEach((entry, index) => {
    assertObject(entry, `architecture contract.dependencyGraph.cycleBaseline[${index}]`);
    assertStringArray(
      entry.files,
      `architecture contract.dependencyGraph.cycleBaseline[${index}].files`,
    );
    if (entry.files.length < 2) {
      fail(`architecture contract.dependencyGraph.cycleBaseline[${index}].files must contain at least two files.`);
    }
    entry.files.forEach((filePath, fileIndex) => {
      assertExistingPath(
        filePath,
        `architecture contract.dependencyGraph.cycleBaseline[${index}].files[${fileIndex}]`,
        facts,
      );
      if (!isDependencyGraphScopeFile(filePath, dependencyGraph)) {
        fail(
          `architecture contract.dependencyGraph.cycleBaseline[${index}].files[${fileIndex}] must resolve to a production source file covered by the dependency graph scope: ${filePath}`,
        );
      }
    });
    const baselineKey = createCycleBaselineKey(entry.files);
    if (baselineKeys.has(baselineKey)) {
      fail(`architecture contract.dependencyGraph.cycleBaseline contains a duplicate SCC baseline: ${baselineKey}`);
    }
    baselineKeys.add(baselineKey);
    assertNonEmptyString(
      entry.reason,
      `architecture contract.dependencyGraph.cycleBaseline[${index}].reason`,
    );
  });

  assertObject(
    dependencyGraph.reports,
    'architecture contract.dependencyGraph.reports',
  );
  assertNonEmptyString(
    dependencyGraph.reports.json,
    'architecture contract.dependencyGraph.reports.json',
  );
  assertNonEmptyString(
    dependencyGraph.reports.html,
    'architecture contract.dependencyGraph.reports.html',
  );
}

function validateReaderArchitecture(readerArchitecture, metricDefaults, facts) {
  assertObject(readerArchitecture, 'architecture contract.readerArchitecture');
  assertPatternArray(
    readerArchitecture.sourceDirectories,
    'architecture contract.readerArchitecture.sourceDirectories',
    facts,
  );
  assertStringArray(
    readerArchitecture.fileExtensions,
    'architecture contract.readerArchitecture.fileExtensions',
  );
  assertPatternArray(
    readerArchitecture.includeFiles,
    'architecture contract.readerArchitecture.includeFiles',
    facts,
  );
  assertPatternArray(
    readerArchitecture.ignoreFiles,
    'architecture contract.readerArchitecture.ignoreFiles',
    facts,
    { allowEmpty: true },
  );
  assertMetricBudgets(
    readerArchitecture.metricBudgets,
    'architecture contract.readerArchitecture.metricBudgets',
    { allowEffectiveLines: false },
  );
  assertMetricAllowlist(
    readerArchitecture.metricAllowlist,
    'architecture contract.readerArchitecture.metricAllowlist',
    facts,
    {
      enabledMetrics: new Set([
        ...Object.keys(metricDefaults.metricBudgets),
        ...Object.keys(readerArchitecture.metricBudgets),
      ]),
      filePatterns: readerArchitecture.includeFiles,
      ignorePatterns: readerArchitecture.ignoreFiles,
    },
  );

  assertObject(
    readerArchitecture.restrictedImports,
    'architecture contract.readerArchitecture.restrictedImports',
  );
  assertPatternArray(
    readerArchitecture.restrictedImports.files,
    'architecture contract.readerArchitecture.restrictedImports.files',
    facts,
  );
  assertRegexPattern(
    readerArchitecture.restrictedImports.pattern,
    'architecture contract.readerArchitecture.restrictedImports.pattern',
  );
  assertNonEmptyString(
    readerArchitecture.restrictedImports.message,
    'architecture contract.readerArchitecture.restrictedImports.message',
  );

  assertObject(
    readerArchitecture.deepImports,
    'architecture contract.readerArchitecture.deepImports',
  );
  assertRegexPattern(
    readerArchitecture.deepImports.pattern,
    'architecture contract.readerArchitecture.deepImports.pattern',
  );
  assertNonEmptyString(
    readerArchitecture.deepImports.message,
    'architecture contract.readerArchitecture.deepImports.message',
  );

  assertObject(
    readerArchitecture.passThrough,
    'architecture contract.readerArchitecture.passThrough',
  );
  assertPatternArray(
    readerArchitecture.passThrough.files,
    'architecture contract.readerArchitecture.passThrough.files',
    facts,
  );
  assertBoolean(
    readerArchitecture.passThrough.ignoreIndexFiles,
    'architecture contract.readerArchitecture.passThrough.ignoreIndexFiles',
  );
  assertRegexPattern(
    readerArchitecture.passThrough.exportLinePattern,
    'architecture contract.readerArchitecture.passThrough.exportLinePattern',
  );
  assertRegexPattern(
    readerArchitecture.passThrough.exportStarLinePattern,
    'architecture contract.readerArchitecture.passThrough.exportStarLinePattern',
  );
  assertNonEmptyString(
    readerArchitecture.passThrough.message,
    'architecture contract.readerArchitecture.passThrough.message',
  );

  assertStableBarrels(
    readerArchitecture.stableBarrels,
    'architecture contract.readerArchitecture.stableBarrels',
    facts,
  );
}

function validateModuleHealth(moduleHealth, metricDefaults, facts) {
  assertObject(moduleHealth, 'architecture contract.moduleHealth');
  assertStringArray(
    moduleHealth.fileExtensions,
    'architecture contract.moduleHealth.fileExtensions',
  );

  assertObject(moduleHealth.passThrough, 'architecture contract.moduleHealth.passThrough');
  assertRegexPattern(
    moduleHealth.passThrough.exportLinePattern,
    'architecture contract.moduleHealth.passThrough.exportLinePattern',
  );
  assertRegexPattern(
    moduleHealth.passThrough.exportStarLinePattern,
    'architecture contract.moduleHealth.passThrough.exportStarLinePattern',
  );

  if (!Array.isArray(moduleHealth.scopes) || moduleHealth.scopes.length === 0) {
    fail('architecture contract.moduleHealth.scopes must be a non-empty array.');
  }

  const scopeNames = new Set();
  moduleHealth.scopes.forEach((scope, index) => {
    assertObject(scope, `architecture contract.moduleHealth.scopes[${index}]`);
    assertNonEmptyString(scope.name, `architecture contract.moduleHealth.scopes[${index}].name`);
    if (scopeNames.has(scope.name)) {
      fail(`architecture contract.moduleHealth.scopes contains a duplicate scope name: ${scope.name}`);
    }
    scopeNames.add(scope.name);

    assertPatternArray(
      scope.files,
      `architecture contract.moduleHealth.scopes[${index}].files`,
      facts,
    );
    assertPatternArray(
      scope.ignores,
      `architecture contract.moduleHealth.scopes[${index}].ignores`,
      facts,
      { allowEmpty: true },
    );
    const scopeMetricBudgets = scope.metricBudgets;
    assertMetricBudgets(
      scopeMetricBudgets,
      `architecture contract.moduleHealth.scopes[${index}].metricBudgets`,
      { allowEmpty: true, allowEffectiveLines: false },
    );
    assertBoolean(
      scope.checkPassThroughReExports,
      `architecture contract.moduleHealth.scopes[${index}].checkPassThroughReExports`,
    );
    assertPatternArray(
      scope.passThroughFiles,
      `architecture contract.moduleHealth.scopes[${index}].passThroughFiles`,
      facts,
      { allowEmpty: true },
    );
    assertBoolean(
      scope.checkStableBarrels,
      `architecture contract.moduleHealth.scopes[${index}].checkStableBarrels`,
    );
    assertStableBarrels(
      scope.stableBarrels,
      `architecture contract.moduleHealth.scopes[${index}].stableBarrels`,
      facts,
      { allowEmpty: !scope.checkStableBarrels },
    );
    if (scope.checkPassThroughReExports && scope.passThroughFiles.length === 0) {
      fail(`architecture contract.moduleHealth.scopes[${index}].passThroughFiles must not be empty when pass-through checks are enabled.`);
    }

    assertMetricAllowlist(
      scope.metricAllowlist,
      `architecture contract.moduleHealth.scopes[${index}].metricAllowlist`,
      facts,
      {
        enabledMetrics: new Set([
          ...Object.keys(metricDefaults.metricBudgets),
          ...Object.keys(scopeMetricBudgets),
        ]),
        filePatterns: scope.files,
        ignorePatterns: scope.ignores,
      },
    );
  });
}

export function validateArchitectureContract(contract, facts = createRepositoryFacts()) {
  assertObject(contract, 'architecture contract');
  if (!Array.isArray(contract.layers) || contract.layers.length === 0) {
    fail('architecture contract.layers must be a non-empty array.');
  }
  assertObject(contract.metricDefaults, 'architecture contract.metricDefaults');
  assertMetricBudgets(
    contract.metricDefaults.metricBudgets,
    'architecture contract.metricDefaults.metricBudgets',
  );
  if (!Object.prototype.hasOwnProperty.call(contract.metricDefaults.metricBudgets, 'effectiveLines')) {
    fail('architecture contract.metricDefaults.metricBudgets.effectiveLines must be declared.');
  }
  validateReaderArchitecture(contract.readerArchitecture, contract.metricDefaults, facts);
  validateModuleHealth(contract.moduleHealth, contract.metricDefaults, facts);
  validateDependencyGraph(contract.dependencyGraph, facts);
  assertObject(contract.rules, 'architecture contract.rules');

  const layerNames = new Set();
  const layerRoots = new Set();
  contract.layers.forEach((layer, index) => {
    assertObject(layer, `architecture contract.layers[${index}]`);
    assertNonEmptyString(layer.name, `architecture contract.layers[${index}].name`);
    assertNonEmptyString(layer.root, `architecture contract.layers[${index}].root`);
    assertStringArray(layer.canDependOn, `architecture contract.layers[${index}].canDependOn`, { allowEmpty: true });

    if (layerNames.has(layer.name)) {
      fail(`architecture contract.layers contains a duplicate layer name: ${layer.name}`);
    }
    if (layerRoots.has(layer.root)) {
      fail(`architecture contract.layers contains a duplicate layer root: ${layer.root}`);
    }

    layerNames.add(layer.name);
    layerRoots.add(layer.root);
    assertExistingPath(layer.root, `architecture contract.layers[${index}].root`, facts);
  });

  contract.layers.forEach((layer, index) => {
    layer.canDependOn.forEach((dependency) => {
      if (!layerNames.has(dependency)) {
        fail(`architecture contract.layers[${index}].canDependOn references an unknown layer: ${dependency}`);
      }
    });
  });

  const { domainEntryConsumers, readerFamily, specialInfraDbRestrictions } = contract.rules;
  assertObject(domainEntryConsumers, 'architecture contract.rules.domainEntryConsumers');
  assertStringArray(
    domainEntryConsumers.files,
    'architecture contract.rules.domainEntryConsumers.files',
  );
  domainEntryConsumers.files.forEach((pattern, index) => {
    assertExistingPath(
      pattern,
      `architecture contract.rules.domainEntryConsumers.files[${index}]`,
      facts,
    );
  });
  assertNonEmptyString(
    domainEntryConsumers.restrictedSubpathPattern,
    'architecture contract.rules.domainEntryConsumers.restrictedSubpathPattern',
  );
  assertNonEmptyString(
    domainEntryConsumers.message,
    'architecture contract.rules.domainEntryConsumers.message',
  );

  if (!Array.isArray(specialInfraDbRestrictions) || specialInfraDbRestrictions.length === 0) {
    fail('architecture contract.rules.specialInfraDbRestrictions must be a non-empty array.');
  }
  specialInfraDbRestrictions.forEach((restriction, index) => {
    assertObject(restriction, `architecture contract.rules.specialInfraDbRestrictions[${index}]`);
    assertNonEmptyString(
      restriction.domain,
      `architecture contract.rules.specialInfraDbRestrictions[${index}].domain`,
    );
    if (!facts.domainNames.includes(restriction.domain)) {
      fail(
        `architecture contract.rules.specialInfraDbRestrictions[${index}].domain references an unknown domain: ${restriction.domain}`,
      );
    }
    assertStringArray(
      restriction.files,
      `architecture contract.rules.specialInfraDbRestrictions[${index}].files`,
    );
    restriction.files.forEach((pattern, fileIndex) => {
      assertExistingPath(
        pattern,
        `architecture contract.rules.specialInfraDbRestrictions[${index}].files[${fileIndex}]`,
        facts,
      );
    });
    assertStringArray(
      restriction.ignores,
      `architecture contract.rules.specialInfraDbRestrictions[${index}].ignores`,
      { allowEmpty: true },
    );
    restriction.ignores.forEach((pattern, ignoreIndex) => {
      assertExistingPath(
        pattern,
        `architecture contract.rules.specialInfraDbRestrictions[${index}].ignores[${ignoreIndex}]`,
        facts,
      );
    });
    assertStringArray(
      restriction.restrictedImports,
      `architecture contract.rules.specialInfraDbRestrictions[${index}].restrictedImports`,
    );
    assertNonEmptyString(
      restriction.message,
      `architecture contract.rules.specialInfraDbRestrictions[${index}].message`,
    );
  });

  assertObject(readerFamily, 'architecture contract.rules.readerFamily');
  assertPatternArray(
    readerFamily.files,
    'architecture contract.rules.readerFamily.files',
    facts,
  );
  assertRestrictedImportEntries(
    readerFamily.restrictedImports,
    'architecture contract.rules.readerFamily.restrictedImports',
  );

  return contract;
}

export function validateTableOwnershipContract(contract, facts = createRepositoryFacts()) {
  assertObject(contract, 'table ownership contract');
  assertStringArray(contract.rules, 'table ownership contract.rules');
  assertStringArray(contract.dataModelNotes, 'table ownership contract.dataModelNotes');

  if (!Array.isArray(contract.crossDomainExits)) {
    fail('table ownership contract.crossDomainExits must be an array.');
  }
  contract.crossDomainExits.forEach((entry, index) => {
    assertObject(entry, `table ownership contract.crossDomainExits[${index}]`);
    assertNonEmptyString(entry.label, `table ownership contract.crossDomainExits[${index}].label`);
    assertNonEmptyString(entry.api, `table ownership contract.crossDomainExits[${index}].api`);
  });

  if (!Array.isArray(contract.tables) || contract.tables.length === 0) {
    fail('table ownership contract.tables must be a non-empty array.');
  }

  const tableNames = new Set();
  contract.tables.forEach((table, index) => {
    assertObject(table, `table ownership contract.tables[${index}]`);
    assertNonEmptyString(table.name, `table ownership contract.tables[${index}].name`);
    if (tableNames.has(table.name)) {
      fail(`table ownership contract.tables contains a duplicate table name: ${table.name}`);
    }
    if (!facts.knownTables.includes(table.name)) {
      fail(`table ownership contract.tables[${index}].name references an unknown table: ${table.name}`);
    }
    tableNames.add(table.name);

    assertNonEmptyString(
      table.ownerDomain,
      `table ownership contract.tables[${index}].ownerDomain`,
    );
    if (!facts.domainNames.includes(table.ownerDomain)) {
      fail(
        `table ownership contract.tables[${index}].ownerDomain references an unknown domain: ${table.ownerDomain}`,
      );
    }

    assertNonEmptyString(
      table.allowedDirectAccessSummary,
      `table ownership contract.tables[${index}].allowedDirectAccessSummary`,
    );
    assertStringArray(
      table.allowedDirectAccessPaths,
      `table ownership contract.tables[${index}].allowedDirectAccessPaths`,
    );
    table.allowedDirectAccessPaths.forEach((pattern, pathIndex) => {
      assertExistingPath(
        pattern,
        `table ownership contract.tables[${index}].allowedDirectAccessPaths[${pathIndex}]`,
        facts,
      );
      if (pattern.startsWith('src/application/')) {
        fail(
          `table ownership contract.tables[${index}].allowedDirectAccessPaths[${pathIndex}] must not point into src/application: ${pattern}`,
        );
      }
    });

    assertStringArray(
      table.allowedApplicationPaths,
      `table ownership contract.tables[${index}].allowedApplicationPaths`,
      { allowEmpty: true },
    );
    table.allowedApplicationPaths.forEach((pattern, pathIndex) => {
      assertExistingPath(
        pattern,
        `table ownership contract.tables[${index}].allowedApplicationPaths[${pathIndex}]`,
        facts,
      );
      if (!pattern.startsWith('src/application/')) {
        fail(
          `table ownership contract.tables[${index}].allowedApplicationPaths[${pathIndex}] must point into src/application: ${pattern}`,
        );
      }
    });

    assertStringArray(table.publicApi, `table ownership contract.tables[${index}].publicApi`);
  });

  return contract;
}

export function loadArchitectureContract(rootDirectory = REPOSITORY_ROOT) {
  const facts = createRepositoryFacts(rootDirectory);
  const contract = readContractJson(rootDirectory, ARCHITECTURE_CONTRACT_PATH);
  return validateArchitectureContract(contract, facts);
}

export function loadTableOwnershipContract(rootDirectory = REPOSITORY_ROOT) {
  const facts = createRepositoryFacts(rootDirectory);
  const contract = readContractJson(rootDirectory, TABLE_OWNERSHIP_CONTRACT_PATH);
  return validateTableOwnershipContract(contract, facts);
}

export {
  ARCHITECTURE_CONTRACT_PATH,
  TABLE_OWNERSHIP_CONTRACT_PATH,
};
