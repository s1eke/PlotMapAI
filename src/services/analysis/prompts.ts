import { PROMPT_RESERVE_BUDGET } from './constants';
import { ChunkingError } from './errors';
import type { AnalysisAggregates, AnalysisChunkPayload, PromptChapter } from './types';
import { estimatePromptBudget } from './text';
import { renderChapterForPrompt } from './chunking';

export function buildChunkPrompt(
  novelTitle: string,
  chunk: AnalysisChunkPayload,
  totalChunks: number,
): string {
  const chapterList = chunk.chapters.map(chapter => `${chapter.chapterIndex}:${chapter.title || '未命名章节'}`).join(', ');
  return `请分析小说《${novelTitle}》的以下章节块。当前是第 ${chunk.chunkIndex + 1}/${totalChunks} 个块。

分析目标：
1. 为每一章生成剧情梗概；
2. 提取每一章的关键剧情点；
3. 识别该章角色，并为每个角色给出 role、description、weight；其中 weight 为 0~100 的数值，表示该角色在本章的篇幅/存在感权重；
4. 提取本章中明确出现的人物关系；
5. 给出该章标签 tags。

返回要求：
- 只能返回 JSON 对象；
- 不要遗漏输入中的任何章节，也不要输出额外章节；
- chapterIndex 必须与输入一致，且每章都必须有独立结果；
- 每章都必须返回非空 summary；
- keyPoints、characters、relationships、tags 四个字段必须始终存在，哪怕没有内容也要返回空数组；
- 不要编造未在正文中出现的人物关系；
- 每章 summary 尽量控制在 120 字以内；
- relationship 中 weight 为 0~100 数值，source/target 为人物名；
- characters 中必须尽量覆盖本章核心角色；
- 权重请使用相对占比，便于后续统计人物篇幅。

JSON 结构示例：
{
  "chunkSummary": "该块总体概括",
  "chapterAnalyses": [
    {
      "chapterIndex": 0,
      "title": "章节标题",
      "summary": "章节梗概",
      "keyPoints": ["事件1", "事件2"],
      "tags": ["冲突", "成长"],
      "characters": [
        {"name": "角色名", "role": "角色定位", "description": "本章作用", "weight": 78}
      ],
      "relationships": [
        {"source": "角色A", "target": "角色B", "type": "盟友", "description": "关系变化", "weight": 65}
      ]
    }
  ]
}

当前块包含章节：${chapterList}

章节正文如下：
${chunk.text}`.trim();
}

export function buildSingleChapterPrompt(novelTitle: string, chapter: PromptChapter): string {
  const chapterText = renderChapterForPrompt(chapter);
  return `请分析小说《${novelTitle}》的第 ${chapter.chapterIndex + 1} 章《${chapter.title || '未命名章节'}》。

分析目标：
1. 生成该章的剧情梗概；
2. 提取关键剧情点；
3. 识别该章角色，并为每个角色给出 role、description、weight；其中 weight 为 0~100 的数值，表示该角色在本章的篇幅/存在感权重；
4. 提取本章中明确出现的人物关系；
5. 给出该章标签 tags。

返回要求：
- 只能返回 JSON 对象；
- chapterIndex 必须与输入一致；
- chapterIndex 使用正文里给出的 [章节索引] 数值，这是内部索引，从 0 开始；不要改成读者看到的章节序号；
- 必须返回非空 summary；
- keyPoints、characters、relationships、tags 四个字段必须始终存在，哪怕没有内容也要返回空数组；
- 不要编造未在正文中出现的人物关系；
- summary 尽量控制在 120 字以内；
- relationship 中 weight 为 0~100 数值，source/target 为人物名；
- characters 中必须尽量覆盖本章核心角色；
- 权重请使用相对占比，便于后续统计人物篇幅。

JSON 结构示例：
{
  "chapterAnalyses": [
    {
      "chapterIndex": 0,
      "title": "章节标题",
      "summary": "章节梗概",
      "keyPoints": ["事件1", "事件2"],
      "tags": ["冲突", "成长"],
      "characters": [
        {"name": "角色名", "role": "角色定位", "description": "本章作用", "weight": 78}
      ],
      "relationships": [
        {"source": "角色A", "target": "角色B", "type": "盟友", "description": "关系变化", "weight": 65}
      ]
    }
  ]
}

章节正文如下：
${chapterText}`.trim();
}

