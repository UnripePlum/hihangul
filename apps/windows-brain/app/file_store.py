from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import re


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _sanitize_segment(value: str, fallback: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1F]+', "_", (value or "").strip())
    cleaned = cleaned.strip(". ").strip()
    return cleaned[:120] or fallback


def _split_stem_ext(file_name: str) -> tuple[str, str]:
    p = Path(file_name)
    stem = p.stem if p.suffix else p.name
    ext = p.suffix or ""
    return stem, ext


@dataclass
class SessionFileStore:
    root_dir: Path

    def __post_init__(self) -> None:
        self.files_root = self.root_dir / "files"
        self.files_root.mkdir(parents=True, exist_ok=True)
        self.events_file = self.files_root / "events.jsonl"

    def save_upload(self, lane_id: str, session_id: str, original_name: str, content: bytes) -> dict:
        if not content:
            raise ValueError("uploaded file is empty")
        session_dir = self._session_dir(lane_id, session_id)
        uploads_dir = session_dir / "uploads"
        uploads_dir.mkdir(parents=True, exist_ok=True)

        safe_name = _sanitize_segment(original_name, "upload.bin")
        target_name, target_path = self._ensure_unique_name(uploads_dir, safe_name)
        target_path.write_bytes(content)

        meta = {
            "event": "upload_saved",
            "lane_id": lane_id,
            "session_id": session_id,
            "original_name": original_name,
            "stored_name": target_name,
            "stored_path": str(target_path),
            "size": len(content),
            "created_at": _now_iso(),
        }
        self._append_event(meta)
        self._append_session_manifest(session_dir, meta)
        return meta

    def allocate_result_path(self, lane_id: str, session_id: str, source_file_name: str) -> dict:
        session_dir = self._session_dir(lane_id, session_id)
        results_dir = session_dir / "results"
        results_dir.mkdir(parents=True, exist_ok=True)

        safe_source = _sanitize_segment(source_file_name, "document.hwpx")
        stem, ext = _split_stem_ext(safe_source)
        ext = ext or ".hwpx"
        desired = f"{_sanitize_segment(stem, 'document')}_result{ext}"
        result_name, result_path = self._ensure_unique_name(results_dir, desired)

        meta = {
            "event": "result_path_allocated",
            "lane_id": lane_id,
            "session_id": session_id,
            "source_name": source_file_name,
            "result_name": result_name,
            "result_path": str(result_path),
            "created_at": _now_iso(),
        }
        self._append_event(meta)
        self._append_session_manifest(session_dir, meta)
        return {
            "lane_id": lane_id,
            "session_id": session_id,
            "session_dir": str(session_dir),
            "result_file_name": result_name,
            "result_path": str(result_path),
        }

    def _session_dir(self, lane_id: str, session_id: str) -> Path:
        lane = _sanitize_segment(lane_id, "lane")
        session = _sanitize_segment(session_id, "session")
        path = self.files_root / lane / session
        path.mkdir(parents=True, exist_ok=True)
        return path

    def get_original_upload_path(self, lane_id: str, session_id: str) -> str | None:
        """현재 세션의 uploads 디렉터리에서 가장 처음 업로드된 원본 파일 경로를 반환합니다."""
        uploads_dir = self._session_dir(lane_id, session_id) / "uploads"
        if uploads_dir.exists():
            files = sorted([f for f in uploads_dir.iterdir() if f.is_file()])
            if files:
                return str(files[0])
        return None

    def _ensure_unique_name(self, dir_path: Path, desired_name: str) -> tuple[str, Path]:
        stem, ext = _split_stem_ext(desired_name)
        
        # 'xxxx_result_result' 처럼 꼬리표가 중복으로 붙는 것을 방지
        stem = re.sub(r'_result(\s*\(\d+\))?$', '_result', stem)
        stem = _sanitize_segment(stem, "file")
            
        ext = ext or ""
        candidate_name = f"{stem}{ext}"
        candidate_path = dir_path / candidate_name
        
        if not candidate_path.exists():
            return candidate_name, candidate_path
            
        index = 1
        while candidate_path.exists():
            candidate_name = f"{stem} ({index}){ext}"
            candidate_path = dir_path / candidate_name
            index += 1
        return candidate_name, candidate_path

    def _append_event(self, payload: dict) -> None:
        payload = dict(payload)
        payload.setdefault("created_at", _now_iso())
        with self.events_file.open("a", encoding="utf-8") as fp:
            fp.write(json.dumps(payload, ensure_ascii=False) + "\n")

    def _append_session_manifest(self, session_dir: Path, payload: dict) -> None:
        manifest = session_dir / "manifest.md"
        line = (
            f"- {payload.get('created_at', _now_iso())} | {payload.get('event')} | "
            f"{payload.get('stored_name') or payload.get('result_name') or ''} | "
            f"{payload.get('stored_path') or payload.get('result_path') or ''}\n"
        )
        with manifest.open("a", encoding="utf-8") as fp:
            fp.write(line)
