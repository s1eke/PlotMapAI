import { describe, expect, it } from 'vitest';
import * as readerContentDomain from '../index';

describe('@domains/reader-content barrel', () => {
  it('does not expose the removed implicit runtime registration APIs', () => {
    expect(readerContentDomain).not.toHaveProperty('readerContentService');
    expect(readerContentDomain).not.toHaveProperty('registerReaderContentController');
    expect(readerContentDomain).not.toHaveProperty('resetReaderContentControllerForTests');
  });
});
