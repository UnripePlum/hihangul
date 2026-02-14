from pydantic import BaseModel, Field


class ExecuteRequest(BaseModel):
    run_id: str = Field(min_length=1)
    code: str = Field(min_length=1)
    adapter: str = Field(default="pyhwpx", pattern="^(pyhwpx|native)$")
    dry_run: bool = False


class ExecuteResponse(BaseModel):
    status: str
    run_id: str
    adapter: str
    result: dict


class PackageRequest(BaseModel):
    run_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    code: str = Field(min_length=1)


class PackageResponse(BaseModel):
    status: str
    package_dir: str
    manifest_path: str
