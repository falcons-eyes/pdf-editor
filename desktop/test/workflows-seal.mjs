// Sealworks 1.3, block 6 and "AI reading" (docs/design/workflows.md): the No AI notice, the hidden text
// check, people I trust and the seal log, driven through web/pdf-editor.html in Chromium (Playwright) with the
// dev server's desktop stand-in (web/dev_server.py), in desktop mode and in Android mode (phone viewport, touch).
//
// Checks:
//   - the No AI notice: XMP metadata (TDMRep reservation, PLUS data mining, rights) and the visible line in the
//     output; it survives a real seal made in Node with src/pdfsig.js, and the seal verifies intact
//   - Verify (with the real seal's verify result): "No AI notice: present", covered by the seal; "modified" after an edit
//   - hidden text: every fixture in test/fixtures/hidden-text/ gives the expected finding, the clean fixture and every
//     example document the app makes (signatures, stamps, 간인, the AI line) give none; the editor's notice and list
//   - trust and untrust (Verify's "Trust this seal…", the Sealer's list: rename, remove, undo)
//   - the seal log: sealed saves, "log every use" for unsealed saves, the CSV export (never replacing a file)
// Screenshots go to test/out/workflows-seal/.
//
//   node test/workflows-seal.mjs                     both modes
//   node test/workflows-seal.mjs --mode android      one mode
// Needs: npm ci here (pdf-lib, pdfjs-dist, playwright), python3, and Chromium (PW_CHROMIUM, Playwright's own, or
// Chrome for Testing in ~/Library/Caches/ms-playwright). The dev server runs on a free port from 4521 to 4530 with
// a throwaway home folder; nothing is fetched from the network (cdnjs is served from node_modules).
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(DESKTOP, "..");
const OUT = path.join(DESKTOP, "test", "out", "workflows-seal");
const FIX = path.join(DESKTOP, "test", "fixtures", "hidden-text");
const { chromium } = require("playwright");
const { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } = require("pdf-lib");
const sig = require(path.join(DESKTOP, "src", "pdfsig.js"));
const pki = require(path.join(DESKTOP, "src", "pki.js"));

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const MODES = flag("--mode") ? [flag("--mode")] : ["desktop", "android"];

