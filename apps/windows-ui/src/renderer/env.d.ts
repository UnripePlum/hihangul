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
    };
  }
}
