"""AI analysis helpers: config handling, chunking, LLM calling, result normalization, and aggregation."""
import json
import logging
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any
from urllib import error, request

from config import Config
from models import AiProviderConfig, Chapter, ChapterAnalysis, NovelAnalysisChunk, NovelAnalysisOverview

PROMPT_RESERVE_BUDGET = 6000
MIN_CONTEXT_SIZE = 12000
LLM_TIMEOUT_SECONDS = 120
LLM_MAX_OUTPUT_TOKENS = 4000
ANALYSIS_RETRY_LIMIT = 3

logger = logging.getLogger(__name__)

_RELATION_TAG_CANONICAL_PATTERNS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("父女", ("父女",)),
    ("父子", ("父子",)),
    ("母女", ("母女",)),
    ("母子", ("母子",)),
    ("兄妹", ("兄妹",)),
    ("姐弟", ("姐弟",)),
    ("姐妹", ("姐妹",)),
    ("兄弟", ("兄弟",)),
    ("夫妻", ("夫妻", "夫妇")),
    ("恋人", ("恋人", "情侣", "爱人", "相恋", "相爱")),
    ("亲情", ("亲情", "家人", "亲人", "血亲", "骨肉")),
    ("师徒", ("师徒", "师生")),
    ("君臣", ("君臣", "忠臣", "臣子", "臣属")),
    ("主仆", ("主仆", "仆从", "侍从")),
    ("盟友", ("盟友", "同盟")),
    ("同伴", ("同伴", "伙伴", "搭档")),
    ("朋友", ("朋友", "友人", "友情")),
    ("对立", ("对立", "敌对", "宿敌", "仇敌", "仇人", "敌人", "死敌")),
    ("利用", ("利用", "操控")),
    ("暧昧", ("暧昧",)),
)


class AnalysisConfigError(ValueError):
    """Raised when the AI config is invalid."""


class AnalysisExecutionError(RuntimeError):
    """Raised when the LLM call or response is invalid."""


class ChunkingError(ValueError):
    """Raised when chapters cannot be chunked safely."""


@dataclass(slots=True)
class RuntimeAnalysisConfig:
    api_base_url: str
    api_key: str
    model_name: str
    context_size: int



def mask_api_key(api_key: str) -> str:
    if not api_key:
        return ""
    if len(api_key) <= 8:
        return "*" * len(api_key)
    return f"{api_key[:4]}{'*' * max(4, len(api_key) - 8)}{api_key[-4:]}"



def serialize_ai_provider_config(config: AiProviderConfig | None) -> dict[str, Any]:
    if not config:
        return {
            "apiBaseUrl": "",
            "modelName": "",
            "contextSize": 32000,
            "hasApiKey": False,
            "maskedApiKey": "",
            "updatedAt": None,
        }

    return {
        "apiBaseUrl": config.api_base_url,
        "modelName": config.model_name,
        "contextSize": config.context_size,
        "hasApiKey": bool(config.api_key),
        "maskedApiKey": mask_api_key(config.api_key),
        "updatedAt": config.updated_at.isoformat() if config.updated_at else None,
    }



def save_ai_provider_config(session, payload: dict[str, Any]) -> AiProviderConfig:
    payload = payload or {}
    config = session.query(AiProviderConfig).filter_by(user_id=Config.DEFAULT_USER_ID).first()
    if not config:
        config = AiProviderConfig(user_id=Config.DEFAULT_USER_ID)
        session.add(config)

    api_key = _clean_text(payload.get("apiKey"))
    keep_existing_api_key = bool(payload.get("keepExistingApiKey", True))

    config.api_base_url = _normalize_base_url(payload.get("apiBaseUrl"))
    config.model_name = _clean_text(payload.get("modelName"), 128)
    config.context_size = _coerce_context_size(payload.get("contextSize"), default=config.context_size or 32000)

    if api_key:
        config.api_key = api_key
    elif not keep_existing_api_key and not config.api_key:
        raise AnalysisConfigError("AI Token 未配置，请输入后保存。")

    validate_analysis_config(config)
    return config



def build_runtime_config(saved_config: AiProviderConfig | None, payload: dict[str, Any] | None = None) -> RuntimeAnalysisConfig:
    payload = payload or {}

    api_base_url = _normalize_base_url(payload.get("apiBaseUrl") if "apiBaseUrl" in payload else getattr(saved_config, "api_base_url", ""))
    model_name = _clean_text(payload.get("modelName") if "modelName" in payload else getattr(saved_config, "model_name", ""), 128)
    context_size = _coerce_context_size(
        payload.get("contextSize") if "contextSize" in payload else getattr(saved_config, "context_size", 32000),
        default=32000,
    )

    api_key = _clean_text(payload.get("apiKey"))
    keep_existing_api_key = bool(payload.get("keepExistingApiKey", True))
    if not api_key and keep_existing_api_key:
        api_key = getattr(saved_config, "api_key", "") or ""

    runtime_config = RuntimeAnalysisConfig(
        api_base_url=api_base_url,
        api_key=api_key,
        model_name=model_name,
        context_size=context_size,
    )
    validate_analysis_config(runtime_config)
    return runtime_config



def validate_analysis_config(config) -> None:
    if not config:
        raise AnalysisConfigError("请先在设置中完成 AI 接口配置。")
    if not _clean_text(getattr(config, "api_base_url", "")):
        raise AnalysisConfigError("AI 接口地址不能为空。")
    if not _clean_text(getattr(config, "api_key", "")):
        raise AnalysisConfigError("AI Token 未配置，请先在设置中保存。")
    if not _clean_text(getattr(config, "model_name", "")):
        raise AnalysisConfigError("AI 模型名称不能为空。")
    if _coerce_context_size(getattr(config, "context_size", MIN_CONTEXT_SIZE), default=MIN_CONTEXT_SIZE) < MIN_CONTEXT_SIZE:
        raise AnalysisConfigError(f"上下文大小不能小于 {MIN_CONTEXT_SIZE}。")



def test_ai_provider_connection(config: RuntimeAnalysisConfig) -> dict[str, Any]:
    payload = {
        "model": config.model_name,
        "temperature": 0,
        "max_tokens": 16,
        "messages": [
            {
                "role": "system",
                "content": "你是连通性测试助手。请简短回复。",
            },
            {
                "role": "user",
                "content": "如果你能看到这条消息，只回复：连接成功",
            },
        ],
    }
    content = _call_openai_compatible_api_content(config.api_base_url, config.api_key, payload)
    return {
        "message": "AI 接口连接测试成功。",
        "preview": _clean_text(content, 80) or "连接成功",
    }



