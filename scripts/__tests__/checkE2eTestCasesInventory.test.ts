// @vitest-environment node

import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import { REPOSITORY_ROOT } from '../architecture/repositoryFacts.mjs';
import {
  compareE2eTestCasesInventoryDocument,
  loadE2eTestCases,
  parsePlaywrightTestCases,
  renderE2eTestCasesInventoryDocument,
  validateE2eTestCasesInventory,
} from '../checkE2eTestCasesInventory.mjs';

describe('checkE2eTestCasesInventory', () => {
  it('accepts the repository test cases and keeps the generated document in sync', async () => {
    const inventory = await loadE2eTestCases(REPOSITORY_ROOT);
    const actualDocument = readFileSync(
      `${REPOSITORY_ROOT}/docs/e2e-test-cases-inventory.md`,
      'utf8',
    );

    expect(validateE2eTestCasesInventory(inventory)).toEqual([]);
    expect(renderE2eTestCasesInventoryDocument(inventory.cases))
      .toContain('This file is generated from `tests/playwright/**/*.spec.ts`');
    expect(compareE2eTestCasesInventoryDocument(inventory.cases, actualDocument)).toMatchObject({
      isInSync: true,
    });
  });

  it('rejects duplicate ids, missing ids, and non-continuous numbering', () => {
    const inventory = {
      cases: [
        {
          category: 'Smoke',
          describeTitle: '冒烟',
          filePath: 'tests/playwright/smoke/example.spec.ts',
          id: 'TC-001',
          projects: ['chromium'],
          title: '第一个用例',
        },
        {
          category: 'Smoke',
          describeTitle: '冒烟',
          filePath: 'tests/playwright/smoke/duplicate.spec.ts',
          id: 'TC-001',
          projects: ['chromium'],
          title: '重复编号',
        },
        {
          category: 'Behavior',
          describeTitle: '行为',
          filePath: 'tests/playwright/behavior/example.spec.ts',
          id: 'TC-003',
          projects: ['chromium'],
          title: '跳号用例',
        },
      ],
      unnumberedTests: [
        {
          describeTitle: '行为',
          filePath: 'tests/playwright/behavior/missing.spec.ts',
          title: '没有编号的用例',
        },
      ],
    };

    expect(validateE2eTestCasesInventory(inventory)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Duplicate E2E test case id TC-001'),
        expect.stringContaining('Playwright test is missing TC-xxx prefix'),
        'Missing E2E test case id TC-002.',
      ]),
    );
  });

  it('only parses Playwright test declarations and ignores TC labels in test bodies', () => {
    const parsed = parsePlaywrightTestCases(
      [
        'test.describe(\'阅读器行为\', () => {',
        '  test(\'TC-010 有编号的用例\', async ({ page }) => {',
        '    await expect(page.getByText(\'TC-999 只是断言文本\')).toBeVisible();',
        '  });',
        '  test(\'缺少编号的用例\', async () => {});',
        '});',
      ].join('\n'),
      'tests/playwright/behavior/reader.spec.ts',
    );

    expect(parsed.cases).toEqual([
      expect.objectContaining({
        describeTitle: '阅读器行为',
        id: 'TC-010',
        title: '有编号的用例',
      }),
    ]);
    expect(parsed.unnumberedTests).toEqual([
      expect.objectContaining({
        title: '缺少编号的用例',
      }),
    ]);
  });
});
