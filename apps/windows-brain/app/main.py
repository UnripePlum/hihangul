from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .auth import AuthGuard
from .auth_profiles import AuthProfileError, AuthProfileStore
from .bridge import ParallelsBridgeClient
from .codex_auth import get_codex_auth_status
from .config import WINDOWS_AGENT_BASE_URL
from .file_store import SessionFileStore
from .guardrails import GUARDRAIL_POLICY, validate_generated_code
from .lane_queue import LaneQueueManager, LaneTask
from .memory import HybridMemory
from .models import (
    AuthProfileUpsertRequest,
    AuthProfileView,
    LaneStatusView,
    RoutedTaskRequest,
    RunRecordView,
    SessionMessageView,
    SessionSummaryView,
    TaskRequest,
    TaskResult,
)
from .nlu import NLUEngine
from .orchestrator import LLMOrchestrator
from .planner import AgentPlanner
from .prompt_assembler import PromptAssembler

app = FastAPI(title="HiHangul Windows Brain", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

memory = HybridMemory(
    root_dir=Path(__file__).resolve().parents[3] / "shared" / "memory" / "windows-brain"
)
auth_guard = AuthGuard()
lane_manager = LaneQueueManager()
nlu_engine = NLUEngine()
planner = AgentPlanner()
prompt_assembler = PromptAssembler()
orchestrator = LLMOrchestrator()
bridge = ParallelsBridgeClient(WINDOWS_AGENT_BASE_URL)
auth_profiles = AuthProfileStore(path=memory.root_dir / "auth-profiles.json")
file_store = SessionFileStore(root_dir=memory.root_dir)


def derive_lane_id(user_id: str, session_id: str) -> str:
    # Session Router policy: same (user, session) pair always lands on the same isolated lane.
    return f"{user_id}:{session_id}"


async def process_task(lane_id: str, payload: dict) -> dict:
    run_id = str(uuid4())
    session_id = payload["session_id"]
    user_id = payload["user_id"]
    user_input = payload["user_input"]
    provider = payload["provider"]
    profile_id = payload["profile_id"]

    try:
        profile = auth_profiles.get(profile_id)
    except AuthProfileError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if profile["provider"] != provider:
        raise HTTPException(
            status_code=400,
            detail=f"profile provider mismatch: profile={profile['provider']} request={provider}",
        )
    if provider == "codex" and profile.get("auth_mode") != "codex_cli":
        raise HTTPException(status_code=400, detail="codex profile must use auth_mode=codex_cli")
    if provider == "claude" and not profile.get("token"):
        raise HTTPException(status_code=400, detail="claude profile requires token")

    original_upload_path = file_store.get_original_upload_path(lane_id, session_id)
    if original_upload_path:
        source_file_path = original_upload_path
        source_file_name = Path(source_file_path).name
    else:
        source_file_path = (payload.get("source_file_path") or "").strip()
        source_file_name = (payload.get("source_file_name") or "").strip()
        if not source_file_name:
            source_file_name = Path(source_file_path).name if source_file_path else "input.hwp"

    allocated = file_store.allocate_result_path(
        lane_id=lane_id,
        session_id=session_id,
        source_file_name=source_file_name,
    )
    output_file_path = (payload.get("output_file_path") or "").strip() or allocated["result_path"]
    if not source_file_path:
        source_file_path = "input.hwp"

    snippets = memory.query_recent_knowledge(limit=3)
    search_hits = memory.search_index(keyword=user_input, limit=2)
    session_messages = memory.get_session_messages(session_id=session_id, limit=8)
    session_context = [f"{item['role']}: {item['content']}" for item in session_messages]

    # STEP 1 & 2: Document Structure Identification (Heuristics + sLLM)
    structure_context = ""
    try:
        from .structure_parser import analyze_document_structure
        # In a real scenario, this blocks data should come from `windows-agent` preview API.
        # For now, we mock the block list to simulate parser invocation.
        mock_blocks = [{"type": "paragraph", "runs": [{"text": "보고서 제목"}]}]
        structure_info = analyze_document_structure(mock_blocks)
        
        if structure_info.get("confidence", 0.0) < 0.6:
            structure_info = orchestrator.infer_document_structure_with_sllm(mock_blocks)

        if structure_info.get("title_candidate_index") is not None:
            structure_context = (
                f"- [Structure Analyzer] Title is likely at paragraph index "
                f"{structure_info['title_candidate_index']} (Confidence: {structure_info.get('confidence')}, "
                f"Reason: {structure_info.get('reason')})"
            )
            session_context.append(structure_context)
    except Exception as e:
        print(f"Structure parsing skipped or failed: {e}")

    context_str = "\n".join(session_context)

    nlu = nlu_engine.parse(
        user_input,
        orchestrator=orchestrator,
        provider=provider,
        auth_profile=profile,
        context=context_str
    )
    plan = planner.build_plan(nlu)
    plan.directives = [
        *plan.directives,
        {"op": "source_path", "value": source_file_path},
        {"op": "output_path", "value": output_file_path},
    ]
    memory.append_session_message(session_id, "user", user_input)
    memory.create_run_record(
        run_id=run_id,
        lane_id=lane_id,
        session_id=session_id,
        user_id=user_id,
        plan_title=plan.title,
        provider=provider,
        profile_id=profile_id,
        dry_run=payload["dry_run"],
        persist_program=payload["persist_program"],
    )

    assembled_prompt = prompt_assembler.build_prompt(
        user_input=user_input,
        plan=plan,
        memory_snippets=[*snippets, *search_hits],
        session_context=session_context,
        guardrail_policy=GUARDRAIL_POLICY,
    )
    generated_code = orchestrator.generate_code(
        assembled_prompt,
        provider=provider,
        profile_id=profile_id,
        plan=plan,
        nlu=nlu,
        auth_profile=profile,
    )
    violations = validate_generated_code(generated_code)
    if violations:
        memory.finish_run_record(
            run_id,
            status="rejected",
            execution=None,
            package=None,
            error_message="; ".join(violations),
        )
        memory.append_log(
            {
                "event": "task_rejected",
                "run_id": run_id,
                "lane_id": lane_id,
                "session_id": session_id,
                "user_id": user_id,
                "provider": provider,
                "profile_id": profile_id,
                "violations": violations,
            }
        )
        raise HTTPException(status_code=400, detail={"code_guardrail_violations": violations})

    execution = None
    package = None
    try:
        execution = await bridge.execute_generated_code(
            run_id=run_id,
            code=generated_code,
            adapter=payload["adapter"],
            dry_run=payload["dry_run"],
        )
        if payload["persist_program"] and execution.get("status") == "ok":
            package = await bridge.package_program(run_id, plan.title, generated_code)
    except Exception as exc:  # noqa: BLE001
        message = f"windows-agent bridge error: {exc}"
        memory.finish_run_record(
            run_id,
            status="failed",
            execution=execution,
            package=package,
            error_message=message,
        )
        memory.append_log(
            {
                "event": "task_failed",
                "run_id": run_id,
                "lane_id": lane_id,
                "session_id": session_id,
                "user_id": user_id,
                "provider": provider,
                "profile_id": profile_id,
                "error_message": message,
            }
        )
        raise HTTPException(status_code=502, detail=message) from exc

    memory.append_knowledge(f"- user={user_id} lane={lane_id} intent={nlu.intent} task={user_input}")
    memory.append_session_message(
        session_id,
        "assistant",
        f"run_id={run_id} plan={plan.title} intent={nlu.intent} steps={len(plan.steps)}",
    )
    memory.append_log(
        {
            "event": "task_processed",
            "run_id": run_id,
            "lane_id": lane_id,
            "session_id": session_id,
            "user_id": user_id,
            "intent": nlu.intent,
            "plan_title": plan.title,
            "provider": provider,
            "profile_id": profile_id,
            "persist_program": payload["persist_program"],
            "source_file_path": source_file_path,
            "output_file_path": output_file_path,
        }
    )
    memory.upsert_index(session_id, user_input)
    memory.finish_run_record(
        run_id,
        status="completed",
        execution=execution,
        package=package,
        error_message=None,
    )

    return {
        "lane_id": lane_id,
        "session_id": session_id,
        "run_id": run_id,
        "status": "completed",
        "generated_code": generated_code,
        "nlu_intent": nlu.intent,
        "plan_title": plan.title,
        "plan_steps": plan.steps,
        "plan_directives": plan.directives,
        "source_file_path": source_file_path,
        "output_file_path": output_file_path,
        "session_dir": allocated["session_dir"],
        "execution": execution,
        "package": package,
    }


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "windows_agent": WINDOWS_AGENT_BASE_URL}


