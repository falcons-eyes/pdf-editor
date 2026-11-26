// Sealworks 1.3 examples (docs/design/workflows.md rule 6, docs/design/scenarios.md, docs/samples/README.md): the
// gallery's new situations, each opened through window.__pdfe.loadExample in Korean and English, in desktop mode and in
// Android mode (phone viewport, touch), driven through web/pdf-editor.html with the dev server's stand-ins.
//
// Checks:
//   - the gallery: five groups, every card with its tool line, a real click on a card opens it; screenshots of the
//     gallery per mode and language
//   - every new example opens with its pages and items, and builds (with the No AI notice) without errors
//   - idcopy: an ID picture page with the scan app's search text under it; saved through the save dialog, the cover
//     box takes the second half of the number out of the file (pdf.js text), the 제출용 pattern is there as text
//   - receipts: four pictures on the receipts page; the approval stamp on the cover sheet
//   - certificates: make many opens with the sample list (the same rows as docs/samples/certificates-<lang>.csv) and
//     makes five files named from it
//   - bundle: page numbers filled per page ("1 / 3" …), the certified copy stamp with the name, no braces
//   - aiguard: opening it shows the hidden text notice, and the list quotes the white text
//   - noai: the save dialog starts with the No AI notice, its line and the seal on; the saved file verifies with the
//     notice covered by the seal
//   - inspection: the photos page (two pictures), check marks and both signatures
//   - consent: slots for the two check boxes and the signature; the hint opens sign here mode's start screen, which
//     asks each person for name and phone; one client goes through it and gets a file of their own
// Screenshots go to test/out/workflows-examples/.
//
//   node test/workflows-examples.mjs                    both modes
//   node test/workflows-examples.mjs --mode android     one mode
// Needs: npm ci here (pdf-lib, pdfjs-dist, playwright), python3, and Chromium (PW_CHROMIUM, Playwright's own, or
// Chrome for Testing in ~/Library/Caches/ms-playwright). The dev server runs on a free port from 4552 to 4560 with a
// throwaway home folder; nothing is fetched from the network (cdnjs is served from node_modules).
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
const OUT = path.join(DESKTOP, "test", "out", "workflows-examples");
const { chromium } = require("playwright");
const { PDFDocument, PDFName } = require("pdf-lib");

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const MODES = flag("--mode") ? [flag("--mode")] : ["desktop", "android"];
const LANGS = ["ko", "en"];
const NEW = ["idcopy", "receipts", "certificates", "bundle", "aiguard", "noai", "inspection", "consent"];

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
  for (let p = 4552; p <= 4560 && !port; p++) if (await portFree(p)) port = p;
  if (!port) throw new Error("no free port in 4552 to 4560");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pdfe-wf-examples-"));
  fs.writeFileSync(path.join(home, ".pdfe-fake-home"), "throwaway home for test/workflows-examples.mjs\n");
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
async function openApp(browser, port, mode) {
  const android = mode === "android";
  const ctx = await browser.newContext(android
    ? { viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: "ko-KR" }
    : { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, locale: "ko-KR" });
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
  await page.waitForFunction(() => window.__pdfe && window.__pdfeForms && window.__pdfeSeal && window.__pdfe.S.seal && window.__pdfe.S.fs, null, { timeout: 20000 });
  // the person has sealed before (the stand-in seal keeps the identity in memory)
  await page.evaluate(async () => { const p = window.__pdfe; p.SEAL.id = (await p.S.seal.identity()) || (await p.S.seal.createIdentity({ name: "홍길동", org: "새솔디자인" })); });
  await sleep(400);
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
  const pdf = await window.__pdfeSeal.openScanDoc(u8), out = [];
  for (let i = 1; i <= pdf.numPages; i++) out.push((await (await pdf.getPage(i)).getTextContent()).items.map((x) => x.str).join(""));
  pdf.destroy(); return out;
}, bytes);
const scan = (page, bytes) => inPage(page, (u8) => window.__pdfeSeal.scanHiddenText(u8), bytes);
const clearToasts = (page) => page.evaluate(() => { for (const t of document.querySelectorAll(".toast")) t.remove(); });
const toastText = (page) => page.evaluate(() => [...document.querySelectorAll(".toast span")].map((s) => s.textContent).join(" | "));
async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  await sleep(400);
  const file = path.join(OUT, name + ".png");
  await page.screenshot({ path: file });
  return path.relative(DESKTOP, file);
}
const state = (page) => page.evaluate(() => {
  const P = window.__pdfe, S = P.S;
  return {
    id: S.doc?.exampleId, sample: !!S.doc?.isSample, lang: S.doc?.sampleLang, pages: S.pages.length,
    items: S.overlays.map((o) => { const a = S.assets.get(o.assetId); return { page: o.page, cover: o.cover || null, kind: a?.kind || null, look: a?.tpl?.look || null, text: a?.tpl?.text || null, name: a?.name || null }; }),
  };
});
// images drawn on each page of a PDF (pdf-lib, in node)
async function imagesPerPage(bytes) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => { const xo = p.node.Resources()?.lookup(PDFName.of("XObject")); return xo ? xo.keys().length : 0; });
}
const open = async (page, id, lang) => {
  await clearToasts(page);
  const ok = await page.evaluate(([i, l]) => window.__pdfe.loadExample(i, l), [id, lang]);
  await page.waitForFunction((i) => window.__pdfe.S.doc?.exampleId === i && window.__pdfe.S.view === "editor", id, { timeout: 20000 }).catch(() => {});
  await sleep(500);
  return ok;
};
const docBytes = (page) => fromPage(page, "async () => window.__pdfe.S.doc.bytes.slice()");

