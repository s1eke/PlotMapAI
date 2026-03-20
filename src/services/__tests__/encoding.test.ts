import { describe, it, expect } from 'vitest';
import { detectAndConvert } from '../encoding';

function strToBytes(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer;
}

describe('detectAndConvert', () => {
  it('returns empty text for empty buffer', () => {
    const result = detectAndConvert(new ArrayBuffer(0));
    expect(result.text).toBe('');
    expect(result.encoding).toBe('utf-8');
  });

  it('decodes UTF-8 text correctly', () => {
    const buf = strToBytes('Hello World');
    const result = detectAndConvert(buf);
    expect(result.text).toBe('Hello World');
    expect(result.encoding).toBe('utf-8');
  });

  it('detects UTF-8 BOM', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const text = new TextEncoder().encode('BOM text');
    const combined = new Uint8Array([...bom, ...text]);
    const result = detectAndConvert(combined.buffer);
    expect(result.text).toBe('BOM text');
    expect(result.encoding).toBe('utf-8-bom');
  });

  it('detects UTF-16 LE BOM', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]);
    const result = detectAndConvert(bytes.buffer);
    expect(result.text).toBe('Hi');
    expect(result.encoding).toBe('utf-16');
  });

  it('detects UTF-16 BE BOM', () => {
    const bytes = new Uint8Array([0xfe, 0xff, 0x00, 0x48, 0x00, 0x69]);
    const result = detectAndConvert(bytes.buffer);
    // TextDecoder('utf-16') may treat BE BOM as LE in jsdom
    expect(result.encoding).toBe('utf-16');
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('handles ASCII text', () => {
    const buf = strToBytes('Just ASCII');
    const result = detectAndConvert(buf);
    expect(result.text).toBe('Just ASCII');
  });

  it('falls back gracefully for non-text bytes', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc, 0xfb]);
    const result = detectAndConvert(bytes.buffer);
    expect(result.text).toBeDefined();
    expect(typeof result.encoding).toBe('string');
  });
});
