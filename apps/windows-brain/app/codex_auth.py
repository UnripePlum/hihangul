from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass


@dataclass
class CodexAuthStatus:
    cli_found: bool
    login_required: bool
    message: str


def get_codex_auth_status() -> CodexAuthStatus:
    codex_exe = _resolve_codex_executable()
    has_cli = codex_exe is not None
    if not has_cli:
        return CodexAuthStatus(
            cli_found=False,
            login_required=True,
            message="codex CLI not found. Install Codex CLI and run `codex login` on this host.",
        )

    checks: list[tuple[int, str]] = []
    first_error: str | None = None
    for cmd in _build_status_commands(codex_exe):
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=8,
                check=False,
            )
            output = f"{proc.stdout}\n{proc.stderr}".strip()
            checks.append((proc.returncode, output))
        except Exception as exc:  # noqa: BLE001
            if first_error is None:
                first_error = str(exc)
            continue

    if not checks and first_error:
        return CodexAuthStatus(
            cli_found=True,
            login_required=True,
            message=f"codex login status check failed: {first_error}",
        )

    # Prefer any positive signal from any successful command.
    for returncode, output_raw in checks:
        output = output_raw.lower()
        negative = any(
            token in output
            for token in [
                "not logged in",
                "logged out",
                "login required",
                "please log in",
                "unauthenticated",
            ]
        )
        positive = any(token in output for token in ["logged in", "authenticated", "active account"])
        if returncode == 0 and positive and not negative:
            return CodexAuthStatus(
                cli_found=True,
                login_required=False,
                message=(output_raw[:240] if output_raw else "codex authenticated"),
            )

    # Fall back to first check result for error messaging.
    if checks:
        returncode, output_raw = checks[0]
        output = output_raw.lower()
        negative = any(
            token in output
            for token in [
                "not logged in",
                "logged out",
                "login required",
                "please log in",
                "unauthenticated",
            ]
        )
        if returncode != 0 or negative:
            return CodexAuthStatus(
                cli_found=True,
                login_required=True,
                message=output_raw[:240] if output_raw else "codex CLI found but login is required.",
            )

    return CodexAuthStatus(
        cli_found=True,
        login_required=True,
        message="codex CLI detected but login status is inconclusive. Run `codex login`.",
    )


def _resolve_codex_executable() -> str | None:
    found = shutil.which("codex")
    if found:
        return found

    local = os.environ.get("LocalAppData", "")
    candidates = [
        os.path.join(local, "Programs", "nodejs", "codex.cmd"),
        os.path.join(local, "Programs", "nodejs", "codex.exe"),
        r"C:\Program Files\nodejs\codex.cmd",
        r"C:\Program Files\nodejs\codex.exe",
    ]
    for path in candidates:
        if path and os.path.exists(path):
            return path
    return None


def _build_status_commands(codex_exe: str) -> list[list[str]]:
    commands = [[codex_exe, "login", "status"]]
    if os.name == "nt":
        commands.append(["cmd.exe", "/c", "codex login status"])
    return commands
