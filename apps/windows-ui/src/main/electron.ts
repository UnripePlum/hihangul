import { app, BrowserWindow, ipcMain, safeStorage, shell } from "electron";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let mainWindow: BrowserWindow | null = null;
const SESSION_STORE_DIR = "session-store";
const SESSION_STORE_FILE = "sessions.json";
const SESSION_AUDIT_FILE = "session-events.jsonl";
const SESSION_FILES_ROOT = "HiHangul/sessions";
const ENABLE_REMOTE_DEBUG =
  isDev && process.env.HIHANGUL_ENABLE_REMOTE_DEBUGGING === "1";

// VM compatibility.
app.disableHardwareAcceleration();
if (ENABLE_REMOTE_DEBUG) {
  app.commandLine.appendSwitch("remote-debugging-port", "9222");
  app.commandLine.appendSwitch("remote-debugging-address", "0.0.0.0");
  app.commandLine.appendSwitch("remote-allow-origins", "*");
}

function hasCommand(command: string): boolean {
  if (process.platform === "win32") {
    const res = spawnSync("where.exe", [command], { stdio: "ignore" });
    return res.status === 0;
  }
  const res = spawnSync("which", [command], { stdio: "ignore" });
  return res.status === 0;
}

function ensureProviderCli(provider: "claude" | "codex"): { ok: boolean; message: string } {
  const command = provider === "claude" ? "claude" : "codex";
  const packageName = provider === "claude" ? "@anthropic-ai/claude-code" : "@openai/codex";

  if (hasCommand(command)) {
    return { ok: true, message: `${command} CLI already installed.` };
  }

  const installer = process.platform === "win32" ? "npm.cmd" : "npm";
  const install = spawnSync(installer, ["install", "-g", packageName], {
    stdio: "pipe",
    encoding: "utf-8",
  });

  if (install.status === 0 && hasCommand(command)) {
    return { ok: true, message: `${command} CLI installed.` };
  }

  const stderr = (install.stderr || "").toString().trim();
  const stdout = (install.stdout || "").toString().trim();
  return {
    ok: false,
    message: `Failed to install ${command} CLI. ${stderr || stdout || "unknown error"}`,
  };
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  // Windows에서는 focus/moveTop만으로 전면 복귀가 실패할 수 있어
  // alwaysOnTop을 짧게 사용해 포커스를 확보한다.
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop();
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.setAlwaysOnTop(false);
  }, 1200);
}

function closeCodexAuthBrowserWindows(): void {
  if (process.platform !== "win32") return;
  const commands = [
    'for %B in (msedge.exe chrome.exe brave.exe firefox.exe) do @taskkill /FI "IMAGENAME eq %B" /FI "WINDOWTITLE eq *OpenAI*" /T /F >nul 2>nul',
    'for %B in (msedge.exe chrome.exe brave.exe firefox.exe) do @taskkill /FI "IMAGENAME eq %B" /FI "WINDOWTITLE eq *Codex*" /T /F >nul 2>nul',
    'for %B in (msedge.exe chrome.exe brave.exe firefox.exe) do @taskkill /FI "IMAGENAME eq %B" /FI "WINDOWTITLE eq *Sign in*" /T /F >nul 2>nul',
  ];
  for (const cmd of commands) {
    try {
      spawnSync("cmd.exe", ["/c", cmd], { stdio: "ignore" });
    } catch {
      // best-effort only
    }
  }
}

function isCodexLoggedIn(): boolean {
  const status = spawnSync("codex", ["login", "status"], {
    stdio: "pipe",
    encoding: "utf-8",
  });
  if (status.status !== 0) {
    return false;
  }
  const output = `${status.stdout || ""}\n${status.stderr || ""}`.toLowerCase();

  // Avoid false positives from phrases like "not logged in".
  const hasNegativeSignal = /\bnot\s+logged\s+in\b|\blogged\s*out\b|\blogin\s+required\b|\bplease\s+log\s*in\b|\bunauthenticated\b/.test(output);
  if (hasNegativeSignal) {
    return false;
  }

  const hasPositiveSignal = /\blogged\s+in\b|\bauthenticated\b|\bactive\s+account\b/.test(output);
  return hasPositiveSignal;
}

