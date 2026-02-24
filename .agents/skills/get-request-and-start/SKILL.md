---
name: get-request-and-start
description: Fetches a newly sent agent request from the main branch, analyzes its target and requirements, and automatically uses generate-branch to set up a new workspace for the target agent.
---

# Get Request and Start Skill

Use this skill when another agent has sent a cross-branch request (e.g., via `send-request`) and it is now available on the `main` branch. This skill automates the process of retrieving the request, understanding what needs to be done, and spinning up a fresh environment for the appropriate agent to tackle the work.

## Prerequisites
- You must be operating in the primary `hihangul` repository directory.
- Another agent must have completed saving and pushing an `agent-request` to the remote `main` branch.

## Instructions

Follow these exact steps to pull the request and spin up the target workspace:

1. **Locate and Read the New Request Document:**
   - Look inside the `docs/agent-requests/` directory to identify the newly sent request file. (It was placed here directly by the other agent).
   - Use the `view_file` tool to thoroughly read the new document. 
   - Pay close attention to the `[TARGET]` inside the document title (e.g., `...->UI-...` or `...->AGENT-...`) to determine which agent module needs to be initialized.

3. **Determine Branch Name:**
   - Based on the request analysis, formulate an appropriate feature branch name following the `feat/<target_module>-<feature-description>` or `fix/<target_module>-<bug-description>` convention (e.g., `feat/ui-stop-404-polling`).

4. **Execute `generate-branch`:**
   - Now that you understand the target module and have a branch name, use the `generate-branch` skill to spawn the isolated workspace.
   - Example flow referencing `generate-branch`:
     - Clone to `../hihangul-feat-ui-stop-404-polling`
     - Checkout the new branch
     - Write the `AGENT_PROMPT.md` using the target module's rules combined with the fetched request's context.

5. **Notify the User:**
   - Use the `notify_user` tool to inform the user that the request was successfully pulled, analyzed, and that a new agent IDE window has been opened for the target module to begin work.
