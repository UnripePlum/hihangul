"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const defaultBrainBaseUrl = "http://localhost:8000";
const defaultAgentBaseUrl = "http://localhost:9000";
const api = {
    versions: process.versions,
    brainBaseUrl: process.env.HIHANGUL_WINDOWS_BRAIN_URL ?? defaultBrainBaseUrl,
    agentBaseUrl: process.env.HIHANGUL_WINDOWS_AGENT_URL ?? defaultAgentBaseUrl,
    debugPing: () => electron_1.ipcRenderer.invoke("debug:ping"),
    launchCodexLogin: () => electron_1.ipcRenderer.invoke("auth:codex-login"),
    postCodexLoginFocus: () => electron_1.ipcRenderer.invoke("auth:post-codex-login-focus"),
    getCodexLoginStatusLocal: () => electron_1.ipcRenderer.invoke("auth:codex-login-status-local"),
    ensureProviderCli: (provider) => electron_1.ipcRenderer.invoke("auth:ensure-provider-cli", provider),
    getHostUser: () => electron_1.ipcRenderer.invoke("system:get-host-user"),
    getAppVersion: () => electron_1.ipcRenderer.invoke("system:get-app-version"),
    loadSessions: () => electron_1.ipcRenderer.invoke("session:load"),
    saveSessions: (payload) => electron_1.ipcRenderer.invoke("session:save", payload),
    saveSessionUpload: (payload) => electron_1.ipcRenderer.invoke("file:save-session-upload", payload),
    getNextResultPath: (payload) => electron_1.ipcRenderer.invoke("file:next-result-path", payload),
};
electron_1.contextBridge.exposeInMainWorld("hihangul", api);
