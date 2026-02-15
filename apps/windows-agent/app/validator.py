from __future__ import annotations

import ast


FORBIDDEN_CALLS = {
    "eval",
    "exec",
    "compile",
    "__import__",
    "open",
    "getattr",
    "setattr",
    "delattr",
}

FORBIDDEN_MODULES = {"ctypes", "importlib", "os", "pathlib", "shutil", "socket", "subprocess"}
FORBIDDEN_ATTR_PREFIX = "__"


class UnsafeCodeError(ValueError):
    pass


def validate_python(code: str) -> None:
    tree = ast.parse(code)
    run_fn_node: ast.FunctionDef | None = None

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] in FORBIDDEN_MODULES:
                    raise UnsafeCodeError(f"Forbidden module import: {alias.name}")

        if isinstance(node, ast.ImportFrom):
            if node.module and node.module.split(".")[0] in FORBIDDEN_MODULES:
                raise UnsafeCodeError(f"Forbidden module import: {node.module}")

        if isinstance(node, ast.Call):
            call_name = _resolve_call_name(node.func)
            if call_name in FORBIDDEN_CALLS:
                raise UnsafeCodeError(f"Forbidden call: {call_name}")

        if isinstance(node, ast.Attribute) and node.attr.startswith(FORBIDDEN_ATTR_PREFIX):
            raise UnsafeCodeError(f"Forbidden attribute access: {node.attr}")

        if isinstance(node, ast.FunctionDef) and node.name == "run":
            run_fn_node = node

    if run_fn_node is None:
        raise UnsafeCodeError("Generated code must define run(controller)")

    _validate_run_signature(run_fn_node)


def _resolve_call_name(node: ast.expr) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def _validate_run_signature(run_fn_node: ast.FunctionDef) -> None:
    args = run_fn_node.args
    positional_count = len(args.posonlyargs) + len(args.args)
    if positional_count != 1:
        raise UnsafeCodeError("run(controller) must accept exactly one positional parameter")
    if args.vararg is not None or args.kwarg is not None:
        raise UnsafeCodeError("run(controller) must not use *args or **kwargs")
    if args.defaults:
        raise UnsafeCodeError("run(controller) parameter must not have a default value")
