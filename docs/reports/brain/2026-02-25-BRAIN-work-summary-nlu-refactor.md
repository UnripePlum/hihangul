# Work Summary: NLU Refactoring & Context Optimization

**Date:** 2026-02-25
**Target Area:** `windows-brain` (NLU Engine & Prompt Architecture)

## Summary of Tasks Completed

1. **LLM-Based NLU Migration**:
   - Refactored `NLUEngine` in `app/nlu.py` to utilize Claude/Codex for extracting Intent, Entities, and Directives, graduating from the brittle regex-based logic.
   - Restructured the LLM prompt using explicit XML tags (`<instructions>`, `<example_input>`, `<user_input>`) to prevent the context window from masking the user's core requests.
   - Handled conversational bypasses gracefully (e.g., inputting "NLU 테스트해봐: 첫 줄 30pt로 바꿔") by establishing rules to ignore meta-text.

2. **Context Pipeline Synchronization**:
   - Hoisted context injection (`memory.query_recent_knowledge()` and document structure analysis) to the pre-NLU phase in `app/main.py`.
   - Explicitly isolated context scopes: Structural/Chat context goes exclusively to the NLU LLM, while previous Python Code revisions (`window-agent/runs/workflow.py`) go exclusively to the Code Generator LLM. This successfully stopped the NLU engine from hallucinating Python code.

3. **Codex CLI STDIN Piping Fix**:
   - Found and resolved a critical bug where `codex exec <prompt>` triggered an autonomous file-system agent that failed due to missing `AGENTS.md`.
   - Modified `_generate_with_codex_cli` in `orchestrator.py` to pipe the prompt strictly through `STDIN` (`subprocess.run(..., input=prompt)`), forcing bare completions.

4. **Architectural Code Generation Redesign (In Progress via Agent Request)**:
   - Added support for `except_first_line` in the `prompt_assembler.py` and `nlu.py` guidelines.
   - Realized `windows-agent/hwp_controller.py` limits generation extensibility. Reverted static edits and drafted a comprehensive cross-branch `agent-request` to migrate "Program Generation" directly to the `windows-agent` repository, allowing the LLM native access to `zipfile` and `xml.etree` imports.

## Unresolved Issues
- Awaiting the `windows-agent` team to pick up the `2026-02-25-BRAIN->AGENT-separate-program-generator-llm.md` request, implement the sandbox relaxation (`sandbox.py`), and handle the dual-LLM context injection on their endpoint.
