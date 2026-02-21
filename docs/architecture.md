# HiHangul Architecture

아래 Mermaid 코드는 계획서 기준 통합 아키텍처입니다.

```mermaid
graph TD
    classDef layer1 fill:#E3F2FD,stroke:#1565C0,stroke-width:2px;
    classDef layer2 fill:#FFF3E0,stroke:#EF6C00,stroke-width:2px;
    classDef layer3 fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px;
    classDef layer4 fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px;
    classDef layerMac fill:#ECEFF1,stroke:#607D8B,stroke-width:2px,stroke-dasharray: 5 5;

    User((User))

    subgraph Layer1 [Layer 1: User Interface (Windows Electron)]
        direction TB
        UI[Chat Interface]
        Launcher[Persistent Program Launcher]
        DiffViewer[Visual Diff Viewer]
        AuthUI[Auth and API Key Input]
    end

    subgraph Layer2 [Layer 2: Intelligence and Control (Windows Brain)]
        direction TB
        subgraph SessionRouter [Session Router]
            AuthGuard{Auth and Lane Isolation}
            LaneQueue[Lane Queue]
        end

        subgraph Brain [Cognitive Core]
            NLU[NLU Engine]
            Planner[Agent Planner]
            Orchestrator{LLM Orchestrator}
        end

        subgraph MemorySys [Hybrid Memory]
            MDKnowledge[Mutable Knowledge (.md)]
            JSONLLogs[Immutable Logs (.jsonl)]
            VectorIndex[SQLite Vec Index]
        end

        subgraph PromptSys [Prompt Assembler]
            Assembler[Prompt Assembler]
            Guardrails[Security Guardrails]
        end
    end

    subgraph Layer3 [Layer 3: Execution and Verification (Windows Agent)]
        direction TB
        SecurityCheck{AST Code Validator}
        Sandbox[Isolated Python VENV]
        Packager[Program Packager]
        AbstractCtrl{{HwpController Interface}}
        AdapterPy[PyHwpx Adapter]
        AdapterNative[Native API Adapter]
    end

    subgraph Layer4 [Layer 4: System (Windows)]
        direction TB
        WinOS[Windows OS]
        HwpExe[Hancom Office Hwp.exe]
        LocalStorage[Persistent Local Storage]
        Keyring[OS Keyring]
    end

    subgraph MacDev [Developer Workstation (macOS)]
        direction LR
        DevTools[Chrome DevTools :9222]
        IDE[VS Code]
    end

    User --> UI
    UI --> AuthGuard
    AuthGuard --> LaneQueue
    Launcher --> LaneQueue

    LaneQueue --> NLU --> Planner
    Planner <--> MemorySys
    Planner --> Assembler
    Guardrails -.-> Assembler
    Assembler --> Orchestrator
    
    Orchestrator -->|Generated Code\nLocal API| SecurityCheck

    SecurityCheck -->|Pass| Sandbox
    Sandbox --> AbstractCtrl --> AdapterPy --> HwpExe
    Sandbox --> AbstractCtrl --> AdapterNative --> HwpExe

    Sandbox -.->|Success| Packager
    Packager --> LocalStorage
    LocalStorage -.-> Launcher
    HwpExe --> DiffViewer --> User
    AuthUI -.-> Keyring

    DevTools -.->|Remote Debug| UI
    IDE -.->|Sync Code| Layer1
    IDE -.->|Sync Code| Layer2
    IDE -.->|Sync Code| Layer3

    class UI,Launcher,DiffViewer,AuthUI layer1;
    class AuthGuard,LaneQueue,NLU,Planner,Orchestrator,MDKnowledge,JSONLLogs,VectorIndex,Assembler,Guardrails layer2;
    class SecurityCheck,Sandbox,Packager,AbstractCtrl,AdapterPy,AdapterNative layer3;
    class WinOS,HwpExe,LocalStorage,Keyring layer4;
    class DevTools,IDE layerMac;
```

