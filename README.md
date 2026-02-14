# HiHangul

로컬 우선(Local-First) HWP 업무 자동화 자율 에이전트의 초기 스캐폴드입니다.

## Monorepo 구조

```text
apps/
  windows-brain/        # FastAPI: 세션 라우팅, 레인 직렬화, 메모리, 오케스트레이션
  windows-agent/    # FastAPI: AST 검증, 샌드박스 실행, HwpController 어댑터
  windows-ui/           # Electron/React UI 자리
docs/
  architecture.md   # Mermaid 아키텍처
  roadmap.md        # 단계별 개발/테스트 계획
shared/
  memory/           # Markdown/JSONL/SQLite 저장소
scripts/dev/        # 로컬 실행 스크립트
```

## 빠른 시작

### 1) Windows Brain 실행

```bash
cd apps/windows-brain
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2) Windows Agent 실행 (Windows VM)

```bash
cd apps/windows-agent
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 9000
```

### 3) Mac UI 실행 (Electron)

```bash
cd apps/windows-ui
npm install
npm run dev
```

## 핵심 구현 상태

- Lane Queue 기반 세션별 직렬 실행: 구현
- Hybrid Memory (Markdown, JSONL, SQLite): 기본 구현
- Prompt Guardrails 주입: 구현
- AST Code Validator: 위험 명령 차단 기본 구현
- HwpController 추상화 + PyHwpx/Native 어댑터 골격: 구현
- Program Launcher / Diff Viewer / Electron UI: 기본 동작 가능한 스캐폴드 구현


## Windows Runtime (Recommended)

Run all runtime services on Windows local machine (`C:\dev\hihangul`):

```cmd
scripts\dev\start_hihangul_windows.cmd
```

It starts:

- Brain API: `localhost:8000`
- Windows Agent: `localhost:9000`
- Electron UI

macOS is used as development/debug host only.
