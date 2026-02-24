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
        context: str | None = None,
    ) -> NLUResult:
        if not (orchestrator and provider and auth_profile is not None):
            raise ValueError(
                "LLM context (orchestrator, provider, auth_profile) is required for NLU parsing. "
                "Rule-based fallback has been disabled."
            )

        llm_result = self._extract_full_nlu_with_llm(user_input, orchestrator, provider, auth_profile, context)
        if not llm_result:
            raise ValueError("Failed to generate or parse NLU response from the LLM.")
            
        return llm_result

    def _extract_full_nlu_with_llm(
        self,
        user_input: str,
        orchestrator: "LLMOrchestrator",
        provider: str,
        auth_profile: dict[str, Any],
        context: str | None = None,
    ) -> NLUResult | None:
        prompt = (
            "You are an NLU engine for a document editing automation tool.\n"
            "Given the user's sentence, extract the intent, entities (specifically a global target_scope), and required formatting actions.\n"
            "If they specify a generic target scope, map it to 'all' or 'first_line'.\n"
            "If they specify a specific section or phrase like '사업의 목적 및 배경' or '결론 부분', output exactly that phrase or section name as the scope.\n"
            "CRITICAL: If the user provides a compound request where different formatting applies to different parts of the document, you MUST include a 'target_scope' field directly inside each action object in the 'actions' array.\n"
            "Supported intents: 'apply_template', 'edit_table', 'review_document', 'style_update', 'text_replace', 'general_automation'\n"
            "Supported action types: 'set_bold' (value: 'true'/'false'), 'set_font_size' (value: str format pt), 'set_font_family' (value: str), 'replace_text' (needs 'from' and 'to').\n"
            "Output ONLY a valid JSON object in the exact format shown below, nothing else.\n\n"
            "Format:\n"
            "{\n"
            "  \"intent\": \"string\",\n"
            "  \"entities\": {\"raw\": \"original_user_input\", \"target_scope\": \"global_scope_string\"},\n"
            "  \"actions\": [\n"
            "    {\"type\": \"action_type\", \"target_scope\": \"specific_scope_string_if_different\", \"value\": \"optional_value\", \"from\": \"optional\", \"to\": \"optional\"}\n"
            "  ]\n"
            "}\n\n"
        )

        if context:
            prompt += f"[Available Context]\n{context}\n\n"

        prompt += f"User input: '{user_input}'"
        
        try:
            chosen_model = orchestrator._choose_model(provider, prompt)
            generated = orchestrator._generate_with_provider_llm(
                assembled_prompt=prompt,
                provider=provider,
                chosen_model=chosen_model,
                auth_profile=auth_profile,
                extract_code=False,
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
            
            entities = parsed.get("entities")
            if not entities:
                raise ValueError("LLM response missing 'entities' mapping.")
                
            return NLUResult(
                intent=parsed.get("intent", "general_automation"),
                entities=entities,
                actions=parsed.get("actions", [])
            )
        except Exception as e:
            raise ValueError(f"Failed to generate or parse NLU response from the LLM: {e}")
