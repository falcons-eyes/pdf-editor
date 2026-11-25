// Smoke test: launches the app with Playwright's Electron driver against an isolated home folder
// (PDFE_HOME_OVERRIDE), checks the desktop API, opens the sample, places an asset, saves a signed
// PDF through the page's own save path and verifies it with pdf-lib, then seals it (desktop.seal),
// checks every verify status, the .p12 backup round trip, the private key folder guard and
// desktop.setLanguage, and opens the sealed file in the page (pdf.js). Screenshots and the sealed
// sample (sealed-<platform>.pdf + -cert.pem, for test/validate_pyhanko.py) go to test/out/.
//
//   node test/smoke.mjs                 # the unpacked build in dist/ (npm run pack)
//   node test/smoke.mjs --dev           # electron . (needs npm run build:page)
//   node test/smoke.mjs --app <path>    # a .app bundle, an executable, or PDFE_APP=<path>
import { execFile } from "node:child_process";
import { _electron as electron } from "playwright";
import { PDFDocument } from "pdf-lib";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(DESKTOP, "test", "out");
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };

function resolveTarget() {
  if (argv.includes("--dev")) return { executablePath: require("electron"), args: [DESKTOP], label: "electron ." };
  let p = flag("--app") || process.env.PDFE_APP;
  if (!p) {
    const dist = path.join(DESKTOP, "dist");
    const candidates = process.platform === "darwin"
      ? [`mac-${process.arch}`, "mac", "mac-arm64", "mac-universal"].map((d) => path.join(dist, d, "PDF Editor.app"))
      : process.platform === "win32" ? [path.join(dist, "win-unpacked", "PDF Editor.exe"), path.join(dist, "win-arm64-unpacked", "PDF Editor.exe")]
      : [path.join(dist, "linux-unpacked", "pdf-editor-desktop")];
    p = candidates.find((c) => fs.existsSync(c));
    if (!p) throw new Error(`no unpacked build found in ${dist}; run npm run pack or pass --app`);
  }
  if (p.endsWith(".app")) p = path.join(p, "Contents", "MacOS", path.basename(p, ".app"));
  return { executablePath: p, args: [], label: p };
}

