# 작업 요약 - Windows UI (2026-02-24)

## 작업 대상
Windows UI (`apps/windows-ui`)

## 완료된 작업 요약
- `App.tsx`에서 로그인 시 발생하는 `404 Not Found` 연속 폴링(Polling) 에러의 원인을 파악했습니다.
- `fetchComparablePreview` 메서드를 업데이트하여 `{ ok: false, error: 'file_not_found' }` 페이로드나 `HTTP 404 Not Found` 응답을 단순히 에러로 처리하지 않고, `isFileNotFound` 플래그로 반환하도록 수정했습니다.
- `/v1/viewer/render-pdf-from-path` 엔드포인트의 PDF 가져오기 로직이 `HTTP 204 No Content` 및 `HTTP 404 Not Found` 응답을 '문서를 찾을 수 없음'으로 명시적으로 해석하도록 코드를 업데이트했습니다.
- 간헐적으로 실행되는 `useEffect` 폴링 타이머 로직 내에서 `isFileNotFound`가 참일 경우 타이머를 즉시 중지(`attempts = 6`으로 설정)하도록 변경하여, 프론트엔드와 백엔드 간의 불필요한 네트워크 에러 폭주를 완벽하게 차단했습니다.
- 문서를 찾을 수 없을 때 `{ kind: 'none', note: '존재하지 않는 문서입니다.' }` 상태가 UI 컴포넌트에 올바르게 전달되도록 처리했습니다.

## 미해결 문제
- 없음. 