async function waitForCodexLoginAndFocus(timeoutMs: number = 240000, intervalMs: number = 2000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (isCodexLoggedIn()) {
      closeCodexAuthBrowserWindows();
      focusMainWindow();
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  if (!isDev) {
    const csp =
      "default-src 'self'; " +
      "script-src 'self' https://cdn.tailwindcss.com; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; " +
      "font-src 'self' data:; " +
      "connect-src 'self' https://cdn.tailwindcss.com; " +
      "object-src 'none'; " +
      "base-uri 'self'; " +
      "frame-ancestors 'none'";
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [csp],
        },
      });
    });
  }

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), "dist/index.html"));
  }
}

function getSessionStorePaths(): { dir: string; dataFile: string; auditFile: string } {
  const dir = path.join(app.getPath("userData"), SESSION_STORE_DIR);
  return {
    dir,
    dataFile: path.join(dir, SESSION_STORE_FILE),
    auditFile: path.join(dir, SESSION_AUDIT_FILE),
  };
}

function sanitizeText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
  return trimmed.slice(0, maxLen);
}

function sanitizeSessionStore(input: unknown): { sessions: Array<Record<string, unknown>>; activeSessionId: string } {
  const src = (input ?? {}) as { sessions?: unknown; activeSessionId?: unknown };
  const sessionsRaw = Array.isArray(src.sessions) ? src.sessions : [];
  const sessions = sessionsRaw.slice(0, 200).map((item, index) => {
    const session = (item ?? {}) as {
      id?: unknown;
      title?: unknown;
      updatedAt?: unknown;
      messages?: unknown;
    };
    const id = sanitizeText(session.id, 128) || `session-${Date.now()}-${index}`;
    const title = sanitizeText(session.title, 120) || "새 세션";
    const updatedAt = typeof session.updatedAt === "number" ? session.updatedAt : Date.now();
    const messagesRaw = Array.isArray(session.messages) ? session.messages : [];
    const activeFileId = sanitizeText((session as { activeFileId?: unknown }).activeFileId, 128) || null;
    const filesRaw = Array.isArray((session as { files?: unknown }).files) ? (session as { files?: unknown[] }).files! : [];
    const messages = messagesRaw.slice(0, 500).map((msg, msgIndex) => {
      const m = (msg ?? {}) as { id?: unknown; role?: unknown; content?: unknown };
      const role = m.role === "user" || m.role === "assistant" || m.role === "system" ? m.role : "assistant";
      return {
        id: sanitizeText(m.id, 128) || `msg-${Date.now()}-${msgIndex}`,
        role,
        content: sanitizeText(m.content, 4000),
      };
    });
    const files = filesRaw.slice(0, 1000).map((file, fileIndex) => {
      const f = (file ?? {}) as Record<string, unknown>;
      return {
        id: sanitizeText(f.id, 128) || `file-${Date.now()}-${fileIndex}`,
        name: sanitizeText(f.name, 240) || `file-${fileIndex}`,
        size: sanitizeText(f.size, 40),
        type: sanitizeText(f.type, 24),
        date: sanitizeText(f.date, 32),
        mime: sanitizeText(f.mime, 128),
        uploadedAt: typeof f.uploadedAt === "number" ? f.uploadedAt : Date.now(),
        lineageKey: sanitizeText(f.lineageKey, 128),
        parentFileId: sanitizeText(f.parentFileId, 128) || null,
        compareText: sanitizeText(f.compareText, 200000),
        compareLineTokens: Array.isArray(f.compareLineTokens)
          ? f.compareLineTokens.slice(0, 20000).map((t) => sanitizeText(t, 1000))
          : [],
        storedPath: sanitizeText(f.storedPath, 512),
        sessionDir: sanitizeText(f.sessionDir, 512),
      };
    });
    return { id, title, updatedAt, messages, files, activeFileId };
  });
  const activeSessionId = sanitizeText(src.activeSessionId, 128);
  return { sessions, activeSessionId };
}

function encodeSessionPayload(payload: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return payload;
  }
  const encrypted = safeStorage.encryptString(payload);
  return JSON.stringify({
    encoding: "safeStorage+base64",
    data: encrypted.toString("base64"),
  });
}

