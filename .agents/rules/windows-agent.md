# Windows-Agent Rules

## Environment & Architecture Context
- **OS Environment**: Development occurs on a **macOS host** running **Parallels Desktop** to simulate a **Windows 11 environment**.
- **Role**: You are the `windows-agent` development agent.
- **Context**: The `windows-agent` is the Python backend (FastAPI) running on Windows. It directly interacts with Windows APIs (like HWP/PDF execution) and provides functional endpoints to `windows-ui`. It uses `windows-brain` for AI features.

## Strict Write Permissions
1. **Allowed Directories**:
   - Write access is strictly limited to:
     - `apps/windows-agent/` and its subdirectories
     - `docs/reports/agent/`
     - `docs/agent-requests/`
   - **ABSOLUTE RULE**: All other directories and files are **STRICTLY READ-ONLY**. You MUST NOT touch them under any circumstances.
   - **CRITICAL ENFORCEMENT**: Before creating, modifying, or deleting ANY file (including test scripts like `.py` or `.ts`), you MUST explicitly verify that the absolute path starts with one of the three allowed paths above. If it does not, you MUST abort the action and use the `agent-request` skill instead.

2. **Outside Modifications**:
   - If you are asked to create, modify, or delete a file outside of the allowed write directories, you MUST notify the user (`notify_user`) and refuse the action instead of doing it yourself. DO NOT attempt to write temporary files or test scripts to the project root.

3. **Work Summaries (`work-summary` skill)**:
   - When organizing documents, use the `work-summary` skill.
   - It will determine the target application (brain, agent, ui) and summarize today's work.
   - The document MUST be named in the format `YYYY-MM-DD-[TARGET]-work-summary-[title].md` (e.g., `2026-02-21-AGENT-work-summary-api-gateway.md`).
   - The document MUST be saved in `docs/reports/agent/` (if target is agent).

4. **Agent Requests (`agent-request` skill)**:
   - If changes are needed in `windows-ui` or `windows-brain`, document the requirements using the `agent-request` skill.
   - The document MUST clarify where the request originates and where it is sent.
   - The document MUST be named in the format `YYYY-MM-DD-[SOURCE]->[TARGET]-[title].md` (e.g., `2026-02-21-AGENT->UI-context-menu.md`).
   - The document MUST be saved in `docs/agent-requests/`.
   - After writing the request, you MUST notify the user.

5. **Immutable Agent Requests**:
   - Once a request document in `docs/agent-requests/` has been shared or sent to another branch using the `send-request` skill, it becomes **STRICTLY READ-ONLY**.
   - You MUST NEVER modify the document again on this branch to prevent cross-branch merge conflicts.

## Current Status & Implementation Details
- **Tech Stack**: Python, FastAPI, PyMuPDF, Windows-native HWP Automation. Runs on `localhost:9000`.
- **Role**: The core mechanical backend executing HWP commands and rendering PDF previews.
- **Recent Progress**:
  - Implemented runtime persistence for agent runs (saving `workflow.py` and `result.json` in `apps/windows-agent/runs/<run_id>/`).
  - Vastly improved text highlighting and precise bounding box matching for the Diff Viewer (`document_preview.py` and `hwp_controller.py`).
  - Fixed font size scope application logic and self-closing tag retention for cloned HWPX layouts.
- **Upcoming/Ongoing**: Stabilizing and refining the Diff Viewer integration to provide precise visual feedback for AI-driven document edits.
