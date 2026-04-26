# Reader Progress Storage And Restore

更新时间：2026-04-27

## 现状总览

`readerProgress` 是阅读进度的 durable 主记录，由 `@domains/reader-session` 独占读写。应用只应通过领域 barrel 暴露的仓储接口访问：

- `readReaderProgressSnapshot(novelId)`
- `replaceReaderProgressSnapshot(novelId, snapshot)`
- `deleteReaderProgressSnapshot(novelId, transaction?)`

当前链路分为三层：

- 持久层：`ReaderProgressSnapshot` 写入 Dexie `readerProgress` 表。
- 会话层：`StoredReaderState` 作为 reader session、capture 和 persistence 之间的运行时桥接形态。
- 恢复层：`ReaderRestoreTarget.position` 使用 `CanonicalPositionV2`，供 restore controller 和布局恢复逻辑读取。

也就是说，`CanonicalPositionV2` 不是 `readerProgress` 的直接持久化格式。持久层保存 `ReaderProgressPosition`，恢复入口再通过 shared accessors 规范化为 V2 target。

## Dexie Schema

当前数据库 baseline 是 v9，`readerProgress` schema 为：

```ts
readerProgress: 'novelId, updatedAt, mode, activeChapterIndex'
```

`novelId` 是主键。记录包含：

- `novelId`
- `revision`
- `updatedAt`
- `mode`
- `activeChapterIndex`
- `position`
- `projections`
- `captureQuality`
- `capturedAt`
- `sourceMode`
- `resolverVersion`

`readReaderProgressSnapshot()` 会把 Dexie record 映射为 `PersistedReaderProgressSnapshot`。如果 record 的 `mode`、`captureQuality`、`position` 等核心字段无效，会删除该 `readerProgress` 记录并返回 `null`。

## 持久化 Snapshot

`ReaderProgressSnapshot.position` 是持久层主位置，目前只有两种形态：

- `locator`：精确位置，保存 `ReaderLocator`，包含章节、block、anchor/image、cursor、quote、hash、内容版本等定位信息。
- `chapter-edge`：近似位置，保存 `chapterIndex` 和 `edge`，用于无法捕获 locator 时回退到章节边界。

`createReaderProgressSnapshotFromSessionState()` 从 `ReaderSessionState` 生成 snapshot：

- `mode` 来自 `resolveLastContentMode(state.mode, state.lastContentMode)`。
- 优先用 `state.locator`，否则尝试从 `state.canonical` 反推 locator。
- scroll 模式或 `positionMetadata.sourceMode === 'scroll'` 时会去掉 locator 上的 `pageIndex`，避免把分页投影混入滚动主位置。
- 没有可用 locator 时写入 `chapter-edge`。
- `captureQuality` 对应主位置质量：`locator` 为 `precise`，`chapter-edge` 为 `approximate`。

## StoredReaderState 桥接

`StoredReaderState` 仍是运行时的统一桥接结构：

- `canonical`：会话内标准位置，使用旧的 `CanonicalPosition` object 形态。
- `hints`：可丢弃投影，包括 `chapterProgress`、`pageIndex`、`contentMode`、`viewMode`、`scrollProjection`、`pagedProjection`、`globalFlow`。
- `metadata`：捕获元数据，包括 `capturedAt`、`captureQuality`、`resolverVersion`、`sourceMode`。

持久化读取时，`toStoredReaderStateFromPersistedReaderProgress()` 会把 `ReaderProgressSnapshot.position` 转回 `StoredReaderState.canonical`，并把 projections 映射到 `hints`。

## CanonicalPositionV2

`CanonicalPositionV2` 是恢复 target 的规范化格式，定义在 shared reader contracts 中，分为：

- `chapter-boundary`：章节边界，包含 `chapterIndex`、可选 `chapterKey`、`edge` 和内容版本信息。
- `block-anchor`：章节内 block 锚点，包含 `chapterIndex`、`chapterKey`、`blockIndex`、`blockKey`、`anchorId`、`imageKey`、`kind`、cursor、quote、hash 和内容版本信息。

`toCanonicalPositionV2FromCanonical()` 的规则是：

- 无 `kind` 且有章节边界语义时生成 `chapter-boundary`。
- 无 `kind` 且无 `blockIndex` 时也回退为 `chapter-boundary`，默认 `edge` 为 `start`。
- 否则生成 `block-anchor`，`kind` 缺省为 `text`。

`CanonicalPositionV2` 主要用于 `ReaderRestoreTarget.position`，不是 Dexie `readerProgress.position` 的 schema。

## Restore Target

`ReaderRestoreTarget` 当前包含这些恢复入口字段：

- `chapterIndex`
- `mode`
- `position?: CanonicalPositionV2`
- `locator?: ReaderLocator`
- `locatorBoundary?: PageTarget`
- `chapterProgress?: number`
- `pageIndex?: number`
- `globalFlow?: ReaderGlobalFlowProjection`

恢复入口应优先通过 shared accessors 读取 target：

- `getReaderRestoreTargetPosition()`
- `getReaderRestoreTargetLocator()`
- `getReaderRestoreTargetBoundary()`
- `getReaderRestoreTargetChapterIndex()`

这些 accessor 的优先级为：

- 位置：先读并 sanitize `target.position`，再由 `target.locator` 转 V2，最后由 `locatorBoundary + chapterIndex` 生成章节边界。
- locator：先 sanitize `target.locator`，再由 V2 position 反推 locator。
- boundary：优先使用 V2 `chapter-boundary.edge`，否则使用 `locatorBoundary`。
- chapterIndex：优先使用规范化 V2 position，其次 `locator.chapterIndex`，最后 `target.chapterIndex`。

## Projection 规则

`chapterProgress`、`pageIndex` 和 `globalFlow` 是 projection，不是 durable 主位置。

当前持久层 projection 分三组：

- `projections.scroll.chapterProgress`
- `projections.paged.pageIndex`
- `projections.global.globalScrollOffset/globalPageIndex`

projection metadata 包括：

- `capturedAt`
- `sourceMode`
- `basisCanonicalFingerprint`
- `layoutKey`（paged/global 可带）

`isReaderProjectionFreshForCanonical()` 用 `basisCanonicalFingerprint` 判断 projection 是否仍匹配当前 canonical。没有 fingerprint 的 projection 会被视为可用，以兼容旧数据或简化捕获路径。

恢复时仍应把 stable locator / canonical identity 作为主依据；projection 只用于同一 canonical 下的滚动比例、页码或全局流位置辅助，以及主位置无法完全解析时的回退。

## 迁移与兼容

当前 managed migration lineage 是 v7 -> v8 -> v9：

- v7：同时声明旧 `readingProgress` 和新 `readerProgress`。
- v8：删除旧 `readingProgress`，保留 `readerProgress`。
- v9：加入 `readerPretextMetrics`，并继续确保 `readingProgress` 被删除。

启动时会先检查 IndexedDB 原生版本和 object store signature。只有处在已知 migration lineage 内的数据库才会打开并迁移；未知版本或未知 store 组合会抛出 `DATABASE_RECOVERY_REQUIRED`，等待用户显式恢复。

已知测试覆盖：

- 全新环境打开 v9 baseline。
- v7 数据库可迁移到 v9，并删除旧 `readingProgress`。
- v6 或其他不兼容同名数据库需要显式恢复。

因此，旧 `readingProgress` / V1 记录不会被读取并转换为当前进度；低于当前支持 lineage 的数据库会进入显式恢复流程。
