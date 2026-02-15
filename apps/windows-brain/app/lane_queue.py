from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass
from typing import Any


@dataclass
class LaneTask:
    session_id: str
    payload: dict[str, Any]
    future: asyncio.Future


class LaneQueueManager:
    def __init__(self) -> None:
        self._queues: dict[str, asyncio.Queue[LaneTask]] = defaultdict(asyncio.Queue)
        self._workers_started: set[str] = set()
        self._active_session_by_lane: dict[str, str | None] = defaultdict(lambda: None)

    async def enqueue(self, lane_id: str, task: LaneTask, worker_cb) -> Any:
        queue = self._queues[lane_id]
        if lane_id not in self._workers_started:
            self._workers_started.add(lane_id)
            asyncio.create_task(self._lane_worker(lane_id, queue, worker_cb))
        await queue.put(task)
        return await task.future

    def lane_status(self, lane_id: str) -> dict[str, Any]:
        queue = self._queues[lane_id]
        return {
            "lane_id": lane_id,
            "queued_tasks": queue.qsize(),
            "worker_started": lane_id in self._workers_started,
            "active_session_id": self._active_session_by_lane.get(lane_id),
        }

    def all_lane_statuses(self) -> list[dict[str, Any]]:
        lane_ids = sorted(self._queues.keys())
        return [self.lane_status(lane_id) for lane_id in lane_ids]

    async def _lane_worker(self, lane_id: str, queue: asyncio.Queue[LaneTask], worker_cb) -> None:
        while True:
            task = await queue.get()
            self._active_session_by_lane[lane_id] = task.session_id
            try:
                result = await worker_cb(lane_id, task.payload)
                task.future.set_result(result)
            except Exception as exc:  # noqa: BLE001
                task.future.set_exception(exc)
            finally:
                self._active_session_by_lane[lane_id] = None
                queue.task_done()
