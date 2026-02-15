from __future__ import annotations

import ast

GUARDRAIL_POLICY = (
    "You are a safe automation planner. Never generate destructive file, shell, registry, or network code. "
    "Use only the HwpController interface methods: open_document(path), insert_text(text), save_document(path). "
    "Do not import os/subprocess/socket/shutil/pathlib/httpx/requests or call eval/exec/open."
)

_BANNED_IMPORTS = {
    "os",
    "subprocess",
    "socket",
    "shutil",
    "pathlib",
    "httpx",
    "requests",
}

_BANNED_CALLS = {
    "eval",
    "exec",
    "open",
    "compile",
    "__import__",
    "system",
    "popen",
    "remove",
    "unlink",
    "rmtree",
}

_ALLOWED_CONTROLLER_METHODS = {"open_document", "insert_text", "save_document"}


def validate_generated_code(code: str) -> list[str]:
    violations: list[str] = []

    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return [f"syntax_error: {exc.msg} (line {exc.lineno})"]

    has_run = any(isinstance(node, ast.FunctionDef) and node.name == "run" for node in tree.body)
    if not has_run:
        violations.append("missing required function: run(controller)")

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root in _BANNED_IMPORTS:
                    violations.append(f"banned import: {root}")

        if isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if root in _BANNED_IMPORTS:
                violations.append(f"banned import-from: {root}")

        if isinstance(node, ast.Call):
            name = _call_name(node.func)
            if name in _BANNED_CALLS:
                violations.append(f"banned call: {name}")

            # Restrict direct controller usage surface.
            if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
                if node.func.value.id == "controller" and node.func.attr not in _ALLOWED_CONTROLLER_METHODS:
                    violations.append(f"controller method not allowed: {node.func.attr}")

    # Remove duplicates while preserving order.
    seen: set[str] = set()
    deduped: list[str] = []
    for item in violations:
        if item not in seen:
            seen.add(item)
            deduped.append(item)
    return deduped


def _call_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return ""
