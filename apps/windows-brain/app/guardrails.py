from __future__ import annotations

import ast

GUARDRAIL_POLICY = (
    "You are a safe automation planner. Never generate destructive file, shell, registry, or network code. "
    "Use only the HwpController interface methods: open_document(path), insert_text(text), "
    "replace_text(before, after, scope), set_bold(value, scope), set_font_size(size_pt, scope), "
    "set_font_family(family, scope), save_document(path). "
    "Always preserve the original file and save to a different output copy path. "
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

_ALLOWED_CONTROLLER_METHODS = {
    "open_document",
    "insert_text",
    "replace_text",
    "set_bold",
    "set_font_size",
    "set_font_family",
    "save_document",
}


def validate_generated_code(code: str) -> list[str]:
    violations: list[str] = []
    opened_paths: list[str] = []
    saved_paths: list[str] = []

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
                if node.func.value.id == "controller" and node.func.attr in {"open_document", "save_document"}:
                    literal = _first_str_arg(node)
                    if literal:
                        if node.func.attr == "open_document":
                            opened_paths.append(literal)
                        if node.func.attr == "save_document":
                            saved_paths.append(literal)

    if opened_paths and saved_paths:
        opened = {item.strip().lower() for item in opened_paths}
        for save_path in saved_paths:
            if save_path.strip().lower() in opened:
                violations.append("save path must differ from opened source path (original overwrite is forbidden)")

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


def _first_str_arg(node: ast.Call) -> str:
    if not node.args:
        return ""
    arg = node.args[0]
    if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
        return arg.value
    return ""
