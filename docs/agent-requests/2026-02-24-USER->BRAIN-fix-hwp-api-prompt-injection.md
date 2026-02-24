---
target: windows-brain
type: bug_fix_and_refactor
title: "LLM 프롬프트 내 HwpController API 스펙 및 scope 가이드 주입 요청"
priority: high
---

# `HwpController` API 스펙 프롬프트 주입 요청

HiHangul 프로젝트의 `windows-brain` 모듈에서 LLM(Codex)이 `hwp_controller.py`의 API를 정확히 호출하지 못해 다음과 같은 두 가지 심각한 버그가 보고되었습니다.

1. **문제 1**: "모든 글자를 가운데 정렬시켜 줘"라고 해도 가운데 정렬이 반영되지 않음.
2. **문제 2**: "첫 줄 글자 크기를 30pt로 만들어 달라고" 했는데 문서 전체 글자 크기가 30pt로 바뀜.

이를 해결하기 위해 `nlu` 파서를 하드코딩 방식으로 고치는 것(예: "가운데 정렬", "첫 줄" 키워드 강제 맵핑)보다, **LLM이 자율적이고 동적으로 API를 활용할 수 있도록 Prompt Assembler 단에서 가이드를 주입해 주는 방식**이 훨씬 구조적으로 안정적입니다.

이에 `windows-brain` 측에 다음 보완 작업을 요청합니다.

## 1. 프롬프트에 API 스펙 레퍼런스 주입
`apps/windows-brain/app/prompt_assembler.py` 내의 `build_prompt` 메서드 (또는 관련 Const 부분)에 아래와 같은 `API_REFERENCE` 텍스트를 구성하여 LLM에게 제공해주시기 바랍니다.

- **요구사항**: HwpController가 제공하는 주요 메서드들의 시그니처(`set_align`, `align_center`, `set_font_size` 등)를 명시적으로 알려주십시오.

## 2. 매개변수 `scope` 에 대한 명시적 가이드 (중요)
`set_font_size`나 `set_bold`, `set_align` 등에서 특정 영역(예: 첫 줄)만 타겟팅해야 하는 경우 `scope='first_line'` 등 별도 인자를 명시해야 함을 LLM에게 가르쳐 주십시오.

- **요구사항**: "스타일 적용 API의 기본값은 `scope='all'` 이지만, 사용자가 특정한 텍스트 범위(예: '첫 줄')를 요청한 경우 반드시 `scope='first_line'` 과 같이 명시해서 호출해야 한다"는 컨텍스트를 프롬프트에 추가하십시오. 

위 두 가지 가이드를 통해 모델(Codex)이 사용자의 다채로운 요구(문단, 첫줄, 전체 등)를 알아서 판단하여 적절한 `scope` 파라미터와 `set_align` 등의 함수 호출 코드를 생성하도록 `prompt_assembler.py`를 개선해주십시오.
