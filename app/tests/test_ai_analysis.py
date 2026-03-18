import unittest

from services.ai_analysis import _normalize_overview_result, _normalize_relation_tags, _extract_json_object, AnalysisExecutionError


def _make_character(name: str, role: str, description: str, weight: float) -> dict:
    return {
        "name": name,
        "role": role,
        "description": description,
        "weight": weight,
        "chapters": [13],
        "chapterCount": 1,
    }


class OverviewNormalizationTests(unittest.TestCase):
    def test_overview_skips_relationships_with_unknown_characters(self):
        aggregates = {
            "allCharacterStats": [
                _make_character("林舟", "记录者", "负责整理旧城档案与口述片段。", 95),
                _make_character("沈遥", "协作者", "协助核对档案并推动调查继续。", 3),
            ],
            "characterStats": [],
            "allRelationshipGraph": [
                {
                    "source": "林舟",
                    "target": "沈遥",
                    "relationTags": ["合作"],
                    "description": "两人一起梳理旧城档案，逐步接近真相。",
                }
            ],
            "analyzedChapters": 14,
        }
        raw = {
            "bookIntro": "简介文本",
            "globalSummary": "概览文本",
            "themes": ["旧城", "追索"],
            "characterStats": [
                {
                    "name": "林舟",
                    "role": "记录者",
                    "description": "串联线索并推动调查向前的人物。",
                    "sharePercent": 80,
                }
            ],
            "relationshipGraph": [
                {
                    "source": "林舟",
                    "target": "旁观者",
                    "relationTags": ["交流"],
                    "description": "向模糊的围观者倾诉调查中的不安。",
                },
                {
                    "source": "林舟",
                    "target": "沈遥",
                    "relationTags": ["合作"],
                    "description": "两人彼此补足线索，逐步揭开旧案背景。",
                },
            ],
        }

        with self.assertLogs("services.ai_analysis", level="WARNING") as captured_logs:
            result = _normalize_overview_result(raw, aggregates, total_chapters=14)

        self.assertEqual(len(result["relationshipGraph"]), 1)
        edge = result["relationshipGraph"][0]
        self.assertEqual({edge["source"], edge["target"]}, {"林舟", "沈遥"})
        self.assertEqual(edge["relationTags"], ["合作"])
        self.assertTrue(any("旁观者" in message for message in captured_logs.output))
        self.assertFalse(any("林舟, 沈遥" in message for message in captured_logs.output))

    def test_overview_can_finish_when_all_ai_relationships_are_invalid(self):
        aggregates = {
            "allCharacterStats": [
                _make_character("林舟", "记录者", "负责整理旧城档案与口述片段。", 95),
            ],
            "characterStats": [],
            "allRelationshipGraph": [],
            "analyzedChapters": 14,
        }
        raw = {
            "bookIntro": "简介文本",
            "globalSummary": "概览文本",
            "themes": ["旧城"],
            "characterStats": [
                {
                    "name": "林舟",
                    "role": "记录者",
                    "description": "串联线索并推动调查向前的人物。",
                    "sharePercent": 100,
                }
            ],
            "relationshipGraph": [
                {
                    "source": "林舟",
                    "target": "旁观者",
                    "relationTags": ["交流"],
                    "description": "向模糊的围观者倾诉调查中的不安。",
                }
            ],
        }

        result = _normalize_overview_result(raw, aggregates, total_chapters=14)

        self.assertEqual(result["relationshipGraph"], [])


class AiAnalysisUtilsTests(unittest.TestCase):
    def test_normalize_relation_tags(self):
        # Canonical mapping
        self.assertIn("恋人", _normalize_relation_tags(["相爱", "情侣"]))
        
        # Cleaning and splitting
        res = _normalize_relation_tags("朋友/战友", "疑似死敌", "（过去）盟友")
        self.assertIn("朋友", res)
        self.assertIn("战友", res)
        self.assertIn("对立", res) # "死敌" maps to "对立", "疑似" removed
        self.assertIn("盟友", res) # "（过去）" removed
    
    def test_extract_json_object(self):
        # Valid markdown
        content = "```json\n{\"foo\": \"bar\"}\n```"
        self.assertEqual(_extract_json_object(content), {"foo": "bar"})
        
        # Valid raw
        content = "{\"foo\": \"bar\"}"
        self.assertEqual(_extract_json_object(content), {"foo": "bar"})
        
        # Invalid
        with self.assertRaises(AnalysisExecutionError):
            _extract_json_object("just text")

if __name__ == "__main__":
    unittest.main()
