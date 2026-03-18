# PlotMapAI 前后端测试与遗留清理规划

更新时间：2026-03-18

## 1. 目标

目标有两件事：

1. 为前端与后端补齐系统化单元测试与关键集成测试。
2. 清理开发过程中遗留的未调用代码、未使用资源、过时兼容逻辑和低价值噪音。

原则：

- 先补测试，再做删除或重构。
- 先解决质量门禁问题，再引入新的测试门禁。
- 清理动作必须有“被引用证明”或“未被引用证明”，不能靠感觉删。

## 2. 当前现状

### 2.1 前端

- 运行时入口：[`App.tsx`](/home/debian/Git/PlotMapAI/web/src/App.tsx)
- 页面共 5 个：
  - [`BookshelfPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/BookshelfPage.tsx)
  - [`BookDetailPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/BookDetailPage.tsx)
  - [`ReaderPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/ReaderPage.tsx)
  - [`CharacterGraphPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/CharacterGraphPage.tsx)
  - [`SettingsPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/SettingsPage.tsx)
- 当前没有前端测试框架与 `test` 脚本。
  - [`package.json`](/home/debian/Git/PlotMapAI/web/package.json) 只有 `dev` / `build` / `lint` / `preview`
- 前端大文件优先级很明确：
  - [`CharacterGraphPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/CharacterGraphPage.tsx)：1045 行
  - [`ReaderPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/ReaderPage.tsx)：764 行
  - [`BookDetailPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/BookDetailPage.tsx)：664 行
  - [`SettingsPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/SettingsPage.tsx)：545 行

### 2.2 后端

- Flask 应用入口：[`app/__init__.py`](/home/debian/Git/PlotMapAI/app/__init__.py)
- 蓝图共 4 个：
  - [`routes/novels.py`](/home/debian/Git/PlotMapAI/app/routes/novels.py)
  - [`routes/reader.py`](/home/debian/Git/PlotMapAI/app/routes/reader.py)
  - [`routes/analysis.py`](/home/debian/Git/PlotMapAI/app/routes/analysis.py)
  - [`routes/settings.py`](/home/debian/Git/PlotMapAI/app/routes/settings.py)
- 当前后端已有 9 条 unittest 用例，集中在：
  - [`test_analysis_settings.py`](/home/debian/Git/PlotMapAI/app/tests/test_analysis_settings.py)
  - [`test_ai_analysis.py`](/home/debian/Git/PlotMapAI/app/tests/test_ai_analysis.py)
  - [`test_novel_deletion.py`](/home/debian/Git/PlotMapAI/app/tests/test_novel_deletion.py)
  - [`test_chapter_detector.py`](/home/debian/Git/PlotMapAI/app/tests/test_chapter_detector.py)
  - [`test_encoding.py`](/home/debian/Git/PlotMapAI/app/tests/test_encoding.py)
  - [`test_purifier.py`](/home/debian/Git/PlotMapAI/app/tests/test_purifier.py)
- 后端没有覆盖率门禁，但 `pytest` / `pytest-cov` 已在 [`pyproject.toml`](/home/debian/Git/PlotMapAI/app/pyproject.toml) 中准备好。
- 后端高风险大文件：
  - [`services/ai_analysis.py`](/home/debian/Git/PlotMapAI/app/services/ai_analysis.py)：1468 行
  - [`services/analysis_runner.py`](/home/debian/Git/PlotMapAI/app/services/analysis_runner.py)：818 行
  - [`routes/settings.py`](/home/debian/Git/PlotMapAI/app/routes/settings.py)：474 行
  - [`routes/novels.py`](/home/debian/Git/PlotMapAI/app/routes/novels.py)：306 行
  - [`models.py`](/home/debian/Git/PlotMapAI/app/models.py)：306 行

### 2.3 当前质量门禁结果

- 后端现有测试通过：
  - `.venv/bin/python -m unittest discover -s tests`
- 前端 lint 当前未通过：
  - `Unexpected any` 主要集中在：
    - [`UploadModal.tsx`](/home/debian/Git/PlotMapAI/web/src/components/UploadModal.tsx)
    - [`BookDetailPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/BookDetailPage.tsx)
    - [`BookshelfPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/BookshelfPage.tsx)
    - [`CharacterGraphPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/CharacterGraphPage.tsx)
    - [`SettingsPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/SettingsPage.tsx)
  - Hook 依赖警告在：
    - [`BookshelfPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/BookshelfPage.tsx)
    - [`SettingsPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/SettingsPage.tsx)
  - `react-refresh/only-export-components` 在：
    - [`ThemeContext.tsx`](/home/debian/Git/PlotMapAI/web/src/context/ThemeContext.tsx)
  - `no-control-regex` 在：
    - [`CharacterGraphPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/CharacterGraphPage.tsx)

