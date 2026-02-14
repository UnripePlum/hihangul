# HiHangul 작업 요약 (2026-02-14)

## 1) 아키텍처/명명 정리
- 런타임 명명 체계를 `mac-*`에서 `windows-*` 중심으로 정리.
- Brain/UI/Agent 실행 경로 및 스크립트 레퍼런스를 Windows 실행 기준으로 통일.

## 2) Windows 실행 스크립트 개선
- `start_hihangul_windows` 계열에서 동기화(`--sync`) 흐름을 정리하고 실행 순서 고정.
- Python 탐지 로직 강화:
  - `HIHANGUL_PYTHON` 우선
  - `py -3` 확인
  - `where python` 확인
  - 일반 경로 + `Python311-arm64` 등 ARM64 경로 fallback 추가
- `windows-brain`, `windows-agent` 실행 스크립트에서 `.venv` 손상/누락 시 자동 재생성 로직 적용.
- 의존성 설치 실패 메시지 및 런타임 로그(선택된 python 경로) 가시성 개선.

## 3) 동기화/개발 워크플로우 정비
- `C:\\Mac\\Home\\...` -> `C:\\dev\\hihangul` robocopy 동기화 스크립트 유지/개선.
- Windows 로컬 디스크에서 `npm install`/dev 실행하는 흐름으로 정리해 Parallels 공유 경로 이슈(EINVAL) 회피.

## 4) Electron 원격 디버깅 대응
- Electron main 프로세스에 원격 디버깅 플래그 적용/검증:
  - `remote-debugging-port=9222`
  - `remote-debugging-address=0.0.0.0`
  - `remote-allow-origins=*`
- Windows VM 앱을 Mac Chrome DevTools에서 inspect 가능한 흐름으로 문서화.

## 5) 로그인 UX 및 Provider 연동 정리
- 초기 화면을 로그인 화면 중심으로 구성.
- Provider 선택 UX 단순화:
  - Claude 선택 시 token 입력 표시
  - Codex 선택 시 token/profile id 입력 제거
- 버튼 라벨/흐름 정리(`Save profile` -> `Login` 기준).

## 6) Codex 로그인 오류 수정
- 원인: `codex --login` 호출 (CLI 인자 불일치)
- 조치: `codex login`으로 변경
  - `apps/windows-ui/src/main/electron.ts`
  - `apps/windows-ui/src/renderer/App.tsx` 안내 문구
- 결과: Codex 선택 후 Login 시 CLI 로그인 창 실행 가능 상태로 수정.

## 7) 보안/서비스 플로우 반영
- “파일 업로드 없음, 로컬 실행, 사용자 명시적 실행” 원칙을 UI/동작 흐름에 반영.
- Intent 기반 프로그램 생성 -> 사용자 클릭 실행 -> Diff 검증 -> 자산화 흐름 유지.

## 8) 현재 운영 권장 커맨드 (Windows)
```bat
cd /d C:\Mac\Home\IdeaProjects\hihangul
scripts\dev\sync_to_windows.cmd

cd /d C:\dev\hihangul
set HIHANGUL_PYTHON=C:\Users\hanjunkim\AppData\Local\Programs\Python\Python311-arm64\python.exe
scripts\dev\start_hihangul_windows.cmd --sync
```
