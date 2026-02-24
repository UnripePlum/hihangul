# AGENT -> UI Request: Support Multiple Bounding Boxes (`bboxes` array)

## Context
The `windows-agent` has been upgraded to support paragraphs that span across multiple pages. Previously, the agent only returned a single `bbox` which forced it to choose the "majority page" and abandon highlights for the rest of the text on other pages.

The agent now returns an array of `bboxes` inside the `RichBlock` object for paragraphs that span multiple pages.

## Required Changes
Please update the UI (specifically `App.tsx` and the `RichBlock` type) to support rendering multiple bounding boxes. 

1. **Update `RichBlock` Type**:
   ```typescript
   type RichBlock =
     | { type: 'paragraph'; runs: RichRun[]; bbox?: BlockBBox; bboxes?: BlockBBox[] }
     | { type: 'table'; rows: string[][]; bbox?: BlockBBox; bboxes?: BlockBBox[] };
   ```

2. **Update Diff Viewer Rendering Logic**:
   - In the `changedBboxes` mapping for the `PdfOverlayViewer`, flatMap over `block.bboxes || (block.bbox ? [block.bbox] : [])` instead of just returning `block.bbox`.
   - In the textual Diff Viewer loop that renders the green badge (`p{page} y={y}` or `p{page} x={x} y={y} w={w} h={h}`), iterate over the same array to display all the relevant bounding boxes for a changed block.

## Example
If a paragraph spans page 3 and page 4, the backend will now return:
```json
{
  "type": "paragraph",
  "runs": [...],
  "bbox": { "page": 4, "x": ..., "y": ..., "w": ..., "h": ... },
  "bboxes": [
    { "page": 3, "x": ..., "y": ..., "w": ..., "h": ... },
    { "page": 4, "x": ..., "y": ..., "w": ..., "h": ... }
  ]
}
```

The UI should render highlights on BOTH page 3 and page 4 using the `bboxes` array.

## Impact
This change strictly fixes the bug where text split across page boundaries would lose partial or complete highlight coverage in the UI diff viewer.
