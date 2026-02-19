# HiHangul UI 수동 E2E 테스트 템플릿 (Antigravity + Chrome DevTools)

- 작성일: YYYY-MM-DD
- 작성자: <name>
- 브랜치/커밋: `<branch>` / `<commit>`
- 테스트 환경: `Windows VM + Electron + Chrome DevTools Remote`

## 1. 목적
- Antigravity 에이전트가 Chrome DevTools로 실제 UI를 직접 조작해 핵심 사용자 흐름을 검증한다.
- 실패 시 재현 가능한 증거(콘솔/네트워크/스크린샷)와 수정 제안을 함께 남긴다.

## 2. 사전 준비 (Preflight)

### 2.0 테스트 환경 정의 (필수 기입)
- Host OS: `<macOS version>`
- Guest OS: `<Windows version>`
- Parallels: `<version>`
- Hancom Office(HWP): `<installed / not installed>`
- 테스트 파일:
- `sample.hwp` (권장: 1~5MB)
- `sample.hwpx` (권장: 1~5MB)
- 네트워크:
- Windows Brain `http://localhost:8000`
- Windows Agent `http://localhost:9000`

### 2.1 서비스 기동
1. Windows에서 아래 실행:
```cmd
scripts\dev\start_hihangul_windows.cmd --sync
```
2. 헬스체크:
```cmd
curl http://localhost:8000/health
curl http://localhost:9000/health
```
3. 기대 결과:
- Brain: `{"status":"ok", ...}`
- Agent: `{"status":"ok"}`

### 2.1.1 API 구현 존재 확인 (오해 방지용)
아래 호출로 `render-pdf`/`preview` 라우트가 서버에 등록되어 있는지 먼저 확인:
```cmd
curl http://localhost:9000/openapi.json
```
기대 결과:
- `"/v1/viewer/render-pdf"` 존재
- `"/v1/viewer/preview"` 존재

주의:
- `render-pdf`는 **windows-agent에 구현되어 있음**.
- 실패 원인을 "엔드포인트 미구현"으로 단정하지 말고, 상태코드/응답본문/서버로그 기준으로 분류.

### 2.2 DevTools 연결
1. `chrome://inspect` 열기
2. `Configure...` 에 `<WINDOWS_IP>:9222` 추가 (예: `10.211.55.3:9222`)
3. Electron target `inspect` 클릭

### 2.3 원격 디버깅 활성화 확인
Windows CMD:
```cmd
set HIHANGUL_ENABLE_REMOTE_DEBUGGING=1
call scripts\dev\start_hihangul_windows.cmd --sync
```
확인 포인트:
- Electron이 `9222` 포트를 열고 있어야 함
- `chrome://inspect`에서 타겟이 보여야 함

## 3. 테스트 범위
- 로그인 진입/전환
- 세션 생성/전환/삭제
- 프롬프트 전송 및 응답 렌더링
- 파일 업로드 및 문서 패널 표시
- HWP PDF 렌더링 우선 경로 + fallback 경로

## 4. 테스트 실행 시나리오

### TC-01 로그인 화면 진입 및 메인 진입
- 절차:
1. 앱 실행 후 로그인 화면 노출 확인
2. `Claude` 또는 `Codex` 선택
3. 시작 버튼 클릭
- 기대 결과:
- 메인 화면으로 정상 전환
- FAIL 시 기록:
- 콘솔 에러
- 네트워크 실패 요청

### TC-02 세션 생성/전환/삭제
- 절차:
1. 새 세션 생성
2. 다른 세션 선택하여 전환
3. 세션 삭제(컨텍스트 메뉴 포함)
- 기대 결과:
- 빈 화면 없이 정상 전환/삭제
- 활성 세션 포인터가 유효하게 유지됨

### TC-03 프롬프트 전송 및 응답 렌더링
- 절차:
1. 입력창에 테스트 프롬프트 입력
2. 전송 버튼 클릭
3. 메시지 리스트 렌더링 확인
- 기대 결과:
- 사용자 메시지/응답 메시지 모두 표시
- 렌더 중 UI 멈춤/깨짐 없음

한글 입력 제한 우회(도구 제약 시):
1. ASCII 프롬프트로 기본 플로우 검증 (`test automation`)
2. 필요 시 DevTools Console에서 input value 주입 후 `input`/`change` 이벤트 디스패치
3. 또는 붙여넣기 방식으로 입력

