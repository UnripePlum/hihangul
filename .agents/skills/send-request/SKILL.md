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

1. **Commit your file on the current branch.**
   ```bash
   git add docs/agent-requests/<your_request_file>.md
   git commit -m "chore: create agent request for <target>"
   ```
2. **Switch to the target branch.**
   ```bash
   git checkout <TARGET_BRANCH>
   ```
3. **Checkout ONLY the specific request file from your source branch.** 
   This safely brings the file into the target branch without attempting a full merge, avoiding conflicts!
   ```bash
   git checkout <SOURCE_BRANCH> -- docs/agent-requests/<your_request_file>.md
   ```
4. **Commit the file on the target branch.**
   ```bash
   git commit -m "chore: receive agent request from <SOURCE_BRANCH>"
   ```
5. **Return to your original branch to continue your work.**
   ```bash
   git checkout <SOURCE_BRANCH>
   ```
6. **Notify the User.**
   Use the `notify_user` tool to inform the user that the request has been securely delivered to the alternative branch and is ready for the other agent to pick up.
7. **Lock the File (CRITICAL).**
   Once the file has been successfully sent to the target branch, consider it **LOCKED and STRICTLY READ-ONLY**. Do not make any further edits or additions to this specific file in the source branch to prevent future merge conflicts.
