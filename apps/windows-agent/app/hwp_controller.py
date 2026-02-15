from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


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


class HwpControllerStateError(ValueError):
    pass


@dataclass
class InMemoryHwpAdapter(HwpController):
    adapter_name: str
    _saved_documents: dict[str, str] = field(default_factory=dict)
    _active_document_path: str | None = None
    _active_document_text: str = ""
    _operations: list[str] = field(default_factory=list)

    def open_document(self, path: str) -> None:
        normalized_path = self._normalize_path(path)
        self._active_document_path = normalized_path
        self._active_document_text = self._saved_documents.get(normalized_path, "")
        self._record_operation(f"open:{normalized_path}")
        print(f"[{self.adapter_name}] open {normalized_path}")

    def insert_text(self, text: str) -> None:
        if self._active_document_path is None:
            raise HwpControllerStateError("insert_text requires an opened document")
        self._active_document_text += str(text)
        self._record_operation(f"insert:{text}")
        print(f"[{self.adapter_name}] insert {text}")

    def save_document(self, path: str) -> None:
        if self._active_document_path is None:
            raise HwpControllerStateError("save_document requires an opened document")
        normalized_path = self._normalize_path(path)
        self._saved_documents[normalized_path] = self._active_document_text
        self._active_document_path = normalized_path
        self._record_operation(f"save:{normalized_path}")
        print(f"[{self.adapter_name}] save {normalized_path}")

    def execution_trace(self) -> dict[str, Any]:
        return {
            "adapter": self.adapter_name,
            "active_document": self._active_document_path,
            "saved_documents": dict(self._saved_documents),
            "operations": list(self._operations),
        }

    @staticmethod
    def _normalize_path(path: str) -> str:
        value = str(path).strip()
        if not value:
            raise HwpControllerStateError("document path must not be empty")
        return value

    def _record_operation(self, operation: str) -> None:
        self._operations.append(operation)


class PyHwpxAdapter(InMemoryHwpAdapter):
    def __init__(self) -> None:
        super().__init__(adapter_name="pyhwpx")


class NativeApiAdapter(InMemoryHwpAdapter):
    def __init__(self) -> None:
        super().__init__(adapter_name="native")


def build_controller(adapter: str) -> HwpController:
    if adapter == "native":
        return NativeApiAdapter()
    if adapter == "pyhwpx":
        return PyHwpxAdapter()
    raise ValueError(f"Unsupported adapter: {adapter}")
