# Windows Agent Work Summary

- **Date**: 2026-02-24
- **Target Area**: `windows-agent`

## Summary of Tasks Completed
- Investigated `windows-agent` backend in response to 404 errors flooding the console post-login.
- Identified that `windows-ui` was polling endpoints for previews of deleted/missing files, resulting in HTTP 404 Exceptions.
- Defined a `DocumentNotFoundError` exception in `app/main.py`.
- Updated `_read_supported_doc` to raise `DocumentNotFoundError` instead of `HTTPException(404)`.
- Handled `DocumentNotFoundError` in `/v1/viewer/preview-from-path` to gracefully return `{"ok": false, "error": "file_not_found"}`.
- Handled `DocumentNotFoundError` in `/v1/viewer/render-pdf-from-path` to gracefully return `204 No Content`.
- Created an agent-request (`docs/agent-requests/2026-02-24-AGENT->UI-stop-404-polling.md`) asking the `windows-ui` team to detect these new grace formats and immediately stop polling routines when files are unavailable.

## Unresolved Issues
- Cannot test local execution of `render-pdf` natively due to macOS environment; reliance passes onto the CI/CD or the `windows-ui` agent.
