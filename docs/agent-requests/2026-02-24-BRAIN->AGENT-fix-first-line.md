# Agent Request: Fix first_line scope bug in _hwpx_apply_style

## Source Application
windows-brain

## Target Application
windows-agent

## Issue Description
A user reported that when they run a command like "첫 줄 글자 크기를 15pt로 만들어" (Make the first line's font size 15pt), the entire document's font size is changed instead of just the first line.

We successfully injected the `SCOPE_GUIDELINE` into the prompt, and the Codex model is correctly calling `controller.set_font_size(15, scope='first_line')`. However, the styling changes still bleed into the whole document or subsequent paragraphs.

## Root Cause Analysis
Upon reviewing the `windows-agent` repository's `app/hwp_controller.py` file, we identified the bug in the `_hwpx_apply_style` function.

```python
def _hwpx_apply_style(
    hwpx_bytes: bytes,
    *,
    scope: str = "all",
    bold: bool | None = None,
    height: int | None = None,
    family: str | None = None,
) -> bytes:
    # ...
    id_map: dict[str, str] = {}
    first_done = False

    for sec_name in _section_names(entries):
        sec_xml = entries[sec_name].decode("utf-8", errors="ignore")
        # ...
        for i, t in enumerate(tokens):
             # ...
             if scope == "first_line" and first_done:
                 continue
             # ... apply styles ...
             if scope == "first_line":
                 first_done = True
```

The bug lies in how `first_done` is handled. `first_done` skips text properties recursively, but the paragraph `p_stack` iterations still process `<hp:p>` nodes further down if they aren't explicitly skipped.

Specifically, in line 452 of `hwp_controller.py`:
```python
                    if p_stack:
                        p_idx = p_stack[-1]
                        if p_idx not in modified_tokens:
                            p_open = tokens[p_idx]
```
Even if `first_done` is evaluated inside the `text and run_stack` block and skips the `<hp:run>` tag, the subsequent tags, like `<hp:p>` characteristics, might still get altered unintentionally if they trigger an attribute match later. 

Furthermore, `pyhwpx` overrides the specific `charPrIDRef` inline in `_hwpx_apply_style`. Since `id_map[p_old_id] = new_id` maps the new character property to the paragraph tag, `charPrIDRef` applies it down to all text contained in the paragraph. While `first_done` breaks from modifying individual `<hp:t>` nodes, paragraphs with text still update the `<hp:p>` element's style. 

Additionally, if the `scope` is `first_line`, replacing paragraph formatting natively with `<hp:p charPrIDRef=...>` will inherently restyle the entire string of text present.

## Requested Action
Please investigate and fix the `first_line` scoping behavior within `hwp_controller.py`. 
Ensure that `first_done` evaluates across document paragraphs properly and doesn't pollute global paragraph references with text styles intended for the first line.
