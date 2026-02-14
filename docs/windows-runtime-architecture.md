# Windows Runtime Architecture

## Execution Topology

- `apps/windows-ui` runs on Windows (Electron)
- `apps/windows-brain` runs on Windows (FastAPI, localhost:8000)
- `apps/windows-agent` runs on Windows (FastAPI, localhost:9000)

All runtime data flow remains inside Windows localhost.

## Why

- Removes cross-OS API dependency during production runtime.
- Keeps deterministic local execution path for HWP automation.
- Mac remains developer workstation for editing and remote debugging only.
