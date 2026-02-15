# HiHangul UI/Auth/Session 업데이트 기록 (2026-02-14)

## 목표
- Windows 실행 중심 구조로 정리
- 로그인 UX 단순화
- Codex 연동 안정화
- ChatGPT 스타일의 세션 기반 UI 구현
- 세션/대화 로컬 영속화

## 주요 변경 사항

### 1) 런타임/스크립트 정리
- `mac-*` 명칭을 `windows-*` 명칭으로 정리.
- Windows 실행 스크립트에서 Python 탐지/venv 재생성/의존성 설치 흐름 보강.
- `sync_to_windows` 기반 동기화 워크플로우 유지.

### 2) Codex 로그인 연동 개선
- `codex --login` 호출 오류 수정 -> `codex login` 사용.
- 로그인 창 실행 후 `codex login status` 폴링으로 로그인 성공 감지.
- 성공 시 HiHangul Electron 창을 최상단으로 복귀(`restore/show/focus/moveTop`).

### 3) 로그인 페이지 단순화
- 추상화 원칙에 맞게 불필요한 기술 텍스트 제거:
  - Brain URL 제거
  - Codex 로그인 방식 안내 문구 제거
- 로그인 헤더를 `HiHangul`로 유지.

### 4) 로그인 후 전환 UX
- 로그인 성공 후 로딩 화면 표시 후 메인 이동.
- 전환 시간 최종값: **5초**.
- 로딩 시각 요소(점 애니메이션) 추가.

### 5) 메인 UI 구조 개편
- 로그인 후 화면을 채팅 앱 패턴으로 변경:
  - 좌측: 세션 리스트
  - 우측: 현재 세션 대화/프롬프트/실행 컨트롤
- Build/Run 결과를 세션 대화 메시지로 누적 표시.

### 6) 세션 로컬 영속화
- `localStorage`에 세션/메시지/활성 세션 저장.
- 앱 재시작 시 자동 복원.
- 로그인 재수행 시 기존 로컬 세션 유지.

### 7) 세션 우클릭 컨텍스트 메뉴
- 세션 리스트에서 우클릭 메뉴 추가.
- `세션 삭제` 동작 구현:
  - 활성 세션 삭제 시 다음 세션 자동 선택
  - 마지막 세션 삭제 시 기본 세션 자동 생성

### 8) 스타일/브랜딩
- 지정 키 컬러(Trust Navy/Hwp Crimson/Action Azure/Safety Mint/Neutral Slate) 기반 테마 적용.
- 컬러 하드코딩 제거, CSS 변수 중심으로 통일.
- 폰트를 깔끔한 산세리프 스택으로 교체:
  - `Pretendard Variable`, `Pretendard`, `Noto Sans KR`, `Segoe UI` 등

## 변경 파일(핵심)
- `apps/windows-ui/src/main/electron.ts`
- `apps/windows-ui/src/renderer/App.tsx`
- `apps/windows-ui/src/renderer/styles.css`
- `scripts/dev/run_windows_brain_windows.cmd`
- `scripts/dev/run_windows_agent_windows.cmd`
    - `scripts/dev/sync_to_windows.cmd`

## 검증
- `apps/windows-ui`에서 `npm run build` 반복 검증 완료.
- Codex 로그인 오류(`--login`)는 수정 후 재현되지 않도록 반영.
- 세션 생성/전환/삭제 및 로컬 복원 로직 반영 완료.
