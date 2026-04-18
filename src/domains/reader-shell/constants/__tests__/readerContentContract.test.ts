import { describe, expect, it } from 'vitest';

import {
  RICH_BLOCK_TYPES,
  RICH_CONTENT_CAPABILITIES,
  RICH_READER_INLINE_VARIANTS,
} from '@shared/contracts';
import {
  READER_CONTENT_CLASS_NAMES,
  READER_CONTENT_CONTEXT_SPECS,
  READER_CONTENT_INLINE_SPECS,
  READER_CONTENT_LEAF_SPECS,
  READER_CONTENT_MEASURED_TOKENS,
  READER_CONTENT_MODE_CLASSES,
  READER_CONTENT_SOURCE_STRUCTURE_SPECS,
  READER_CONTENT_THEME_CLASSES,
  READER_CONTENT_VISUAL_TOKENS,
} from '@shared/reader-rendering';
import { READER_THEMES } from '../readerThemes';

describe('reader content contract', () => {
  it('uses the pm-reader prefix for all exported class names', () => {
    const classNames = [
      ...Object.values(READER_CONTENT_CLASS_NAMES),
      ...Object.values(READER_CONTENT_MODE_CLASSES),
      ...Object.values(READER_CONTENT_THEME_CLASSES),
    ];

    expect(classNames.length).toBeGreaterThan(0);
    for (const className of classNames) {
      expect(className.startsWith('pm-reader')).toBe(true);
    }
  });

  it('keeps theme classes aligned with the available reader themes', () => {
    const themeClassKeys = new Set(Object.keys(READER_CONTENT_THEME_CLASSES));
    const themeKeys = new Set(Object.keys(READER_THEMES));

    expect(themeClassKeys).toEqual(themeKeys);
  });

  it('keeps measured and visual tokens unique and disjoint', () => {
    expect(new Set(READER_CONTENT_MEASURED_TOKENS).size)
      .toBe(READER_CONTENT_MEASURED_TOKENS.length);
    expect(new Set(READER_CONTENT_VISUAL_TOKENS).size)
      .toBe(READER_CONTENT_VISUAL_TOKENS.length);

    const overlaps = READER_CONTENT_MEASURED_TOKENS
      .filter((token) => READER_CONTENT_VISUAL_TOKENS.includes(token as never));
    expect(overlaps).toEqual([]);

    for (const token of [
      ...READER_CONTENT_MEASURED_TOKENS,
      ...READER_CONTENT_VISUAL_TOKENS,
    ]) {
      expect(token.startsWith('--pm-reader-')).toBe(true);
    }
  });

  it('covers every rich block source structure exactly once', () => {
    const sourceBlockTypes = READER_CONTENT_SOURCE_STRUCTURE_SPECS
      .map((spec) => spec.sourceBlockType);

    expect(sourceBlockTypes).toEqual(RICH_BLOCK_TYPES);
    expect(new Set(sourceBlockTypes).size).toBe(sourceBlockTypes.length);
  });

  it('covers every pagination leaf block exactly once', () => {
    const leafVariants = READER_CONTENT_LEAF_SPECS.map((spec) => spec.leafVariant);
    expect(leafVariants).toEqual([
      'heading',
      'paragraph',
      'image',
      'table',
      'hr',
      'unsupported',
    ]);

    const paginationBlockTypes = READER_CONTENT_LEAF_SPECS
      .flatMap((spec) => spec.paginationBlockTypes);
    expect(paginationBlockTypes).toEqual([
      'heading',
      'paragraph',
      'image',
      'table',
      'hr',
      'unsupported',
    ]);

    for (const spec of READER_CONTENT_LEAF_SPECS) {
      expect(spec.classNames).toContain(READER_CONTENT_CLASS_NAMES.block);
      expect(spec.measuredTokens.length).toBeGreaterThan(0);
      expect(spec.visualTokens.length).toBeGreaterThan(0);
    }
  });

  it('covers every pagination container context exactly once', () => {
    const contextVariants = READER_CONTENT_CONTEXT_SPECS.map((spec) => spec.contextVariant);
    expect(contextVariants).toEqual([
      'body',
      'blockquote',
      'list-item',
      'poem-line',
      'table-cell',
    ]);

    const containers = READER_CONTENT_CONTEXT_SPECS.flatMap((spec) => spec.containers);
    expect(containers).toEqual([
      'body',
      'blockquote',
      'list-item',
      'poem-line',
      'table-cell',
    ]);
  });

  it('covers every inline semantic variant exactly once', () => {
    const inlineVariants = READER_CONTENT_INLINE_SPECS.map((spec) => spec.inlineVariant);

    expect(inlineVariants).toEqual(RICH_READER_INLINE_VARIANTS);
    expect(new Set(inlineVariants).size).toBe(inlineVariants.length);
  });

  it('covers every reader-implemented capability declared in the registry', () => {
    const sourceBlockTypeSet = new Set(
      READER_CONTENT_SOURCE_STRUCTURE_SPECS.map((spec) => spec.sourceBlockType),
    );
    const inlineVariantSet = new Set(
      READER_CONTENT_INLINE_SPECS.map((spec) => spec.inlineVariant),
    );
    const leafVariantSet = new Set(
      READER_CONTENT_LEAF_SPECS.map((spec) => spec.leafVariant),
    );
    const contextVariantSet = new Set(
      READER_CONTENT_CONTEXT_SPECS.map((spec) => spec.contextVariant),
    );

    RICH_CONTENT_CAPABILITIES
      .filter((capability) => capability.implementationState.reader === 'implemented')
      .forEach((capability) => {
        expect(capability.readerCoverage).toBeDefined();

        capability.readerCoverage?.sourceBlockTypes?.forEach((sourceBlockType) => {
          expect(sourceBlockTypeSet.has(sourceBlockType)).toBe(true);
        });
        capability.readerCoverage?.inlineVariants?.forEach((inlineVariant) => {
          expect(inlineVariantSet.has(inlineVariant)).toBe(true);
        });
        capability.readerCoverage?.leafVariants?.forEach((leafVariant) => {
          expect(leafVariantSet.has(leafVariant)).toBe(true);
        });
        capability.readerCoverage?.contextVariants?.forEach((contextVariant) => {
          expect(contextVariantSet.has(contextVariant)).toBe(true);
        });
      });
  });

  it('binds every contract spec back to exported tokens and prefixed helper classes', () => {
    const measuredTokenSet = new Set(READER_CONTENT_MEASURED_TOKENS);
    const visualTokenSet = new Set(READER_CONTENT_VISUAL_TOKENS);

    for (const spec of READER_CONTENT_CONTEXT_SPECS) {
      for (const className of [...spec.classNames, ...spec.helperClassNames]) {
        expect(className.startsWith('pm-reader')).toBe(true);
      }
      for (const token of spec.measuredTokens) {
        expect(measuredTokenSet.has(token)).toBe(true);
      }
      for (const token of spec.visualTokens) {
        expect(visualTokenSet.has(token)).toBe(true);
      }
    }

    for (const spec of READER_CONTENT_INLINE_SPECS) {
      for (const className of spec.classNames) {
        expect(className.startsWith('pm-reader')).toBe(true);
      }
      for (const token of spec.visualTokens) {
        expect(visualTokenSet.has(token)).toBe(true);
      }
    }
  });
});
