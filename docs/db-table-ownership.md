# DB Table Ownership

这份文档定义 Dexie 表的 owner、允许访问层级，以及跨域时必须经过的公开出口。

## Ownership Matrix

| Table | Owner | Allowed Direct Access | Public API |
|------|------|------|------|
| `novels` | `@domains/library` | `library`, `application` orchestration | `novelRepository.list/get/getNovelTitle/createImportedNovel/delete` |
| `coverImages` | `@domains/library` | `library`, `application` orchestration | `novelRepository.createImportedNovel/delete`, `acquireNovelCoverResource` |
| `chapters` | `@domains/book-content` | `book-content`, `application` orchestration | `bookContentRepository.listNovelChapters/getNovelChapter/countNovelChapters/replaceNovelContent/deleteNovelContent` |
| `chapterImages` | `@domains/book-content` | `book-content`, `application` orchestration | `bookContentRepository.getChapterImageBlob/replaceNovelContent/deleteNovelContent` |
| `novelImageGalleryEntries` | `@domains/book-content` | `book-content`, `application` orchestration | `bookContentRepository.listNovelImageGalleryEntries/replaceNovelContent/deleteNovelContent` |
| `tocRules` | `@domains/settings` | `settings` | `tocRuleRepository.*` |
| `purificationRules` | `@domains/settings` | `settings` | `purificationRuleRepository.getPurificationRules/getEnabledPurificationRules/*` |
| `appSettings` | `@domains/settings` | `settings` | settings repositories/services |
| `analysisJobs` | `@domains/analysis` | `analysis`, `application` orchestration | `analysisService.getStatus/deleteArtifacts/start/pause/resume/restart/refreshOverview` |
| `analysisChunks` | `@domains/analysis` | `analysis`, `application` orchestration | `analysisService.*` |
| `chapterAnalyses` | `@domains/analysis` | `analysis`, `application` orchestration | `analysisService.getChapterAnalysis/deleteArtifacts/*` |
| `analysisOverviews` | `@domains/analysis` | `analysis`, `application` orchestration | `analysisService.getOverview/deleteArtifacts/*` |
| `readingProgress` | `@domains/reader-session` | `reader-session`, `application` orchestration | `readReadingProgress/replaceReadingProgress/deleteReadingProgress` |
| `readerRenderCache` | `@domains/reader-layout-engine` | `reader-layout-engine`, `application` orchestration | render cache utils, `deletePersistedReaderRenderCache` |

## Rules

- 其他领域不能因为表在 `@infra/db` 中可见，就直接把该表当作自己的读模型或协调接口。
- 跨域读组合放在 `application`，例如 reader 内容净化读模型与整本书导入/删除生命周期。
- `book-import` 是 parse-only 领域，不直接写 Dexie。
- `reader-content` 不直接读 Dexie；它只消费 application 注册的 `ReaderContentController`。

## Current Cross-Domain Exits

- 阅读器内容：
  `@application/services/readerContentController`
- 章节分析与人物图谱输入：
  `loadPurifiedBookChapters`
- 整本书导入 / 删除：
  `@application/services/bookLifecycleService`

当前无文档化的临时例外。
