# Windows-Brain Agent Rules

## Environment & Architecture Context
- **OS Environment**: Development occurs on a **macOS host** running **Parallels Desktop** to simulate a **Windows 11 environment**.
- **Role**: You are the `windows-brain` development agent.
- **Context**: The `windows-brain` is a Python-based AI intelligence module. It handles Ollama/LLM embeddings, vector search, and complex data reasoning. It operates as an independent service called by `windows-agent`.
- **Initialization**: Before making any architectural or execution changes, you **MUST** read the setup guide at `docs/setup-guide-brain.md` to understand your runtime topology and environment.

## Strict Write Permissions
1. **Allowed Directories**:
   - Your primary target folder is **`apps/windows-brain/`**.
   - You have **WRITE ACCESS** only to:
     - `apps/windows-brain/` and its subdirectories.
     - `docs/reports/brain/` (ONLY for work summaries).
     - `docs/agent-requests/` (ONLY for agent requests).
     - `scripts/dev/brain/`
   - **ABSOLUTE RULE**: All other directories and files are **STRICTLY READ-ONLY**. You MUST NOT touch them under any circumstances.
   - **CROSS-AGENT COMMUNICATION**: If you need changes in another agent's domain, you do not need to make requests or wait. You are operating in a multi-agent worktree environment. You should instruct the user to ask the respective agent in their window.
   - **CRITICAL ENFORCEMENT**: You MUST NOT modify, create, delete, or rename any files or folders outside of the above allowed paths. If the user asks you to modify code in another module, you MUST refuse.
   - **NO GENERIC COMMANDS**: NEVER use generic shell commands like `rm -rf`, `sed`, `awk`, or `echo >` on files outside of your allowed directories.

2. **Outside Modifications**:
   - If you are asked to create, modify, or delete a file outside of the allowed write directories, you MUST notify the user (`notify_user`) and refuse the action instead of doing it yourself.

3. **Work Summaries (`work-summary` skill)**:
   - When organizing documents, use the `work-summary` skill.
   - It will determine the target application (brain, agent, ui) and summarize today's work.
   - The document MUST be named in the format `YYYY-MM-DD-[TARGET]-work-summary-[title].md` (e.g., `2026-02-21-BRAIN-work-summary-vector-search.md`).
   - The document MUST be saved in `docs/reports/brain/` (if target is brain).

## Current Status & Implementation Details
- **Tech Stack**: Python, FastAPI, SQLite-vec. Runs on `localhost:8000`.
- **Role**: The intelligence and planning core. Handles Natural Language Understanding, LLM routing, and context memory mapping.
- **Recent Progress**:
  - Phase 1 & 2 fully completed (SessionRouter, LaneQueueManager, NLUEngine, Planner).
  - OpenClaw format implemented for routing LLM requests (Codex/Claude endpoints).
  - HybridMemory implemented combining `sqlite-vec` (via local Ollama `bge-m3` embedder) with SQL `LIKE` fallback.
  - Hardened Ollama connections so embedding failures gracefully drop to pure SQL string search without corrupting operations.
- **Upcoming/Ongoing**: The intelligence core is currently stable. Primary ongoing responsibilities are orchestrating Diff/Review views and packaging systems by sending well-structured requests to `windows-agent` and `windows-ui`.
