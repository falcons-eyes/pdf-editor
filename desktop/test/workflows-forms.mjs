// Sealworks 1.3, blocks 2 and 4 (docs/design/workflows.md): stamps that know where they are, forms and make many,
// driven through web/pdf-editor.html in Chromium (Playwright) with the dev server's desktop stand-in (web/dev_server.py),
// in desktop mode and in Android mode (phone viewport, touch).
//
// Checks:
//   - variables: page numbers put on every page are filled per page ("1 / 3" …); a {name} field shows as a chip in
//     the editor, is asked for in the save dialog, and is filled in, or left blank, in the file; {date:YYYY.MM.DD}
//   - no literal braces in any output (what was drawn, and pdf.js text of every page)
//   - the repeated pattern (반복 무늬) on every page as real text, no hidden text, none at all in a text-free copy
//   - the certified copy stamp (원본대조필): a boxed stamp with the date and the name line
//   - forms: save as form (forms.json), the Forms list, matching a new PDF with the same first page, applying it
//   - make many from a pasted table: 5 files named from the rows, a clash gives " (2)" and leaves the old file alone,
//     every file sealed (verifies) and in the seal log; a long run stopped midway
//   - the same items on 3 PDFs (one shorter, one Letter size)
//   - the save dialog: the No AI notice under "More options", "Seal" in view
// Screenshots go to test/out/workflows-forms/.
//
//   node test/workflows-forms.mjs                     both modes
//   node test/workflows-forms.mjs --mode android      one mode
// Needs: npm ci here (pdf-lib, pdfjs-dist, playwright), python3, and Chromium (PW_CHROMIUM, Playwright's own, or
// Chrome for Testing in ~/Library/Caches/ms-playwright). The dev server runs on a free port from 4531 to 4540 with
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
const OUT = path.join(DESKTOP, "test", "out", "workflows-forms");
const { chromium } = require("playwright");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

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
  for (let p = 4531; p <= 4540 && !port; p++) if (await portFree(p)) port = p;
  if (!port) throw new Error("no free port in 4531 to 4540");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pdfe-wf-forms-"));
  fs.writeFileSync(path.join(home, ".pdfe-fake-home"), "throwaway home for test/workflows-forms.mjs\n");
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
  await page.waitForFunction(() => window.__pdfe && window.__pdfeForms && window.__pdfe.S.seal && window.__pdfe.S.fs, null, { timeout: 20000 });
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
const pageText = (page, bytes) => inPage(page, async (u8) => {
  const pdf = await window.__pdfeSeal.openScanDoc(u8);
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) out.push((await (await pdf.getPage(i)).getTextContent()).items.map((x) => x.str).join(""));
  pdf.destroy(); return out;
}, bytes);
const scan = (page, bytes) => inPage(page, (u8) => window.__pdfeSeal.scanHiddenText(u8), bytes);
async function shot(page, name, { toasts = false } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  if (!toasts) await page.evaluate(() => { for (const t of document.querySelectorAll(".toast")) t.remove(); });
  await sleep(450);
  const file = path.join(OUT, name + ".png");
  await page.screenshot({ path: file });
  return file;
}
const toastText = (page) => page.evaluate(() => [...document.querySelectorAll(".toast span")].map((s) => s.textContent).join(" | "));
const clickToast = (page, label) => page.locator(".toast button", { hasText: label }).first().click();
const clearToasts = (page) => page.evaluate(() => { for (const t of document.querySelectorAll(".toast")) t.remove(); });
const drawn = (page) => page.evaluate(() => window.__pdfeForms.drawn());
const build = (page, opts = {}) => fromPage(page, `async () => window.__pdfe.buildPdf(${JSON.stringify(opts)})`);
const noBraces = (list) => list.every((s) => !/[{}]/.test(s));

/* ---------- test documents ---------- */
async function makePdf({ pages = 3, size = [595.28, 841.89], title = "Certificate of Completion", producer = "test" } = {}) {
  const doc = await PDFDocument.create();
  doc.setProducer(producer);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage(size);
    p.drawText(i === 0 ? title : `Page ${i + 1} of the record`, { x: 60, y: size[1] - 90, size: 22, font, color: rgb(0.1, 0.1, 0.15) });
    p.drawText("This certifies that the person named below completed the course.", { x: 60, y: size[1] - 130, size: 11, font });
    p.drawText("Name: ______________________", { x: 60, y: size[1] - 300, size: 13, font });
  }
  return Buffer.from(await doc.save());
}

