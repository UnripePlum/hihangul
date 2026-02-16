"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_child_process_1 = require("node:child_process");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const isDev = !!process.env.VITE_DEV_SERVER_URL;
let mainWindow = null;
const SESSION_STORE_DIR = "session-store";
const SESSION_STORE_FILE = "sessions.json";
const SESSION_AUDIT_FILE = "session-events.jsonl";
const ENABLE_REMOTE_DEBUG = isDev && process.env.HIHANGUL_ENABLE_REMOTE_DEBUGGING === "1";
// VM compatibility.
electron_1.app.disableHardwareAcceleration();
if (ENABLE_REMOTE_DEBUG) {
    electron_1.app.commandLine.appendSwitch("remote-debugging-port", "9222");
    electron_1.app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
}
function hasCommand(command) {
    if (process.platform === "win32") {
        const res = (0, node_child_process_1.spawnSync)("where.exe", [command], { stdio: "ignore" });
        return res.status === 0;
    }
    const res = (0, node_child_process_1.spawnSync)("which", [command], { stdio: "ignore" });
    return res.status === 0;
}
function ensureProviderCli(provider) {
    const command = provider === "claude" ? "claude" : "codex";
    const packageName = provider === "claude" ? "@anthropic-ai/claude-code" : "@openai/codex";
    if (hasCommand(command)) {
        return { ok: true, message: `${command} CLI already installed.` };
    }
    const installer = process.platform === "win32" ? "npm.cmd" : "npm";
    const install = (0, node_child_process_1.spawnSync)(installer, ["install", "-g", packageName], {
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
function focusMainWindow() {
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
function isCodexLoggedIn() {
    const status = (0, node_child_process_1.spawnSync)("codex", ["login", "status"], {
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
async function waitForCodexLoginAndFocus(timeoutMs = 240000, intervalMs = 2000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (isCodexLoggedIn()) {
            focusMainWindow();
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return false;
}
function createMainWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 920,
        webPreferences: {
            preload: node_path_1.default.join(__dirname, "../preload/preload.js"),
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
        const csp = "default-src 'self'; " +
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
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools({ mode: "detach" });
    }
    else {
        mainWindow.loadFile(node_path_1.default.join(electron_1.app.getAppPath(), "dist/index.html"));
    }
}
function getSessionStorePaths() {
    const dir = node_path_1.default.join(electron_1.app.getPath("userData"), SESSION_STORE_DIR);
    return {
        dir,
        dataFile: node_path_1.default.join(dir, SESSION_STORE_FILE),
        auditFile: node_path_1.default.join(dir, SESSION_AUDIT_FILE),
    };
}
function sanitizeText(value, maxLen) {
    if (typeof value !== "string")
        return "";
    const trimmed = value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
    return trimmed.slice(0, maxLen);
}
function sanitizeSessionStore(input) {
    const src = (input ?? {});
    const sessionsRaw = Array.isArray(src.sessions) ? src.sessions : [];
    const sessions = sessionsRaw.slice(0, 200).map((item, index) => {
        const session = (item ?? {});
        const id = sanitizeText(session.id, 128) || `session-${Date.now()}-${index}`;
        const title = sanitizeText(session.title, 120) || "새 세션";
        const updatedAt = typeof session.updatedAt === "number" ? session.updatedAt : Date.now();
        const messagesRaw = Array.isArray(session.messages) ? session.messages : [];
        const messages = messagesRaw.slice(0, 500).map((msg, msgIndex) => {
            const m = (msg ?? {});
            const role = m.role === "user" || m.role === "assistant" || m.role === "system" ? m.role : "assistant";
            return {
                id: sanitizeText(m.id, 128) || `msg-${Date.now()}-${msgIndex}`,
                role,
                content: sanitizeText(m.content, 4000),
            };
        });
        return { id, title, updatedAt, messages };
    });
    const activeSessionId = sanitizeText(src.activeSessionId, 128);
    return { sessions, activeSessionId };
}
function encodeSessionPayload(payload) {
    if (!electron_1.safeStorage.isEncryptionAvailable()) {
        return payload;
    }
    const encrypted = electron_1.safeStorage.encryptString(payload);
    return JSON.stringify({
        encoding: "safeStorage+base64",
        data: encrypted.toString("base64"),
    });
}
function decodeSessionPayload(raw) {
    try {
        const wrapped = JSON.parse(raw);
        if (wrapped?.encoding === "safeStorage+base64" && typeof wrapped.data === "string") {
            if (!electron_1.safeStorage.isEncryptionAvailable()) {
                throw new Error("Encrypted session exists but safeStorage is unavailable.");
            }
            const buf = Buffer.from(wrapped.data, "base64");
            return electron_1.safeStorage.decryptString(buf);
        }
        return raw;
    }
    catch {
        return raw;
    }
}
electron_1.app.whenReady().then(() => {
    electron_1.ipcMain.handle("debug:ping", async () => {
        return {
            ok: true,
            processType: "main",
            pid: process.pid,
            platform: process.platform,
            now: new Date().toISOString()
        };
    });
    electron_1.ipcMain.handle("session:load", async () => {
        try {
            const { dataFile } = getSessionStorePaths();
            const raw = await promises_1.default.readFile(dataFile, "utf-8");
            const decoded = decodeSessionPayload(raw);
            const parsed = JSON.parse(decoded);
            const sanitized = sanitizeSessionStore(parsed);
            return { ok: true, ...sanitized };
        }
        catch {
            return { ok: true, sessions: [], activeSessionId: "" };
        }
    });
    electron_1.ipcMain.handle("session:save", async (_event, payload) => {
        try {
            const { dir, dataFile, auditFile } = getSessionStorePaths();
            const sanitized = sanitizeSessionStore(payload);
            await promises_1.default.mkdir(dir, { recursive: true });
            const tmpFile = `${dataFile}.tmp`;
            const serialized = JSON.stringify(sanitized, null, 2);
            const encoded = encodeSessionPayload(serialized);
            await promises_1.default.writeFile(tmpFile, encoded, { encoding: "utf-8", mode: 0o600 });
            await promises_1.default.rename(tmpFile, dataFile);
            const audit = {
                ts: new Date().toISOString(),
                event: "session_save",
                sessions: sanitized.sessions.length,
                activeSessionId: sanitized.activeSessionId,
            };
            await promises_1.default.appendFile(auditFile, `${JSON.stringify(audit)}\n`, { encoding: "utf-8", mode: 0o600 });
            return { ok: true };
        }
        catch (error) {
            return { ok: false, message: error.message };
        }
    });
    electron_1.ipcMain.handle("system:get-host-user", async () => {
        try {
            const info = node_os_1.default.userInfo();
            const username = info.username || process.env.USERNAME || process.env.USER || "User";
            return {
                ok: true,
                username,
            };
        }
        catch (error) {
            return {
                ok: false,
                username: process.env.USERNAME || process.env.USER || "User",
                message: error.message,
            };
        }
    });
    electron_1.ipcMain.handle("system:get-app-version", async () => {
        try {
            return {
                ok: true,
                version: electron_1.app.getVersion(),
            };
        }
        catch (error) {
            return {
                ok: false,
                version: "0.0.0",
                message: error.message,
            };
        }
    });
    electron_1.ipcMain.handle("auth:codex-login", async () => {
        if (!hasCommand("codex")) {
            return {
                launched: false,
                platform: process.platform,
                message: "codex CLI not found. Press Login to install prerequisites first."
            };
        }
        if (process.platform === "win32") {
            (0, node_child_process_1.spawn)("cmd.exe", [
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
            const ok = await waitForCodexLoginAndFocus();
            if (!ok) {
                return { launched: false, platform: process.platform, message: "codex login timed out" };
            }
            return { launched: true, platform: process.platform, message: "codex login completed" };
        }
        if (process.platform === "darwin") {
            (0, node_child_process_1.spawn)("osascript", ["-e", 'tell application "Terminal" to do script "codex login"'], {
                detached: true,
                stdio: "ignore",
            }).unref();
            const ok = await waitForCodexLoginAndFocus();
            if (!ok) {
                return { launched: false, platform: process.platform, message: "codex login timed out" };
            }
            return { launched: true, platform: process.platform, message: "codex login completed" };
        }
        (0, node_child_process_1.spawn)("x-terminal-emulator", ["-e", "codex login"], {
            detached: true,
            stdio: "ignore",
        }).unref();
        const ok = await waitForCodexLoginAndFocus();
        if (!ok) {
            return { launched: false, platform: process.platform, message: "codex login timed out" };
        }
        return { launched: true, platform: process.platform, message: "codex login completed" };
    });
    electron_1.ipcMain.handle("auth:ensure-provider-cli", async (_event, provider) => {
        return ensureProviderCli(provider);
    });
    createMainWindow();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
