// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  loadArchitectureContract,
  loadTableOwnershipContract,
  validateArchitectureContract,
  validateTableOwnershipContract,
} from '../contracts.mjs';

describe('architecture contracts', () => {
  it('loads the repository architecture contract', () => {
    expect(loadArchitectureContract()).toMatchObject({
      metricDefaults: {
        metricBudgets: {
          effectiveLines: 500,
        },
      },
      layers: expect.arrayContaining([
        expect.objectContaining({ name: 'app', root: 'src/app' }),
        expect.objectContaining({ name: 'domains', root: 'src/domains' }),
      ]),
      moduleHealth: expect.objectContaining({
        scopes: expect.arrayContaining([
          expect.objectContaining({
            metricBudgets: expect.objectContaining({ crossLayerImports: 4 }),
            name: 'book-import',
          }),
          expect.objectContaining({
            metricBudgets: expect.objectContaining({ importCount: 9 }),
            name: 'app-debug',
          }),
        ]),
      }),
      dependencyGraph: expect.objectContaining({
        allowedDomainDependencies: expect.arrayContaining([
          expect.objectContaining({
            from: 'reader-shell',
            to: expect.arrayContaining(['reader-layout-engine', 'reader-media', 'reader-session']),
          }),
        ]),
        reports: expect.objectContaining({
          html: 'dist/analysis/dependency-graph-report.html',
          json: 'dist/analysis/dependency-graph-report.json',
        }),
      }),
      readerArchitecture: expect.objectContaining({
        metricBudgets: expect.objectContaining({
          crossLayerImports: 10,
          importCount: 16,
          maxFunctionLines: 380,
        }),
        stableBarrels: expect.arrayContaining([
          expect.objectContaining({ path: 'src/domains/reader-layout-engine/index.ts' }),
          expect.objectContaining({ path: 'src/domains/reader-content/index.ts' }),
        ]),
      }),
      rules: expect.objectContaining({
        domainEntryConsumers: expect.objectContaining({
          restrictedSubpathPattern: '@domains/*/*',
        }),
      }),
    });
  });

  it('rejects missing required architecture fields', () => {
    const contract = structuredClone(loadArchitectureContract());
    delete contract.rules.domainEntryConsumers.message;

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.rules.domainEntryConsumers.message must be a non-empty string.',
    );
  });

  it('rejects unknown domain references in architecture rules', () => {
    const contract = structuredClone(loadArchitectureContract());
    contract.rules.specialInfraDbRestrictions[0].domain = 'missing-domain';

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.rules.specialInfraDbRestrictions[0].domain references an unknown domain: missing-domain',
    );
  });

  it('rejects duplicate layer definitions', () => {
    const contract = structuredClone(loadArchitectureContract());
    contract.layers.push(structuredClone(contract.layers[0]));

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.layers contains a duplicate layer name: app',
    );
  });

  it('rejects missing required reader architecture fields', () => {
    const contract = structuredClone(loadArchitectureContract());
    delete contract.readerArchitecture.metricBudgets;

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.readerArchitecture.metricBudgets must be an object.',
    );
  });

  it('rejects missing required module health scope fields', () => {
    const contract = structuredClone(loadArchitectureContract());
    delete contract.moduleHealth.scopes[0].metricBudgets;

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.moduleHealth.scopes[0].metricBudgets must be an object.',
    );
  });

  it('rejects missing required dependency graph fields', () => {
    const contract = structuredClone(loadArchitectureContract());
    delete contract.dependencyGraph.reports;

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.dependencyGraph.reports must be an object.',
    );
  });

  it('rejects module health allowlist entries without reasons', () => {
    const contract = structuredClone(loadArchitectureContract());
    delete contract.moduleHealth.scopes[0].metricAllowlist[0].reason;

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.moduleHealth.scopes[0].metricAllowlist[0].reason must be a non-empty string.',
    );
  });

  it('rejects module health paths that do not exist', () => {
    const contract = structuredClone(loadArchitectureContract());
    contract.moduleHealth.scopes[0].metricAllowlist[0].path = 'src/domains/book-import/missing.ts';

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.moduleHealth.scopes[0].metricAllowlist[0].path references a missing path: src/domains/book-import/missing.ts',
    );
  });

  it('rejects unsupported module health metric keys', () => {
    const contract = structuredClone(loadArchitectureContract());
    contract.moduleHealth.scopes[0].metricBudgets.physicalLines = 500;

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.moduleHealth.scopes[0].metricBudgets.physicalLines is not a supported module health metric.',
    );
  });

  it('rejects allowlist entries without metrics', () => {
    const contract = structuredClone(loadArchitectureContract());
    delete contract.moduleHealth.scopes[0].metricAllowlist[0].metrics;

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.moduleHealth.scopes[0].metricAllowlist[0].metrics must be an array of non-empty strings.',
    );
  });

  it('rejects allowlist metrics that are not enabled for a scope', () => {
    const contract = structuredClone(loadArchitectureContract());
    contract.moduleHealth.scopes[2].metricAllowlist[0].metrics = ['importCount'];

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.moduleHealth.scopes[2].metricAllowlist[0].metrics[0] references a metric that is not enabled for this scope: importCount',
    );
  });

  it('rejects reader allowlist paths outside the reader scope', () => {
    const contract = structuredClone(loadArchitectureContract());
    contract.readerArchitecture.metricAllowlist[0].path = 'src/domains/book-import/bookImportService.ts';

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.readerArchitecture.metricAllowlist[0].path must resolve to a file covered by this scope: src/domains/book-import/bookImportService.ts',
    );
  });

  it('rejects unknown dependency graph domains', () => {
    const contract = structuredClone(loadArchitectureContract());
    contract.dependencyGraph.allowedDomainDependencies[0].to = ['missing-domain'];

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.dependencyGraph.allowedDomainDependencies[0].to[0] references an unknown domain: missing-domain',
    );
  });

  it('rejects dependency graph cycle baseline files outside the configured scope', () => {
    const contract = structuredClone(loadArchitectureContract());
    contract.dependencyGraph.cycleBaseline = [
      {
        files: ['src/domains/library/mappers.ts', 'src/domains/library/novelRepository.ts'],
        reason: 'test baseline entry',
      },
    ];
    contract.dependencyGraph.cycleBaseline[0].files[0] = 'src/test/mockWorker.ts';

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.dependencyGraph.cycleBaseline[0].files[0] must resolve to a production source file covered by the dependency graph scope: src/test/mockWorker.ts',
    );
  });

  it('rejects blank dependency graph report output paths', () => {
    const contract = structuredClone(loadArchitectureContract());
    contract.dependencyGraph.reports.json = '';

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.dependencyGraph.reports.json must be a non-empty string.',
    );
  });
});

