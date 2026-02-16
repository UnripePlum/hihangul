// @ts-nocheck
import React, { useMemo, useRef, useState } from "react";
import { Terminal, MessageSquare, FileText, Play, Save, Cpu, LogOut, Send, ArrowRightLeft, Loader2, Box, Home, Plus, X, Sidebar, Settings } from "lucide-react";

type Provider = "claude" | "codex";

type Session = {
  id: string;
  title: string;
  updatedAt: number;
  messages: { id: string; role: "user" | "assistant" | "system"; content: string }[];
};

type WorkspaceFile = {
  id: string;
  name: string;
  size: string;
  type: "hwp" | "xlsx" | "pdf" | "other";
  date: string;
};

function logUiError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  const detail = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { error };
  // eslint-disable-next-line no-console
  console.error(`[ui:${scope}]`, { ...detail, ...(context ?? {}) });
}

class UiErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): { hasError: boolean; message: string } {
    return { hasError: true, message: error?.message ?? "unknown error" };
  }

  componentDidCatch(error: Error): void {
    logUiError("react.boundary", error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <main className="login-page">
          <section className="panel login-panel">
            <h2>UI 복구 모드</h2>
            <p className="error">렌더링 오류가 발생했습니다: {this.state.message}</p>
            <button className="connect-btn" onClick={() => window.location.reload()}>다시 시작</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

const LAUNCHER_APPS = [
  { id: "table-border", title: "표 테두리 자동화", description: "문서 표의 외곽선/내부선을 표준 규칙으로 통일", usageCount: 128 },
  { id: "masking", title: "개인정보 마스킹", description: "주민번호/전화번호 패턴 탐지 후 마스킹 처리", usageCount: 45 },
  { id: "reference-style", title: "참고문헌 정리", description: "각주/미주 스타일을 지정 포맷으로 자동 정리", usageCount: 12 },
  { id: "doc-clean", title: "문서 정리", description: "공백/문단/폰트를 일괄 표준화", usageCount: 9 },
];

const FILES: WorkspaceFile[] = [
  { id: "f1", name: "report_v1.hwp", size: "1.2 MB", type: "hwp", date: "2024-05-20" },
  { id: "f2", name: "data_sheet.xlsx", size: "450 KB", type: "xlsx", date: "2024-05-19" },
  { id: "f3", name: "guidelines.pdf", size: "2.1 MB", type: "pdf", date: "2024-05-18" },
];

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function laneNumberFromSessionId(sessionId: string): number {
  if (!sessionId) return 100;
  let hash = 0;
  for (let i = 0; i < sessionId.length; i += 1) {
    hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 900) + 100;
}

function createSession(title = "새 세션"): Session {
  return {
    id: makeId("session"),
    title,
    updatedAt: Date.now(),
    messages: [
      {
        id: makeId("msg"),
        role: "assistant",
        content: "안녕하세요. 작업할 내용을 입력하면 자동화 프로그램을 생성합니다.",
      },
    ],
  };
}

function AuthScreen({ onLogin }: { onLogin: (provider: Provider) => void }): JSX.Element {
  const [provider, setProvider] = useState<Provider>("claude");
  const [connecting, setConnecting] = useState(false);

  return (
    <main className="login-page">
      <section className="panel login-panel modern-login">
        <div className="login-head">
          <div className="login-brand-logo">Hi</div>
          <h2 className="login-title">HiHangul 시작하기</h2>
          <p className="login-subtitle">AI 엔진을 선택하고 Windows 환경에 연결합니다.</p>
        </div>

        <div className="login-models">
          <label className="model-label">AI Model Selection</label>
          <div className="model-grid">
            <button className={`model-card ${provider === "claude" ? "selected claude" : ""}`} onClick={() => setProvider("claude")} type="button">
              <div className="model-icon claude-icon" aria-hidden="true">✦</div>
              <div className="model-name">Claude</div>
              <div className="model-meta">Anthropic Sonnet</div>
            </button>
            <button className={`model-card ${provider === "codex" ? "selected codex" : ""}`} onClick={() => setProvider("codex")} type="button">
              <div className="model-icon codex-icon" aria-hidden="true">◎</div>
              <div className="model-name">Codex</div>
              <div className="model-meta">OpenAI Code</div>
            </button>
          </div>
        </div>

        <button
          className="connect-btn"
          onClick={() => {
            try {
              setConnecting(true);
              window.setTimeout(() => onLogin(provider), 600);
            } catch (error) {
              logUiError("auth.connect", error, { provider });
              setConnecting(false);
            }
          }}
          disabled={connecting}
        >
          {connecting ? "연결 중..." : "시스템 연결 및 시작"}
        </button>
      </section>
    </main>
  );
}

function FileSidebar({
  files,
  activeFileId,
  onSelect,
  onUploadClick,
}: {
  files: WorkspaceFile[];
  activeFileId: string | null;
  onSelect: (file: WorkspaceFile) => void;
  onUploadClick: () => void;
}): JSX.Element {
  return (
    <aside className="file-sidebar">
      <div className="file-sidebar-head">
        <strong>Uploaded Files</strong>
        <button onClick={onUploadClick}>+</button>
      </div>
      <div className="file-sidebar-list">
        {files.length === 0 ? (
          <p className="file-empty">No files uploaded.</p>
        ) : (
          files.map((file) => (
            <button key={file.id} className={`file-item ${activeFileId === file.id ? "active" : ""}`} onClick={() => onSelect(file)}>
              <span className="file-item-name">{file.name}</span>
              <span className="file-item-meta">{file.size} • {file.date}</span>
            </button>
          ))
        )}
      </div>
      <div className="file-sidebar-foot">Drag & drop files to upload</div>
    </aside>
  );
}

function SaveLogicModal({ isOpen, onClose, onSave }: { isOpen: boolean; onClose: () => void; onSave: () => void }): JSX.Element | null {
  if (!isOpen) return null;
  return (
    <div className="save-modal-overlay" onClick={onClose}>
      <div className="save-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="save-modal-head">
          <h3>자동화 앱으로 저장</h3>
          <button className="ghost-btn" onClick={onClose}>닫기</button>
        </div>
        <label>
          앱 이름
          <input placeholder="예: 주간보고서 포맷팅" />
        </label>
        <label>
          설명
          <textarea rows={4} placeholder="이 앱이 수행하는 작업을 간단히 적어주세요." />
        </label>
        <p className="save-modal-note">현재 대화의 컨텍스트와 실행 로직이 Launcher 앱으로 저장됩니다.</p>
        <div className="save-modal-actions">
          <button className="ghost-btn" onClick={onClose}>취소</button>
          <button className="run" onClick={onSave}>앱 생성하기</button>
        </div>
      </div>
    </div>
  );
}

function MainApp({ onLogout }: { onLogout: () => void }): JSX.Element {
  const [currentView, setCurrentView] = useState<"dashboard" | "workspace" | "launcher">("dashboard");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [building, setBuilding] = useState(false);
  const [running, setRunning] = useState(false);
  const [diffMode, setDiffMode] = useState(false);
  const [showFileSidebar, setShowFileSidebar] = useState(true);
  const [fileList, setFileList] = useState<WorkspaceFile[]>(FILES);
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(FILES[0]);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [auditLog, setAuditLog] = useState("No action yet.");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeSession = useMemo(() => sessions.find((item) => item.id === activeSessionId) ?? null, [sessions, activeSessionId]);
  const sessionForView = activeSession ?? {
    id: "fallback-session",
    title: "복구 세션",
    updatedAt: Date.now(),
    messages: [
      {
        id: "fallback-msg",
        role: "assistant" as const,
        content: "세션을 찾지 못해 복구 모드로 표시 중입니다. 새 세션을 생성하거나 다시 선택하세요.",
      },
    ],
  };
  const laneNumber = useMemo(() => laneNumberFromSessionId(activeSessionId || sessionForView.id), [activeSessionId, sessionForView.id]);

  function openNewSession(): void {
    try {
      const next = createSession();
      setSessions((prev) => [next, ...prev]);
      setActiveSessionId(next.id);
      setCurrentView("workspace");
      setFileList([]);
      setActiveFile(null);
      setShowFileSidebar(false);
      setPrompt("");
    } catch (error) {
      logUiError("session.new", error);
    }
  }

  function openSession(id: string): void {
    try {
      const exists = sessions.some((item) => item.id === id);
      if (!exists) {
        const fallback = createSession("복구 세션");
        setSessions((prev) => [fallback, ...prev]);
        setActiveSessionId(fallback.id);
        setCurrentView("workspace");
        setFileList(FILES);
        setActiveFile(FILES[0]);
        setShowFileSidebar(true);
        // eslint-disable-next-line no-console
        console.warn("[ui:session.open] missing session id, fallback created", { id });
        return;
      }
      setActiveSessionId(id);
      setCurrentView("workspace");
      setFileList(FILES);
      setActiveFile(FILES[0]);
      setShowFileSidebar(true);
    } catch (error) {
      logUiError("session.open", error, { id });
    }
  }

  function startLauncherApp(appId: string): void {
    try {
      const app = LAUNCHER_APPS.find((a) => a.id === appId);
      if (!app) {
        // eslint-disable-next-line no-console
        console.warn("[ui:launcher.start] unknown app id", { appId });
        return;
      }
      if (!activeSession) {
        const next = createSession(app.title);
        setSessions((prev) => [next, ...prev]);
        setActiveSessionId(next.id);
      }
      setSessions((prev) => prev.map((s) => (s.id === (activeSession?.id ?? activeSessionId) ? {
        ...s,
        title: app.title,
        updatedAt: Date.now(),
        messages: [...s.messages, { id: makeId("msg"), role: "assistant", content: `${app.title} 앱을 실행합니다.` }],
      } : s)));
      setCurrentView("workspace");
      setFileList(FILES);
      setActiveFile(FILES[0]);
      setShowFileSidebar(true);
    } catch (error) {
      logUiError("launcher.start", error, { appId });
    }
  }

  function mapFileToWorkspaceFile(file: File): WorkspaceFile {
    const ext = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "";
    const type: WorkspaceFile["type"] = ext === "hwp" || ext === "xlsx" || ext === "pdf" ? ext : "other";
    const sizeMb = file.size / (1024 * 1024);
    const sizeText = sizeMb >= 1 ? `${sizeMb.toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    return {
      id: makeId("file"),
      name: file.name,
      size: sizeText,
      type,
      date: new Date().toLocaleDateString("ko-KR"),
    };
  }

  function openFileDialog(): void {
    fileInputRef.current?.click();
  }

  function onFilesSelected(event: React.ChangeEvent<HTMLInputElement>): void {
    try {
      const files = Array.from(event.target.files ?? []);
      if (!files.length) {
        return;
      }
      const mapped = files.map(mapFileToWorkspaceFile);
      setFileList((prev) => [...prev, ...mapped]);
      setActiveFile(mapped[0]);
      setShowFileSidebar(true);
      event.target.value = "";
    } catch (error) {
      logUiError("file.upload", error);
    }
  }

  function sendPrompt(): void {
    try {
      if (!activeSession || !prompt.trim()) return;
      const value = prompt.trim();
      setPrompt("");
      setBuilding(true);
      setSessions((prev) => prev.map((s) => (s.id === activeSession.id ? {
        ...s,
        updatedAt: Date.now(),
        messages: [...s.messages, { id: makeId("msg"), role: "user", content: value }],
      } : s)));

      window.setTimeout(() => {
        try {
          setBuilding(false);
          setSessions((prev) => prev.map((s) => (s.id === activeSession.id ? {
            ...s,
            updatedAt: Date.now(),
            messages: [...s.messages, { id: makeId("msg"), role: "assistant", content: "프로그램 초안을 생성했습니다. 실행 버튼을 눌러 로컬에서 수행하세요." }],
          } : s)));
          setAuditLog("Program created from intent only. Waiting for explicit Run click.");
        } catch (error) {
          logUiError("prompt.build.timeout", error);
        }
      }, 900);
    } catch (error) {
      logUiError("prompt.send", error, { hasActiveSession: !!activeSession });
    }
  }

  function runProgram(): void {
    try {
      if (!activeSession) return;
      setRunning(true);
      window.setTimeout(() => {
        try {
          setRunning(false);
          setDiffMode(true);
          setAuditLog("Local sandbox execution completed. Review visual diff before saving.");
          setSessions((prev) => prev.map((s) => (s.id === activeSession.id ? {
            ...s,
            updatedAt: Date.now(),
            messages: [...s.messages, { id: makeId("msg"), role: "assistant", content: "로컬 실행이 완료되었습니다. 우측 문서에서 Diff를 확인하세요." }],
          } : s)));
        } catch (error) {
          logUiError("program.run.timeout", error);
        }
      }, 1200);
    } catch (error) {
      logUiError("program.run", error, { hasActiveSession: !!activeSession });
    }
  }

  return (
    <main className="layout-shell">
      <aside className="left-nav">
        <div className="left-nav-brand" onClick={() => setCurrentView("dashboard")}>
          <div className="brand-mark">Hi</div>
          <span>HiHangul</span>
        </div>

        <div className="left-nav-group">
          <button className={`left-nav-btn ${currentView === "dashboard" ? "active" : ""}`} onClick={() => setCurrentView("dashboard")}>Dashboard</button>
        </div>

        <div className="left-nav-section">
          <div className="left-nav-head">
            <span>Active Sessions</span>
            <button onClick={openNewSession}>+</button>
          </div>
          <div className="left-nav-list left-session-list">
            {sessions.map((item) => (
              <button
                key={item.id}
                className={`left-session-item ${item.id === activeSessionId && currentView === "workspace" ? "active" : ""}`}
                onClick={() => openSession(item.id)}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>

        <div className="left-nav-section launcher-bottom">
          <div className="left-nav-head">
            <span>Launcher</span>
            <button className="expand-btn" onClick={() => setCurrentView("launcher")}>›</button>
          </div>
          <div className="left-nav-list">
            {LAUNCHER_APPS.slice(0, 3).map((app) => (
              <button key={app.id} className="left-launcher-item" onClick={() => startLauncherApp(app.id)}>{app.title}</button>
            ))}
          </div>
        </div>

        <div className="left-nav-group">
          <button className="left-nav-btn" onClick={onLogout}>Logout</button>
        </div>
      </aside>

      <section className="right-stage">
        {currentView === "dashboard" ? (
          <section className="dashboard-screen">
            <div className="dashboard-welcome">
              <h1>반갑습니다, HiHangul 사용자님</h1>
              <p>반복 업무를 자동화하고 최근 세션을 빠르게 이어서 작업하세요.</p>
            </div>

            <div className="dashboard-app-grid">
              <button className="dashboard-app-card create" onClick={openNewSession}>
                <strong>+ 새로운 앱 만들기</strong>
              </button>
              {LAUNCHER_APPS.map((app) => (
                <button key={app.id} className="dashboard-app-card" onClick={() => startLauncherApp(app.id)}>
                  <strong>{app.title}</strong>
                  <p>{app.description}</p>
                  <span className="app-usage">{app.usageCount}회 실행됨</span>
                </button>
              ))}
            </div>

            <div className="dashboard-recent">
              <h3>최근 대화 세션</h3>
              {sessions.length === 0 ? (
                <p className="file-empty">아직 생성된 세션이 없습니다. 새 세션을 시작하세요.</p>
              ) : (
                sessions.map((s) => (
                  <button key={s.id} className="dashboard-recent-row" onClick={() => openSession(s.id)}>
                    <span className="recent-main">
                      <strong>{s.title}</strong>
                      <small>{s.messages[s.messages.length - 1]?.content ?? "대화가 없습니다."}</small>
                    </span>
                    <span className="recent-date">{new Date(s.updatedAt).toLocaleDateString()}</span>
                  </button>
                ))
              )}
            </div>
          </section>
        ) : currentView === "launcher" ? (
          <section className="launcher-screen">
            <div className="launcher-screen-head">
              <h1>Launcher</h1>
              <p>저장된 자동화 앱 전체 목록입니다.</p>
            </div>
            <div className="launcher-screen-grid">
              {LAUNCHER_APPS.map((app) => (
                <button key={app.id} className="dashboard-app-card" onClick={() => startLauncherApp(app.id)}>
                  <strong>{app.title}</strong>
                  <p>{app.description}</p>
                  <span className="app-usage">{app.usageCount}회 실행됨</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="workspace-screen">
            <header className="workspace-top">
              <div className="workspace-title-wrap">
                <button className="ghost-btn icon-btn" onClick={() => setShowFileSidebar((v) => !v)} title="Toggle File List">
                  <Sidebar size={16} />
                </button>
                <h2>{sessionForView.title}</h2>
                <p className="lane-chip"><Cpu size={12} /> Lane #{laneNumber} Active</p>
              </div>
              <div className="workspace-top-actions">
                <button className="workspace-action-btn" onClick={() => setCurrentView("dashboard")}>Home</button>
                <button className={`workspace-action-btn diff-btn ${diffMode ? "on" : ""}`} onClick={() => setDiffMode((v) => !v)}>
                  <ArrowRightLeft size={14} />
                  {diffMode ? "Diff Mode On" : "View Diff"}
                </button>
                <span className="workspace-action-divider" />
                <button className="workspace-action-btn save-btn" onClick={() => setIsSaveModalOpen(true)}>
                  <Save size={14} />
                  Save as App
                </button>
                <button className="workspace-action-btn icon-btn settings-btn" title="Settings">
                  <Settings size={16} />
                </button>
              </div>
            </header>

            <div className={`workspace-body ${showFileSidebar ? "with-files" : ""}`}>
              <section className="chat-column">
                <div className="chat-scroll">
                  {sessionForView.messages.map((m) => (
                    <article key={m.id} className={`chat-msg-wrap ${m.role === "user" ? "is-user" : "is-ai"}`}>
                      <div className={`chat-msg-card ${m.role === "user" ? "user" : "ai"} ${m.role === "assistant" ? "agent-card" : ""}`}>
                        {m.role !== "user" ? (
                          <div className="chat-msg-agent-head">
                            <Terminal size={12} />
                            <span>Agent Logic</span>
                          </div>
                        ) : null}
                        <p className="chat-msg-text">{m.content}</p>
                        <p className="chat-msg-time">Now</p>
                      </div>
                    </article>
                  ))}
                  {(building || running) ? (
                    <article className="chat-msg-wrap is-ai">
                      <div className="chat-msg-card ai">
                        <div className="chat-msg-agent-head">
                          <Loader2 size={12} />
                          <span>{running ? "Windows 가상환경에서 실행 중..." : "프로그램 설계 중..."}</span>
                        </div>
                      </div>
                    </article>
                  ) : null}
                </div>

                <div className="chat-input-panel">
                  <div className="chat-input-row">
                    <input
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={activeFile ? "Hwp 문서에 대해 명령하세요..." : "파일을 먼저 업로드해주세요."}
                      disabled={!activeFile}
                    />
                    <button className="send-btn" onClick={sendPrompt} disabled={!activeFile || building || running || !prompt.trim()}>
                      <Send size={14} />
                    </button>
                  </div>
                  {!activeSession ? (
                    <div className="workspace-recover">
                      <button onClick={openNewSession}>+ New Session</button>
                    </div>
                  ) : null}
                </div>
              </section>

              {showFileSidebar ? (
                <FileSidebar files={fileList} activeFileId={activeFile?.id ?? null} onSelect={setActiveFile} onUploadClick={openFileDialog} />
              ) : null}

              {fileList.length === 0 ? (
                <section className="doc-column">
                  <div className="upload-dropzone" onClick={openFileDialog}>
                    <div className="upload-icon">⇪</div>
                    <h3>HWP 파일 업로드</h3>
                    <p>작업을 시작하려면 한글(.hwp) 파일을 업로드하세요.</p>
                    <button className="run">파일 선택하기</button>
                  </div>
                </section>
              ) : (
                <section className="doc-column">
                  <div className="doc-sheet">
                    <div className="doc-toolbar">
                      <span className="dot red" />
                      <span className="dot yellow" />
                      <span className="dot green" />
                      <span className="doc-name">{activeFile?.name ?? "No file selected"}</span>
                    </div>
                    <div className="doc-content">
                      <h3>주간 업무 보고서</h3>
                      <p className="mono">Run ID: demo-run</p>
                      <div className="doc-section">
                        <h4>1. 금주 주요 업무 실적</h4>
                        <p>본 보고서는 금주 진행된 주요 프로젝트의 진행 상황과 차주 계획을 기술한다. 특히 AI 에이전트 도입을 위한 <span className={diffMode ? "diff-added" : ""}>기반 환경 구축</span>이 완료되었다.</p>
                      </div>
                      <div className={`doc-table-wrap ${diffMode ? "diff-on" : ""}`}>
                        <table className="doc-table">
                          <thead>
                            <tr>
                              <th>구분</th>
                              <th>내용</th>
                              <th>비고</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>Frontend</td>
                              <td>UI 컴포넌트 개발</td>
                              <td>완료</td>
                            </tr>
                            <tr>
                              <td>Backend</td>
                              <td>{diffMode ? <span className="diff-added">API 연동 테스트</span> : "API 개발"}</td>
                              <td>진행중</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      {diffMode ? <p className="diff-note">변경 사항이 감지되었습니다.</p> : null}
                      <pre>{auditLog}</pre>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </section>
        )}
      </section>

      <SaveLogicModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSave={() => {
          setAuditLog("현재 로직이 Launcher 앱으로 저장되었습니다.");
          setIsSaveModalOpen(false);
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={onFilesSelected}
      />
    </main>
  );
}

function App(): JSX.Element {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  React.useEffect(() => {
    const onError = (event: ErrorEvent): void => {
      logUiError("window.error", event.error ?? event.message);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
      logUiError("window.unhandledrejection", event.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return (
    <UiErrorBoundary>
      {isLoggedIn ? <MainApp onLogout={() => setIsLoggedIn(false)} /> : <AuthScreen onLogin={() => setIsLoggedIn(true)} />}
    </UiErrorBoundary>
  );
}

export { App };
export default App;