@app.get("/v1/auth/codex/status")
async def codex_auth_status() -> dict:
    status = get_codex_auth_status()
    return {
        "cli_found": status.cli_found,
        "login_required": status.login_required,
        "message": status.message,
    }


@app.get("/v1/runs", response_model=list[RunRecordView])
async def list_runs(limit: int = 50) -> list[RunRecordView]:
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be in range 1..500")
    records = memory.list_run_records(limit=limit)
    return [RunRecordView(**item) for item in records]


@app.get("/v1/runs/{run_id}", response_model=RunRecordView)
async def get_run(run_id: str) -> RunRecordView:
    if not run_id.strip():
        raise HTTPException(status_code=400, detail="run_id is required")
    record = memory.get_run_record(run_id)
    if not record:
        raise HTTPException(status_code=404, detail="run record not found")
    return RunRecordView(**record)


@app.get("/v1/sessions", response_model=list[SessionSummaryView])
async def list_sessions(limit: int = 30) -> list[SessionSummaryView]:
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be in range 1..500")
    sessions = memory.list_sessions(limit=limit)
    return [SessionSummaryView(**item) for item in sessions]


@app.get("/v1/sessions/{session_id}/messages", response_model=list[SessionMessageView])
async def session_messages(session_id: str, limit: int = 100) -> list[SessionMessageView]:
    if not session_id.strip():
        raise HTTPException(status_code=400, detail="session_id is required")
    if limit < 1 or limit > 1000:
        raise HTTPException(status_code=400, detail="limit must be in range 1..1000")
    messages = memory.get_session_messages(session_id=session_id, limit=limit)
    return [SessionMessageView(**item) for item in messages]


