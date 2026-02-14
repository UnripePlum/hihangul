from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class ProgramPackager:
    storage_root: Path

    def __post_init__(self) -> None:
        self.storage_root.mkdir(parents=True, exist_ok=True)

    def package(self, run_id: str, title: str, code: str) -> dict:
        package_dir = self.storage_root / run_id
        package_dir.mkdir(parents=True, exist_ok=True)

        code_path = package_dir / "workflow.py"
        manifest_path = package_dir / "manifest.json"

        code_path.write_text(code, encoding="utf-8")
        manifest_path.write_text(
            json.dumps(
                {
                    "run_id": run_id,
                    "title": title,
                    "entry": "workflow.py",
                    "version": "0.1.0",
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        return {
            "status": "packaged",
            "package_dir": str(package_dir),
            "manifest_path": str(manifest_path),
        }
