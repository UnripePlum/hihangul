---
target: windows-agent
type: feature_request
title: "HWP 커서 로우레벨 제어(MoveDocBegin 등) 및 빈 줄 판단용 블록 메타데이터 추가"
priority: high
---

# HWP 커서 제어 API 및 블록 메타데이터 추가 요청

HiHangul 프로젝트의 `windows-brain` 파이프라인(제목과 본문의 논리적 분리) 구축을 위해 `windows-agent` 모듈의 두 가지 기능 확장이 필수적입니다. 이 사항들을 검토하여 구현해 주시길 요청드립니다. 

## 1. 블록 간 '빈 줄' 여부 메타데이터 추가
현재 `document_preview.py`가 반환하는 `blocks` 정보에는 텍스트 정보가 들어 있으나, 단락 간 빈 줄(엔터)이 연속으로 입력된 상태인지 확인하기 어렵습니다.

- **요구사항**: HWPX나 파싱 결과(`blocks` 내 각 `paragraph` 딕셔너리)에 해당 단락이 빈 단락인지, 혹은 직전 단락과 사이에 빈 줄이 존재하는지 여부를 나타내는 메타데이터(예: `is_empty_line`, `newline_count_before`)를 추가해 주십시오. 
- **용도**: 휴리스틱 파싱(1단계) 시 빈 줄 다음에 오는 단락을 기반으로 제목 여부의 정확도(Confidence)를 대폭 높이기 위함입니다.

## 2. HWP 커서 및 블록 지정 API 추가 (`hwp_controller.py`)
현재 `hwp_controller`는 XML 기반 정규식 치환 등 제한된 기능만 제공합니다. AI가 논리적으로 파악한 특정 위치(예: "문서 시작", "현재 단락")를 대상으로 특정 스타일만 적용하려면, Native 윈도우 환경(HAction)의 물리적 커서 제어 명령이 필요합니다.

- **요구사항**: `NativeApiAdapter` (또는 가능한 어댑터)에 다음 기능과 상응하는 추상 메서드를 `HwpController` 클래스에 명시해 주십시오.
  1. `move_doc_begin()` : 커서를 문서 맨 앞으로 이동 (`MoveDocBegin`)
  2. `move_para_end()` : 커서를 현재 문단 끝으로 이동 (`MoveParaEnd`)
  3. `select_para()` : 현재 문단을 블록(선택) 지정 (`MoveSelParaEnd` 혹은 유사 액션)
  4. `run_action(action_id: str)` : HWP 기본 매크로 액션(예: `StyleTitle`, `ParagraphShape`)을 임의로 실행할 수 있는 백도어 API

해당 기능이 배포되면 `windows-brain` 모듈이 LLM 프롬프트에 위 API들을 활용하도록 지시할 예정입니다.
