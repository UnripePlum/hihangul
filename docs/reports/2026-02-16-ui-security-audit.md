# HiHangul Windows UI 보안 점검 보고서

- 점검 일시: 2026-02-16
- 범위: `apps/windows-ui` (Electron main/preload/renderer, `index.html`)
- 점검 방식: 코드 기반 정적 리뷰

## 요약
현재 UI 런타임에는 개발 편의 설정이 운영 위험으로 이어질 수 있는 항목이 존재합니다.
가장 우선적으로 `원격 디버깅 외부 개방`, `Chromium 샌드박스 비활성화`, `외부 CDN 스크립트 직접 로드`를 제거해야 합니다.

## 주요 취약점

### 1) 원격 디버깅 포트 외부 개방 (치명적)
- 파일: `apps/windows-ui/src/main/electron.ts:17`
- 파일: `apps/windows-ui/src/main/electron.ts:18`
- 파일: `apps/windows-ui/src/main/electron.ts:19`
- 내용:
  - `remote-debugging-port=9222`
  - `remote-debugging-address=0.0.0.0`
  - `remote-allow-origins=*`
- 위험:
  - 동일 네트워크 내 제3자가 DevTools 프로토콜에 접근할 수 있는 구성입니다.
  - 브라우저 컨텍스트 조작, 민감 데이터 노출, 코드 실행 위험으로 이어질 수 있습니다.
- 권고:
  - 운영 빌드에서 원격 디버깅 스위치 완전 제거
  - 개발 모드에서도 `127.0.0.1`로 제한
  - 필요 시 사용자 승인 기반 일회성 토글만 허용

### 2) Chromium 샌드박스 비활성화 (치명적)
- 파일: `apps/windows-ui/src/main/electron.ts:15`
- 내용:
  - `app.commandLine.appendSwitch("no-sandbox")`
- 위험:
  - 렌더러 취약점 발생 시 프로세스 격리 보호가 약화됩니다.
- 권고:
  - 운영 환경에서 `no-sandbox` 제거
  - 반드시 필요한 VM 특수 케이스는 별도 실행 옵션으로 분리

### 3) 외부 CDN 스크립트 직접 로드 + CSP 부재 (높음)
- 파일: `apps/windows-ui/index.html:7`
- 내용:
  - `https://cdn.tailwindcss.com` 런타임 로드
- 위험:
  - 공급망 공격 시 앱 시작 시점에 악성 스크립트 실행 가능
  - CSP 미적용 시 스크립트 정책이 느슨함
- 권고:
  - Tailwind를 빌드 타임(로컬 번들)로 전환
  - 운영용 CSP 설정 추가 (`script-src 'self'` 중심)

### 4) 세션 데이터 평문 저장 (중간)
- 파일: `apps/windows-ui/src/main/electron.ts:201`
- 파일: `apps/windows-ui/src/main/electron.ts:207`
- 내용:
  - 세션/대화가 JSON, JSONL로 로컬 저장
- 위험:
  - 공유 PC/로컬 계정 침해 시 대화 내용 노출 가능
- 권고:
  - 저장 파일 OS 권한 최소화
  - 옵션 기반 암호화(Windows DPAPI 등) 적용 검토

### 5) 쉘 실행 지점 존재 (중간)
- 파일: `apps/windows-ui/src/main/electron.ts:40`
- 파일: `apps/windows-ui/src/main/electron.ts:80`
- 파일: `apps/windows-ui/src/main/electron.ts:297`
- 위험:
  - 현재는 고정 명령이지만 향후 사용자 입력이 연결될 경우 명령 주입 위험
- 권고:
  - `shell: true` 사용 최소화
  - 고정 바이너리/인자 화이트리스트 유지

## 양호 항목
- `contextIsolation: true`, `nodeIntegration: false` 설정 유지
- preload 경유 IPC 접근으로 렌더러 직접 Node 접근 차단
- 렌더러 코드 내 `dangerouslySetInnerHTML`, `eval`, `new Function` 미사용

## 우선 조치 계획
1. 운영 빌드에서 원격 디버깅 옵션 제거
2. 운영 빌드에서 `no-sandbox` 제거
3. Tailwind CDN 의존 제거(로컬 빌드 파이프라인)
4. CSP 정책 적용
5. 세션 저장 보호 강화(DPAPI/권한 제한)

## 점검 한계
- 네트워크 제한으로 `npm audit` 원격 취약점 DB 조회 실패
- 동적 실행/침투 테스트는 본 점검 범위 외
