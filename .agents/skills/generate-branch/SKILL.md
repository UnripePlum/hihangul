---
name: generate-branch
description: Generates a new branch and creates a single isolated git worktree, launching separate IDE environments for the existing ui, agent, and brain subdirectories.
---

# Generate Branch Skill

Use this skill when you need to start a completely new task/feature in an isolated environment without affecting the current workspace. This skill creates a new branch and sets up a single git worktree. It then opens the `apps/windows-ui`, `apps/windows-agent`, and `apps/windows-brain` directories from that worktree so that all three AI agents can collaborate on the same branch simultaneously.

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

   # 3. Create AGENT_PROMPT.md in each application subdirectory within the worktree
   cat .agents/rules/windows-ui.md > <TARGET_DIR>/apps/windows-ui/AGENT_PROMPT.md
   echo -e "\n# Task Description\n<Insert UI Task Here>" >> <TARGET_DIR>/apps/windows-ui/AGENT_PROMPT.md

   cat .agents/rules/windows-agent.md > <TARGET_DIR>/apps/windows-agent/AGENT_PROMPT.md
   echo -e "\n# Task Description\n<Insert Agent Task Here>" >> <TARGET_DIR>/apps/windows-agent/AGENT_PROMPT.md

   cat .agents/rules/windows-brain.md > <TARGET_DIR>/apps/windows-brain/AGENT_PROMPT.md
   echo -e "\n# Task Description\n<Insert Brain Task Here>" >> <TARGET_DIR>/apps/windows-brain/AGENT_PROMPT.md

   # 4. Open each application subdirectory and its prompt file in separate IDE windows
   if [ -n "$GIT_ASKPASS" ]; then
     open -n -a "${GIT_ASKPASS%%.app/*}.app" <TARGET_DIR>/apps/windows-ui <TARGET_DIR>/apps/windows-ui/AGENT_PROMPT.md
     open -n -a "${GIT_ASKPASS%%.app/*}.app" <TARGET_DIR>/apps/windows-agent <TARGET_DIR>/apps/windows-agent/AGENT_PROMPT.md
     open -n -a "${GIT_ASKPASS%%.app/*}.app" <TARGET_DIR>/apps/windows-brain <TARGET_DIR>/apps/windows-brain/AGENT_PROMPT.md
   else
     code <TARGET_DIR>/apps/windows-ui <TARGET_DIR>/apps/windows-ui/AGENT_PROMPT.md
     code <TARGET_DIR>/apps/windows-agent <TARGET_DIR>/apps/windows-agent/AGENT_PROMPT.md
     code <TARGET_DIR>/apps/windows-brain <TARGET_DIR>/apps/windows-brain/AGENT_PROMPT.md
   fi
   ```

3. **Initialize the Codex Agents:**
   - Three separate IDE windows will open, each rooted in their respective application folder.
   - The user (or the agent) can copy the contents of `AGENT_PROMPT.md` in each respective window to start the AI collaboration.

4. **Notify the User:**
   - Use the `notify_user` tool in the CURRENT window to let the user know that the new workspaces have been spawned, the branch is ready, and they should switch to the new windows.
   - Example message: *"ui, agent, brain을 위한 3개의 별도 작업 공간 창이 열렸습니다! 각 창에서 담당 AI를 깨워주세요."*
