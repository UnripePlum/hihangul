# Agent Request: Implement Launcher and Diff Viewer

**Source**: BRAIN
**Target**: UI
**Date**: 2026-02-21

## Context
The `windows-brain` component now fully supports generating complex automation scripts and routing them to the `windows-agent`. The architecture calls for a transition from a chat-only interface to a more persistent workspace, where automated tasks can be saved as apps and file changes can be reviewed visually.

## Request Description
Please implement the **Persistent Program Launcher** and **Visual Diff Viewer** within the `windows-ui` component (Layer 1) to fulfill the Phase 3 roadmap.

### Required Changes:
1. **Persistent Program Launcher**: 
   - A UI panel that lists packaged programs stored by the `windows-agent` (Local Storage).
   - Allows the user to trigger these saved automated programs with one click, without needing to chat with the LLM again.
2. **Visual Diff Viewer**:
   - For document outputs, especially during `dry_run=true` or verification phases, display a visual diff contrasting the source `input.hwp` and the `output_copy.hwp`.
   - Implement an approval workflow where the user can accept the diff to finalize the save.

## Interaction with Source
The `windows-brain` already supports `dry_run=true` and `persist_program=true` task flags. Implementing these UI features will hook directly into the payload states provided by `windows-brain` in the `/v1/runs` and task resolution objects, bringing the full E2E workflow to life.
