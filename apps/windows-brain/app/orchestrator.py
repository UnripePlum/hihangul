from __future__ import annotations

from dataclasses import dataclass


@dataclass
class LLMOrchestrator:
    claude_model: str = "claude-3-5-sonnet"
    codex_model: str = "gpt-5-codex"
    fallback_model: str = "rule-based"

    def _choose_model(self, provider: str, assembled_prompt: str) -> str:
        if provider == "claude":
            return self.claude_model
        if provider == "codex":
            return self.codex_model
        if len(assembled_prompt) > 4000:
            return self.fallback_model
        return self.claude_model

    def generate_code(self, assembled_prompt: str, provider: str, profile_id: str) -> str:
        chosen_model = self._choose_model(provider, assembled_prompt)
        return (
            f"# provider: {provider}\\n"
            f"# profile_id: {profile_id}\\n"
            f"# model: {chosen_model}\\n"
            "def run(controller):\\n"
            "    controller.open_document('input.hwp')\\n"
            "    controller.insert_text('HiHangul 자동화 작업이 완료되었습니다.')\\n"
            "    controller.save_document('output.hwp')\\n"
        )
