# ADR 0001: Layer Responsibilities

- Status: Accepted
- Date: 2026-04-02

## Context

仓库已经采用 `app / application / domains / shared / infra` 的分层结构，但历史演进过程中，部分代码把“目录位置”当成了“架构边界”，导致职责漂移、跨层直连和公共 API 失真。

这份 ADR 用来明确每一层的真实职责，作为后续重构、review 和 lint 规则的判断基线。

## Decision

### `app`

`app` 是应用壳层，只负责启动和承载。

- 放路由注册、全局 provider、layout、error boundary、PWA 壳层集成、仅属于应用入口的调试桥接
- 可以依赖 `application`、`domains`、`shared`、`infra`
- 不承载具体业务规则，不直接吞并 domain 内部实现

### `application`

`application` 是编排层，只负责把多个 domain 组织成一个用户流程。

- 放页面编排、跨 domain use-case、面向路由的页面组件、把 `appPaths`/导航参数传给 domain UI
- 可以依赖 `domains` 的 barrel API、`shared`、`infra`
- 不直接依赖 domain 内部子路径，不沉淀单一 domain 的核心规则

### `domains`

`domains` 是业务边界，是功能和规则的拥有者。

- 放领域服务、领域状态、领域组件、领域 hook、领域仓储、领域错误和该领域内部协作逻辑
- 只能通过各自 `index.ts` 暴露公共 API
- 不依赖 `app`、`application`，也不直接依赖其他 domain

### `shared`

`shared` 是跨领域可复用的中立层。

- 放通用类型契约、无领域归属的 UI 基础组件、通用 hooks、utils、错误模型、中立 store/服务
- 可以被任何上层消费
- 不包含具体业务策略，不依赖任何 domain

### `infra`

`infra` 是技术实现层，负责与浏览器和存储运行时打交道。

- 放 Dexie、`@infra/storage`、workers、migrations、底层适配器
- 可以被 `app`、`application`、`domains` 使用
- 不表达业务流程，不反向依赖 domain

## Consequences

- 判断代码归属时，优先看“它服务哪一层的职责”，不是看“谁最方便 import”
- 需要跨 domain 编排时放进 `application`
- 需要被多个 domain 复用且不含业务语义时放进 `shared`
- 只要代码开始依赖路由壳、PWA 壳、应用入口生命周期，就应放进 `app`
- 一旦某层需要暴露给外部消费，必须通过明确公共 API，而不是穿透内部目录
- Dexie 表 ownership 也是领域边界的一部分；`@infra/db` 只提供存储实现，不自动把所有表变成“公共接口”

## Guardrails

- `application` 和 `app` 只能通过 `@domains/<domain>` 使用 domain
- `domains` 不得导入 `@app/*` 或 `@application/*`
- `shared`、`infra` 不得导入 domain
- 新增公共能力时，先判断它属于 domain、shared 还是 infra，再决定目录
- 跨 domain 读取某张表时，先确认 owner domain，并通过 owner API 或 application 读模型访问，不能把表结构当成领域契约
