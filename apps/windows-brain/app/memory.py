from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path


@dataclass
class HybridMemory:
    root_dir: Path

    def __post_init__(self) -> None:
        self.root_dir.mkdir(parents=True, exist_ok=True)
        self.md_path = self.root_dir / "knowledge.md"
        self.log_path = self.root_dir / "events.jsonl"
        self.db_path = self.root_dir / "vector.db"
        self._init_sqlite()

    def _init_sqlite(self) -> None:
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS memory_index (id INTEGER PRIMARY KEY, key TEXT, value TEXT)"
        )
        conn.commit()
        conn.close()

    def append_knowledge(self, text: str) -> None:
        with self.md_path.open("a", encoding="utf-8") as f:
            f.write(text.strip() + "\n")

    def append_log(self, payload: dict) -> None:
        with self.log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")

    def upsert_index(self, key: str, value: str) -> None:
        conn = sqlite3.connect(self.db_path)
        conn.execute("INSERT INTO memory_index(key, value) VALUES (?, ?)", (key, value))
        conn.commit()
        conn.close()

    def query_recent_knowledge(self, limit: int = 5) -> list[str]:
        if not self.md_path.exists():
            return []
        lines = self.md_path.read_text(encoding="utf-8").splitlines()
        return [line for line in lines if line.strip()][-limit:]

    def search_index(self, keyword: str, limit: int = 5) -> list[str]:
        conn = sqlite3.connect(self.db_path)
        rows = conn.execute(
            "SELECT value FROM memory_index WHERE value LIKE ? ORDER BY id DESC LIMIT ?",
            (f"%{keyword}%", limit),
        ).fetchall()
        conn.close()
        return [row[0] for row in rows]
