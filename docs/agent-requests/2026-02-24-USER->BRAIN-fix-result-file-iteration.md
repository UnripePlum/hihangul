# Request from USER to BRAIN/UI: Fix Result File Iteration Logic

## Context
Currently, when a user submits sequential chat commands to modify a document, the system generates a `_result` file. Subsequent commands seem to be accumulating or applying to this newly generated `_result` file instead of branching from the **original** source file. It also creates files named like `document_result_2.hwpx`.

## Details of Issue
- **Source**: USER feedback.
- **Problem**: 
  1. The user wants to start from the **original** file every time a command is executed, rather than stacking modifications on top of the previous result.
  2. The generated output file name format should be `_result (1)`, `_result (2)`, etc., instead of `_result_2`.

## Request for `windows-brain` and `windows-ui`
Please coordinate to update the file allocation and session state logic:
1. **Naming Convention**: Update the `allocate_result_path` logic (in `file_store.py` for Brain and `electron.ts` for UI) to format the incremental name as `${stem}_result (${index})${ext}` instead of `${stem}_${index}${ext}`.
2. **State Management**: Ensure that when a new modify action is initiated via the UI or Brain, the `source_file` parameter passed down to the pipeline is always explicitly the **original uploaded file**, rather than the currently active `_result` file.
3. This may require updating how `activeFile` is treated in the UI when sending a prompt, ensuring the reference points back to the root `lineageKey` or parent file, rather than whatever is currently displayed.
