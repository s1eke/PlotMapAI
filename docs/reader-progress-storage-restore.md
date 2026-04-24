# Reader Progress Storage And Restore

更新时间：2026-04-24

## 存储模型

`readerProgress` 是阅读进度的 durable 主记录。主位置仍由 progress snapshot 的 `position` 表达，运行时通过 `StoredReaderState` 桥接。

当前模型同时支持：

- V1 `canonical`：历史 optional 字段袋，继续读写兼容。
- V2 `CanonicalPositionV2`：新的判别式 union，用于 normalized restore target。
- legacy projections：`hints.chapterProgress` 与 `hints.pageIndex` 只作为旧数据和 projection 输入。
- projection metadata：`capturedAt/sourceMode/basisCanonicalFingerprint/layoutKey` 用于判断 projection 是否仍可复用。

## CanonicalPositionV2

V2 分两类：

- `chapter-boundary`：章节边界，包含 `chapterIndex/chapterKey/edge` 和内容版本信息。
- `block-anchor`：章节内 block 锚点，包含 `chapterKey/blockKey/anchorId/imageKey/textQuote/blockTextHash/contentVersion` 等稳定定位信息。

V1 数据进入 restore 前会通过 shared normalizer 转成 V2；旧记录没有 V2 字段时不影响恢复。

## Restore Target

`ReaderRestoreTarget.position` 是恢复链路的 normalized V2 位置。`locator` 与 `locatorBoundary` 暂时保留，用于 legacy 兼容和布局层现有 API。

恢复入口应优先通过 shared accessors 读取 target：

- `getReaderRestoreTargetPosition()`
- `getReaderRestoreTargetLocator()`
- `getReaderRestoreTargetBoundary()`
- `getReaderRestoreTargetChapterIndex()`

这样新旧 target 都会走同一套 V2 规范化逻辑。

## Projection 规则

`chapterProgress/pageIndex` 不再作为主位置，只在以下情况参与恢复：

- projection metadata 与当前 canonical fingerprint 匹配。
- 旧数据缺少 metadata，按 legacy 降级路径尝试。
- canonical / V2 位置无法解析时作为 fallback。

恢复优先级仍是 stable identity、quote、版本兼容的 legacy index、fresh projection、legacy projection、章节边界。
