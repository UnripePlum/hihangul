---
name: send-request
description: Sends a specific request document from the current branch to another branch (e.g. from brain to ui) without merging conflicts.
---

# Send Request Skill

Use this skill when you have created an agent request document in `docs/agent-requests/` and need to pass it to another agent working on a different branch, while strictly avoiding merge conflicts.

## Prerequisites
- You must have already written and saved the request document in `docs/agent-requests/`.
- You must know your current branch (SOURCE_BRANCH).
- You must know the name of the target branch (TARGET_BRANCH). 

## Instructions

Follow these exact steps using the `run_command` tool to pass the file across branches safely:

1. **Save your file on the current branch.**
   Ensure your new request document is saved in the local `docs/agent-requests/` folder.

2. **Move the Request to the Main Repository.**
   Instead of dealing with git commits and cross-branch checkouts, you will directly **move** the file to the primary `hihangul` repository's `docs/agent-requests/` folder. This ensures the request is safely delivered to `main` and is automatically **deleted** from your local branch folder, preventing any future tracking or sync issues.
   Because you are operating in a sibling directory (e.g., `hihangul-feat-ui-auth-login`), the path to the main repository is `../hihangul/`.
   ```bash
   mv docs/agent-requests/<your_request_file>.md ../hihangul/docs/agent-requests/
   ```

3. **Verify the Copy:**
   Ensure the file successfully arrived in the main repository:
   ```bash
   ls -la ../hihangul/docs/agent-requests/
   ```

4. **Notify the User.**
   Use the `notify_user` tool to inform the user that the request has been securely delivered to the main repository and is ready for the other agent to pick up using the `get-request-and-start` skill.



