"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const defaultBrainBaseUrl = "http://localhost:8000";
const api = {
    versions: process.versions,
    brainBaseUrl: process.env.HIHANGUL_WINDOWS_BRAIN_URL ?? defaultBrainBaseUrl,
    debugPing: () => electron_1.ipcRenderer.invoke("debug:ping"),
    launchCodexLogin: () => electron_1.ipcRenderer.invoke("auth:codex-login"),
    ensureProviderCli: (provider) => electron_1.ipcRenderer.invoke("auth:ensure-provider-cli", provider)
};
electron_1.contextBridge.exposeInMainWorld("hihangul", api);
