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
    used_pdf_idxs = set()
    for block_num, block in enumerate(blocks):
        target = _normalize_match_text(_block_plain_text(block))
        if not target:
            continue
        best_idx = -1
        best_score = 0.0
        # Allow looking backwards up to 35 blocks because overlapping Y coords
        # can cause PyMuPDF to extract text blocks out of logical XML order.
        search_start = max(0, cursor - 35)
        search_end = min(len(pdf_blocks), cursor + 35)
        for idx in range(search_start, search_end):
            if idx in used_pdf_idxs:
                continue
            cand = _normalize_match_text(str(pdf_blocks[idx].get("text", "")))
            if not cand:
                continue
            if target in cand or cand in target:
                score = 1.0
            else:
                sm = SequenceMatcher(None, target[:300], cand[:300])
                matches = sum(trip.size for trip in sm.get_matching_blocks())
                score = matches / max(1, len(cand[:300]))
            if score > best_score:
                best_score = score
                best_idx = idx
        if best_idx < 0 or best_score < 0.45:
            continue
            
        print(f"BBOX MATCH: XML Block {block_num} ('{target[:20]}...') claimed PDF Block {best_idx} ('{str(pdf_blocks[best_idx].get('text', ''))[:20]}') with score {best_score}")
            
        matched_blocks = [pdf_blocks[best_idx]]
        used_pdf_idxs.add(best_idx)
        combined_cand = _normalize_match_text(str(pdf_blocks[best_idx].get("text", "")))
        
        next_cursor = best_idx + 1
        # Try to greedily absorb consecutive fragments that also match the target
        while next_cursor < len(pdf_blocks) and len(combined_cand) < len(target) * 1.1:
            if next_cursor in used_pdf_idxs:
                next_cursor += 1
                continue
            next_cand = _normalize_match_text(str(pdf_blocks[next_cursor].get("text", "")))
            if not next_cand:
                next_cursor += 1
                continue
            
            if next_cand in target:
                print(f"  BBOX GREEDY: XML Block {block_num} also claimed PDF Block {next_cursor}")
                combined_cand += next_cand
                matched_blocks.append(pdf_blocks[next_cursor])
                used_pdf_idxs.add(next_cursor)
                next_cursor += 1
            else:
                break

        page = int(matched_blocks[0]["page"])
        x0 = min(float(b["x"]) for b in matched_blocks if int(b["page"]) == page)
        y0 = min(float(b["y"]) for b in matched_blocks if int(b["page"]) == page)
        x1 = max(float(b["x"]) + float(b["w"]) for b in matched_blocks if int(b["page"]) == page)
        y1 = max(float(b["y"]) + float(b["h"]) for b in matched_blocks if int(b["page"]) == page)

        block["bbox"] = {
            "page": page,
            "x": round(x0, 4),
            "y": round(y0, 4),
            "w": round(x1 - x0, 4),
            "h": round(y1 - y0, 4),
            "unit": "norm",
            "source": "pdf_exact",
            "score": round(best_score, 3),
        }
        assigned += 1
        cursor = max(cursor, next_cursor)
    return assigned


def _parse_hwpx_face_names(header_xml: str) -> dict[str, dict[str, str]]:
    # language-aware font id -> face name map, e.g. {"HANGUL": {"3": "함초롬바탕"}}
    names: dict[str, dict[str, str]] = {}

    # Newer/typical HWPX: <hh:fontface lang="HANGUL"> <hh:font id="3" face="...">...</hh:font>
    for ff_match in re.finditer(
        r"<[^>]*fontface\b([^>]*)>([\s\S]*?)</[^>]*fontface>",
        header_xml,
        flags=re.IGNORECASE,
    ):
        ff_attrs = ff_match.group(1) or ""
        ff_body = ff_match.group(2) or ""
        lang = (_get_attr(ff_attrs, ["lang"]) or "HANGUL").upper()
        lang_map = names.setdefault(lang, {})
        for font_match in re.finditer(r"<[^>]*font\b([^>]*)>", ff_body, flags=re.IGNORECASE):
            attrs = font_match.group(1) or ""
            key = _get_attr(attrs, ["id", "fontID", "idRef"])
            face = _get_attr(attrs, ["face", "name", "fontName", "faceName"])
            if key and face:
                lang_map[key] = face

    # Legacy-like fallback: faceName tags (language not explicit)
    legacy_map = names.setdefault("HANGUL", {})
    for idx, match in enumerate(re.finditer(r"<[^>]*faceName\b([^>]*)/?>", header_xml, flags=re.IGNORECASE)):
        attrs = match.group(1) or ""
        key = _get_attr(attrs, ["id", "faceNameID", "idRef", "fontID"]) or str(idx)
        face = _get_attr(attrs, ["name", "fontName", "faceName"])
        if face and key not in legacy_map:
            legacy_map[key] = face
    return names


