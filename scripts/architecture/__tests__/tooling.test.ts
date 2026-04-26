// @vitest-environment node

import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import { REPOSITORY_ROOT } from '../repositoryFacts.mjs';

describe('tooling integration', () => {
  it('keeps npm run lint wired in the expected gate order', () => {
    const packageJson = JSON.parse(readFileSync(`${REPOSITORY_ROOT}/package.json`, 'utf8'));

    expect(packageJson.scripts.lint).toBe(
      'eslint . && npm run lint:deps && npm run lint:ownership && npm run lint:module-health && npm run lint:docs && node scripts/checkReaderArchitecture.mjs --strict',
    );
    expect(packageJson.scripts['lint:docs']).toBe(
      'npm run lint:capabilities && npm run lint:e2e-inventory',
    );
  });

  it('documents contract-backed architecture gates in README', () => {
    const readme = readFileSync(`${REPOSITORY_ROOT}/README.md`, 'utf8');

    expect(readme).toContain('scripts/architecture/contracts/architecture.json');
    expect(readme).toContain('scripts/architecture/contracts/table-ownership.json');
    expect(readme).toContain('src/shared/contracts/rich-content-capabilities.ts');
    expect(readme).toContain('scripts/checkDependencyGraph.mjs');
    expect(readme).toContain('scripts/checkRichContentCapabilities.mjs');
    expect(readme).toContain('scripts/checkE2eTestCasesInventory.mjs');
    expect(readme).toContain('docs/e2e-test-cases-inventory.md');
    expect(readme).toContain('scripts/checkReaderArchitecture.mjs');
    expect(readme).toContain('scripts/checkTableOwnership.mjs');
    expect(readme).toContain('scripts/checkModuleHealth.mjs');
  });
});
