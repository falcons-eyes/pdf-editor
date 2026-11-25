// Runs the seal (www/seal/seal-core.js: desktop/src/seal.js and friends) off the UI thread.
// The page never talks to this worker: only the Android shim (android-desktop.js) does, and it
// relays the seal folder's plain files (identity.json, cert.pem, chain.pem) to the SealworksSeal
// plugin. The private key never passes through the page: this worker talks to the native key store
// directly with synchronous requests to https://localhost/_sealworks/<op> (answered in Kotlin by
// SealKeys.kt), because desktop's seal code signs synchronously.
//
// main -> worker: { t: "init", version, lang } | { t: "lang", lang } | { t: "call", id, op, args }
//                 | { t: "fs-reply", id, ok, value?, error?, code? }
// worker -> main: { t: "result", id, ok, value?, error?, code? } | { t: "fs", id, op, args }
"use strict";
importScripts("seal-core.js");

let seal = null, lang = "en", nextId = 1;
const pending = new Map();
const fsCall = (op, ...args) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  postMessage({ t: "fs", id, op, args });
});
const storage = {
  readFile: (p) => fsCall("readFile", p),
  writeFile: (p, bytes) => fsCall("writeFile", p, bytes),
  rename: (a, b) => fsCall("rename", a, b),
  rm: (p) => fsCall("rm", p),
  mkdir: (p) => fsCall("mkdir", p),
};
// synchronous request to the native key store (GET; the parameters never leave the app: Kotlin
// answers in shouldInterceptRequest before any network code runs)
function requestSync(op, params) {
  const x = new XMLHttpRequest();
  x.open("GET", `/_sealworks/${op}?${new URLSearchParams(params)}`, false);
  try { x.send(); } catch (e) { return { ok: false, text: `EIO: ${e.message}` }; }
  return { ok: x.status === 200, text: x.responseText };
}
const OPS = new Set(["identity", "createIdentity", "exportIdentity", "importIdentity", "removeIdentity", "sign", "verify"]);

onmessage = async (e) => {
  const m = e.data || {};
  if (m.t === "fs-reply") {
    const p = pending.get(m.id); if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.value);
    else p.reject(Object.assign(new Error(m.error), { code: m.code }));
    return;
  }
  if (m.t === "init") {
    lang = m.lang === "ko" ? "ko" : "en";
    seal = SealworksSeal.createAndroidSeal({ storage, native: SealworksSeal.httpNative(requestSync), lang: () => lang, appVersion: m.version || "" });
    return;
  }
  if (m.t === "lang") { lang = m.lang === "ko" ? "ko" : "en"; return; }
  if (m.t !== "call") return;
  try {
    if (!seal) throw new Error("EIO: the seal is not ready");
    if (!OPS.has(m.op)) throw new Error(`EINVAL: unknown operation ${m.op}`);
    const value = await seal[m.op](...(m.args || []));
    const transfer = value instanceof Uint8Array && value.byteOffset === 0 && value.byteLength === value.buffer.byteLength ? [value.buffer] : [];
    postMessage({ t: "result", id: m.id, ok: true, value }, transfer);
  } catch (err) {
    const msg = String(err?.message || err);
    postMessage({ t: "result", id: m.id, ok: false, error: msg, code: err?.code || msg.split(":")[0] });
  }
};
