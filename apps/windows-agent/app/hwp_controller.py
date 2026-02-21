from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
import re
import zipfile
import io
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

    @abstractmethod
    def replace_text(self, before: str, after: str, scope: str = "all") -> None:
        raise NotImplementedError

    @abstractmethod
    def set_bold(self, value: bool = True, scope: str = "all") -> None:
        raise NotImplementedError

    @abstractmethod
    def set_font_size(self, size_pt: int, scope: str = "all") -> None:
        raise NotImplementedError

    @abstractmethod
    def set_font_family(self, family: str, scope: str = "all") -> None:
        raise NotImplementedError


class HwpControllerStateError(ValueError):
    pass


@dataclass
class InMemoryHwpAdapter(HwpController):
    adapter_name: str
    _saved_documents: dict[str, str] = field(default_factory=dict)
    _active_document_path: str | None = None
    _active_document_text: str = ""
    _active_document_bytes: bytes | None = None
    _active_document_ext: str = ""
    _operations: list[str] = field(default_factory=list)

    def open_document(self, path: str) -> None:
        normalized_path = self._normalize_path(path)
        self._active_document_path = normalized_path
        self._active_document_text = self._saved_documents.get(normalized_path, "")
        self._active_document_bytes = None
        self._active_document_ext = Path(normalized_path).suffix.lower()
        source_path = Path(normalized_path)
        if source_path.exists() and source_path.is_file():
            try:
                self._active_document_bytes = source_path.read_bytes()
            except Exception:
                self._active_document_bytes = None
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
        self._persist_to_disk(normalized_path)
        self._active_document_path = normalized_path
        self._record_operation(f"save:{normalized_path}")
        print(f"[{self.adapter_name}] save {normalized_path}")

    def replace_text(self, before: str, after: str, scope: str = "all") -> None:
        if self._active_document_path is None:
            raise HwpControllerStateError("replace_text requires an opened document")
        if not before:
            return
        if self._active_document_ext == ".hwpx" and self._active_document_bytes:
            self._active_document_bytes = _hwpx_replace_text(self._active_document_bytes, before, after, scope=scope)
        else:
            self._active_document_text = self._active_document_text.replace(before, after)
        self._record_operation(f"replace_text:{scope}:{before}->{after}")

    def set_bold(self, value: bool = True, scope: str = "all") -> None:
        if self._active_document_path is None:
            raise HwpControllerStateError("set_bold requires an opened document")
        if self._active_document_ext == ".hwpx" and self._active_document_bytes:
            self._active_document_bytes = _hwpx_apply_style(
                self._active_document_bytes,
                scope=scope,
                bold=value,
            )
        self._record_operation(f"set_bold:{scope}:{1 if value else 0}")

    def set_font_size(self, size_pt: int, scope: str = "all") -> None:
        if self._active_document_path is None:
            raise HwpControllerStateError("set_font_size requires an opened document")
        if self._active_document_ext == ".hwpx" and self._active_document_bytes:
            safe = max(6, min(72, int(size_pt)))
            self._active_document_bytes = _hwpx_apply_style(
                self._active_document_bytes,
                scope=scope,
                height=safe * 100,
            )
        self._record_operation(f"set_font_size:{scope}:{size_pt}")

    def set_font_family(self, family: str, scope: str = "all") -> None:
        if self._active_document_path is None:
            raise HwpControllerStateError("set_font_family requires an opened document")
        if self._active_document_ext == ".hwpx" and self._active_document_bytes:
            self._active_document_bytes = _hwpx_apply_style(
                self._active_document_bytes,
                scope=scope,
                family=(family or "").strip(),
            )
        self._record_operation(f"set_font_family:{scope}:{family}")

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

    def _persist_to_disk(self, normalized_path: str) -> None:
        target = Path(normalized_path)
        # Keep unit-test behavior stable: do not emit files for bare relative names.
        if not target.is_absolute() and str(target.parent) in {"", "."}:
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        if self._active_document_bytes is not None:
            target.write_bytes(self._active_document_bytes)
            return
        target.write_text(self._active_document_text, encoding="utf-8")


def _read_hwpx_entries(hwpx_bytes: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(hwpx_bytes), "r") as zf:
        return {name: zf.read(name) for name in zf.namelist()}


