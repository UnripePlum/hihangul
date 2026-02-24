# Work Summary: NLU Refactoring to Use LLM

- **Date:** 2026-02-24
- **Target Area:** BRAIN
- **Summary of tasks completed:**
  - Upgraded `NLUEngine.parse` in `app/nlu.py` to completely rely on the LLM to dynamically infer the user's `intent`, `actions`, and `target_scope` using the currently authenticated LLM provider (Codex/Claude) via `LLMOrchestrator`. 
  - The model now correctly identifies semantic targets like "사업의 목적 및 배경" or "결론 부분" instead of relying on hardcoded regular expressions.
  - Resolved circular import issues between `nlu.py` and `orchestrator.py` by using Python's `TYPE_CHECKING`.
  - Updated `app/main.py`'s `process_task` pipeline to forward the logged-in session's credentials (`orchestrator`, `provider`, `auth_profile`) to the `NLUEngine`.
  - Refactored `tests/test_nlu.py` to pass the newly required optional parameters, ensuring older hardcoded regression cases (e.g. "첫 줄", "전체") continue to pass normally when LLM contexts aren't provided.
- **Unresolved issues:**
  - Semantic targeting accuracy relies on the user's selected LLM capabilities (e.g. Claude generates more accurate JSON extraction than simpler models).