/** a classic incremental update after the seal: new /Info object, xref section, trailer with /Prev */
function appendUpdate(pdf) {
  const s = pdf.toString("latin1");
  const trailer = s.slice(s.lastIndexOf("trailer"));
  const prev = +/startxref\s+(\d+)\s+%%EOF\s*$/.exec(s)[1];
  const root = /\/Root\s+(\d+\s+\d+\s+R)/.exec(trailer)[1];
  const size = +/\/Size\s+(\d+)/.exec(trailer)[1];
  const head = `\n${size} 0 obj\n<< /Producer (edited after sealing) >>\nendobj\n`;
  const xrefAt = pdf.length + Buffer.byteLength(head);
  const tail = `xref\n${size} 1\n${String(pdf.length + 1).padStart(10, "0")} 00000 n \ntrailer\n<< /Size ${size + 1} /Root ${root} /Info ${size} 0 R /Prev ${prev} >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.concat([pdf, Buffer.from(head + tail, "latin1")]);
}
const menuLabels = (app) => app.evaluate(({ Menu }) => (Menu.getApplicationMenu()?.items || []).map((i) => ({ label: i.label, items: (i.submenu?.items || []).map((s) => s.label) })));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  return !!ok;
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const home = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "pdfe-smoke-")));
  fs.mkdirSync(path.join(home, "Out"));
  const target = resolveTarget();
  console.log(`app:  ${target.label}\nhome: ${home}`);
  const env = { ...process.env, PDFE_HOME_OVERRIDE: home };
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({ executablePath: target.executablePath, args: target.args, env, timeout: 90_000 });
  const problems = [];
  const watch = (page) => {
    page.on("console", (m) => {
      const t = m.text();
      if (m.type() === "error") problems.push(`console.error: ${t}`);
      if (/fake worker|Content Security Policy|Refused to/i.test(t)) problems.push(`${m.type()}: ${t}`);
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("requestfailed", (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));
  };
  app.on("window", watch);
  let page;
  try {
    page = await app.firstWindow();
    watch(page);
    await page.waitForFunction(() => window.__pdfe && window.__pdfe.S.fs && window.__pdfe.Store.disk, null, { timeout: 30_000 });
    check("boot: __pdfe present, disk storage enabled", true);
    check("loaded from app://", page.url().startsWith("app://pdf-editor/"), page.url());

    const storeDir = path.join(home, "Library", "Application Support", "PDF Editor");
    check("data store created under the override home", fs.existsSync(storeDir), storeDir);
    check("electron userData kept out of the data store", !fs.existsSync(path.join(storeDir, ".electron")) && fs.existsSync(path.join(home, ".pdfe-electron")));

    // ---- desktop API contract ----
    const api = await page.evaluate(async () => {
      const d = await window.claude.use("desktop");
      const r = { standalone: d.standalone, platform: d.platform, version: d.version, other: await window.claude.use("nope") };
      const err = async (p) => { try { await p; return "resolved"; } catch (e) { return String(e.message); } };
      r.enoent = await err(d.fs.stat("~/does-not-exist"));
      await d.fs.mkdir("~/api/a/b", { recursive: true });
      await d.fs.writeFile("~/api/a/t.txt", "안녕 hello");
      r.text = await d.fs.readFile("~/api/a/t.txt", "utf8");
      const bin = await d.fs.readFile("~/api/a/t.txt");
      r.binIsU8 = bin instanceof Uint8Array; r.binLen = bin.length;
      r.b64 = await d.fs.readFile("~/api/a/t.txt", "base64");
      await d.fs.writeFile("~/api/a/b.bin", new Uint8Array([1, 2, 3]).buffer);
      r.stat = await d.fs.stat("~/api/a/b.bin");
      await d.fs.copyFile("~/api/a/b.bin", "~/api/a/c.bin");
      await d.fs.rename("~/api/a/c.bin", "~/api/a/d.bin");
      r.list = (await d.fs.readdir("~/api/a")).map((e) => `${e.name}:${e.isDirectory ? "d" : "f"}`);
      r.exists = [await d.fs.exists("~/api/a/d.bin"), await d.fs.exists("~/api/a/c.bin")];
      r.rmFolder = await err(d.fs.rm("~/api", { force: true }));   // folders are never deleted
      await d.fs.rm("~/api/a/d.bin");
      r.gone = !(await d.fs.exists("~/api/a/d.bin")) && (await d.fs.exists("~/api/a/t.txt"));
      r.rmMissing = await err(d.fs.rm("~/api/a/d.bin"));
      r.rmForce = await err(d.fs.rm("~/api/a/d.bin", { force: true }));
      r.perm = [await d.permissions.state("full-access"), await d.permissions.state(), await d.permissions.request(["full-access"])];
      r.win = await d.window.setOptions({ minWidth: 880, minHeight: 600, titleBarStyle: "hiddenInset" });
      r.os = [await d.os.platform(), await d.os.arch()];
      r.dock = await d.app.dock.setIcon("data:image/png;base64,");
      r.pathForBlobFile = d.pathForFile(new File(["x"], "x.pdf"));
      r.badUrl = await err(d.openExternal("file:///etc/passwd"));
      r.install = await d.install.state();
      return r;
    });
    check("standalone flags", api.standalone === true && api.platform === process.platform && /^\d+\.\d+\.\d+/.test(api.version) && api.other === null, `${api.platform} ${api.version}`);
    check("fs errors start with the code", /^ENOENT: /.test(api.enoent), api.enoent);
    check("fs write/read utf8/binary/base64", api.text === "안녕 hello" && api.binIsU8 && api.binLen === Buffer.byteLength("안녕 hello") && api.b64 === Buffer.from("안녕 hello").toString("base64"));
    check("fs stat", api.stat.size === 3 && api.stat.isFile && !api.stat.isDirectory && api.stat.mtimeMs > 0);
    check("fs readdir/copy/rename", JSON.stringify(api.list) === JSON.stringify(["b.bin:f", "b:d", "d.bin:f", "t.txt:f"]) || JSON.stringify([...api.list].sort()) === JSON.stringify(["b.bin:f", "b:d", "d.bin:f", "t.txt:f"]), api.list.join(" "));
    check("fs exists/rm (files only)", api.exists[0] && !api.exists[1] && api.gone && /^ENOENT/.test(api.rmMissing) && api.rmForce === "resolved" && /^EPERM/.test(api.rmFolder), api.rmFolder);
    check("permissions granted", api.perm[0] === "granted" && api.perm[1]["full-access"] === "granted" && api.perm[2]["full-access"] === "granted");
    check("window.setOptions applied now", api.win?.applied === "now");
    check("os / dock / install", api.os[0] === process.platform && api.os[1] && api.dock.written === false && api.install === "installed");
    check("pathForFile on an in-memory File is null", api.pathForBlobFile === null);
    check("openExternal refuses non-https", /^EPERM/.test(api.badUrl), api.badUrl);
    check("files written into the override home", fs.existsSync(path.join(home, "api", "a", "t.txt")));

    // menus: the page's template reached the native menu, and clicks come back to the page
    // (the page picks Korean or English from the system language; either is fine here)
    const labels = (await menuLabels(app)).map((m) => m.label);
    const has = (ko, en) => labels.includes(ko) || labels.includes(en);
    check("application menu from the page", has("파일", "File") && has("편집", "Edit") && has("도움말", "Help"), labels.join(" | "));

    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `home-${process.platform}.png`) });

    // ---- sample document, place an asset, save ----
    await page.evaluate(() => window.__pdfe.loadSample());
    await page.waitForFunction(() => window.__pdfe.S.view === "editor" && window.__pdfe.S.pages.length > 0 && window.__pdfe.S.overlays.length >= 2, null, { timeout: 30_000 });
    const before = await page.evaluate(() => window.__pdfe.S.overlays.length);
    await page.evaluate(() => {
      const { S, placeAsset } = window.__pdfe;
      const a = [...S.assets.values()].find((x) => x.sample) || [...S.assets.values()][0];
      placeAsset(a.id, 0);
    });
    const after = await page.evaluate(() => window.__pdfe.S.overlays.length);
    check("placed an asset", after === before + 1, `${before} -> ${after}`);
    const info = await page.evaluate(() => ({ inputSize: window.__pdfe.S.doc.bytes.length, pages: window.__pdfe.S.pages.length }));
    await page.evaluate(() => window.__pdfe.performSave("smoke_signed.pdf", "~/Out", false));
    const saved = path.join(home, "Out", "smoke_signed.pdf");
    check("saved PDF exists", fs.existsSync(saved), saved);
    const bytes = fs.readFileSync(saved);
    check("saved PDF is larger than the input", bytes.length > info.inputSize, `${info.inputSize} -> ${bytes.length} bytes`);
    const doc = await PDFDocument.load(bytes);
    check("saved PDF parses with pdf-lib, page count matches", doc.getPageCount() === info.pages, `${doc.getPageCount()} pages`);
    const exp = await page.evaluate(() => window.__pdfe.S.rec ? window.__pdfe.S.rec.export?.path : "(sample: no record)");
    check("page recorded the export path", exp === "~/Out/smoke_signed.pdf" || exp === "(sample: no record)", exp);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `editor-${process.platform}.png`) });

    // ---- seal: identity, sign, verify statuses, backup, key folder guard ----
    const sealed = await page.evaluate(async () => {
      const d = await window.claude.use("desktop");
      const err = async (p) => { try { await p; return "resolved"; } catch (e) { return String(e.message); } };
      const r = { api: !!d.seal && typeof d.setLanguage === "function" };
      if (!r.api) return r;
      // the page may already have made one (it shouldn't without the user); start clean
      await d.seal.removeIdentity();
      r.before = await d.seal.identity();
      r.created = await d.seal.createIdentity({ name: "홍길동", org: "Smoke", email: "smoke@example.com" });
      r.again = await err(d.seal.createIdentity({ name: "someone else" }));
      r.identity = await d.seal.identity();
      const pdf = await d.fs.readFile("~/Out/smoke_signed.pdf");
      const out = await d.seal.sign(pdf, { reason: "smoke", location: "Seoul", lang: "ko" });
      r.isBytes = out instanceof Uint8Array && out.length > pdf.length;
      await d.fs.writeFile("~/Out/smoke_sealed.pdf", out);
      r.v = await d.seal.verify(out);
      r.unsigned = (await d.seal.verify(pdf)).status;
      r.garbage = (await d.seal.verify(new Uint8Array([37, 80, 68, 70, 1, 2, 3]))).status;
      const p12 = await d.seal.exportIdentity({ password: "smoke-비밀" });
      r.p12 = p12 instanceof Uint8Array && p12.length > 1000;
      await d.seal.removeIdentity();
      r.afterRemove = await d.seal.identity();
      r.noIdentity = [await err(d.seal.sign(pdf)), await err(d.seal.exportIdentity({ password: "x" }))];
      r.notMine = (await d.seal.verify(out)).signatures[0]?.mine;
      r.wrong = await err(d.seal.importIdentity(p12, { password: "wrong" }));
      r.imported = await d.seal.importIdentity(p12.buffer, { password: "smoke-비밀" });
      r.mineAgain = (await d.seal.verify(out)).signatures[0]?.mine;
      const sealDir = "~/Library/Application Support/PDF Editor/seal";
      r.guard = [
        await err(d.fs.readFile(`${sealDir}/key.bin`)),
        await err(d.fs.writeFile(`${sealDir}/cert.pem`, "x")),
        await err(d.fs.copyFile(`${sealDir}/key.bin`, "~/Out/stolen.bin")),
        // case-insensitive file systems (macOS, Windows): another spelling is the same folder
        ...(d.platform === "linux" ? [] : [await err(d.fs.readFile("~/library/application support/pdf editor/SEAL/key.bin"))]),
        await err(d.fs.rm(`${sealDir}/identity.json`)),
      ];
      r.listOk = Array.isArray(await d.fs.readdir(sealDir));
      return r;
    });
    if (check("desktop.seal and setLanguage exposed", sealed.api)) {
      const s0 = sealed.v?.signatures?.[0] || {};
      check("seal: no identity at first, createIdentity", sealed.before === null && sealed.created?.name === "홍길동" && sealed.created.org === "Smoke" && /^[0-9A-F]{4}( [0-9A-F]{4}){15}$/.test(sealed.created.fingerprint) && sealed.created.imported === false && ["os", "file"].includes(sealed.created.protected), JSON.stringify(sealed.created));
      check("seal: second createIdentity -> EEXIST", /^EEXIST: /.test(sealed.again), sealed.again);
      check("seal: sign returns bytes", sealed.isBytes);
      check("seal: verify -> intact, mine, certify", sealed.v.status === "intact" && s0.mine && s0.certify && s0.digestOk && s0.signatureOk && s0.coversWholeFile && s0.name === "홍길동" && s0.fingerprint === sealed.created.fingerprint, JSON.stringify(sealed.v));
      check("seal: unsigned -> none, garbage -> none", sealed.unsigned === "none" && sealed.garbage === "none", `${sealed.unsigned} ${sealed.garbage}`);
      check("seal: export .p12, remove, import -> same fingerprint", sealed.p12 && sealed.afterRemove === null && sealed.notMine === false && sealed.imported?.fingerprint === sealed.created.fingerprint && sealed.mineAgain === true);
      check("seal: sign/export without an identity -> ENOENT", sealed.noIdentity.every((m) => /^ENOENT: /.test(m)), sealed.noIdentity.join(" | "));
      check("seal: import with a wrong password -> EPASSWORD", /^EPASSWORD: /.test(sealed.wrong), sealed.wrong);
      check("seal: the page can't read or change the key folder", sealed.guard.every((g) => /^EPERM: /.test(g)) && sealed.listOk, sealed.guard.join(" | "));
      const sealDisk = path.join(storeDir, "seal");
      check("seal: key stored encrypted under the data store", fs.existsSync(path.join(sealDisk, "key.bin")) && !fs.readFileSync(path.join(sealDisk, "key.bin")).includes("PRIVATE KEY") && fs.existsSync(path.join(sealDisk, "cert.pem")));

      const sealedPath = path.join(home, "Out", "smoke_sealed.pdf");
      const sealedBytes = fs.readFileSync(sealedPath);
      const flipped = Buffer.from(sealedBytes); flipped[40] ^= 0x01;
      fs.writeFileSync(path.join(home, "Out", "flipped.pdf"), flipped);
      fs.writeFileSync(path.join(home, "Out", "appended.pdf"), appendUpdate(sealedBytes));
      const st = await page.evaluate(async () => {
        const d = await window.claude.use("desktop");
        const v = async (p) => (await d.seal.verify(await d.fs.readFile(p))).status;
        return { flipped: await v("~/Out/flipped.pdf"), appended: await v("~/Out/appended.pdf") };
      });
      check("seal: one byte flipped -> invalid", st.flipped === "invalid", st.flipped);
      check("seal: incremental update appended -> modified", st.appended === "modified", st.appended);
      check("seal: sealed PDF parses with pdf-lib", (await PDFDocument.load(sealedBytes)).getPageCount() === info.pages);
      fs.copyFileSync(sealedPath, path.join(OUT, `sealed-${process.platform}.pdf`));
      fs.writeFileSync(path.join(OUT, `sealed-${process.platform}-cert.pem`), fs.readFileSync(path.join(sealDisk, "cert.pem")));

      // ---- desktop.setLanguage: main's own menus follow, and the choice is kept ----
      const startLang = labels.includes("편집") ? "ko" : "en";
      const langOf = async (l) => { await page.evaluate((x) => window.claude.use("desktop").then((d) => d.setLanguage(x)), l); return menuLabels(app); };
      const en = await langOf("en");
      const enTop = en.map((m) => m.label);
      const help = en.find((m) => m.label === "Help");
      const appItems = process.platform === "darwin" ? en[0].items : [];
      check("setLanguage(\"en\"): Edit / Window / Help menus in English", enTop.includes("Edit") && enTop.includes("Window") && help?.items.includes("GitHub repository") && (process.platform !== "darwin" || appItems.includes("Quit PDF Editor")), enTop.join(" | "));
      const ko = await langOf("ko");
      const koTop = ko.map((m) => m.label);
      check("setLanguage(\"ko\"): back to Korean", koTop.includes("편집") && koTop.includes("도움말") && ko.find((m) => m.label === "도움말")?.items.includes("GitHub 저장소"), koTop.join(" | "));
      const bad = await page.evaluate(() => window.claude.use("desktop").then((d) => d.setLanguage("fr")).then(() => "resolved", (e) => e.message));
      const saved = JSON.parse(fs.readFileSync(path.join(home, ".pdfe-electron", "settings.json"), "utf8"));
      check("setLanguage: persisted, unknown language -> EINVAL", saved.lang === "ko" && /^EINVAL: /.test(bad), `${JSON.stringify(saved)} ${bad}`);
      await langOf(startLang);
    }
    // ---- the page's own flow: save dialog with "Seal and save" (first use makes the identity), then Verify seal ----
    if (sealed.api) {
      await page.evaluate(async () => {
        const d = await window.claude.use("desktop");
        await d.seal.removeIdentity();
        window.__pdfe.SEAL.id = undefined;
        await window.__pdfe.openSaveDialog();
      });
      await page.fill("#save-name", "e2e_sealed");
      if (!(await page.isChecked("#save-seal"))) await page.click("#save-seal");
      await page.fill("#save-seal-name", "E2E Sealer");
      await page.click("#save-ok");
      const e2ePath = path.join(home, "Out", "e2e_sealed.pdf");
      for (let i = 0; i < 100 && !fs.existsSync(e2ePath); i++) await page.waitForTimeout(100);
      await page.waitForTimeout(300);
      const e2e = await page.evaluate(async () => {
        const d = await window.claude.use("desktop");
        const bytes = await d.fs.readFile("~/Out/e2e_sealed.pdf");
        await window.__pdfe.openVerify?.();
        await window.__pdfe.verifyBytes(bytes, "e2e_sealed.pdf");
        const box = document.querySelector("#v-result .v-status");
        const v = await d.seal.verify(bytes);
        return { id: await d.seal.identity(), status: v.status, sig: v.signatures[0], ui: box ? { cls: box.className, text: box.innerText.split("\n")[0] } : null };
      });
      check("page flow: Seal and save created the identity and wrote a sealed PDF", fs.existsSync(e2ePath) && e2e.id?.name === "E2E Sealer", JSON.stringify(e2e.id));
      check("page flow: Verify seal shows intact (mine, certified)", e2e.status === "intact" && e2e.sig?.mine && e2e.sig?.certify && /\bok\b/.test(e2e.ui?.cls || ""), `${e2e.status} · ${e2e.ui?.text}`);
      await page.screenshot({ path: path.join(OUT, `verify-${process.platform}.png`) });
      await page.keyboard.press("Escape");
      await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((dl) => dl.close()));
    }

    // ---- menu click round trip: 파일/File > 보관함으로 돌아가기 (⇧⌘H) ----
    await app.evaluate(({ Menu }) => {
      const file = Menu.getApplicationMenu().items.find((i) => i.label === "파일" || i.label === "File");
      file.submenu.items.find((i) => i.accelerator === "CmdOrCtrl+Shift+H").click();
    });
    await page.waitForFunction(() => window.__pdfe.S.view === "home", null, { timeout: 10_000 }).catch(() => {});
    check("menu click reaches the page", (await page.evaluate(() => window.__pdfe.S.view)) === "home");

    // ---- open a PDF from the OS (macOS open-file / second-instance argv elsewhere) ----
    await page.evaluate(async () => {
      const d = await window.claude.use("desktop");
      window.__smokeOpened = [];
      d.onOpenFile((p) => window.__smokeOpened.push(p));
    });
    await app.evaluate(({ app: a }, file) => {
      if (process.platform === "darwin") a.emit("open-file", { preventDefault() {} }, file);
      else a.emit("second-instance", {}, [process.execPath, ...(a.isPackaged ? [] : ["."]), file], process.cwd());
    }, saved);
    await page.waitForFunction(() => window.__smokeOpened.length > 0, null, { timeout: 10_000 }).catch(() => {});
    const opened = await page.evaluate(() => window.__smokeOpened);
    check("onOpenFile delivers a page path", opened[0] === "~/Out/smoke_signed.pdf", JSON.stringify(opened));
    // the page's own onOpenFile handler opens it in the editor
    await page.waitForFunction(() => window.__pdfe.S.view === "editor" && window.__pdfe.S.rec?.source?.path === "~/Out/smoke_signed.pdf", null, { timeout: 15_000 }).catch(() => {});
    const src = await page.evaluate(() => ({ view: window.__pdfe.S.view, path: window.__pdfe.S.rec?.source?.path, pages: window.__pdfe.S.pages.length }));
    check("page opened the PDF from the OS", src.view === "editor" && src.path === "~/Out/smoke_signed.pdf" && src.pages === info.pages, JSON.stringify(src));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, `opened-${process.platform}.png`) });

    // ---- the sealed file opens and renders in the page (pdf.js) ----
    const sealedFile = path.join(home, "Out", "smoke_sealed.pdf");
    if (fs.existsSync(sealedFile)) {
      await app.evaluate(({ app: a }, file) => {
        if (process.platform === "darwin") a.emit("open-file", { preventDefault() {} }, file);
        else a.emit("second-instance", {}, [process.execPath, ...(a.isPackaged ? [] : ["."]), file], process.cwd());
      }, sealedFile);
      await page.waitForFunction(() => window.__pdfe.S.view === "editor" && window.__pdfe.S.rec?.source?.path === "~/Out/smoke_sealed.pdf" && window.__pdfe.S.pages.length > 0, null, { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const rendered = await page.evaluate(() => {
        const S = window.__pdfe.S;
        const canvases = [...document.querySelectorAll("canvas")].filter((c) => c.width > 0 && c.height > 0);
        const painted = canvases.some((c) => { try { const g = c.getContext("2d"); const { data } = g.getImageData(0, 0, Math.min(c.width, 64), Math.min(c.height, 64)); return data.some((v, i) => i % 4 !== 3 && v !== 0); } catch { return false; } });
        return { path: S.rec?.source?.path, pages: S.pages.length, canvases: canvases.length, painted };
      });
      check("sealed PDF opens and renders in the page (pdf.js)", rendered.path === "~/Out/smoke_sealed.pdf" && rendered.pages === info.pages && rendered.canvases > 0 && rendered.painted, JSON.stringify(rendered));
      await page.screenshot({ path: path.join(OUT, `sealed-${process.platform}.png`) });
    }

    // README pictures (not checks): a bigger window, a signature and stamp on the opened document,
    // then the 보관함 listing it. On Windows also a real screen grab so the window buttons show.
    try {
      await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setContentSize(1440, 900); w.center(); w.focus(); });
      await page.waitForTimeout(600);
      // the signed page of the saved contract (its signature and stamp are now part of the PDF)
      await page.evaluate(async () => {
        window.__pdfe.select(null);
        window.__pdfe.S.pages[window.__pdfe.S.pages.length - 1]?.thumb?.click();
        await new Promise((r) => setTimeout(r, 1200));
      });
      const grab = async (name) => {
        await page.screenshot({ path: path.join(OUT, `${name}-${process.platform}.png`) });
        if (process.platform !== "win32") return;
        const b = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
        const out = path.join(OUT, `${name}-${process.platform}-window.png`).replace(/'/g, "''");
        const ps = `Add-Type -AssemblyName System.Drawing; $b = New-Object System.Drawing.Bitmap ${b.width}, ${b.height}; ` +
          `$g = [System.Drawing.Graphics]::FromImage($b); $g.CopyFromScreen(${b.x}, ${b.y}, 0, 0, $b.Size); $b.Save('${out}')`;
        await new Promise((res) => execFile("powershell", ["-NoProfile", "-Command", ps], () => res()));
      };
      await grab("showcase-editor");
      await page.evaluate(() => window.__pdfe.showHome());
      await page.waitForTimeout(1200);
      await grab("showcase-home");
    } catch (e) { console.log("note: showcase screenshots skipped:", e.message); }

    check("no console errors / CSP violations / failed requests", problems.length === 0, problems.slice(0, 8).join("\n      "));
  } catch (e) {
    check("smoke run", false, e?.stack || String(e));
    if (page) await page.screenshot({ path: path.join(OUT, `failure-${process.platform}.png`) }).catch(() => {});
  } finally {
    await app.close().catch(() => {});
  }
  const docsJson = path.join(home, "Library", "Application Support", "PDF Editor", "documents.json");
  check("documents.json written on close", fs.existsSync(docsJson) && JSON.parse(fs.readFileSync(docsJson, "utf8")).length >= 1);
  if (!process.env.PDFE_KEEP_HOME) fs.rmSync(home, { recursive: true, force: true });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed; screenshots in ${path.relative(process.cwd(), OUT) || OUT}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
