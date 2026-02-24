from __future__ import annotations

import re


def analyze_document_structure(blocks: list[dict[str, object]]) -> dict[str, object]:
    """
    1단계: 구조적 파싱 (Structural Heuristics)
    windows-agent의 document_preview.py에서 추출한 blocks 데이터를 기반으로
    문서의 대상(제목 유력 후보 등)을 1차 필터링합니다.
    """
    if not blocks:
        return {"title_candidate_index": None, "confidence": 0.0, "reason": "No blocks provided"}

    # 첫 번째 블록이 paragraph 형태인지 확인
    first_block = blocks[0]
    if first_block.get("type") != "paragraph":
        return {"title_candidate_index": None, "confidence": 0.3, "reason": "First block is not a paragraph (e.g., table)"}

    # 텍스트 길이 측정
    runs = first_block.get("runs", [])
    if not isinstance(runs, list):
        return {"title_candidate_index": None, "confidence": 0.0, "reason": "Invalid runs format"}

    text = " ".join(str(run.get("text", "")) for run in runs if isinstance(run, dict)).strip()
    
    # 길이가 너무 길면 본문일 확률이 높음 (50자 초과)
    if not text or len(text) > 50:
        return {"title_candidate_index": None, "confidence": 0.2, "reason": f"Text too long: {len(text)} chars"}

    # 종결 부호 및 품사 확인 (., ~다, ~합니다 로 끝나면 본문일 확률 높음)
    if re.search(r"(\.|다|합니다|됨|음)$", text[-5:]):
         return {"title_candidate_index": None, "confidence": 0.4, "reason": "Ends with sentence terminator"}

    # 명사형으로 끝나는 짧은 단락은 제목일 확률이 매우 높음 (60% 신뢰도 부여, 빈 줄 판별 시 90% 이상)
    # TODO: windows-agent에서 '빈 줄' 여부를 메타데이터로 반환받으면 confidence 상향 로직 추가
    return {
        "title_candidate_index": 0,
        "title_text": text,
        "confidence": 0.7,
        "reason": "Short text ending with noun-like structure"
    }

