import type { NovelView } from '@domains/library';

import { novelRepository } from '@domains/library';

export async function loadReaderSession(novelId: number): Promise<{ novel: NovelView }> {
  return {
    novel: await novelRepository.get(novelId),
  };
}
