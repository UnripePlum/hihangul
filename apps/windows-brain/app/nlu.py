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
            "<instructions>\n"
            "Analyze the text in the <user_input> block and extract the intent, entities (global target_scope), and actions into a JSON object.\n"
            "- If generic scope: map to 'all' or 'first_line'.\n"
            "- If specific section ('사업의 목적', '결론'): output that exact phrase.\n"
            "- CRITICAL RULE 1: If formatting differs by section, include 'target_scope' inside each action object.\n"
            "- CRITICAL RULE 2: If the input is conversational (no editing command), output empty actions array and 'general_automation' intent.\n"
            "- CRITICAL RULE 3: Do NOT output conversational text, greetings, or acknowledgments. ONLY output the JSON block.\n"
            "- Supported intents: 'apply_template', 'edit_table', 'review_document', 'style_update', 'text_replace', 'general_automation'\n"
            "- Supported action types: 'set_bold' (true/false), 'set_font_size' (30pt), 'set_font_family', 'replace_text' (from/to).\n"
            "</instructions>\n\n"
            "<example_input>\n첫 줄의 글자 크기를 30pt로 만들어\n</example_input>\n"
            "<example_output>\n"
            "{\n"
            "  \"intent\": \"style_update\",\n"
            "  \"entities\": {\"raw\": \"첫 줄의 글자 크기를 30pt로 만들어\", \"target_scope\": \"first_line\"},\n"
            "  \"actions\": [\n"
            "    {\"type\": \"set_font_size\", \"target_scope\": \"first_line\", \"value\": \"30pt\"}\n"
            "  ]\n"
            "}\n"
            "</example_output>\n\n"
        )

        if context:
            prompt += f"<context>\n{context}\n</context>\n\n"

        prompt += f"<user_input>\n{user_input}\n</user_input>\n\n"
        prompt += "OUTPUT_JSON:\n"
        
        print(f"\n[DEBUG NLU PROMPT]\n{prompt}\n[DEBUG NLU PROMPT END]\n")
        
        try:
            chosen_model = orchestrator._choose_model(provider, prompt)
            generated = orchestrator._generate_with_provider_llm(
                assembled_prompt=prompt,
                provider=provider,
                chosen_model=chosen_model,
                auth_profile=auth_profile,
                extract_code=False,
            )
            
            print(f"\n[DEBUG NLU GENERATED RAW]\n{generated}\n[DEBUG NLU GENERATED RAW END]\n")
            
            if not generated:
                return None
                
            text = generated.strip()
            if "```json" in text:
                start = text.find("```json") + 7
                end = text.rfind("```")
                text = text[start:end if end > start else None].strip()
            elif "```" in text:
                start = text.find("```") + 3
                end = text.rfind("```")
                text = text[start:end if end > start else None].strip()
            else:
                import re
                match = re.search(r"(\{.*\})", text, re.DOTALL)
                if match:
                    text = match.group(1).strip()
                
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
            raise ValueError(f"Failed to generate or parse NLU response from the LLM. Raw output: '{generated}'. Error: {e}")
