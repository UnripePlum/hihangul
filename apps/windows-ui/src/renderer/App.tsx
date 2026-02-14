import { useMemo, useState } from "react";

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

export function App(): JSX.Element {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
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

  const brainBase = useMemo(() => window.hihangul.brainBaseUrl, []);
  const profileId = useMemo(() => `${provider}-default`, [provider]);
  const authMode = useMemo<"token" | "codex_cli">(
    () => (provider === "claude" ? "token" : "codex_cli"),
    [provider],
  );

  function onProviderChange(nextProvider: "claude" | "codex"): void {
    setProvider(nextProvider);
    if (nextProvider === "codex") {
      setProviderToken("");
    }
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
      setSessionId(`session-${Date.now()}`);
      setIsLoggedIn(true);
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
    setBuilding(true);
    setError(null);
    try {
      const res = await fetch(`${brainBase}/v1/lanes/${laneId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
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
    } catch (buildError) {
      setError((buildError as Error).message);
    } finally {
      setBuilding(false);
    }
  }

  async function runProgram(): Promise<void> {
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
          session_id: sessionId,
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
    } catch (runError) {
      setError((runError as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function resetFlow(): void {
    setDraft(null);
    setResult(null);
    setAuditLog("Flow reset. Ready for new command.");
  }

  if (!isLoggedIn) {
    return (
      <main className="page login-page">
        <section className="panel login-panel">
          <h2>HiHangul Login</h2>
          <p>OpenClaw-style: 로그인에 필요한 정보만 입력합니다.</p>
          <p>Brain URL: {brainBase}</p>
          <label>
            Provider
            <select value={provider} onChange={(e) => onProviderChange(e.target.value as "claude" | "codex")}>
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
            </select>
          </label>
          {provider === "claude" ? (
            <label>Provider Token<input value={providerToken} onChange={(e) => setProviderToken(e.target.value)} /></label>
          ) : (
            <p>Codex는 Login 시 `codex login` 창이 열립니다.</p>
          )}
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
    <main className="page">
      <section className="panel auth-panel">
        <h2>Auth & Profile</h2>
        <p>Brain URL: {brainBase}</p>
        <label>Token (앱 내부 인증)<input value={authToken} onChange={(e) => setAuthToken(e.target.value)} /></label>
        <label>User ID<input value={userId} onChange={(e) => setUserId(e.target.value)} /></label>
        <label>Lane ID<input value={laneId} onChange={(e) => setLaneId(e.target.value)} /></label>
        <label>Session<input value={sessionId} onChange={(e) => setSessionId(e.target.value)} /></label>
        <label>
          Provider
          <select value={provider} onChange={(e) => onProviderChange(e.target.value as "claude" | "codex")}>
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
          </select>
        </label>
        {provider === "claude" ? (
          <label>Provider Token<input value={providerToken} onChange={(e) => setProviderToken(e.target.value)} /></label>
        ) : (
          <p>Codex 연동은 Login 시 `codex login` 창이 열립니다.</p>
        )}
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
      </section>

      <section className="panel chat-panel">
        <h2>Command Workspace</h2>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          placeholder="예: 표 테두리를 진하게 해줘"
        />
        <button onClick={() => void buildProgram()} disabled={building || running}>
          {building ? "Building Program..." : "Build Program (Intent Only)"}
        </button>
        <button className="secondary" onClick={() => void runProgram()} disabled={!draft || building || running}>
          {running ? "Running Locally..." : "▶ Run Program (Local Execution)"}
        </button>
        <label><input type="checkbox" checked={persistProgram} onChange={(e) => setPersistProgram(e.target.checked)} /> Save to Launcher after verification</label>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="panel launcher-panel">
        <h2>Program State</h2>
        <p>Program Ready: {draft ? "Yes" : "No"}</p>
        <p>Plan: {result?.plan_title ?? "-"}</p>
        <p>Run ID: {result?.run_id ?? "-"}</p>
        <p>Launcher Manifest: {result?.package?.manifest_path ?? "(not saved)"}</p>
        <pre>{auditLog}</pre>
        <button className="secondary" onClick={resetFlow}>Reset Flow</button>
      </section>

      <section className="panel diff-panel">
        <h2>Visual Diff Viewer</h2>
        <p>Left: Original | Right: Result (placeholder code preview)</p>
        <pre>{result?.generated_code ?? "프로그램이 아직 생성되지 않았습니다."}</pre>
      </section>
    </main>
  );
}
