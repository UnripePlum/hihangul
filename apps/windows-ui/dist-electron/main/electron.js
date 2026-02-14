"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const isDev = !!process.env.VITE_DEV_SERVER_URL;
// Parallels Windows VM compatibility and remote debugging settings.
electron_1.app.disableHardwareAcceleration();
electron_1.app.commandLine.appendSwitch("no-sandbox");
electron_1.app.commandLine.appendSwitch("disable-gpu-sandbox");
electron_1.app.commandLine.appendSwitch("remote-debugging-port", "9222");
electron_1.app.commandLine.appendSwitch("remote-debugging-address", "0.0.0.0");
electron_1.app.commandLine.appendSwitch("remote-allow-origins", "*");
function createMainWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1440,
        height: 920,
        webPreferences: {
            preload: node_path_1.default.join(__dirname, "../preload/preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    if (isDev) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
        win.webContents.openDevTools({ mode: "detach" });
    }
    else {
        win.loadFile(node_path_1.default.join(electron_1.app.getAppPath(), "dist/index.html"));
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