export function buildOverviewPrompt(
  novelTitle: string,
  aggregates: AnalysisAggregates,
  totalChapters: number,
  contextSize: number,
): string {
  const sourcePayload = {
    totalChapters,
    chapterAnalyses: aggregates.chapters,
    localThemes: aggregates.themes,
    localCharacterStats: aggregates.characterStats,
    localRelationshipGraph: aggregates.relationshipGraph,
  };
  const sourceJson = JSON.stringify(sourcePayload);
  const sourceBudget = contextSize - PROMPT_RESERVE_BUDGET;
  if (sourceBudget <= 0 || estimatePromptBudget(sourceJson) > sourceBudget) {
    throw new ChunkingError('全部章节分析数据超过当前上下文预算，请增大上下文大小后继续分析。');
  }
  return `以下是小说《${novelTitle}》全部章节的 AI 分析数据，请基于这些现成分析结果统一汇总简介、全书概览、主题标签和核心角色篇幅占比，不要逐章罗列，不要回退成章节摘要拼接，也不要机械照搬局部统计结果。

输出目标：
1. bookIntro：用于书籍详情页简介的文字，80~160 字，更像读者在详情页看到的导读或封底文案，重点交代故事设定、主角关系与核心悬念，尽量不要展开结局；
2. globalSummary：全书概览，220~500 字，完整概括主线推进、关键冲突、人物变化与结局走向，避免逐章列清单；
3. themes：3~12 个主题标签，应体现整本书的核心主题，而不是单纯重复高频章节标签；
4. characterStats：最多 8 个核心角色，必须复用输入 localCharacterStats 中已统计的角色名称，并输出 name、role、description、sharePercent；其中 sharePercent 为 0~100 的数值，表示该角色在整本书中的篇幅/存在感占比，请基于全部章节分析统一判断。
5. relationshipGraph：输出 6~24 条人物关系，只保留真正重要、稳定或对主线关键的关系；请综合章节 summary、characters、relationships 与 localRelationshipGraph 重新判断，不要简单照抄局部标签。

返回要求：
- 只能返回 JSON 对象；
- bookIntro 和 globalSummary 必须为非空字符串；
- bookIntro 和 globalSummary 必须明显区分层级，不能只是长短不同的同一段改写；
- bookIntro 应该更短、更像导读；globalSummary 才负责完整展开剧情与人物变化；
- themes、characterStats、relationshipGraph 必须为数组；
- characterStats 中不要输出未在 localCharacterStats 里出现的角色；
- 每个 characterStats 项都必须包含非空 name 和有效的 sharePercent；
- sharePercent 建议保留 1~2 位小数，全部角色的 sharePercent 总和不要超过 100；
- relationshipGraph 中的 source / target 必须来自输入里已出现的人物；
- relationshipGraph 每项都必须包含 source、target、relationTags、description；
- relationTags 为 1~4 个短标签，例如"师徒""盟友""对立""亲情""利用""暧昧"；
- relationTags 必须使用已经读完全书后的明确关系，不要写"疑似父女""父女（承认）""父女感应"这类阶段性或变体标签；如果最终关系明确为"父女"，就统一写"父女"；
- 优先保留能代表全书结构的关系，不要把同一对人物拆成多条；
- 不要输出 weight、chapters、chapterCount 等额外字段；
- characterStats.description 和 relationshipGraph.description 都要写成面向普通读者的自然表达，突出人物在剧情中的位置、冲突和变化；
- description 不要出现"在全书已分析内容中""覆盖X章""提及X次""篇幅占比约X%"这类系统口吻或统计口吻；
- 不要输出 markdown、解释文字或代码块。

JSON 结构示例：
{
  "bookIntro": "简介文本",
  "globalSummary": "全书概览文本",
  "themes": ["江湖", "成长", "家国"],
  "characterStats": [
    {"name": "紫薇", "role": "核心主角", "description": "推动主线与情感冲突的关键人物", "sharePercent": 28.5}
  ],
  "relationshipGraph": [
    {"source": "紫薇", "target": "小燕子", "relationTags": ["同伴", "姐妹情谊"], "description": "两人长期并肩推进主线，并在身份与情感压力中互相扶持。"}
  ]
}

全部分析数据如下：
${sourceJson}`.trim();
}
