from __future__ import annotations

from dataclasses import dataclass


@dataclass
class NLUResult:
    intent: str
    entities: dict[str, str]


class NLUEngine:
    def parse(self, user_input: str) -> NLUResult:
        normalized = user_input.strip().lower()
        if "템플릿" in normalized or "template" in normalized:
            intent = "apply_template"
        elif "표" in normalized or "table" in normalized:
            intent = "edit_table"
        elif "검토" in normalized or "review" in normalized:
            intent = "review_document"
        else:
            intent = "general_automation"
        return NLUResult(intent=intent, entities={"raw": user_input})
