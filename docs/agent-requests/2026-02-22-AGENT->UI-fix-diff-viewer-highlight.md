# Agent Request: Fix Diff Viewer Highlighting for Font Size Changes

- **Source:** AGENT (`apps/windows-agent`)
- **Target:** UI (`apps/windows-ui`)
- **Date:** 2026-02-22

## Background
The user noticed that when applying `set_font_size(30, scope='all')` via the Agent, the modified parts of the document do not properly appear highlighted in the Diff Viewer UI. 

Recently, the AGENT team fixed a parser bug in `hwp_controller.py` that caused elements like tables and images to disappear when modifying `<hp:run>` containers. The AGENT now correctly applies style updates without breaking layout components, and the resulting `result.hwpx` correctly reflects the changes in the raw HWPX file.

## Required Changes in `windows-ui`
Since the backend (`windows-agent`) correctly processes the font size modification and appropriately reports bounding box structures in the `preview_document` coordinates, the failure to highlight the diffs accurately lies within the frontend application (`windows-ui` layer). 

Please investigate the Diff Viewer component in `apps/windows-ui`:
1. Verify how the UI receives bounding boxes and text blocks from the AI's `/v1/viewer/preview` or parsing logic.
2. Check if the frontend diffing algorithm (or the canvas drawing logic) fails to identify font-size-only changes as "modified" regions.
3. Ensure that when the agent mutates a document's style without modifying its text content, the UI's diffing engine correctly flags those coordinates as changed and highlights them on the screen.

## Interaction with Source
The AGENT (`apps/windows-agent`) will continue to provide the generated `result.hwpx` and any requested previews through `/v1/viewer/preview`. No further backend API changes are anticipated for this specific issue. 
