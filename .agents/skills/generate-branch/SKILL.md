---
name: generate-branch
description: Generates a new isolated project copy for a specific branch and applies appropriate agent rules (ui/agent/brain/other) using Codex.
---

# Generate Branch Skill

Use this skill when you need to start a completely new task/feature in an isolated environment without affecting the current workspace. This skill clones the current `main` project into a sibling directory, creates a branch, and sets up context for the Codex AI agent.

## Instructions

Follow these exact steps to set up the new branch environment:

1. **Determine the Task Category & Branch Name:**
   - Categorize the task: Is it strictly `ui`, `agent`, `brain`, or `other`?
   - Formulate a clear branch name (e.g., `feat/ui-auth-login`).
   - Define the new project directory name based on the original project and branch (e.g., `../<original-project-name>-<branch-name>`, like `../hihangul-feat-ui-auth-login`).

2. **Sync and Duplicate the Project:**
   Use the `run_command` tool to execute the following sequence:
   ```bash
   # 1. Switch to main and get the latest updates
   git checkout main
   git pull origin main

   # 2. Duplicate the entire project (including .git) to the sibling directory
   # Note: TARGET_DIR should be replaced with the actual relative path, e.g. ../hihangul-feat-ui-auth-login
   cp -R . <TARGET_DIR>

   # 3. Enter the new directory and create the new branch
   cd <TARGET_DIR>
   git checkout -b <BRANCH_NAME>

   # 4. Create an AGENT_PROMPT.md with the rule and task context
   cat << 'EOF' > AGENT_PROMPT.md
   # Rule Context
   <Insert Rule Context Here>

   # Task Description
   <Insert Task Description Here>
   EOF

   # 5. Open the new directory and the prompt file in the current IDE window
   if [ -n "$GIT_ASKPASS" ]; then
     open -a "${GIT_ASKPASS%%.app/*}.app" . AGENT_PROMPT.md
   else
     code . AGENT_PROMPT.md # Fallback
   fi
   ```

3. **Initialize the Codex Agent with the Prompt:**
   - The IDE will open the new project and automatically display `AGENT_PROMPT.md`.
   - The user (or the agent if possible) can simply copy the contents of `AGENT_PROMPT.md` into the new AI chat session.

4. **Notify the User:**
   - Use the `notify_user` tool in the CURRENT window to let the user know that the new project has been spawned, the branch is ready, and they should switch to the new window.
   - Example message: *"새로운 프로젝트 창이 열렸습니다! 새 창에서 Codex(AI)를 켜고 룰(`...md`)과 함께 'OOO 작업을 해주세요'라고 메세지를 시작해주세요."*
