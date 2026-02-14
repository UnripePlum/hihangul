"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    versions: process.versions,
    macBrainBaseUrl: "http://localhost:8000",
    debugPing: () => electron_1.ipcRenderer.invoke("debug:ping")
};
electron_1.contextBridge.exposeInMainWorld("hihangul", api);
