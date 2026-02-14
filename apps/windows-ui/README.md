# windows-ui

Electron + React + TypeScript 기반 Layer 1 UI 스캐폴드입니다.

## 포함 컴포넌트

- Chat Interface
- Auth & API Key Input
- Persistent Program Launcher 패널
- Visual Diff Viewer 패널 (생성 코드 확인)

## 실행

```bash
cd apps/windows-ui
npm install
npm run dev
```

Chrome 디버깅 포트는 Electron 메인 프로세스에서 `9222`로 열립니다.
`chrome://inspect`에서 attach 가능합니다.
