# Request from AGENT to UI: Stop Polling for Missing/Deleted Documents

## Context
Immediately after a user logs in, the `windows-ui` component aggressively polls the backend for previews or PDF renders of documents that do not exist (e.g. recently deleted documents, old workspace cache, etc). 
This behavior was previously causing a massive flood of HTTP `404 Not Found` network errors in the browser console. 

## Updates Made to Backend (`windows-agent`)
To mitigate the annoying red errors in the devtools console, the `windows-agent` endpoints (`/v1/viewer/preview-from-path` and `/v1/viewer/render-pdf-from-path`) have been updated to return graceful responses when a file is not found:

1. `/v1/viewer/preview-from-path` now returns HTTP 200 OK with the payload:
   ```json
   {
       "ok": false,
       "error": "file_not_found"
   }
   ```
2. `/v1/viewer/render-pdf-from-path` now returns HTTP 204 No Content.

## Request for UI Component (`windows-ui`)
Please update the UI logic that fetches previews/PDF renders:
1. Check the response of the preview endpoints. If the `ok` field is `false` and `error` is `"file_not_found"` (or if the response is `204 No Content` for the PDF render), **the UI MUST IMMEDIATELY STOP polling for that document path**.
2. Clear any active intervals/timers attempting to fetch the missing document, and appropriately update the UI state to reflect that the document is unavailable. This will stop unnecessary load on the backend and frontend.
