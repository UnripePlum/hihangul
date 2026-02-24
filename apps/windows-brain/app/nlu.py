from __future__ import annotations

from dataclasses import dataclass
import re


@dataclass
class NLUResult:
    intent: str
    entities: dict[str, str]
    actions: list[dict[str, str]]


class NLUEngine:
    def parse(self, user_input: str) -> NLUResult:
        normalized = user_input.strip().lower()
        actions: list[dict[str, str]] = []

        if "템플릿" in normalized or "template" in normalized:
            intent = "apply_template"
        elif "표" in normalized or "table" in normalized:
            intent = "edit_table"
        elif "검토" in normalized or "review" in normalized:
            intent = "review_document"
        elif any(token in normalized for token in ["폰트", "글꼴", "font", "굵게", "bold", "크기", "size"]):
            intent = "style_update"
        elif any(token in normalized for token in ["바꿔", "변경", "치환", "replace"]):
            intent = "text_replace"
        else:
            intent = "general_automation"

        if any(token in normalized for token in ["굵게", "bold"]):
            actions.append({"type": "set_bold", "value": "true"})
        if any(token in normalized for token in ["굵기 해제", "볼드 해제", "not bold"]):
            actions.append({"type": "set_bold", "value": "false"})

        px_match = re.search(r"(\d{1,2})\s*(pt|px|포인트)", normalized)
        if px_match:
            actions.append({"type": "set_font_size", "value": px_match.group(1)})

        family_map = {
            "맑은 고딕": "Malgun Gothic",
            "malgun": "Malgun Gothic",
            "함초롬바탕": "Hamchorom Batang",
            "함초롬돋움": "Hamchorom Dotum",
            "굴림": "Gulim",
            "궁서": "Gungsuh",
        }
        for key, family in family_map.items():
            if key in normalized:
                actions.append({"type": "set_font_family", "value": family})
                break

        # quoted text replacement: "old" -> "new"
        quoted = re.findall(r"['\"]([^'\"]+)['\"]", user_input)
        if len(quoted) >= 2:
            actions.append({"type": "replace_text", "from": quoted[0], "to": quoted[1]})

        entities: dict[str, str] = {"raw": user_input}
        if "첫줄" in normalized or "첫 줄" in normalized or "first line" in normalized:
            entities["target_scope"] = "first_line"
        elif "전체" in normalized or "all" in normalized:
            entities["target_scope"] = "all"
        else:
            entities["target_scope"] = "all"

        return NLUResult(intent=intent, entities=entities, actions=actions)
