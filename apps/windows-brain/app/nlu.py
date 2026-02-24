from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .orchestrator import LLMOrchestrator


@dataclass
class NLUResult:
    intent: str
    entities: dict[str, str]
    actions: list[dict[str, str]]


class NLUEngine:
    def parse(
        self,
        user_input: str,
        orchestrator: "LLMOrchestrator | None" = None,
        provider: str | None = None,
        auth_profile: dict[str, Any] | None = None,
    ) -> NLUResult:
        normalized = user_input.strip().lower()
        
        # 1. Attempt LLM-based full NLU extraction
        if orchestrator and provider and auth_profile:
            llm_result = self._extract_full_nlu_with_llm(user_input, orchestrator, provider, auth_profile)
            if llm_result:
                return llm_result

        # 2. Fallback to Regex and Rule-based Engine if LLM is unavailable or fails
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

    def _extract_full_nlu_with_llm(
        self,
        user_input: str,
        orchestrator: "LLMOrchestrator",
        provider: str,
        auth_profile: dict[str, Any],
    ) -> NLUResult | None:
        prompt = (
            "You are an NLU engine for a document editing automation tool.\n"
            "Given the user's sentence, extract the intent, entities (specifically target_scope), and required formatting actions.\n"
            "If they specify a generic target scope, map it to 'all' or 'first_line'.\n"
            "If they specify a specific section or phrase like '사업의 목적 및 배경' or '결론 부분', output exactly that phrase or section name as the scope.\n"
            "Supported intents: 'apply_template', 'edit_table', 'review_document', 'style_update', 'text_replace', 'general_automation'\n"
            "Supported action types: 'set_bold' (value: 'true'/'false'), 'set_font_size' (value: str format pt), 'set_font_family' (value: str), 'replace_text' (needs 'from' and 'to').\n"
            "Output ONLY a valid JSON object in the exact format shown below, nothing else.\n\n"
            "Format:\n"
            "{\n"
            "  \"intent\": \"string\",\n"
            "  \"entities\": {\"raw\": \"original_user_input\", \"target_scope\": \"scope_string\"},\n"
            "  \"actions\": [\n"
            "    {\"type\": \"action_type\", \"value\": \"optional_value\", \"from\": \"optional\", \"to\": \"optional\"}\n"
            "  ]\n"
            "}\n\n"
            f"User input: '{user_input}'"
        )
        
        try:
            chosen_model = orchestrator._choose_model(provider, prompt)
            generated = orchestrator._generate_with_provider_llm(
                assembled_prompt=prompt,
                provider=provider,
                chosen_model=chosen_model,
                auth_profile=auth_profile,
            )
            
            if not generated:
                return None
                
            text = generated.strip()
            if "```json" in text:
                start = text.find("```json") + 7
                end = text.find("```", start)
                text = text[start:end if end > start else None].strip()
            elif "```" in text:
                start = text.find("```") + 3
                end = text.find("```", start)
                text = text[start:end if end > start else None].strip()
                
            parsed = json.loads(text)
            return NLUResult(
                intent=parsed.get("intent", "general_automation"),
                entities=parsed.get("entities", {"raw": user_input, "target_scope": "all"}),
                actions=parsed.get("actions", [])
            )
        except Exception:
            return None