@app.get("/v1/lanes/status", response_model=list[LaneStatusView])
async def lane_status_list() -> list[LaneStatusView]:
    statuses = lane_manager.all_lane_statuses()
    return [LaneStatusView(**item) for item in statuses]


@app.get("/v1/lanes/{lane_id}/status", response_model=LaneStatusView)
async def lane_status(lane_id: str) -> LaneStatusView:
    if not lane_id.strip():
        raise HTTPException(status_code=400, detail="lane_id is required")
    return LaneStatusView(**lane_manager.lane_status(lane_id))


@app.get("/v1/auth/profiles", response_model=list[AuthProfileView])
async def list_auth_profiles() -> list[AuthProfileView]:
    profiles = auth_profiles.list()
    return [
        AuthProfileView(
            profile_id=item["profile_id"],
            provider=item["provider"],
            auth_mode=item.get("auth_mode", "token"),
            metadata=item.get("metadata", {}),
        )
        for item in profiles
    ]


@app.post("/v1/auth/profiles", response_model=AuthProfileView)
async def upsert_auth_profile(req: AuthProfileUpsertRequest) -> AuthProfileView:
    if req.provider == "codex" and req.auth_mode != "codex_cli":
        raise HTTPException(status_code=400, detail="codex provider must use auth_mode=codex_cli")
    if req.provider == "codex" and req.token:
        raise HTTPException(status_code=400, detail="codex_cli mode does not accept provider token")
    if req.provider == "claude" and req.auth_mode != "token":
        raise HTTPException(status_code=400, detail="claude provider must use auth_mode=token")
    if req.provider == "claude" and not req.token:
        raise HTTPException(status_code=400, detail="claude token is required")

    profile = auth_profiles.upsert(
        profile_id=req.profile_id,
        provider=req.provider,
        auth_mode=req.auth_mode,
        token=req.token,
        metadata=req.metadata,
    )
    return AuthProfileView(
        profile_id=profile["profile_id"],
        provider=profile["provider"],
        auth_mode=profile.get("auth_mode", "token"),
        metadata=profile.get("metadata", {}),
    )


