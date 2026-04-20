// @vitest-environment node

import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

import { loadTableOwnershipContract } from '../contracts.mjs';
import { REPOSITORY_ROOT } from '../repositoryFacts.mjs';
import {
  compareTableOwnershipDocument,
  evaluateTableOwnership,
  findTableAccesses,
  shouldIncludeOwnershipFile,
} from '../../checkTableOwnership.mjs';

describe('checkTableOwnership', () => {
  const contract = loadTableOwnershipContract();
  const knownTables = new Set(contract.tables.map((entry) => entry.name));

  it('detects db property access and transaction.table references', () => {
    expect(findTableAccesses(
      [
        'const value = await db.novels.get(1);',
        'const table = transaction.table<NovelRecord, number>(\'novels\') as typeof db.novels;',
      ].join('\n'),
      knownTables,
    )).toEqual({
      tableAccesses: [
        {
          access: 'db.novels',
          kind: 'db-property',
          tableName: 'novels',
        },
        {
          access: 'transaction.table(\'novels\')',
          kind: 'transaction-table',
          tableName: 'novels',
        },
      ],
      unknownTableReferences: [],
    });
  });

  it('allows owner domain files to access their tables', () => {
    const result = evaluateTableOwnership({
      'src/domains/library/novelRepository.ts': 'await db.novels.get(1);',
    }, contract);

    expect(result.invalidAccesses).toEqual([]);
    expect(result.unknownTableReferences).toEqual([]);
  });

  it('rejects non-owner direct table access', () => {
    const result = evaluateTableOwnership({
      'src/domains/analysis/runtime/repository.ts': 'await db.novels.get(1);',
    }, contract);

    expect(result.invalidAccesses).toEqual([
      expect.objectContaining({
        filePath: 'src/domains/analysis/runtime/repository.ts',
        ownerDomain: 'library',
        tableName: 'novels',
      }),
    ]);
  });

  it('allows whitelisted application orchestrators', () => {
    const result = evaluateTableOwnership({
      'src/application/services/bookLifecycleService.ts': 'await db.transaction(\'rw\', [db.novels], async () => {});',
    }, contract);

    expect(result.invalidAccesses).toEqual([]);
    expect(result.unknownTableReferences).toEqual([]);
  });

  it('rejects unwhitelisted application table access', () => {
    const result = evaluateTableOwnership({
      'src/application/use-cases/bookshelf.ts': 'await db.novels.get(1);',
    }, contract);

    expect(result.invalidAccesses).toEqual([
      expect.objectContaining({
        filePath: 'src/application/use-cases/bookshelf.ts',
        tableName: 'novels',
      }),
    ]);
  });

  it('flags unknown transaction table names', () => {
    const result = evaluateTableOwnership({
      'src/domains/library/novelRepository.ts': 'const table = transaction.table(\'legacyStore\');',
    }, contract);

    expect(result.unknownTableReferences).toEqual([
      expect.objectContaining({
        access: 'transaction.table(\'legacyStore\')',
        filePath: 'src/domains/library/novelRepository.ts',
        tableName: 'legacyStore',
      }),
    ]);
  });

  it('ignores test-only source files', () => {
    const result = evaluateTableOwnership({
      'src/domains/library/__tests__/novelRepository.test.ts': 'await db.novels.get(1);',
      'src/test/mockWorker.ts': 'await db.novels.get(1);',
    }, contract);

    expect(shouldIncludeOwnershipFile('src/domains/library/__tests__/novelRepository.test.ts')).toBe(false);
    expect(shouldIncludeOwnershipFile('src/test/mockWorker.ts')).toBe(false);
    expect(result.invalidAccesses).toEqual([]);
    expect(result.unknownTableReferences).toEqual([]);
  });

  it('keeps the generated db ownership document in sync', () => {
    const actualDocument = readFileSync(
      resolve(REPOSITORY_ROOT, 'docs/db-table-ownership.md'),
      'utf8',
    );

    expect(compareTableOwnershipDocument(contract, actualDocument)).toMatchObject({
      isInSync: true,
    });
  });
});
