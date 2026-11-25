"use strict";
// Exposes window.claude.use("desktop"): the same desktop API the Claude artifact host provides,
// backed by the main process, plus a few standalone-only members (dialog, pathForFile, onOpenFile…).
const { contextBridge, ipcRenderer, webUtils } = require("electron");

const info = ipcRenderer.sendSync("pdfe:sync", "info") || {};

async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (r && r.ok === false) {
    const e = new Error(r.error);
    e.code = String(r.error).split(":")[0];
    throw e;
  }
  return r ? r.value : undefined;
}

const tag = (v) => Object.prototype.toString.call(v);
async function toWire(data) {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer || tag(data) === "[object ArrayBuffer]") return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data && typeof data.arrayBuffer === "function") return new Uint8Array(await data.arrayBuffer());
  throw new Error("EINVAL: data must be a string, ArrayBuffer, typed array or Blob");
}

const fsCall = (op, ...args) => call("pdfe:fs", op, ...args);
const fs = {
  readFile: (path, enc) => fsCall("readFile", path, enc),
  writeFile: async (path, data, enc) => fsCall("writeFile", path, await toWire(data), enc),
  readdir: (path) => fsCall("readdir", path),
  stat: (path) => fsCall("stat", path),
  exists: (path) => fsCall("exists", path),
  mkdir: (path, o) => fsCall("mkdir", path, { recursive: !!o?.recursive }),
  rename: (from, to) => fsCall("rename", from, to),
  rm: (path, o) => fsCall("rm", path, { force: !!o?.force }),
  copyFile: (from, to) => fsCall("copyFile", from, to),
};

// Menu: click functions stay here; main gets a plain template with numeric ids.
let menuHandlers = new Map();
function serializeMenu(items, handlers) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    if (!it || typeof it !== "object") return null;
    const out = {};
    for (const k of ["label", "role", "accelerator", "type", "enabled", "visible", "checked"]) if (it[k] !== undefined) out[k] = it[k];
    if (typeof it.click === "function") { const id = handlers.size + 1; handlers.set(id, it.click); out.__clickId = id; }
    if (Array.isArray(it.submenu)) out.submenu = serializeMenu(it.submenu, handlers);
    return out;
  }).filter(Boolean);
}
ipcRenderer.on("pdfe:menu-click", (_e, id) => {
  const fn = menuHandlers.get(id);
  if (fn) { try { fn(); } catch (err) { console.error(err); } }
});

// PDFs opened from the OS (Finder/Explorer, Dock, command line, second launch)
const openCallbacks = [];
const openQueue = [];
let openReady = false;
const deliver = (p) => {
  if (!openCallbacks.length) { openQueue.push(p); return; }
  for (const cb of openCallbacks) { try { cb(p); } catch (err) { console.error(err); } }
};
ipcRenderer.on("pdfe:open-file", (_e, p) => deliver(p));
function onOpenFile(cb) {
  if (typeof cb !== "function") throw new Error("EINVAL: callback required");
  openCallbacks.push(cb);
  for (const p of openQueue.splice(0)) deliver(p);
  if (!openReady) {
    openReady = true;
    call("pdfe:open-file-ready").then((list) => (list || []).forEach(deliver)).catch(() => {});
  }
  return () => { const i = openCallbacks.indexOf(cb); if (i >= 0) openCallbacks.splice(i, 1); };
}

const desktop = {
  standalone: true,
  platform: info.platform || process.platform,
  version: info.version || "",
  fs,
  shell: {
    openPath: (p) => call("pdfe:shell", "openPath", p),
    showItemInFolder: (p) => call("pdfe:shell", "showItemInFolder", p),
    trashItem: (p) => call("pdfe:shell", "trashItem", p),
  },
  permissions: {
    state: async (name) => (name ? (name === "full-access" ? "granted" : "unavailable") : { "full-access": "granted" }),
    request: async () => ({ "full-access": "granted" }),
    manage: async () => {},
  },
  install: { state: async () => "installed", request: async () => "installed" },
  window: {
    setOptions: (o) => call("pdfe:window", "setOptions", o && typeof o === "object" ? JSON.parse(JSON.stringify(o)) : {}),
    getOptions: () => call("pdfe:window", "getOptions"),
    show: () => call("pdfe:window", "show"),
    hide: () => call("pdfe:window", "hide"),
  },
  Menu: {
    setApplicationMenu: async (template) => {
      const handlers = new Map();
      const wire = serializeMenu(template, handlers);
      await call("pdfe:menu", wire);
      menuHandlers = handlers;
    },
    popup: async () => {},
  },
  app: { dock: { setIcon: async () => ({ written: false }), setBadge: async () => false } },
  os: { platform: async () => info.platform || process.platform, arch: async () => info.arch || process.arch },
  dialog: {
    open: (o) => call("pdfe:dialog", o && typeof o === "object" ? { kind: o.kind, title: o.title, start: o.start, multiple: !!o.multiple } : {}),
  },
  pathForFile: (file) => {
    try {
      const p = webUtils.getPathForFile(file);
      return p ? ipcRenderer.sendSync("pdfe:sync", "toPage", p) : null;
    } catch { return null; }
  },
  onOpenFile,
  openExternal: (url) => call("pdfe:open-external", String(url)),
};

contextBridge.exposeInMainWorld("claude", {
  use: async (name) => (name === "desktop" ? desktop : null),
});
