// Sealworks for Android: window.claude.use("desktop") for the page (web/pdf-editor.html), loaded
// before the page script. Same shape as the desktop shell's preload (desktop/src/preload.js); the
// Android contract is docs/design/android.md, the additions are listed in mobile/README.md.
//
// Paths the page sees:
//   "~/Library/Application Support/PDF Editor/…"   the app's private store (filesDir/store/…)
//   "/android/<id>/<display name>"                  a document the user picked, created or shared
//   "/android/<id>"                                 its (virtual) folder, or a picked folder (tree)
// Anything else is EPERM (no storage permission: documents come through the system picker only).
import { Capacitor, registerPlugin } from "@capacitor/core";

const Files = registerPlugin("SealworksFiles");
const SealFiles = registerPlugin("SealworksSeal");
const Sys = registerPlugin("SealworksSystem");

const STORE = "~/Library/Application Support/PDF Editor";
const CHUNK = 3 * 1024 * 1024; // multiple of 3: base64 chunks join without re-encoding
const LINKS = Object.freeze({
  privacy: "https://sealworks.falconoon.com/privacy/",
  support: "https://sealworks.falconoon.com/support/",
  repo: "https://github.com/falcons-eyes/pdf-editor",
});
// native confirmations around the seal, same words as the desktop shell (desktop/src/main.js LABELS)
const LABELS = {
  ko: {
    replaceQ: "지금 쓰는 봉인 정보를 바꿀까요?", replaceD: "지금 열쇠로 만든 봉인은 그대로 확인되지만, 앞으로는 새 열쇠로 봉인합니다. 백업이 없으면 지금 열쇠는 되찾을 수 없습니다.",
    removeQ: "봉인 정보를 지울까요?", removeD: "백업이 없으면 지금 열쇠는 되찾을 수 없습니다.", replaceOk: "바꾸기", removeOk: "지우기", cancel: "취소",
  },
  en: {
    replaceQ: "Replace your current sealer identity?", replaceD: "Files you already sealed still verify, but new seals will use the new key. Without a backup, the current key can't be recovered.",
    removeQ: "Delete your sealer identity?", removeD: "Without a backup, the current key can't be recovered.", replaceOk: "Replace", removeOk: "Delete", cancel: "Cancel",
  },
};

/* ---------------- errors ---------------- */
const CODE_RE = /^(E[A-Z0-9]+):/;
function fsError(code, message) {
  const e = new Error(`${code}: ${message}`);
  e.code = code;
  return e;
}
/** native rejections -> Error("CODE: message") with .code, like the desktop preload */
function normalize(e) {
  const msg = String(e?.message || e || "EIO: failed");
  const code = (typeof e?.code === "string" && /^E[A-Z0-9]+$/.test(e.code) ? e.code : null) || CODE_RE.exec(msg)?.[1] || "EIO";
  const out = new Error(CODE_RE.test(msg) ? msg : `${code}: ${msg}`);
  out.code = code;
  return out;
}
const call = async (p) => { try { return await p; } catch (e) { throw normalize(e); } };

