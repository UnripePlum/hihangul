# Work Summary: NLU Refactoring to Use LLM

- **Date:** 2026-02-24
- **Target Area:** BRAIN
- **Summary of tasks completed:**
  - Upgraded `NLUEngine.parse` in `app/nlu.py` to completely rely on the LLM to dynamically infer the user's `intent`, `actions`, and `target_scope` using the currently authenticated LLM provider (Codex/Claude) via `LLMOrchestrator`. 
  - The model now correctly identifies semantic targets like "사업의 목적 및 배경" or "결론 부분" instead of relying on hardcoded regular expressions.
  - Implemented per-action target scope inference. If the user provides a compound request (e.g. "make header 30pt and body 15pt"), the LLM now maps separate `target_scope` fields directly inside the respective action objects, which `app/planner.py` extracts dynamically.
  - Resolved circular import issues between `nlu.py` and `orchestrator.py` by using Python's `TYPE_CHECKING`.
  - Updated `app/main.py`'s `process_task` pipeline to forward the logged-in session's credentials (`orchestrator`, `provider`, `auth_profile`) to the `NLUEngine`.
  - Hoisted conversational memory and document structure context in `app/main.py` to evaluate prior to NLU execution. The NLU Prompt now receives an `[Available Context]` block, allowing the LLM to understand references like "이전 문단" (previous paragraph) or specific section headers found during structure parsing.
  - Refactored `tests/test_nlu.py` to pass the newly required optional parameters, ensuring older hardcoded regression cases (e.g. "첫 줄", "전체") continue to pass normally when LLM contexts aren't provided.
- **Unresolved issues:**
  - Semantic targeting accuracy relies on the user's selected LLM capabilities (e.g. Claude generates more accurate JSON extraction than simpler models).
