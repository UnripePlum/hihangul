from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


class AuthProfileError(ValueError):
    pass


@dataclass
class AuthProfileStore:
    path: Path

    def __post_init__(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text(json.dumps({"profiles": {}}, indent=2), encoding="utf-8")

    def _read(self) -> dict:
        return json.loads(self.path.read_text(encoding="utf-8"))

    def _write(self, payload: dict) -> None:
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def upsert(
        self,
        profile_id: str,
        provider: str,
        auth_mode: str,
        token: str | None,
        metadata: dict,
    ) -> dict:
        payload = self._read()
        now = datetime.now(timezone.utc).isoformat()
        profile = {
            "profile_id": profile_id,
            "provider": provider,
            "auth_mode": auth_mode,
            "token": token,
            "metadata": metadata,
            "updated_at": now,
        }
        payload.setdefault("profiles", {})[profile_id] = profile
        self._write(payload)
        return profile

    def get(self, profile_id: str) -> dict:
        payload = self._read()
        profile = payload.get("profiles", {}).get(profile_id)
        if profile is None:
            raise AuthProfileError(f"auth profile not found: {profile_id}")
        return profile

    def list(self) -> list[dict]:
        payload = self._read()
        return list(payload.get("profiles", {}).values())
