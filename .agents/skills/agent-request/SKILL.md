---
name: agent-request
description: Drafts a request for changes in another module (like windows-agent or windows-ui).
---

# Agent Request Skill

Use this skill when the current agent needs to request changes in `windows-agent` or `windows-ui` (which are outside of its write permissions).

## Instructions
1. Identify the source application (e.g., BRAIN) and the target application (e.g., AGENT or UI).
2. Document exactly what changes are needed, why they are needed, and how they interact with the source application.
3. Create a markdown file named: `YYYY-MM-DD-[SOURCE]->[TARGET]-[title].md`. For example: `2026-02-21-BRAIN->AGENT-update-api.md`.
4. Save the file in `docs/agent-requests/`.
5. After creating the file, you **MUST** notify the user of the cross-agent request.
6. **Immutability Constraint**: Once the file is built and sent via the `send-request` skill, do not modify it again. It becomes strictly read-only to avoid future cross-branch merge conflicts.
