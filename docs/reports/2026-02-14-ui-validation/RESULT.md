# HiHangul UI/Architecture Validation Report

Date: 2026-02-14

## 1) Test Summary

- Target: Electron UI (`apps/mac-ui`) + FastAPI architecture scaffold (`apps/mac-brain`, `apps/windows-agent`)
- Result: Partial validation complete (offline static checks passed, runtime dependency install blocked by network)

## 2) Executed Checks

1. Runtime availability
- `node -v` -> `v24.4.0`
- `npm -v` -> `11.4.2`
- `python3 --version` -> `Python 3.9.6`

2. Python syntax compile check
- Command:
  - `PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m compileall apps/mac-brain/app apps/windows-agent/app`
- Result: PASS

3. Python dependency install check (`mac-brain`)
- Command:
  - `cd apps/mac-brain && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
- Result: FAIL (network/DNS)
- Error summary:
  - `Failed to establish a new connection`
  - `Could not find a version that satisfies the requirement fastapi==0.116.1`

4. UI dependency install check (`mac-ui`)
- Command:
  - `cd apps/mac-ui && npm install --verbose`
- Result: FAIL (network/DNS)
- Error summary:
  - `GET https://registry.npmjs.org/react ... ENOTFOUND`

## 3) Implemented Work (This Turn)

- Mac Brain architecture pipeline scaffolded:
  - `AuthGuard`, `LaneQueue`, `NLU`, `Planner`, `Prompt Assembler`, `Bridge`
  - Program persistence trigger (`persist_program`) to Windows packager API
- Windows Agent scaffolded:
  - AST validator 강화, sandbox runner, package endpoint (`/v1/package`)
  - launcher manifest generation (`shared/launcher-programs/<run_id>/manifest.json`)
- Electron UI implemented:
  - Auth/API 입력, Chat 실행, Launcher 상태 패널, Diff(생성 코드) 뷰
  - Electron remote debugging port `9222` 설정

## 4) Core Files

- `apps/mac-brain/app/main.py`
- `apps/mac-brain/app/bridge.py`
- `apps/windows-agent/app/main.py`
- `apps/windows-agent/app/packager.py`
- `apps/mac-ui/src/main/electron.ts`
- `apps/mac-ui/src/renderer/App.tsx`

## 5) Current Blockers

- Offline environment prevents package installation from PyPI/npm registry.
- Because dependencies are missing, full runtime E2E (`npm run dev`, `uvicorn`) could not be executed in this environment.

## 6) Next Run Checklist (when network is available)

1. `scripts/dev/run_windows_agent.sh`
2. `scripts/dev/run_mac_brain.sh`
3. `scripts/dev/run_mac_ui.sh`
4. In Chrome: open `chrome://inspect` and attach to Electron (port `9222`)
5. UI에서 Lane 실행 후 `shared/launcher-programs`에 manifest 생성 확인
