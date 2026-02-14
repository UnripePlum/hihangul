# Service Flow UI Mapping

This UI now follows the secure 5-step flow:

1. Intent Input
- User enters natural language command only.
- No document upload fields are present.

2. Program Construction
- `Build Program (Intent Only)` calls windows-brain with `dry_run=true`.
- Purpose: construct automation logic without local file mutation.

3. User Execution Trigger
- After build, app waits for explicit click on `Run Program (Local Execution)`.

4. Local Execution
- `Run Program` calls windows-brain with `dry_run=false` to execute in local sandbox.

5. Visual Verification
- Generated code/diff panel shown for user confirmation.
- Optional launcher save via `persist_program`.
