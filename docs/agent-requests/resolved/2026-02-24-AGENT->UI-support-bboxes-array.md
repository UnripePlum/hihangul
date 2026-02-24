# Request from AGENT to UI: Support Rendering of Multi-Page `bboxes` Arrays

## Context
A user reported that when a specific paragraph spans across two different PDF pages, the UI is dropping the highlight for the first line(s) of the paragraph. 
Specifically, the user observed that the first line located at the bottom of Page 1 was missing its highlight, while the rest of the paragraph at the top of Page 2 was highlighted perfectly.

## Details of Investigation
The backend (`windows-agent`) properly extracts and outputs an array of bounding boxes for multi-page elements under the `bboxes` property.
As seen in the JSON payload returned by `windows-agent` for the problematic block:
```json
        "bboxes": [
          {
            "page": 1,
            "x": 0.1429,
            "y": 0.8785,  // bottom of page 1
            "w": 0.7142,
            "h": 0.0178,
            "unit": "norm",
            "source": "pdf_exact",
            "score": 1
          },
          {
            "page": 2,
            "x": 0.1429,
            "y": 0.1182,  // top of page 2
            "w": 0.7142,
            "h": 0.0463,
            "unit": "norm",
            "source": "pdf_exact",
            "score": 1
          }
        ]
```
The data object for this paragraph **does have** `bboxes` correctly representing both Page 1 and Page 2.
The single `bbox` property defaults to the *majority page* (in this case, Page 2). 

## Request for UI Component (`windows-ui`)
Please update the frontend Diff Viewer (specifically the text highlighter component overlaying the PDF) to:
1. Iterate over the entire `bboxes` array to render highlight boxes, instead of relying solely on the single `bbox` property.
2. If `block.bboxes` exists and has `length > 0`, the UI MUST map and render *every element* in the array.
3. Fall back to `block.bbox` ONLY if `block.bboxes` is undefined or empty.

This will ensure that all lines of text spanning across a page boundary are visibly highlighted.
