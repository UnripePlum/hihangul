---
name: generate-branch
description: Generates a new branch and creates isolated git worktrees for ui, agent, and brain, launching separate IDE environments for each agent.
---

# Generate Branch Skill

Use this skill when you need to start a completely new task/feature in an isolated environment without affecting the current workspace. This skill creates a new branch and sets up concurrent git worktrees for `ui`, `agent`, and `brain` so that all three AI agents can collaborate on the same branch simultaneously.

## Instructions

Follow these exact steps to set up the new branch environment:

1. **Determine the Task Category & Branch Name:**
   - Formulate a clear branch name (e.g., `feat/auth-login` or `fix/hwp-api-scope`).
   - Define the new project root directory name based on the original project and branch (e.g., `../<original-project-name>-<branch-name>`, like `../hihangul-feat-auth-login`).

2. **Sync and Create Worktrees:**
   Use the `run_command` tool to execute the following sequence:
   ```bash
   # 1. Switch to main and get the latest updates
   git checkout main
   git pull origin main

   # 2. Create the new branch and set up the root directory for worktrees
   # Note: BRANCH_NAME is the new branch, TARGET_DIR is the relative dir (e.g. ../hihangul-feat-auth-login)
   git branch <BRANCH_NAME> main
   mkdir -p <TARGET_DIR>

   # 3. Add worktrees for each agent
   git worktree add <TARGET_DIR>/ui <BRANCH_NAME>
   git worktree add <TARGET_DIR>/agent <BRANCH_NAME>
   git worktree add <TARGET_DIR>/brain <BRANCH_NAME>

   # 4. Create AGENT_PROMPT.md in each worktree
   cat .agents/rules/windows-ui.md > <TARGET_DIR>/ui/AGENT_PROMPT.md
   echo -e "\n# Task Description\n<Insert UI Task Here>" >> <TARGET_DIR>/ui/AGENT_PROMPT.md

   cat .agents/rules/windows-agent.md > <TARGET_DIR>/agent/AGENT_PROMPT.md
   echo -e "\n# Task Description\n<Insert Agent Task Here>" >> <TARGET_DIR>/agent/AGENT_PROMPT.md

   cat .agents/rules/windows-brain.md > <TARGET_DIR>/brain/AGENT_PROMPT.md
   echo -e "\n# Task Description\n<Insert Brain Task Here>" >> <TARGET_DIR>/brain/AGENT_PROMPT.md

   # 5. Open each worktree directory and the prompt file in separate IDE windows
   if [ -n "$GIT_ASKPASS" ]; then
     open -n -a "${GIT_ASKPASS%%.app/*}.app" <TARGET_DIR>/ui <TARGET_DIR>/ui/AGENT_PROMPT.md
     open -n -a "${GIT_ASKPASS%%.app/*}.app" <TARGET_DIR>/agent <TARGET_DIR>/agent/AGENT_PROMPT.md
     open -n -a "${GIT_ASKPASS%%.app/*}.app" <TARGET_DIR>/brain <TARGET_DIR>/brain/AGENT_PROMPT.md
   else
     code <TARGET_DIR>/ui <TARGET_DIR>/ui/AGENT_PROMPT.md
     code <TARGET_DIR>/agent <TARGET_DIR>/agent/AGENT_PROMPT.md
     code <TARGET_DIR>/brain <TARGET_DIR>/brain/AGENT_PROMPT.md
   fi
   ```

3. **Initialize the Codex Agents:**
   - Three separate IDE windows will open.
   - The user (or the agent) can copy the contents of `AGENT_PROMPT.md` in each respective window to start the AI collaboration.

4. **Notify the User:**
   - Use the `notify_user` tool in the CURRENT window to let the user know that the new workspaces have been spawned, the branch is ready, and they should switch to the new windows.
   - Example message: *"ui, agent, brain을 위한 3개의 별도 작업 공간(Worktree) 창이 열렸습니다! 각 창에서 담당 AI를 깨워주세요."*