const results = [];
let prefix = "";
const check = (name, ok, detail = "") => {
  results.push({ name: prefix + name, ok: !!ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${prefix}${name}${detail ? ` — ${detail}` : ""}`);
  return !!ok;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (u8) => Buffer.from(u8).toString("base64");
const sha256 = (u8) => crypto.createHash("sha256").update(u8).digest("hex");

/* ---------- the dev server, the browser ---------- */
const portFree = (port) => new Promise((res) => { const s = net.createServer().once("error", () => res(false)).once("listening", () => s.close(() => res(true))).listen(port, "127.0.0.1"); });
async function startServer() {
  let port = null;
  for (let p = 4521; p <= 4530 && !port; p++) if (await portFree(p)) port = p;
  if (!port) throw new Error("no free port in 4521 to 4530");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pdfe-wf-seal-"));
  fs.writeFileSync(path.join(home, ".pdfe-fake-home"), "throwaway home for test/workflows-seal.mjs\n");
  for (const d of ["Documents", "Downloads", "Desktop"]) fs.mkdirSync(path.join(home, d), { recursive: true });
  const proc = spawn("python3", [path.join(ROOT, "web", "dev_server.py"), String(port)], { env: { ...process.env, PDFE_DEV_HOME: home }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://localhost:${port}/vendor/pdfjs/LICENSE.txt`); if (r.ok) break; } catch {}
    await sleep(100);
  }
  return { port, home, stop: () => { proc.kill(); fs.rmSync(home, { recursive: true, force: true }); } };
}
function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  if (!fs.existsSync(cache)) return undefined;
  for (const d of fs.readdirSync(cache).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    for (const arch of ["chrome-mac-arm64", "chrome-mac", "chrome-mac-x64"]) {
      const p = path.join(cache, d, arch, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}
const LIBS = {
  "pdf.min.js": path.join(DESKTOP, "node_modules", "pdfjs-dist", "build", "pdf.min.js"),
  "pdf-lib.min.js": path.join(DESKTOP, "node_modules", "pdf-lib", "dist", "pdf-lib.min.js"),
};
async function openApp(browser, port, mode, lang) {
  const android = mode === "android";
  const ctx = await browser.newContext(android
    ? { viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: lang === "ko" ? "ko-KR" : "en-US" }
    : { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, locale: lang === "ko" ? "ko-KR" : "en-US" });
  // offline: the two CDN libraries from node_modules (the same builds, so the SRI hashes match), no web fonts
  await ctx.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${port}/`)) return route.continue();
    const lib = Object.keys(LIBS).find((k) => u.startsWith("https://cdnjs.cloudflare.com/") && u.endsWith("/" + k));
    if (lib) return route.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: fs.readFileSync(LIBS[lib]) });
    return route.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const q = android ? "desktop=1&standalone=1&sandboxed=1&os=android&mobile=1" : "desktop=1&standalone=1";
  await page.goto(`http://localhost:${port}/?${q}`);
  await page.waitForFunction(() => window.__pdfe && window.__pdfeSeal && window.__pdfe.S.seal && window.__pdfe.S.fs, null, { timeout: 20000 });
  await page.evaluate((l) => window.__pdfe.setLang(l), lang);
  await sleep(500);
  return { ctx, page, errors };
}
const inPage = (page, fn, bytes, extra) => page.evaluate(async ([s, x, f]) => {
  const u8 = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  return (0, eval)(f)(u8, x);
}, [b64(bytes), extra ?? null, fn.toString()]);
const fromPage = async (page, expr) => Buffer.from(await page.evaluate(async (e) => {
  const u8 = await (0, eval)(e)(); let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s);
}, expr), "base64");

/* ---------- reading a PDF in Node ---------- */
async function xmpOf(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const s = doc.context.lookup(doc.catalog.get(PDFName.of("Metadata")));
  if (!s) return null;
  return Buffer.from(s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents()).toString("utf8");
}
const hasNotice = (xmp) => !!xmp && /<tdm:reservation>1<\/tdm:reservation>/.test(xmp) && /xmlns:tdm="http:\/\/www\.w3\.org\/ns\/tdmrep\/"/.test(xmp)
  && /<plus:DataMining>http:\/\/ns\.useplus\.org\/ldf\/vocab\/DMI-PROHIBITED-AIMLTRAINING<\/plus:DataMining>/.test(xmp) && /<dc:rights>/.test(xmp);
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

/* ---------- the page's own steps ---------- */
const scan = (page, bytes) => inPage(page, (u8) => window.__pdfeSeal.scanHiddenText(u8), bytes);
const pageText = (page, bytes) => inPage(page, async (u8) => {
  const pdf = await window.__pdfeSeal.openScanDoc(u8);
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) out.push((await (await pdf.getPage(i)).getTextContent()).items.map((x) => x.str).join(""));
  pdf.destroy(); return out;
}, bytes);
async function shot(page, name, { toasts = false } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  if (!toasts) await page.evaluate(() => { for (const t of document.querySelectorAll(".toast")) t.remove(); });
  await sleep(450); // a dialog slides up on a phone
  const file = path.join(OUT, name + ".png");
  await page.screenshot({ path: file });
  return file;
}
const toastText = (page) => page.evaluate(() => [...document.querySelectorAll(".toast span")].map((s) => s.textContent).join(" | "));
async function clickToast(page, label) {
  await page.locator(".toast button", { hasText: label }).first().click();
}
async function saveThroughDialog(page, { seal = false, ai = false, line = false, name }) {
  await page.evaluate(() => window.__pdfe.openSaveDialog());
  await page.waitForSelector("#dlg-save[open]");
  await page.fill("#save-name", name);
  if ((await page.isChecked("#save-seal")) !== seal) await page.click("#save-seal");
  await page.evaluate(() => { document.getElementById("save-more").open = true; }); // the notice is under “More options” (1.3 save dialog)
  if ((await page.isChecked("#save-ai")) !== ai) await page.click("#save-ai");
  if (ai && (await page.isChecked("#save-ai-line")) !== line) await page.click("#save-ai-line");
  return page;
}
async function submitSave(page) {
  const before = await page.evaluate(() => window.__pdfeLastExport || null);
  await page.click("#save-ok");
  await page.waitForFunction((b) => window.__pdfeLastExport && window.__pdfeLastExport !== b, before, { timeout: 20000 }).catch(() => {});
  await sleep(600);
  return fromPage(page, "async () => window.__pdfeLastExport");
}

