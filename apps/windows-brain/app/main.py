from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .auth import AuthGuard
from .auth_profiles import AuthProfileError, AuthProfileStore
from .bridge import ParallelsBridgeClient
from .codex_auth import get_codex_auth_status
from .config import WINDOWS_AGENT_BASE_URL
from .guardrails import GUARDRAIL_POLICY
from .lane_queue import LaneQueueManager, LaneTask
from .memory import HybridMemory
from .models import (
    AuthProfileUpsertRequest,
    AuthProfileView,
    LaneStatusView,
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

    nlu = nlu_engine.parse(user_input)
    plan = planner.build_plan(nlu)
    memory.append_session_message(session_id, "user", user_input)

    snippets = memory.query_recent_knowledge(limit=3)
    search_hits = memory.search_index(keyword=user_input, limit=2)
    session_messages = memory.get_session_messages(session_id=session_id, limit=8)
    session_context = [f"{item['role']}: {item['content']}" for item in session_messages]

    assembled_prompt = prompt_assembler.build_prompt(
        user_input=user_input,
        plan=plan,
        memory_snippets=[*snippets, *search_hits],
        session_context=session_context,
        guardrail_policy=GUARDRAIL_POLICY,
    )
    generated_code = orchestrator.generate_code(assembled_prompt, provider=provider, profile_id=profile_id)

    execution = await bridge.execute_generated_code(
        run_id=run_id,
        code=generated_code,
        adapter=payload["adapter"],
        dry_run=payload["dry_run"],
    )

    package = None
    if payload["persist_program"] and execution.get("status") == "ok":
        package = await bridge.package_program(run_id, plan.title, generated_code)

    memory.append_knowledge(f"- user={user_id} lane={lane_id} task={user_input}")
    memory.append_session_message(session_id, "assistant", f"plan={plan.title} run_id={run_id}")
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
        }
    )
    memory.upsert_index(session_id, user_input)

    return {
        "lane_id": lane_id,
        "session_id": session_id,
        "run_id": run_id,
        "status": "completed",
        "generated_code": generated_code,
        "plan_title": plan.title,
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