@app.post("/v1/files/upload")
async def upload_session_file(
    session_id: str = Form(...),
    user_id: str = Form(...),
    file: UploadFile = File(...),
) -> dict:
    if not session_id.strip():
        raise HTTPException(status_code=400, detail="session_id is required")
    if not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")
    if not file.filename:
        raise HTTPException(status_code=400, detail="file name is required")
    raw = await file.read()
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="file is empty")
    if len(raw) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="file too large (max 50MB)")

    lane_id = derive_lane_id(user_id, session_id)
    saved = file_store.save_upload(
        lane_id=lane_id,
        session_id=session_id,
        original_name=file.filename,
        content=raw,
    )
    return {
        "ok": True,
        "lane_id": lane_id,
        "session_id": session_id,
        "stored_file_name": saved["stored_name"],
        "stored_path": saved["stored_path"],
        "session_dir": str(Path(saved["stored_path"]).parent.parent),
        "size": saved["size"],
    }


@app.post("/v1/files/allocate-result")
async def allocate_result_path(req: dict) -> dict:
    session_id = str(req.get("session_id") or "").strip()
    user_id = str(req.get("user_id") or "").strip()
    source_file_name = str(req.get("source_file_name") or "").strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    if not source_file_name:
        raise HTTPException(status_code=400, detail="source_file_name is required")

    lane_id = derive_lane_id(user_id, session_id)
    allocated = file_store.allocate_result_path(
        lane_id=lane_id,
        session_id=session_id,
        source_file_name=source_file_name,
    )
    return {"ok": True, **allocated}


@app.post("/v1/lanes/{lane_id}/tasks", response_model=TaskResult)
async def enqueue_task(lane_id: str, req: TaskRequest) -> TaskResult:
    if not lane_id.strip():
        raise HTTPException(status_code=400, detail="lane_id is required")
    if not auth_guard.authorize(req.auth_token):
        raise HTTPException(status_code=401, detail="invalid auth token")
    if not auth_guard.allow_lane(req.user_id, lane_id):
        raise HTTPException(status_code=403, detail="lane isolation rule mismatch")

    loop = asyncio.get_running_loop()
    fut = loop.create_future()
    result = await lane_manager.enqueue(
        lane_id,
        LaneTask(session_id=req.session_id, payload=req.model_dump(), future=fut),
        process_task,
    )
    return TaskResult(**result)


@app.post("/v1/tasks", response_model=TaskResult)
async def enqueue_task_routed(req: RoutedTaskRequest) -> TaskResult:
    lane_id = req.lane_id or derive_lane_id(req.user_id, req.session_id)
    if not auth_guard.authorize(req.auth_token):
        raise HTTPException(status_code=401, detail="invalid auth token")
    if not auth_guard.allow_lane(req.user_id, lane_id):
        raise HTTPException(status_code=403, detail="lane isolation rule mismatch")

    loop = asyncio.get_running_loop()
    fut = loop.create_future()
    result = await lane_manager.enqueue(
        lane_id,
        LaneTask(session_id=req.session_id, payload=req.model_dump(), future=fut),
        process_task,
    )
    return TaskResult(**result)
