from __future__ import annotations

from abc import ABC, abstractmethod


class HwpController(ABC):
    @abstractmethod
    def open_document(self, path: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def insert_text(self, text: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def save_document(self, path: str) -> None:
        raise NotImplementedError


class PyHwpxAdapter(HwpController):
    def open_document(self, path: str) -> None:
        print(f"[pyhwpx] open {path}")

    def insert_text(self, text: str) -> None:
        print(f"[pyhwpx] insert {text}")

    def save_document(self, path: str) -> None:
        print(f"[pyhwpx] save {path}")


class NativeApiAdapter(HwpController):
    def open_document(self, path: str) -> None:
        print(f"[native] open {path}")

    def insert_text(self, text: str) -> None:
        print(f"[native] insert {text}")

    def save_document(self, path: str) -> None:
        print(f"[native] save {path}")


def build_controller(adapter: str) -> HwpController:
    if adapter == "native":
        return NativeApiAdapter()
    return PyHwpxAdapter()