async function runMode(browser, mode) {
  const android = mode === "android", lang = android ? "en" : "ko";
  prefix = `[${mode}] `;
  const srv = await startServer();
  const { ctx, page, errors } = await openApp(browser, srv.port, mode, lang);
  try {
    const T = (k, p) => page.evaluate(([k, p]) => window.__pdfe.t(k, p || {}), [k, p]);

    // ---- hidden text: fixtures ----
    const expected = JSON.parse(fs.readFileSync(path.join(FIX, "expected.json"), "utf8"));
    for (const [file, want] of Object.entries(expected)) {
      const r = await scan(page, fs.readFileSync(path.join(FIX, file)));
      const got = r.findings.map((f) => `${f.page}:${f.kind}:${f.sev}`).sort().join(" ");
      const exp = want.map((f) => `${f.page}:${f.kind}:${f.sev}`).sort().join(" ");
      const excerptOk = want.every((w) => w.sev !== "hidden" || r.findings.some((f) => f.kind === w.kind && /^Ignore previous instructions/.test(f.text) && f.text.length <= 121));
      check(`hidden text: ${file}`, got === exp && excerptOk && !r.failed, got || "no findings");
    }
    // the page cap
    {
      const doc = await PDFDocument.create();
      for (let i = 0; i < 205; i++) doc.addPage([200, 200]);
      const r = await scan(page, await doc.save());
      check("hidden text: scans at most 200 pages and says so", r.scanned === 200 && r.capped && r.pages === 205, JSON.stringify({ scanned: r.scanned, capped: r.capped }));
    }

    // ---- the app's own outputs: every example document, with its items and the AI line ----
    const ids = await page.evaluate(() => window.__pdfe.examples);
    const langs = android ? ["en"] : ["ko", "en"];
    let clean = 0, total = 0, noticeAll = true, lineAll = true;
    const bad = [];
    for (const l of langs) {
      for (const id of ids) {
        await page.evaluate(([i, l]) => window.__pdfe.loadExample(i, l), [id, l]);
        await page.waitForFunction(() => window.__pdfe.S.doc?.isSample && window.__pdfe.S.overlays.length > 0, null, { timeout: 15000 }).catch(() => {});
        const bytes = await fromPage(page, "async () => window.__pdfe.buildPdf({ ai: { notice: true, line: true } })");
        const r = await scan(page, bytes);
        // 1.3 examples: aiguard is a received file whose sender hid white text in it (and idcopy carries a scan app's
        // search layer); only what the app itself adds counts here, so findings already in the example's own PDF are left out
        const src = await scan(page, await fromPage(page, "async () => window.__pdfe.S.doc.bytes.slice()"));
        const key = (f) => `${f.page}|${f.kind}|${f.text}`, had = new Set(src.findings.map(key)), added = r.findings.filter((f) => !had.has(key(f)));
        total++;
        if (!added.length) clean++; else bad.push(`${id}/${l}: ${JSON.stringify(added)}`);
        if (!hasNotice(await xmpOf(bytes))) noticeAll = false;
        const text = await pageText(page, bytes);
        const want = l === "ko" ? "권리자의 허락 없이 이 문서를 AI 학습이나 분석에 쓸 수 없습니다." : "This document may not be used for AI training or analysis without the rights holder's permission.";
        if (!text.every((p) => p.replace(/\s+/g, "").includes(want.replace(/\s+/g, "")))) { lineAll = false; bad.push(`${id}/${l}: line missing in ${JSON.stringify(text.map((p) => p.slice(-120)))}`); }
      }
    }
    check(`app outputs (${total} example documents with items and the AI line): no hidden text added`, clean === total, bad.slice(0, 3).join(" || "));
    check("app outputs: No AI notice metadata in every one", noticeAll);
    check("app outputs: the visible line is real text on every page, in the document's language", lineAll, bad.filter((b) => b.includes("line missing")).slice(0, 2).join(" || ").slice(0, 600));
    if (!android) {
      await page.evaluate(() => window.__pdfe.loadExample("lease", "ko"));
      await sleep(1500);
      const kb = await fromPage(page, "async () => window.__pdfe.buildPdf({ ai: { notice: true, line: true } })");
      fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, "lease-ko-ai-line.pdf"), kb);
      // what the foot of a page looks like (pdf.js render of the output)
      await page.evaluate(async (s) => {
        const u8 = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
        const pdf = await window.__pdfeSeal.openScanDoc(u8);
        const pg = await pdf.getPage(1), vp = pg.getViewport({ scale: 2 });
        const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
        await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        const crop = document.createElement("canvas"); crop.width = vp.width; crop.height = 120;
        crop.getContext("2d").drawImage(c, 0, vp.height - 120, vp.width, 120, 0, 0, vp.width, 120);
        const img = new Image(); img.src = crop.toDataURL(); img.id = "foot-shot"; img.style.cssText = "position:fixed;left:0;top:0;z-index:99999;width:" + vp.width / 2 + "px;background:#fff;border:1px solid #888";
        document.body.append(img); await img.decode();
      }, b64(kb));
      await page.locator("#foot-shot").screenshot({ path: path.join(OUT, `${mode}-ai-line-foot.png`) });
      await page.evaluate(() => document.querySelector("#foot-shot")?.remove());
    }

    // ---- a real document: open, place a signature and a stamp, save with the No AI notice ----
    const contract = fs.readFileSync(path.join(FIX, "clean.pdf"));
    await inPage(page, (u8) => window.__pdfe.openPdfBytes(u8, "Service_Agreement.pdf"), contract);
    await sleep(2500);
    check("editor: no hidden text notice for a clean PDF", !(await toastText(page)).includes(await T("hid.toast")));
    const sampleIds = await page.evaluate(() => window.__pdfe.S.samples.slice(0, 3));
    await page.evaluate((ids) => { for (const id of ids) window.__pdfe.placeAsset(id, 0); }, sampleIds);
    const placed = await page.evaluate(() => window.__pdfe.S.overlays.map((o) => window.__pdfe.S.assets.get(o.assetId).name));

    // no identity yet: the first seal creates one (the stand-in's), then seals
    await saveThroughDialog(page, { seal: true, ai: true, line: true, name: "Service_Agreement_sealed" });
    if (await page.isVisible("#save-seal-name")) await page.fill("#save-seal-name", android ? "Jordan Lee" : "홍길동");
    await shot(page, `${mode}-save-dialog-ai`);
    const lineHiddenWhenOff = await page.evaluate(() => { const a = document.querySelector("#save-ai"); a.click(); const h = document.querySelector("#save-ai-line-row").hidden; a.click(); return h && !document.querySelector("#save-ai-line-row").hidden; });
    check("save dialog: the line option shows only with the notice on", lineHiddenWhenOff);
    const sealedMock = await submitSave(page);
    check("save: sealed with the notice (stand-in seal), metadata in the file", hasNotice(await xmpOf(sealedMock.subarray(0, sealedMock.lastIndexOf("\n%PDFE-MOCK-SEAL")))));
    const log1 = await page.evaluate(async () => { await window.__pdfeSeal.loadLog(); return window.__pdfeSeal.LOG.list.slice(); });
    const myFp = await page.evaluate(() => window.__pdfe.SEAL.id?.fingerprint);
    const last = log1[log1.length - 1] || {};
    check("seal log: a sealed save is recorded (time, file, path, SHA-256, fingerprint, items)",
      log1.length === 1 && last.sealed && last.file === "Service_Agreement_sealed.pdf" && !!last.path && last.sha256 === sha256(sealedMock)
        && last.sealer?.fingerprint === myFp && placed.every((n) => last.items.some((i) => i.name === n)) && Math.abs(Date.now() - last.at) < 60000,
      JSON.stringify({ ...last, sha256: last.sha256?.slice(0, 12) }));

    // unsealed save without "log every use": not logged
    await saveThroughDialog(page, { seal: false, ai: true, line: false, name: "Service_Agreement_plain" });
    const plain = await submitSave(page);
    check("save: unsealed with the notice and no line: metadata, no added text", hasNotice(await xmpOf(plain)) && !(await pageText(page, plain)).join(" ").includes("AI training"));
    check("seal log: an unsealed save isn't recorded", (await page.evaluate(() => window.__pdfeSeal.LOG.list.length)) === 1);

    // "log every use" on a library item (the tile's toggle), then an unsealed save is recorded too
    const stampId = sampleIds[0];
    const userStamp = await page.evaluate(async (id) => {
      const P = window.__pdfe, a = P.S.assets.get(id);
      const copy = await P.makeAssetFromSource(a.src, { kind: a.kind, name: "Company stamp" });
      await P.addToLibrary(copy); return copy.id;
    }, stampId);
    await page.evaluate(() => { const P = window.__pdfe; if (P.isCompact()) P.openSheet("editor", "lib"); });
    await sleep(400);
    const toggle = page.locator(`#lib .tile[data-id="${userStamp}"] .tile-acts button[aria-pressed]`);
    check("library: the item has a “log every use” toggle with an accessible name", (await toggle.count()) === 1 && /Company stamp/.test(await toggle.getAttribute("aria-label")));
    await toggle.scrollIntoViewIfNeeded();
    if (android) await toggle.tap(); else { await page.locator(`#lib .tile[data-id="${userStamp}"]`).hover(); await toggle.click(); }
    await shot(page, `${mode}-library-log-toggle`);
    check("library: the toggle turns on and is kept", await page.evaluate((id) => window.__pdfe.S.assets.get(id).logUse === true && document.querySelector(`#lib .tile[data-id="${id}"] .tile-acts button[aria-pressed]`).getAttribute("aria-pressed") === "true", userStamp));
    if (android) { await page.evaluate(() => window.__pdfe.closeSheet()); await sleep(300); }
    await page.evaluate((id) => window.__pdfe.placeAsset(id, 0), userStamp);
    await saveThroughDialog(page, { seal: false, ai: false, name: "Service_Agreement_stamped" });
    const stamped = await submitSave(page);
    const log2 = await page.evaluate(() => window.__pdfeSeal.LOG.list.slice());
    const l2 = log2[log2.length - 1] || {};
    check("seal log: an unsealed save using a “log every use” item is recorded", log2.length === 2 && !l2.sealed && l2.sealer === null && l2.items.some((i) => i.name === "Company stamp") && l2.sha256 === sha256(stamped));
    check("save: without the notice there's no reservation in the file", !hasNotice(await xmpOf(stamped)));

    // ---- the real seal (src/pdfsig.js in Node) keeps the notice ----
    const id = await pki.createSelfSigned({ name: "김하늘", org: "한빛상사" });
    const key = crypto.createPrivateKey({ key: id.keyDer, format: "der", type: "pkcs8" });
    const unsealed = await fromPage(page, "async () => window.__pdfe.buildPdf({ ai: { notice: true, line: true } })");
    const real = await sig.signPdf(unsealed, { certDer: id.certDer, key, name: "김하늘", reason: "Sealed with Sealworks" });
    const rv = await sig.verifyPdf(real);
    check("real seal: the /Metadata notice survives sealing", hasNotice(await xmpOf(real)), `${(await xmpOf(real))?.length} bytes of XMP`);
    check("real seal: verifies intact, covering the whole file", rv.status === "intact" && rv.signatures[0]?.coversWholeFile);
    check("real seal: no hidden text in the sealed file", !(await scan(page, real)).findings.length);
    const tampered = appendUpdate(Buffer.from(real));

    // Verify in the page with the real verify result (the stand-in can't check a real seal)
    await page.exposeFunction("__realVerify", async (s) => sig.verifyPdf(Buffer.from(s, "base64")));
    await page.evaluate(() => {
      const seal = window.__pdfe.S.seal, mock = seal.verify;
      seal.verify = async (bytes) => {
        const u8 = new Uint8Array(bytes); let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
        return /%PDFE-MOCK-SEAL/.test(s.slice(-2000)) ? mock(bytes) : window.__realVerify(btoa(s));
      };
    });
    await page.evaluate(() => window.__pdfe.openVerify());
    await inPage(page, (u8) => window.__pdfe.verifyBytes(u8, "Service_Agreement_김하늘.pdf"), real);
    await page.waitForSelector("#v-result .v-check.ok", { timeout: 15000 });
    await sleep(300);
    const vText = await page.locator("#v-result").innerText();
    check("verify: “No AI notice: present”, covered by the seal", vText.includes(await T("ai.v.title")) && vText.includes(await T("ai.v.covered")));
    check("verify: “No hidden text found”", vText.includes(await T("hid.none")));

    // ---- trust: Verify's card, then the Sealer's list ----
    const trustBtn = page.locator("#v-result button", { hasText: await T("trust.btn") });
    check("trust: “Trust this seal…” on a seal that isn't mine", (await trustBtn.count()) === 1);
    await trustBtn.click();
    await page.waitForSelector("#trust-name");
    check("trust: asks for a name (prefilled with the name in the seal), never automatic", (await page.inputValue("#trust-name")) === "김하늘" && (await page.evaluate(() => window.__pdfeSeal.trustedList().length)) === 0);
    await page.fill("#trust-name", "김하늘 (한빛상사 대표)");
    await page.click(`#v-result .trust-form button.primary`);
    await sleep(300);
    const head = await page.locator("#v-result .v-sig-head").first().innerText();
    const trusted = await page.evaluate(() => window.__pdfeSeal.trustedList().slice());
    check("trust: saved {fingerprint, label, addedAt} and shown prominently", trusted.length === 1 && trusted[0].fingerprint === sig.fingerprintOf(id.certDer) && trusted[0].label === "김하늘 (한빛상사 대표)" && trusted[0].addedAt > 0
      && head.includes(await T("trust.by", { name: "김하늘 (한빛상사 대표)" })) && head.includes(await T("trust.badge")), head.replace(/\n/g, " "));
    await page.evaluate(() => document.querySelector("#dlg-verify .dlg-body").scrollTo(0, 0));
    await shot(page, `${mode}-verify-trusted-ai-notice`);
    // a later verify of another file with the same seal shows the name too; the edited copy says what changed
    await inPage(page, (u8) => window.__pdfe.verifyBytes(u8, "Service_Agreement_edited.pdf"), tampered);
    await page.waitForSelector("#v-result .v-check h4", { timeout: 15000 });
    await page.waitForFunction(() => !document.querySelector("#v-result .v-check .spinner"), null, { timeout: 15000 });
    const vt2 = await page.locator("#v-result").innerText();
    check("verify (edited after sealing): still names the trusted sealer, the notice isn't vouched for", vt2.includes(await T("trust.by", { name: "김하늘 (한빛상사 대표)" })) && vt2.includes(await T("ai.v.changed")) && vt2.includes(await T("seal.modified")));
    await shot(page, `${mode}-verify-modified`);
    // the Sealer's list: rename, remove, undo, remove
    await page.locator("#v-result button", { hasText: await T("sealer.manage") }).first().click();
    await page.waitForSelector("#dlg-sealer[open] .s-list");
    await shot(page, `${mode}-sealer-trusted`);
    await page.locator("#sealer-body .s-list button.icon").first().click();
    await page.fill("#trust-rename", "김하늘 대표");
    await page.press("#trust-rename", "Enter");
    await sleep(200);
    check("trust: renamed in the Sealer's list", (await page.evaluate(() => window.__pdfeSeal.trustedList()[0]?.label)) === "김하늘 대표");
    await page.locator("#sealer-body .s-list button", { hasText: await T("trust.remove") }).click();
    check("trust: removed", (await page.evaluate(() => window.__pdfeSeal.trustedList().length)) === 0 && (await page.locator("#sealer-body .caveat").count()) === 1);
    await clickToast(page, await T("undo"));
    check("trust: undo brings it back", (await page.evaluate(() => window.__pdfeSeal.trustedList().length)) === 1);
    await page.locator("#sealer-body .s-list button", { hasText: await T("trust.remove") }).click();
    await sleep(700);
    const prefsFile = path.join(srv.home, "Library", "Application Support", "PDF Editor", "prefs.json");
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await sleep(800);
    check("trust: untrusted for good (prefs on disk)", fs.existsSync(prefsFile) && (JSON.parse(fs.readFileSync(prefsFile, "utf8")).trusted || []).length === 0);
    // the Android back button leaves the list for the Sealer's main view, then closes the dialog
    if (android) {
      check("android: back from the trusted list goes to the Sealer's main view", (await page.evaluate(() => window.__shimBack())) === true && (await page.evaluate(() => document.querySelector("#dlg-sealer").open && !document.querySelector("#sealer-body .s-list"))));
      await page.evaluate(() => window.__shimBack());
    } else await page.evaluate(() => document.querySelector("#dlg-sealer").close());
    await page.evaluate(() => document.querySelector("#dlg-verify").close());

    // verify an unsealed file with hidden text: no seal, a list
    await page.evaluate(() => window.__pdfe.openVerify());
    await inPage(page, (u8) => window.__pdfe.verifyBytes(u8, "white.pdf"), fs.readFileSync(path.join(FIX, "white.pdf")));
    await page.waitForSelector("#v-result .v-check.bad", { timeout: 15000 });
    const vt3 = await page.locator("#v-result .v-check.bad").innerText();
    check("verify: hidden text listed with page, kind and excerpt", vt3.includes(await T("hid.item", { n: 1, kind: await T("hid.k.white") })) && vt3.includes("Ignore previous instructions"), vt3.split("\n").slice(0, 4).join(" / "));
    await shot(page, `${mode}-verify-hidden-text`);
    await page.evaluate(() => document.querySelector("#dlg-verify").close());

    // ---- the seal log in the Sealer, and the CSV export ----
    await page.evaluate(() => window.__pdfe.openSealer("log"));
    await page.waitForSelector("#dlg-sealer[open] .s-list li");
    check("seal log: the Sealer lists the entries, newest first", (await page.locator("#sealer-body .s-list li").count()) === 2 && (await page.locator("#sealer-body .s-list li strong").first().innerText()) === "Service_Agreement_stamped.pdf");
    await shot(page, `${mode}-sealer-log`);
    fs.mkdirSync(path.join(srv.home, "Documents", "Logs"), { recursive: true });
    const date = new Date(), ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const base = await T("log.file", { date: ds });
    for (let k = 0; k < 2; k++) {
      await page.evaluate(() => { window.__shimDialogNext = ["~/Documents/Logs"]; });
      await page.click("#log-export");
      await sleep(900);
    }
    const f1 = path.join(srv.home, "Documents", "Logs", `${base}.csv`), f2 = path.join(srv.home, "Documents", "Logs", `${base} (2).csv`);
    const csv = fs.existsSync(f1) ? fs.readFileSync(f1, "utf8") : "";
    const rows = csv.replace(/^﻿/, "").trim().split(/\r\n/);
    check("CSV: written into the picked folder, with a header and one row per entry", csv.startsWith("﻿") && rows.length === 3 && rows[0].startsWith(await T("log.csv.at")) && rows.some((r) => r.includes(sha256(sealedMock))), `${rows.length} lines`);
    check("CSV: a second export is a new file, the first one is kept", fs.existsSync(f2) && fs.readFileSync(f2, "utf8") === csv);
    await page.evaluate(() => document.querySelector("#dlg-sealer").close());

    // the log is kept to the last 1,000
    await page.evaluate(async () => { const L = window.__pdfeSeal.LOG; for (let i = 0; i < 1005; i++) L.list.push({ ...L.list[0], at: L.list[0].at + i + 1, file: `bulk-${i}.pdf` }); });
    await saveThroughDialog(page, { seal: true, ai: false, name: "Service_Agreement_sealed_again" });
    await submitSave(page);
    const ll = await page.evaluate(() => ({ n: window.__pdfeSeal.LOG.list.length, last: window.__pdfeSeal.LOG.list.at(-1).file }));
    check("seal log: keeps the last 1,000 entries", ll.n === 1000 && ll.last === "Service_Agreement_sealed_again.pdf", JSON.stringify(ll));
    const logFile = path.join(srv.home, "Library", "Application Support", "PDF Editor", "seal-log.json");
    check("seal log: kept in the app's store (seal-log.json)", fs.existsSync(logFile) && JSON.parse(fs.readFileSync(logFile, "utf8")).length === 1000);

    // ---- the editor's notice for a PDF with hidden text, and its list ----
    await inPage(page, (u8) => window.__pdfe.openPdfBytes(u8, "Proposal_with_hidden_text.pdf"), fs.readFileSync(path.join(FIX, "near-white-page2.pdf")));
    await page.waitForFunction((s) => [...document.querySelectorAll(".toast span")].some((x) => x.textContent === s), await T("hid.toast"), { timeout: 15000 }).catch(() => {});
    const tt = await toastText(page);
    check("editor: a gentle notice when a PDF with hidden text opens", tt.includes(await T("hid.toast")), tt);
    await page.evaluate(() => { for (const t of [...document.querySelectorAll(".toast")].slice(0, -1)) t.remove(); });
    await shot(page, `${mode}-editor-hidden-notice`, { toasts: true });
    await clickToast(page, await T("hid.see"));
    await page.waitForSelector("#dlg-hidden[open] .hid-list li");
    const lt = await page.locator("#hidden-body").innerText();
    check("editor: the list names the page, the kind and the text", lt.includes(await T("hid.item", { n: 2, kind: await T("hid.k.white") })) && lt.includes("Ignore previous instructions"));
    await shot(page, `${mode}-editor-hidden-list`);
    if (android) check("android: back closes the list", (await page.evaluate(() => window.__shimBack())) === true && !(await page.evaluate(() => document.querySelector("#dlg-hidden").open)));
    else await page.keyboard.press("Escape");

    // accessible names on the new controls
    const unnamed = await page.evaluate(() => [...document.querySelectorAll("#save-ai, #save-ai-line, #dlg-hidden button, .tile-acts button")]
      .filter((b) => !(b.getAttribute("aria-label") || b.textContent.trim() || b.closest("label")?.textContent.trim())).length);
    check("accessible names on the new controls", unnamed === 0, `${unnamed} without a name`);
    check("no page errors", !errors.length, errors.slice(0, 3).join(" | "));
  } finally {
    await ctx.close();
    srv.stop();
  }
}

const browser = await chromium.launch({ executablePath: chromiumPath() });
try {
  for (const m of MODES) await runMode(browser, m);
} catch (e) {
  console.error(e); check("ran to the end", false, String(e?.message || e).split("\n")[0]);
} finally { await browser.close(); }
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} workflow checks passed (${MODES.join(", ")}); screenshots in ${path.relative(DESKTOP, OUT)}/`);
process.exit(failed.length ? 1 : 0);
