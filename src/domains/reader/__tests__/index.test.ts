import * as readerDomain from '../index';

import { describe, expect, it } from 'vitest';

describe('@domains/reader barrel', () => {
  it('does not expose internal session selectors or test resets', () => {
    expect(readerDomain).not.toHaveProperty('useReaderSessionSelector');
    expect(readerDomain).not.toHaveProperty('resetReaderSessionStoreForTests');
  });
});
