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
        conn.execute(
            "CREATE TABLE IF NOT EXISTS session_messages ("
            "id INTEGER PRIMARY KEY, "
            "session_id TEXT NOT NULL, "
            "role TEXT NOT NULL, "
            "content TEXT NOT NULL, "
            "created_at DATETIME DEFAULT CURRENT_TIMESTAMP"
            ")"
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS run_records ("
            "run_id TEXT PRIMARY KEY, "
            "lane_id TEXT NOT NULL, "
            "session_id TEXT NOT NULL, "
            "user_id TEXT NOT NULL, "
            "status TEXT NOT NULL, "
            "plan_title TEXT NOT NULL, "
            "provider TEXT NOT NULL, "
            "profile_id TEXT NOT NULL, "
            "dry_run INTEGER NOT NULL, "
            "persist_program INTEGER NOT NULL, "
            "execution_json TEXT, "
            "package_json TEXT, "
            "error_message TEXT, "
            "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
            "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP"
            ")"
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

    def append_session_message(self, session_id: str, role: str, content: str) -> None:
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            "INSERT INTO session_messages(session_id, role, content) VALUES (?, ?, ?)",
            (session_id, role, content),
        )
        conn.commit()
        conn.close()

    def get_session_messages(self, session_id: str, limit: int = 50) -> list[dict]:
        conn = sqlite3.connect(self.db_path)
        rows = conn.execute(
            "SELECT session_id, role, content, created_at "
            "FROM session_messages WHERE session_id = ? "
            "ORDER BY id DESC LIMIT ?",
            (session_id, limit),
        ).fetchall()
        conn.close()
        rows = list(reversed(rows))
        return [
            {
                "session_id": row[0],
                "role": row[1],
                "content": row[2],
                "created_at": row[3],
            }
            for row in rows
        ]

    def list_sessions(self, limit: int = 30) -> list[dict]:
        conn = sqlite3.connect(self.db_path)
        rows = conn.execute(
            "SELECT session_id, MAX(created_at) AS updated_at, COUNT(*) AS message_count "
            "FROM session_messages "
            "GROUP BY session_id "
            "ORDER BY updated_at DESC "
            "LIMIT ?",
            (limit,),
        ).fetchall()
        conn.close()
        return [
            {
                "session_id": row[0],
                "updated_at": row[1],
                "message_count": row[2],
            }
            for row in rows
        ]

    def create_run_record(
        self,
        run_id: str,
        lane_id: str,
        session_id: str,
        user_id: str,
        plan_title: str,
        provider: str,
        profile_id: str,
        dry_run: bool,
        persist_program: bool,
    ) -> None:
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            "INSERT INTO run_records("
            "run_id, lane_id, session_id, user_id, status, plan_title, provider, profile_id, dry_run, persist_program"
            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                run_id,
                lane_id,
                session_id,
                user_id,
                "queued",
                plan_title,
                provider,
                profile_id,
                int(dry_run),
                int(persist_program),
            ),
        )
        conn.commit()
        conn.close()

    def finish_run_record(
        self,
        run_id: str,
        *,
        status: str,
        execution: dict | None,
        package: dict | None,
        error_message: str | None,
    ) -> None:
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            "UPDATE run_records "
            "SET status = ?, execution_json = ?, package_json = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP "
            "WHERE run_id = ?",
            (
                status,
                json.dumps(execution, ensure_ascii=False) if execution is not None else None,
                json.dumps(package, ensure_ascii=False) if package is not None else None,
                error_message,
                run_id,
            ),
        )
        conn.commit()
        conn.close()

    def get_run_record(self, run_id: str) -> dict | None:
        conn = sqlite3.connect(self.db_path)
        row = conn.execute(
            "SELECT run_id, lane_id, session_id, user_id, status, plan_title, provider, profile_id, "
            "dry_run, persist_program, execution_json, package_json, error_message, created_at, updated_at "
            "FROM run_records WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        conn.close()
        return self._map_run_row(row) if row else None

    def list_run_records(self, limit: int = 50) -> list[dict]:
        conn = sqlite3.connect(self.db_path)
        rows = conn.execute(
            "SELECT run_id, lane_id, session_id, user_id, status, plan_title, provider, profile_id, "
            "dry_run, persist_program, execution_json, package_json, error_message, created_at, updated_at "
            "FROM run_records ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        conn.close()
        return [self._map_run_row(row) for row in rows]

    def _map_run_row(self, row: tuple) -> dict:
        return {
            "run_id": row[0],
            "lane_id": row[1],
            "session_id": row[2],
            "user_id": row[3],
            "status": row[4],
            "plan_title": row[5],
            "provider": row[6],
            "profile_id": row[7],
            "dry_run": bool(row[8]),
            "persist_program": bool(row[9]),
            "execution": json.loads(row[10]) if row[10] else None,
            "package": json.loads(row[11]) if row[11] else None,
            "error_message": row[12],
            "created_at": row[13],
            "updated_at": row[14],
        }
