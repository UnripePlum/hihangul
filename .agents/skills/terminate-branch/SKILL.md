---
name: terminate-branch
description: Safely deletes the current project workspace after confirming that its associated Pull Request has been merged. Grants explicit deletion permission for this edge case.
---

# Terminate Branch Skill

Use this skill when you have completed a task in a generated branch workspace (e.g., created via `generate-branch`), successfully submitted a Pull Request, and confirmed that the PR is **MERGED**. 

Since an agent normally lacks permissions to indiscriminately delete project files, this skill grants the **EXPLICIT AUTHORIZATION** to completely remove the isolated directory, but *only* under these strict conditions.

## Prerequisites
- You must currently be inside the isolated project directory (the sibling of the main `.git` repository).
- The Pull Request associated with the current branch MUST be merged or explicitly closed/abandoned by the user.

## Instructions

Follow these exact steps to tear down the workspace:

1. **Verify Merge Status:**
   - Confirm with the user or via GitHub CLI (`gh pr status`) that the work is merged and it is safe to delete this entire folder.
   
2. **Identify the Target Directory:**
   - Run `pwd` to confirm your exact absolute path (e.g., `/Users/.../hihangul-feat-ui-auth-login`).
   - **CRITICAL**: Ensure you are NOT inside the primary `hihangul` repository. You must be in the cloned sibling directory.

3. **Delete the Workspace (Authorized):**
   - Since you have verified the prerequisites, you are hereby authorized to use the `run_command` tool to delete the folder.
   - Run the deletion from the parent directory to avoid "Resource busy" errors.
   ```bash
   cd ..
   rm -rf <ISOLATED_DIRECTORY_NAME>
   ```

4. **Notify the User & Close the IDE:**
   - Use the `notify_user` tool to inform the user that the branch workspace has been successfully and safely terminated.
   - Remind the user that they can now close this specific IDE window (Cursor/Antigravity) and return to the main repository window.
