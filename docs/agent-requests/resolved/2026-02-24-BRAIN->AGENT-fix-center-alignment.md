---
target: windows-agent
type: bug_fix_and_feature
title: "블록 메타데이터 내 '정렬(Align)' 속성 추가 및 정렬 제어 API 구현 요청"
priority: high
---

# 정렬 메타데이터 및 HWP 제어 API 추가 요청

HiHangul 프로젝트의 `windows-brain` 환경에서 JSON 반환값을 바탕으로 UI 렌더링을 분석한 결과, 한글 문서(HWP/HWPX)의 "문단 정렬(Center Alignment 등)" 사항이 누락되어 원본 문서 렌더링에 오류가 발생하고, 이를 AI가 제어할 방법이 없는 상황입니다.

이에 `windows-agent` 측에 다음 보완 작업을 요청합니다.

## 1. 문단 정렬(Align) 메타데이터 반환 추가
현재 `document_preview.py`가 추출하는 JSON의 `paragraph` 블록들에는 형태(font_size, bold 등) 및 빈 줄 정보만 들어있을 뿐 단락의 정렬(가운데, 왼쪽, 오른쪽, 양쪽 등) 정보가 없습니다. 
이로 인해 PDF 상 실제 Bounding Box(`x: 0.1429` 등 좌측 여백)와 논리적 텍스트가 맞지 않을 때 이를 파악할 수 없습니다.

- **요구사항**: 문단(`paragraph`) 메타데이터에 해당 문단의 텍스트 정렬 상태를 나타내는 `align` 속성을 추가해 주십시오. (예: `"align": "center"`, `"align": "left"` 등)
- **용도**: UI 단의 정확한 블록 렌더링 및 `windows-brain` AI가 서식 보정을 판단할 근거 마련.

## 2. 가운데 정렬(Align Center) 제어 API 추가
현재 `hwp_controller.py`에는 `set_style` (bold, font_size 등) 및 위치 이동(`move_doc_begin` 등) 제어만 가능하며 단락 정렬을 변경하는 전용 API가 없습니다.

- **요구사항**: `HwpController` 클래스 및 어댑터에 블록 단위 혹은 현재 커서 위치의 단락을 가운데 정렬로 지정할 수 있는 기능을 추가해 주십시오.
  - 예: `align_center()` 또는 `set_align("center")`
- **용도**: `windows-brain` 모듈이 제목 단계를 식별했을 때, 해당 제목 텍스트를 논리적인 정중앙에 위치시키기 위함.