def build_analysis_chunks(chapters: list[Any], context_size: int) -> list[dict[str, Any]]:
    if context_size < MIN_CONTEXT_SIZE:
        raise ChunkingError(f"上下文大小过小，至少需要 {MIN_CONTEXT_SIZE}。")

    content_budget = context_size - PROMPT_RESERVE_BUDGET
    if content_budget <= 0:
        raise ChunkingError("上下文大小不足以容纳分析提示词，请增大上下文大小。")

    chunks: list[dict[str, Any]] = []
    current_chapters: list[dict[str, Any]] = []
    current_length = 0

    for chapter in chapters:
        chapter_text = _render_chapter_for_prompt(chapter)
        chapter_length = _estimate_prompt_budget(chapter_text)
        if chapter_length > content_budget:
            raise ChunkingError(
                f"第 {chapter.chapter_index + 1} 章《{chapter.title or '未命名章节'}》长度超过当前上下文预算，请增大上下文大小后重试。"
            )

        if current_chapters and current_length + chapter_length > content_budget:
            chunks.append(_build_chunk(len(chunks), current_chapters, current_length))
            current_chapters = []
            current_length = 0

        current_chapters.append({
            "chapterIndex": chapter.chapter_index,
            "title": chapter.title,
            "content": chapter.content,
            "text": chapter_text,
            "length": chapter_length,
        })
        current_length += chapter_length

    if current_chapters:
        chunks.append(_build_chunk(len(chunks), current_chapters, current_length))

    return chunks