function decodeSessionPayload(raw: string): string {
  try {
    const wrapped = JSON.parse(raw) as { encoding?: string; data?: string };
    if (wrapped?.encoding === "safeStorage+base64" && typeof wrapped.data === "string") {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("Encrypted session exists but safeStorage is unavailable.");
      }
      const buf = Buffer.from(wrapped.data, "base64");
      return safeStorage.decryptString(buf);
    }
    return raw;
  } catch {
    return raw;
  }
}

function sanitizePathSegment(value: unknown, fallback: string): string {
  const input = typeof value === "string" ? value : "";
  const cleaned = input
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\.+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}

function splitStemAndExt(fileName: string): { stem: string; ext: string } {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return { stem: fileName, ext: "" };
  return {
    stem: fileName.slice(0, dot),
    ext: fileName.slice(dot),
  };
}

function getSessionFilesRoot(): string {
  return path.join(app.getPath("documents"), SESSION_FILES_ROOT);
}

async function ensureSessionDir(sessionId: string): Promise<string> {
  const safeSessionId = sanitizePathSegment(sessionId, "session");
  const sessionDir = path.join(getSessionFilesRoot(), safeSessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  return sessionDir;
}

async function ensureUniqueFilePath(dir: string, desiredFileName: string): Promise<{ fileName: string; filePath: string }> {
  const safeName = sanitizePathSegment(desiredFileName, "file");
  const { stem, ext } = splitStemAndExt(safeName);
  const normalizedStem = sanitizePathSegment(stem, "file");
  let candidate = `${normalizedStem}${ext}`;
  let candidatePath = path.join(dir, candidate);
  let index = 2;
  while (true) {
    try {
      await fs.access(candidatePath);
      candidate = `${normalizedStem}_${index}${ext}`;
      candidatePath = path.join(dir, candidate);
      index += 1;
    } catch {
      return { fileName: candidate, filePath: candidatePath };
    }
  }
}

async function allocateResultPath(sessionId: string, sourceFileName: string): Promise<{ sessionDir: string; resultFileName: string; resultPath: string }> {
  const safeSource = sanitizePathSegment(sourceFileName, "document.hwpx");
  const { stem, ext } = splitStemAndExt(safeSource);
  const sessionDir = await ensureSessionDir(sessionId);
  const desired = `${sanitizePathSegment(stem, "document")}_result${ext || ".hwpx"}`;
  const unique = await ensureUniqueFilePath(sessionDir, desired);
  return {
    sessionDir,
    resultFileName: unique.fileName,
    resultPath: unique.filePath,
  };
}

app.whenReady().then(() => {
  ipcMain.handle("debug:ping", async () => {
    return {
      ok: true,
      processType: "main",
      pid: process.pid,
      platform: process.platform,
      now: new Date().toISOString()
    };
  });

  ipcMain.handle("session:load", async () => {
    try {
      const { dataFile } = getSessionStorePaths();
      const raw = await fs.readFile(dataFile, "utf-8");
      const decoded = decodeSessionPayload(raw);
      const parsed = JSON.parse(decoded) as unknown;
      const sanitized = sanitizeSessionStore(parsed);
      return { ok: true, ...sanitized };
    } catch {
      return { ok: true, sessions: [], activeSessionId: "" };
    }
  });

  ipcMain.handle("session:save", async (_event, payload: unknown) => {
    try {
      const { dir, dataFile, auditFile } = getSessionStorePaths();
      const sanitized = sanitizeSessionStore(payload);
      await fs.mkdir(dir, { recursive: true });
      const tmpFile = `${dataFile}.tmp`;
      const serialized = JSON.stringify(sanitized, null, 2);
      const encoded = encodeSessionPayload(serialized);
      await fs.writeFile(tmpFile, encoded, { encoding: "utf-8", mode: 0o600 });
      await fs.rename(tmpFile, dataFile);
      const audit = {
        ts: new Date().toISOString(),
        event: "session_save",
        sessions: sanitized.sessions.length,
        activeSessionId: sanitized.activeSessionId,
      };
      await fs.appendFile(auditFile, `${JSON.stringify(audit)}\n`, { encoding: "utf-8", mode: 0o600 });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  });

  ipcMain.handle(
    "file:save-session-upload",
    async (
      _event,
      payload: {
        sessionId?: unknown;
        fileName?: unknown;
        bytes?: unknown;
      },
    ) => {
      try {
        const sessionId = sanitizePathSegment(payload?.sessionId, "session");
        const fileName = sanitizePathSegment(payload?.fileName, "upload.bin");
        const bytes = payload?.bytes;
        const data = bytes instanceof Uint8Array
          ? bytes
          : ArrayBuffer.isView(bytes)
            ? new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
            : bytes instanceof ArrayBuffer
              ? new Uint8Array(bytes)
              : null;
        if (!data || data.byteLength === 0) {
          return { ok: false, message: "file bytes are required" };
        }

        const sessionDir = await ensureSessionDir(sessionId);
        const target = await ensureUniqueFilePath(sessionDir, fileName);
        await fs.writeFile(target.filePath, Buffer.from(data));
        return {
          ok: true,
          sessionId,
          sessionDir,
          storedFileName: target.fileName,
          storedPath: target.filePath,
          size: data.byteLength,
        };
      } catch (error) {
        return { ok: false, message: (error as Error).message };
      }
    },
  );

  ipcMain.handle(
    "file:next-result-path",
    async (
      _event,
      payload: {
        sessionId?: unknown;
        sourceFileName?: unknown;
      },
    ) => {
      try {
        const sessionId = sanitizePathSegment(payload?.sessionId, "session");
        const sourceFileName = sanitizePathSegment(payload?.sourceFileName, "document.hwpx");
        const allocated = await allocateResultPath(sessionId, sourceFileName);
        return { ok: true, ...allocated };
      } catch (error) {
        return { ok: false, message: (error as Error).message };
      }
    },
  );

  ipcMain.handle("file:open-path", async (_event, filePath: string) => {
    try {
      if (!filePath) {
        return { ok: false, message: "No file path provided" };
      }
      const err = await shell.openPath(filePath);
      if (err) {
        return { ok: false, message: err };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  });

  ipcMain.handle("system:get-host-user", async () => {
    try {
      const info = os.userInfo();
      const username = info.username || process.env.USERNAME || process.env.USER || "User";
      return {
        ok: true,
        username,
      };
    } catch (error) {
      return {
        ok: false,
        username: process.env.USERNAME || process.env.USER || "User",
        message: (error as Error).message,
      };
    }
  });

  ipcMain.handle("system:get-app-version", async () => {
    try {
      return {
        ok: true,
        version: app.getVersion(),
      };
    } catch (error) {
      return {
        ok: false,
        version: "0.0.0",
        message: (error as Error).message,
      };
    }
  });

  ipcMain.handle("auth:codex-login", async () => {
    if (!hasCommand("codex")) {
      return {
        launched: false,
        platform: process.platform,
        message: "codex CLI not found. Press Login to install prerequisites first."
      };
    }

    if (process.platform === "win32") {
      spawn("cmd.exe", [
        "/c",
        "start",
        "Codex Login",
        "cmd.exe",
        "/c",
        "codex login || (echo Codex login failed. Press any key to close... & pause >nul)",
      ], {
        detached: true,
        stdio: "ignore",
      }).unref();
      return { launched: true, platform: process.platform, message: "codex login started" };
    }

    if (process.platform === "darwin") {
      spawn("osascript", ["-e", 'tell application "Terminal" to do script "codex login"'], {
        detached: true,
        stdio: "ignore",
      }).unref();
      return { launched: true, platform: process.platform, message: "codex login started" };
    }

    spawn("x-terminal-emulator", ["-e", "codex login"], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return { launched: true, platform: process.platform, message: "codex login started" };
  });

  ipcMain.handle("auth:ensure-provider-cli", async (_event, provider: "claude" | "codex") => {
    return ensureProviderCli(provider);
  });

  ipcMain.handle("auth:post-codex-login-focus", async () => {
    try {
      closeCodexAuthBrowserWindows();
      focusMainWindow();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  });

  ipcMain.handle("auth:codex-login-status-local", async () => {
    try {
      if (!hasCommand("codex")) {
        return { ok: false, cliFound: false, loggedIn: false, message: "codex CLI not found" };
      }
      const loggedIn = isCodexLoggedIn();
      return {
        ok: true,
        cliFound: true,
        loggedIn,
        message: loggedIn ? "codex authenticated" : "codex login required",
      };
    } catch (error) {
      return { ok: false, cliFound: true, loggedIn: false, message: (error as Error).message };
    }
  });

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
