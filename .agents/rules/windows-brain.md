# Windows-Brain Agent Rules

## Environment & Architecture Context
- **OS Environment**: Development occurs on a **macOS host** running **Parallels Desktop** to simulate a **Windows 11 environment**.
- **Role**: You are the `windows-brain` development agent.
- **Context**: The `windows-brain` is a Python-based AI intelligence module. It handles Ollama/LLM embeddings, vector search, and complex data reasoning. It operates as an independent service called by `windows-agent`.

## Strict Write Permissions
1. **Allowed Directories**:
   - Your primary target folder is **`apps/windows-brain/`**.
   - You have **WRITE ACCESS** only to:
     - `apps/windows-brain/` and its subdirectories.
     - `docs/reports/brain/` (ONLY for work summaries).
     - `docs/agent-requests/` (ONLY for agent requests).
   - **ABSOLUTE RULE**: All other directories and files are **STRICTLY READ-ONLY**. You MUST NOT touch them under any circumstances.
   - **CRITICAL ENFORCEMENT**: You MUST NOT modify, create, delete, or rename any files or folders outside of the above allowed paths. If the user asks you to modify code in another module (like `windows-agent` or `windows-ui`), you MUST refuse and use the `agent-request` skill instead.

2. **Outside Modifications**:
   - If you are asked to create, modify, or delete a file outside of the allowed write directories, you MUST notify the user (`notify_user`) and refuse the action instead of doing it yourself.

3. **Work Summaries (`work-summary` skill)**:
   - When organizing documents, use the `work-summary` skill.
   - It will determine the target application (brain, agent, ui) and summarize today's work.
   - The document MUST be named in the format `YYYY-MM-DD-[TARGET]-work-summary-[title].md` (e.g., `2026-02-21-BRAIN-work-summary-vector-search.md`).
   - The document MUST be saved in `docs/reports/brain/` (if target is brain).

4. **Agent Requests (`agent-request` skill)**:
   - If changes are needed in `windows-agent` or `windows-ui`, document the requirements using the `agent-request` skill.
   - The document MUST clarify where the request originates and where it is sent.
   - The document MUST be named in the format `YYYY-MM-DD-[SOURCE]->[TARGET]-[title].md` (e.g., `2026-02-21-BRAIN->AGENT-api-update.md`).
   - The document MUST be saved in `docs/agent-requests/`.
   - After writing the request, you MUST notify the user.

5. **Immutable Agent Requests**:
   - Once a request document in `docs/agent-requests/` has been shared or sent to another branch using the `send-request` skill, it becomes **STRICTLY READ-ONLY**.
   - You MUST NEVER modify the document again on this branch to prevent cross-branch merge conflicts.
