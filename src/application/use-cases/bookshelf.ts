import type { ImportBookOptions } from '@domains/book-import';
import type { NovelView } from '@domains/library';

import { bookLifecycleService } from '@application/services/bookLifecycleService';
import {
  ensureDefaultPurificationRules,
  ensureDefaultTocRules,
  purificationRuleRepository,
  tocRuleRepository,
} from '@domains/settings';

export async function importBookAndRefreshLibrary(
  file: File,
  options: ImportBookOptions = {},
): Promise<NovelView> {
  await Promise.all([
    ensureDefaultTocRules(),
    ensureDefaultPurificationRules(),
  ]);
  const [tocRules, purificationRules] = await Promise.all([
    tocRuleRepository.getEnabledChapterDetectionRules(),
    purificationRuleRepository.getEnabledPurificationRules(),
  ]);

  return bookLifecycleService.importBook(file, tocRules, {
    ...options,
    purificationRules,
  });
}
