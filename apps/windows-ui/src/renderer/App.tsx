import { useEffect, useMemo, useState } from "react";

type LaneResponse = {
  lane_id: string;
  session_id: string;
  run_id: string;
  status: string;
  generated_code: string;
  plan_title: string;
  execution: Record<string, unknown>;
  package?: { manifest_path: string };
};

type ProgramDraft = {
  prompt: string;
  generatedCode: string;
  planTitle: string;
  profileId: string;
  provider: "claude" | "codex";
};

type ChatRole = "user" | "assistant" | "system";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
};

type SessionStore = {
  sessions: ChatSession[];
  activeSessionId: string;
};

type SessionContextMenu = {
  x: number;
  y: number;
  sessionId: string;
};

const SESSION_STORE_KEY = "hihangul.local.sessions.v1";

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function createWelcomeSession(id: string): ChatSession {
  return {
    id,
    title: "새 세션",
    updatedAt: Date.now(),
    messages: [
      {
        id: makeId("msg"),
        role: "assistant",
        content: "자동화 명령을 입력하면 프로그램을 생성하고 로컬에서 실행합니다.",
        createdAt: Date.now(),
      },
    ],
  };
}

export function App(): JSX.Element {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLoginTransition, setShowLoginTransition] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [authToken, setAuthToken] = useState("hk_demo_token");
  const [userId, setUserId] = useState("demo");
  const [laneId, setLaneId] = useState("demo:default");
  const [sessionId, setSessionId] = useState(`session-${Date.now()}`);
  const [provider, setProvider] = useState<"claude" | "codex">("claude");
  const [providerToken, setProviderToken] = useState("");
  const [prompt, setPrompt] = useState("표 테두리를 진하게 하고 문서 마지막에 검토 완료 문구를 넣어줘");
  const [persistProgram, setPersistProgram] = useState(true);

  const [building, setBuilding] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LaneResponse | null>(null);
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<string>("No action yet.");

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [contextMenu, setContextMenu] = useState<SessionContextMenu | null>(null);

  const brainBase = useMemo(() => window.hihangul.brainBaseUrl, []);
  const profileId = useMemo(() => `${provider}-default`, [provider]);
  const authMode = useMemo<"token" | "codex_cli">(
    () => (provider === "claude" ? "token" : "codex_cli"),
    [provider],
  );

  const activeSession = useMemo(
    () => sessions.find((item) => item.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as SessionStore;
      if (!Array.isArray(parsed.sessions)) {
        return;
      }
      setSessions(parsed.sessions);
      if (parsed.activeSessionId && parsed.sessions.some((item) => item.id === parsed.activeSessionId)) {
        setActiveSessionId(parsed.activeSessionId);
        setSessionId(parsed.activeSessionId);
      } else if (parsed.sessions[0]) {
        setActiveSessionId(parsed.sessions[0].id);
        setSessionId(parsed.sessions[0].id);
      }
    } catch {
      // Ignore corrupted local state and continue with empty session list.
    }
  }, []);

  useEffect(() => {
    const payload: SessionStore = { sessions, activeSessionId };
    localStorage.setItem(SESSION_STORE_KEY, JSON.stringify(payload));
  }, [sessions, activeSessionId]);

  useEffect(() => {
    function closeMenu(): void {
      setContextMenu(null);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    }
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function appendMessage(role: ChatRole, content: string): void {
    if (!activeSessionId) {
      return;
    }
    setSessions((prev) =>
      prev.map((item) =>
        item.id === activeSessionId
          ? {
              ...item,
              updatedAt: Date.now(),
              messages: [...item.messages, { id: makeId("msg"), role, content, createdAt: Date.now() }],
            }
          : item,
      ),
    );
  }

  function setSessionTitleFromPrompt(value: string): void {
    if (!activeSessionId) {
      return;
    }
    const nextTitle = value.trim().slice(0, 24) || "새 세션";
    setSessions((prev) =>
      prev.map((item) =>
        item.id === activeSessionId && item.title === "새 세션"
          ? { ...item, title: nextTitle, updatedAt: Date.now() }
          : item,
      ),
    );
  }

  function onProviderChange(nextProvider: "claude" | "codex"): void {
    setProvider(nextProvider);
    if (nextProvider === "codex") {
      setProviderToken("");
    }
  }

  function createNewSession(): void {
    const id = `session-${Date.now()}`;
    setSessionId(id);
    setActiveSessionId(id);
    setDraft(null);
    setResult(null);
    setError(null);
    setAuditLog("Flow reset. Ready for new command.");
    setPrompt("");
    setSessions((prev) => [createWelcomeSession(id), ...prev]);
  }

  function deleteSession(targetId: string): void {
    setSessions((prev) => {
      const next = prev.filter((item) => item.id !== targetId);
      if (next.length === 0) {
        const fallbackId = `session-${Date.now()}`;
        const fallback = createWelcomeSession(fallbackId);
        setActiveSessionId(fallbackId);
        setSessionId(fallbackId);
        setDraft(null);
        setResult(null);
        setError(null);
        setAuditLog("Flow reset. Ready for new command.");
        return [fallback];
      }
      if (activeSessionId === targetId) {
        setActiveSessionId(next[0].id);
        setSessionId(next[0].id);
      }
      return next;
    });
    setContextMenu(null);
  }

  async function waitForBrainHealth(retries: number = 12, intervalMs: number = 1000): Promise<void> {
    let lastError = "unknown error";
    for (let i = 0; i < retries; i += 1) {
      try {
        const health = await fetch(`${brainBase}/health`);
        if (health.ok) {
          return;
        }
        lastError = `status=${health.status}`;
      } catch (err) {
        lastError = (err as Error).message;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(`brain health check failed after retries: ${lastError}`);
  }

  async function loginWithProvider(): Promise<void> {
    setError(null);
    const effectiveProfileId = profileId;
    try {
      await waitForBrainHealth();

      const cli = await window.hihangul.ensureProviderCli(provider);
      if (!cli.ok) {
        throw new Error(cli.message);
      }

      if (provider === "codex") {
        const codexLogin = await window.hihangul.launchCodexLogin();
        if (!codexLogin.launched) {
          throw new Error(codexLogin.message);
        }
      }
      const res = await fetch(`${brainBase}/v1/auth/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: effectiveProfileId,
          provider,
          auth_mode: authMode,
          token: authMode === "token" ? providerToken : null,
          metadata: { source: "windows-ui" }
        })
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Profile save failed (${res.status}): ${body}`);
      }
      setAuditLog(provider === "codex"
        ? `Profile '${effectiveProfileId}' saved. Codex login terminal launched.`
        : `Profile '${effectiveProfileId}' saved for Claude token mode.`);
      const effectiveUserId = userId.trim() || "demo";
      setUserId(effectiveUserId);
      setLaneId(`${effectiveUserId}:default`);
      if (sessions.length === 0) {
        const firstSessionId = `session-${Date.now()}`;
        setSessionId(firstSessionId);
        setSessions([createWelcomeSession(firstSessionId)]);
        setActiveSessionId(firstSessionId);
      } else {
        const restoredId = activeSessionId || sessions[0].id;
        setSessionId(restoredId);
        setActiveSessionId(restoredId);
      }
      setShowLoginTransition(true);
      window.setTimeout(() => {
        setIsLoggedIn(true);
        setShowLoginTransition(false);
      }, 3000);
      return;
    } catch (saveError) {
      const msg = (saveError as Error).message;
      if (msg.includes("Failed to fetch") || msg.includes("brain health check failed")) {
        setError(
          `Failed to fetch ${brainBase}. Check: (1) windows-brain is running, ` +
          `(2) started with --host 0.0.0.0, (3) same Windows host can reach localhost:8000, ` +
          `(4) first startup may still be installing Python deps in Brain terminal.`,
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoggingIn(false);
    }
  }

  async function buildProgram(): Promise<void> {
    const effectiveSessionId = activeSessionId || sessionId;
    if (!prompt.trim()) {
      setError("Prompt is required.");
      return;
    }

    setBuilding(true);
    setError(null);
    setSessionTitleFromPrompt(prompt);
    appendMessage("user", prompt);

    try {
      const res = await fetch(`${brainBase}/v1/lanes/${laneId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: effectiveSessionId,
          user_id: userId,
          auth_token: authToken,
          user_input: prompt,
          provider,
          profile_id: profileId,
          adapter: "pyhwpx",
          persist_program: false,
          dry_run: true
        })
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Build failed (${res.status}): ${body}`);
      }
      const data = (await res.json()) as LaneResponse;
      setDraft({
        prompt,
        generatedCode: data.generated_code,
        planTitle: data.plan_title,
        profileId,
        provider
      });
      setResult(data);
      setAuditLog("Program created from intent only. Waiting for explicit Run click.");
      appendMessage("assistant", `프로그램 초안 생성 완료\nPlan: ${data.plan_title}\nRun ID: ${data.run_id}`);
    } catch (buildError) {
      const message = (buildError as Error).message;
      setError(message);
      appendMessage("system", `Build error: ${message}`);
    } finally {
      setBuilding(false);
    }
  }

  async function runProgram(): Promise<void> {
    const effectiveSessionId = activeSessionId || sessionId;
    if (!draft) {
      setError("No program draft. Build program first.");
      return;
    }

    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`${brainBase}/v1/lanes/${laneId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: effectiveSessionId,
          user_id: userId,
          auth_token: authToken,
          user_input: draft.prompt,
          provider: draft.provider,
          profile_id: draft.profileId,
          adapter: "pyhwpx",
          persist_program: persistProgram,
          dry_run: false
        })
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Run failed (${res.status}): ${body}`);
      }
      const data = (await res.json()) as LaneResponse;
      setResult(data);
      setAuditLog("Local sandbox execution completed. Review visual diff before saving.");
      appendMessage(
        "assistant",
        `로컬 실행 완료\nRun ID: ${data.run_id}\nManifest: ${data.package?.manifest_path ?? "(not saved)"}`,
      );
    } catch (runError) {
      const message = (runError as Error).message;
      setError(message);
      appendMessage("system", `Run error: ${message}`);
    } finally {
      setRunning(false);
    }
  }

  if (showLoginTransition && !isLoggedIn) {
    return (
      <main className="login-page">
        <section className="panel login-panel loading-panel">
          <h2>HiHangul</h2>
          <p>로딩 중...</p>
          <div className="loading-dot" />
        </section>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="login-page">
        <section className="panel login-panel">
          <h2>HiHangul</h2>
          <label>
            Provider
            <select value={provider} onChange={(e) => onProviderChange(e.target.value as "claude" | "codex")}>
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
            </select>
          </label>
          {provider === "claude" ? (
            <label>Provider Token<input value={providerToken} onChange={(e) => setProviderToken(e.target.value)} /></label>
          ) : null}
          <button
            onClick={() => {
              if (provider === "claude" && !providerToken.trim()) {
                setError("Provider token is required for Claude.");
                return;
              }
              setLoggingIn(true);
              void loginWithProvider();
            }}
            disabled={loggingIn}
          >
            {loggingIn ? "Logging in..." : "Login"}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="chat-shell">
      <aside className="panel session-list-panel">
        <div className="session-list-head">
          <p className="eyebrow">HiHangul</p>
          <h2>Sessions</h2>
          <button className="secondary" onClick={createNewSession}>+ New Session</button>
        </div>
        <div className="session-list">
          {sessions.map((item) => (
            <button
              key={item.id}
              className={`session-item ${item.id === activeSessionId ? "active" : ""}`}
              onClick={() => {
                setActiveSessionId(item.id);
                setSessionId(item.id);
                setError(null);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setActiveSessionId(item.id);
                setSessionId(item.id);
                setContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  sessionId: item.id,
                });
              }}
            >
              <span className="session-title">{item.title}</span>
              <span className="session-meta">{item.id}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="chat-main">
        <header className="panel chat-head">
          <p className="eyebrow">Current Session</p>
          <h2>{activeSession?.title ?? "세션 없음"}</h2>
          <p>Brain: {brainBase} | Lane: {laneId}</p>
          <p className={draft ? "status-ok" : "status-idle"}>Program Ready: {draft ? "Yes" : "No"}</p>
        </header>

        <section className="panel transcript-panel">
          <div className="transcript">
            {(activeSession?.messages ?? []).map((message) => (
              <article key={message.id} className={`msg ${message.role}`}>
                <p className="msg-role">{message.role}</p>
                <pre>{message.content}</pre>
              </article>
            ))}
          </div>
        </section>

        <section className="panel composer-panel">
          <label>
            Prompt
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder="예: 표 테두리를 진하게 해줘"
            />
          </label>

          <div className="inline-actions">
            <button onClick={() => void buildProgram()} disabled={building || running}>
              {building ? "Building Program..." : "Build Program"}
            </button>
            <button className="run" onClick={() => void runProgram()} disabled={!draft || building || running}>
              {running ? "Running Locally..." : "▶ Run Program"}
            </button>
          </div>

          <label className="checkline"><input type="checkbox" checked={persistProgram} onChange={(e) => setPersistProgram(e.target.checked)} /> Save to Launcher after verification</label>
          <p className="mono">Plan: {result?.plan_title ?? "-"} | Run ID: {result?.run_id ?? "-"}</p>
          <p className="mono">Manifest: {result?.package?.manifest_path ?? "(not saved)"}</p>
          {error ? <p className="error">{error}</p> : null}
          <pre>{auditLog}</pre>
        </section>
      </section>
      {contextMenu ? (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button className="context-item danger" onClick={() => deleteSession(contextMenu.sessionId)}>
            세션 삭제
          </button>
          <button className="context-item" onClick={() => setContextMenu(null)}>
            닫기
          </button>
        </div>
      ) : null}
    </main>
  );
}
