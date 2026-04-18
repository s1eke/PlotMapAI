import { describe, expect, it } from 'vitest';

import {
  RICH_BLOCK_TYPES as EXPORTED_RICH_BLOCK_TYPES,
  RICH_INLINE_TYPES as EXPORTED_RICH_INLINE_TYPES,
  RICH_MARKS as EXPORTED_RICH_MARKS,
  RICH_TEXT_ALIGNS as EXPORTED_RICH_TEXT_ALIGNS,
} from '../rich-content';
import {
  RICH_BLOCK_TYPES,
  RICH_CONTENT_CAPABILITIES,
  RICH_INLINE_TYPES,
  RICH_MARKS,
  RICH_TEXT_ALIGNS,
} from '../rich-content-capabilities';

describe('rich content capabilities contract', () => {
  it('re-exports discriminant constants from the capability registry', () => {
    expect(EXPORTED_RICH_BLOCK_TYPES).toEqual(RICH_BLOCK_TYPES);
    expect(EXPORTED_RICH_INLINE_TYPES).toEqual(RICH_INLINE_TYPES);
    expect(EXPORTED_RICH_MARKS).toEqual(RICH_MARKS);
    expect(EXPORTED_RICH_TEXT_ALIGNS).toEqual(RICH_TEXT_ALIGNS);
  });

  it('keeps AST targets aligned with exported block, inline, mark, and align variants', () => {
    const blockTypeSet = new Set(RICH_BLOCK_TYPES);
    const inlineTypeSet = new Set(RICH_INLINE_TYPES);
    const markSet = new Set(RICH_MARKS);
    const alignSet = new Set(RICH_TEXT_ALIGNS);

    RICH_CONTENT_CAPABILITIES.forEach((capability) => {
      capability.astTargets?.blockTypes?.forEach((blockType) => {
        expect(blockTypeSet.has(blockType)).toBe(true);
      });
      capability.astTargets?.inlineTypes?.forEach((inlineType) => {
        expect(inlineTypeSet.has(inlineType)).toBe(true);
      });
      capability.astTargets?.marks?.forEach((mark) => {
        expect(markSet.has(mark)).toBe(true);
      });
      capability.astTargets?.aligns?.forEach((align) => {
        expect(alignSet.has(align)).toBe(true);
      });
    });
  });
});
