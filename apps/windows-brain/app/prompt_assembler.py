from __future__ import annotations

from dataclasses import dataclass

from .planner import Plan


@dataclass
class PromptAssembler:
    def build_prompt(
        self,
        user_input: str,
        plan: Plan,
        memory_snippets: list[str],
        guardrail_policy: str,
    ) -> str:
        snippets = "\n".join(f"- {item}" for item in memory_snippets) or "- (none)"
        plan_text = "\n".join(f"{idx}. {step}" for idx, step in enumerate(plan.steps, start=1))
        return (
            f"{guardrail_policy}\n\n"
            f"Task: {user_input}\n"
            f"Plan Title: {plan.title}\n"
            f"Plan Steps:\n{plan_text}\n\n"
            f"Relevant Memory:\n{snippets}\n\n"
            "Output only Python code implementing run(controller)."
        )
