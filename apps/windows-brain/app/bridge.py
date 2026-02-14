from __future__ import annotations

from dataclasses import dataclass

import httpx


@dataclass
class ParallelsBridgeClient:
    windows_agent_base_url: str

    async def execute_generated_code(
        self,
        run_id: str,
        code: str,
        adapter: str,
        dry_run: bool,
    ) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.windows_agent_base_url}/v1/execute",
                json={
                    "run_id": run_id,
                    "code": code,
                    "adapter": adapter,
                    "dry_run": dry_run,
                },
            )
            resp.raise_for_status()
            return resp.json()

    async def package_program(self, run_id: str, title: str, code: str) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.windows_agent_base_url}/v1/package",
                json={"run_id": run_id, "title": title, "code": code},
            )
            resp.raise_for_status()
            return resp.json()
