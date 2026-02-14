from pydantic import BaseModel, Field


class TaskRequest(BaseModel):
    session_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    auth_token: str = Field(min_length=1)
    user_input: str = Field(min_length=1)
    adapter: str = Field(default="pyhwpx", pattern="^(pyhwpx|native)$")
    provider: str = Field(default="claude", pattern="^(claude|codex)$")
    profile_id: str = Field(default="default", min_length=1)
    persist_program: bool = False
    dry_run: bool = False


class TaskResult(BaseModel):
    lane_id: str
    session_id: str
    run_id: str
    status: str
    generated_code: str
    plan_title: str
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
