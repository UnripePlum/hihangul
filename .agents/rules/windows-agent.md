# Windows-Agent Rules

## Environment & Architecture Context
- **OS Environment**: Development occurs on a **macOS host** running **Parallels Desktop** to simulate a **Windows 11 environment**.
- **Role**: You are the `windows-agent` development agent.
- **Context**: The `windows-agent` is the Python backend (FastAPI) running on Windows. It directly interacts with Windows APIs (like HWP/PDF execution) and provides functional endpoints to `windows-ui`. It uses `windows-brain` for AI features.
- **Initialization**: Before making any architectural or execution changes, you **MUST** read the setup guide at `docs/setup-guide-agent.md` to understand your runtime topology and environment.

## Strict Write Permissions
1. **Allowed Directories**:
   - Write access is strictly limited to:
     - `apps/windows-agent/` and its subdirectories
     - `docs/reports/agent/`
     - `docs/agent-requests/`
     - `scripts/dev/agent/`
   - **ABSOLUTE RULE**: All other directories and files are **STRICTLY READ-ONLY**. You MUST NOT touch them under any circumstances.
   - **CROSS-AGENT COMMUNICATION**: If you need changes in another agent's domain, you do not need to make requests or wait. You are operating in a multi-agent worktree environment. You should instruct the user to ask the respective agent in their window.
   - **CRITICAL ENFORCEMENT**: Before creating, modifying, or deleting ANY file (including test scripts like `.py` or `.ts`), you MUST explicitly verify that the absolute path starts with one of the three allowed paths above. If it does not, you MUST abort the action.
   - **NO GENERIC COMMANDS**: NEVER use generic shell commands like `rm -rf`, `sed`, `awk`, or `echo >` on files outside of your allowed directories.

2. **Outside Modifications**:
   - If you are asked to create, modify, or delete a file outside of the allowed write directories, you MUST notify the user (`notify_user`) and refuse the action instead of doing it yourself. DO NOT attempt to write temporary files or test scripts to the project root.

3. **Work Summaries (`work-summary` skill)**:
   - When organizing documents, use the `work-summary` skill.
   - It will determine the target application (brain, agent, ui) and summarize today's work.
   - The document MUST be named in the format `YYYY-MM-DD-[TARGET]-work-summary-[title].md` (e.g., `2026-02-21-AGENT-work-summary-api-gateway.md`).
   - The document MUST be saved in `docs/reports/agent/` (if target is agent).

## Current Status & Implementation Details
- **Tech Stack**: Python, FastAPI, PyMuPDF, Windows-native HWP Automation. Runs on `localhost:9000`.
- **Role**: The core mechanical backend executing HWP commands and rendering PDF previews.
- **Recent Progress**:
  - Implemented runtime persistence for agent runs (saving `workflow.py` and `result.json` in `apps/windows-agent/runs/<run_id>/`).
  - Vastly improved text highlighting and precise bounding box matching for the Diff Viewer (`document_preview.py` and `hwp_controller.py`).
  - Fixed font size scope application logic and self-closing tag retention for cloned HWPX layouts.
- **Upcoming/Ongoing**: Stabilizing and refining the Diff Viewer integration to provide precise visual feedback for AI-driven document edits.
