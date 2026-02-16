# HiHangul 세션 로컬 저장 보안 설계 (계획서 반영)

## 기준 (계획서 매핑)
- Local-First: 세션/대화 데이터는 Windows 로컬 디스크에만 저장
- Hybrid Memory: 가변 상태는 JSON, 감사 로그는 JSONL(불변 append)
- Zero-Data-Leakage: 세션 저장/로드 시 외부 네트워크 전송 없음
- Guardrails: 입력 정규화/길이 제한/제어문자 제거 적용

## 구현 방식

### 1) 저장 위치 고정
- Electron `app.getPath("userData")` 하위 고정 경로 사용
- 경로:
  - `session-store/sessions.json` (가변 스냅샷)
  - `session-store/session-events.jsonl` (불변 감사 로그)
- 사용자 입력으로 경로를 받지 않음 (path traversal 차단)

### 2) 데이터 정규화 (Save 전)
- 세션 개수 상한: 200
- 세션당 메시지 상한: 500
- 문자열 길이 제한:
  - session id: 128
  - title: 120
  - message id: 128
  - message content: 4000
- 제어문자 제거 (`\u0000`~`\u001F`, `\u007F` 일부)
- 허용 role 화이트리스트: `user | assistant | system`

### 3) 원자적 저장
- `sessions.json.tmp`에 먼저 기록 후 `rename`으로 교체
- 부분 쓰기/중간 파일 손상 리스크 완화

### 4) 감사 로그 (Immutable JSONL)
- 저장 시마다 `session-events.jsonl`에 append
- 포함 항목: `ts`, `event`, `sessions`, `activeSessionId`
- 이벤트 로그는 덮어쓰기 없이 누적

### 5) 로드/실패 복구
- 로드 실패/파싱 실패 시 빈 세션으로 안전 복구
- UI는 ErrorBoundary + 로깅으로 흰화면 대신 복구 화면 제공

## 보안 경계
- 렌더러는 preload 브리지 통해서만 저장/로드 접근
- Node API 직접 노출 금지(`contextIsolation: true`, `nodeIntegration: false`)

## 비고
- 현재 구현은 로컬 저장 보안(무유출/무경로조작/정규화/감사) 중심
- 향후 강화 항목:
  - OS Keyring 기반 민감 필드 분리 저장
  - 저장 파일 무결성(HMAC) 검증
  - 세션 보관기간/자동 파기 정책