## 3. 测试总体策略

建议把测试工作拆成 5 个阶段。

### Phase 0：先把基础门禁拉平

目标：先让“可以持续加测试”这件事稳定下来。

动作：

- 前端补测试基础设施：
  - `vitest`
  - `@testing-library/react`
  - `@testing-library/user-event`
  - `jsdom`
  - `msw`
- 在 [`package.json`](/home/debian/Git/PlotMapAI/web/package.json) 增加：
  - `test`
  - `test:watch`
  - `coverage`
- 后端统一执行入口建议切到 `pytest`，但保留现有 unittest 文件不必重写。
- 先清掉当前 lint 红线，再把 lint 纳入默认质量门禁。

本阶段完成标准：

- 前端 lint 通过
- 前端 test 命令可运行
- 后端 pytest/unittest 可统一执行

### Phase 1：后端纯函数与服务层单测

优先级最高，因为回报最大、成本最低。

优先模块：

1. [`services/ai_analysis.py`](/home/debian/Git/PlotMapAI/app/services/ai_analysis.py)
2. [`services/analysis_runner.py`](/home/debian/Git/PlotMapAI/app/services/analysis_runner.py)
3. [`services/purifier.py`](/home/debian/Git/PlotMapAI/app/services/purifier.py)
4. [`services/epub_parser.py`](/home/debian/Git/PlotMapAI/app/services/epub_parser.py)
5. [`services/txt_parser.py`](/home/debian/Git/PlotMapAI/app/services/txt_parser.py)

建议覆盖点：

- `ai_analysis`
  - 关系标签归一化
  - characterStats / relationshipGraph 归一化
  - overview 数据容错
  - prompt 构建
  - JSON 提取与错误分支
- `analysis_runner`
  - 开始 / 暂停 / 恢复 / 重启状态流转
  - heartbeat 与失败恢复
  - overview 刷新路径
  - 异常传播到 `last_error`
- `purifier`
  - 规则映射
  - legacy 字段兼容
  - 标题/正文作用域
- `epub_parser`
  - 封面提取分支
  - 元数据缺失时兜底
  - 章节抽取稳定性
- `txt_parser`
  - 文件名/编码/目录规则组合
  - 空内容、单章、多章边界

### Phase 2：后端路由测试

重点验证 API 契约，而不是只测内部函数。

优先顺序：

1. [`routes/analysis.py`](/home/debian/Git/PlotMapAI/app/routes/analysis.py)
2. [`routes/settings.py`](/home/debian/Git/PlotMapAI/app/routes/settings.py)
3. [`routes/novels.py`](/home/debian/Git/PlotMapAI/app/routes/novels.py)
4. [`routes/reader.py`](/home/debian/Git/PlotMapAI/app/routes/reader.py)

建议方式：

- Flask test client
- 临时 SQLite 数据库
- 临时文件目录
- 必要时 mock AI 调用

关键场景：

- novel 上传、详情、删除、封面读取
- reader 章节读取与阅读进度读写
- analysis 状态查询、启动、暂停、恢复、重启、刷新概览
- settings 中 TOC / purification / AI provider 的 CRUD 与上传

### Phase 3：前端基础层与组件测试

先测纯展示组件、交互组件和上下文，再上页面。

