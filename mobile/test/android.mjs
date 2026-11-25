// Emulator test for the Android app: boots the Pixel_7 AVD headless (read-only, its own port), installs
// the debug APK, and drives the WebView over the Chrome DevTools Protocol (debug builds only:
// WebView.setWebContentsDebuggingEnabled). Checks the page boots offline (CSP, no request leaves
// https://localhost), the desktop shim (fs, paths, EPERM/ENOENT), the example document, placing a
// signature, saving through the save panel (the debug test hook answers it with a file in
// filesDir/test-docs, served by the app's own FileProvider and written through the ContentResolver),
// sealing and verifying (Keystore-protected key), .p12 backup/import, the back button, PDFs sent
// with VIEW/SEND intents while running and at cold start, and — without the test hook — the real
// system save and open panels (DocumentsUI, tapped through uiautomator). Screenshots go to test/out/.
//
//   node test/android.mjs [--build] [--keep-emulator] [--serial emulator-5554]
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DESKTOP = path.resolve(MOBILE, "..", "desktop");
const OUT = path.join(MOBILE, "test", "out");
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), "Library", "Android", "sdk");
const ADB = path.join(SDK, "platform-tools", "adb");
const EMULATOR = path.join(SDK, "emulator", "emulator");
const PKG = "com.falconoon.sealworks";
const APK = path.join(MOBILE, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const AVD = process.env.SEALWORKS_AVD || "Pixel_7";
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const PORT = 5584;
let SERIAL = arg("--serial") || `emulator-${PORT}`;
const startEmulator = !arg("--serial");
const CDP_PORT = 9333;
const { PDFDocument } = require("pdf-lib");
let deskSig = null;
try { deskSig = require(path.join(DESKTOP, "src", "pdfsig.js")); } catch {}

fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  return !!ok;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (...a) => execFileSync(ADB, ["-s", SERIAL, ...a], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const adbBuf = (...a) => execFileSync(ADB, ["-s", SERIAL, ...a], { maxBuffer: 64 * 1024 * 1024 });
const sh = (cmd) => adb("shell", cmd);
const shot = (name) => { fs.writeFileSync(path.join(OUT, `${name}.png`), adbBuf("exec-out", "screencap", "-p")); console.log(`     screenshot test/out/${name}.png`); };

/* ---------------- CDP ---------------- */
class Cdp {
  static async connect(port) {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find((t) => t.type === "page" && /^https:\/\/localhost\//.test(t.url));
      } catch {}
      if (!target) await sleep(500);
    }
    if (!target) throw new Error("no WebView page target over CDP");
    const c = new Cdp();
    c.ws = new WebSocket(target.webSocketDebuggerUrl);
    c.next = 1; c.pending = new Map(); c.handlers = [];
    c.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) { const p = c.pending.get(m.id); c.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
      else if (m.method) for (const h of c.handlers) h(m);
    };
    await new Promise((res, rej) => { c.ws.onopen = res; c.ws.onerror = () => rej(new Error("CDP socket error")); });
    return c;
  }
  send(method, params = {}) {
    const id = this.next++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`)); }, 180_000); });
  }
  on(fn) { this.handlers.push(fn); }
  async eval(fn, ...args) {
    const expr = `(${fn})(...${JSON.stringify(args)})`;
    const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  }
  async waitFor(fn, ms = 30_000, ...args) {
    const end = Date.now() + ms;
    for (;;) {
      try { if (await this.eval(fn, ...args)) return true; } catch {}
      if (Date.now() > end) return false;
      await sleep(250);
    }
  }
  close() { try { this.ws.close(); } catch {} }
}

async function attach() {
  let pid = "";
  for (let i = 0; i < 40 && !pid; i++) { try { pid = sh(`pidof ${PKG}`); } catch {} if (!pid) await sleep(250); }
  if (!pid) throw new Error("app process not running");
  try { execFileSync(ADB, ["-s", SERIAL, "forward", "--remove", `tcp:${CDP_PORT}`], { stdio: "ignore" }); } catch {}
  adb("forward", `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  const c = await Cdp.connect(CDP_PORT);
  await c.send("Runtime.enable");
  return { c, pid };
}

/* ---------------- uiautomator (real system panels) ---------------- */
function uiNodes() {
  sh("uiautomator dump /sdcard/sw-ui.xml >/dev/null 2>&1 || true");
  const xml = adb("exec-out", "cat", "/sdcard/sw-ui.xml");
  return [...xml.matchAll(/<node [^>]*>/g)].map((m) => {
    const a = (k) => (new RegExp(`${k}="([^"]*)"`).exec(m[0]) || [])[1] || "";
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(a("bounds"));
    return { text: a("text"), desc: a("content-desc"), id: a("resource-id"), pkg: a("package"), x: b ? (+b[1] + +b[3]) >> 1 : 0, y: b ? (+b[2] + +b[4]) >> 1 : 0 };
  });
}
async function tapWhere(pred, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const n = uiNodes().find(pred);
    if (n) { sh(`input tap ${n.x} ${n.y}`); return n; }
    await sleep(700);
  }
  return null;
}

