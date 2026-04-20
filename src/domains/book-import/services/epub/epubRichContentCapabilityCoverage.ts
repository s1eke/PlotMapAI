import type { RichContentCapabilityId } from '@shared/contracts';

export const EPUB_IMPORT_IMPLEMENTED_CAPABILITY_IDS = [
  'heading',
  'paragraph',
  'br',
  'strong',
  'em',
  'underline',
  'strike',
  'sup',
  'sub',
  'blockquote',
  'ul',
  'ol',
  'li',
  'image',
  'caption',
  'text-align',
  'hr',
  'simple-table',
  'internal-link',
] as const satisfies readonly RichContentCapabilityId[];

export const EPUB_IMPORT_DOWNGRADE_ONLY_CAPABILITY_IDS = [
  'complex-css',
  'multi-column',
  'float',
  'complex-svg',
  'extreme-class-style',
  'complex-inline-style',
] as const satisfies readonly RichContentCapabilityId[];
