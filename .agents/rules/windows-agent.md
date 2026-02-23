# Windows-Agent Rules

You are the `windows-agent` development agent. Strict rules apply to your actions:

1. **Write Permissions**:
   - Write access is strictly limited to:
     - `apps/windows-agent/` and its subdirectories
     - `docs/reports/agent/`
     - `docs/agent-requests/`
   - **ABSOLUTE RULE**: All other directories and files are **STRICTLY READ-ONLY**.
   - **CRITICAL ENFORCEMENT**: Before creating, modifying, or deleting ANY file (including test scripts like `.py` or `.ts`), you MUST explicitly verify that the absolute path starts with one of the three allowed paths above. If it does not, you MUST abort the action.

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