def _write_hwpx_entries(entries: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return out.getvalue()


def _section_names(entries: dict[str, bytes]) -> list[str]:
    return sorted(name for name in entries if name.startswith("Contents/section") and name.endswith(".xml"))


def _extract_run_text(run_body: str) -> str:
    texts = re.findall(r"<hp:t[^>]*>(.*?)</hp:t>", run_body, flags=re.DOTALL)
    if not texts:
        return ""
    joined = "".join(texts)
    return re.sub(r"<[^>]+>", "", joined).strip()


def _hwpx_replace_text(hwpx_bytes: bytes, before: str, after: str, scope: str = "all") -> bytes:
    entries = _read_hwpx_entries(hwpx_bytes)
    replaced_once = False
    for name in _section_names(entries):
        xml = entries[name].decode("utf-8", errors="ignore")
        if scope == "first_line":
            def repl_first(m: re.Match[str]) -> str:
                nonlocal replaced_once
                if replaced_once:
                    return m.group(0)
                body = m.group(1)
                if before not in body:
                    return m.group(0)
                replaced_once = True
                return m.group(0).replace(before, after, 1)
            xml = re.sub(r"(<hp:t[^>]*>.*?</hp:t>)", repl_first, xml, flags=re.DOTALL)
        else:
            xml = xml.replace(before, after)
        entries[name] = xml.encode("utf-8")
    return _write_hwpx_entries(entries)


def _lookup_hangul_font_id(header_xml: str, family: str) -> str | None:
    if not family:
        return None
    # Prefer exact match under HANGUL fontface group.
    face_group = re.search(r'(<hh:fontface\b[^>]*lang="HANGUL"[^>]*>)(.*?)(</hh:fontface>)', header_xml, flags=re.DOTALL)
    if not face_group:
        return None
    body = face_group.group(2)
    pattern = re.compile(r'<hh:font\b[^>]*id="(\d+)"[^>]*face="([^"]+)"[^>]*>', flags=re.IGNORECASE)
    lower = family.lower()
    for m in pattern.finditer(body):
        if m.group(2).strip().lower() == lower:
            return m.group(1)
    # relaxed contains match
    for m in pattern.finditer(body):
        face = m.group(2).strip().lower()
        if lower in face or face in lower:
            return m.group(1)
    return None


def _update_attr(tag_open: str, attr: str, value: str) -> str:
    if re.search(rf'\b{re.escape(attr)}="[^"]*"', tag_open):
        return re.sub(rf'\b{re.escape(attr)}="[^"]*"', f'{attr}="{value}"', tag_open)
    return tag_open[:-1] + f' {attr}="{value}">'


def _clone_charpr(header_xml: str, old_id: str, *, bold: bool | None, height: int | None, family: str | None) -> tuple[str, str]:
    charpr_blocks = list(re.finditer(r'<hh:charPr\b[^>]*id="(\d+)"[^>]*>.*?</hh:charPr>', header_xml, flags=re.DOTALL))
    if not charpr_blocks:
        return header_xml, old_id
    max_id = max(int(m.group(1)) for m in charpr_blocks)
    new_id = str(max_id + 1)

    src_match = None
    for m in charpr_blocks:
        if m.group(1) == old_id:
            src_match = m
            break
    if src_match is None:
        return header_xml, old_id

    block = src_match.group(0)
    open_tag_end = block.find(">")
    open_tag = block[: open_tag_end + 1]
    body = block[open_tag_end + 1 : -len("</hh:charPr>")]
    open_tag = _update_attr(open_tag, "id", new_id)
    if bold is not None:
        open_tag = _update_attr(open_tag, "bold", "1" if bold else "0")
    if height is not None:
        open_tag = _update_attr(open_tag, "height", str(height))
    if family:
        font_id = _lookup_hangul_font_id(header_xml, family)
        if font_id:
            def ref_repl(m: re.Match[str]) -> str:
                ref = m.group(0)
                for k in ["hangul", "latin", "hanja", "japanese", "other", "symbol", "user"]:
                    ref = _update_attr(ref, k, font_id)
                return ref
            body = re.sub(r"<hh:fontRef\b[^>]*/>", ref_repl, body, count=1)

    new_block = open_tag + body + "</hh:charPr>"
    insert_pos = header_xml.find("</hh:charProperties>")
    if insert_pos < 0:
        return header_xml, old_id
    header_xml = header_xml[:insert_pos] + new_block + header_xml[insert_pos:]

    m_count = re.search(r'<hh:charProperties\b[^>]*itemCnt="(\d+)"', header_xml)
    if m_count:
        new_count = str(int(m_count.group(1)) + 1)
        header_xml = re.sub(
            r'(<hh:charProperties\b[^>]*itemCnt=")(\d+)(")',
            rf"\g<1>{new_count}\3",
            header_xml,
            count=1,
        )
    return header_xml, new_id


def _hwpx_apply_style(
    hwpx_bytes: bytes,
    *,
    scope: str = "all",
    bold: bool | None = None,
    height: int | None = None,
    family: str | None = None,
) -> bytes:
    entries = _read_hwpx_entries(hwpx_bytes)
    header_name = "Contents/header.xml"
    if header_name not in entries:
        return hwpx_bytes
    header_xml = entries[header_name].decode("utf-8", errors="ignore")

    id_map: dict[str, str] = {}
    first_done = False

    for sec_name in _section_names(entries):
        sec_xml = entries[sec_name].decode("utf-8", errors="ignore")

        def repl_run(m: re.Match[str]) -> str:
            nonlocal header_xml, first_done
            run_open = m.group(1)
            run_body = m.group(2)
            text = _extract_run_text(run_body)
            if not text:
                return m.group(0)
            if scope == "first_line" and first_done:
                return m.group(0)

            id_match = re.search(r'charPrIDRef="(\d+)"', run_open)
            if not id_match:
                return m.group(0)
            old_id = id_match.group(1)
            if old_id not in id_map:
                header_xml, new_id = _clone_charpr(
                    header_xml,
                    old_id,
                    bold=bold,
                    height=height,
                    family=family,
                )
                id_map[old_id] = new_id
            new_id = id_map[old_id]
            first_done = True if scope == "first_line" else first_done
            run_open_new = re.sub(r'charPrIDRef="(\d+)"', f'charPrIDRef="{new_id}"', run_open, count=1)
            return run_open_new + run_body + "</hp:run>"

        sec_xml = re.sub(r'(<hp:run\b[^>]*>)(.*?)</hp:run>', repl_run, sec_xml, flags=re.DOTALL)
        entries[sec_name] = sec_xml.encode("utf-8")

    entries[header_name] = header_xml.encode("utf-8")
    return _write_hwpx_entries(entries)


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