优先模块：

1. [`ThemeContext.tsx`](/home/debian/Git/PlotMapAI/web/src/context/ThemeContext.tsx)
2. [`Layout.tsx`](/home/debian/Git/PlotMapAI/web/src/components/Layout.tsx)
3. [`UploadModal.tsx`](/home/debian/Git/PlotMapAI/web/src/components/UploadModal.tsx)
4. [`TocRuleModal.tsx`](/home/debian/Git/PlotMapAI/web/src/components/TocRuleModal.tsx)
5. [`PurificationRuleModal.tsx`](/home/debian/Git/PlotMapAI/web/src/components/PurificationRuleModal.tsx)
6. [`ReaderToolbar.tsx`](/home/debian/Git/PlotMapAI/web/src/components/ReaderToolbar.tsx)
7. [`ChapterAnalysisPanel.tsx`](/home/debian/Git/PlotMapAI/web/src/components/ChapterAnalysisPanel.tsx)

建议覆盖点：

- 主题切换
- 语言切换
- Modal 开关与提交
- 表单校验
- 条件渲染
- 工具条交互

### Phase 4：前端页面级测试

这里应该以“用户流程”为中心。

优先顺序：

1. [`BookDetailPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/BookDetailPage.tsx)
2. [`ReaderPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/ReaderPage.tsx)
3. [`CharacterGraphPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/CharacterGraphPage.tsx)
4. [`SettingsPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/SettingsPage.tsx)
5. [`BookshelfPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/BookshelfPage.tsx)

建议覆盖点：

- `BookDetailPage`
  - 详情加载
  - 开始阅读 / 人物图谱 / AI 分析按钮状态
  - 删除书籍
  - 分析状态展示
  - 图表与空状态
- `ReaderPage`
  - 章节切换
  - 阅读进度保存
  - 摘要模式 / 正文模式
  - 工具栏交互
- `CharacterGraphPage`
  - 图谱加载
  - 节点点击
  - 缩放 / 平移 / 拖拽
  - 人物详情卡显隐
  - 右上角工具区行为
- `SettingsPage`
  - 规则 CRUD
  - AI 配置保存与测试
- `BookshelfPage`
  - 列表加载
  - 上传入口
  - 空书架态

说明：

- [`CharacterGraphPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/CharacterGraphPage.tsx) 体量太大，建议先把布局计算、拖拽/缩放换算、节点名分行等逻辑拆到 `utils/`，否则页面测试会非常重。
- [`BookDetailPage.tsx`](/home/debian/Git/PlotMapAI/web/src/pages/BookDetailPage.tsx) 里的图表数据转换也建议抽成纯函数后优先做单测。

### Phase 5：清理遗留代码与资源

必须在前 4 个阶段至少完成 60% 之后再做，避免“边删边猜”。

执行原则：

- 先加覆盖，再删代码
- 每一项删除都要经过：
  - 全局引用搜索
  - lint / build / test
  - 最少 1 条对应回归测试或 smoke test

## 4. 本次调研得到的清理候选

下面是“候选”，不是“确认可删”。

### 4.1 很像未使用的前端资源

静态扫描结果显示以下资源当前未被 `web/src` 引用：

- [`hero.png`](/home/debian/Git/PlotMapAI/web/src/assets/hero.png)
- [`react.svg`](/home/debian/Git/PlotMapAI/web/src/assets/react.svg)
- [`vite.svg`](/home/debian/Git/PlotMapAI/web/src/assets/vite.svg)

建议：

- Phase 5 先确认是否仅为历史脚手架遗留
- 若未被运行时使用，可直接删除

### 4.2 明显的未使用导入候选

静态扫描发现这些导入很像可以清掉：