def _parse_hwpx_char_styles(header_xml: str) -> dict[str, dict[str, object]]:
    styles: dict[str, dict[str, object]] = {}
    face_names_by_lang = _parse_hwpx_face_names(header_xml)
    hangul_faces = face_names_by_lang.get("HANGUL", {})
    latin_faces = face_names_by_lang.get("LATIN", {})

    def resolve_face(attrs: str, body: str) -> str:
        # direct attributes first
        family = _get_attr(attrs, ["fontName", "faceName", "font"])
        if family:
            return family

        # common id-ref attributes (older variants)
        ref = _get_attr(
            attrs,
            [
                "hangeulFaceNameIdRef",
                "hangulFaceNameIdRef",
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
            return hangul_faces.get(ref) or latin_faces.get(ref) or ""

        # typical HWPX: nested <hh:fontRef hangul="3" latin="3" .../>
        font_ref_match = re.search(r"<[^>]*fontRef\b([^>]*)/?>", body, flags=re.IGNORECASE)
        if font_ref_match:
            ref_attrs = font_ref_match.group(1) or ""
            hangul_ref = _get_attr(ref_attrs, ["hangul", "hangeul"])
            latin_ref = _get_attr(ref_attrs, ["latin"])
            if hangul_ref and hangul_ref in hangul_faces:
                return hangul_faces[hangul_ref]
            if latin_ref and latin_ref in latin_faces:
                return latin_faces[latin_ref]
            if hangul_ref:
                return hangul_faces.get(hangul_ref, "")
            if latin_ref:
                return latin_faces.get(latin_ref, "")
        return ""

    def parse_style(attrs: str, body: str, fallback_idx: int) -> tuple[str, dict[str, object]]:
        key = _get_attr(attrs, ["id", "charPrID", "charPrId"]) or str(fallback_idx)
        height_raw = _get_attr(attrs, ["height", "charHeight", "fontSize"])
        bold_raw = _get_attr(attrs, ["bold", "fontBold"])
        height = int(height_raw) if height_raw.isdigit() else 1000
        # HWPX height is commonly in 1/100 pt-ish units in practice.
        font_px = max(12, min(32, int((height / 100.0) * 1.3)))
        bold = False
        if bold_raw:
            bold_value = bold_raw.strip().lower()
            bold = bold_value in {"1", "true", "t", "yes", "y"}
        # nested explicit bold tag
        if not bold and re.search(r"<[^>]*bold\b", body, flags=re.IGNORECASE):
            bold = True
        family = resolve_face(attrs, body)
        if not family:
            family = "Malgun Gothic"
        return (key or str(fallback_idx), {"font_size_px": font_px, "bold": bold, "font_family": family})

    idx = 0
    # full charPr tags
    for match in re.finditer(r"<[^>]*charPr\b([^>]*)>([\s\S]*?)</[^>]*charPr>", header_xml, flags=re.IGNORECASE):
        attrs = match.group(1) or ""
        body = match.group(2) or ""
        key, style = parse_style(attrs, body, idx)
        styles[key] = style
        idx += 1
    # self-closing charPr tags
    for match in re.finditer(r"<[^>]*charPr\b([^>]*)/>", header_xml, flags=re.IGNORECASE):
        attrs = match.group(1) or ""
        key, style = parse_style(attrs, "", idx)
        # preserve explicit full-tag style if both exist
        styles.setdefault(key, style)
        idx += 1
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