### TC-04 파일 업로드 및 문서 패널 표시
- 절차:
1. 파일 업로드 버튼 클릭
2. 파일 선택 후 업로드
3. 문서 패널 렌더링 확인
- 기대 결과:
- 파일명/크기 표기 정상
- 파일 상태 로딩/완료 상태 정상

### TC-05 HWP 렌더링 우선 경로 확인
- 절차:
1. `.hwp` 또는 `.hwpx` 파일 업로드
2. DevTools Network 탭에서 호출 확인
- 기대 결과:
- 1차: `POST /v1/viewer/render-pdf`
- 성공 시 PDF 뷰 표시

판정 기준:
- `200 + application/pdf` => PASS
- `4xx/5xx` => FAIL (단, 즉시 TC-06 fallback까지 이어서 판정)

### TC-06 fallback 경로 확인
- 절차:
1. `render-pdf` 실패 상황 유도(엔진 미가용/의도적 실패 환경)
2. Network 탭 확인
- 기대 결과:
- 2차: `POST /v1/viewer/preview` 호출
- 텍스트/구조화 프리뷰 표시

판정 기준:
- `render-pdf` 실패 + `preview` 성공 => PARTIAL PASS
- 둘 다 실패 => FAIL

### TC-06.1 render-pdf 실패 원인 분류 (필수)
아래 분류표로 기록:

| 조건 | 분류 | 조치 |
| --- | --- | --- |
| `openapi.json`에 경로 없음 | 라우트 누락/실행 바이너리 불일치 | 배포/실행 경로 재확인 |
| 경로는 있으나 `500` + engine 관련 메시지 | HWP 엔진/COM/Hancom 설치 이슈 | Hancom 설치/권한/COM 상태 점검 |
| `400` + 파일 확장자/크기 오류 | 입력 파일 문제 | 확장자/용량 제한 준수 |
| `502/timeout` 또는 연결 실패 | 서비스 기동/네트워크 이슈 | Agent 프로세스/포트 상태 점검 |

주의:
- 본 프로젝트 `render-pdf`는 LibreOffice 전제가 아님.
- 우선 의존성은 Windows Hancom/HWP COM 엔진.

### TC-07 콘솔/네트워크 에러 점검
- 절차:
1. Console 탭의 `error`, `unhandled rejection` 확인
2. Network 탭의 `4xx/5xx` 요청 필터링
- 기대 결과:
- 치명 오류 없음
- 실패 요청은 원인과 복구 경로가 명확함

## 5. 결과 기록 표 (PASS/FAIL)

| Test Case | Result | Evidence | Notes |
| --- | --- | --- | --- |
| TC-01 로그인 | PASS/FAIL | screenshot/log link | |
| TC-02 세션 동작 | PASS/FAIL | screenshot/log link | |
| TC-03 프롬프트 | PASS/FAIL | screenshot/log link | |
| TC-04 업로드 | PASS/FAIL | screenshot/log link | |
| TC-05 render-pdf | PASS/FAIL | network capture | |
| TC-06 fallback | PASS/FAIL | network capture | |
| TC-07 오류 점검 | PASS/FAIL | console/network dump | |

## 6. 실패 항목 상세 (필수)

### F-01 <실패 제목>
- 재현 절차:
1. ...
2. ...
3. ...
- 실제 결과:
- 기대 결과:
- 증거:
- Console:
```text
<error log>
```
- Network:
```text
<request url / status / response>
```
- Server log:
```text
<windows-agent terminal log>
```
- Screenshot: `<path or link>`
- 추정 원인 파일:
- `apps/windows-ui/...`
- `apps/windows-brain/...`
- `apps/windows-agent/...`
- 수정 제안:
1. ...
2. ...

## 7. 최종 요약
- 총 케이스: 7
- PASS: <n>
- FAIL: <n>
- Blocker: <yes/no>
- 릴리즈 판단: `GO / NO-GO`

## 8. 후속 액션
1. 우선순위 높은 실패부터 수정 이슈 생성
2. 수정 후 동일 템플릿으로 재검증
3. 반복 실패 케이스는 자동화 테스트(Playwright)로 승격