describe('table ownership contracts', () => {
  it('loads the repository table ownership contract', () => {
    expect(loadTableOwnershipContract()).toMatchObject({
      tables: expect.arrayContaining([
        expect.objectContaining({ name: 'novels', ownerDomain: 'library' }),
        expect.objectContaining({ name: 'readerRenderCache', ownerDomain: 'reader-layout-engine' }),
      ]),
    });
  });

  it('rejects missing required ownership fields', () => {
    const contract = structuredClone(loadTableOwnershipContract());
    delete contract.tables[0].ownerDomain;

    expect(() => validateTableOwnershipContract(contract)).toThrow(
      'table ownership contract.tables[0].ownerDomain must be a non-empty string.',
    );
  });

  it('rejects unknown table references', () => {
    const contract = structuredClone(loadTableOwnershipContract());
    contract.tables[0].name = 'legacyStore';

    expect(() => validateTableOwnershipContract(contract)).toThrow(
      'table ownership contract.tables[0].name references an unknown table: legacyStore',
    );
  });

  it('rejects duplicate table definitions', () => {
    const contract = structuredClone(loadTableOwnershipContract());
    contract.tables.push(structuredClone(contract.tables[0]));

    expect(() => validateTableOwnershipContract(contract)).toThrow(
      'table ownership contract.tables contains a duplicate table name: novels',
    );
  });

  it('rejects application allowlists outside src/application', () => {
    const contract = structuredClone(loadTableOwnershipContract());
    contract.tables[0].allowedApplicationPaths = ['src/domains/library/novelRepository.ts'];

    expect(() => validateTableOwnershipContract(contract)).toThrow(
      'table ownership contract.tables[0].allowedApplicationPaths[0] must point into src/application: src/domains/library/novelRepository.ts',
    );
  });
});
