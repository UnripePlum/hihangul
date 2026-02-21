# 2026-02-19 작업 요약 (Brain/Agent/UI 통합)

## 1. 오늘 목표
- 로그인/연동 플로우를 안정화하고, 선택한 Provider(Codex/Claude) 기준으로 실행 흐름을 일관화.
- OpenClaw 스타일 데이터 저장 구조를 도입해 세션 단위 파일 업로드/결과물 관리를 구현.
- 결과 파일이 Viewer/Diff에서 실제로 열리고 비교 가능하도록 경로 기반 미리보기 파이프라인 구축.
- HWPX 타겟 자동화에서 "복사본 생성 + 실제 수정 반영"이 되도록 실행 경로 보강.

## 2. 주요 변경 사항

### 2.1 Windows Brain
- `apps/windows-brain/app/file_store.py` 추가
  - OpenClaw 스타일 파일 저장소 도입: `shared/memory/windows-brain/files/{lane}/{session}`
  - `uploads/`, `results/`, `manifest.md`, `events.jsonl` 관리
- `apps/windows-brain/app/main.py`
  - `/v1/files/upload` 추가: 업로드 파일을 세션 저장소에 복제 저장
  - `/v1/files/allocate-result` 추가: 결과 파일 경로/이름 할당
  - task 처리 시 `source_file_path`, `output_file_path`, `session_dir`를 실행 컨텍스트에 반영
- `apps/windows-brain/app/codex_auth.py`
  - Codex 상태 확인을 다중 방식으로 보강 (직접 실행 + `cmd /c` fallback)
  - PATH/실행 컨텍스트 차이로 인한 false negative 감소
- `apps/windows-brain/app/orchestrator.py`
  - Provider별 실제 호출 시도(Codex CLI / Claude API/CLI) + 실패 시 fallback
  - 스타일/치환 directive를 실제 controller 메서드 호출 코드로 생성하도록 변경
- `apps/windows-brain/app/guardrails.py`
  - 허용 controller 메서드 확장
  - 원본 덮어쓰기 방지 규칙 유지
- `apps/windows-brain/requirements.txt`
  - `python-multipart==0.0.20` 추가 (Form/File 엔드포인트 구동 필수)

### 2.2 Windows Agent
- `apps/windows-agent/app/main.py`
  - 경로 기반 Viewer API 추가
    - `POST /v1/viewer/preview-from-path`
    - `POST /v1/viewer/render-pdf-from-path`
- `apps/windows-agent/app/hwp_controller.py`
  - 디스크 저장 로직 보강: `save_document(path)` 시 실제 파일 생성
  - HWPX 조작 메서드 추가
    - `replace_text(before, after, scope)`
    - `set_bold(value, scope)`
    - `set_font_size(size_pt, scope)`
    - `set_font_family(family, scope)`
  - HWPX ZIP/XML 직접 수정 경로 추가 (section/header 업데이트)

### 2.3 Windows UI
- `apps/windows-ui/src/renderer/App.tsx`
  - 하드코딩 응답 제거, `/v1/tasks` 실제 호출로 변경
  - 로그인 단계 게이트 강화
    - Runtime 준비(Brain/Agent) + Provider 연동 완료 시에만 진입
  - Codex 로그인 대기 로직 개선
    - 상태 폴링/타임아웃/오류 메시지 강화
    - 구버전 preload 대비 fallback 처리
  - 결과 파일(`storedPath`) 선택 시 경로 기반 preview 자동 로드
  - 결과 파일 preview 재시도(파일 생성 지연 대응) 추가
  - 이전 세션 데이터 역직렬화 방어 로직 추가(빈 화면 방지)
  - HWPX 타겟 요청 시 Python 프로그램 생성/실행 지시를 prompt에 강제 주입
- `apps/windows-ui/src/main/electron.ts`
  - Codex 브라우저 로그인 유지 (`codex login`)
  - 로그인 후 브라우저 정리/런처 포커스 IPC 추가
  - 로컬 Codex 로그인 상태 IPC 추가
- `apps/windows-ui/src/preload/preload.ts`, `apps/windows-ui/src/renderer/env.d.ts`
  - 신규 IPC 브리지/타입 추가

## 3. 주요 이슈와 해결

### 이슈 A: Codex 로그인 완료 후 다음 화면 미진입
- 원인
  - 상태 판정이 단일 경로/비동기 대기 타이밍에 묶여 false pending 발생
- 조치
  - 로그인 판정 로직 보강(Brain/Local 상태 체크, 타임아웃/메시지 강화)
  - UI 단계 게이트를 무한 대기 없이 에러 가능 구조로 정리

### 이슈 B: Form 업로드 API 추가 후 Brain 부팅 실패
- 원인
  - `python-multipart` 누락
- 조치
  - requirements 고정 추가

### 이슈 C: 결과 파일 경로는 나오는데 실제 파일이 없음
- 원인
  - Agent 컨트롤러가 메모리 시뮬레이션만 수행
- 조치
  - `save_document(path)`에서 실제 디스크 저장 수행

### 이슈 D: 결과 파일 선택 시 Viewer 미표시 + 부모/자식 diff 불가
- 원인
  - 결과 파일은 디스크 경로 기반인데, UI가 업로드 File 객체 경로만 처리
- 조치
  - Agent에 path 기반 preview/render API 추가
  - UI에서 `storedPath` 파일 자동 미리보기 로드/재시도 및 compare payload 반영

## 4. 현재 상태
- Runtime 부팅/연동/실행 파이프라인이 구조적으로 연결됨.
- 결과 파일 경로 기반 PDF 미리보기 경로가 구현됨.
- HWPX 스타일/치환 반영을 위한 controller 메서드 및 코드 생성 경로가 반영됨.

## 5. 남은 확인 항목 (실운영 검증 필요)
- Windows VM에서 최신 코드 `--sync` 후 재실행 기준으로 아래 확인 필요:
  1. Codex 로그인 완료 후 Auth 화면이 정상 전환되는지
  2. 실행 결과 파일이 `results/`에 실제 생성되는지
  3. 생성된 결과 파일이 PDF viewer로 로드되는지
  4. 부모-자식 diff에서 변경 강조가 정상 표시되는지
  5. HWPX에서 폰트/크기/굵기 변경이 viewer 비교 결과에 반영되는지

## 6. 실행/점검 명령(Windows VM)
```cmd
C:\dev\hihangul\scripts\dev\start_hihangul_windows.cmd --sync --precise --remote-debug
```

```cmd
findstr /N /C:"/v1/viewer/preview-from-path" C:\dev\hihangul\apps\windows-agent\app\main.py
findstr /N /C:"/v1/viewer/render-pdf-from-path" C:\dev\hihangul\apps\windows-agent\app\main.py
```

```cmd
curl -s http://localhost:8000/v1/auth/codex/status
curl -s http://localhost:9000/health
```

## 7. 참고
- 이번 작업은 로컬 우선/OpenClaw 스타일 저장 및 실행 파이프라인 정착을 우선 목표로 했으며,
  이후 실제 Hancom OLE/엔진 기반 "정확 수정 품질" 튜닝이 후속 과제임.
