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

    async def enqueue(self, lane_id: str, task: LaneTask, worker_cb) -> Any:
        queue = self._queues[lane_id]
        if lane_id not in self._workers_started:
            self._workers_started.add(lane_id)
            asyncio.create_task(self._lane_worker(lane_id, queue, worker_cb))
        await queue.put(task)
        return await task.future

    async def _lane_worker(self, lane_id: str, queue: asyncio.Queue[LaneTask], worker_cb) -> None:
        while True:
            task = await queue.get()
            try:
                result = await worker_cb(lane_id, task.payload)
                task.future.set_result(result)
            except Exception as exc:  # noqa: BLE001
                task.future.set_exception(exc)
            finally:
                queue.task_done()

