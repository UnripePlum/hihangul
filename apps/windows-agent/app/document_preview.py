from __future__ import annotations

from collections.abc import Callable
from difflib import SequenceMatcher
import io
import re
import zipfile
import zlib
from pathlib import PurePosixPath

import olefile

HWPTAG_PARA_TEXT = 67


def _get_attr(attrs: str, names: list[str]) -> str:
    for name in names:
        pattern = rf"\b{name}\s*=\s*(['\"])(.*?)\1"
        match = re.search(pattern, attrs, flags=re.IGNORECASE)
        if match:
            return match.group(2).strip()
    return ""


def _normalize_preview(text: str, max_chars: int = 8000) -> tuple[str, bool]:
    squashed = re.sub(r"\r\n?", "\n", text)
    squashed = re.sub(r"[ \t]+\n", "\n", squashed)
    squashed = re.sub(r"\n{3,}", "\n\n", squashed).strip()
    truncated = len(squashed) > max_chars
    return (squashed[:max_chars] if truncated else squashed, truncated)


def _clean_xml_text(raw: str) -> str:
    text = re.sub(r"<[^>]+>", " ", raw)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _normalize_match_text(raw: str) -> str:
    text = raw.lower()
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"[^0-9a-z가-힣 ]+", "", text)
    return text


def _block_plain_text(block: dict[str, object]) -> str:
    if block.get("type") == "table":
        rows = block.get("rows", [])
        if isinstance(rows, list):
            return "\n".join(" | ".join(str(c) for c in row) for row in rows if isinstance(row, list))
        return ""
    runs = block.get("runs", [])
    if not isinstance(runs, list):
        return ""
    return " ".join(str(run.get("text", "")) for run in runs if isinstance(run, dict)).strip()


def _extract_pdf_text_blocks(pdf_bytes: bytes) -> list[dict[str, object]]:
    # Fast path: PyMuPDF (if available)
    try:
        import fitz  # type: ignore
        blocks: list[dict[str, object]] = []
        with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
            for page_index, page in enumerate(doc):
                width = float(page.rect.width or 1.0)
                height = float(page.rect.height or 1.0)
                raw_blocks = page.get_text("blocks") or []
                for item in raw_blocks:
                    # x0, y0, x1, y1, text, block_no, block_type
                    if len(item) < 5:
                        continue
                    x0, y0, x1, y1, text = item[:5]
                    text_s = str(text or "").strip()
                    if not text_s:
                        continue
                    blocks.append(
                        {
                            "page": page_index + 1,
                            "x": max(0.0, min(1.0, float(x0) / width)),
                            "y": max(0.0, min(1.0, float(y0) / height)),
                            "w": max(0.0, min(1.0, float(x1 - x0) / width)),
                            "h": max(0.0, min(1.0, float(y1 - y0) / height)),
                            "text": text_s,
                        }
                    )
        if blocks:
            return blocks
    except Exception:
        pass

    # Fallback path: pdfminer.six (pure-python, slower but broadly available)
    try:
        from pdfminer.high_level import extract_pages  # type: ignore
        from pdfminer.layout import LTTextContainer  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("Neither PyMuPDF nor pdfminer.six is available for precise layout mode") from exc

    blocks: list[dict[str, object]] = []
    for page_index, page_layout in enumerate(extract_pages(io.BytesIO(pdf_bytes))):
        width = float(getattr(page_layout, "width", 1.0) or 1.0)
        height = float(getattr(page_layout, "height", 1.0) or 1.0)
        for element in page_layout:
            if not isinstance(element, LTTextContainer):
                continue
            text_s = element.get_text().strip()
            if not text_s:
                continue
            x0, y0, x1, y1 = element.bbox
            # pdfminer uses bottom-left origin; convert to top-left normalized y
            top = max(0.0, min(1.0, 1.0 - (float(y1) / height)))
            blocks.append(
                {
                    "page": page_index + 1,
                    "x": max(0.0, min(1.0, float(x0) / width)),
                    "y": top,
                    "w": max(0.0, min(1.0, float(x1 - x0) / width)),
                    "h": max(0.0, min(1.0, float(y1 - y0) / height)),
                    "text": text_s,
                }
            )
    return blocks


