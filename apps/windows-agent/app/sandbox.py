from __future__ import annotations

import contextlib
import io
from types import MappingProxyType
from typing import Any

from .hwp_controller import HwpController


SAFE_BUILTINS = MappingProxyType(
    {
        "len": len,
        "range": range,
        "str": str,
        "int": int,
        "float": float,
        "print": print,
        "enumerate": enumerate,
    }
)


def run_workflow(code: str, controller: HwpController, dry_run: bool) -> dict[str, Any]:
    namespace: dict[str, Any] = {"__builtins__": SAFE_BUILTINS}
    stdout = io.StringIO()

    with contextlib.redirect_stdout(stdout):
        exec(code, namespace, namespace)  # noqa: S102
        run_fn = namespace.get("run")
        if not callable(run_fn):
            raise ValueError("Generated code must define callable run(controller)")

        if dry_run:
            print("[dry-run] run(controller) skipped")
        else:
            run_fn(controller)

    return {"stdout": stdout.getvalue().strip(), "dry_run": dry_run}
