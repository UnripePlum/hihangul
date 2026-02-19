# Windows Runtime + Mac Debugger Guide

## Runtime Principle

- Runtime is Windows-only:
  - Electron UI (Windows)
  - Brain API `localhost:8000` (Windows)
  - Windows Agent API `localhost:9000` (Windows)
- macOS is development/debug host only (Chrome DevTools attach).

## 1) Start all services on Windows

From Windows local repo (`C:\dev\hihangul`):

```cmd
scripts\dev\start_hihangul_windows.cmd
```

The starter checks Python first and attempts auto-install via `winget` when missing.

With sync first:

```cmd
scripts\dev\start_hihangul_windows.cmd --sync
```

Stop all runtime windows:

```cmd
scripts\dev\stop_hihangul_windows.cmd
```

This keeps the current CMD window and closes other HiHangul runtime windows.

This launches 3 terminals:

- Brain: `http://localhost:8000`
- Agent: `http://localhost:9000`
- UI: Electron app (`dev:win-vm`)

## 2) Electron remote debug flags

Applied in `apps/windows-ui/src/main/electron.ts` only when:

- dev mode (`VITE_DEV_SERVER_URL` set)
- `HIHANGUL_ENABLE_REMOTE_DEBUGGING=1`

Flags:

- `--remote-debugging-port=9222`
- `--remote-debugging-address=0.0.0.0`
- `--remote-allow-origins=*`

Windows CMD example:

```cmd
set HIHANGUL_ENABLE_REMOTE_DEBUGGING=1
scripts\dev\start_hihangul_windows.cmd --sync
```

## 3) Windows network setup for Mac attach

### 3.1 Check Windows IP

```cmd
ipconfig | findstr IPv4
```

Example: `10.211.55.3`

### 3.2 Firewall allow rule (Admin PowerShell)

```powershell
New-NetFirewallRule -DisplayName "DevTools 9222" -Direction Inbound -LocalPort 9222 -Protocol TCP -Action Allow
```

If your VM network policy still blocks direct inbound access, add portproxy as fallback:

```powershell
netsh interface portproxy add v4tov4 listenaddress=10.211.55.3 listenport=9222 connectaddress=127.0.0.1 connectport=9222
```

## 4) Connect from Mac Chrome

1. Open `chrome://inspect`
2. `Configure...` -> add `10.211.55.3:9222`
3. Click `inspect`

Connection test:

```bash
curl http://10.211.55.3:9222/json
```

## 5) Troubleshooting

### A) Login shows `Failed to fetch`

In Windows terminal, verify:

```cmd
curl http://localhost:8000/health
curl http://localhost:9000/health
```

If fail, restart all:

```cmd
scripts\dev\start_hihangul_windows.cmd
```

If Brain/Agent terminals show `Python was not found`:

```cmd
where py
where python
```

If both fail, install Python (python.org) and enable PATH, then re-run starter.

On first run, Brain/Agent terminals may still be installing Python dependencies.
Wait until Uvicorn startup logs appear, then press `Login`.

### B) Codex login terminal says command not found

`Login` button now installs provider CLI on demand.
If install fails, run manually:

```cmd
npm.cmd install -g @openai/codex
npm.cmd install -g @anthropic-ai/claude-code
```
