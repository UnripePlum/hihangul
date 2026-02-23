# Agent Request: Fix Regex Parsing for `<hp:run>` Elements

**Source**: BRAIN  
**Target**: AGENT  
**Date**: 2026-02-22  
**Title**: Fix Partial Font Size Application (Nested `<hp:run>`)

## Issue Description
A user reported that when requesting "모든 글자 크기를 30pt로 만들어줘", the font size change was only applied to parts of the document, rather than the entire document despite `scope="all"` being correctly passed to `set_font_size(30, scope="all")`.

Upon inspecting `apps/windows-agent/app/hwp_controller.py`, we identified the root cause in the `_hwpx_apply_style` function. The function uses the following regular expression to parse and replace `<hp:run>` elements:

```python
sec_xml = re.sub(r'(<hp:run\b[^>]*>)(.*?)</hp:run>', repl_run, sec_xml, flags=re.DOTALL)
```

**The Bug**: 
In HWPX XML structures, `<hp:run>` elements can contain nested structure controls, such as tables (`<hp:tbl>`), text boxes, and shapes. These controls contain their own paragraphs (`<hp:p>`) and nested `<hp:run>` elements. 

Because `re.sub` uses the lazy `.*?` quantifier, it matches the *outer* `<hp:run>`'s opening tag, but stops at the *inner* `<hp:run>`'s closing tag (`</hp:run>`). This mismatch completely breaks the XML structure for tables and nested elements, causing the replacements to silently fail or skip large chunks of the document.

## Required Actions
The AGENT team needs to fix the `_hwpx_apply_style`, `_hwpx_replace_text`, and related text extraction functions to safely handle nested `<hp:run>` tags.

**Suggested Solutions**:
1. **(Recommended) Switch to a standard XML Parser**: Use Python's built-in `xml.etree.ElementTree` or `xml.dom.minidom` instead of Regex to locate and mutate `<hp:run>` elements (`charPrIDRef` attributes). This guarantees that nested hierarchies are traversed and updated correctly without breaking tags.
2. **Implement recursive/balanced tag matching**: If an XML parser is too heavy or strips formatting inconsistently, write a custom parsing loop that counts opening `<hp:run>` and closing `</hp:run>` tags to find the correct matching boundary for a single element before yielding it to `repl_run`.

Please review and update `hwp_controller.py`. Once fixed, the `set_font_size` (and `set_bold`, `set_font_family`) functions should successfully apply changes across all document sections, including those inside tables.
