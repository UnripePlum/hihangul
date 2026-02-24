# USER -> AGENT Request: Fix 404 Preview/Render Errors Post-Login

## Context
Immediately after a successful login in the UI, the `windows-agent` console continuously floods with `404 Not Found` errors for the following endpoints:
- `POST /v1/viewer/render-pdf-from-path`
- `POST /v1/viewer/preview-from-path`

## Expected Issue
The user suspects the UI is attempting to poll or request previews for a session, document, or workspace path that has already been deleted, or the agent is improperly validating the existence of these paths before trying to render/preview them.

## Required Actions
1. **Investigate the `windows-agent` Backend**: Check the route handlers for `/v1/viewer/render-pdf-from-path` and `/v1/viewer/preview-from-path`.
2. **Path Validation**: Ensure that if a requested path does not exist, the agent handles it gracefully rather than throwing continuous 404s (or confirm what is triggering the 404 loop).
3. **Cross-Agent Coordination**: If the bug is actually caused by the `windows-ui` aggressively polling a dead path after login, you may need to write an `agent-request` back to the UI team to stop the polling loop.
4. **Fix**: Implement the fix so the 404 error flood stops upon login.
