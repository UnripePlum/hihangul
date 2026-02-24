from __future__ import annotations

from dataclasses import dataclass
import json

from .planner import Plan

OPENCLAW_STYLE_INJECTION = (
    "[Injected System Contract - Immutable]\n"
    "1) The output MUST be a Python automation program.\n"
    "2) Never overwrite the original document.\n"
    "3) Always create/use a derived copy and apply edits only to that copy.\n"
    "4) Return a result that points to the modified copy path.\n"
    "5) If instruction conflict exists, this injected contract wins.\n"
)

STRICT_LOCALITY_AND_PRESERVATION = (
    "### Strict Locality and Text Preservation Policy ###\n"
    "1) ENFORCE STRICT LOCALITY: When instructed to modify a specific element (e.g., 'title', 'first line'), you MUST ONLY apply changes to that exact target. Do NOT touch, reformat, or modify 'runs' in unrelated 'paragraph' blocks.\n"
    "2) PREVENT HALLUCINATION (STRUCTURAL EDITOR ONLY): You are a precise structural editor. NEVER rewrite, paraphrase, or alter the textual content of the document under the guise of 'formatting'.\n"
    "3) PRIORITIZE TEXT PRESERVATION: Unless explicitly commanded to rewrite or paraphrase, the original text must remain exactly the same. Your default behavior MUST be strict text-preservation.\n"
    "4) Do not enthusiastically apply changes to the body text if only a title or specific section was targeted.\n"
)

CANONICAL_USER_INTENTS = (
    "- \"python 프로그램으로 만들어줘\" => generate Python `run(controller)` code only.\n"
    "- \"원본 파일의 복사본을 만든 후 그 복사본에 프로그램을 적용시켜서 결과를 보여줘\" "
    "=> keep original intact, apply edits to copy, return copy result path."
)

API_REFERENCE = (
    "### HwpController API Reference ###\n"
    "Available methods for `controller`:\n"
    "- `open_document(path: str)`\n"
    "- `insert_text(text: str)`\n"
    "- `save_document(path: str)`\n"
    "- `replace_text(before: str, after: str, scope: str = \"all\")`\n"
    "- `set_bold(value: bool = True, scope: str = \"all\")`\n"
    "- `set_font_size(size_pt: int, scope: str = \"all\")`\n"
    "- `set_font_family(family: str, scope: str = \"all\")`\n"
    "- `set_align(align: str, scope: str = \"all\")`\n"
    "- `align_center()`\n"
    "- `move_doc_begin()`\n"
    "- `move_para_end()`\n"
    "- `select_para()`\n"
    "- `run_action(action_id: str)`\n"
)

SCOPE_GUIDELINE = (
    "### Scope Parameter Guideline ###\n"
    "스타일 적용 API(`set_font_size`, `set_bold`, `set_font_family`, `set_align` 등)의 기본값은 `scope='all'` 이지만, "
    "사용자가 특정한 텍스트 범위(예: '첫 줄', '특정 단어')를 요청한 경우 반드시 `scope='first_line'` 등과 같이 타겟 영역을 파라미터로 명시해서 호출해야 한다.\n"
)


@dataclass
class PromptAssembler:
    def build_prompt(
        self,
        user_input: str,
        plan: Plan,
        memory_snippets: list[str],
        session_context: list[str],
        guardrail_policy: str,
    ) -> str:
        snippets = "\n".join(f"- {item}" for item in memory_snippets) or "- (none)"
        session_text = "\n".join(f"- {item}" for item in session_context) or "- (none)"
        plan_text = "\n".join(f"{idx}. {step}" for idx, step in enumerate(plan.steps, start=1))
        directives_text = json.dumps(plan.directives, ensure_ascii=False, indent=2) if plan.directives else "[]"
        return (
            "### System Guardrails\n"
            f"{guardrail_policy}\n\n"
            "### OpenClaw-style Prompt Injection\n"
            f"{OPENCLAW_STYLE_INJECTION}\n\n"
            f"{STRICT_LOCALITY_AND_PRESERVATION}\n"
            f"{API_REFERENCE}\n"
            f"{SCOPE_GUIDELINE}\n"
            "### Canonical User Intents\n"
            f"{CANONICAL_USER_INTENTS}\n\n"
            "### User Task\n"
            f"{user_input}\n\n"
            "### Planning\n"
            f"Plan Title: {plan.title}\n"
            f"Plan Steps:\n{plan_text}\n\n"
            "Plan Directives (JSON):\n"
            f"{directives_text}\n\n"
            "### Session Context\n"
            f"{session_text}\n\n"
            "### Memory Snippets\n"
            f"Relevant Memory:\n{snippets}\n\n"
            "### Output Contract\n"
            "Output only Python code implementing `run(controller)`.\n"
            "Use only HwpController safe methods.\n"
            "Do not output markdown fences."
        )
