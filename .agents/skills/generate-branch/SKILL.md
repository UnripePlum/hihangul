---
name: generate-branch
description: Generates a new branch and creates a single isolated git worktree, launching separate IDE environments pointing to the same root for ui, agent, and brain collaboration.
---

# Generate Branch Skill

Use this skill when you need to start a completely new task/feature in an isolated environment without affecting the current workspace. This skill creates a new branch and sets up a single git worktree. It then opens that worktree in three separate IDE windows with distinct prompt files so all three AI agents can collaborate safely on the same branch.

## Instructions

Follow these exact steps to set up the new branch environment:

1. **Determine the Task Category & Branch Name:**
   - Formulate a clear branch name (e.g., `feat/auth-login` or `fix/hwp-api-scope`).
   - Define the new project root directory name based on the original project and branch (e.g., `../<original-project-name>-<branch-name>`, like `../hihangul-feat-auth-login`).

2. **Sync and Create Worktree:**
   Use the `run_command` tool to execute the following sequence:
   ```bash
   # 1. Switch to main and get the latest updates
   git checkout main
   git pull origin main

   # 2. Create the new branch and set up the worktree
   # Note: BRANCH_NAME is the new branch, TARGET_DIR is the relative dir (e.g. ../hihangul-feat-auth-login)
   git branch <BRANCH_NAME> main
   git worktree add <TARGET_DIR> <BRANCH_NAME>

   # 3. Create distinct prompt files in the root of the worktree
   cat .agents/rules/windows-ui.md > <TARGET_DIR>/UI_PROMPT.md
   echo -e "\n# Task Description\n<Insert UI Task Here>" >> <TARGET_DIR>/UI_PROMPT.md

   cat .agents/rules/windows-agent.md > <TARGET_DIR>/AGENT_PROMPT.md
   echo -e "\n# Task Description\n<Insert Agent Task Here>" >> <TARGET_DIR>/AGENT_PROMPT.md

   cat .agents/rules/windows-brain.md > <TARGET_DIR>/BRAIN_PROMPT.md
   echo -e "\n# Task Description\n<Insert Brain Task Here>" >> <TARGET_DIR>/BRAIN_PROMPT.md

   # 4. Open each application subdirectory and its prompt file in separate IDE windows
   antigravity -n <TARGET_DIR>/apps/windows-ui <TARGET_DIR>/UI_PROMPT.md &
   antigravity -n <TARGET_DIR>/apps/windows-agent <TARGET_DIR>/AGENT_PROMPT.md &
   antigravity -n <TARGET_DIR>/apps/windows-brain <TARGET_DIR>/BRAIN_PROMPT.md &
   ```

3. **Initialize the Codex Agents:**
   - Three separate IDE windows will open, all sharing the same repository root.
   - The user (or the agent) can copy the contents of their respective `*_PROMPT.md` file into the new AI chat session to assume their role.

4. **Notify the User:**
   - Use the `notify_user` tool in the CURRENT window to let the user know that the new workspaces have been spawned, the branch is ready, and they should switch to the new windows.
   - Example message: *"ui, agent, brain을 위한 3개의 별도 작업 공간(IDE 창)이 열렸습니다! 각 창에서 개별 PROMPT 파일을 기반으로 담당 AI를 깨워주세요."*
