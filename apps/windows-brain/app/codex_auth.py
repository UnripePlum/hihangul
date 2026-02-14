from __future__ import annotations

import shutil
from dataclasses import dataclass


@dataclass
class CodexAuthStatus:
    cli_found: bool
    login_required: bool
    message: str


def get_codex_auth_status() -> CodexAuthStatus:
    # We only check whether codex CLI exists locally.
    # Actual login is performed by user via `codex --login`.
    has_cli = shutil.which("codex") is not None
    if not has_cli:
        return CodexAuthStatus(
            cli_found=False,
            login_required=True,
            message="codex CLI not found. Install Codex CLI and run `codex --login` on this host.",
        )
    return CodexAuthStatus(
        cli_found=True,
        login_required=False,
        message="codex CLI detected. Ensure `codex --login` has been completed on this host.",
    )
