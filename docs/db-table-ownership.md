# DB Table Ownership

This file is generated from `scripts/architecture/contracts/table-ownership.json`. Do not edit it manually.

这份文档定义 Dexie 表的 owner、允许访问层级，以及跨域时必须经过的公开出口。

## Ownership Matrix

| Table | Owner | Allowed Direct Access | Public API |
|------|------|------|------|
| `novels` | `@domains/library` | 图书库，应用层编排 | `novelRepository.list/get/getNovelTitle/createImportedNovel/replaceImportedNovel/delete` |
| `coverImages` | `@domains/library` | library, application orchestration | `novelRepository.createImportedNovel/replaceImportedNovel/delete`, `acquireNovelCoverResource` |
| `chapters` | `@domains/book-content` | 书籍内容，应用层编排 | `bookContentRepository.listNovelChapters/getNovelChapter/countNovelChapters/replaceNovelContent/deleteNovelContent` |
| `chapterRichContents` | `@domains/book-content` | book-content, application orchestration, app/debug diagnostics | `chapterRichContentRepository.replaceNovelChapterRichContents/listNovelChapterRichContents/getNovelChapterRichContent/deleteNovelChapterRichContents` |
| `chapterImages` | `@domains/book-content` | 书籍内容，应用层编排，调试面板诊断 | `bookContentRepository.getChapterImageBlob/replaceNovelContent/deleteNovelContent` |
| `novelImageGalleryEntries` | `@domains/book-content` | book-content, application orchestration | `bookContentRepository.listNovelImageGalleryEntries/replaceNovelContent/deleteNovelContent` |
| `tocRules` | `@domains/settings` | 设置 | `tocRuleRepository.*` |
| `purificationRules` | `@domains/settings` | settings | `purificationRuleRepository.getPurificationRules/getEnabledPurificationRules/*` |
| `appSettings` | `@domains/settings` | 设置，基础设施/存储 | `设置仓库/服务`, `primaryStorage.settings.*` |
| `analysisJobs` | `@domains/analysis` | 人工智能分析，应用层编排 | `analysisService.getStatus/deleteArtifacts/start/pause/resume/restart/refreshOverview` |
| `analysisChunks` | `@domains/analysis` | analysis, application orchestration | `analysisService.*` |
| `chapterAnalyses` | `@domains/analysis` | analysis, application orchestration | `analysisService.getChapterAnalysis/deleteArtifacts/*` |
| `analysisOverviews` | `@domains/analysis` | analysis, application orchestration | `analysisService.getOverview/deleteArtifacts/*` |
| `readerProgress` | `@domains/reader-session` | 阅读器会话新进度内核，schema 迁移，应用层编排 | `readReaderProgressSnapshot/replaceReaderProgressSnapshot/deleteReaderProgressSnapshot` |
| `readerRenderCache` | `@domains/reader-layout-engine` | 阅读器排版引擎，应用层编排，调试面板诊断 | `排版缓存工具`, `deletePersistedReaderRenderCache` |
| `readerPretextMetrics` | `@domains/reader-layout-engine` | 阅读器排版引擎，应用层编排 | `pretext metrics cache utilities`, `deletePersistedReaderPretextMetrics` |

## Data Model Notes

- 当前版本要求每个章节都存在 chapterRichContents 行，并以结构化 richBlocks + plainText projection 作为唯一规范模型。
- 缺失 structured content 或仍携带已退场的 plain-only 数据，都应视为异常数据并引导 reparse / recovery，而不是继续按兼容状态读取。

## Rules

- 其他领域不能因为表在 @infra/db 中可见，就直接把该表当作自己的读模型或协调接口。
- 跨域读组合放在 application，例如 reader 内容净化读模型与整本书导入/删除生命周期。
- book-import 是 parse-only 领域，不直接写 Dexie。
- reader-content 不直接读 Dexie；它只消费 application 提供的 ReaderContentRuntimeValue。
- 预占位表不代表当前可访问，也不构成跨域直连许可；只有在 schema、owner API 和文档都落地后，才视为正式表能力。

## Current Cross-Domain Exits

- 阅读器内容： `@application/services/readerContentRuntime`
- 章节分析与人物图谱输入： `loadPurifiedBookChapters`
- 整本书导入 / 删除： `@application/services/bookLifecycleService`
