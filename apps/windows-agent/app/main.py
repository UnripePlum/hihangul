from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException

from .hwp_controller import build_controller
from .models import ExecuteRequest, ExecuteResponse, PackageRequest, PackageResponse
from .packager import ProgramPackager
from .sandbox import WorkflowRuntimeError, run_workflow
from .validator import UnsafeCodeError, validate_python

app = FastAPI(title="HiHangul Windows Agent", version="0.2.0")
packager = ProgramPackager(
    storage_root=Path(__file__).resolve().parents[3] / "shared" / "launcher-programs"
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/v1/debug/chrome")
async def chrome_debug_hint() -> dict:
    return {
        "hint": "Use Electron with --remote-debugging-port=9222 and open chrome://inspect",
        "target": "windows-ui",
    }


@app.post("/v1/execute", response_model=ExecuteResponse)
async def execute(req: ExecuteRequest) -> ExecuteResponse:
    try:
        validate_python(req.code)
    except (SyntaxError, UnsafeCodeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        controller = build_controller(req.adapter)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        result = run_workflow(req.code, controller, req.dry_run)
    except WorkflowRuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return ExecuteResponse(status="ok", run_id=req.run_id, adapter=req.adapter, result=result)


@app.post("/v1/package", response_model=PackageResponse)
async def package_program(req: PackageRequest) -> PackageResponse:
    packaged = packager.package(run_id=req.run_id, title=req.title, code=req.code)
    return PackageResponse(**packaged)
