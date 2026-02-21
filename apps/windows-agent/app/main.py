from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .engine_render import render_to_pdf_via_hwp_engine, shutdown_hwp_engine, warmup_hwp_engine
from .hwp_controller import build_controller
from .document_preview import build_document_preview
from .models import ExecuteRequest, ExecuteResponse, PackageRequest, PackageResponse
from .packager import ProgramPackager
from .sandbox import WorkflowRuntimeError, run_workflow
from .validator import UnsafeCodeError, validate_python

app = FastAPI(title="HiHangul Windows Agent", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
packager = ProgramPackager(
    storage_root=Path(__file__).resolve().parents[3] / "shared" / "launcher-programs"
)


def _read_supported_doc(path_text: str, max_size: int) -> tuple[str, bytes]:
    doc_path = Path(path_text)
    if not doc_path.exists():
        raise HTTPException(status_code=404, detail=f"file not found: {doc_path}")
    if not doc_path.is_file():
        raise HTTPException(status_code=400, detail="path must point to a file")
    ext = doc_path.suffix.lower().lstrip(".")
    if ext not in {"hwp", "hwpx"}:
        raise HTTPException(status_code=400, detail="only .hwp and .hwpx are supported")
    raw = doc_path.read_bytes()
    if len(raw) > max_size:
        raise HTTPException(status_code=413, detail=f"file too large (max {max_size // (1024 * 1024)}MB)")
    return doc_path.name, raw


@app.on_event("startup")
async def startup_warmup() -> None:
    try:
        warmup_hwp_engine()
    except Exception:
        # 한글 엔진이 아직 준비되지 않은 환경(앱 미설치/권한)도 있으므로 부팅을 막지 않는다.
        pass


@app.on_event("shutdown")
async def shutdown_cleanup() -> None:
    try:
        shutdown_hwp_engine()
    except Exception:
        pass


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


@app.post("/v1/viewer/preview")
async def preview_document(file: UploadFile, layout_mode: str = "approx") -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="file name is required")
    ext = file.filename.lower().rsplit(".", 1)[-1] if "." in file.filename else ""
    if ext not in {"hwp", "hwpx"}:
        raise HTTPException(status_code=400, detail="only .hwp and .hwpx are supported")

    raw = await file.read()
    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="file too large (max 25MB)")
    if layout_mode not in {"approx", "precise"}:
        raise HTTPException(status_code=400, detail="layout_mode must be one of: approx, precise")

    try:
        preview = build_document_preview(
            file.filename,
            raw,
            layout_mode=layout_mode,
            render_pdf=render_to_pdf_via_hwp_engine,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"preview extraction failed: {exc}") from exc

    return {
        "ok": True,
        "file_name": file.filename,
        "preview": preview,
    }


@app.post("/v1/viewer/render-pdf")
async def render_pdf(file: UploadFile) -> Response:
    if not file.filename:
        raise HTTPException(status_code=400, detail="file name is required")
    ext = file.filename.lower().rsplit(".", 1)[-1] if "." in file.filename else ""
    if ext not in {"hwp", "hwpx"}:
        raise HTTPException(status_code=400, detail="only .hwp and .hwpx are supported")

    raw = await file.read()
    if len(raw) > 40 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="file too large (max 40MB)")

    try:
        pdf_bytes = render_to_pdf_via_hwp_engine(file.filename, raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"engine render failed: {exc}") from exc

    safe_name = "".join(ch if ch.isascii() and (ch.isalnum() or ch in {"-", "_"}) else "_" for ch in Path(file.filename).stem)
    if not safe_name:
        safe_name = "preview"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{safe_name}.pdf"'},
    )


@app.post("/v1/viewer/preview-from-path")
async def preview_document_from_path(req: dict) -> dict:
    path_text = str(req.get("path") or "").strip()
    layout_mode = str(req.get("layout_mode") or "approx").strip()
    if not path_text:
        raise HTTPException(status_code=400, detail="path is required")
    if layout_mode not in {"approx", "precise"}:
        raise HTTPException(status_code=400, detail="layout_mode must be one of: approx, precise")

    file_name, raw = _read_supported_doc(path_text, max_size=25 * 1024 * 1024)
    try:
        preview = build_document_preview(
            file_name,
            raw,
            layout_mode=layout_mode,
            render_pdf=render_to_pdf_via_hwp_engine,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"preview extraction failed: {exc}") from exc

    return {
        "ok": True,
        "file_name": file_name,
        "preview": preview,
    }


@app.post("/v1/viewer/render-pdf-from-path")
async def render_pdf_from_path(req: dict) -> Response:
    path_text = str(req.get("path") or "").strip()
    if not path_text:
        raise HTTPException(status_code=400, detail="path is required")
    file_name, raw = _read_supported_doc(path_text, max_size=40 * 1024 * 1024)

    try:
        pdf_bytes = render_to_pdf_via_hwp_engine(file_name, raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"engine render failed: {exc}") from exc

    safe_name = "".join(ch if ch.isascii() and (ch.isalnum() or ch in {"-", "_"}) else "_" for ch in Path(file_name).stem)
    if not safe_name:
        safe_name = "preview"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{safe_name}.pdf"'},
    )
