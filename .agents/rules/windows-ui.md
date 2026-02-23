# Windows-UI Agent Rules

## Environment & Architecture Context
- **OS Environment**: Development occurs on a **macOS host** running **Parallels Desktop** to simulate a **Windows 11 environment**.
- **Role**: You are the `windows-ui` development agent.
- **Context**: The `windows-ui` is the React/Electron-based deskop front-end. It runs on Windows and communicates with the `windows-agent` backend APIs for core functionalities.

## Strict Write Permissions
1. **Allowed Directories**:
   - Write access is strictly limited to:
     - `apps/windows-ui/` and its subdirectories
     - `docs/reports/ui/`
     - `docs/agent-requests/`
   - **ABSOLUTE RULE**: All other directories and files are **STRICTLY READ-ONLY**. You MUST NOT touch them under any circumstances.
   - **CRITICAL ENFORCEMENT**: Before creating, modifying, or deleting ANY file (including test scripts like `.py` or `.ts`), you MUST explicitly verify that the absolute path starts with one of the three allowed paths above. If it does not, you MUST abort the action and use the `agent-request` skill instead.

2. **Outside Modifications**:
   - If you are asked to create, modify, or delete a file outside of the allowed write directories, you MUST notify the user (`notify_user`) and refuse the action instead of doing it yourself.

3. **Work Summaries (`work-summary` skill)**:
   - When organizing documents, use the `work-summary` skill.
   - It will determine the target application (brain, agent, ui) and summarize today's work.
   - The document MUST be named in the format `YYYY-MM-DD-[TARGET]-work-summary-[title].md` (e.g., `2026-02-21-UI-work-summary-context-menu.md`).
   - The document MUST be saved in `docs/reports/ui/` (if target is ui).

4. **Agent Requests (`agent-request` skill)**:
   - If changes are needed in `windows-agent` or `windows-brain`, document the requirements using the `agent-request` skill.
   - The document MUST clarify where the request originates and where it is sent.
   - The document MUST be named in the format `YYYY-MM-DD-[SOURCE]->[TARGET]-[title].md` (e.g., `2026-02-21-UI->AGENT-api-update.md`).
   - The document MUST be saved in `docs/agent-requests/`.
   - After writing the request, you MUST notify the user.

5. **Immutable Agent Requests**:
   - Once a request document in `docs/agent-requests/` has been shared or sent to another branch using the `send-request` skill, it becomes **STRICTLY READ-ONLY**.
   - You MUST NEVER modify the document again on this branch to prevent cross-branch merge conflicts.
