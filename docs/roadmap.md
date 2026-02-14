# Development Roadmap

## Phase 1 (1-2 months)

- Parallels 네트워크/포트 포워딩 기반 통신 채널 구축
- Windows `HwpController` API 서버 기본 동작 완료
- Windows Brain과 Windows Agent 간 E2E 실행 루프 연결

## Phase 2 (3-4 months)

- Lane Queue 직렬화 고도화 (재시도/타임아웃/우선순위)
- Hybrid Memory + SQLite vec 검색 품질 개선
- Prompt Guardrails 정책 강화 및 정책 버저닝

## Phase 3 (5-6 months)

- Persistent Program Launcher 구현
- 자동화 앱 패키징/매니페스트/버전업 체계 구축
- Diff Viewer 품질 개선 및 승인 워크플로우 연동

## Verification Checklist

1. 세션 격리 테스트: 동시 요청 시 lane 별 순차 처리
2. 보안 침투 테스트: 위험 프롬프트/코드 차단
3. 데이터 무결성 테스트: 대용량 HWP 변경 안정성
4. 영속성 테스트: 재부팅 후 Launcher 원클릭 실행

