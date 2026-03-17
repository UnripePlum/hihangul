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

    @abstractmethod
    def set_align(self, align: str, scope: str = "all") -> None:
        raise NotImplementedError

    @abstractmethod
    def align_center(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def move_doc_begin(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def move_para_end(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def select_para(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def run_action(self, action_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def create_snapshot(self) -> str:
        """Create a snapshot of the current document state. Returns a snapshot ID."""
        raise NotImplementedError

    @abstractmethod
    def restore_snapshot(self, snapshot_id: str) -> None:
        """Restore the document to a previously created snapshot."""
        raise NotImplementedError

    @abstractmethod
    def get_table_cell_text(self, table_index: int, row: int, col: int) -> str:
        raise NotImplementedError

    @abstractmethod
    def set_table_cell_text(self, table_index: int, row: int, col: int, text: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def get_table_dimensions(self, table_index: int) -> tuple[int, int]:
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
    _snapshots: dict[str, tuple[str, bytes | None]] = field(default_factory=dict)

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

    def set_align(self, align: str, scope: str = "all") -> None:
        if self._active_document_path is None:
            raise HwpControllerStateError("set_align requires an opened document")
        if self._active_document_ext == ".hwpx" and self._active_document_bytes:
            self._active_document_bytes = _hwpx_apply_align(
                self._active_document_bytes,
                scope=scope,
                align=align,
            )
        self._record_operation(f"set_align:{scope}:{align}")

    def align_center(self) -> None:
        self.set_align("center")

    def move_doc_begin(self) -> None:
        if self._active_document_path is None:
            raise HwpControllerStateError("move_doc_begin requires an opened document")
        self._record_operation("move_doc_begin")

    def move_para_end(self) -> None:
        if self._active_document_path is None:
            raise HwpControllerStateError("move_para_end requires an opened document")
        self._record_operation("move_para_end")

    def select_para(self) -> None:
        if self._active_document_path is None:
            raise HwpControllerStateError("select_para requires an opened document")
        self._record_operation("select_para")

    def run_action(self, action_id: str) -> None:
        if self._active_document_path is None:
            raise HwpControllerStateError("run_action requires an opened document")
        self._record_operation(f"run_action:{action_id}")

    def create_snapshot(self) -> str:
        if self._active_document_path is None:
            raise HwpControllerStateError("create_snapshot requires an opened document")
        snapshot_id = f"snap-{len(self._snapshots)}"
        self._snapshots[snapshot_id] = (self._active_document_text, self._active_document_bytes[:] if self._active_document_bytes is not None else None)
        self._record_operation(f"create_snapshot:{snapshot_id}")
        return snapshot_id

    def restore_snapshot(self, snapshot_id: str) -> None:
        if self._active_document_path is None:
            raise HwpControllerStateError("restore_snapshot requires an opened document")
        if snapshot_id not in self._snapshots:
            raise HwpControllerStateError(f"snapshot not found: {snapshot_id}")
        text, doc_bytes = self._snapshots[snapshot_id]
        self._active_document_text = text
        self._active_document_bytes = doc_bytes
        self._record_operation(f"restore_snapshot:{snapshot_id}")

    def get_table_cell_text(self, table_index: int, row: int, col: int) -> str:
        if self._active_document_path is None:
            raise HwpControllerStateError("get_table_cell_text requires an opened document")
        if self._active_document_ext == ".hwpx" and self._active_document_bytes:
            tables = _hwpx_get_tables(self._active_document_bytes)
            if table_index >= len(tables):
                raise HwpControllerStateError(f"table index {table_index} out of range (found {len(tables)} tables)")
            table = tables[table_index]
            if row >= len(table):
                raise HwpControllerStateError(f"row {row} out of range (table has {len(table)} rows)")
            if col >= len(table[row]):
                raise HwpControllerStateError(f"col {col} out of range (row has {len(table[row])} columns)")
            return table[row][col]
        self._record_operation(f"get_table_cell_text:{table_index}:{row}:{col}")
        return ""

    def set_table_cell_text(self, table_index: int, row: int, col: int, text: str) -> None:
        if self._active_document_path is None:
            raise HwpControllerStateError("set_table_cell_text requires an opened document")
        if self._active_document_ext == ".hwpx" and self._active_document_bytes:
            self._active_document_bytes = _hwpx_set_table_cell_text(
                self._active_document_bytes, table_index, row, col, text
            )
        self._record_operation(f"set_table_cell_text:{table_index}:{row}:{col}:{text}")

    def get_table_dimensions(self, table_index: int) -> tuple[int, int]:
        if self._active_document_path is None:
            raise HwpControllerStateError("get_table_dimensions requires an opened document")
        if self._active_document_ext == ".hwpx" and self._active_document_bytes:
            tables = _hwpx_get_tables(self._active_document_bytes)
            if table_index >= len(tables):
                raise HwpControllerStateError(f"table index {table_index} out of range (found {len(tables)} tables)")
            table = tables[table_index]
            rows = len(table)
            cols = max((len(r) for r in table), default=0)
            return (rows, cols)
        self._record_operation(f"get_table_dimensions:{table_index}")
        return (0, 0)

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
        elif scope == "except_first_line":
            first_skipped = False
            def repl_except_first(m: re.Match[str]) -> str:
                nonlocal first_skipped
                body = m.group(1)
                if before not in body:
                    return m.group(0)
                if not first_skipped:
                    first_skipped = True
                    return m.group(0)
                return m.group(0).replace(before, after)
            xml = re.sub(r"(<hp:t[^>]*>.*?</hp:t>)", repl_except_first, xml, flags=re.DOTALL)
        else:
            xml = xml.replace(before, after)
            
        # Strip linesegarray to force dynamic layout recalculation (prevents text overlap)
        xml = re.sub(r"<[^:>]*:linesegarray\b[\s\S]*?</[^:>]*:linesegarray>", "", xml, flags=re.IGNORECASE)
            
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
    charpr_blocks = list(re.finditer(r'<hh:charPr\b[^>]*?\bid="(\d+)"[^>]*(?:/>|>.*?</hh:charPr>)', header_xml, flags=re.DOTALL))
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
    is_self_closing = block.endswith('/>')
    
    if is_self_closing:
        open_tag = block[:-2] + ">"
        body = ""
    else:
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
    
    # Check if charProperties is self-closing
    self_closing_match = re.search(r'<hh:charProperties\b[^>]*/>', header_xml)
    if self_closing_match:
        # replace the self-closing tag with an open/close tag pair containing our new block
        old_tag = self_closing_match.group(0)
        new_tag = old_tag[:-2] + ">" + new_block + "</hh:charProperties>"
        header_xml = header_xml.replace(old_tag, new_tag, 1)
    else:
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
        
        # Strip linesegarray to force dynamic layout recalculation (prevents text overlap on font resize)
        sec_xml = re.sub(r"<[^:>]*:linesegarray\b[\s\S]*?</[^:>]*:linesegarray>", "", sec_xml, flags=re.IGNORECASE)

        tokens = re.split(r'(<[^>]+>)', sec_xml)
        run_stack = []
        p_stack = []
        modified_tokens = set()

        for i, t in enumerate(tokens):
            if t.startswith('<hp:p ') or t == '<hp:p>':
                p_stack.append(i)
            elif t == '</hp:p>':
                if p_stack:
                    p_stack.pop()
            elif t.startswith('<hp:run ') or t == '<hp:run>':
                run_stack.append(i)
            elif t == '</hp:run>':
                if run_stack:
                    run_stack.pop()
            elif t.startswith('<hp:t ') or t == '<hp:t>':
                text_content = ""
                for j in range(i+1, len(tokens)):
                    if tokens[j] == '</hp:t>':
                        break
                    if not tokens[j].startswith('<'):
                        text_content += tokens[j]
                
                text = text_content.strip()
                if text and run_stack:
                    if scope == "first_line" and first_done:
                        continue
                    if scope == "except_first_line" and not first_done:
                        first_done = True
                        continue

                    run_idx = run_stack[-1]
                    if run_idx not in modified_tokens:
                        run_open = tokens[run_idx]
                        id_match = re.search(r'charPrIDRef="(\d+)"', run_open)
                        old_id = None
                        if id_match:
                            old_id = id_match.group(1)
                        elif p_stack:
                            p_open = tokens[p_stack[-1]]
                            p_id_match = re.search(r'charPrIDRef="(\d+)"', p_open)
                            if p_id_match:
                                old_id = p_id_match.group(1)
                                
                        if old_id is not None:
                            if old_id not in id_map:
                                header_xml, new_id = _clone_charpr(
                                    header_xml,
                                    old_id,
                                    bold=bold,
                                    height=height,
                                    family=family,
                                )
                                id_map[old_id] = new_id
                            
                            if id_match:
                                tokens[run_idx] = re.sub(r'charPrIDRef="\d+"', f'charPrIDRef="{id_map[old_id]}"', run_open, count=1)
                            else:
                                if run_open == '<hp:run>':
                                    tokens[run_idx] = f'<hp:run charPrIDRef="{id_map[old_id]}">'
                                else:
                                    tokens[run_idx] = run_open.replace('<hp:run ', f'<hp:run charPrIDRef="{id_map[old_id]}" ', 1)
                        modified_tokens.add(run_idx)
                        
                    if p_stack and scope != "first_line":
                        p_idx = p_stack[-1]
                        if p_idx not in modified_tokens:
                            p_open = tokens[p_idx]
                            p_id_match = re.search(r'charPrIDRef="(\d+)"', p_open)
                            
                            p_old_id = None
                            if p_id_match:
                                p_old_id = p_id_match.group(1)
                            else:
                                run_open = tokens[run_stack[-1]]
                                r_id_match = re.search(r'charPrIDRef="(\d+)"', run_open)
                                if r_id_match:
                                    p_old_id = r_id_match.group(1)

                            if p_old_id is not None:
                                if p_old_id not in id_map:
                                    header_xml, new_id = _clone_charpr(
                                        header_xml,
                                        p_old_id,
                                        bold=bold,
                                        height=height,
                                        family=family,
                                    )
                                    id_map[p_old_id] = new_id
                                
                                if p_id_match:
                                    tokens[p_idx] = re.sub(r'charPrIDRef="\d+"', f'charPrIDRef="{id_map[p_old_id]}"', p_open, count=1)
                                else:
                                    if p_open == '<hp:p>':
                                        tokens[p_idx] = f'<hp:p charPrIDRef="{id_map[p_old_id]}">'
                                    else:
                                        tokens[p_idx] = p_open.replace('<hp:p ', f'<hp:p charPrIDRef="{id_map[p_old_id]}" ', 1)
                            modified_tokens.add(p_idx)
                        
                    if scope == "first_line":
                        first_done = True
                    
        entries[sec_name] = "".join(tokens).encode("utf-8")

    entries[header_name] = header_xml.encode("utf-8")
    return _write_hwpx_entries(entries)


def _clone_parapr(header_xml: str, old_id: str, *, align: str) -> tuple[str, str]:
    parapr_blocks = list(re.finditer(r'<hh:paraPr\b[^>]*?\bid="(\d+)"[^>]*(?:/>|>.*?</hh:paraPr>)', header_xml, flags=re.DOTALL))
    if not parapr_blocks:
        return header_xml, old_id
    max_id = max(int(m.group(1)) for m in parapr_blocks)
    new_id = str(max_id + 1)

    src_match = None
    for m in parapr_blocks:
        if m.group(1) == old_id:
            src_match = m
            break
    if src_match is None:
        return header_xml, old_id

    block = src_match.group(0)
    is_self_closing = block.endswith('/>')
    
    if is_self_closing:
        open_tag = block[:-2] + ">"
        body = ""
    else:
        open_tag_end = block.find(">")
        open_tag = block[: open_tag_end + 1]
        body = block[open_tag_end + 1 : -len("</hh:paraPr>")]

    open_tag = _update_attr(open_tag, "id", new_id)
    
    if align:
        align_match = re.search(r'<hh:align\b[^>]*/>', body)
        if align_match:
            old_align_tag = align_match.group(0)
            new_align_tag = _update_attr(old_align_tag, "horizontal", align.upper())
            body = body.replace(old_align_tag, new_align_tag, 1)
        else:
            align_match_full = re.search(r'<hh:align\b[^>]*>.*?</hh:align>', body, flags=re.DOTALL)
            if align_match_full:
                old_align_tag = align_match_full.group(0)
                open_align_end = old_align_tag.find(">")
                new_open_align = _update_attr(old_align_tag[:open_align_end+1], "horizontal", align.upper())
                body = body.replace(old_align_tag, new_open_align + old_align_tag[open_align_end+1:], 1)
            else:
                body = f'<hh:align horizontal="{align.upper()}" vertical="BASELINE"/>' + body

    new_block = open_tag + body + "</hh:paraPr>"
    
    self_closing_match = re.search(r'<hh:paraProperties\b[^>]*/>', header_xml)
    if self_closing_match:
        old_tag = self_closing_match.group(0)
        new_tag = old_tag[:-2] + ">" + new_block + "</hh:paraProperties>"
        header_xml = header_xml.replace(old_tag, new_tag, 1)
    else:
        insert_pos = header_xml.find("</hh:paraProperties>")
        if insert_pos < 0:
            return header_xml, old_id
        header_xml = header_xml[:insert_pos] + new_block + header_xml[insert_pos:]

    m_count = re.search(r'<hh:paraProperties\b[^>]*itemCnt="(\d+)"', header_xml)
    if m_count:
        new_count = str(int(m_count.group(1)) + 1)
        header_xml = re.sub(
            r'(<hh:paraProperties\b[^>]*itemCnt=")(\d+)(")',
            rf"\g<1>{new_count}\3",
            header_xml,
            count=1,
        )
    return header_xml, new_id


def _hwpx_apply_align(
    hwpx_bytes: bytes,
    *,
    scope: str = "all",
    align: str,
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
        
        # Strip linesegarray to force dynamic layout recalculation (prevents text overlap on align change)
        sec_xml = re.sub(r"<[^:>]*:linesegarray\b[\s\S]*?</[^:>]*:linesegarray>", "", sec_xml, flags=re.IGNORECASE)

        tokens = re.split(r'(<[^>]+>)', sec_xml)
        p_stack = []
        modified_tokens = set()

        for i, t in enumerate(tokens):
            if t.startswith('<hp:p ') or t == '<hp:p>':
                p_stack.append(i)
            elif t == '</hp:p>':
                if p_stack:
                    p_stack.pop()
            elif t.startswith('<hp:t ') or t == '<hp:t>':
                text_content = ""
                for j in range(i+1, len(tokens)):
                    if tokens[j] == '</hp:t>':
                        break
                    if not tokens[j].startswith('<'):
                        text_content += tokens[j]
                
                text = text_content.strip()
                if text and p_stack:
                    if scope == "first_line" and first_done:
                        continue
                    
                    p_idx = p_stack[-1]
                    if p_idx not in modified_tokens:
                        p_open = tokens[p_idx]
                        p_id_match = re.search(r'paraPrIDRef="(\d+)"', p_open)
                        
                        p_old_id = None
                        if p_id_match:
                            p_old_id = p_id_match.group(1)

                        if p_old_id is not None:
                            if p_old_id not in id_map:
                                header_xml, new_id = _clone_parapr(
                                    header_xml,
                                    p_old_id,
                                    align=align,
                                )
                                id_map[p_old_id] = new_id
                            
                            if p_id_match:
                                tokens[p_idx] = re.sub(r'paraPrIDRef="\d+"', f'paraPrIDRef="{id_map[p_old_id]}"', p_open, count=1)
                            else:
                                if p_open == '<hp:p>':
                                    tokens[p_idx] = f'<hp:p paraPrIDRef="{id_map[p_old_id]}">'
                                else:
                                    tokens[p_idx] = p_open.replace('<hp:p ', f'<hp:p paraPrIDRef="{id_map[p_old_id]}" ', 1)
                        modified_tokens.add(p_idx)
                        
                    if scope == "first_line":
                        first_done = True
                    
        entries[sec_name] = "".join(tokens).encode("utf-8")

    entries[header_name] = header_xml.encode("utf-8")
    return _write_hwpx_entries(entries)


def _hwpx_get_tables(hwpx_bytes: bytes) -> list[list[list[str]]]:
    entries = _read_hwpx_entries(hwpx_bytes)
    tables: list[list[list[str]]] = []
    for sec_name in _section_names(entries):
        xml = entries[sec_name].decode("utf-8", errors="ignore")
        for tbl_match in re.finditer(r"<hp:tbl\b[^>]*>(.*?)</hp:tbl>", xml, flags=re.DOTALL):
            tbl_body = tbl_match.group(1)
            table: list[list[str]] = []
            for tr_match in re.finditer(r"<hp:tr\b[^>]*>(.*?)</hp:tr>", tbl_body, flags=re.DOTALL):
                tr_body = tr_match.group(1)
                row: list[str] = []
                for tc_match in re.finditer(r"<hp:tc\b[^>]*>(.*?)</hp:tc>", tr_body, flags=re.DOTALL):
                    tc_body = tc_match.group(1)
                    texts = re.findall(r"<hp:t[^>]*>(.*?)</hp:t>", tc_body, flags=re.DOTALL)
                    cell_text = "".join(re.sub(r"<[^>]+>", "", t) for t in texts).strip()
                    row.append(cell_text)
                table.append(row)
            tables.append(table)
    return tables


def _hwpx_set_table_cell_text(hwpx_bytes: bytes, table_index: int, row: int, col: int, text: str) -> bytes:
    entries = _read_hwpx_entries(hwpx_bytes)
    table_count = 0
    for sec_name in _section_names(entries):
        xml = entries[sec_name].decode("utf-8", errors="ignore")
        modified = False

        def replace_tbl(m: re.Match[str]) -> str:
            nonlocal table_count, modified
            tbl_full = m.group(0)
            if table_count != table_index:
                table_count += 1
                return tbl_full
            table_count += 1
            tbl_body = m.group(1)
            tr_matches = list(re.finditer(r"<hp:tr\b[^>]*>.*?</hp:tr>", tbl_body, flags=re.DOTALL))
            if row >= len(tr_matches):
                return tbl_full
            tr_match = tr_matches[row]
            tr_body = tr_match.group(0)
            tc_matches = list(re.finditer(r"<hp:tc\b[^>]*>.*?</hp:tc>", tr_body, flags=re.DOTALL))
            if col >= len(tc_matches):
                return tbl_full
            tc_match = tc_matches[col]
            tc_full = tc_match.group(0)

            t_match = re.search(r"(<hp:t[^>]*>)(.*?)(</hp:t>)", tc_full, flags=re.DOTALL)
            if t_match:
                new_tc = tc_full[: t_match.start(2)] + text + tc_full[t_match.end(2):]
            else:
                new_tc = tc_full.replace("</hp:tc>", f"<hp:t>{text}</hp:t></hp:tc>", 1)

            new_tr = tr_body[: tc_match.start()] + new_tc + tr_body[tc_match.end():]
            new_tbl = tbl_full[: tr_match.start()] + new_tr + tbl_full[tr_match.end():]
            modified = True
            return new_tbl

        new_xml = re.sub(r"<hp:tbl\b[^>]*>(.*?)</hp:tbl>", replace_tbl, xml, flags=re.DOTALL)
        if modified:
            entries[sec_name] = new_xml.encode("utf-8")
            break
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
