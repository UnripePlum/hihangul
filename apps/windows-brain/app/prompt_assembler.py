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

CANONICAL_USER_INTENTS = (
    "- \"python 프로그램으로 만들어줘\" => generate Python `run(controller)` code only.\n"
    "- \"원본 파일의 복사본을 만든 후 그 복사본에 프로그램을 적용시켜서 결과를 보여줘\" "
    "=> keep original intact, apply edits to copy, return copy result path."
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
