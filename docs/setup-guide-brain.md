# HiHangul Brain 설정 가이드

이 문서는 `windows-brain` (Layer 2) 개발 에이전트를 위한 필수 설정, 실행 및 디버깅 컨텍스트를 포함하고 있습니다.

## 1. 아키텍처 및 실행 토폴로지
- **Layer 2 (Brain)**: `windows-brain` 컴포넌트는 AI 오케스트레이터(Orchestrator)로 동작하는 FastAPI Python 서버이며, **Windows (`localhost:8000`)**에서 실행됩니다.
- **역할**: 자연어 이해(NLU), LLM을 통한 계획(Plan) 생성, SQLite-vec 임베딩 처리를 담당하며, `windows-agent` API 백엔드를 오케스트레이션합니다.
- **개발자 호스트**: macOS가 개발 워크스테이션 역할을 합니다.

## 2. 시작 및 Python 환경
`windows-brain`은 Windows Python 런타임에 의존합니다.

- **동기화 및 시작 (Windows CMD)**:
  ```cmd
  scripts\dev\start_hihangul_windows.cmd --sync
  ```
  이 명령어는 Python 설치 여부를 자동으로 관리하며 (없는 경우 설치), 가상 환경을 가동시킵니다.

## 3. LLM 제공자 CLI 인증 체계
무엇보다 중요한 것은, `windows-brain`은 인증 및 실행을 위해 표준 LLM 제공자 도구(예: OpenClaw 래퍼 등)와 연동된다는 점입니다.
- 만약 브라우저/UI에서 'Login' 버튼 클릭 시 "Command Not Found" 에러가 발생한다면, LLM 제공자를 위한 NodeJS CLI 도구들이 설치되어 있지 않은 것입니다.
- Windows 머신에 NodeJS가 설치되어 있는지 확인하고 다음 명령어를 실행하세요:
  ```cmd
  npm.cmd install -g @openai/codex
  npm.cmd install -g @anthropic-ai/claude-code
  ```
- Brain 서버는 이러한 글로벌 CLI 명령어들을 하위 프로세스(sub-process)로 호출하게 됩니다.

## 4. 문제 해결 및 검증 (Troubleshooting)
- **애플리케이션 크래시**: `localhost:8000`을 실행하는 터미널을 확인하세요. 흔한 에러로는 모델 누락 (`chromadb`/`sqlite-vec` 초기화 실패) 또는 API 키 유효성 검사 실패 등이 있습니다.
- **SQLite Vec 대체 동작 (Fallback)**: 만약 `bge-m3` 임베더(Embedder) 로드 경로에 문제가 생길 경우, 프로세스가 망가지지(Crash) 않고 순수 문자열 매칭(Raw string-matching) 검색 모드로 우아하게(gracefully) 전환(Fallback)되도록 설계되어 있습니다.
