from pydantic import BaseModel, Field


class TaskRequest(BaseModel):
    session_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    auth_token: str = Field(min_length=1)
    user_input: str = Field(min_length=1)
    adapter: str = Field(default="pyhwpx", pattern="^(pyhwpx|native)$")
    provider: str = Field(default="claude", pattern="^(claude|codex)$")
    profile_id: str = Field(default="default", min_length=1)
    source_file_path: str | None = None
    source_file_name: str | None = None
    output_file_path: str | None = None
    persist_program: bool = False
    dry_run: bool = False


class RoutedTaskRequest(TaskRequest):
    lane_id: str | None = None


class TaskResult(BaseModel):
    lane_id: str
    session_id: str
    run_id: str
    status: str
    generated_code: str
    nlu_intent: str
    plan_title: str
    plan_steps: list[str]
    plan_directives: list[dict]
    source_file_path: str | None = None
    output_file_path: str | None = None
    session_dir: str | None = None
    execution: dict
    package: dict | None = None


class AuthProfileUpsertRequest(BaseModel):
    profile_id: str = Field(min_length=1)
    provider: str = Field(pattern="^(claude|codex)$")
    auth_mode: str = Field(default="token", pattern="^(token|codex_cli)$")
    token: str | None = None
    metadata: dict = Field(default_factory=dict)


class AuthProfileView(BaseModel):
    profile_id: str
    provider: str
    auth_mode: str
    metadata: dict


class SessionSummaryView(BaseModel):
    session_id: str
    updated_at: str
    message_count: int


class SessionMessageView(BaseModel):
    session_id: str
    role: str
    content: str
    created_at: str


class LaneStatusView(BaseModel):
    lane_id: str
    queued_tasks: int
    worker_started: bool
    active_session_id: str | None = None
    processed_tasks: int = 0
    failed_tasks: int = 0
    last_error: str | None = None


class RunRecordView(BaseModel):
    run_id: str
    lane_id: str
    session_id: str
    user_id: str
    status: str
    plan_title: str
    provider: str
    profile_id: str
    dry_run: bool
    persist_program: bool
    execution: dict | None = None
    package: dict | None = None
    error_message: str | None = None
    created_at: str
    updated_at: str
