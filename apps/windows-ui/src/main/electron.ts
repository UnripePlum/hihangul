import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const isDev = !!process.env.VITE_DEV_SERVER_URL;

// Parallels Windows VM compatibility and remote debugging settings.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("remote-debugging-port", "9222");
app.commandLine.appendSwitch("remote-debugging-address", "0.0.0.0");
app.commandLine.appendSwitch("remote-allow-origins", "*");

function hasCommand(command: string): boolean {
  if (process.platform === "win32") {
    const res = spawnSync("where", [command], { shell: true, stdio: "ignore" });
    return res.status === 0;
  }
  const res = spawnSync("command", ["-v", command], { shell: true, stdio: "ignore" });
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

function createMainWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(app.getAppPath(), "dist/index.html"));
  }
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

  ipcMain.handle("auth:codex-login", async () => {
    if (!hasCommand("codex")) {
      return {
        launched: false,
        platform: process.platform,
        message: "codex CLI not found. Press Login to install prerequisites first."
      };
    }

    if (process.platform === "win32") {
      spawn("cmd.exe", ["/c", "start", "Codex Login", "cmd.exe", "/k", "codex login"], {
        detached: true,
        stdio: "ignore",
      }).unref();
      return { launched: true, platform: process.platform, message: "codex login terminal launched" };
    }

    if (process.platform === "darwin") {
      spawn("osascript", ["-e", 'tell application "Terminal" to do script "codex login"'], {
        detached: true,
        stdio: "ignore",
      }).unref();
      return { launched: true, platform: process.platform, message: "codex login terminal launched" };
    }

    spawn("x-terminal-emulator", ["-e", "codex login"], {
      detached: true,
      stdio: "ignore",
      shell: true,
    }).unref();
    return { launched: true, platform: process.platform, message: "codex login terminal launched" };
  });

  ipcMain.handle("auth:ensure-provider-cli", async (_event, provider: "claude" | "codex") => {
    return ensureProviderCli(provider);
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