async function runMode(browser, mode) {
  const android = mode === "android";
  const srv = await startServer();
  const { ctx, page, errors } = await openApp(browser, srv.port, mode);
  const T = (k, p) => page.evaluate(([k, p]) => window.__pdfe.t(k, p || {}), [k, p]);
  try {
    for (const lang of LANGS) {
      prefix = `[${mode} ${lang}] `;
      // home first: switching the language in the editor rebuilds the open example in the new language
      await page.evaluate(() => { const S = window.__pdfe.S; S.prefs.examplesOpen = true; window.__pdfe.showHome(); }); // folded once the Library has documents
      await page.evaluate((l) => window.__pdfe.setLang(l), lang);
      await sleep(600);

      // ---- the gallery ----
      const gal = await page.evaluate(() => ({
        groups: [...document.querySelectorAll("#examples .ex-group h3")].map((h) => h.textContent),
        cards: [...document.querySelectorAll("#examples .ex-card")].map((b) => ({ id: b.dataset.ex, use: b.querySelector(".ex-use b")?.textContent || "", h: b.querySelector("strong")?.textContent || "" })),
        ids: window.__pdfe.examples,
      }));
      const wantGroups = await Promise.all(["sign", "pages", "protect", "many", "seal"].map((g) => T(`ex.g.${g}`)));
      check("gallery: five groups, in order", gal.groups.join("|") === wantGroups.join("|"), gal.groups.join(" | "));
      check("gallery: 18 cards, every example the gallery lists", gal.cards.length === 18 && gal.cards.every((c) => gal.ids.includes(c.id)) && NEW.every((id) => gal.cards.some((c) => c.id === id)), `${gal.cards.length} cards`);
      check("gallery: every card has its tool line and its headline", gal.cards.every((c) => c.use && c.h), JSON.stringify(gal.cards.filter((c) => !c.use).map((c) => c.id)));
      check("gallery: the sign here example is in the first group", await page.evaluate(() => !!document.querySelector('#ex-g-sign + .ex-list .ex-card[data-ex="consent"]')));
      const copy = await page.evaluate(() => [...document.querySelectorAll("#examples .ex-card")].map((b) => b.textContent));
      check("gallery: no slashes or hyphen lists in the cards' copy", copy.every((s) => !/[/]|\s-\s|^-|•/.test(s)), copy.find((s) => /[/]|\s-\s|•/.test(s)) || "");
      await page.evaluate(() => { const g = document.querySelector("#ex-g-pages"); g.scrollIntoView({ block: "start" }); });
      console.log("     screenshot", await shot(page, `gallery-${mode}-${lang}`));
      await page.evaluate(() => { const g = document.querySelector("#ex-g-protect"); g.scrollIntoView({ block: "start" }); });
      console.log("     screenshot", await shot(page, `gallery-${mode}-${lang}-protect`));
      // a real click (tap) on a card opens it
      await page.locator('#examples .ex-card[data-ex="idcopy"]').scrollIntoViewIfNeeded();
      await page.locator('#examples .ex-card[data-ex="idcopy"]').click();
      await page.waitForFunction(() => window.__pdfe.S.doc?.exampleId === "idcopy", null, { timeout: 20000 }).catch(() => {});
      check("gallery: clicking a card opens that example", (await state(page)).id === "idcopy");

      // ---- each example opens with its block at work ----
      const expect = { idcopy: [1, 2], receipts: [2, 2], certificates: [1, 2], bundle: [3, 5], aiguard: [1, 0], noai: [1, 2], inspection: [2, 9], consent: [1, 5] };
      for (const id of NEW) {
        const ok = await open(page, id, lang);
        const st = await state(page);
        check(`${id}: opens as an example (${expect[id][0]} pages, ${expect[id][1]} items)`, ok && st.id === id && st.sample && st.lang === lang && st.pages === expect[id][0] && st.items.length === expect[id][1], JSON.stringify({ ok, id: st.id, pages: st.pages, items: st.items.length }));
        const built = await fromPage(page, "async () => window.__pdfe.buildPdf({ ai: { notice: true, line: true } })").catch((e) => String(e));
        check(`${id}: builds, with the No AI notice`, Buffer.isBuffer(built) && built.length > 1000, Buffer.isBuffer(built) ? "" : built);
        if (id === "idcopy" || id === "inspection" || id === "bundle") console.log("     screenshot", await shot(page, `${id}-${mode}-${lang}`));
      }

      // ---- idcopy: the cover box removes the number's second half; the pattern stays ----
      {
        await open(page, "idcopy", lang);
        const back = lang === "ko" ? "1234567" : "9930 5617", front = lang === "ko" ? "900101" : "4821";
        const st = await state(page);
        check("idcopy: a cover box and the 제출용 pattern are placed", st.items.some((o) => o.cover === "black") && st.items.some((o) => o.look === "wm" && /\{(날짜|date)\}/.test(o.text)));
        const orig = await docBytes(page), origText = (await pageText(page, orig)).join(" ");
        check("idcopy: the example's PDF is one picture page with the scan app's search text (the number in it)", origText.includes(front) && origText.replace(/\s/g, "").includes(back.replace(/\s/g, "")) && (await imagesPerPage(orig))[0] === 1, origText.slice(0, 80));
        await page.evaluate(() => window.__pdfe.openSaveDialog());
        await page.waitForSelector("#dlg-save[open]");
        const dlg = await page.locator("#dlg-save").innerText();
        check("idcopy: the save dialog says the page becomes a picture because of the cover box", dlg.includes((await T("save.img.cover", { list: "1", n: 1 })).slice(0, 12)), dlg.slice(0, 200).replace(/\n/g, " "));
        await page.evaluate(() => { window.__pdfeLastExport = null; });
        await page.click("#save-ok");
        const got = await page.waitForFunction(() => !!window.__pdfeLastExport, null, { timeout: 45000 }).then(() => true, () => false);
        check("idcopy: saved through the dialog", got, got ? "" : await toastText(page));
        await sleep(600);
        const saved = got ? await fromPage(page, "async () => window.__pdfeLastExport") : Buffer.alloc(0);
        fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, `idcopy-${mode}-${lang}.pdf`), saved);
        const text = (await pageText(page, saved)).join(" "), flat = text.replace(/\s/g, "");
        check("idcopy: the saved file has none of the covered digits (pdf.js text)", !flat.includes(back.replace(/\s/g, "")) && !/1234567|99305617/.test(flat), text.slice(0, 120));
        check("idcopy: the saved file carries the 제출용 pattern as text", lang === "ko" ? flat.includes("한빛은행대출서류제출용") : /NorthwindBankloanapplicationonly/.test(flat), text.slice(0, 120));
        const h = await scan(page, saved);
        check("idcopy: the saved file has no hidden text (the search layer is gone with the picture)", !h.findings.length, JSON.stringify(h.findings.slice(0, 2)));
        await clearToasts(page);
      }

      // ---- receipts: four on one page ----
      {
        await open(page, "receipts", lang);
        const st = await state(page), imgs = await imagesPerPage(await docBytes(page));
        check("receipts: the receipts page holds four pictures (images per page: 4)", imgs[1] === 4, imgs.join("/"));
        check("receipts: the approval stamp is on the cover sheet", st.items.some((o) => o.page === 0 && (o.kind === "seal" || o.kind === "image")));
      }

      // ---- certificates: make many makes five files from the sample list ----
      {
        await open(page, "certificates", lang);
        const st = await state(page);
        const f = lang === "ko" ? ["이름", "과정"] : ["name", "course"];
        check("certificates: the {name} and {course} fields are placed", f.every((n) => st.items.some((o) => o.text === `{${n}}`)));
        check("certificates: a hint offers make many", (await toastText(page)).includes(await T("ex.certificates.toast")));
        const csv = fs.readFileSync(path.join(ROOT, "docs", "samples", `certificates-${lang}.csv`));
        check(`certificates: docs/samples/certificates-${lang}.csv is UTF-8 with a BOM`, csv[0] === 0xef && csv[1] === 0xbb && csv[2] === 0xbf);
        const csvRows = csv.toString("utf8").replace(/^﻿/, "").trim().split(/\r?\n/).map((l) => l.split(","));
        await page.locator(".toast button", { hasText: await T("form.many") }).first().click();
        await page.waitForSelector("#dlg-many[open]");
        const M = await page.evaluate(() => ({ head: window.__pdfeForms.MANY.head.slice(), rows: window.__pdfeForms.MANY.rows.filter((r) => r.some(Boolean)).map((r) => r.slice()), pattern: window.__pdfeForms.MANY.pattern }));
        check("certificates: make many opens with the sample list (the CSV's rows)", JSON.stringify([M.head, ...M.rows]) === JSON.stringify(csvRows), JSON.stringify(M).slice(0, 160));
        const dirName = `Certs_${lang}`, outDir = path.join(srv.home, "Documents", dirName); fs.mkdirSync(outDir, { recursive: true });
        await page.evaluate((d) => { window.__shimDialogNext = [`~/Documents/${d}`]; }, dirName);
        await page.click("#many-dir-btn");
        await page.waitForFunction(() => window.__pdfeForms.MANY.dir, null, { timeout: 10000 });
        if (await page.isChecked("#many-seal")) await page.uncheck("#many-seal");
        check("certificates: the button says five files", (await page.locator("#many-go").innerText()) === (await T("many.go", { n: 5 })));
        console.log("     screenshot", await shot(page, `certificates-many-${mode}-${lang}`));
        await page.click("#many-go");
        await page.waitForFunction(() => window.__pdfeForms.MANY.step === "done", null, { timeout: 90000 });
        const made = fs.readdirSync(outDir).sort();
        const want = M.rows.map((r) => `${r[0]}_${lang === "ko" ? "수료증" : "certificate"}.pdf`).sort();
        check("certificates: five files, named from the list", made.length === 5 && JSON.stringify(made) === JSON.stringify(want), made.join(", "));
        const hashes = new Set(made.map((n) => sha256(fs.readFileSync(path.join(outDir, n)))));
        check("certificates: each file is its own (the names differ)", hashes.size === 5);
        const last = await page.evaluate(() => window.__pdfeForms.drawn());
        check("certificates: the last file has the last row's name and course, no braces", last.some((x) => x.text === M.rows[4][0]) && last.some((x) => x.text === M.rows[4][1]) && last.every((x) => !/[{}]/.test(x.text)), JSON.stringify(last.map((x) => x.text)));
        await page.locator("#many-foot .btn.primary").click();
        await page.waitForFunction(() => !document.querySelector("#dlg-many").open);
      }

      // ---- bundle: page numbers per page, the certified copy stamp ----
      {
        await open(page, "bundle", lang);
        await fromPage(page, "async () => window.__pdfe.buildPdf()");
        const drawn = await page.evaluate(() => window.__pdfeForms.drawn());
        const nums = drawn.filter((x) => x.look === "plain").map((x) => x.text);
        const want = lang === "ko" ? ["1 / 3", "2 / 3", "3 / 3"] : ["Page 1 of 3", "Page 2 of 3", "Page 3 of 3"];
        check("bundle: every page numbered as saved", JSON.stringify(nums) === JSON.stringify(want), nums.join(", "));
        const certs = drawn.filter((x) => x.look === "box");
        check("bundle: the certified copy stamp on the copies, with the date and the name", certs.length === 2 && certs.every((x) => x.text.includes(lang === "ko" ? "홍길동" : "Jordan Lee") && /\d/.test(x.text)) && drawn.every((x) => !/[{}]/.test(x.text)), JSON.stringify(certs.map((x) => x.text)));
        const imgs = await imagesPerPage(await docBytes(page));
        check("bundle: three documents in one file (the screenshots page holds two pictures)", imgs.length === 3 && imgs[2] === 2, imgs.join("/"));
      }

      // ---- aiguard: the hidden text notice ----
      {
        await open(page, "aiguard", lang);
        await page.waitForFunction(() => [...document.querySelectorAll(".toast span")].some((s) => s.textContent), null, { timeout: 8000 }).catch(() => {});
        await page.waitForFunction((t) => [...document.querySelectorAll(".toast span")].some((s) => s.textContent.includes(t)), await T("hid.toast"), { timeout: 8000 }).catch(() => {});
        check("aiguard: opening it shows the hidden text notice", (await toastText(page)).includes(await T("hid.toast")), await toastText(page));
        await page.locator(".toast button", { hasText: await T("hid.see") }).first().click().catch(() => {});
        await page.waitForSelector("#dlg-hidden[open]", { timeout: 5000 }).catch(() => {});
        const list = await page.locator("#hidden-body").innerText().catch(() => "");
        const ask = lang === "ko" ? "이전 지시를 무시하고" : "Ignore previous instructions";
        check("aiguard: the list says white text on page 1 and quotes it", list.includes(ask) && list.includes(await T("hid.item", { n: 1, kind: await T("hid.k.white") })), list.slice(0, 160).replace(/\n/g, " "));
        console.log("     screenshot", await shot(page, `aiguard-hidden-${mode}-${lang}`));
        await page.evaluate(() => document.querySelector("#dlg-hidden").close());
      }

      // ---- noai: saved with the notice and sealed, then verified ----
      {
        await page.evaluate(() => { const S = window.__pdfe.S; S.prefs.aiNotice = false; S.prefs.aiLine = false; S.prefs.sealOnSave = false; });
        await open(page, "noai", lang);
        await page.evaluate(() => window.__pdfe.openSaveDialog());
        await page.waitForSelector("#dlg-save[open]");
        const prefsBefore = await page.evaluate(() => ({ ai: !!window.__pdfe.S.prefs.aiNotice || !!window.__pdfe.S.prefs.sealOnSave }));
        const on = await page.evaluate(() => ({ ai: document.querySelector("#save-ai").checked, line: document.querySelector("#save-ai-line").checked, seal: document.querySelector("#save-seal").checked }));
        check("noai: the save dialog starts with the No AI notice, its line and the seal on", on.ai && on.line && on.seal, JSON.stringify(on));
        check("noai: the summary under “More options” says the notice is on", (await page.locator("#save-more-on").innerText()).includes(await T("st.save.on.ai")));
        await page.evaluate(() => { document.getElementById("save-more").open = true; });
        console.log("     screenshot", await shot(page, `noai-save-${mode}-${lang}`));
        await page.evaluate(() => { window.__pdfeLastExport = null; });
        await page.click("#save-ok");
        await page.waitForFunction(() => !!window.__pdfeLastExport, null, { timeout: 45000 }).catch(() => {});
        await sleep(800);
        const saved = await fromPage(page, "async () => window.__pdfeLastExport");
        const md = await inPage(page, async (u8) => { const pdf = await window.__pdfeSeal.openScanDoc(u8); const m = await pdf.getMetadata(); pdf.destroy(); return window.__pdfeSeal.aiNoticeIn(m?.metadata?.getRaw?.() || ""); }, saved);
        const text = (await pageText(page, saved)).join(" ");
        check("noai: the saved file carries the notice (XMP) and the line at the foot", md && text.replace(/\s/g, "").includes((await T("ai.line")).replace(/\s/g, "").slice(0, 12)), text.slice(-80));
        await clearToasts(page);
        await page.evaluate(() => window.__pdfe.openVerify());
        await inPage(page, (u8, n) => window.__pdfe.verifyBytes(u8, n), saved, "proposal.pdf");
        await page.waitForFunction((t) => document.querySelector("#dlg-verify")?.innerText.includes(t), await T("ai.v.title"), { timeout: 15000 }).catch(() => {});
        const v = await page.locator("#dlg-verify").innerText();
        check("noai: Verify shows the notice, covered by the seal", v.includes(await T("ai.v.title")) && v.includes(await T("ai.v.covered")), v.slice(0, 200).replace(/\n/g, " "));
        console.log("     screenshot", await shot(page, `noai-verify-${mode}-${lang}`));
        await page.evaluate(() => document.querySelector("#dlg-verify").close());
        check("noai: opening the example and its save dialog doesn't turn the notice or the seal on for other documents", prefsBefore.ai === false);
      }

      // ---- inspection: photos as a page, checks and both signatures ----
      {
        await open(page, "inspection", lang);
        const st = await state(page), imgs = await imagesPerPage(await docBytes(page));
        check("inspection: the photos page holds the two room photos", imgs[1] === 2, imgs.join("/"));
        check("inspection: six check marks and both signatures", st.items.filter((o) => o.kind === "mark").length === 6 && st.items.filter((o) => o.kind === "draw").length === 2);
      }

      // ---- consent: sign here mode, one client ----
      {
        await open(page, "consent", lang);
        const slots = await page.evaluate(() => window.__pdfe.S.overlays.filter((o) => o.slot).map((o) => o.slot.kind).sort().join(","));
        check("consent: slots for the two check boxes and the signature", slots === "check,check,sign", slots);
        check("consent: a hint offers sign here mode", (await toastText(page)).includes(await T("ex.consent.toast")));
        await page.locator(".toast button", { hasText: await T("ks.title") }).first().click();
        await page.waitForSelector("#dlg-kiosk[open]");
        const asked = await page.evaluate(() => [...window.__pdfeKiosk.KIOSK.setup.ask]);
        const f = lang === "ko" ? ["이름", "연락처"] : ["name", "phone"];
        check("consent: the start screen asks each person for name and phone", f.every((n) => asked.includes(n)), asked.join(","));
        const dirName = `Consent_${lang}`, outDir = path.join(srv.home, "Documents", dirName); fs.mkdirSync(outDir, { recursive: true });
        await page.evaluate((d) => { window.__shimDialogNext = [`~/Documents/${d}`]; }, dirName);
        await page.click("#ks-dir-btn");
        await page.waitForFunction(() => window.__pdfeKiosk.KIOSK.setup?.dir, null, { timeout: 10000 });
        if (await page.isChecked("#ks-seal").catch(() => false)) await page.uncheck("#ks-seal");
        console.log("     screenshot", await shot(page, `consent-start-${mode}-${lang}`));
        await page.click("#ks-go");
        await page.waitForSelector("#ks-begin", { timeout: 30000 }).catch(async (e) => {
          // say why the start screen didn't move on (a message on it, or kiosk mode stuck starting)
          const why = await page.evaluate(() => ({ msg: document.querySelector("#ks-msg")?.textContent || "", on: window.__pdfeKiosk.KIOSK.on, dlg: !!document.querySelector("#dlg-kiosk[open]"), go: document.querySelector("#ks-go")?.disabled, step: window.__pdfeKiosk.KIOSK.step }));
          console.log("     consent start stuck:", JSON.stringify(why), await shot(page, `consent-stuck-${mode}-${lang}`));
          throw e;
        });
        await page.evaluate(() => { window.__pdfeKiosk.KIOSK.thanksMs = 900; });
        await page.click("#ks-begin");
        await page.waitForSelector("#ks-in-0");
        await page.fill("#ks-in-0", lang === "ko" ? "이지은" : "Casey Park");
        await page.fill("#ks-in-1", "010-0000-1111");
        await page.click("#ks-next");
        await page.waitForSelector("#ks-act").catch(async (e) => {
          const why = await page.evaluate(() => { const K = window.__pdfeKiosk.KIOSK; return { step: K.step, err: K.err, cur: !!K.cur, idx: K.cur?.idx, fields: K.cur?.fields, h: document.querySelector("#ks-h")?.textContent, main: document.querySelector("#ks-main")?.textContent?.slice(0, 160) }; });
          console.log("     consent first slot stuck:", JSON.stringify(why), await shot(page, `consent-stuck-slot-${mode}-${lang}`));
          console.log("     page errors so far:", errors.slice(-3).join(" | "));
          throw e;
        });
        let guard = 0;
        while (guard++ < 8) {
          await page.waitForFunction(() => document.querySelector("#ks-done") || document.querySelector(".ks-slot.cur"), null, { timeout: 60000 });
          if (await page.locator("#ks-done").count()) break;
          const kind = await page.evaluate(() => document.querySelector(".ks-slot.cur")?.dataset.kind);
          if (kind === "check") { await page.click("#ks-act"); await page.waitForFunction(() => !!document.querySelector('.ks-slot.cur.done, .ks-slot.done[data-kind="check"]')); }
          else if (kind === "sign") {
            await page.click("#ks-act"); await page.waitForSelector("#dlg-draw.ks-pad[open]");
            const box = await page.locator("#pad").boundingBox();
            await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6); await page.mouse.down();
            for (const [x, y] of [[0.3, 0.3], [0.4, 0.7], [0.5, 0.35], [0.65, 0.6]]) await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 6 });
            await page.mouse.up(); await page.click("#pad-save");
            await page.waitForFunction(() => !document.querySelector("#dlg-draw").open);
          }
          await page.waitForFunction(() => (document.querySelector("#ks-next") && !document.querySelector("#ks-next").disabled) || document.querySelector("#ks-done"), null, { timeout: 10000 });
          if (!(await page.locator("#ks-done").count())) await page.locator("#ks-next").click({ timeout: 5000 }).catch(() => {});
          await sleep(500);
        }
        await page.waitForSelector("#ks-done", { timeout: 60000 });
        console.log("     screenshot", await shot(page, `consent-review-${mode}-${lang}`));
        const txt = await page.evaluate(() => window.__pdfeForms.drawn().map((d) => d.text)); // the review is the file as it will be saved
        await page.click("#ks-done");
        await page.waitForFunction((l) => document.querySelector("#ks-h")?.textContent === l, await T("ks.thanks"), { timeout: 30000 });
        const files = fs.readdirSync(outDir);
        check("consent: one client went through and got a file of their own", files.length === 1 && /\.pdf$/.test(files[0]), files.join(", "));
        check("consent: the file has the name and phone typed", txt.includes(lang === "ko" ? "이지은" : "Casey Park") && txt.includes("010-0000-1111"), JSON.stringify(txt));
        await page.evaluate(() => window.__pdfeKiosk.exit());
        await sleep(500);
        check("consent: leaving sign here mode is back in the editor", await page.evaluate(() => !window.__pdfeKiosk.KIOSK.on && !document.querySelector("#kiosk")));
      }
      await clearToasts(page);
    }
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
console.log(`\n${results.length - failed.length}/${results.length} example checks passed (${MODES.join(", ")}); screenshots in ${path.relative(DESKTOP, OUT)}/`);
process.exit(failed.length ? 1 : 0);