/* ---------------- bytes ---------------- */
const tag = (v) => Object.prototype.toString.call(v);
function b64encode(u8) {
  if (typeof u8.toBase64 === "function") return u8.toBase64();
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64decode(s) {
  if (typeof Uint8Array.fromBase64 === "function") return Uint8Array.fromBase64(s);
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function toBytes(data, enc) {
  if (typeof data === "string") return enc === "base64" ? b64decode(data) : new TextEncoder().encode(data);
  if (data instanceof ArrayBuffer || tag(data) === "[object ArrayBuffer]") return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data && typeof data.arrayBuffer === "function") return new Uint8Array(await data.arrayBuffer());
  throw fsError("EINVAL", "data must be a string, ArrayBuffer, typed array or Blob");
}

/* ---------------- page paths ---------------- */
function target(p) {
  if (typeof p !== "string" || !p || p.includes("\0")) throw fsError("EINVAL", `invalid path: ${String(p)}`);
  let q = p.replace(/\/{2,}/g, "/");
  if (q.length > 1 && q.endsWith("/")) q = q.slice(0, -1);
  if (q === STORE || q.startsWith(STORE + "/")) {
    const rel = q.slice(STORE.length + 1);
    const parts = rel ? rel.split("/") : [];
    if (parts.some((s) => s === "." || s === "..")) throw fsError("EINVAL", `invalid path: ${p}`);
    if (parts[0] === "seal") throw fsError("EPERM", `the sealer key folder is private: ${p}`);
    return { store: parts.join("/") };
  }
  const m = /^\/android\/([a-z0-9]{4,40})(?:\/([^/]+))?$/.exec(q);
  if (m) return m[2] ? { doc: m[1], name: m[2] } : { doc: m[1] };
  throw fsError("EPERM", `this app only reaches documents you pick or share with it: ${p}`);
}
const docPath = (d) => (d.tree ? `/android/${d.id}` : `/android/${d.id}/${d.name}`);
const docIdOf = (p) => (typeof p === "string" ? /^\/android\/([a-z0-9]{4,40})(?:\/|$)/.exec(p)?.[1] : undefined);

/* ---------------- fs ---------------- */
async function readAll(t, enc) {
  const { token } = await call(Files.openRead({ target: t }));
  const parts = [];
  try {
    for (;;) {
      const r = await call(Files.readChunk({ token }));
      parts.push(r.data);
      if (r.eof) break;
    }
  } catch (e) { Files.closeRead({ token }).catch(() => {}); throw e; }
  if (enc === "base64") return parts.join("");
  const chunks = parts.map(b64decode);
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return enc === "utf8" || enc === "utf-8" ? new TextDecoder().decode(out) : out;
}
async function writeAll(t, bytes) {
  const { token } = await call(Files.openWrite({ target: t }));
  try {
    for (let i = 0; i < bytes.length; i += CHUNK) await call(Files.writeChunk({ token, data: b64encode(bytes.subarray(i, i + CHUNK)) }));
    await call(Files.commitWrite({ token }));
  } catch (e) { Files.abortWrite({ token }).catch(() => {}); throw e; }
}

const fs = {
  readFile: async (path, enc) => readAll(target(path), enc),
  writeFile: async (path, data, enc) => writeAll(target(path), await toBytes(data, enc)),
  readdir: async (path) => (await call(Files.readdir({ target: target(path) }))).entries,
  stat: async (path) => call(Files.stat({ target: target(path) })),
  exists: async (path) => { try { await call(Files.stat({ target: target(path) })); return true; } catch { return false; } },
  mkdir: async (path, o) => { await call(Files.mkdir({ target: target(path), recursive: !!o?.recursive })); },
  rename: async (from, to) => { await call(Files.rename({ from: target(from), to: target(to) })); },
  rm: async (path, o) => { await call(Files.rm({ target: target(path), force: !!o?.force })); },
  copyFile: async (from, to) => {
    const a = target(from), b = target(to);
    if ("store" in a && "store" in b) await call(Files.copyFile({ from: a, to: b }));
    else await writeAll(b, await readAll(a));
  },
};

/* ---------------- dialogs ---------------- */
const KINDS = new Set(["pdf", "image", "cert", "folder"]);
const str = (v) => (typeof v === "string" ? v : undefined);
const dialog = {
  /** system picker (ACTION_OPEN_DOCUMENT / _TREE) -> page paths | null; read (and write when offered) access is kept */
  open: async (o = {}) => {
    const kind = KINDS.has(o?.kind) ? o.kind : "pdf";
    const r = await call(Files.pick({ kind, multiple: !!o?.multiple && kind !== "folder", start: docIdOf(o?.start) }));
    const docs = r?.docs || [];
    return docs.length ? docs.map(docPath) : null;
  },
  /** system save panel (ACTION_CREATE_DOCUMENT, application/pdf) -> page path | null */
  save: async (o = {}) => {
    let name = str(o?.name) || "document.pdf";
    if (!/\.pdf$/i.test(name)) name += ".pdf";
    const r = await call(Files.create({ name, mime: "application/pdf", start: docIdOf(str(o?.start)) }));
    return r?.doc ? docPath(r.doc) : null;
  },
};
const access = {
  /** re-pick a document (or folder) whose access was lost -> granted page path (same path when the same file is picked) | null */
  request: async (path, o) => {
    const r = await call(Files.access({ start: docIdOf(String(path)), kind: o?.kind === "folder" ? "folder" : "pdf" }));
    return r?.doc ? docPath(r.doc) : null;
  },
};

/* ---------------- documents sent to the app (VIEW / SEND) ---------------- */
const openCallbacks = [];
const openQueue = [];
const deliver = (p) => {
  if (!openCallbacks.length) { openQueue.push(p); return; }
  for (const cb of openCallbacks) { try { cb(p); } catch (err) { console.error(err); } }
};
Files.addListener("openFile", (d) => { if (d?.id) deliver(docPath(d)); });
function onOpenFile(cb) {
  if (typeof cb !== "function") throw fsError("EINVAL", "callback required");
  openCallbacks.push(cb);
  for (const p of openQueue.splice(0)) deliver(p);
  return () => { const i = openCallbacks.indexOf(cb); if (i >= 0) openCallbacks.splice(i, 1); };
}

/* ---------------- back button ---------------- */
// desktop.onBack(cb): cb() runs when the system back button (or gesture) is used; return (or resolve)
// true when the page used it (closed a sheet/dialog, left the editor). Newest callback first; when
// none returns true the app goes to the background, like Android's own back at the root.
// Without any callback the shim's fallback closes the top open <dialog>, then leaves the editor.
const backCallbacks = [];
function onBack(cb) {
  if (typeof cb !== "function") throw fsError("EINVAL", "callback required");
  backCallbacks.push(cb);
  return () => { const i = backCallbacks.indexOf(cb); if (i >= 0) backCallbacks.splice(i, 1); };
}
function fallbackBack() {
  const open = [...document.querySelectorAll("dialog[open]")].pop();
  if (open) {
    const ev = new Event("cancel", { cancelable: true });
    if (open.dispatchEvent(ev)) open.close();
    return true;
  }
  const pdfe = window.__pdfe;
  if (pdfe?.S?.view === "editor" && typeof pdfe.showHome === "function") { pdfe.showHome(); return true; }
  return false;
}
Sys.addListener("back", async () => {
  let used = false;
  for (const cb of [...backCallbacks].reverse()) {
    try { if (await cb()) { used = true; break; } } catch (e) { console.error(e); }
  }
  if (!used && !backCallbacks.length) used = fallbackBack();
  if (!used) Sys.exitApp().catch(() => {});
});

/* ---------------- seal (desktop/src/seal.js in a worker) ---------------- */
let lang = "en";
let worker = null, workerReady = null, nextCall = 1;
const pendingSeal = new Map();
const sealFs = {
  readFile: async (p) => b64decode((await call(SealFiles.readFile({ path: p }))).data),
  writeFile: async (p, bytes) => { await call(SealFiles.writeFile({ path: p, data: b64encode(bytes) })); },
  rename: async (a, b) => { await call(SealFiles.rename({ from: a, to: b })); },
  rm: async (p) => { await call(SealFiles.rm({ path: p })); },
  mkdir: async (p) => { await call(SealFiles.mkdir({ path: p })); },
};
function startWorker() {
  if (workerReady) return workerReady;
  workerReady = (async () => {
    worker = new Worker("seal/seal-worker.js");
    worker.onmessage = async (ev) => {
      const m = ev.data || {};
      if (m.t === "fs") {
        try {
          const value = await sealFs[m.op](...m.args);
          worker.postMessage({ t: "fs-reply", id: m.id, ok: true, value });
        } catch (e) {
          const n = normalize(e);
          worker.postMessage({ t: "fs-reply", id: m.id, ok: false, error: n.message, code: n.code });
        }
        return;
      }
      if (m.t === "result") {
        const p = pendingSeal.get(m.id); if (!p) return;
        pendingSeal.delete(m.id);
        if (m.ok) p.resolve(m.value);
        else { const e = new Error(m.error); e.code = m.code; p.reject(e); }
      }
    };
    worker.onerror = (e) => console.error("seal worker", e.message);
    worker.postMessage({ t: "init", version: info.version, lang });
  })();
  return workerReady;
}
async function sealCall(op, ...args) {
  await startWorker();
  return new Promise((resolve, reject) => {
    const id = nextCall++;
    pendingSeal.set(id, { resolve, reject });
    worker.postMessage({ t: "call", id, op, args });
  });
}
const bytesOf = async (data) => {
  if (typeof data === "string") throw fsError("EINVAL", "bytes expected");
  const b = await toBytes(data);
  return new Uint8Array(b); // a copy the worker may keep
};
const opt = (o, keys) => {
  const out = {};
  if (o && typeof o === "object") for (const k of keys) if (o[k] !== undefined && o[k] !== null) out[k] = typeof o[k] === "boolean" ? o[k] : String(o[k]);
  return out;
};
async function confirmNative(q, d, ok) {
  const L = LABELS[lang];
  const r = await call(Sys.confirm({ title: q, message: d, ok, cancel: L.cancel }));
  return !!r?.ok;
}
const cancelled = () => fsError("ECANCELED", "cancelled");
const seal = {
  identity: () => sealCall("identity"),
  createIdentity: async (o) => {
    const a = opt(o, ["name", "org", "email", "replace"]);
    if (a.replace && (await sealCall("identity").catch(() => null)) && !(await confirmNative(LABELS[lang].replaceQ, LABELS[lang].replaceD, LABELS[lang].replaceOk))) throw cancelled();
    return sealCall("createIdentity", a);
  },
  /**
   * asks where to save (system save panel) and writes the .p12 itself -> { path } | null.
   * The panel comes first: picking a place gives the native key store a one-time export ticket
   * (SealKeys.kt), so the key can only leave Kotlin for a backup the user is saving right now.
   */
  exportIdentity: async (o) => {
    const a = opt(o, ["password", "defaultName", "start"]);
    // the same localized EINVAL / ENOENT as desktop, before any panel
    if (!a.password || !(await sealCall("identity"))) return sealCall("exportIdentity", { password: a.password });
    let name = String(a.defaultName || "sealer-backup.p12").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120);
    if (!/\.p12$/i.test(name)) name += ".p12";
    const r = await call(Files.create({ name, mime: "application/x-pkcs12", start: docIdOf(a.start) }));
    if (!r?.doc) return null;
    const path = docPath(r.doc);
    try {
      const p12 = await sealCall("exportIdentity", { password: a.password });
      await writeAll(target(path), p12);
    } catch (e) {
      Files.discard({ target: target(path) }).catch(() => {}); // the empty document the panel made
      throw e;
    }
    return { path };
  },
  importIdentity: async (p12, o) => {
    const bytes = await bytesOf(p12);
    if ((await sealCall("identity").catch(() => null)) && !(await confirmNative(LABELS[lang].replaceQ, LABELS[lang].replaceD, LABELS[lang].replaceOk))) throw cancelled();
    return sealCall("importIdentity", bytes, opt(o, ["password"]));
  },
  removeIdentity: async () => {
    if ((await sealCall("identity").catch(() => null)) && !(await confirmNative(LABELS[lang].removeQ, LABELS[lang].removeD, LABELS[lang].removeOk))) throw cancelled();
    await sealCall("removeIdentity");
  },
  sign: async (pdf, o) => sealCall("sign", await bytesOf(pdf), opt(o, ["reason", "location", "lang"])),
  verify: async (pdf) => sealCall("verify", await bytesOf(pdf)),
};