/* ---------------- run ---------------- */
let emu = null;
async function main() {
  if (process.argv.includes("--build")) {
    execFileSync("npm", ["run", "sync"], { cwd: MOBILE, stdio: "inherit" });
    execFileSync("./gradlew", ["assembleDebug", "--console=plain"], { cwd: path.join(MOBILE, "android"), stdio: "inherit", env: { ...process.env, JAVA_HOME: process.env.JAVA_HOME || "/Applications/Android Studio.app/Contents/jbr/Contents/Home" } });
  }
  if (!fs.existsSync(APK)) throw new Error(`build the debug APK first (${APK})`);

  if (startEmulator) {
    console.log(`starting ${AVD} headless on ${SERIAL} …`);
    emu = spawn(EMULATOR, ["-avd", AVD, "-no-window", "-no-audio", "-no-boot-anim", "-read-only", "-no-snapshot-save", "-port", String(PORT)], { stdio: "ignore", detached: true });
    emu.unref();
  }
  execFileSync(ADB, ["-s", SERIAL, "wait-for-device"], { timeout: 180_000 });
  let booted = false;
  for (let i = 0; i < 240 && !booted; i++) { try { booted = sh("getprop sys.boot_completed") === "1"; } catch {} if (!booted) await sleep(1000); }
  if (!check("emulator booted", booted, `${AVD} ${SERIAL} API ${sh("getprop ro.build.version.sdk")}`)) return;
  sh("settings put global window_animation_scale 0; settings put global transition_animation_scale 0; settings put global animator_duration_scale 0");
  sh("input keyevent KEYCODE_WAKEUP; wm dismiss-keyguard || true");

  try { adb("uninstall", PKG); } catch {}
  adb("install", "-r", "-t", APK);
  const perms = sh(`dumpsys package ${PKG} | grep -E "android.permission" || true`);
  check("installed; no INTERNET or storage permission requested", !/INTERNET|STORAGE|MEDIA_/.test(perms), perms.split("\n").filter(Boolean).map((s) => s.trim()).join(", ") || "none");
  sh(`am start -W -n ${PKG}/.MainActivity`);
  let { c } = await attach();

  // reload with the network log on: every request must stay on https://localhost (or data:/blob:)
  const requests = [];
  c.on((m) => { if (m.method === "Network.requestWillBeSent") requests.push(m.params.request.url); });
  await c.send("Network.enable");
  await c.send("Page.enable");
  await c.send("Page.reload", { ignoreCache: true });
  await sleep(500);
  const up = await c.waitFor(() => window.__pdfe && window.__pdfe.S.fs && window.__pdfe.Store.disk, 60_000);
  check("page boots: __pdfe present, disk storage enabled", up);
  await sleep(1500);
  shot("01-home");

  const env = await c.eval(async () => {
    const d = await window.claude.use("desktop");
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || "";
    let remote = "not tried";
    try { await fetch("https://example.com/"); remote = "fetched!"; } catch (e) { remote = "blocked"; }
    return { platform: d.platform, mobile: d.mobile, sandboxed: d.sandboxed, standalone: d.standalone, version: d.version, csp, remote, seal: !!d.seal, onBack: typeof d.onBack, links: d.links, ua: navigator.userAgent };
  });
  check("desktop shim: android, mobile, sandboxed, standalone, version 1.2.0, seal, onBack", env.platform === "android" && env.mobile && env.sandboxed && env.standalone && env.version === "1.2.0" && env.seal && env.onBack === "function", JSON.stringify({ ...env, csp: undefined, ua: undefined }));
  check("CSP meta present and remote fetch blocked", /default-src 'self'/.test(env.csp) && /connect-src 'self' data: blob:/.test(env.csp) && env.remote === "blocked", env.remote);
  const offsite = requests.filter((u) => !/^(https:\/\/localhost\/|data:|blob:)/.test(u));
  check("offline: every request stayed on https://localhost", requests.length > 5 && offsite.length === 0, `${requests.length} requests${offsite.length ? `; offsite: ${offsite.join(", ")}` : ""}`);
  console.log(`     WebView: ${/Chrome\/[\d.]+/.exec(env.ua)?.[0]}`);

  // ---- the fs API and its path rules ----
  const fsr = await c.eval(async () => {
    const d = await window.claude.use("desktop");
    const err = async (p) => { try { await p; return "resolved"; } catch (e) { return String(e.message).split(":")[0]; } };
    const S = "~/Library/Application Support/PDF Editor";
    await d.fs.mkdir(S + "/t/x", { recursive: true });
    const big = new Uint8Array(7 * 1024 * 1024 + 5); for (let i = 0; i < big.length; i++) big[i] = (i * 31) & 255;
    await d.fs.writeFile(S + "/t/x/big.bin", big);
    const back = await d.fs.readFile(S + "/t/x/big.bin");
    let same = back.length === big.length; for (let i = 0; same && i < big.length; i += 4093) same = back[i] === big[i];
    await d.fs.writeFile(S + "/t/a.json", JSON.stringify({ k: "값" }), "utf8");
    const txt = await d.fs.readFile(S + "/t/a.json", "utf8");
    const b64 = await d.fs.readFile(S + "/t/a.json", "base64");
    await d.fs.rename(S + "/t/a.json", S + "/t/b.json");
    await d.fs.copyFile(S + "/t/b.json", S + "/t/c.json");
    const list = (await d.fs.readdir(S + "/t")).map((e) => `${e.name}${e.isDirectory ? "/" : ""}`).join(",");
    const st = await d.fs.stat(S + "/t/x/big.bin");
    const r = {
      big: same, txt, b64: atob(b64).length, list, size: st.size, mtime: st.mtimeMs > 0, isFile: st.isFile,
      missing: await err(d.fs.readFile(S + "/t/nope.json")), statMissing: await err(d.fs.stat(S + "/nope")),
      exists: [await d.fs.exists(S + "/t/b.json"), await d.fs.exists(S + "/t/zz"), await d.fs.exists("~/Documents")],
      outside: await err(d.fs.readFile("~/Documents/x.pdf")), outsideWrite: await err(d.fs.writeFile("~/Downloads/x.pdf", "x")),
      root: await err(d.fs.readdir("/")), sealDir: await err(d.fs.readdir(S + "/seal")), traversal: await err(d.fs.readFile(S + "/../x")),
      unknownDoc: await err(d.fs.stat("/android/zzzzzzzzzz/a.pdf")), noParent: await err(d.fs.writeFile(S + "/nodir/x.json", "{}")),
    };
    await d.fs.rm(S + "/t", { force: true });
    r.removed = !(await d.fs.exists(S + "/t"));
    return r;
  });
  check("fs: 7 MB write/read round trip (chunked), utf8/base64, rename, copy, readdir, stat", fsr.big && fsr.txt === '{"k":"값"}' && fsr.b64 > 0 && fsr.list === "b.json,c.json,x/" && fsr.size === 7 * 1024 * 1024 + 5 && fsr.isFile && fsr.mtime && fsr.removed, JSON.stringify({ list: fsr.list, size: fsr.size }));
  check("fs: ENOENT for missing store files; exists() false outside", fsr.missing === "ENOENT" && fsr.statMissing === "ENOENT" && fsr.noParent === "ENOENT" && fsr.exists.join() === "true,false,false");
  check("fs: EPERM outside the store, for the seal folder and unknown documents; EINVAL for ..", fsr.outside === "EPERM" && fsr.outsideWrite === "EPERM" && fsr.root === "EPERM" && fsr.sealDir === "EPERM" && fsr.unknownDoc === "EPERM" && fsr.traversal === "EINVAL", JSON.stringify(fsr));

  // ---- test hook (debug build): panels answer themselves ----
  const hook = await c.eval(async () => (await window.__sealworksTest.Files.testHook({ enable: true })));
  check("debug test hook on", !!hook?.dir, hook?.dir);

  // ---- example document, place a signature, save ----
  await c.eval(() => window.__pdfe.loadSample());
  check("example document loads", await c.waitFor(() => window.__pdfe.S.view === "editor" && window.__pdfe.S.pages.length > 0 && window.__pdfe.S.overlays.length >= 2, 30_000));
  const placed = await c.eval(() => {
    const { S, placeAsset } = window.__pdfe;
    const before = S.overlays.length;
    const a = [...S.assets.values()].find((x) => x.sample && /sig|서명/i.test(`${x.kind} ${x.name}`)) || [...S.assets.values()].find((x) => x.sample) || [...S.assets.values()][0];
    placeAsset(a.id, 0);
    return { before, after: S.overlays.length, asset: `${a.kind}:${a.name}`, input: S.doc.bytes.length, pages: S.pages.length };
  });
  check("placed a signature", placed.after === placed.before + 1, `${placed.asset}, ${placed.before} -> ${placed.after}`);
  await sleep(800);
  shot("02-editor-signed");
  const saved = await c.eval(async () => {
    window.__pdfeLastExport = null;
    await window.__pdfe.performSave("android_signed.pdf", "~/Downloads", false);
    const d = await window.claude.use("desktop");
    const docs = (await window.__sealworksTest.Files.testHook({ enable: true })).docs;
    const doc = docs.find((x) => x.name === "android_signed.pdf");
    const p = doc ? `/android/${doc.id}/${doc.name}` : null;
    const bytes = p ? await d.fs.readFile(p) : null;
    const st = p ? await d.fs.stat(p) : null;
    return { path: p, uri: doc?.uri, size: bytes?.length || 0, last: window.__pdfeLastExport?.length || 0, stat: st, prefsSave: window.__pdfe.S.prefs.lastDir.save, export: window.__pdfe.S.rec?.export?.path || null };
  });
  check("save: ~/Downloads is EPERM -> the save panel (test hook) -> written through the ContentResolver", saved.path && saved.size > placed.input && saved.size === saved.last && saved.stat?.size === saved.size, JSON.stringify(saved));
  const pulled = adbBuf("exec-out", "run-as", PKG, "cat", "files/test-docs/android_signed.pdf");
  fs.writeFileSync(path.join(OUT, "android_signed.pdf"), pulled);
  const pdoc = await PDFDocument.load(pulled);
  check("saved PDF on the device parses (pdf-lib on the host), page count matches", pulled.length === saved.size && pdoc.getPageCount() === placed.pages, `${pulled.length} bytes, ${pdoc.getPageCount()} pages`);

  // ---- seal ----
  const sealr = await c.eval(async (signedPath) => {
    const d = await window.claude.use("desktop");
    const err = async (p) => { try { await p; return "resolved"; } catch (e) { return String(e.message); } };
    const r = {};
    await d.seal.removeIdentity();
    r.before = await d.seal.identity();
    let t = Date.now();
    r.created = await d.seal.createIdentity({ name: "홍길동", org: "Android Test", email: "android@example.com" });
    r.createMs = Date.now() - t;
    r.again = await err(d.seal.createIdentity({ name: "someone else" }));
    const pdf = await d.fs.readFile(signedPath);
    t = Date.now();
    const out = await d.seal.sign(pdf, { reason: "android", location: "Seoul", lang: "ko" });
    r.signMs = Date.now() - t;
    r.isBytes = out instanceof Uint8Array && out.length > pdf.length;
    const dest = await d.dialog.save({ start: signedPath.replace(/\/[^/]+$/, ""), name: "android_sealed" });
    r.dest = dest;
    await d.fs.writeFile(dest, out);
    t = Date.now();
    r.v = await d.seal.verify(await d.fs.readFile(dest));
    r.verifyMs = Date.now() - t;
    const bad = new Uint8Array(out); bad[64] ^= 1;
    r.tampered = (await d.seal.verify(bad)).status;
    r.unsigned = (await d.seal.verify(pdf)).status;
    r.garbage = (await d.seal.verify(new Uint8Array([37, 80, 68, 70, 1, 2, 3]))).status;
    await d.setLanguage("ko");
    r.ko = await err(d.seal.sign(new Uint8Array([1, 2, 3])));
    await d.setLanguage("en");
    r.en = await err(d.seal.sign(new Uint8Array([1, 2, 3])));
    r.badLang = await err(d.setLanguage("fr"));
    const bk = await d.seal.exportIdentity({ password: "백업-pw-123", defaultName: "sealer.p12" });
    r.backup = bk;
    const p12 = await d.fs.readFile(bk.path);
    r.p12 = p12.length;
    await d.seal.removeIdentity();
    r.removed = await d.seal.identity();
    r.wrongPw = await err(d.seal.importIdentity(p12, { password: "nope" }));
    r.imported = await d.seal.importIdentity(p12, { password: "백업-pw-123" });
    r.mineAfterImport = (await d.seal.verify(out)).signatures[0]?.mine;
    return r;
  }, saved.path);
  const s0 = sealr.v?.signatures?.[0] || {};
  check("seal: identity created (Keystore-protected key: protected os)", sealr.before === null && sealr.created?.name === "홍길동" && sealr.created?.protected === "os" && /^EEXIST: /.test(sealr.again), `${sealr.created?.fingerprint} in ${sealr.createMs} ms`);
  check("seal: sign + verify on device -> intact, mine, DocMDP P=1", sealr.isBytes && sealr.v?.status === "intact" && s0.mine && s0.certify && s0.docMdp === 1 && s0.name === "홍길동", `sign ${sealr.signMs} ms, verify ${sealr.verifyMs} ms`);
  check("seal: tampered -> invalid, unsigned -> none, garbage -> none", sealr.tampered === "invalid" && sealr.unsigned === "none" && sealr.garbage === "none");
  check("seal: errors follow setLanguage (ko/en), unknown language EINVAL", sealr.ko === "EINVAL: 읽을 수 있는 PDF가 아닙니다" && sealr.en === "EINVAL: not a readable PDF" && /^EINVAL/.test(sealr.badLang), `${sealr.ko} | ${sealr.en}`);
  check("seal: .p12 backup through the save panel, wrong password EPASSWORD, import -> same fingerprint", sealr.backup?.path?.endsWith("/sealer.p12") && sealr.p12 > 1000 && sealr.removed === null && /^EPASSWORD/.test(sealr.wrongPw) && sealr.imported?.fingerprint === sealr.created?.fingerprint && sealr.mineAfterImport === true, JSON.stringify(sealr.backup));
  const sealedHost = adbBuf("exec-out", "run-as", PKG, "cat", "files/test-docs/android_sealed.pdf");
  fs.writeFileSync(path.join(OUT, "android_sealed.pdf"), sealedHost);
  if (deskSig) {
    const dv = await deskSig.verifyPdf(sealedHost);
    check("sealed on the device -> desktop (Node crypto) verifies intact", dv.status === "intact" && dv.signatures[0]?.certify && dv.signatures[0]?.name === "홍길동", dv.status);
  }
  const keyFiles = sh(`run-as ${PKG} ls no_backup no_backup/seal`).split(/\s+/).join(" ");
  const keyHead = adbBuf("exec-out", "run-as", PKG, "cat", "no_backup/seal/key.bin").subarray(0, 8).toString("latin1");
  check("seal: key files in no_backup/ (never backed up), key.bin written by the Keystore code", /key\.bin/.test(keyFiles) && !/key\.secret/.test(keyFiles) && keyHead === "PDFEK1O\n", keyFiles);
  const guard = await c.eval(async () => {
    const get = async (u) => { const r = await fetch(u); return `${r.status} ${(await r.text()).split(":")[0]}`; };
    const err = async (p) => { try { await p; return "resolved"; } catch (e) { return String(e.message).split(":")[0]; } };
    const P = window.__sealworksTest.SealFiles;
    return {
      exportNoTicket: await get("/_sealworks/export?fp=00"),
      signGarbage: await get("/_sealworks/sign?alg=sha256&d=AAAAAAAAAAAAAAAAAAAAAAAA&fp=00"),
      post: (await fetch("/_sealworks/sign", { method: "POST", body: "x" }).then((r) => r.status, () => "blocked")),
      writeKey: await err(P.writeFile({ path: "seal/key.bin", data: "AAAA" })),
    };
  });
  check("seal: the page can't take the key: export needs the save panel's ticket (403), only CMS attributes are signed (400), no key file writes", guard.exportNoTicket === "403 EPERM" && guard.signGarbage === "400 EINVAL" && guard.writeKey === "EPERM", JSON.stringify(guard));

  // ---- the page's own flow: save dialog with "Seal and save", then Verify seal ----
  const flow = await c.eval(async () => {
    const d = await window.claude.use("desktop");
    const { SEAL } = window.__pdfe;
    await window.__pdfe.openSaveDialog();
    await new Promise((r) => setTimeout(r, 300));
    const set = (sel, v) => { const el = document.querySelector(sel); if (!el) return false; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); return true; };
    set("#save-name", "e2e_sealed");
    const box = document.querySelector("#save-seal");
    if (box && !box.checked) box.click();
    await new Promise((r) => setTimeout(r, 300));
    set("#save-seal-name", "E2E Sealer");
    document.querySelector("#save-ok")?.click();
    for (let i = 0; i < 100; i++) {
      const docs = (await window.__sealworksTest.Files.testHook({ enable: true })).docs;
      const doc = docs.find((x) => x.name === "e2e_sealed.pdf");
      if (doc) {
        const p = `/android/${doc.id}/${doc.name}`;
        const st = await d.fs.stat(p).catch(() => null);
        if (st?.size > 0) {
          await new Promise((r) => setTimeout(r, 500));
          const bytes = await d.fs.readFile(p);
          await window.__pdfe.openVerify?.();
          await window.__pdfe.verifyBytes(bytes, "e2e_sealed.pdf");
          const ui = document.querySelector("#v-result .v-status");
          return { path: p, status: (await d.seal.verify(bytes)).status, ui: ui ? { cls: ui.className, text: ui.innerText.split("\n")[0] } : null, id: SEAL.id?.name };
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return { error: "the sealed file never appeared", dialogs: [...document.querySelectorAll("dialog[open]")].map((x) => x.id) };
  });
  check("page flow: Seal and save -> sealed file through the save panel; Verify seal shows intact", flow.status === "intact" && /\bok\b/.test(flow.ui?.cls || ""), JSON.stringify(flow));
  await sleep(600);
  shot("03-verify-intact");

  // ---- back button (shim fallback: close the top dialog, then leave the editor, then background) ----
  const openDialogs = () => c.eval(() => [...document.querySelectorAll("dialog[open]")].map((x) => x.id));
  const before = await openDialogs();
  sh("input keyevent KEYCODE_BACK");
  await sleep(700);
  const afterBack = await openDialogs();
  check("back: closes the open dialog", before.length > 0 && afterBack.length === before.length - 1, `${before.join(",")} -> ${afterBack.join(",") || "none"}`);
  for (let i = 0; i < 4 && (await openDialogs()).length; i++) { sh("input keyevent KEYCODE_BACK"); await sleep(500); }
  sh("input keyevent KEYCODE_BACK");
  check("back: leaves the editor for the library", await c.waitFor(() => window.__pdfe.S.view === "home", 5000));
  const viaHook = await c.eval(async () => {
    const d = await window.claude.use("desktop");
    window.__backSeen = 0;
    const off = d.onBack(() => { window.__backSeen++; return true; });
    window.__offBack = off;
    return true;
  });
  sh("input keyevent KEYCODE_BACK");
  await sleep(600);
  check("back: desktop.onBack callback gets it first (and keeps the app open)", viaHook && (await c.eval(() => window.__backSeen)) === 1 && sh("dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity' | head -1").includes(PKG));
  await c.eval(() => { window.__offBack(); return true; });
  sh("input keyevent KEYCODE_BACK");
  await sleep(1200);
  const top = sh("dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity' | head -1");
  check("back at the library root: the app goes to the background", !top.includes(PKG), top.trim());
  sh(`am start -W -n ${PKG}/.MainActivity`);
  await sleep(800);

  // ---- PDFs sent to the app while it runs (VIEW and SEND through content:// URIs) ----
  const fixture = path.join(DESKTOP, "test", "fixtures", "pyhanko-certified-plus-approval.pdf");
  const pushDoc = (name) => {
    adb("push", fixture, `/data/local/tmp/${name}`);
    sh(`cat /data/local/tmp/${name} | run-as ${PKG} sh -c 'mkdir -p files/test-docs && cat > files/test-docs/${name}'`);
    return `content://${PKG}.fileprovider/test/${name}`;
  };
  await c.eval(() => { window.__opened = []; return true; });
  const viewUri = pushDoc("view-test.pdf");
  sh(`am start -W -a android.intent.action.VIEW -d ${viewUri} -t application/pdf -n ${PKG}/.MainActivity`);
  const viewOk = await c.waitFor(() => window.__pdfe.S.view === "editor" && /^\/android\/[a-z0-9]+\/view-test\.pdf$/.test(window.__pdfe.S.rec?.source?.path || "") && window.__pdfe.S.pages.length > 0, 20_000);
  check("VIEW intent while running -> onOpenFile -> opened in the editor", viewOk, await c.eval(() => window.__pdfe.S.rec?.source?.path || window.__pdfe.S.view));
  await sleep(800);
  shot("04-opened-by-view-intent");
  const sendUri = pushDoc("send-test.pdf");
  sh(`am start -W -a android.intent.action.SEND -t application/pdf --eu android.intent.extra.STREAM ${sendUri} -n ${PKG}/.MainActivity`);
  check("SEND intent -> opened", await c.waitFor(() => /\/send-test\.pdf$/.test(window.__pdfe.S.rec?.source?.path || "") && window.__pdfe.S.pages.length > 0, 20_000));

  // ---- cold start with a VIEW intent; documents and the identity survive a restart ----
  c.close();
  sh(`am force-stop ${PKG}`);
  const coldUri = pushDoc("cold-start.pdf");
  sh(`am start -W -a android.intent.action.VIEW -d ${coldUri} -t application/pdf -n ${PKG}/.MainActivity`);
  ({ c } = await attach());
  const cold = await c.waitFor(() => window.__pdfe && window.__pdfe.S.view === "editor" && /\/cold-start\.pdf$/.test(window.__pdfe.S.rec?.source?.path || "") && window.__pdfe.S.pages.length > 0, 40_000);
  check("VIEW intent at cold start -> queued until the page listens -> opened", cold, await c.eval(() => window.__pdfe?.S.rec?.source?.path || window.__pdfe?.S.view).catch((e) => e.message));
  const persist = await c.eval(async (p) => {
    const d = await window.claude.use("desktop");
    const st = await d.fs.stat(p).catch((e) => e.message);
    const id = await d.seal.identity();
    const docs = window.__pdfe.S.docs.map((x) => x.source?.path).filter(Boolean);
    await window.__sealworksTest.Files.testHook({ enable: true }); // the test hook is per process
    return { st: st?.size || st, id: id?.name, protected: id?.protected, docs };
  }, saved.path);
  check("after restart: saved document still reachable by its page path, identity kept", persist.st === saved.size && persist.id === "홍길동" && persist.protected === "os", JSON.stringify(persist));
  await sleep(1000);
  shot("05-cold-start-open");

  // ---- open in another app (test hook records the content:// URI it would hand over) ----
  const ow = await c.eval(async (p) => {
    const d = await window.claude.use("desktop");
    await d.shell.openPath(p);
    const h = await window.__sealworksTest.Files.testHook({ enable: true });
    const err = async (q) => { try { await q; return "resolved"; } catch (e) { return String(e.message).split(":")[0]; } };
    return { last: h.lastOpened, reveal: await err(d.shell.showItemInFolder(p)), trash: await err(d.shell.trashItem(p)), ext: await err(d.openExternal("http://example.com")) };
  }, saved.path);
  check("shell: openPath -> ACTION_VIEW with the document URI; showItemInFolder resolves; trashItem EPERM; http links EINVAL", /^content:\/\//.test(ow.last || "") && ow.reveal === "resolved" && ow.trash === "EPERM" && ow.ext === "EINVAL", JSON.stringify(ow));

  // ---- the real system panels (no test hook): save panel creates a document, open panel picks it ----
  await c.eval(async () => { await window.__sealworksTest.Files.testHook({ enable: false }); return true; });
  const realName = `real_saf_${Date.now() % 100000}.pdf`;
  await c.eval((n) => { window.__realSave = window.claude.use("desktop").then((d) => d.dialog.save({ name: n })).then((p) => (window.__realSaved = p), (e) => (window.__realSaved = "ERR " + e.message)); return true; }, realName);
  await sleep(2500);
  shot("06-system-save-panel");
  let saveBtn = await tapWhere((n) => n.pkg.includes("documentsui") && /^(save|저장)$/i.test(n.text), 15_000);
  if (!saveBtn && /documentsui/.test(sh("dumpsys activity activities | grep -E 'topResumedActivity' | head -1"))) {
    // uiautomator can't dump while the panel animates: tap where DocumentsUI puts SAVE (bottom right)
    const [w, h] = (/(\d+)x(\d+)/.exec(sh("wm size")) || [0, 1080, 2400]).slice(1).map(Number);
    sh(`input tap ${Math.round(w * 0.86)} ${Math.round(h * 0.948)}`);
    saveBtn = { fallback: true };
  }
  let realPath = null;
  if (saveBtn) {
    await c.waitFor(() => window.__realSaved !== undefined, 15_000);
    realPath = await c.eval(() => window.__realSaved);
  }
  const realWrite = realPath && !String(realPath).startsWith("ERR") ? await c.eval(async (p) => {
    const d = await window.claude.use("desktop");
    const bytes = new Uint8Array(await (await fetch("data:application/pdf;base64," + btoa("%PDF-1.4\n% sealworks real SAF test\n%%EOF\n"))).arrayBuffer());
    await d.fs.writeFile(p, bytes);
    const back = await d.fs.readFile(p);
    const st = await d.fs.stat(p);
    return { size: back.length, stat: st.size, mtime: st.mtimeMs > 0 };
  }, realPath) : null;
  check("real save panel (DocumentsUI): document created, written and read back through its content:// URI", !!realWrite && realWrite.size === realWrite.stat && realWrite.size > 20 && realWrite.mtime, `${realPath} ${JSON.stringify(realWrite)}`);
  if (realWrite) {
    await c.eval(() => { window.__realOpened = undefined; window.claude.use("desktop").then((d) => d.dialog.open({ kind: "pdf" })).then((p) => (window.__realOpened = p), (e) => (window.__realOpened = "ERR " + e.message)); return true; });
    await sleep(2500);
    shot("07-system-open-panel");
    const picked = await tapWhere((n) => n.pkg.includes("documentsui") && n.text === realName, 20_000);
    if (picked) await c.waitFor(() => window.__realOpened !== undefined, 15_000);
    const opened = await c.eval(() => window.__realOpened);
    check("real open panel: picking the same file gives the same page path (persisted grant reused)", Array.isArray(opened) && opened[0] === realPath, JSON.stringify(opened));
    const grants = sh(`dumpsys activity permissions | grep -A3 "${PKG}" | head -20 || true`);
    console.log(`     persisted grants: ${grants.split("\n").filter((l) => /content:\/\//.test(l)).length || "(dumpsys format unknown)"}`);
  }
  shot("08-final");
  c.close();
}

main()
  .catch((e) => { console.error(e); check("test run", false, e.message); try { shot("failure"); } catch {} })
  .finally(() => {
    try { execFileSync(ADB, ["-s", SERIAL, "forward", "--remove", `tcp:${CDP_PORT}`], { stdio: "ignore" }); } catch {}
    if (startEmulator && !process.argv.includes("--keep-emulator")) {
      try { execFileSync(ADB, ["-s", SERIAL, "emu", "kill"], { stdio: "ignore" }); console.log("emulator stopped"); } catch {}
    }
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} Android checks passed`);
    process.exit(failed.length ? 1 : 0);
  });
