import { contextBridge, ipcRenderer } from "electron";

const defaultBrainBaseUrl = "http://localhost:8000";
const defaultAgentBaseUrl = "http://localhost:9000";

const api = {
  versions: process.versions,
  brainBaseUrl: process.env.HIHANGUL_WINDOWS_BRAIN_URL ?? defaultBrainBaseUrl,
  agentBaseUrl: process.env.HIHANGUL_WINDOWS_AGENT_URL ?? defaultAgentBaseUrl,
  debugPing: () => ipcRenderer.invoke("debug:ping") as Promise<{
    ok: boolean;
    processType: string;
    pid: number;
    platform: string;
    now: string;
  }>,
  launchCodexLogin: () => ipcRenderer.invoke("auth:codex-login") as Promise<{
    launched: boolean;
    platform: string;
    message: string;
  }>,
  ensureProviderCli: (provider: "claude" | "codex") => ipcRenderer.invoke(
    "auth:ensure-provider-cli",
    provider,
  ) as Promise<{
    ok: boolean;
    message: string;
  }>,
  getHostUser: () => ipcRenderer.invoke("system:get-host-user") as Promise<{
    ok: boolean;
    username: string;
    message?: string;
  }>,
  getAppVersion: () => ipcRenderer.invoke("system:get-app-version") as Promise<{
    ok: boolean;
    version: string;
    message?: string;
  }>,
  loadSessions: () => ipcRenderer.invoke("session:load") as Promise<{
    ok: boolean;
    sessions: unknown[];
    activeSessionId: string;
  }>,
  saveSessions: (payload: { sessions: unknown[]; activeSessionId: string }) => ipcRenderer.invoke(
    "session:save",
    payload,
  ) as Promise<{
    ok: boolean;
    message?: string;
  }>,
};

contextBridge.exposeInMainWorld("hihangul", api);
