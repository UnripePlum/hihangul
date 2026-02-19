# Service Flow UI Mapping

## Current implemented flow (as of 2026-02-19)

1. Login and Session Entry
- User selects provider on login screen and enters workspace.

2. Session-based Chat Interaction
- User sends prompt in session chat.
- UI message rendering works as session history.

3. File Upload and Viewer Path
- User uploads document from workspace panel.
- For `.hwp/.hwpx`, UI calls agent in this order:
  - `POST /v1/viewer/render-pdf` (primary)
  - `POST /v1/viewer/preview` (fallback)

4. Visual Verification
- Document panel displays PDF or structured/text preview.

5. Launcher and Diff UX
- Launcher panel and diff-oriented workspace UI are present.

## Target flow (planned)

The following flow is target architecture direction (not fully wired in current UI):

1. Intent Input -> 2. Program Construction (`dry_run=true`) -> 3. Explicit Run Trigger -> 4. Local Execution (`dry_run=false`) -> 5. Diff + Persist (`persist_program`)
