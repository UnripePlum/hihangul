import { contextBridge, ipcRenderer } from "electron";

const defaultBrainBaseUrl = "http://localhost:8000";

const api = {
  versions: process.versions,
  brainBaseUrl: process.env.HIHANGUL_WINDOWS_BRAIN_URL ?? defaultBrainBaseUrl,
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
  }>
};

contextBridge.exposeInMainWorld("hihangul", api);
