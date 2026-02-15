"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_child_process_1 = require("node:child_process");
const node_path_1 = __importDefault(require("node:path"));
const isDev = !!process.env.VITE_DEV_SERVER_URL;
let mainWindow = null;
// Parallels Windows VM compatibility and remote debugging settings.
electron_1.app.disableHardwareAcceleration();
electron_1.app.commandLine.appendSwitch("no-sandbox");
electron_1.app.commandLine.appendSwitch("disable-gpu-sandbox");
electron_1.app.commandLine.appendSwitch("remote-debugging-port", "9222");
electron_1.app.commandLine.appendSwitch("remote-debugging-address", "0.0.0.0");
electron_1.app.commandLine.appendSwitch("remote-allow-origins", "*");
function hasCommand(command) {
    if (process.platform === "win32") {
        const res = (0, node_child_process_1.spawnSync)("where", [command], { shell: true, stdio: "ignore" });
        return res.status === 0;
    }
    const res = (0, node_child_process_1.spawnSync)("command", ["-v", command], { shell: true, stdio: "ignore" });
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
        shell: true,
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
        shell: true,
        stdio: "pipe",
        encoding: "utf-8",
    });
    if (status.status !== 0) {
        return false;
    }
    const output = `${status.stdout || ""}\n${status.stderr || ""}`.toLowerCase();
    return output.includes("logged in");
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
            nodeIntegration: false
        }
    });
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
    if (isDev) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools({ mode: "detach" });
    }
    else {
        mainWindow.loadFile(node_path_1.default.join(electron_1.app.getAppPath(), "dist/index.html"));
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
            shell: true,
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
