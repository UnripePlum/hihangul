# HiHangul Agent 설정 가이드

이 문서는 `windows-agent` (Layer 3) 개발 에이전트를 위한 필수 설정, 실행 및 디버깅 컨텍스트를 포함하고 있습니다.

## 1. 아키텍처 및 실행 토폴로지
- **Layer 3 (Agent)**: `apps/windows-agent` 컴포넌트는 **Windows (`localhost:9000`)**에서 실행되는 FastAPI Python 서버입니다.
- **역할**: 실행 계층(Execution layer)으로 동작합니다. LLM이 생성한 Python 코드, AST 유효성 검사, 그리고 네이티브 한컴오피스 `Hwp.exe` API 사이의 브릿지 역할을 합니다.
- **개발자 호스트**: macOS가 개발 워크스테이션입니다. 코드는 macOS에서 Windows VM으로 동기화됩니다.

## 2. 시작 및 Python 환경
`windows-agent`는 Windows 호스트에 직접 구성된 특수한 Python 런타임 환경에 의존합니다.

- **동기화 및 시작 (Windows CMD)**:
  ```cmd
  scripts\dev\start_hihangul_windows.cmd --sync
  ```
  이 스크립트는 Python 환경을 관리합니다. Python 3.11이 설치되어 있지 않다면 `winget`을 통해 자동으로 다운로드 및 설치합니다. 이후 `apps/windows-agent`를 위한 가상 환경(`.venv`)을 활성화합니다.

- **정밀 레이아웃 모드 (Precise Layout Mode)**:
  에이전트가 정밀한 레이아웃 계산을 필요로 하는 경우 (예: Diff Viewer 경계 상자(Bounding box)에 정확히 일치하는 PDF 생성), 다음 명령어로 시작합니다:
  ```cmd
  scripts\dev\start_hihangul_windows.cmd --precise
  ```
  이 명령어는 `HIHANGUL_ENABLE_PRECISE_LAYOUT=1`을 강제하며, 필수적으로 `x64` Python 런타임을 요구합니다.

## 3. 개발 워크플로우 및 테스팅
1. **로컬 편집**: Mac에서 안전하게 Python 모듈(`apps/windows-agent/*`)을 개발합니다.
2. **동기화**: `--sync` 옵션을 사용하여 변경 사항을 Windows로 푸시합니다.
3. **API 엔드포인트**: UI는 주로 이 에이전트가 정의한 엔드포인트(예: `/v1/viewer/preview`, `/v1/runs`)와 통신합니다. Windows IP (`http://10.211.55.3:9000`)를 대상으로 `curl`이나 Postman을 사용하여 테스트할 수 있습니다.

## 4. 문제 해결 (Troubleshooting)
- **Failed to fetch**: UI가 에이전트에 연결하지 못하는 경우, `windows-agent` 터미널 창에서 `Uvicorn` 시작 시 발생한 에러(Traceback)가 없는지 확인합니다.
- **설치된 Python 없음 (Missing Python)**: 터미널에 `Python was not found`라고 표시되는 경우, `HIHANGUL_PYTHON` 환경 변수가 올바른 설치 경로를 가리키는지 확인하거나 직접 Python을 설치한 후 스크립트를 재시작합니다.
