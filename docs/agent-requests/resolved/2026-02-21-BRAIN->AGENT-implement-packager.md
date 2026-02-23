# Agent Request: Implement Program Packager

**Source**: BRAIN
**Target**: AGENT
**Date**: 2026-02-21

## Context
The `windows-brain` component has completed the implementation of Phase 1 and Phase 2 functionalities, successfully generating automated programs (Python scripts) via the LLM orchestrator and executing them through the `windows-agent` bridge.

As part of Phase 3, we aim to introduce a Persistent Program Launcher. To support this, generated scripts need to be persistently packaged and saved so they can be listed and retrieved independently of a chat session.

## Request Description
Please implement the **Program Packager** and **Persistent Local Storage** mechanisms in the `windows-agent` component (Layer 3).

### Required Changes:
1. **Packaging logic**: Create an endpoint or internal service in `windows-agent` to receive a `generated_code` script snippet, wrap it in a standalone executable format (or save it as a structured payload) along with metadata like the `plan_title` and `run_id`.
2. **Persistence**: Ensure these packaged programs are stored reliably in the `LocalStorage` accessible to the Windows host, so the `windows-ui` component can list and launch them directly.
3. **Bridge update**: The `windows-brain` bridge client is already sending requests to package programs when `persist_program=true`. The endpoint in `windows-agent` must be able to handle this correctly.

## Interaction with Source
This change is required so that when `windows-brain` calls `bridge.package_program(run_id, plan_title, generated_code)`, the agent correctly stores the packaged app instead of returning an error or throwing it away. 
