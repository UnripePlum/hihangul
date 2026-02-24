---
target: windows-ui
type: bug_fix
title: "Diff 뷰어 연속 실행 시 원본(Source) 타겟 오작동 수정 요청"
priority: high
---

# UI Diff 뷰어 원본 바인딩(Source) 수정 요청

HiHangul 프로젝트의 `windows-brain` 모듈에서 여러 번 명령(Run)을 수행할 때 결과물이 파생되는 로직을 `A_result.hwpx`, `A_result(1).hwpx` 등 최초 원본(`A.hwpx`) 기준 1뎁스로만 파생되도록 수정을 완료했습니다. 
(반환 데이터 구조 상 `source_file_path`는 항상 최초 원본 문서 경로를 가리키게 됨)

하지만 현재 `windows-ui` 프론트엔드에서 연속된 명령(Run) 실행 후 갱신되는 Diff 뷰어에서, 원본 비교 대상(왼쪽 뷰어)을 최초 원본(`A.hwpx`)이 아닌 직전에 생성된 결과물(`A_result.hwpx`)로 잘못 바인딩하여 비교(`A_result.hwpx` vs `A_result(1).hwpx`)하는 현상이 발생하고 있습니다.

## 1. 수정 요구사항
`windows-ui`의 `App.tsx` 내에서 `Run` 액션이 완료된 직후(Response 수신 시) Diff 뷰어를 갱신할 때, 비교기 왼쪽의 대상(Original / Source)을 항상 **가장 처음 문서 탭을 열었던 오리지널 모델(`A.hwpx`)** 또는 백엔드가 응답한 **`source_file_path`** 요소로 맵핑(고정)해 주시기 바랍니다.

- **문제점**: UI 로컬 상태(State)에서 마지막으로 미리보기 한 파일 경로를 Source로 치환해버려서 Diff가 꼬이는 것으로 추정됩니다.
- **해결책**: 백엔드 응답의 `source_file_path` 값을 우선적으로 사용하거나, 최초 Load된 세션의 `currentFilePath`를 Source 측 뷰어와 절대적으로 바인딩해 주십시오.

## 2. 참조
`windows-brain` 측에서는 항상 아래와 같은 응답을 내려줍니다.
```json
{
  "source_file_path": "C:\\...\\uploads\\A.hwpx",
  "output_file_path": "C:\\...\\results\\A_result(1).hwpx"
}
```
위 응답 시, UI Diff 뷰어는 반드시 왼쪽=A.hwpx, 오른쪽=A_result(1).hwpx 로 그려져야 합니다.
