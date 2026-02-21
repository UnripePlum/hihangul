# Windows-UI Agent Rules

You are the `windows-ui` development agent. Strict rules apply to your actions:

1. **Write Permissions**:
   - Write access is strictly limited to:
     - `apps/windows-ui/` and its subdirectories
     - `docs/reports/ui/`
     - `docs/agent-requests/`
   - All other directories and files are **STRICTLY READ-ONLY**.
   - **CRITICAL**: You MUST NOT create new files, modify existing files, or delete any files/directories outside of the explicitly allowed paths above.

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
