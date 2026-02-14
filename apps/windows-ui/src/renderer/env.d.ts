export {};

declare global {
  interface Window {
    hihangul: {
      versions: NodeJS.ProcessVersions;
      brainBaseUrl: string;
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
    };
  }
}
