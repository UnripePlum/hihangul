from __future__ import annotations

from dataclasses import dataclass
import shutil
import subprocess
from typing import Any

from .planner import Plan
from .nlu import NLUResult


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

    def generate_code(
        self,
        assembled_prompt: str,
        provider: str,
        profile_id: str,
        *,
        plan: Plan,
        nlu: NLUResult,
        auth_profile: dict[str, Any] | None = None,
    ) -> str:
        chosen_model = self._choose_model(provider, assembled_prompt)
        generated = self._generate_with_provider_llm(
            assembled_prompt=assembled_prompt,
            provider=provider,
            chosen_model=chosen_model,
            auth_profile=auth_profile or {},
        )
        if generated:
            return generated
        return self._build_fallback_code(
            provider=provider,
            profile_id=profile_id,
            chosen_model=chosen_model,
            plan=plan,
            nlu=nlu,
            note="provider llm call failed; fallback rule-based generation used",
        )

    def _build_fallback_code(
        self,
        *,
        provider: str,
        profile_id: str,
        chosen_model: str,
        plan: Plan,
        nlu: NLUResult,
        note: str,
    ) -> str:
        body_lines = self._build_run_body(plan, nlu)
        return (
            f"# provider: {provider}\n"
            f"# profile_id: {profile_id}\n"
            f"# model: {chosen_model}\n"
            f"# plan: {plan.title}\n"
            f"# note: {note}\n"
            "def run(controller):\n"
            + "\n".join(f"    {line}" for line in body_lines)
            + "\n"
        )

    def _generate_with_provider_llm(
        self,
        *,
        assembled_prompt: str,
        provider: str,
        chosen_model: str,
        auth_profile: dict[str, Any],
    ) -> str | None:
        if provider == "codex":
            return self._generate_with_codex_cli(assembled_prompt, chosen_model)
        if provider == "claude":
            return self._generate_with_claude(assembled_prompt, chosen_model, auth_profile)
        return None

    def _generate_with_codex_cli(self, prompt: str, model: str) -> str | None:
        if shutil.which("codex") is None:
            return None

        # Best-effort one-shot CLI call. If command shape differs by version, fail fast and fallback.
        candidates: list[list[str]] = [
            ["codex", "exec", "--model", model, prompt],
            ["codex", "exec", prompt],
        ]
        for args in candidates:
            try:
                proc = subprocess.run(
                    args,
                    capture_output=True,
                    text=True,
                    timeout=90,
                    check=False,
                )
            except Exception:
                continue
            if proc.returncode != 0:
                continue
            parsed = self._extract_python_code(proc.stdout or "")
            if parsed:
                return parsed
        return None

    def _generate_with_claude(self, prompt: str, model: str, auth_profile: dict[str, Any]) -> str | None:
        token = str(auth_profile.get("token") or "").strip()
        if token:
            code = self._generate_with_claude_http(prompt, model, token)
            if code:
                return code

        if shutil.which("claude") is None:
            return None

        candidates: list[list[str]] = [
            ["claude", "-p", prompt, "--model", model],
            ["claude", "-p", prompt],
        ]
        for args in candidates:
            try:
                proc = subprocess.run(
                    args,
                    capture_output=True,
                    text=True,
                    timeout=90,
                    check=False,
                )
            except Exception:
                continue
            if proc.returncode != 0:
                continue
            parsed = self._extract_python_code(proc.stdout or "")
            if parsed:
                return parsed
        return None

    def infer_document_structure_with_sllm(self, blocks: list[dict[str, object]]) -> dict[str, object]:
        """
        2단계: 로컬 sLLM 기반 의미론적 추론 (Semantic Inference)
        서식 정보가 애매할 때 문서 최상단 단락을 로컬 모델에 전달하여 '제목'을 찾습니다.
        """
        # HWP 등 블록 데이터에서 첫 5개 문단 정도만 가볍게 추출
        intro_text = ""
        for i, b in enumerate(blocks[:5]):
            if b.get("type") == "paragraph":
                runs = b.get("runs", [])
                text = " ".join(str(r.get("text", "")) for r in runs if isinstance(r, dict)).strip()
                if text:
                    intro_text += f"[단락 {i}] {text}\n"

        prompt = (
            "다음은 서식 정보가 없는 한글 문서 도입부다. 문맥을 분석해 전체 문서를 포괄하는 "
            "'제목'에 해당하는 단락 인덱스를 찾고 반환하라.\n\n"
            f"<document_intro>\n{intro_text}</document_intro>\n\n"
            "출력은 반드시 다음 JSON 포맷만 반환할 것: {\"title_index\": 숫자_또는_null, \"reason\": \"이유\"}"
        )
        # TODO: 실제 사내 연동된 Ollama / vLLM 등 로컬 sLLM API Endpoint 주소로 교체 필요
        response_json_str = self._generate_with_local_sllm_http(prompt, "llama3-8b-instruct", "http://localhost:11434/api/generate")
        
        try:
            import json
            parsed = json.loads(response_json_str)
            return {
                "title_candidate_index": parsed.get("title_index"),
                "confidence": 0.8,
                "reason": f"Semantic inference: {parsed.get('reason')}"
            }
        except Exception:
            return {"title_candidate_index": None, "confidence": 0.0, "reason": "sLLM parsing failed"}

    def _generate_with_local_sllm_http(self, prompt: str, model: str, endpoint: str) -> str:
        """망분리 환경을 위한 로컬 LLM (예: Ollama) 호출"""
        try:
            import httpx
            body = {
                "model": model,
                "prompt": prompt,
                "stream": False,
                "format": "json"
            }
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(endpoint, json=body)
            if resp.status_code >= 400:
                return "{}"
            data = resp.json()
            return data.get("response", "{}")
        except Exception:
            return "{}"

    def _generate_with_claude_http(self, prompt: str, model: str, token: str) -> str | None:
        try:
            import httpx  # local import to avoid hard dependency at import time
        except Exception:
            return None

        headers = {
            "x-api-key": token,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        body = {
            "model": model,
            "max_tokens": 2000,
            "temperature": 0,
            "messages": [{"role": "user", "content": prompt}],
        }
        try:
            with httpx.Client(timeout=90.0) as client:
                resp = client.post("https://api.anthropic.com/v1/messages", headers=headers, json=body)
            if resp.status_code >= 400:
                return None
            data = resp.json()
            content = data.get("content", [])
            text_parts = [part.get("text", "") for part in content if isinstance(part, dict) and part.get("type") == "text"]
            raw = "\n".join(text_parts).strip()
            return self._extract_python_code(raw)
        except Exception:
            return None

    def _extract_python_code(self, raw: str) -> str | None:
        text = (raw or "").strip()
        if not text:
            return None
        if "```python" in text:
            start = text.find("```python") + len("```python")
            end = text.find("```", start)
            block = text[start:end if end > start else None].strip()
            return block or None
        if "```" in text:
            start = text.find("```") + 3
            end = text.find("```", start)
            block = text[start:end if end > start else None].strip()
            return block or None
        # Accept plain code responses containing run(controller)
        if "def run(controller)" in text:
            return text
        return None

    def _build_run_body(self, plan: Plan, nlu: NLUResult) -> list[str]:
        source_path = "input.hwp"
        output_path = "output_copy.hwp"
        for directive in plan.directives:
            if directive.get("op") == "source_path" and directive.get("value"):
                source_path = directive["value"]
            if directive.get("op") == "output_path" and directive.get("value"):
                output_path = directive["value"]

        lines: list[str] = [
            f"controller.open_document('{self._safe_literal(source_path)}')",
        ]

        if not plan.directives:
            if nlu.intent == "review_document":
                lines.append("controller.insert_text('[검토] 문서 검토 마커를 추가했습니다.')")
            elif nlu.intent == "edit_table":
                lines.append("controller.insert_text('[표수정] 표 편집 지시가 반영되었습니다.')")
            elif nlu.intent == "apply_template":
                lines.append("controller.insert_text('[템플릿] 템플릿 규칙이 적용되었습니다.')")
            else:
                lines.append("controller.insert_text('HiHangul 자동화 작업이 완료되었습니다.')")
        else:
            for directive in plan.directives:
                op = directive.get("op", "")
                scope = directive.get("scope", "all")
                if op == "replace_text":
                    from_text = self._safe_literal(directive.get("from", ""))
                    to_text = self._safe_literal(directive.get("to", ""))
                    if from_text:
                        lines.append(
                            f"controller.replace_text('{from_text}', '{to_text}', scope='{self._safe_literal(scope)}')"
                        )
                elif op == "set_bold":
                    value = directive.get("value", "true") == "true"
                    lines.append(
                        f"controller.set_bold({str(value)}, scope='{self._safe_literal(scope)}')"
                    )
                elif op == "set_font_size":
                    size = self._safe_literal(directive.get("value", "11"))
                    try:
                        size_i = int(size)
                    except Exception:
                        size_i = 11
                    lines.append(
                        f"controller.set_font_size({size_i}, scope='{self._safe_literal(scope)}')"
                    )
                elif op == "set_font_family":
                    family = self._safe_literal(directive.get("value", "Malgun Gothic"))
                    if family:
                        lines.append(
                            f"controller.set_font_family('{family}', scope='{self._safe_literal(scope)}')"
                        )

        lines.append(f"controller.save_document('{self._safe_literal(output_path)}')")
        return lines

    def _safe_literal(self, value: str) -> str:
        return (value or "").replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", " ")
