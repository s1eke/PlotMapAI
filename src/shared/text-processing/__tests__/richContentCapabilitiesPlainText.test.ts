import { describe, expect, it } from 'vitest';

import type { RichBlock } from '@shared/contracts';
import { RICH_CONTENT_CAPABILITIES } from '@shared/contracts';

import { richTextToPlainText } from '../richTextPlain';

function buildAnalysisFixture(
  capabilityId: string,
): { blocks: RichBlock[]; expectedPlainText: string } | null {
  switch (capabilityId) {
    case 'heading':
      return {
        blocks: [{
          type: 'heading',
          level: 2,
          children: [{ type: 'text', text: 'Heading' }],
        }],
        expectedPlainText: 'Heading',
      };
    case 'paragraph':
      return {
        blocks: [{
          type: 'paragraph',
          children: [{ type: 'text', text: 'Paragraph body' }],
        }],
        expectedPlainText: 'Paragraph body',
      };
    case 'br':
      return {
        blocks: [{
          type: 'paragraph',
          children: [
            { type: 'text', text: 'Line 1' },
            { type: 'lineBreak' },
            { type: 'text', text: 'Line 2' },
          ],
        }],
        expectedPlainText: 'Line 1\nLine 2',
      };
    case 'strong':
      return {
        blocks: [{
          type: 'paragraph',
          children: [{ type: 'text', text: 'Bold', marks: ['bold'] }],
        }],
        expectedPlainText: 'Bold',
      };
    case 'em':
      return {
        blocks: [{
          type: 'paragraph',
          children: [{ type: 'text', text: 'Italic', marks: ['italic'] }],
        }],
        expectedPlainText: 'Italic',
      };
    case 'underline':
      return {
        blocks: [{
          type: 'paragraph',
          children: [{ type: 'text', text: 'Underline', marks: ['underline'] }],
        }],
        expectedPlainText: 'Underline',
      };
    case 'strike':
      return {
        blocks: [{
          type: 'paragraph',
          children: [{ type: 'text', text: 'Strike', marks: ['strike'] }],
        }],
        expectedPlainText: 'Strike',
      };
    case 'sup':
      return {
        blocks: [{
          type: 'paragraph',
          children: [{ type: 'text', text: '1', marks: ['sup'] }],
        }],
        expectedPlainText: '1',
      };
    case 'sub':
      return {
        blocks: [{
          type: 'paragraph',
          children: [{ type: 'text', text: '2', marks: ['sub'] }],
        }],
        expectedPlainText: '2',
      };
    case 'blockquote':
      return {
        blocks: [{
          type: 'blockquote',
          children: [{
            type: 'paragraph',
            children: [{ type: 'text', text: 'Quoted line' }],
          }],
        }],
        expectedPlainText: 'Quoted line',
      };
    case 'ul':
      return {
        blocks: [{
          type: 'list',
          ordered: false,
          items: [
            [{
              type: 'paragraph',
              children: [{ type: 'text', text: 'Alpha' }],
            }],
            [{
              type: 'paragraph',
              children: [{ type: 'text', text: 'Beta' }],
            }],
          ],
        }],
        expectedPlainText: '- Alpha\n- Beta',
      };
    case 'ol':
      return {
        blocks: [{
          type: 'list',
          ordered: true,
          items: [
            [{
              type: 'paragraph',
              children: [{ type: 'text', text: 'Alpha' }],
            }],
            [{
              type: 'paragraph',
              children: [{ type: 'text', text: 'Beta' }],
            }],
          ],
        }],
        expectedPlainText: '1. Alpha\n2. Beta',
      };
    case 'li':
      return {
        blocks: [{
          type: 'list',
          ordered: false,
          items: [[{
            type: 'paragraph',
            children: [{ type: 'text', text: 'Single item' }],
          }]],
        }],
        expectedPlainText: '- Single item',
      };
    case 'image':
      return {
        blocks: [{
          type: 'image',
          key: 'img_1',
          alt: 'World map',
        }],
        expectedPlainText: 'World map',
      };
    case 'caption':
      return {
        blocks: [{
          type: 'image',
          key: 'img_2',
          caption: [{ type: 'text', text: 'Image caption' }],
        }],
        expectedPlainText: 'Image caption',
      };
    case 'hr':
      return {
        blocks: [{
          type: 'hr',
        }],
        expectedPlainText: '---',
      };
    case 'poem':
      return {
        blocks: [{
          type: 'poem',
          lines: [
            [{ type: 'text', text: 'First line' }],
            [{ type: 'text', text: 'Second line' }],
          ],
        }],
        expectedPlainText: 'First line\nSecond line',
      };
    case 'simple-table':
      return {
        blocks: [{
          type: 'table',
          rows: [[
            { children: [{ type: 'text', text: 'Left' }] },
            { children: [{ type: 'text', text: 'Right' }] },
          ]],
        }],
        expectedPlainText: 'Left | Right',
      };
    case 'internal-link':
      return {
        blocks: [{
          type: 'paragraph',
          children: [{
            type: 'link',
            href: '#intro',
            children: [{ type: 'text', text: 'Jump back' }],
          }],
        }],
        expectedPlainText: 'Jump back',
      };
    default:
      return null;
  }
}

describe('rich content capability plain-text projection', () => {
  it('projects every analysis-implemented capability according to the registry', () => {
    RICH_CONTENT_CAPABILITIES
      .filter((capability) => capability.implementationState.analysis === 'implemented')
      .forEach((capability) => {
        const fixture = buildAnalysisFixture(capability.id);

        expect(fixture).not.toBeNull();
        expect(richTextToPlainText(fixture?.blocks ?? [])).toBe(fixture?.expectedPlainText);
      });
  });
});
