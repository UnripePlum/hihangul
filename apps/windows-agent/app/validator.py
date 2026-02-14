from __future__ import annotations

import ast


FORBIDDEN_CALLS = {
    "eval",
    "exec",
    "compile",
    "__import__",
    "open",
}

FORBIDDEN_MODULES = {"os", "subprocess", "shutil", "socket", "pathlib"}
FORBIDDEN_ATTR_PREFIX = "__"


class UnsafeCodeError(ValueError):
    pass


def validate_python(code: str) -> None:
    tree = ast.parse(code)
    has_run = False

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] in FORBIDDEN_MODULES:
                    raise UnsafeCodeError(f"Forbidden module import: {alias.name}")

        if isinstance(node, ast.ImportFrom):
            if node.module and node.module.split(".")[0] in FORBIDDEN_MODULES:
                raise UnsafeCodeError(f"Forbidden module import: {node.module}")

        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in FORBIDDEN_CALLS:
                raise UnsafeCodeError(f"Forbidden call: {node.func.id}")

        if isinstance(node, ast.Attribute) and node.attr.startswith(FORBIDDEN_ATTR_PREFIX):
            raise UnsafeCodeError(f"Forbidden attribute access: {node.attr}")

        if isinstance(node, ast.FunctionDef) and node.name == "run":
            has_run = True

    if not has_run:
        raise UnsafeCodeError("Generated code must define run(controller)")