- [`app/__init__.py`](/home/debian/Git/PlotMapAI/app/__init__.py)：`os`
- [`app/database.py`](/home/debian/Git/PlotMapAI/app/database.py)：`PurificationRuleSet`
- [`app/routes/novels.py`](/home/debian/Git/PlotMapAI/app/routes/novels.py)：`current_app`
- [`app/routes/settings.py`](/home/debian/Git/PlotMapAI/app/routes/settings.py)：`_seed_default_toc_rules`
- [`app/routes/settings.py`](/home/debian/Git/PlotMapAI/app/routes/settings.py)：`PurificationRuleSet`
- 测试文件里也有少量类似情况：
  - [`test_chapter_detector.py`](/home/debian/Git/PlotMapAI/app/tests/test_chapter_detector.py)：`ChapterInfo`
  - [`test_encoding.py`](/home/debian/Git/PlotMapAI/app/tests/test_encoding.py)：`pytest`
  - [`test_purifier.py`](/home/debian/Git/PlotMapAI/app/tests/test_purifier.py)：`pytest`

建议：

- 把这类导入清理作为最先执行的低风险 cleanup 子任务

### 4.3 需要人工判断的 legacy 兼容逻辑

这些不建议直接删，而是要先判断是否还有数据兼容价值：

- [`database.py`](/home/debian/Git/PlotMapAI/app/database.py) 中的 `_remove_legacy_default_purification_rules`
- [`purifier.py`](/home/debian/Git/PlotMapAI/app/services/purifier.py) 中的 legacy 字段映射逻辑

建议：

- 先查线上/本地数据库是否还存在旧结构或旧数据
- 如果已经没有兼容需求，再安排删除

## 5. 推荐的测试结构

### 5.1 前端

建议目录：

- `web/src/test/setup.ts`
- `web/src/test/server.ts`
- `web/src/pages/__tests__/`
- `web/src/components/__tests__/`
- `web/src/utils/__tests__/`

建议工具：

- Vitest
- React Testing Library
- user-event
- MSW

建议 mock 分层：

- API 交互用 MSW
- 复杂浏览器对象用局部 stub
- 不建议大量直接 mock 组件本身

### 5.2 后端

建议目录：

- 继续沿用 `app/tests/`
- 增加：
  - `test_routes_analysis.py`
  - `test_routes_reader.py`
  - `test_routes_settings.py`
  - `test_routes_novels.py`
  - `test_analysis_runner.py`
  - `test_epub_parser.py`
  - `test_txt_parser.py`

建议夹具：

- 临时 SQLite 数据库
- 临时上传目录
- Flask app factory fixture
- AI 调用 mock fixture

## 6. 推荐的执行顺序

建议按下面顺序推进，而不是前后端同时无差别铺开。

1. 清前端 lint 红线
2. 接入前端测试框架
3. 补后端高价值服务层测试
4. 补后端蓝图/API 测试
5. 补前端页面核心流程测试
6. 做遗留清理
7. 上覆盖率门禁

原因：

- 当前后端已经有测试基础，继续扩展更快
- 前端如果先不把 lint 清掉，后面引入测试门禁会很乱
- 清理代码一定要放在测试之后，不然回归风险太高

## 7. 验收标准

建议分两档。

### 第一档：可以开工

- 前端 lint 通过
- 前端测试命令可运行
- 后端测试可统一执行
- 对大文件已有优先级清单

### 第二档：阶段性完成

- 后端 `routes + services` 覆盖率达到 80% 左右
- 前端 `pages + components` 覆盖率达到 65% 左右
- 所有清理项都有结果：
  - 已删除
  - 明确保留
  - 延后处理并记录原因

## 8. 建议的日常命令

前端：

```bash
cd web
npm run lint
npm run test
npm run coverage
```

后端：

```bash
cd app
.venv/bin/python -m pytest
.venv/bin/python -m pytest --cov=routes --cov=services --cov-report=term-missing
```

## 9. 结论

这个项目现在最合理的推进方式，不是立刻“把所有测试一次性补完”，而是：

1. 先把前端 lint 和测试基础设施补齐。
2. 先测后端大服务文件，再测路由。
3. 再把前端页面级交互补起来。
4. 最后基于测试结果做遗留代码和资源清理。

如果后续要继续执行，这份文档可以直接拆成任务清单，不需要重新调研一遍。
