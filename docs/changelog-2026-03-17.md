# Changelog — 2026-03-17

## 개요

HwpController 기능 확장, Brain 가드레일 동기화, UI UX 개선 등 6개 항목을 구현하였다.
대상 파일은 Agent(`hwp_controller.py`), Brain(`guardrails.py`), UI(`App.tsx`) 세 레이어에 걸쳐 있다.

---

## 1. `except_first_line` 스코프 지원

**파일**: `apps/windows-agent/app/hwp_controller.py`

기존에 `scope` 파라미터는 `"all"`(전체)과 `"first_line"`(첫 줄만)만 지원했다.
NLU가 파싱할 수 있는 `"except_first_line"`(첫 줄 제외)이 컨트롤러에서 무시되던 문제를 수정했다.

### 적용 함수

| 함수 | 동작 |
|---|---|
| `_hwpx_replace_text` | 첫 번째 `<hp:t>` 매치를 건너뛰고 나머지에서 텍스트 치환 |
| `_hwpx_apply_style` | 첫 번째 텍스트 run을 건너뛰고 나머지에 스타일(볼드/폰트 크기/폰트 패밀리) 적용 |
| `_hwpx_apply_align` | 첫 번째 텍스트 문단을 건너뛰고 나머지에 정렬 적용 |

### 사용 예

```python
def run(controller):
    controller.open_document("input.hwpx")
    controller.set_font_size(14, scope="except_first_line")  # 제목(첫 줄) 유지, 본문만 14pt
    controller.save_document("output.hwpx")
```

---

## 2. 가드레일 화이트리스트 동기화

**파일**: `apps/windows-brain/app/guardrails.py`

`HwpController` ABC에 정의된 메서드 중 6개가 `_ALLOWED_CONTROLLER_METHODS`에 누락되어 있었다.
LLM이 생성한 코드에서 이 메서드를 사용하면 가드레일이 부당하게 차단하는 문제가 있었다.

### 추가된 메서드

| 메서드 | 용도 |
|---|---|
| `set_align(align, scope)` | 문단 정렬 변경 |
| `align_center()` | 가운데 정렬 단축 |
| `move_doc_begin()` | 문서 시작으로 커서 이동 |
| `move_para_end()` | 문단 끝으로 커서 이동 |
| `select_para()` | 현재 문단 선택 |
| `run_action(action_id)` | 범용 액션 실행 |

`GUARDRAIL_POLICY` 프롬프트 문자열도 동일하게 업데이트하여 LLM이 허용 메서드 목록을 정확히 인지하도록 했다.

---

## 3. 테이블 편집 기능

**파일**: `apps/windows-agent/app/hwp_controller.py`, `apps/windows-brain/app/guardrails.py`

기존에 `edit_table` 인텐트를 NLU가 인식했으나 실제 테이블 조작 메서드가 없었다.
HWPX XML 구조(`<hp:tbl>` → `<hp:tr>` → `<hp:tc>`)를 파싱/수정하는 3개 메서드를 추가했다.

### 새 메서드

| 메서드 | 시그니처 | 설명 |
|---|---|---|
| `get_table_cell_text` | `(table_index, row, col) → str` | 특정 셀의 텍스트 읽기 |
| `set_table_cell_text` | `(table_index, row, col, text) → None` | 특정 셀의 텍스트 변경 |
| `get_table_dimensions` | `(table_index) → (rows, cols)` | 테이블 행·열 수 조회 |

### 헬퍼 함수

- `_hwpx_get_tables(hwpx_bytes)` — HWPX ZIP 내 모든 섹션에서 테이블을 추출하여 `list[list[list[str]]]` 반환
- `_hwpx_set_table_cell_text(hwpx_bytes, table_index, row, col, text)` — 지정 셀 텍스트를 교체한 HWPX 바이트 반환

### 사용 예

