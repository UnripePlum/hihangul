from __future__ import annotations

import contextlib
import io
from types import MappingProxyType
from typing import Any

from .hwp_controller import HwpController


SAFE_BUILTINS = MappingProxyType(
    {
        "bool": bool,
        "dict": dict,
        "len": len,
        "range": range,
        "str": str,
        "int": int,
        "float": float,
        "list": list,
        "max": max,
        "min": min,
        "print": print,
        "enumerate": enumerate,
        "sum": sum,
    }
)


class WorkflowRuntimeError(ValueError):
    pass


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
            try:
                run_fn(controller)
            except Exception as exc:  # pragma: no cover - defensive runtime wrapping
                raise WorkflowRuntimeError(f"Workflow execution failed: {exc}") from exc
    result: dict[str, Any] = {"stdout": stdout.getvalue().strip(), "dry_run": dry_run}
    trace_builder = getattr(controller, "execution_trace", None)
    if callable(trace_builder):
        result["controller_trace"] = trace_builder()
    return result
