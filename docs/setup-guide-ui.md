# HiHangul UI Agent 설정 가이드

이 문서는 `windows-ui` (Layer 1) 개발 에이전트를 위한 필수 설정, 실행 및 디버깅 컨텍스트를 포함하고 있습니다.

## 1. 아키텍처 및 실행 토폴로지
- **Layer 1 (UI)**: `apps/windows-ui` 컴포넌트는 **Windows 호스트**에서 네이티브로 실행되는 Electron/React 애플리케이션입니다. 백엔드인 `windows-agent` API와 통신합니다.
- **개발자 호스트**: macOS가 개발 워크스테이션 역할을 합니다. 모든 코드는 Mac에서 작성되며 Windows로 동기화됩니다.
- **데이터 흐름**: UI는 이벤트를 처리하고 HWP/PDF 상태를 Windows `localhost` 네트워크 내에서 전적으로 렌더링합니다.

## 2. 시작 및 동기화
코드베이스는 Parallels를 통한 공유 스크립트로 macOS 호스트에서 동기화되고 실행됩니다.

- **동기화 및 시작 (Windows CMD)**:
  ```cmd
  scripts\dev\start_hihangul_windows.cmd --sync
  ```
  이 명령어는 3개의 터미널을 실행합니다:
  - Brain (`localhost:8000`)
  - Agent (`localhost:9000`)
  - UI (Electron dev client: `dev:win-vm`)

- **서비스 종료**:
  ```cmd
  scripts\dev\stop_hihangul_windows.cmd
  ```

## 3. 원격 디버깅 (Mac -> Windows)
`windows-ui` 개발 시 가장 중요한 기능은 원격 디버깅입니다. 이를 통해 macOS의 크롬 개발자 도구(Chrome DevTools)에서 Windows Electron의 DOM을 검사할 수 있습니다.

1. **디버그 플래그로 실행**:
   시작 스크립트에 `--remote-debug` 플래그를 추가합니다. 이는 `--remote-allow-origins=*` 옵션과 함께 포트 `9222`에서 DevTools WebSocket을 엽니다.
   ```cmd
   scripts\dev\start_hihangul_windows.cmd --sync --remote-debug
   ```
2. **macOS에서 연결 방법**:
   - 크롬 브라우저에서 `chrome://inspect` 주소로 이동합니다.
   - "Configure..."를 클릭하고 Windows VM IP (예: `10.211.55.3:9222`)를 추가합니다.
   - Remote Target 아래의 "inspect"를 클릭합니다.

## 4. 자동화된 UI 테스트 (Browser Subagent)
에이전트 주도의 UI 인터랙션 테스트는 원격 디버깅 포트(`9222`)를 활용해야 합니다.
- 서브에이전트(Subagent)는 DevTools 엔드포인트(`http://<WINDOWS_IP>:9222/json/list`)에 접근하여 자율적으로 DOM을 검사하고, Diff Viewer에서 누락된 하이라이트를 식별하며, 물리적인 마우스 조작 없이 콘솔에서 JS 명령어를 실행할 수 있습니다.