def _inject_precise_bboxes(blocks: list[dict[str, object]], pdf_blocks: list[dict[str, object]]) -> int:
    if not blocks or not pdf_blocks:
        return 0
    assigned = 0
    cursor = 0
    for block in blocks:
        target = _normalize_match_text(_block_plain_text(block))
        if not target:
            continue
        best_idx = -1
        best_score = 0.0
        # Keep locality to reduce wrong matches.
        for idx in range(cursor, min(len(pdf_blocks), cursor + 24)):
            cand = _normalize_match_text(str(pdf_blocks[idx].get("text", "")))
            if not cand:
                continue
            if target in cand or cand in target:
                score = 1.0
            else:
                score = SequenceMatcher(None, target[:300], cand[:300]).ratio()
            if score > best_score:
                best_score = score
                best_idx = idx
        if best_idx < 0 or best_score < 0.45:
            continue
        matched = pdf_blocks[best_idx]
        block["bbox"] = {
            "page": int(matched["page"]),
            "x": round(float(matched["x"]), 4),
            "y": round(float(matched["y"]), 4),
            "w": round(float(matched["w"]), 4),
            "h": round(float(matched["h"]), 4),
            "unit": "norm",
            "source": "pdf_exact",
            "score": round(best_score, 3),
        }
        assigned += 1
        cursor = best_idx + 1
    return assigned


def _parse_hwpx_face_names(header_xml: str) -> dict[str, str]:
    names: dict[str, str] = {}
    for idx, match in enumerate(re.finditer(r"<[^>]*faceName\b([^>]*)/?>", header_xml, flags=re.IGNORECASE)):
        attrs = match.group(1) or ""
        key = _get_attr(attrs, ["id", "faceNameID", "idRef", "fontID"]) or str(idx)
        name = _get_attr(attrs, ["name", "fontName", "faceName"])
        if name:
            names[key] = name
    return names


def _parse_hwpx_char_styles(header_xml: str) -> dict[str, dict[str, object]]:
    styles: dict[str, dict[str, object]] = {}
    face_names = _parse_hwpx_face_names(header_xml)
    matches = re.finditer(r"<[^>]*charPr\b([^>]*)/?>", header_xml, flags=re.IGNORECASE)
    for idx, match in enumerate(matches):
        attrs = match.group(1) or ""
        key = _get_attr(attrs, ["id", "charPrID", "charPrId"]) or str(idx)
        height_raw = _get_attr(attrs, ["height", "charHeight", "fontSize"])
        bold_raw = _get_attr(attrs, ["bold", "fontBold"])
        height = int(height_raw) if height_raw.isdigit() else 1000
        # HWPX height is commonly in 1/100 pt-ish units in practice.
        font_px = max(12, min(32, int((height / 100.0) * 1.3)))
        bold = False
        if bold_raw:
            bold_value = bold_raw.strip().lower()
            bold = bold_value in {"1", "true", "t", "yes", "y"}
        family = _get_attr(attrs, ["fontName", "faceName", "font"])
        if not family:
            # Common HWPX refs such as hangeulFaceNameIdRef / latinFaceNameIdRef / fontRef
            ref = _get_attr(
                attrs,
                [
                    "hangeulFaceNameIdRef",
                    "latinFaceNameIdRef",
                    "hanjaFaceNameIdRef",
                    "japaneseFaceNameIdRef",
                    "otherFaceNameIdRef",
                    "symbolFaceNameIdRef",
                    "userFaceNameIdRef",
                    "fontRef",
                ],
            )
            if ref:
                family = face_names.get(ref, "")
        if not family:
            family = "Malgun Gothic"
        styles[key] = {"font_size_px": font_px, "bold": bold, "font_family": family}
    return styles


