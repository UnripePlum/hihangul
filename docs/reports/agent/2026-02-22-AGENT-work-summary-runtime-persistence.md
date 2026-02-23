# Work Summary: Agent Runtime Persistence

- **Date:** 2026-02-22
- **Target Area:** AGENT (`apps/windows-agent/`)

## Summary of Completed Tasks
- Investigated `apps/windows-agent/` architecture to locate where agent python code is executed.
- Modified the `/v1/execute` REST API in `apps/windows-agent/app/main.py`.
- Added persistence logic to store the requested `workflow.py` and the execution `result.json` inside a local `apps/windows-agent/runs/<run_id>/` directory.
- Verified the logic locally by running `pytest` against existing tests and triggering the endpoint with `TestClient`.
- Confirmed that the `execute` functionality correctly creates the file structures without breaking existing endpoint behavior.
- Investigated a bug where `set_font_size(30, scope='all')` failed to apply to all text due to nested `<hp:run>` tags inside tables.
- Rewrote the regex-based `_hwpx_apply_style` tag parser in `hwp_controller.py` to use a token-based tag parser, correctly tracking nested runs using a stack.
- Fixed a secondary display layout bug triggered by the previous font size adjustment where modifying textless `<hp:run>` containers containing tables or images broke the HWP layout engine. 
- Refined the token parser to only inject `charPrIDRef` into explicitly text-bearing (`<hp:t>`) `<hp:run>` tags.
- Discovered and fixed an issue causing the frontend Diff Viewer to omit highlights for font size changes. The backend `document_preview.py` parser failed to read cloned font styles because `hwp_controller`'s `_clone_charpr` was not inserting into self-closing `<hh:charProperties/>` root tags. Fixed the clone logic to rewrite self-closing tags correctly, restoring diff highlighting capabilities.
- Fixed a final multi-line diff highlighting gap where `document_preview.py` precisely mapped an entire HTML paragraph to only the *first* matching PDF rendering block. Updated `_inject_precise_bboxes` with a greedy algorithm that unions bounding boxes across all consecutive PDF text blocks that belong to the modified paragraph text.
- Overhauled `_inject_precise_bboxes` sequence matching logic out of penalizing small substring matches. Heavily styled formatting components (e.g. bolded fragments) that get extracted as small chunks by the PDF renderer no longer fail to map against their parent XML paragraph when whitespace differences disrupt direct substring detection.
- Fixed a silent failure in `_clone_charpr` where self-closing `<hh:charPr/>` base styles were ignored by the regex parser `.*?</hh:charPr>`, causing font size style updates to be entirely silently dropped for specifically styled texts (like underlined links or headings). Self-closing tags are now properly matched and expanded when cloned.
- Resolved a critical bounding box matching failure where paragraphs modified with extremely large fonts (e.g. 30pt) visually overlapped with previous paragraphs before PDF line height adjustment could occur. This visual overlap caused the PyMuPDF renderer to spatially sort and extract their text blocks out of logical XML order. Rewrote the linear `cursor` search in `_inject_precise_bboxes` to employ a backward-looking sliding window (`Cursor - 35`), enabling the agent to correctly discover and highlight scrambled PDF elements that appeared earlier in the stream than expected.
- Hardened the backward-looking precise bounding box algorithm against text-fragment stealing. As the backward scanning widened the search scope, later paragraphs could erroneously match and map to PDF text blocks earlier in the stream that were already assigned to earlier identical or highly-similar paragraphs. Introduced a strict `used_pdf_idxs` tracker to prevent multiple HWPX layout nodes from ever sharing the same consumed visual string box, completely restoring lost diff highlights.

## Unresolved Issues
- None.
