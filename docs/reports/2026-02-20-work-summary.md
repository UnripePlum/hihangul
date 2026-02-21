# 2026-02-20 작업 요약

## 1. 개요
* 문서(Docs) 검토 및 최신 아키텍처에 맞지 않는 낡은 정보 수정
* `sqlite-vec` 플러그인과 Ollama `bge-m3` 모델을 이용한 초고속 로컬 벡터 검색 연동
* 프로젝트 성격에 맞춰 엔터프라이즈 느낌으로 README.md 재구성

## 2. 작업 상세 내역

### 2.1 아키텍처 문서 수정
* **대상 파일**: `docs/architecture.md`
* **변경 사항**: 
  * 기존 문서 상 macOS가 메인 백엔드 환경(Brain, UI 등)인 것처럼 잘못 묘사된 부분을 파악.
  * Windows 전용 런타임으로 변경된 실제 구조(`windows-ui`, `windows-brain`, `windows-agent`)에 맞게 Mermaid 다이어그램을 최신화.
  * Mac은 Remote DevTools 및 IDE 동기화를 목적으로 하는 개발 환경 레이어로만 표시.

### 2.2 벡터 검색 기능(Vector Search) 구현
* **대상 파일**: `apps/windows-brain/requirements.txt`, `apps/windows-brain/app/embedder.py`, `apps/windows-brain/app/memory.py`
* **변경 사항**:
  * `sqlite-vec>=0.1.1` 패키지 추가.
  * 로컬 Ollama 환경을 호출하여 텍스트를 `bge-m3` 1024차원 벡터로 변환해주는 `Embedder` 클래스 신규 개발.
  * `HybridMemory` 클래스 내 `sqlite-vec` 연동.
    * `vec_memory` 가상 테이블(`vec0`) 생성 프로세스 추가.
    * 데이터 저장(`upsert_index`) 시 직렬화된 벡터 동시 저장.
    * 데이터 검색(`search_index`) 시 코사인 유사도(`vec_distance_cosine`)로 KNN 고도화.
  * 확장 모듈 로드가 실패하는 환경에서도 기존 `LIKE` 쿼리 기반 텍스트 검색으로 동작할 수 있도록 안전한 롤백(Fallback) 구조 구축.

### 2.3 README.md 전면 개편
* **대상 파일**: `README.md`
* **변경 사항**:
  * OpenClaw 스타일을 참고하여, 기존 단순 스크립트 실행 위주의 README를 프로덕션 레벨 형태의 리드미 문서로 탈바꿈함.
  * 주요 기능 포인트(Cognitive Core, Lane Queue, Hybrid Memory, Zero-Trust Guardrails, Windows-Native) 명시.
  * 아키텍처 구조의 요약과 명확한 Windows 환경 빠른 시작 명령(`start_hihangul_windows.cmd`)을 중심으로 가이드 구성.
