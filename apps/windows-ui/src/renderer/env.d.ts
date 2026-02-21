export {};

declare global {
  interface Window {
    hihangul: {
      versions: NodeJS.ProcessVersions;
      brainBaseUrl: string;
      agentBaseUrl: string;
      debugPing: () => Promise<{
        ok: boolean;
        processType: string;
        pid: number;
        platform: string;
        now: string;
      }>;
      launchCodexLogin: () => Promise<{
        launched: boolean;
        platform: string;
        message: string;
      }>;
      postCodexLoginFocus: () => Promise<{
        ok: boolean;
        message?: string;
      }>;
      getCodexLoginStatusLocal: () => Promise<{
        ok: boolean;
        cliFound: boolean;
        loggedIn: boolean;
        message: string;
      }>;
      ensureProviderCli: (provider: "claude" | "codex") => Promise<{
        ok: boolean;
        message: string;
      }>;
      getHostUser: () => Promise<{
        ok: boolean;
        username: string;
        message?: string;
      }>;
      getAppVersion: () => Promise<{
        ok: boolean;
        version: string;
        message?: string;
      }>;
      loadSessions: () => Promise<{
        ok: boolean;
        sessions: unknown[];
        activeSessionId: string;
      }>;
      saveSessions: (payload: { sessions: unknown[]; activeSessionId: string }) => Promise<{
        ok: boolean;
        message?: string;
      }>;
      saveSessionUpload: (payload: { sessionId: string; fileName: string; bytes: Uint8Array }) => Promise<{
        ok: boolean;
        sessionId?: string;
        sessionDir?: string;
        storedFileName?: string;
        storedPath?: string;
        size?: number;
        message?: string;
      }>;
      getNextResultPath: (payload: { sessionId: string; sourceFileName: string }) => Promise<{
        ok: boolean;
        sessionDir?: string;
        resultFileName?: string;
        resultPath?: string;
        message?: string;
      }>;
    };
  }
}
