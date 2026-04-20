import { describe, expect, it } from 'vitest';

import {
  RICH_CONTENT_CAPABILITIES,
  type RichContentCapabilityId,
} from '@shared/contracts';

import {
  EPUB_IMPORT_DOWNGRADE_ONLY_CAPABILITY_IDS,
  EPUB_IMPORT_IMPLEMENTED_CAPABILITY_IDS,
} from '../epub/epubRichContentCapabilityCoverage';

describe('epub rich-content capability coverage', () => {
  it('keeps parser capability coverage aligned with registry implementation states', () => {
    const implementedIds = new Set(
      RICH_CONTENT_CAPABILITIES
        .filter((capability) => capability.implementationState.import === 'implemented')
        .map((capability) => capability.id),
    );
    const downgradeOnlyIds = new Set(
      RICH_CONTENT_CAPABILITIES
        .filter((capability) => capability.implementationState.import === 'downgrade_only')
        .map((capability) => capability.id),
    );

    expect([...implementedIds].sort())
      .toEqual([...EPUB_IMPORT_IMPLEMENTED_CAPABILITY_IDS].sort());
    expect([...downgradeOnlyIds].sort())
      .toEqual([...EPUB_IMPORT_DOWNGRADE_ONLY_CAPABILITY_IDS].sort());
  });

  it('requires every downgrade-only import capability to declare an explicit fallback target', () => {
    EPUB_IMPORT_DOWNGRADE_ONLY_CAPABILITY_IDS.forEach((capabilityId) => {
      const capability = RICH_CONTENT_CAPABILITIES.find(
        (entry) => entry.id === capabilityId,
      );

      expect(capability?.downgradeTargets).toBeDefined();
    });
  });

  it('does not accidentally classify planned capabilities as implemented parser coverage', () => {
    const coveredIds = new Set<RichContentCapabilityId>([
      ...EPUB_IMPORT_IMPLEMENTED_CAPABILITY_IDS,
      ...EPUB_IMPORT_DOWNGRADE_ONLY_CAPABILITY_IDS,
    ]);

    expect(coveredIds.has('poem')).toBe(false);
    expect(coveredIds.has('footnote')).toBe(false);
  });
});