async function runMode(browser, mode) {
  const android = mode === "android", lang = android ? "en" : "ko";
  prefix = `[${mode}] `;
  const srv = await startServer();
  const { ctx, page, errors } = await openApp(browser, srv.port, mode, lang);
  const docs = path.join(srv.home, "Documents");
  try {
    const T = (k, p) => page.evaluate(([k, p]) => window.__pdfe.t(k, p || {}), [k, p]);
    const today = new Date(), ymd = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;
    const uiToday = await page.evaluate(() => { const d = new Date(); return window.__pdfe.t("st.f.date") && (document.documentElement.lang === "ko" ? `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.` : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })); });
    const F = { page: await T("st.f.page"), pages: await T("st.f.pages"), date: await T("st.f.date"), name: await T("st.f.name") };

    // the certificate (3 pages), opened from the picker
    fs.writeFileSync(path.join(docs, "certificate.pdf"), await makePdf());
    await page.evaluate(() => { window.__shimDialogNext = ["~/Documents/certificate.pdf"]; });
    await page.click(android ? "#bb-open" : "#btn-open");
    await page.waitForFunction(() => window.__pdfe.S.pages.length === 3 && window.__pdfe.S.rec);
    await page.evaluate((z) => window.__pdfe.setZoom(z), android ? 0.55 : 0.8);
    await sleep(600);

    // ---- the text stamp dialog: page numbers ----
    const openTextDlg = async () => {
      if (android) { await page.click("#bb-lib"); await sleep(350); await page.locator('#ed-side [data-add="text"]').click(); }
      else await page.locator('#ed-side [data-add="text"]').click();
      await page.waitForSelector("#dlg-text[open]");
    };
    await openTextDlg();
    await page.locator("#txt-presets .sw", { hasText: await T("st.p.pageno") }).click();
    check("text dialog: the page numbers preset writes the page fields", (await page.inputValue("#txt-input")) === (await T("st.p.pageno.text")));
    await shot(page, `${mode}-text-dialog-pageno`);
    await page.click("#txt-save");
    await page.waitForFunction(() => !document.querySelector("#dlg-text").open && window.__pdfe.S.overlays.length === 1);
    const pn = await page.evaluate(() => { const P = window.__pdfe, o = P.S.overlays[0], a = P.S.assets.get(o.assetId), p = P.S.pages[0]; return { tpl: a.tpl, y: o.y + o.h, h: p.h, cx: o.x + o.w / 2, w: p.w }; });
    check("page numbers: a Library item that keeps its template, placed at the foot of the page", pn.tpl?.look === "plain" && /\{/.test(pn.tpl.text) && pn.y > pn.h * 0.85 && Math.abs(pn.cx - pn.w / 2) < 2, JSON.stringify(pn));
    const tt = await toastText(page);
    check("page numbers: offers every page at the same spot", tt.includes(await T("st.allPages.ask")), tt);
    await clickToast(page, await T("st.allPages.go"));
    await page.waitForFunction(() => window.__pdfe.S.overlays.length === 3);
    await page.waitForFunction(() => [...document.querySelectorAll(".ov")].every((n) => n.querySelector("img")?.src));
    await page.evaluate(() => window.__pdfe.select(null));
    await shot(page, `${mode}-editor-page-numbers`);
    let bytes = await build(page);
    let d = await drawn(page);
    const want = (n) => (lang === "ko" ? `${n} / 3` : `Page ${n} of 3`);
    check("page numbers: filled per page in the file (1, 2, 3 of 3)", d.length === 3 && [1, 2, 3].every((n) => d.some((x) => x.page === n && x.text === want(n))), JSON.stringify(d));
    {
      const doc = await PDFDocument.load(bytes);
      const imgs = doc.getPages().map((p) => { const xo = p.node.Resources().lookup(require("pdf-lib").PDFName.of("XObject")); return xo ? xo.keys().map((k) => xo.get(k).toString()).join(",") : ""; });
      check("page numbers: each page draws its own picture", new Set(imgs).size === 3 && imgs.every(Boolean), imgs.join(" | "));
    }

    // ---- a {name} field and {date:YYYY.MM.DD}: a chip in the editor, asked for when saving ----
    await openTextDlg();
    await page.fill("#txt-input", `${F.name}: `);
    await page.locator("#txt-vars .sw", { hasText: await T("st.var.name") }).click();
    await page.locator("#txt-input").press("End");
    await page.locator("#txt-input").type(", {date:YYYY.MM.DD}");
    check("text dialog: “Name field” inserts the field", (await page.inputValue("#txt-input")) === `${F.name}: {${F.name}}, {date:YYYY.MM.DD}`, await page.inputValue("#txt-input"));
    await page.click("#txt-save");
    await page.waitForFunction(() => window.__pdfe.S.overlays.length === 4);
    const chip = await page.evaluate(() => { const P = window.__pdfe, o = P.S.overlays[3], a = P.S.assets.get(o.assetId); return window.__pdfeForms.tplParts(a.tpl.text, { page: 1, pages: 3, fields: P.S.fields }, true); });
    check("editor: an empty field shows as a chip with its name, the date filled in", chip.some((p) => p.chip === F.name) && chip.some((p) => p.text?.includes(ymd)), JSON.stringify(chip));
    await page.evaluate(() => window.__pdfe.select(window.__pdfe.S.overlays[3].id));
    if (android) { await page.click("#sb-adjust"); await sleep(400); }
    check("inspector: the field to fill, with an accessible name", (await page.locator("#inspector .st-fields input").count()) === 1 && (await page.locator("#inspector .st-fields input").getAttribute("aria-label")) === (await T("st.field.aria", { name: F.name })));
    await shot(page, `${mode}-editor-field-chip`);
    if (android) await page.evaluate(() => window.__pdfe.closeSheet());
    await page.evaluate(() => window.__pdfe.select(null));
    // save: the dialog asks for the field; an empty one is saved blank
    await page.click(android ? "#bb-save" : "#btn-export");
    await page.waitForSelector("#dlg-save[open]");
    check("save dialog: asks for the field, and says an empty one is saved blank", await page.locator("#save-fields").isVisible() && (await page.locator("#save-fields").innerText()).includes(await T("st.save.fields.hint")));
    check("save dialog: the No AI notice is under “More options”, the seal stays in view", await page.evaluate(() => !!document.querySelector("#save-more #save-ai") && !document.querySelector("#save-more #save-seal")) && (await page.locator("#save-seal").isVisible()) && !(await page.locator("#save-ai").isVisible()));
    await shot(page, `${mode}-save-dialog-fields`);
    await page.fill("#save-name", "certificate_blank");
    await page.evaluate(() => { window.__pdfeLastExport = null; });
    await page.click("#save-ok");
    await page.waitForFunction(() => window.__pdfeLastExport, null, { timeout: 30000 });
    d = await drawn(page);
    const blank = d.find((x) => x.text.startsWith(`${F.name}:`));
    check("file: an unfilled field is left blank, never braces", blank?.text === `${F.name}: , ${ymd}` && noBraces(d.map((x) => x.text)), JSON.stringify(blank));
    await page.click(android ? "#bb-save" : "#btn-export");
    await page.waitForSelector("#dlg-save[open]");
    await page.fill("#save-fld-0", lang === "ko" ? "김하늘" : "Jordan Lee");
    await page.fill("#save-name", "certificate_named");
    await page.evaluate(() => { window.__pdfeLastExport = null; });
    await page.click("#save-ok");
    await page.waitForFunction(() => window.__pdfeLastExport, null, { timeout: 30000 });
    d = await drawn(page);
    const who = lang === "ko" ? "김하늘" : "Jordan Lee";
    check("file: the field filled from the save dialog, the date as {date:YYYY.MM.DD}", d.some((x) => x.text === `${F.name}: ${who}, ${ymd}`) && noBraces(d.map((x) => x.text)), JSON.stringify(d.map((x) => x.text)));
    const named = await fromPage(page, "async () => window.__pdfeLastExport");
    check("file: no braces in the text of any page", noBraces(await pageText(page, named)));

    // ---- the repeated pattern on every page ----
    await openTextDlg();
    await page.locator("#txt-wm-presets .sw", { hasText: await T("st.p.conf") }).click();
    check("pattern preset: the pattern look", await page.evaluate(() => document.querySelector('#txt-look [data-look="wm"]').getAttribute("aria-pressed") === "true"));
    await shot(page, `${mode}-text-dialog-pattern`);
    await page.click("#txt-save");
    await page.waitForFunction(() => window.__pdfe.S.overlays.length === 5);
    const wm = await page.evaluate(() => { const P = window.__pdfe, o = P.S.overlays[4], p = P.S.pages[o.page]; return { x: o.x, y: o.y, w: o.w - p.w, h: o.h - p.h, op: o.opacity, cls: document.querySelector(`.ov[data-id="${o.id}"]`).className }; });
    check("pattern: one item covering the page, about 20% strong, under the other items", wm.x === 0 && wm.y === 0 && Math.abs(wm.w) < 0.01 && Math.abs(wm.h) < 0.01 && wm.op === 0.2 && /\bwm\b/.test(wm.cls), JSON.stringify(wm));
    await clickToast(page, await T("st.allPages.go"));
    await page.waitForFunction(() => window.__pdfe.S.overlays.length === 7);
    await page.evaluate(() => window.__pdfe.select(null));
    await shot(page, `${mode}-editor-pattern`);
    bytes = await build(page);
    let text = await pageText(page, bytes);
    check("pattern: real text on every page (pdf.js reads it)", text.length === 3 && text.every((p) => p.includes("CONFIDENTIAL") && p.includes("대외비")), text.map((p) => p.slice(0, 60)).join(" | "));
    const hid = await scan(page, bytes);
    check("pattern: the hidden text check finds nothing", !hid.findings.length, JSON.stringify(hid.findings.slice(0, 2)));
    const tf = await build(page, { textFree: true });
    text = await pageText(page, tf);
    check("pattern: a text-free copy keeps no text at all (the pattern is a picture there)", text.every((p) => !p.trim()), text.join("|").slice(0, 80));
    fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, `${mode}-pattern.pdf`), bytes);
    // the pattern is selected by a click and not dragged; its inspector
    await page.evaluate(() => window.__pdfe.select(window.__pdfe.S.overlays[4].id));
    if (android) { await page.click("#sb-adjust"); await sleep(400); }
    check("pattern: its own inspector (strength and color)", await page.locator("#f-wm-op").count() === 1 && (await page.locator("#inspector .swatches .sw").count()) === 2);
    await shot(page, `${mode}-inspector-pattern`);
    if (android) await page.evaluate(() => window.__pdfe.closeSheet());
    // remove the patterns again (they are tested), keep the page numbers and the name stamp
    await page.evaluate(() => window.__pdfe.act(() => { const P = window.__pdfe; P.S.overlays = P.S.overlays.filter((o) => P.S.assets.get(o.assetId)?.tpl?.look !== "wm"); P.S.sel = null; }));

    // ---- "for whom" (제출용) ----
    await openTextDlg();
    await page.locator("#txt-wm-presets .sw", { hasText: await T("st.p.for") }).click();
    await page.fill("#txt-who", lang === "ko" ? "한빛은행" : "Northwind Bank");
    const forText = await page.inputValue("#txt-input");
    check("“for whom” preset: asks for whom, then fills the line", forText === (await T("st.p.for.text", { who: lang === "ko" ? "한빛은행" : "Northwind Bank" })), forText);
    await page.click("#txt-save");
    await page.waitForFunction(() => window.__pdfe.S.overlays.some((o) => window.__pdfe.S.assets.get(o.assetId)?.tpl?.look === "wm"));
    bytes = await build(page);
    text = await pageText(page, bytes);
    const forLine = lang === "ko" ? `제출용: 한빛은행, ${uiToday}, 다른 용도 사용 금지` : `For Northwind Bank only, ${uiToday}, not for any other use`;
    d = await drawn(page);
    const forDrawn = d.find((x) => x.look === "wm");
    check("“for whom”: the line with today's date in the file, as text", forDrawn?.text === forLine && forDrawn.asText && text[0].includes(lang === "ko" ? "한빛은행" : "Northwind Bank") && text[0].includes(uiToday), JSON.stringify(forDrawn));
    await page.evaluate(() => window.__pdfe.act(() => { const P = window.__pdfe; P.S.overlays = P.S.overlays.filter((o) => P.S.assets.get(o.assetId)?.tpl?.look !== "wm"); P.S.sel = null; }));
    await clearToasts(page);

    // ---- 원본대조필 ----
    await openTextDlg();
    await page.locator("#txt-presets .sw", { hasText: await T("st.p.cert") }).click();
    check("원본대조필: the boxed look with the title and the date and name lines", await page.evaluate(() => document.querySelector('#txt-look [data-look="box"]').getAttribute("aria-pressed") === "true")
      && (await page.inputValue("#txt-input")) === (await T("st.p.cert.title")) && (await page.inputValue("#txt-sub")) === (await T("st.p.cert.sub")));
    await shot(page, `${mode}-text-dialog-certified`);
    await page.click("#txt-save");
    await page.waitForFunction(() => window.__pdfe.S.overlays.length === 5);
    await page.evaluate(() => window.__pdfe.select(null));
    await shot(page, `${mode}-editor-certified`);
    bytes = await build(page);
    d = await drawn(page);
    const cert = d.find((x) => x.look === "box");
    const certWant = lang === "ko" ? `원본과 상이 없음\n${uiToday}\n확인자 김하늘 (인)` : `Certified true copy\n${uiToday}\nCertified by Jordan Lee`;
    check("원본대조필: in the file with the date and the name", cert?.text === certWant, JSON.stringify(cert));

    // ---- forms: save as form, the list, matching, applying ----
    if (android) { await page.click("#btn-more"); await page.getByRole("menuitem", { name: await T("form.saveAs") }).click(); }
    else { await page.click("#btn-forms"); await page.getByRole("menuitem", { name: await T("form.saveAs") }).click(); }
    await page.waitForSelector("#dlg-form[open]");
    await page.fill("#form-name", lang === "ko" ? "수료증" : "Certificate");
    await shot(page, `${mode}-save-as-form`);
    await page.click("#form-save");
    await page.waitForFunction(() => window.__pdfeForms.FORMS.list?.length === 1);
    await sleep(400);
    const formsFile = path.join(srv.home, "Library", "Application Support", "PDF Editor", "forms.json");
    const stored = fs.existsSync(formsFile) ? JSON.parse(fs.readFileSync(formsFile, "utf8")) : [];
    const f0 = stored[0] || {};
    check("form: saved in forms.json (name, pages, fingerprint, items, fields)", stored.length === 1 && f0.name === (lang === "ko" ? "수료증" : "Certificate") && f0.pages?.length === 3 && /^[0-9a-f]{64}$/.test(f0.fp?.text || "")
      && f0.items?.length === 5 && f0.fields?.includes(F.name) && f0.docId, JSON.stringify({ ...f0, items: f0.items?.length, fp: f0.fp?.text?.slice(0, 8) }));
    // a different file with the same first page: the form is offered and applied
    fs.writeFileSync(path.join(docs, "certificate-2.pdf"), await makePdf({ producer: "another export" }));
    await clearToasts(page);
    await page.evaluate(() => { window.__shimDialogNext = ["~/Documents/certificate-2.pdf"]; });
    if (android) { await page.click("#btn-more"); await page.getByRole("menuitem", { name: await T("open.new") }).click(); }
    else await page.click("#btn-open");
    await page.waitForFunction(() => window.__pdfe.S.doc?.name === "certificate-2.pdf");
    const offer = await T("form.match", { name: f0.name });
    await page.waitForFunction((s) => [...document.querySelectorAll(".toast span")].some((x) => x.textContent === s), offer, { timeout: 15000 }).catch(() => {});
    check("matching: opening the same form offers “Use the … form?”", (await toastText(page)).includes(offer), await toastText(page));
    await shot(page, `${mode}-form-offer`, { toasts: true });
    await clickToast(page, await T("form.match.go"));
    await page.waitForFunction(() => window.__pdfe.S.overlays.length === 5, null, { timeout: 5000 }).catch(() => {});
    check("matching: applying places the form's items", (await page.evaluate(() => window.__pdfe.S.overlays.length)) === 5);
    // the Forms list on the Library home
    await page.evaluate(() => window.__pdfe.showHome());
    if (android) { await page.click("#btn-more"); await page.getByRole("menuitem", { name: await T("form.list") }).click(); await sleep(500); }
    else await page.evaluate(() => { if (!window.__pdfe.S.prefs.homeSide) document.querySelector("#btn-side").click(); });
    await page.waitForSelector("#forms-side li");
    check("forms list: shows the form with open and make many, named controls", (await page.locator("#forms-side li").count()) === 1
      && (await page.locator("#forms-side li .form-open").getAttribute("aria-label")) === (await T("form.open.aria", { name: f0.name })));
    await page.locator("#forms-side").scrollIntoViewIfNeeded();
    await shot(page, `${mode}-forms-list`);
    // rename
    await page.locator("#forms-side li .btn.icon").first().click();
    await page.fill("#form-rename", f0.name + " 2026");
    await page.press("#form-rename", "Enter");
    await sleep(300);
    check("forms list: rename", (await page.evaluate(() => window.__pdfeForms.FORMS.list[0].name)) === f0.name + " 2026");

    // ---- make many from a pasted table, sealed ----
    await page.evaluate(async () => { const P = window.__pdfe; P.SEAL.id = await P.S.seal.createIdentity({ name: "홍길동" }); });
    await page.locator("#forms-side li .btn-row .btn").nth(1).click();
    await page.waitForSelector("#dlg-many[open]");
    const head = await page.locator('#many-body .many-cell[data-r="-1"][data-c="0"]').inputValue();
    check("make many: the table starts with the form's fields", head === F.name, head);
    const rowsKo = ["김하늘", "박민지", "이서준", "최유나", "정하준"], rowsEn = ["Jordan Lee", "Riley Chen", "Sam Patel", "Alex Kim", "Morgan Diaz"];
    const people = lang === "ko" ? rowsKo : rowsEn;
    const tsv = [`${F.name}\tcourse`, ...people.map((p, i) => `${p}\tPDF ${i + 1}`)].join("\n");
    await page.evaluate((tsv) => {
      const inp = document.querySelector('#many-body .many-cell[data-r="-1"][data-c="0"]'), dt = new DataTransfer();
      dt.setData("text/plain", tsv); inp.focus(); inp.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, tsv);
    const tbl = await page.evaluate(() => ({ head: window.__pdfeForms.MANY.head.slice(), rows: window.__pdfeForms.MANY.rows.filter((r) => r.some(Boolean)).length }));
    check("make many: a pasted spreadsheet block fills the header and 5 rows", tbl.head[0] === F.name && tbl.head[1] === "course" && tbl.rows === 5, JSON.stringify(tbl));
    const pattern = await page.inputValue("#many-pattern");
    check("make many: the file name pattern starts from the first field", pattern.startsWith(`{${F.name}}_`), pattern);
    await page.fill("#many-pattern", `{${F.name}}_${lang === "ko" ? "수료증" : "certificate"}`);
    const outDir = path.join(docs, "Out"); fs.mkdirSync(outDir, { recursive: true });
    const clashName = `${people[0]}_${lang === "ko" ? "수료증" : "certificate"}.pdf`;
    fs.writeFileSync(path.join(outDir, clashName), "an older file that must stay");
    await page.evaluate(() => { window.__shimDialogNext = ["~/Documents/Out"]; });
    await page.click("#many-dir-btn");
    await page.waitForFunction(() => window.__pdfeForms.MANY.dir);
    await page.check("#many-seal");
    check("make many: the go button says how many and that they're sealed", (await page.locator("#many-go").innerText()) === (await T("many.go.seal", { n: 5 })));
    await shot(page, `${mode}-make-many-table`);
    await page.click("#many-go");
    await page.waitForSelector("#many-confirm");
    check("make many: one confirmation before sealing", (await page.locator("#many-confirm").innerText()).includes("홍길동"));
    const log0 = await page.evaluate(async () => { await window.__pdfeSeal.loadLog(); return window.__pdfeSeal.LOG.list.length; });
    await page.click("#many-go");
    await page.waitForFunction(() => window.__pdfeForms.MANY.step === "done", null, { timeout: 60000 });
    await shot(page, `${mode}-make-many-done`);
    const made = fs.readdirSync(outDir).sort();
    const wantNames = people.map((p) => `${p}_${lang === "ko" ? "수료증" : "certificate"}.pdf`);
    wantNames[0] = wantNames[0].replace(/\.pdf$/, " (2).pdf");
    check("make many: 5 files named from the rows, the clash got “ (2)”", made.length === 6 && wantNames.every((n) => made.includes(n)), made.join(", "));
    check("make many: the file that was there is unchanged", fs.readFileSync(path.join(outDir, clashName), "utf8") === "an older file that must stay");
    const summary = await page.locator("#many-status").innerText();
    const dirShown = android ? await T("os.fmAndroid") : (await T("folder.Documents")) + "/Out";
    check("make many: “Made 5 files in …”", summary === (await T("many.doneSealed", { n: 5, dir: dirShown })), summary);
    let verified = 0, namesOk = 0;
    for (let i = 0; i < 5; i++) {
      const b = fs.readFileSync(path.join(outDir, wantNames[i]));
      const v = await inPage(page, (u8) => window.__pdfe.S.seal.verify(u8), b);
      if (v.status === "intact") verified++;
      const body = b.subarray(0, b.lastIndexOf("\n%PDFE-MOCK-SEAL"));
      const txt = await pageText(page, body);
      if (txt.length === 3 && noBraces(txt)) namesOk++;
    }
    check("make many: every file is sealed and verifies", verified === 5, `${verified}/5`);
    check("make many: three pages each, no braces in any text", namesOk === 5, `${namesOk}/5`);
    const last = await drawn(page);
    check("make many: the row's values are filled in (the last file: its name, its pages numbered)", last.some((x) => x.text === `${F.name}: ${people[4]}, ${ymd}`) && last.some((x) => x.text === want(3)) && noBraces(last.map((x) => x.text)), JSON.stringify(last.map((x) => x.text)));
    const log1 = await page.evaluate(() => window.__pdfeSeal.LOG.list.slice());
    const newLog = log1.slice(log0);
    check("make many: every sealed file is in the seal log (file, path, SHA-256)", newLog.length === 5 && newLog.every((r) => r.sealed && wantNames.includes(r.file) && r.path)
      && newLog.some((r) => r.sha256 === sha256(fs.readFileSync(path.join(outDir, wantNames[2])))), newLog.map((r) => r.file).join(", "));
    await page.locator("#many-foot .btn.primary").click();
    await page.waitForFunction(() => !document.querySelector("#dlg-many").open);

    // ---- a long run, stopped midway ----
    await page.locator("#forms-side li .btn-row .btn").nth(1).click();
    await page.waitForSelector("#dlg-many[open]");
    // a CSV file through the file input: a byte order mark, quotes, a comma inside a value
    const csv = "﻿" + [`${F.name},note`, ...Array.from({ length: 20 }, (_, i) => `"Person ${i + 1}","Lee, ""J"" ${i + 1}"`)].join("\r\n") + "\r\n";
    await page.setInputFiles("#file-csv", { name: "people.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await page.waitForFunction(() => window.__pdfeForms.MANY.rows.length === 20);
    const csvT = await page.evaluate(() => ({ head: window.__pdfeForms.MANY.head.slice(), r0: window.__pdfeForms.MANY.rows[0].slice() }));
    check("make many: a CSV file fills the table (quotes and commas inside values)", csvT.head.join("|") === `${F.name}|note` && csvT.r0.join("|") === 'Person 1|Lee, "J" 1', JSON.stringify(csvT));
    await page.fill("#many-pattern", "stop_{n}");
    const stopDir = path.join(docs, "Stop"); fs.mkdirSync(stopDir, { recursive: true });
    await page.evaluate(() => { window.__shimDialogNext = ["~/Documents/Stop"]; });
    await page.click("#many-dir-btn");
    await page.waitForFunction(() => window.__pdfeForms.MANY.dir?.includes("Stop") || window.__pdfeForms.MANY.dir?.startsWith("/android/"));
    if (await page.isChecked("#many-seal")) await page.uncheck("#many-seal");
    await page.click("#many-go");
    await page.waitForFunction(() => window.__pdfeForms.MANY.done >= 2, null, { timeout: 60000 });
    await shot(page, `${mode}-make-many-progress`);
    if (android) check("android: back stops the run (and stays in the dialog)", (await page.evaluate(() => window.__shimBack())) === true && (await page.evaluate(() => document.querySelector("#dlg-many").open)));
    else await page.click("#many-stop");
    await page.waitForFunction(() => window.__pdfeForms.MANY.step === "done", null, { timeout: 60000 });
    const stopped = fs.readdirSync(stopDir);
    const stopText = await page.locator("#many-status").innerText();
    check("make many: stopping midway keeps what was made, makes no more, and says so", stopped.length >= 2 && stopped.length < 20 && stopText.includes(String(stopped.length)), `${stopped.length} files: ${stopText}`);
    await page.locator("#many-foot .btn.primary").click();

    // ---- the same items on 3 PDFs ----
    fs.writeFileSync(path.join(docs, "a.pdf"), await makePdf({ title: "Payslip A for November" }));
    fs.writeFileSync(path.join(docs, "b.pdf"), await makePdf({ pages: 1, title: "Payslip B for November" }));
    fs.writeFileSync(path.join(docs, "c.pdf"), await makePdf({ size: [612, 792], title: "Payslip C for November" }));
    await page.locator("#forms-side li .btn-row .btn").nth(1).click();
    await page.waitForSelector("#dlg-many[open]");
    await page.locator("#many-body .seg button", { hasText: await T("many.mode.pdfs") }).click();
    await page.evaluate(() => { window.__shimDialogNext = ["~/Documents/a.pdf", "~/Documents/b.pdf", "~/Documents/c.pdf"]; });
    await page.click("#many-pick-pdfs");
    await page.waitForSelector("#many-body .many-pdfs li");
    check("same on many: the three PDFs are listed", (await page.locator("#many-body .many-pdfs li").count()) === 3);
    await page.fill("#many-fld-0", lang === "ko" ? "홍길동" : "Jordan Lee");
    const pdfDir = path.join(docs, "Signed"); fs.mkdirSync(pdfDir, { recursive: true });
    await page.evaluate(() => { window.__shimDialogNext = ["~/Documents/Signed"]; });
    await page.click("#many-dir-btn");
    await page.waitForFunction(() => window.__pdfeForms.MANY.dir?.includes("Signed") || window.__pdfeForms.MANY.dir?.startsWith("/android/"));
    if (await page.isChecked("#many-seal")) await page.uncheck("#many-seal");
    await shot(page, `${mode}-make-many-pdfs`);
    await page.click("#many-go");
    await page.waitForFunction(() => window.__pdfeForms.MANY.step === "done", null, { timeout: 60000 });
    const signed = fs.readdirSync(pdfDir).sort();
    const suffix = await T("save.suffix");
    check("same on many: one new file per PDF, named after it", signed.length === 3 && ["a", "b", "c"].every((n) => signed.includes(`${n}${suffix}.pdf`)), signed.join(", "));
    const counts = [];
    for (const n of ["a", "b", "c"]) {
      const b = fs.readFileSync(path.join(pdfDir, `${n}${suffix}.pdf`)), doc = await PDFDocument.load(b);
      counts.push(doc.getPages().map((p) => { const xo = p.node.Resources().lookup(require("pdf-lib").PDFName.of("XObject")); return xo ? xo.keys().length : 0; }).join("/"));
    }
    // a: 3 pages (page number on each, the name and the 원본대조필 on page 1); b: its one page; c: Letter, 3 pages
    check("same on many: the items are on the pages each PDF has", counts[0] === "3/1/1" && counts[1] === "3" && counts[2] === "3/1/1", counts.join(" | "));
    const cText = await pageText(page, fs.readFileSync(path.join(pdfDir, `c${suffix}.pdf`)));
    check("same on many: the original text is kept, no braces", cText[0].includes("Payslip C") && noBraces(cText));
    const short = await page.locator("#many-body").innerText();
    check("same on many: says the shorter PDF got only its own pages' items", short.includes(await T("many.short")));
    await page.locator("#many-foot .btn.primary").click();

    // a language switch with the dialog open redraws it in place
    await page.locator("#forms-side li .btn-row .btn").nth(1).click();
    await page.waitForSelector("#dlg-many[open]");
    const other = lang === "ko" ? "en" : "ko";
    await page.evaluate((l) => window.__pdfe.setLang(l), other);
    const goOther = await page.locator("#many-go").innerText(), titleOther = await page.locator("#dlg-many-title").innerText();
    check("language switch: the open make many dialog is redrawn", goOther === (await T("many.go", { n: 0 })) && titleOther === (await T("many.title")), `${titleOther} / ${goOther}`);
    await page.evaluate((l) => window.__pdfe.setLang(l), lang);
    await page.click("#dlg-many .dlg-head [data-close]");
    // open: the form's document from the Library, with the form's items
    await page.locator("#forms-side li .form-open").click();
    await page.waitForFunction(() => window.__pdfe.S.view === "editor" && window.__pdfe.S.doc?.name === "certificate.pdf", null, { timeout: 15000 });
    check("forms list: open brings up the form's document with its items", (await page.evaluate(() => window.__pdfe.S.overlays.length)) === 5);
    // delete, then undo
    await page.evaluate(() => window.__pdfe.showHome());
    if (android) { await page.click("#btn-more"); await page.getByRole("menuitem", { name: await T("form.list") }).click(); await sleep(500); }
    await clearToasts(page);
    await page.locator("#forms-side li .btn.icon").nth(1).click();
    const gone = await page.evaluate(() => window.__pdfeForms.FORMS.list.length);
    await clickToast(page, await T("undo"));
    await sleep(300);
    check("forms list: delete, and undo brings it back", gone === 0 && (await page.evaluate(() => window.__pdfeForms.FORMS.list.length)) === 1 && (await page.locator("#forms-side li").count()) === 1);

    // a page shown turned (/Rotate 90): the pattern still covers the page as shown, as text, nothing off the page
    {
      const doc = await PDFDocument.load(await makePdf({ pages: 1, title: "Turned page for the pattern" }));
      doc.getPage(0).setRotation(require("pdf-lib").degrees(90));
      await inPage(page, (u8) => window.__pdfe.openPdfBytes(u8, "turned.pdf"), Buffer.from(await doc.save()));
      await page.waitForFunction(() => window.__pdfe.S.doc?.name === "turned.pdf");
      const wmId = await page.evaluate(() => [...window.__pdfe.S.assets.values()].find((a) => a.tpl?.look === "wm" && /CONFIDENTIAL/.test(a.tpl.text))?.id);
      await page.evaluate((id) => window.__pdfe.placeAsset(id, 0), wmId);
      const box = await page.evaluate(() => { const P = window.__pdfe, o = P.S.overlays[0], p = P.S.pages[0]; return [o.w === p.w, o.h === p.h, p.w > p.h]; });
      const tb = await build(page);
      const tt = await pageText(page, tb), th = await scan(page, tb);
      fs.writeFileSync(path.join(OUT, `${mode}-pattern-turned.pdf`), tb);
      check("pattern on a turned page: covers the page as shown, real text, no hidden text", box.every(Boolean) && tt[0].includes("CONFIDENTIAL") && !th.findings.length, JSON.stringify({ box, f: th.findings.slice(0, 1) }));
      await clearToasts(page);
      // make many from the open document (the editor's menu), two rows
      if (android) { await page.click("#btn-more"); await page.getByRole("menuitem", { name: await T("form.many") }).click(); }
      else { await page.click("#btn-forms"); await page.getByRole("menuitem", { name: await T("form.many") }).click(); }
      await page.waitForSelector("#dlg-many[open]");
      await page.fill('#many-body .many-cell[data-r="0"][data-c="0"]', "A");
      await page.fill('#many-body .many-cell[data-r="1"][data-c="0"]', "B");
      await page.fill("#many-pattern", "turned_{n}");
      const tDir = path.join(docs, "Turned"); fs.mkdirSync(tDir, { recursive: true });
      await page.evaluate(() => { window.__shimDialogNext = ["~/Documents/Turned"]; });
      await page.click("#many-dir-btn");
      await page.waitForFunction(() => window.__pdfeForms.MANY.dir?.includes("Turned") || window.__pdfeForms.MANY.dir?.startsWith("/android/"));
      if (await page.isChecked("#many-seal")) await page.uncheck("#many-seal");
      await page.click("#many-go");
      await page.waitForFunction(() => window.__pdfeForms.MANY.step === "done", null, { timeout: 60000 });
      const tFiles = fs.readdirSync(tDir).sort();
      const t1 = tFiles.length ? await pageText(page, fs.readFileSync(path.join(tDir, tFiles[0]))) : [""];
      check("make many from the open document: one file per row, with its items", tFiles.join(",") === "turned_1.pdf,turned_2.pdf" && t1[0].includes("CONFIDENTIAL"), tFiles.join(","));
      await page.locator("#many-foot .btn.primary").click();
    }

    // accessible names on the new controls
    const unnamed = await page.evaluate(() => [...document.querySelectorAll("#btn-forms, #forms-side button, #forms-side input, #txt-look button, #txt-vars button, #txt-wm-presets button, #save-fields input, #dlg-many button, #dlg-many input, #dlg-form input, #dlg-form button")]
      .filter((b) => !(b.getAttribute("aria-label") || b.textContent.trim() || b.labels?.[0]?.textContent.trim() || b.closest("label")?.textContent.trim())).length);
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