def _extract_hwpx_rich(
    file_bytes: bytes,
    *,
    layout_mode: str = "approx",
    render_pdf: Callable[[str, bytes], bytes] | None = None,
    file_name: str = "document.hwpx",
) -> dict[str, object]:
    blocks: list[dict[str, object]] = []
    text_accum: list[str] = []
    char_styles: dict[str, dict[str, object]] = {}

    def parse_table_block(tbl_xml: str) -> dict[str, object] | None:
        rows: list[list[str]] = []
        for tr_xml in re.findall(r"<[^:>]*:tr\b[\s\S]*?</[^:>]*:tr>", tbl_xml, flags=re.IGNORECASE):
            cols: list[str] = []
            for tc_xml in re.findall(r"<[^:>]*:tc\b[\s\S]*?</[^:>]*:tc>", tr_xml, flags=re.IGNORECASE):
                cell_texts = re.findall(r"<[^:>]*:t\b[^>]*>([\s\S]*?)</[^:>]*:t>", tc_xml, flags=re.IGNORECASE)
                cell = _clean_xml_text(" ".join(cell_texts))
                cols.append(cell)
            if cols:
                rows.append(cols)
        if not rows:
            return None
        for row in rows:
            text_accum.append(" | ".join(row))
        return {"type": "table", "rows": rows}

    def parse_paragraph_block(p_xml: str) -> dict[str, object] | None:
        p_open = re.search(r"<[^:>]*:p\b([^>]*)>", p_xml, flags=re.IGNORECASE)
        p_attrs = p_open.group(1) if p_open else ""
        paragraph_char_id = _get_attr(p_attrs, ["charPrIDRef"])
        runs: list[dict[str, object]] = []
        for run_xml in re.findall(r"<[^:>]*:run\b[\s\S]*?</[^:>]*:run>", p_xml, flags=re.IGNORECASE):
            run_attr = re.search(r"<[^:>]*:run\b([^>]*)>", run_xml, flags=re.IGNORECASE)
            attrs = run_attr.group(1) if run_attr else ""
            char_id = _get_attr(attrs, ["charPrIDRef"]) or paragraph_char_id
            t_nodes = re.findall(r"<[^:>]*:t\b[^>]*>([\s\S]*?)</[^:>]*:t>", run_xml, flags=re.IGNORECASE)
            text = _clean_xml_text(" ".join(t_nodes))
            if not text:
                continue
            style = char_styles.get(char_id, {"font_size_px": 16, "bold": False, "font_family": "Malgun Gothic"})
            runs.append(
                {
                    "text": text,
                    "font_size_px": style["font_size_px"],
                    "bold": style["bold"],
                    "font_family": style["font_family"],
                }
            )
        if not runs:
            return None
        text_accum.append(" ".join([str(run["text"]) for run in runs]))
        return {"type": "paragraph", "runs": runs}

    def parse_section(xml_text: str) -> None:
        block_pattern = re.compile(
            r"<(?P<tag>[^:>]*:(?:tbl|p))\b[\s\S]*?</(?P=tag)>",
            flags=re.IGNORECASE,
        )
        for match in block_pattern.finditer(xml_text):
            tag = (match.group("tag") or "").lower()
            block_xml = match.group(0)
            if tag.endswith(":tbl"):
                table_block = parse_table_block(block_xml)
                if table_block:
                    blocks.append(table_block)
                continue
            paragraph_block = parse_paragraph_block(block_xml)
            if paragraph_block:
                blocks.append(paragraph_block)

    with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
        style_files = [
            "Contents/header.xml",
            "Contents/styles.xml",
            "Contents/style.xml",
            "styles.xml",
            "header.xml",
        ]
        merged_styles: dict[str, dict[str, object]] = {}
        for style_name in style_files:
            if style_name not in zf.namelist():
                continue
            try:
                style_xml = zf.read(style_name).decode("utf-8", errors="ignore")
                merged_styles.update(_parse_hwpx_char_styles(style_xml))
            except Exception:  # noqa: BLE001
                continue
        if merged_styles:
            char_styles = merged_styles

        section_files = sorted(
            [
                name
                for name in zf.namelist()
                if PurePosixPath(name).match("Contents/section*.xml")
            ]
        )
        target_files = section_files or [name for name in zf.namelist() if name.endswith(".xml")]
        for name in target_files[:30]:
            try:
                data = zf.read(name).decode("utf-8", errors="ignore")
            except Exception:  # noqa: BLE001
                continue
            parse_section(data)

    plain_text = "\n\n".join(text_accum)
    content, truncated = _normalize_preview(plain_text)
    if not content:
        content = "문서에서 표시 가능한 텍스트를 찾지 못했습니다."
    if truncated and blocks:
        # blocks가 매우 커질 때 렌더링 보호
        blocks = blocks[:120]

    # Default: approximate normalized layout anchors for downstream overlay/highlight rendering.
    # Coordinate space: page in 1-based index, x/y/w/h in [0, 1].
    def estimate_block_height(block: dict[str, object]) -> float:
        if block.get("type") == "table":
            rows = block.get("rows", [])
            row_count = len(rows) if isinstance(rows, list) else 1
            return min(0.24, max(0.05, 0.03 * max(1, row_count)))
        runs = block.get("runs", [])
        if not isinstance(runs, list) or not runs:
            return 0.045
        text_len = sum(len(str(run.get("text", ""))) for run in runs if isinstance(run, dict))
        estimated_lines = max(1, min(8, text_len // 26 + 1))
        return min(0.22, max(0.04, 0.028 * estimated_lines))

    layout_version = "approx-v1"
    precise_assigned = 0
    if layout_mode == "precise" and render_pdf is not None:
        try:
            pdf_bytes = render_pdf(file_name, file_bytes)
            pdf_blocks = _extract_pdf_text_blocks(pdf_bytes)
            precise_assigned = _inject_precise_bboxes(blocks, pdf_blocks)
            if precise_assigned > 0:
                layout_version = "pdf-exact-v1"
        except Exception:
            # fallback to approximate below
            precise_assigned = 0

    if precise_assigned == 0:
        page = 1
        cursor_y = 0.08
        for block in blocks:
            h = estimate_block_height(block)
            if cursor_y + h > 0.94:
                page += 1
                cursor_y = 0.08
            block["bbox"] = {
                "page": page,
                "x": 0.08,
                "y": round(cursor_y, 4),
                "w": 0.84,
                "h": round(h, 4),
                "unit": "norm",
                "source": "approx",
            }
            cursor_y += h + 0.014

    return {
        "kind": "rich",
        "blocks": blocks,
        "content": content,
        "truncated": truncated,
        "layout_version": layout_version,
        "layout_mode": layout_mode,
        "precise_bbox_count": precise_assigned,
        "source": "hwpx",
    }


def _iter_hwp_sections(ole: olefile.OleFileIO) -> list[bytes]:
    if not ole.exists("BodyText"):
        return []
    entries = [entry for entry in ole.listdir(streams=True, storages=False) if entry and entry[0] == "BodyText"]
    entries = sorted(entries, key=lambda e: e[-1])
    sections: list[bytes] = []
    for entry in entries:
        try:
            with ole.openstream(entry) as stream:
                sections.append(stream.read())
        except Exception:  # noqa: BLE001
            continue
    return sections


def _is_hwp_compressed(ole: olefile.OleFileIO) -> bool:
    if not ole.exists("FileHeader"):
        return False
    with ole.openstream("FileHeader") as stream:
        header = stream.read()
    if len(header) < 40:
        return False
    flags = int.from_bytes(header[36:40], "little", signed=False)
    return bool(flags & 0x01)


def _extract_hwp_text(file_bytes: bytes) -> str:
    texts: list[str] = []
    with olefile.OleFileIO(io.BytesIO(file_bytes)) as ole:
        compressed = _is_hwp_compressed(ole)
        for section in _iter_hwp_sections(ole):
            data = section
            if compressed:
                try:
                    data = zlib.decompress(section, -15)
                except Exception:  # noqa: BLE001
                    continue

            pos = 0
            while pos + 4 <= len(data):
                header = int.from_bytes(data[pos : pos + 4], "little", signed=False)
                pos += 4
                tag_id = header & 0x3FF
                size = (header >> 20) & 0xFFF
                if size == 0xFFF:
                    if pos + 4 > len(data):
                        break
                    size = int.from_bytes(data[pos : pos + 4], "little", signed=False)
                    pos += 4
                if pos + size > len(data):
                    break
                payload = data[pos : pos + size]
                pos += size

                if tag_id != HWPTAG_PARA_TEXT or not payload:
                    continue
                try:
                    text = payload.decode("utf-16le", errors="ignore")
                except Exception:  # noqa: BLE001
                    continue
                if text.strip():
                    texts.append(text)

    return "\n".join(texts)


def build_document_preview(
    file_name: str,
    file_bytes: bytes,
    *,
    layout_mode: str = "approx",
    render_pdf: Callable[[str, bytes], bytes] | None = None,
) -> dict[str, object]:
    if not file_name:
        raise ValueError("file_name is required")
    if not file_bytes:
        raise ValueError("file is empty")

    ext = file_name.lower().rsplit(".", 1)[-1] if "." in file_name else ""
    if ext == "hwpx":
        return _extract_hwpx_rich(
            file_bytes,
            layout_mode=layout_mode,
            render_pdf=render_pdf,
            file_name=file_name,
        )
    elif ext == "hwp":
        raw = _extract_hwp_text(file_bytes)
    else:
        raise ValueError("unsupported extension")

    content, truncated = _normalize_preview(raw)
    if not content:
        content = "문서에서 표시 가능한 텍스트를 찾지 못했습니다."

    return {
        "kind": "text",
        "content": content,
        "truncated": truncated,
        "source": ext,
    }