def run_chunk_analysis(config, novel, chunk: dict[str, Any], total_chunks: int) -> dict[str, Any]:
    prompt = _build_prompt(novel.title, chunk, total_chunks)
    payload = {
        "model": config.model_name,
        "temperature": 0.2,
        "max_tokens": LLM_MAX_OUTPUT_TOKENS,
        "messages": [
            {
                "role": "system",
                "content": "你是一个严谨的小说结构分析器。你必须只返回 JSON 对象，不允许返回 markdown、解释文本或多余前后缀。",
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
    }

    return _run_analysis_with_retry(
        f"第 {chunk['chunkIndex'] + 1} 块章节分析",
        lambda: _normalize_chunk_result(
            _call_openai_compatible_api_json(config.api_base_url, config.api_key, payload),
            chunk,
        ),
    )



def run_overview_analysis(config, novel, chapter_rows: list[ChapterAnalysis], total_chapters: int) -> dict[str, Any]:
    if len(chapter_rows) < total_chapters:
        raise AnalysisExecutionError("章节分析尚未全部完成，无法生成全书概览。")

    aggregates = _collect_analysis_aggregates(chapter_rows)
    prompt = _build_overview_prompt(novel.title, aggregates, total_chapters, config.context_size)
    payload = {
        "model": config.model_name,
        "temperature": 0.2,
        "max_tokens": LLM_MAX_OUTPUT_TOKENS,
        "messages": [
            {
                "role": "system",
                "content": "你是一个严谨的小说全书分析器。你必须只返回 JSON 对象，不允许返回 markdown、解释文本或多余前后缀。",
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
    }

    return _run_analysis_with_retry(
        "全书概览分析",
        lambda: _normalize_overview_result(
            _call_openai_compatible_api_json(config.api_base_url, config.api_key, payload),
            aggregates,
            total_chapters,
        ),
    )



def save_chunk_analysis(session, novel_id: int, chunk: dict[str, Any], result: dict[str, Any]) -> None:
    chunk_record = session.query(NovelAnalysisChunk).filter_by(
        user_id=Config.DEFAULT_USER_ID,
        novel_id=novel_id,
        chunk_index=chunk["chunkIndex"],
    ).first()
    if not chunk_record:
        chunk_record = NovelAnalysisChunk(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
            chunk_index=chunk["chunkIndex"],
        )
        session.add(chunk_record)

    chunk_record.start_chapter_index = chunk["startChapterIndex"]
    chunk_record.end_chapter_index = chunk["endChapterIndex"]
    chunk_record.chapter_indices_json = json.dumps(chunk["chapterIndices"], ensure_ascii=False)
    chunk_record.status = "completed"
    chunk_record.chunk_summary = result["chunkSummary"]
    chunk_record.response_json = json.dumps(result, ensure_ascii=False)
    chunk_record.error_message = ""

    for chapter_result in result["chapterAnalyses"]:
        chapter_record = session.query(ChapterAnalysis).filter_by(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
            chapter_index=chapter_result["chapterIndex"],
        ).first()
        if not chapter_record:
            chapter_record = ChapterAnalysis(
                user_id=Config.DEFAULT_USER_ID,
                novel_id=novel_id,
                chapter_index=chapter_result["chapterIndex"],
            )
            session.add(chapter_record)

        chapter_record.chapter_title = chapter_result["title"]
        chapter_record.summary = chapter_result["summary"]
        chapter_record.key_points_json = json.dumps(chapter_result["keyPoints"], ensure_ascii=False)
        chapter_record.characters_json = json.dumps(chapter_result["characters"], ensure_ascii=False)
        chapter_record.relationships_json = json.dumps(chapter_result["relationships"], ensure_ascii=False)
        chapter_record.tags_json = json.dumps(chapter_result["tags"], ensure_ascii=False)
        chapter_record.chunk_index = chunk["chunkIndex"]



def save_overview_analysis(session, novel_id: int, result: dict[str, Any]) -> NovelAnalysisOverview:
    overview = session.query(NovelAnalysisOverview).filter_by(
        user_id=Config.DEFAULT_USER_ID,
        novel_id=novel_id,
    ).first()
    if not overview:
        overview = NovelAnalysisOverview(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
        )
        session.add(overview)

    overview.book_intro = result["bookIntro"]
    overview.global_summary = result["globalSummary"]
    overview.themes_json = json.dumps(result["themes"], ensure_ascii=False)
    overview.character_stats_json = json.dumps(result["characterStats"], ensure_ascii=False)
    overview.relationship_graph_json = json.dumps(result["relationshipGraph"], ensure_ascii=False)
    overview.total_chapters = result["totalChapters"]
    overview.analyzed_chapters = result["analyzedChapters"]
    return overview



def mark_chunk_running(session, novel_id: int, chunk: dict[str, Any]) -> None:
    chunk_record = session.query(NovelAnalysisChunk).filter_by(
        user_id=Config.DEFAULT_USER_ID,
        novel_id=novel_id,
        chunk_index=chunk["chunkIndex"],
    ).first()
    if not chunk_record:
        chunk_record = NovelAnalysisChunk(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
            chunk_index=chunk["chunkIndex"],
        )
        session.add(chunk_record)

    chunk_record.start_chapter_index = chunk["startChapterIndex"]
    chunk_record.end_chapter_index = chunk["endChapterIndex"]
    chunk_record.chapter_indices_json = json.dumps(chunk["chapterIndices"], ensure_ascii=False)
    chunk_record.status = "running"
    chunk_record.error_message = ""



def mark_chunk_failed(session, novel_id: int, chunk: dict[str, Any], error_message: str) -> None:
    chunk_record = session.query(NovelAnalysisChunk).filter_by(
        user_id=Config.DEFAULT_USER_ID,
        novel_id=novel_id,
        chunk_index=chunk["chunkIndex"],
    ).first()
    if not chunk_record:
        chunk_record = NovelAnalysisChunk(
            user_id=Config.DEFAULT_USER_ID,
            novel_id=novel_id,
            chunk_index=chunk["chunkIndex"],
        )
        session.add(chunk_record)

    chunk_record.start_chapter_index = chunk["startChapterIndex"]
    chunk_record.end_chapter_index = chunk["endChapterIndex"]
    chunk_record.chapter_indices_json = json.dumps(chunk["chapterIndices"], ensure_ascii=False)
    chunk_record.status = "failed"
    chunk_record.error_message = error_message



def is_chapter_analysis_complete(chapter_analysis: ChapterAnalysis | None) -> bool:
    if not chapter_analysis:
        return False
    if not _clean_text(chapter_analysis.summary, 400):
        return False
    return all(
        _is_json_list_string(raw)
        for raw in (
            chapter_analysis.key_points_json,
            chapter_analysis.characters_json,
            chapter_analysis.relationships_json,
            chapter_analysis.tags_json,
        )
    )



def is_overview_complete(overview: NovelAnalysisOverview | None, total_chapters: int) -> bool:
    if not overview:
        return False
    if total_chapters <= 0:
        return False
    if not _clean_text(overview.book_intro, 400):
        return False
    if not _clean_text(overview.global_summary, 2000):
        return False
    if overview.analyzed_chapters < total_chapters or overview.total_chapters < total_chapters:
        return False
    return all(
        _is_json_list_string(raw)
        for raw in (
            overview.themes_json,
            overview.character_stats_json,
            overview.relationship_graph_json,
        )
    )



def serialize_overview(overview: NovelAnalysisOverview | None) -> dict[str, Any] | None:
    if not overview:
        return None
    return {
        "bookIntro": overview.book_intro,
        "globalSummary": overview.global_summary,
        "themes": _loads_json_list(overview.themes_json),
        "characterStats": _loads_json_list(overview.character_stats_json),
        "relationshipGraph": _loads_json_list(overview.relationship_graph_json),
        "totalChapters": overview.total_chapters,
        "analyzedChapters": overview.analyzed_chapters,
        "updatedAt": overview.updated_at.isoformat() if overview.updated_at else None,
    }



def _normalize_character_pair(source: Any, target: Any) -> tuple[str, str] | None:
    first = _clean_text(source, 80)
    second = _clean_text(target, 80)
    if not first or not second or first == second:
        return None
    return tuple(sorted([first, second]))



def _normalize_relation_tags(*values: Any) -> list[str]:
    results: list[str] = []
    for value in values:
        candidates = value if isinstance(value, list) else [value]
        for item in candidates:
            raw_tag = _clean_text(item, 80)
            if not raw_tag:
                continue
            split_candidates = [
                _clean_text(fragment, 80)
                for fragment in re.split(r"[\\/|｜；;，,、]+", raw_tag)
            ]
            for candidate in split_candidates:
                tag = _canonicalize_relation_tag(candidate)
                if tag and tag not in results:
                    results.append(tag)
    return results



def _canonicalize_relation_tag(tag: str) -> str:
    cleaned = _clean_text(re.sub(r"[\(\（][^\)\）]{0,20}[\)\）]", "", tag), 80)
    cleaned = re.sub(r"^(疑似|疑为|疑|可能是|可能为|可能|似乎是|似乎|或为|像是|看似|表面上)", "", cleaned)
    compact = re.sub(r"\s+", "", cleaned)
    if not compact:
        return ""

    for canonical, patterns in _RELATION_TAG_CANONICAL_PATTERNS:
        if any(pattern in compact for pattern in patterns):
            return canonical
    return compact



def _build_overview_relationship_map(raw_relationship_graph: Any) -> dict[tuple[str, str], dict[str, Any]]:
    results: dict[tuple[str, str], dict[str, Any]] = {}
    if not isinstance(raw_relationship_graph, list):
        return results

    for item in raw_relationship_graph:
        if not isinstance(item, dict):
            continue
        pair = _normalize_character_pair(item.get("source"), item.get("target"))
        if not pair:
            continue
        target = results.setdefault(pair, {
            "source": pair[0],
            "target": pair[1],
            "relationTags": [],
            "description": "",
        })
        for tag in _normalize_relation_tags(item.get("relationTags"), item.get("type")):
            if tag not in target["relationTags"] and len(target["relationTags"]) < 6:
                target["relationTags"].append(tag)
        description = _clean_text(item.get("description"), 280)
        if description and len(description) > len(target["description"]):
            target["description"] = description
    return results



def _find_missing_overview_relationship_names(
    pair: tuple[str, str],
    local_character_map: dict[str, dict[str, Any]],
) -> list[str]:
    return [name for name in pair if name not in local_character_map]



def _build_character_graph_node_description(
    name: str,
    role: str,
    share_percent: float,
    _chapter_count: int,
    related_edges: list[dict[str, Any]],
) -> str:
    counterpart_names: list[str] = []
    relation_tags: list[str] = []
    for edge in sorted(related_edges, key=lambda item: (-float(item.get("weight") or 0.0), item.get("target") if item.get("source") == name else item.get("source"))):
        counterpart = edge.get("target") if edge.get("source") == name else edge.get("source")
        counterpart_name = _clean_text(counterpart, 80)
        if counterpart_name and counterpart_name not in counterpart_names and len(counterpart_names) < 3:
            counterpart_names.append(counterpart_name)
        for tag in _normalize_relation_tags(edge.get("relationTags"), edge.get("type")):
            if tag not in relation_tags and len(relation_tags) < 4:
                relation_tags.append(tag)

    fragments = [f"{name}{f'以{role}身份参与主要剧情' if role else '在故事里占有一席之地'}"]
    if share_percent >= 15:
        fragments.append("是推动主线的重要人物")
    elif share_percent >= 7:
        fragments.append("会持续影响关键情节的发展")
    elif share_percent > 0:
        fragments.append("会在重要情节里带来明显影响")
    if counterpart_names:
        if relation_tags:
            fragments.append(f"与{'、'.join(counterpart_names)}之间的{'、'.join(relation_tags)}，构成了最值得关注的关系线")
        else:
            fragments.append(f"与{'、'.join(counterpart_names)}的互动是理解这个人物的关键")
    return _clean_text("，".join(fragments) + "。", 220)



def _build_character_graph_edge_description(
    source: str,
    target: str,
    relation_tags: list[str],
    _chapter_count: int,
    mention_count: int,
) -> str:
    fragments = [f"{source}和{target}之间的关系是故事里的重要线索"]
    if relation_tags:
        fragments.append(f"整体更接近{'、'.join(relation_tags)}")
    else:
        fragments.append("会持续影响彼此的选择")
    if mention_count >= 8:
        fragments.append("这条关系会在多段情节中反复推动剧情")
    elif mention_count >= 3:
        fragments.append("这条关系会在关键时刻左右剧情走向")
    else:
        fragments.append("这条关系会对人物冲突和选择产生影响")
    return _clean_text("，".join(fragments) + "。", 260)



def build_character_graph_payload(session, novel_id: int) -> dict[str, Any]:
    total_chapters = session.query(Chapter).filter_by(novel_id=novel_id).count()
    chapter_rows = session.query(ChapterAnalysis).filter_by(
        user_id=Config.DEFAULT_USER_ID,
        novel_id=novel_id,
    ).order_by(ChapterAnalysis.chapter_index.asc()).all()
    overview = session.query(NovelAnalysisOverview).filter_by(
        user_id=Config.DEFAULT_USER_ID,
        novel_id=novel_id,
    ).first()
    overview_payload = serialize_overview(overview)

    aggregates = _collect_analysis_aggregates(chapter_rows) if chapter_rows else {
        "allCharacterStats": [],
        "relationshipGraph": [],
        "analyzedChapters": 0,
    }
    aggregate_character_map = {
        _clean_text(item.get("name"), 80): item
        for item in aggregates.get("allCharacterStats", [])
        if isinstance(item, dict) and _clean_text(item.get("name"), 80)
    }
    overview_character_stats = overview_payload.get("characterStats", []) if overview_payload else []
    overview_relationship_graph = overview_payload.get("relationshipGraph", []) if overview_payload else []
    overview_character_map = {
        _clean_text(item.get("name"), 80): item
        for item in overview_character_stats
        if isinstance(item, dict) and _clean_text(item.get("name"), 80)
    }
    relationship_graph = [item for item in aggregates.get("relationshipGraph", []) if isinstance(item, dict)]
    local_relationship_map = _build_local_relationship_graph_map(relationship_graph)
    overview_relationship_map = _build_overview_relationship_map(
        overview_relationship_graph
    )
    graph_seed_edges = [
        *[item for item in overview_relationship_graph if isinstance(item, dict)],
        *relationship_graph,
    ]

    selected_names = _select_character_graph_names(
        aggregates.get("allCharacterStats", []),
        overview_character_stats,
        graph_seed_edges,
    )
    selected_name_set = set(selected_names)

    merged_pairs: list[tuple[str, str]] = []
    for edge in graph_seed_edges:
        pair = _normalize_character_pair(edge.get("source"), edge.get("target")) if isinstance(edge, dict) else None
        if not pair or pair in merged_pairs:
            continue
        merged_pairs.append(pair)

    edges = []
    for pair in merged_pairs:
        source, target = pair
        if source not in selected_name_set or target not in selected_name_set:
            continue
        overview_edge = overview_relationship_map.get(pair, {})
        local_edge = local_relationship_map.get(pair, {})
        relation_tags = _normalize_relation_tags(
            overview_edge.get("relationTags"),
            overview_edge.get("type"),
            local_edge.get("relationTags"),
            local_edge.get("type"),
        ) or ["未分类"]
        chapter_count = int(local_edge.get("chapterCount") or 0)
        mention_count = int(local_edge.get("mentionCount") or 0)
        edges.append({
            "id": f"{source}::{target}",
            "source": source,
            "target": target,
            "type": relation_tags[0],
            "relationTags": relation_tags,
            "description": _clean_text(overview_edge.get("description"), 280)
            or _build_character_graph_edge_description(source, target, relation_tags, chapter_count, mention_count),
            "weight": round(float(local_edge.get("weight") or 0.0), 2),
            "mentionCount": mention_count,
            "chapterCount": chapter_count,
            "chapters": local_edge.get("chapters") or [],
        })
    edges.sort(key=lambda item: (-item["weight"], -item["mentionCount"], item["source"], item["target"]))

    related_edge_map: dict[str, list[dict[str, Any]]] = {name: [] for name in selected_names}
    for edge in edges:
        related_edge_map.setdefault(edge["source"], []).append(edge)
        related_edge_map.setdefault(edge["target"], []).append(edge)

    nodes = []
    for name in selected_names:
        aggregate_item = aggregate_character_map.get(name, {})
        overview_item = overview_character_map.get(name, {})
        role = _clean_text(overview_item.get("role"), 80) or _clean_text(aggregate_item.get("role"), 80)
        share_percent = round(float(overview_item.get("sharePercent") or aggregate_item.get("sharePercent") or 0.0), 2)
        chapter_count = int(aggregate_item.get("chapterCount") or 0)
        description = _clean_text(overview_item.get("description"), 220)
        if not description:
            description = _build_character_graph_node_description(
                name,
                role,
                share_percent,
                chapter_count,
                related_edge_map.get(name, []),
            )
        nodes.append({
            "id": name,
            "name": name,
            "role": role,
            "description": description,
            "weight": round(float(aggregate_item.get("weight") or 0.0), 2),
            "sharePercent": share_percent,
            "chapterCount": chapter_count,
            "chapters": aggregate_item.get("chapters") or [],
            "isCore": name in overview_character_map,
        })

    generated_at = overview.updated_at.isoformat() if overview and overview.updated_at else None
    if not generated_at and chapter_rows:
        latest_row = max((row.updated_at for row in chapter_rows if row.updated_at), default=None)
        generated_at = latest_row.isoformat() if latest_row else None

    return {
        "nodes": nodes,
        "edges": edges,
        "meta": {
            "totalChapters": total_chapters,
            "analyzedChapters": aggregates.get("analyzedChapters", 0),
            "nodeCount": len(nodes),
            "edgeCount": len(edges),
            "hasOverview": bool(overview_payload),
            "hasData": bool(nodes or edges),
            "isComplete": is_overview_complete(overview, total_chapters),
            "generatedAt": generated_at,
        },
    }



def serialize_chapter_analysis(chapter_analysis: ChapterAnalysis | None) -> dict[str, Any] | None:
    if not chapter_analysis:
        return None
    return {
        "chapterIndex": chapter_analysis.chapter_index,
        "chapterTitle": chapter_analysis.chapter_title,
        "summary": chapter_analysis.summary,
        "keyPoints": _loads_json_list(chapter_analysis.key_points_json),
        "characters": _loads_json_list(chapter_analysis.characters_json),
        "relationships": _loads_json_list(chapter_analysis.relationships_json),
        "tags": _loads_json_list(chapter_analysis.tags_json),
        "chunkIndex": chapter_analysis.chunk_index,
        "updatedAt": chapter_analysis.updated_at.isoformat() if chapter_analysis.updated_at else None,
    }



def serialize_chunk_record(chunk_record: NovelAnalysisChunk) -> dict[str, Any]:
    return {
        "chunkIndex": chunk_record.chunk_index,
        "startChapterIndex": chunk_record.start_chapter_index,
        "endChapterIndex": chunk_record.end_chapter_index,
        "chapterIndices": _loads_json_list(chunk_record.chapter_indices_json),
        "status": chunk_record.status,
        "chunkSummary": chunk_record.chunk_summary,
        "errorMessage": chunk_record.error_message,
        "updatedAt": chunk_record.updated_at.isoformat() if chunk_record.updated_at else None,
    }



def clear_analysis_data(session, novel_id: int) -> None:
    session.query(ChapterAnalysis).filter_by(user_id=Config.DEFAULT_USER_ID, novel_id=novel_id).delete()
    session.query(NovelAnalysisChunk).filter_by(user_id=Config.DEFAULT_USER_ID, novel_id=novel_id).delete()
    session.query(NovelAnalysisOverview).filter_by(user_id=Config.DEFAULT_USER_ID, novel_id=novel_id).delete()



def _build_chunk(chunk_index: int, chapters: list[dict[str, Any]], content_length: int) -> dict[str, Any]:
    return {
        "chunkIndex": chunk_index,
        "chapterIndices": [chapter["chapterIndex"] for chapter in chapters],
        "startChapterIndex": chapters[0]["chapterIndex"],
        "endChapterIndex": chapters[-1]["chapterIndex"],
        "contentLength": content_length,
        "chapters": chapters,
        "text": "\n\n".join(chapter["text"] for chapter in chapters),
    }



def _render_chapter_for_prompt(chapter: Any) -> str:
    return f"[章节索引]{chapter.chapter_index}\n[章节标题]{chapter.title or '未命名章节'}\n[章节正文]\n{chapter.content or ''}"



def _build_prompt(novel_title: str, chunk: dict[str, Any], total_chunks: int) -> str:
    chapter_list = ", ".join(f"{chapter['chapterIndex']}:{chapter['title'] or '未命名章节'}" for chapter in chunk["chapters"])
    return f"""
请分析小说《{novel_title}》的以下章节块。当前是第 {chunk['chunkIndex'] + 1}/{total_chunks} 个块。

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
{{
  "chunkSummary": "该块总体概括",
  "chapterAnalyses": [
    {{
      "chapterIndex": 0,
      "title": "章节标题",
      "summary": "章节梗概",
      "keyPoints": ["事件1", "事件2"],
      "tags": ["冲突", "成长"],
      "characters": [
        {{"name": "角色名", "role": "角色定位", "description": "本章作用", "weight": 78}}
      ],
      "relationships": [
        {{"source": "角色A", "target": "角色B", "type": "盟友", "description": "关系变化", "weight": 65}}
      ]
    }}
  ]
}}

当前块包含章节：{chapter_list}

章节正文如下：
{chunk['text']}
""".strip()



def _call_openai_compatible_api_json(api_base_url: str, api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    content = _call_openai_compatible_api_content(api_base_url, api_key, payload)
    return _extract_json_object(content)



def _call_openai_compatible_api_content(api_base_url: str, api_key: str, payload: dict[str, Any]) -> str:
    url = f"{api_base_url.rstrip('/')}/chat/completions"
    req = request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=LLM_TIMEOUT_SECONDS) as response:
            raw_response = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise AnalysisExecutionError(f"AI 接口返回错误（HTTP {exc.code}）：{_extract_error_message(detail)}") from exc
    except error.URLError as exc:
        raise AnalysisExecutionError(f"AI 接口连接失败：{exc.reason}") from exc
    except TimeoutError as exc:
        raise AnalysisExecutionError("AI 接口请求超时，请稍后重试。") from exc

    try:
        data = json.loads(raw_response)
    except json.JSONDecodeError as exc:
        raise AnalysisExecutionError("AI 接口返回的不是合法 JSON 响应。") from exc

    if not isinstance(data, dict):
        raise AnalysisExecutionError("AI 接口返回格式无效。")

    choices = data.get("choices") or []
    if not choices:
        raise AnalysisExecutionError("AI 接口返回内容为空。")

    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, list):
        content = "".join(item.get("text", "") for item in content if isinstance(item, dict))
    if not isinstance(content, str) or not content.strip():
        raise AnalysisExecutionError("AI 接口未返回有效文本内容。")
    return content



def _normalize_chunk_result(raw: dict[str, Any], chunk: dict[str, Any]) -> dict[str, Any]:
    raw_items = raw.get("chapterAnalyses")
    if not isinstance(raw_items, list):
        raise AnalysisExecutionError("AI 返回缺少 chapterAnalyses 数组。")

    expected_indices = {chapter["chapterIndex"] for chapter in chunk["chapters"]}
    raw_map: dict[int, dict[str, Any]] = {}
    for item in raw_items:
        if not isinstance(item, dict):
            raise AnalysisExecutionError("AI 返回的 chapterAnalyses 项不是对象。")
        try:
            chapter_index = int(item.get("chapterIndex"))
        except (TypeError, ValueError):
            raise AnalysisExecutionError("AI 返回的 chapterIndex 不是有效整数。") from None
        if chapter_index not in expected_indices:
            raise AnalysisExecutionError(f"AI 返回了不属于当前块的章节索引：{chapter_index}。")
        if chapter_index in raw_map:
            raise AnalysisExecutionError(f"AI 返回了重复的章节索引：{chapter_index}。")
        raw_map[chapter_index] = item

    results = []
    for chapter in chunk["chapters"]:
        chapter_index = chapter["chapterIndex"]
        item = raw_map.get(chapter_index)
        if not item:
            raise AnalysisExecutionError(f"AI 返回缺少第 {chapter_index + 1} 章的分析结果。")
        if not _clean_text(item.get("summary"), 400):
            raise AnalysisExecutionError(f"AI 返回的第 {chapter_index + 1} 章 summary 为空。")
        for field_name in ("keyPoints", "tags", "characters", "relationships"):
            if not isinstance(item.get(field_name), list):
                raise AnalysisExecutionError(f"AI 返回的第 {chapter_index + 1} 章缺少有效的 {field_name} 数组。")

        results.append({
            "chapterIndex": chapter_index,
            "title": _clean_text(item.get("title"), 256) or chapter["title"],
            "summary": _clean_text(item.get("summary"), 400),
            "keyPoints": _normalize_string_list(item.get("keyPoints"), limit=8, max_length=120),
            "tags": _normalize_string_list(item.get("tags"), limit=8, max_length=40),
            "characters": _normalize_character_list(item.get("characters")),
            "relationships": _normalize_relationship_list(item.get("relationships")),
        })

    return {
        "chunkSummary": _clean_text(raw.get("chunkSummary"), 500) or "该章节块分析已完成。",
        "chapterAnalyses": results,
    }



def _normalize_overview_result(raw: dict[str, Any], aggregates: dict[str, Any], total_chapters: int) -> dict[str, Any]:
    book_intro = _clean_text(raw.get("bookIntro"), 400)
    global_summary = _clean_text(raw.get("globalSummary"), 2400)
    raw_themes = raw.get("themes")
    raw_character_stats = raw.get("characterStats")
    raw_relationship_graph = raw.get("relationshipGraph")

    if not book_intro:
        raise AnalysisExecutionError("AI 返回的 bookIntro 为空。")
    if not global_summary:
        raise AnalysisExecutionError("AI 返回的 globalSummary 为空。")
    if not isinstance(raw_themes, list):
        raise AnalysisExecutionError("AI 返回缺少有效的 themes 数组。")
    if not isinstance(raw_character_stats, list):
        raise AnalysisExecutionError("AI 返回缺少有效的 characterStats 数组。")
    if not isinstance(raw_relationship_graph, list):
        raise AnalysisExecutionError("AI 返回缺少有效的 relationshipGraph 数组。")

    local_character_map = {
        item["name"]: item
        for item in (aggregates.get("allCharacterStats") or aggregates["characterStats"])
    }
    local_relationship_map = _build_overview_relationship_map(aggregates.get("allRelationshipGraph", []))
    character_stats = []
    seen_names: set[str] = set()
    raw_share_percents: list[float] = []
    for item in raw_character_stats[:8]:
        if not isinstance(item, dict):
            raise AnalysisExecutionError("AI 返回的 characterStats 项不是对象。")
        name = _clean_text(item.get("name"), 80)
        if not name:
            raise AnalysisExecutionError("AI 返回的核心角色缺少 name。")
        if name in seen_names:
            continue
        local_item = local_character_map.get(name)
        if not local_item:
            raise AnalysisExecutionError(f"AI 返回了未在章节分析中出现的核心角色：{name}。")
        share_percent = _coerce_weight(item.get("sharePercent"))
        if share_percent <= 0:
            raise AnalysisExecutionError(f"AI 返回的核心角色 {name} 缺少有效的 sharePercent。")
        seen_names.add(name)
        raw_share_percents.append(share_percent)
        character_stats.append({
            "name": name,
            "role": _clean_text(item.get("role"), 80) or local_item["role"],
            "description": _clean_text(item.get("description"), 200) or local_item["description"],
            "weight": local_item["weight"],
            "sharePercent": share_percent,
            "chapters": local_item["chapters"],
            "chapterCount": local_item["chapterCount"],
        })

    if local_character_map and not character_stats:
        raise AnalysisExecutionError("AI 返回的核心角色列表为空。")

    normalized_share_percents = _normalize_share_percent_values(raw_share_percents)
    for index, share_percent in enumerate(normalized_share_percents):
        character_stats[index]["sharePercent"] = share_percent
    character_stats.sort(key=lambda item: (-item["sharePercent"], -item["weight"], item["name"]))

    relationship_graph = []
    seen_pairs: set[tuple[str, str]] = set()
    for item in raw_relationship_graph[:24]:
        if not isinstance(item, dict):
            raise AnalysisExecutionError("AI 返回的 relationshipGraph 项不是对象。")
        pair = _normalize_character_pair(item.get("source"), item.get("target"))
        if not pair or pair in seen_pairs:
            continue
        source, target = pair
        missing_names = _find_missing_overview_relationship_names(pair, local_character_map)
        if missing_names:
            logger.warning(
                "Skipping overview relationship because names were not found in chapter analyses: "
                "missing=%s pair=%s",
                ", ".join(missing_names),
                f"{source} / {target}",
            )
            continue
        local_edge = local_relationship_map.get(pair, {})
        relation_tags = _normalize_relation_tags(item.get("relationTags"), item.get("type"))
        if not relation_tags:
            relation_tags = _normalize_relation_tags(local_edge.get("relationTags"), local_edge.get("type"))
        if not relation_tags:
            raise AnalysisExecutionError(f"AI 返回的关系 {source} / {target} 缺少有效的 relationTags。")
        description = _clean_text(item.get("description"), 280) or _clean_text(local_edge.get("description"), 280)
        relationship_graph.append({
            "source": source,
            "target": target,
            "type": relation_tags[0],
            "relationTags": relation_tags[:6],
            "description": description,
        })
        seen_pairs.add(pair)

    return {
        "bookIntro": book_intro,
        "globalSummary": global_summary,
        "themes": _normalize_string_list(raw_themes, limit=12, max_length=40),
        "characterStats": character_stats,
        "relationshipGraph": relationship_graph,
        "totalChapters": total_chapters,
        "analyzedChapters": aggregates["analyzedChapters"],
    }



def _collect_analysis_aggregates(chapter_rows: list[ChapterAnalysis]) -> dict[str, Any]:
    theme_counter: Counter[str] = Counter()
    character_map: dict[str, dict[str, Any]] = {}
    relationship_map: dict[tuple[str, str], dict[str, Any]] = {}
    chapters_payload: list[dict[str, Any]] = []

    for row in chapter_rows:
        tags = _loads_json_list(row.tags_json)
        characters = _loads_json_list(row.characters_json)
        relationships = _loads_json_list(row.relationships_json)
        key_points = _loads_json_list(row.key_points_json)
        chapters_payload.append({
            "chapterIndex": row.chapter_index,
            "chapterTitle": row.chapter_title,
            "summary": row.summary,
            "keyPoints": key_points,
            "tags": tags,
            "characters": characters,
            "relationships": relationships,
        })

        for tag in tags:
            if isinstance(tag, str) and tag.strip():
                theme_counter.update([tag.strip()])

        for item in characters:
            if not isinstance(item, dict):
                continue
            name = _clean_text(item.get("name"), 80)
            if not name:
                continue
            weight = _coerce_weight(item.get("weight"))
            role = _clean_text(item.get("role"), 80)
            description = _clean_text(item.get("description"), 200)
            target = character_map.setdefault(name, {
                "name": name,
                "weight": 0.0,
                "chapters": set(),
                "roles": Counter(),
                "descriptions": [],
            })
            target["weight"] += weight
            target["chapters"].add(row.chapter_index)
            if role:
                target["roles"][role] += max(weight, 1.0)
            if description and description not in target["descriptions"] and len(target["descriptions"]) < 6:
                target["descriptions"].append(description)

        for item in relationships:
            if not isinstance(item, dict):
                continue
            source = _clean_text(item.get("source"), 80)
            target_name = _clean_text(item.get("target"), 80)
            relation_tags = _normalize_relation_tags(item.get("relationTags"), item.get("type")) or ["未分类"]
            if not source or not target_name or source == target_name:
                continue
            source_name, normalized_target_name = sorted([source, target_name])
            key = (source_name, normalized_target_name)
            relation_weight = _coerce_weight(item.get("weight"))
            edge = relationship_map.setdefault(key, {
                "source": source_name,
                "target": normalized_target_name,
                "weight": 0.0,
                "mentionCount": 0,
                "descriptions": [],
                "chapters": set(),
                "relationTypes": Counter(),
            })
            edge["weight"] += relation_weight
            edge["mentionCount"] += 1
            edge["chapters"].add(row.chapter_index)
            for relation_tag in relation_tags:
                edge["relationTypes"][relation_tag] += max(relation_weight, 1.0)
            description = _clean_text(item.get("description"), 160)
            if description and description not in edge["descriptions"] and len(edge["descriptions"]) < 6:
                edge["descriptions"].append(description)

    total_weight = sum(item["weight"] for item in character_map.values()) or 1.0
    all_character_stats = sorted([
        {
            "name": item["name"],
            "role": sorted(item["roles"].items(), key=lambda pair: (-pair[1], pair[0]))[0][0] if item["roles"] else "",
            "description": item["descriptions"][0] if item["descriptions"] else "",
            "descriptionFragments": item["descriptions"][:4],
            "weight": round(item["weight"], 2),
            "sharePercent": round(item["weight"] / total_weight * 100, 2),
            "chapters": sorted(item["chapters"]),
            "chapterCount": len(item["chapters"]),
        }
        for item in character_map.values()
    ], key=lambda value: (-value["weight"], value["name"]))

    relationship_graph = sorted([
        {
            "source": item["source"],
            "target": item["target"],
            "type": relation_tags[0] if relation_tags else "未分类",
            "relationTags": relation_tags,
            "weight": round(item["weight"], 2),
            "mentionCount": item["mentionCount"],
            "chapterCount": len(item["chapters"]),
            "chapters": sorted(item["chapters"]),
            "description": "；".join(item["descriptions"][:3]),
            "descriptionFragments": item["descriptions"][:4],
        }
        for item in relationship_map.values()
        for relation_tags in [[
            relation_type
            for relation_type, _ in sorted(item["relationTypes"].items(), key=lambda pair: (-pair[1], pair[0]))[:6]
        ]]
    ], key=lambda value: (-value["weight"], value["source"], value["target"]))

    return {
        "chapters": chapters_payload,
        "themes": [item for item, _ in theme_counter.most_common(12)],
        "characterStats": all_character_stats[:20],
        "allCharacterStats": all_character_stats,
        "allRelationshipGraph": relationship_graph,
        "relationshipGraph": relationship_graph[:30],
        "analyzedChapters": len(chapter_rows),
    }



def _select_character_graph_names(
    all_character_stats: list[dict[str, Any]],
    overview_character_stats: list[dict[str, Any]],
    relationship_graph: list[dict[str, Any]],
    limit: int = 14,
) -> list[str]:
    ordered_names: list[str] = []

    def _append(name: Any) -> None:
        normalized = _clean_text(name, 80)
        if not normalized or normalized in ordered_names or len(ordered_names) >= limit:
            return
        ordered_names.append(normalized)

    for item in overview_character_stats[:8]:
        if isinstance(item, dict):
            _append(item.get("name"))

    for edge in relationship_graph:
        if len(ordered_names) >= limit:
            break
        if not isinstance(edge, dict):
            continue
        _append(edge.get("source"))
        _append(edge.get("target"))

    for item in all_character_stats:
        if len(ordered_names) >= limit:
            break
        if isinstance(item, dict):
            _append(item.get("name"))

    return ordered_names


def _build_local_relationship_graph_map(raw_relationship_graph: Any) -> dict[tuple[str, str], dict[str, Any]]:
    results: dict[tuple[str, str], dict[str, Any]] = {}
    if not isinstance(raw_relationship_graph, list):
        return results

    for item in raw_relationship_graph:
        if not isinstance(item, dict):
            continue
        pair = _normalize_character_pair(item.get("source"), item.get("target"))
        if not pair:
            continue
        results[pair] = item
    return results



def _build_overview_prompt(
    novel_title: str,
    aggregates: dict[str, Any],
    total_chapters: int,
    context_size: int,
) -> str:
    source_payload = {
        "totalChapters": total_chapters,
        "chapterAnalyses": aggregates["chapters"],
        "localThemes": aggregates["themes"],
        "localCharacterStats": aggregates["characterStats"],
        "localRelationshipGraph": aggregates["relationshipGraph"],
    }
    source_json = json.dumps(source_payload, ensure_ascii=False, separators=(",", ":"))
    source_budget = context_size - PROMPT_RESERVE_BUDGET
    if source_budget <= 0 or _estimate_prompt_budget(source_json) > source_budget:
        raise ChunkingError("全部章节分析数据超过当前上下文预算，请增大上下文大小后继续分析。")

    return f"""
以下是小说《{novel_title}》全部章节的 AI 分析数据，请基于这些现成分析结果统一汇总简介、全书概览、主题标签和核心角色篇幅占比，不要逐章罗列，不要回退成章节摘要拼接，也不要机械照搬局部统计结果。

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
- relationTags 为 1~4 个短标签，例如“师徒”“盟友”“对立”“亲情”“利用”“暧昧”；
- relationTags 必须使用已经读完全书后的明确关系，不要写“疑似父女”“父女（承认）”“父女感应”这类阶段性或变体标签；如果最终关系明确为“父女”，就统一写“父女”；
- 优先保留能代表全书结构的关系，不要把同一对人物拆成多条；
- 不要输出 weight、chapters、chapterCount 等额外字段；
- characterStats.description 和 relationshipGraph.description 都要写成面向普通读者的自然表达，突出人物在剧情中的位置、冲突和变化；
- description 不要出现“在全书已分析内容中”“覆盖X章”“提及X次”“篇幅占比约X%”这类系统口吻或统计口吻；
- 不要输出 markdown、解释文字或代码块。

JSON 结构示例：
{{
  "bookIntro": "简介文本",
  "globalSummary": "全书概览文本",
  "themes": ["江湖", "成长", "家国"],
  "characterStats": [
    {{"name": "紫薇", "role": "核心主角", "description": "推动主线与情感冲突的关键人物", "sharePercent": 28.5}}
  ],
  "relationshipGraph": [
    {{"source": "紫薇", "target": "小燕子", "relationTags": ["同伴", "姐妹情谊"], "description": "两人长期并肩推进主线，并在身份与情感压力中互相扶持。"}}
  ]
}}

全部分析数据如下：
{source_json}
""".strip()



def _run_analysis_with_retry(task_name: str, operation):
    errors: list[str] = []
    for attempt in range(1, ANALYSIS_RETRY_LIMIT + 1):
        try:
            return operation()
        except AnalysisExecutionError as exc:
            errors.append(f"第 {attempt} 次：{exc}")
            if attempt >= ANALYSIS_RETRY_LIMIT:
                raise AnalysisExecutionError(
                    f"{task_name}已重试 {ANALYSIS_RETRY_LIMIT} 次仍失败。" + "；".join(errors)
                ) from exc
    raise AnalysisExecutionError(f"{task_name}执行失败。")



def _normalize_character_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    results = []
    for item in value[:20]:
        if not isinstance(item, dict):
            continue
        name = _clean_text(item.get("name"), 80)
        if not name:
            continue
        results.append({
            "name": name,
            "role": _clean_text(item.get("role"), 80),
            "description": _clean_text(item.get("description"), 200),
            "weight": _coerce_weight(item.get("weight")),
        })
    return results



def _normalize_relationship_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    results = []
    for item in value[:20]:
        if not isinstance(item, dict):
            continue
        source = _clean_text(item.get("source"), 80)
        target = _clean_text(item.get("target"), 80)
        if not source or not target or source == target:
            continue
        results.append({
            "source": source,
            "target": target,
            "type": _clean_text(item.get("type"), 80) or "未分类",
            "description": _clean_text(item.get("description"), 160),
            "weight": _coerce_weight(item.get("weight")),
        })
    return results



def _normalize_string_list(value: Any, limit: int, max_length: int) -> list[str]:
    if not isinstance(value, list):
        return []
    results: list[str] = []
    for item in value[:limit]:
        text = _clean_text(item, max_length)
        if text and text not in results:
            results.append(text)
    return results



def _normalize_share_percent_values(values: list[float]) -> list[float]:
    if not values:
        return []

    sanitized = [max(0.0, min(float(value), 100.0)) for value in values]
    total = sum(sanitized)
    if total <= 0:
        return [0.0 for _ in sanitized]
    if total <= 100:
        return [round(value, 2) for value in sanitized]

    scale = 100 / total
    normalized = [round(value * scale, 2) for value in sanitized]
    diff = round(100 - sum(normalized), 2)
    if normalized and diff != 0:
        normalized[0] = round(max(0.0, min(100.0, normalized[0] + diff)), 2)
    return normalized



def _extract_json_object(content: str) -> dict[str, Any]:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if match:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed

    raise AnalysisExecutionError("AI 返回内容不是合法 JSON。")



def _extract_error_message(detail: str) -> str:
    try:
        parsed = json.loads(detail)
        if isinstance(parsed, dict):
            if isinstance(parsed.get("error"), dict):
                return parsed["error"].get("message") or detail
            if parsed.get("error"):
                return str(parsed["error"])
    except json.JSONDecodeError:
        pass
    return detail[:300] or "未知错误"



def _loads_json_list(raw: str | None) -> list[Any]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return value if isinstance(value, list) else []



def _is_json_list_string(raw: str | None) -> bool:
    if raw is None:
        return False
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return False
    return isinstance(value, list)



def _normalize_base_url(value: Any) -> str:
    url = _clean_text(value, 512)
    if not url:
        return ""
    if not re.match(r"^https?://", url, flags=re.IGNORECASE):
        raise AnalysisConfigError("AI 接口地址必须以 http:// 或 https:// 开头。")
    return url.rstrip("/")



def _clean_text(value: Any, max_length: int | None = None) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    text = re.sub(r"\s+", " ", text)
    if max_length is not None:
        text = text[:max_length]
    return text



def _coerce_context_size(value: Any, default: int) -> int:
    try:
        context_size = int(value)
    except (TypeError, ValueError):
        raise AnalysisConfigError("上下文大小必须是整数。") from None
    return context_size or default



def _coerce_weight(value: Any) -> float:
    try:
        weight = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(weight, 100.0))



def _estimate_prompt_budget(text: str) -> int:
    return len(text.encode("utf-8"))