/* ---------------- the desktop object ---------------- */
let info = { version: "", lang: "en", debug: false };
let desktop = null;

async function setLanguage(l) {
  if (l !== "ko" && l !== "en") throw fsError("EINVAL", `unsupported language: ${String(l)}`);
  await call(Sys.setLanguage({ lang: l }));
  lang = l;
  if (worker) worker.postMessage({ t: "lang", lang: l });
}

function build() {
  return {
    standalone: true,
    platform: "android",
    mobile: true,
    sandboxed: true,
    version: info.version,
    links: LINKS,
    fs,
    shell: {
      openPath: async (p) => { await call(Files.openWith({ target: target(p) })); },
      showItemInFolder: async () => {},
      trashItem: async (p) => { throw fsError("EPERM", `documents can't be moved to the trash from this app: ${p}`); },
    },
    permissions: {
      state: async (name) => (name ? (name === "full-access" ? "granted" : "unavailable") : { "full-access": "granted" }),
      request: async () => ({ "full-access": "granted" }),
      manage: async () => {},
    },
    install: { state: async () => "installed", request: async () => "installed" },
    window: {
      setOptions: async () => ({ applied: "never" }),
      getOptions: async () => ({}),
      show: async () => {},
      hide: async () => {},
    },
    Menu: { setApplicationMenu: async () => {}, popup: async () => {} },
    app: { dock: { setIcon: async () => ({ written: false }), setBadge: async () => false } },
    os: { platform: async () => "android", arch: async () => "arm64" },
    dialog,
    access,
    pathForFile: () => null,
    onOpenFile,
    onBack,
    openExternal: async (url) => { await call(Sys.openExternal({ url: String(url) })); },
    seal,
    setLanguage,
  };
}

if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
  const ready = (async () => {
    try { info = { ...info, ...(await Sys.info()) }; } catch (e) { console.warn("SealworksSystem.info", e); }
    lang = info.lang === "ko" ? "ko" : "en";
    desktop = Object.freeze(build());
    if (info.debug) window.__sealworksTest = { Files, Sys, SealFiles, startWorker };
    return desktop;
  })();
  Object.defineProperty(window, "claude", {
    value: Object.freeze({ use: async (name) => (name === "desktop" ? ready : null) }),
    writable: false, configurable: false,
  });
}
