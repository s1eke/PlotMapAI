// @vitest-environment node

import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import { REPOSITORY_ROOT } from '../architecture/repositoryFacts.mjs';
import {
  compareRichContentSupportMatrixDocument,
  loadRichContentCapabilitiesModule,
  renderRichContentSupportMatrixDocument,
  validateRichContentCapabilitiesRegistry,
} from '../checkRichContentCapabilities.mjs';

describe('checkRichContentCapabilities', () => {
  it('accepts the repository registry and keeps the generated document in sync', async () => {
    const registryModule = await loadRichContentCapabilitiesModule(REPOSITORY_ROOT);
    const actualDocument = readFileSync(
      `${REPOSITORY_ROOT}/docs/epub-rich-content-support-matrix.md`,
      'utf8',
    );

    expect(validateRichContentCapabilitiesRegistry(registryModule)).toEqual([]);
    expect(renderRichContentSupportMatrixDocument(registryModule))
      .toContain('This file is generated from `src/shared/contracts/rich-content-capabilities.ts`.');
    expect(compareRichContentSupportMatrixDocument(registryModule, actualDocument)).toMatchObject({
      isInSync: true,
    });
  });

  it('rejects duplicate capability ids and missing downgrade targets', async () => {
    const registryModule = await loadRichContentCapabilitiesModule(REPOSITORY_ROOT);
    const brokenRegistryModule = {
      ...registryModule,
      RICH_CONTENT_CAPABILITIES: structuredClone(registryModule.RICH_CONTENT_CAPABILITIES),
    };

    brokenRegistryModule.RICH_CONTENT_CAPABILITIES.push(
      structuredClone(brokenRegistryModule.RICH_CONTENT_CAPABILITIES[0]),
    );
    const duplicateCapability = brokenRegistryModule.RICH_CONTENT_CAPABILITIES[
      brokenRegistryModule.RICH_CONTENT_CAPABILITIES.length - 1
    ];
    duplicateCapability.id = brokenRegistryModule.RICH_CONTENT_CAPABILITIES[0].id;
    brokenRegistryModule.RICH_CONTENT_CAPABILITIES
      .find((capability) => capability.id === 'complex-svg').downgradeTargets = undefined;

    expect(validateRichContentCapabilitiesRegistry(brokenRegistryModule)).toEqual(
      expect.arrayContaining([
        'RICH_CONTENT_CAPABILITIES contains a duplicate id: heading',
        expect.stringContaining('complex-svg'),
      ]),
    );
  });
});
