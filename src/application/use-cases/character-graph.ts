import type { CharacterGraphResponse } from '@shared/contracts';
import type { NovelView } from '@domains/library';

import { analysisService } from '@domains/analysis';
import { novelRepository } from '@domains/library';

import { projectNovelText } from '@application/read-models/novel-text-projection';

export interface CharacterGraphPageData {
  graph: CharacterGraphResponse;
  novel: NovelView;
}

export async function loadCharacterGraphPageData(
  novelId: number,
): Promise<CharacterGraphPageData> {
  const [novel, chapters] = await Promise.all([
    novelRepository.get(novelId),
    projectNovelText(novelId),
  ]);

  return {
    graph: await analysisService.getCharacterGraph(novelId, chapters),
    novel,
  };
}