```python
def run(controller):
    controller.open_document("report.hwpx")
    rows, cols = controller.get_table_dimensions(0)
    for r in range(rows):
        cell = controller.get_table_cell_text(0, r, 2)
        if "미정" in cell:
            controller.set_table_cell_text(0, r, 2, "확정")
    controller.save_document("report_result.hwpx")
```

---

## 4. 세션 이름 변경 (UI)

**파일**: `apps/windows-ui/src/renderer/App.tsx`

사이드바 세션 목록에서 우클릭 시 "세션 삭제"만 가능했던 컨텍스트 메뉴에 **"세션 이름 변경"** 옵션을 추가했다.

### 동작 방식

1. 세션을 우클릭 → "세션 이름 변경" 클릭
2. 세션 버튼이 인라인 입력 필드로 전환 (자동 포커스)
3. **Enter** → 새 이름 저장, **Escape** → 취소, **Blur** → 저장
4. 빈 문자열 입력 시 변경 무시

### 추가된 상태

```tsx
const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
const [renameText, setRenameText] = useState('');
```

---

## 5. 설정 패널 (UI)

**파일**: `apps/windows-ui/src/renderer/App.tsx`

워크스페이스 헤더의 Settings 버튼이 no-op이었던 것을 실제 모달로 연결했다.

### SettingsModal 구성

| 섹션 | 내용 |
|---|---|
| **Service Connections** | Brain/Agent 서버 `/health` 엔드포인트 체크 → 상태 표시 (green/red dot) |
| **About** | 앱 버전, Electron 버전, Chrome 버전 |

### 추가된 상태

```tsx
const [isSettingsOpen, setIsSettingsOpen] = useState(false);
```

---

## 6. 실행 취소 (Undo) 메커니즘

**파일**: `apps/windows-agent/app/hwp_controller.py`, `apps/windows-brain/app/guardrails.py`

문서 수정 후 롤백할 수 있는 스냅샷 기반 undo 메커니즘을 추가했다.

### 새 메서드

| 메서드 | 시그니처 | 설명 |
|---|---|---|
| `create_snapshot` | `() → str` | 현재 문서 상태(텍스트 + 바이트)를 저장, 스냅샷 ID 반환 |
| `restore_snapshot` | `(snapshot_id) → None` | 지정 스냅샷으로 문서 상태 복원 |

### 내부 구현

- `_snapshots: dict[str, tuple[str, bytes | None]]` 필드에 스냅샷 저장
- 바이트 데이터는 `bytes[:]` 슬라이스 복사로 독립성 보장
- 존재하지 않는 스냅샷 ID로 복원 시 `HwpControllerStateError` 발생

### 사용 예

```python
def run(controller):
    controller.open_document("input.hwpx")
    snap = controller.create_snapshot()        # 원본 상태 백업
    controller.set_bold(True, scope="all")
    controller.set_font_size(16, scope="first_line")
    # 결과가 마음에 안 들면:
    # controller.restore_snapshot(snap)         # 원본으로 롤백
    controller.save_document("output.hwpx")
```

---

## 검증 결과

| 항목 | 결과 |
|---|---|
| Python 구문 검사 (`ast.parse`) | hwp_controller.py OK, guardrails.py OK |
| 기존 단위 테스트 6개 (`pytest`) | 전체 통과 |
| 가드레일 메서드 목록 | ABC 정의 ↔ 화이트리스트 ↔ 정책 문자열 완전 일치 |

---

## 변경 파일 목록

| 파일 | 변경 내용 |
|---|---|
| `apps/windows-agent/app/hwp_controller.py` | except_first_line 스코프, 테이블 메서드 3종, 스냅샷 메서드 2종, 헬퍼 함수 2종 |
| `apps/windows-brain/app/guardrails.py` | 허용 메서드 11종 추가, 정책 문자열 업데이트 |
| `apps/windows-ui/src/renderer/App.tsx` | 세션 이름 변경, SettingsModal, 관련 상태 변수 |
