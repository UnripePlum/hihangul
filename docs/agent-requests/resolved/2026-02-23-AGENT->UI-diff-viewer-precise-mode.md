# AGENT 요청: Agent 결과 문서에 layout_mode="precise" 적용

**Date**: 2026-02-23
**Source**: AGENT
**Target**: UI

## 문제 설명
Diff Viewer에서 사용자가 Agent에게 서식 수정(예: 글자 크기 30pt 변경 등)을 요청했을 때, 변경된 문단에 대한 하이라이트가 화면에서 완전히 누락되거나 엉뚱한 페이지(예: 2페이지)로 밀려나는 문제가 발생하고 있습니다.

이 문제는 `windows-ui`가 원본 파일(Original File)을 처리할 때는 `/v1/viewer/preview?layout_mode=precise`를 올바르게 호출하지만, Agent가 수정한 결과 파일(Result File)을 렌더링할 때는 **경로(path) 기반 미리보기 API를 호출하면서 `layout_mode` 파라미터를 누락**하고 있기 때문에 발생합니다.

```typescript
// App.tsx 내 API 호출 부분
const res = await fetch(`${window.hihangul.agentBaseUrl}/v1/viewer/preview-from-path`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: fileMeta.storedPath }), // 누락 부분: layout_mode: 'precise'
});
```

`layout_mode`가 지정되지 않으면 백엔드는 해당 문서에 대해 기본값인 `approx` 모드를 강제로 사용합니다. `approx` 모드는 렌더링된 PDF 좌표를 추출하는 대신, 텍스트 글자 수를 기반으로 수학적으로 줄 높이를 "대략적으로 추정(Estimate)"하는 알고리즘을 사용합니다.
서식이 복잡한 엉망진창 보고서와 같은 문서에서는 이 추정 오차가 계속 누적되며, 실제 PDF 상으로는 1페이지 하단에 위치한 타겟 문단이 백엔드의 좌표계에서는 **2페이지로 밀려난 것으로 잘못 계산**됩니다.

Frontend의 Diff Viewer는 이렇게 잘못 계산된 "2페이지 좌표"를 바탕으로 하이라이트 Bounding Box를 그리려고 시도하기 때문에, 정작 글자가 보이는 1페이지 화면 상에서는 하이라이트가 완전히 사라진 것처럼 보이게 됩니다.

## 요청 사항 (Required Changes)
1. **대상 파일**: `apps/windows-ui/src/renderer/App.tsx` (대략 1000번째 줄 부근 `preview_document_from_path_fetch` 관련 로직)
2. `/v1/viewer/preview-from-path` 엔드포인트로 보내는 API Fetch 요청의 JSON body에 `"layout_mode": "precise"`를 반드시 추가해 주세요.
3. 변경을 반영하시면 백엔드가 대략적인 줄 높이 추정(`approx` 모드) 대신, PyMuPDF를 통한 정확한 Bounding Box 매칭 좌표(`pdf_exact` 모드)를 반환하게 되므로 Diff Viewer의 하이라이트가 정상적으로 노출될 것입니다.

**수정 예시:**
```typescript
    body: JSON.stringify({ 
      path: fileMeta.storedPath,
      layout_mode: 'precise' 
    }),
```
