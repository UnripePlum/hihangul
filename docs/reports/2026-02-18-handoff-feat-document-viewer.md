# HiHangul Handoff (feat-document-viewer)

## 1) Current Git State
- Branch: `feat-document-viewer`
- Latest commit: `dd9be8c`
- Commit message: `feat(viewer): add hwp engine pdf rendering and improve document preview UX`

## 2) What Was Implemented

### A. Windows Agent (document viewer backend)
- Added HWP/HWPX preview extraction:
  - `POST /v1/viewer/preview`
  - file: `apps/windows-agent/app/main.py`
  - parser: `apps/windows-agent/app/document_preview.py`

- Added HWP engine PDF rendering endpoint (for near-identical display):
  - `POST /v1/viewer/render-pdf`
  - file: `apps/windows-agent/app/main.py`
  - engine session: `apps/windows-agent/app/engine_render.py`

- Added background warmup / shutdown for HWP COM engine:
  - startup warmup, shutdown cleanup
  - file: `apps/windows-agent/app/main.py`

- Added dependencies:
  - `olefile==0.47`
  - `python-multipart==0.0.20`
  - `pywin32==308; platform_system == "Windows"`
  - file: `apps/windows-agent/requirements.txt`

### B. Windows UI (viewer frontend)
- HWP/HWPX upload flow now calls agent in this order:
  1. `/v1/viewer/render-pdf` (preferred)
  2. fallback `/v1/viewer/preview`

- Added file-loading state UI while preview/render is running.
- Added PDF iframe query to reduce built-in controls.
- Added mac-like scrollbar style.
- files:
  - `apps/windows-ui/src/renderer/App.tsx`
  - `apps/windows-ui/src/preload/preload.ts`
  - `apps/windows-ui/src/renderer/env.d.ts`
  - `apps/windows-ui/src/renderer/styles.css`

### C. Dev Scripts (auto dependency refresh)
- Requirements hash-based reinstall for brain/agent scripts.
- package-lock/package hash-based npm reinstall for ui script.
- files:
  - `scripts/dev/run_windows_agent_windows.cmd`
  - `scripts/dev/run_windows_brain_windows.cmd`
  - `scripts/dev/start_windows_ui_windows.cmd`

## 3) Important Runtime Notes
- The agent must run on Windows for HWP COM rendering.
- HWP engine rendering depends on Hancom Office installation and COM availability.
- If `render-pdf` fails, UI falls back to text/structured preview.

## 4) Known Recent Error + Fix
- Error: `UnicodeEncodeError` in `Content-Disposition` with Korean filename.
- Fix applied: sanitize filename to ASCII-safe before response header.
- file: `apps/windows-agent/app/main.py`

## 5) Immediate Resume Commands
1. `git checkout feat-document-viewer`
2. Start full stack on Windows:
   - `scripts\\dev\\start_hihangul_windows.cmd --sync`
3. Verify agent health:
   - `http://localhost:9000/health`
4. Upload `.hwp` or `.hwpx` from UI and confirm:
   - PDF render path works (primary)
   - fallback preview works when render fails

## 6) Next Recommended Task
- Make “document-only view” deterministic by rasterizing PDF pages in agent and rendering images in UI.
  - 이유: Chromium PDF viewer controls are version/environment dependent.
