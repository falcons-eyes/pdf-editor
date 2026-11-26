// Sealworks 1.3 workflows: pages (쪽 정리), cover boxes (가리기) and the text-free copy (docs/design/workflows.md,
// blocks 1 and 3), driven through the page with the dev server's stand-ins for the desktop app and the Android app
// (web/dev_server.py). Everything runs in a throwaway home folder; pdf.js and pdf-lib come from node_modules (the same
// builds the page pins), and no request leaves the machine.
//
//   node test/workflows-pages.mjs                      # desktop, then Android
//   node test/workflows-pages.mjs --mode android       # one of them
//   options: --port <n> (default 4502), --shots <dir> (default test/out/workflows), --headed
//   PW_CHROMIUM=<path to a Chromium/Chrome for Testing binary> if Playwright's own browser isn't installed
//
// Covers: an image page (A4 portrait), a receipts sheet (4 images a page), reordering (rail drag on desktop, the move
// button on Android) with the placed items following, rotating a page (items turn with it), removing a page and
// undo / redo (pages and items come back), the Library copy surviving a reload (and the unchanged original opening
// as the edited copy), saving a page range as its own PDF (the source untouched), a cover box whose text is gone from
// the saved file (pdf.js text extraction) while other pages keep theirs, and a text-free copy with no text at all.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(DESKTOP, "..");
const argv = process.argv.slice(2);
const flag = (name, d) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : d; };
const MODES = flag("--mode", "both") === "both" ? ["desktop", "android"] : [flag("--mode")];
const PORT = +flag("--port", process.env.PDFE_TEST_PORT || 4502);
const SHOTS = path.resolve(flag("--shots", path.join(DESKTOP, "test", "out", "workflows")));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = "") {
  if (ok) pass++; else fail++;
  results.push(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail !== "" ? ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`);
  console.log(results[results.length - 1]);
}
const sha = (b) => createHash("sha256").update(b).digest("hex");

/* ---------- fixtures: a three-page PDF, a two-page PDF and a few PNGs, all made up ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(w, h, paint) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const [r, g, b] = paint(x, y); const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; } }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
async function textPdf(lines) {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  for (const ls of lines) {
    const p = doc.addPage([595.28, 841.89]);
    ls.forEach((s, k) => p.drawText(s, { x: 72, y: 760 - k * 28, size: 16, font, color: rgb(0.1, 0.1, 0.1) }));
  }
  return doc.save();
}
async function makeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sealworks-pages-"));
  fs.writeFileSync(path.join(home, ".pdfe-fake-home"), "");
  for (const d of ["Documents", "Pictures", "Downloads", "Desktop"]) fs.mkdirSync(path.join(home, d));
  fs.writeFileSync(path.join(home, "Documents", "three.pdf"), await textPdf([
    ["PAGE ONE ALPHA", "Service agreement between Jordan Lee and Northwind"],
    ["PAGE TWO BRAVO", "Resident number SECRET 900101 1234567", "Account BALANCE 42"],
    ["PAGE THREE CHARLIE", "Signed in Seoul"],
  ]));
  fs.writeFileSync(path.join(home, "Documents", "extra.pdf"), await textPdf([["EXTRA ONE"], ["EXTRA TWO"]]));
  fs.writeFileSync(path.join(home, "Pictures", "land.png"), png(900, 600, (x, y) => [40 + (x % 200), 120, 200 - (y % 150)]));
  for (let k = 1; k <= 5; k++) fs.writeFileSync(path.join(home, "Pictures", `r${k}.png`), png(300, 520, (x, y) => [250 - k * 30, 240, (y * 3 + k * 40) % 255]));
  return home;
}

/* ---------- the dev server and the browser ---------- */
async function startServer(home) {
  const srv = spawn("python3", [path.join(ROOT, "web", "dev_server.py"), String(PORT)], { env: { ...process.env, PDFE_DEV_HOME: home }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) return srv; } catch {}
    await sleep(150);
  }
  srv.kill(); throw new Error(`dev server did not start on ${PORT}: ${out}`);
}
const LOCAL = {
  "pdf.min.js": path.join(DESKTOP, "node_modules", "pdfjs-dist", "build", "pdf.min.js"),
  "pdf-lib.min.js": path.join(DESKTOP, "node_modules", "pdf-lib", "dist", "pdf-lib.min.js"),
};
function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const base = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  try {
    for (const d of fs.readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
      for (const sub of fs.readdirSync(path.join(base, d))) {
        const p = path.join(base, d, sub, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {}
  return undefined; // Playwright's own
}
async function openPage(browser, mode) {
  const android = mode === "android";
  const ctx = await browser.newContext(android
    ? { viewport: { width: 412, height: 880 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "en-US" }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "en-US" });
  // offline: the pinned libraries from node_modules, nothing else from the network
  await ctx.route(/^https?:\/\//, (route) => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${PORT}/`)) return route.continue();
    const f = Object.keys(LOCAL).find((k) => u.endsWith("/" + k));
    if (f && /cdnjs\.cloudflare\.com/.test(u)) return route.fulfill({ path: LOCAL[f], contentType: "application/javascript", headers: { "Access-Control-Allow-Origin": "*" } });
    return route.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const q = android ? "desktop=1&standalone=1&sandboxed=1&os=android&mobile=1" : "desktop=1&standalone=1";
  await page.goto(`http://localhost:${PORT}/?${q}`);
  await page.waitForFunction(() => window.__pdfe?.S?.fs && window.__pdfe.S.samples?.length, null, { timeout: 20000 });
  await page.evaluate(() => window.__pdfe.setLang("en"));
  return { ctx, page, errors };
}

/* ---------- helpers in the page ---------- */
const st = (page) => page.evaluate(() => {
  const S = window.__pdfe.S;
  return {
    n: S.pages.length, sizes: S.pages.map((p) => [Math.round(p.w), Math.round(p.h)]),
    items: S.overlays.map((o) => ({ id: o.id, page: o.page, x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot, cover: o.cover || null })),
    hist: S.history.length, fut: S.future.length, recPages: S.rec?.pages, edit: !!S.rec?.edit,
  };
});
const pageTexts = (page) => page.evaluate(async () => {
  const out = [];
  for (const p of window.__pdfe.S.pages) out.push((await p.pg.getTextContent()).items.map((i) => i.str).join(" "));
  return out;
});
// text of every page of the last saved PDF (window.__pdfeLastExport), read back with pdf.js
const exportTexts = (page) => page.evaluate(async () => {
  const doc = await window.pdfjsLib.getDocument({ data: window.__pdfeLastExport.slice(), isEvalSupported: false }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ").trim());
  await doc.destroy();
  return out;
});
const waitPages = (page, n) => page.waitForFunction((n) => window.__pdfe.S.pages.length === n && !document.querySelector("#pg-list[aria-busy]"), n, { timeout: 20000 });
async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const f = path.join(SHOTS, name + ".png");
  await sleep(450); // dialogs and sheets slide in
  await page.screenshot({ path: f });
  return f;
}
const shots = [];
// an item of the ⋮ menu, by its words key (whatever the language)
async function menuItem(page, key) {
  const label = await page.evaluate((k) => window.__pdfe.t(k), key);
  await page.click("#btn-more");
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}
async function openPagesDlg(page, mode) {
  if (mode === "android") await menuItem(page, "pages.m.open"); else await page.click("#btn-pages");
  await page.waitForSelector("#dlg-pages[open] .pg-card");
}
async function closeDlg(page, id) {
  await page.click(`#${id} .dlg-head [data-close]`);
  await page.waitForFunction((id) => !document.getElementById(id).open, id);
}
const undoBtn = (mode) => (mode === "android" ? "#bb-undo" : "#btn-undo");
const redoBtn = (mode) => (mode === "android" ? "#bb-redo" : "#btn-redo");
async function saveVia(page, mode, { name, range = null, textFree = false, fromPages = false } = {}) {
  const before = await page.evaluate(() => window.__pdfeLastExport || null).then((b) => (b ? b.length : 0));
  if (!fromPages) await page.click(mode === "android" ? "#bb-save" : "#btn-export");
  await page.waitForSelector("#dlg-save[open]");
  if (range != null || textFree) await page.evaluate(() => { document.getElementById("save-more").open = true; });
  if (range != null) await page.fill("#save-range", range);
  if (textFree) await page.check("#save-textfree");
  if (name) await page.fill("#save-name", name);
  await page.evaluate(() => { window.__pdfeLastExport = null; });
  await page.click("#save-ok");
  await page.waitForFunction(() => window.__pdfeLastExport && !document.querySelector("#btn-export .spinner") && !document.querySelector("#bb-save .spinner"), null, { timeout: 30000 });
  return before;
}

/* ---------- the run ---------- */
async function run(mode, browser, home) {
  console.log(`\n== ${mode} ==`);
  const android = mode === "android", tag = (s) => `${mode}: ${s}`;
  const { ctx, page, errors } = await openPage(browser, mode);
  const src = path.join(home, "Documents", "three.pdf"), srcHash = sha(fs.readFileSync(src));

  // open the three-page document from the picker
  await page.evaluate(() => { window.__shimDialogNext = ["~/Documents/three.pdf"]; });
  await page.click(android ? "#bb-open" : "#btn-open");
  await page.waitForFunction(() => window.__pdfe.S.pages.length === 3 && window.__pdfe.S.rec);
  await page.evaluate((z) => window.__pdfe.setZoom(z), android ? 0.6 : 0.9);
  // a stamp on page 2 (BRAVO) and a signature on page 1 (ALPHA)
  await page.evaluate(() => { const { S, placeAsset } = window.__pdfe; placeAsset(S.samples[0], 1); placeAsset(S.samples[1] || S.samples[0], 0); });
  let s = await st(page);
  const [itemB, itemA] = s.items; // B on page index 1, A on page index 0
  check(tag("two items placed"), s.items.length === 2 && itemB.page === 1 && itemA.page === 0, s.items);

  // --- add an image page (A4 portrait, picture fitted with a margin)
  await openPagesDlg(page, mode);
  check(tag("pages dialog lists 3 pages"), (await page.locator("#pg-list .pg-card").count()) === 3);
  shots.push(await shot(page, `${mode}-pages-dialog`));
  await page.evaluate(() => { window.__shimDialogNext = ["~/Pictures/land.png"]; });
  await page.click("#pg-add-img");
  await waitPages(page, 4);
  s = await st(page);
  check(tag("image page added at the end as A4 portrait"), s.n === 4 && s.sizes[3][0] === 595 && s.sizes[3][1] === 842, s.sizes);
  check(tag("items stay on their pages after adding"), s.items.find((o) => o.id === itemB.id)?.page === 1 && s.items.find((o) => o.id === itemA.id)?.page === 0);

  // --- receipts sheet: 5 images, 4 to a page -> 2 new pages
  await page.locator("#pg-per button").nth(2).click(); // "4"
  check(tag("4 per page chosen"), (await page.locator('#pg-per button[aria-pressed="true"]').textContent()).trim() === (await page.evaluate(() => window.__pdfe.t("pages.per.n", { n: 4 }))));
  await page.evaluate(() => { window.__shimDialogNext = ["~/Pictures/r1.png", "~/Pictures/r2.png", "~/Pictures/r3.png", "~/Pictures/r4.png", "~/Pictures/r5.png"]; });
  await page.click("#pg-add-img");
  await waitPages(page, 6);
  const imgs = await page.evaluate(async () => {
    const S = window.__pdfe.S, out = [];
    for (const i of [4, 5]) { const ops = await S.pages[i].pg.getOperatorList(); out.push(ops.fnArray.filter((f) => f === window.pdfjsLib.OPS.paintImageXObject || f === window.pdfjsLib.OPS.paintJpegXObject).length); }
    return out;
  });
  check(tag("receipts sheet: 4 images on one page, 1 on the next"), imgs[0] === 4 && imgs[1] === 1, imgs);
  await page.locator("#pg-per button").nth(0).click(); // back to 1 a page
  check(tag("Library record follows the page count"), (await st(page)).recPages === 6);
  check(tag("pages dialog lists 6 pages"), (await page.locator("#pg-list .pg-card").count()) === 6);

  // --- reorder: page 2 (BRAVO, item B) goes after page 3 (CHARLIE)
  if (android) {
    await page.click('.pg-card[data-i="1"] [data-act="down"]');
    await page.waitForFunction((id) => !document.querySelector("#pg-list[aria-busy]") && window.__pdfe.S.overlays.find((o) => o.id === id)?.page === 2, itemB.id);
    await sleep(200);
    check(tag("move-down keeps keyboard focus on the moved page"), await page.evaluate(() => document.activeElement?.closest?.(".pg-card")?.dataset.i === "2"));
    await closeDlg(page, "dlg-pages");
  } else {
    await closeDlg(page, "dlg-pages");
    const target = page.locator('.thumb[data-i="2"]'), box = await target.boundingBox();
    await page.dragAndDrop('.thumb[data-i="1"]', '.thumb[data-i="2"]', { targetPosition: { x: box.width / 2, y: box.height * 0.85 } });
  }
  await page.waitForFunction(() => window.__pdfe.S.overlays.length && !document.querySelector("#pg-list[aria-busy]") && window.__pdfe.S.history.at(-1)?.pagesState && window.__pdfe.S.pages.length === 6);
  await page.waitForFunction((id) => window.__pdfe.S.overlays.find((o) => o.id === id)?.page === 2, itemB.id, { timeout: 10000 }).catch(() => {});
  let texts = await pageTexts(page);
  s = await st(page);
  check(tag("reorder: BRAVO is now page 3, CHARLIE page 2"), /BRAVO/.test(texts[2]) && /CHARLIE/.test(texts[1]), texts.slice(0, 3));
  check(tag("reorder: the stamp followed its page"), s.items.find((o) => o.id === itemB.id)?.page === 2, s.items);
  check(tag("reorder: the other item stayed"), s.items.find((o) => o.id === itemA.id)?.page === 0);

  // --- rotate page 3 (with the stamp): the page turns, the stamp turns with it
  const b0 = s.items.find((o) => o.id === itemB.id), dims0 = s.sizes[2];
  await openPagesDlg(page, mode);
  await page.click('.pg-card[data-i="2"] [data-act="rot"]');
  await page.waitForFunction(() => Math.round(window.__pdfe.S.pages[2].w) === 842 && !document.querySelector("#pg-list[aria-busy]"));
  s = await st(page);
  const b1 = s.items.find((o) => o.id === itemB.id);
  const cx0 = b0.x + b0.w / 2, cy0 = b0.y + b0.h / 2, cx1 = b1.x + b1.w / 2, cy1 = b1.y + b1.h / 2;
  check(tag("rotate: page is landscape now"), s.sizes[2][0] === dims0[1] && s.sizes[2][1] === dims0[0], s.sizes[2]);
  check(tag("rotate: the stamp turned 90° and kept its place on the paper"), b1.rot === (b0.rot + 90) % 360 && Math.abs(cx1 - (dims0[1] - cy0)) < 1.5 && Math.abs(cy1 - cx0) < 1.5, { b0, b1 });
  const rotated = await page.evaluate(() => window.__pdfe.S.pages[2].pg.rotate);
  check(tag("rotate: the PDF page carries /Rotate 90"), rotated === 90, rotated);

  // --- remove page 1 (ALPHA, item A) and bring it back
  await page.click('.pg-card[data-i="0"] [data-act="del"]');
  await waitPages(page, 5);
  s = await st(page);
  check(tag("delete: 5 pages, the item on the removed page is gone"), s.n === 5 && !s.items.some((o) => o.id === itemA.id), s.items);
  check(tag("delete: the other item moved up with its page"), s.items.find((o) => o.id === itemB.id)?.page === 1);
  check(tag("delete: toast offers Undo"), await page.locator(".toast button", { hasText: "Undo" }).count() > 0);
  await closeDlg(page, "dlg-pages");
  await page.click(undoBtn(mode));
  await waitPages(page, 6);
  s = await st(page);
  texts = await pageTexts(page);
  check(tag("undo: the page and its item are back"), s.n === 6 && s.items.find((o) => o.id === itemA.id)?.page === 0 && /ALPHA/.test(texts[0]), s.items);
  check(tag("undo: the rotated page is still rotated"), s.sizes[2][0] === 842 && s.items.find((o) => o.id === itemB.id)?.rot === b1.rot);
  await page.click(redoBtn(mode));
  await waitPages(page, 5);
  check(tag("redo: removed again"), !(await st(page)).items.some((o) => o.id === itemA.id));
  await page.click(undoBtn(mode));
  await waitPages(page, 6);
  check(tag("undo again: 6 pages"), (await st(page)).items.some((o) => o.id === itemA.id));

  if (!android) {
    await page.focus('.thumb[data-i="3"]');
    await page.keyboard.press("Alt+ArrowDown");
    await page.waitForFunction(() => window.__pdfe.S.history.at(-1)?.pagesState && !document.querySelector("#pg-list[aria-busy]") && document.activeElement?.dataset?.i === "4", null, { timeout: 10000 }).catch(() => {});
    const moved = await page.evaluate(() => ({ focus: document.activeElement?.dataset?.i, w: Math.round(window.__pdfe.S.pages[3].w), imgs: null }));
    texts = await pageTexts(page);
    check(tag("rail: ⌥↓ moves the focused page and keeps focus on it"), moved.focus === "4" && texts[4] === "" && texts[3] === "", moved);
    await page.keyboard.press("Shift+F10");
    check(tag("rail: the context menu key opens the page's actions"), await page.getByRole("menuitem", { name: "Rotate clockwise" }).isVisible());
    await page.keyboard.press("Escape");
    await page.click(undoBtn(mode));
    await page.waitForFunction(() => !window.__pdfe.S.history.at(-1)?.pagesState || window.__pdfe.S.future.length, null, { timeout: 10000 });
    await page.waitForFunction(() => !document.querySelector("#pg-list[aria-busy]") && window.__pdfe.S.future.length === 1);
    await page.focus("#btn-cover");
    await page.keyboard.press("Enter");
    const kc = (await st(page)).items.filter((o) => o.cover);
    check(tag("cover by keyboard: a box placed in the page in view, focused"), kc.length === 1 && await page.evaluate(() => document.activeElement?.classList.contains("cover")), kc);
    await page.click(undoBtn(mode));
    check(tag("cover by keyboard: undone"), !(await st(page)).items.some((o) => o.cover));
    s = await st(page);
    check(tag("still 6 pages, 2 items"), s.n === 6 && s.items.length === 2, s);
  }

  // --- the Library copy: persisted and reopened after a reload; the unchanged original opens as the edited copy
  const copyPages = await page.evaluate(async () => { const { Store, S } = window.__pdfe; const b = await Store.getCopy(S.rec.id); return (await window.PDFLib.PDFDocument.load(b)).getPageCount(); });
  check(tag("Library copy has the 6 pages"), copyPages === 6, copyPages);
  check(tag("the original file is untouched"), sha(fs.readFileSync(src)) === srcHash);
  await page.evaluate(() => window.__pdfe.showHome());
  await sleep(700); // autosave
  await page.reload();
  await page.waitForFunction(() => window.__pdfe?.S?.fs && window.__pdfe.S.docs.length);
  await page.click(".doc-row .doc-open");
  await page.waitForFunction(() => window.__pdfe.S.pages.length === 6, null, { timeout: 15000 });
  s = await st(page); texts = await pageTexts(page);
  check(tag("after a reload: 6 pages in the edited order"), /ALPHA/.test(texts[0]) && /CHARLIE/.test(texts[1]) && /BRAVO/.test(texts[2]) && s.sizes[2][0] === 842, texts.slice(0, 3));
  check(tag("after a reload: items on their pages"), s.items.find((o) => o.id === itemA.id)?.page === 0 && s.items.find((o) => o.id === itemB.id)?.page === 2 && s.items.find((o) => o.id === itemB.id)?.rot === b1.rot, s.items);
  await page.evaluate(() => window.__pdfe.showHome());
  await page.evaluate(() => { window.__shimDialogNext = ["~/Documents/three.pdf"]; });
  await page.click(android ? "#bb-open" : "#btn-open");
  await page.waitForFunction(() => window.__pdfe.S.view === "editor" && window.__pdfe.S.pages.length);
  await sleep(300);
  s = await st(page);
  check(tag("opening the original again shows the edited copy"), s.n === 6 && s.items.length === 2, { n: s.n, items: s.items.length });
  check(tag("one Library record for the document"), (await page.evaluate(() => window.__pdfe.S.docs.length)) === 1);
  await page.evaluate((z) => window.__pdfe.setZoom(z), android ? 0.6 : 0.9);

  // --- save pages 2-3 as their own PDF (from 쪽 정리), next to the original
  await openPagesDlg(page, mode);
  await page.click("#pg-save-range");
  await page.waitForSelector("#dlg-save[open]");
  check(tag("range save: the save dialog opens on the page field"), await page.evaluate(() => document.activeElement?.id === "save-range" && document.getElementById("save-more").open));
  const rangeName = `three_part_${mode}`;
  await saveVia(page, mode, { name: rangeName, range: "2-3", fromPages: true });
  const partFile = android ? path.join(home, "Documents", rangeName + ".pdf") : path.join(home, "Documents", rangeName + ".pdf");
  const part = fs.existsSync(partFile) ? await PDFDocument.load(fs.readFileSync(partFile)) : null;
  check(tag("range save: a new 2-page file"), part?.getPageCount() === 2, partFile);
  texts = await exportTexts(page);
  check(tag("range save: pages 2 and 3 (CHARLIE, BRAVO)"), texts.length === 2 && /CHARLIE/.test(texts[0]) && /BRAVO/.test(texts[1]), texts);
  check(tag("range save: the original is untouched"), sha(fs.readFileSync(src)) === srcHash);
  check(tag("range save: not recorded as the document's saved file"), await page.evaluate(() => !window.__pdfe.S.rec.export && window.__pdfe.S.rec.exportLog.at(-1)?.part === true));

  // --- a cover box over "SECRET" on page 3 (BRAVO, rotated)
  const where = await page.evaluate(async () => {
    const p = window.__pdfe.S.pages[2], vp = p.pg.getViewport({ scale: 1 });
    const it = (await p.pg.getTextContent()).items.find((i) => /SECRET/.test(i.str));
    const m = window.pdfjsLib.Util.transform(vp.transform, it.transform);
    return { x: m[4], y: m[5] };
  });
  // the text runs top to bottom on the turned page: a box around the whole line
  const box = { x: where.x - 30, y: where.y - 20, w: 60, h: 380 };
  if (android) {
    await menuItem(page, "cover.btn");
    await page.waitForFunction(() => window.__pdfe.S.overlays.some((o) => o.cover));
    await page.evaluate((b) => { const { S, act, getOv } = window.__pdfe; const o = S.overlays.find((x) => x.cover); act(() => Object.assign(getOv(o.id), { page: 2, ...b })); }, box);
  } else {
    await page.evaluate(() => window.__pdfe.S.pages[2].el.scrollIntoView({ block: "start" }));
    await sleep(300);
    await page.click("#btn-cover");
    check(tag("cover: drawing mode is on"), await page.evaluate(() => document.getElementById("btn-cover").getAttribute("aria-pressed") === "true"));
    const r = await page.evaluate((b) => { const S = window.__pdfe.S, p = S.pages[2], rr = p.el.getBoundingClientRect(); return { x0: rr.left + b.x * S.zoom, y0: rr.top + b.y * S.zoom, x1: rr.left + (b.x + b.w) * S.zoom, y1: rr.top + (b.y + b.h) * S.zoom }; }, box);
    await page.mouse.move(r.x0, r.y0); await page.mouse.down();
    await page.mouse.move((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, { steps: 4 }); await page.mouse.move(r.x1, r.y1, { steps: 4 });
    await page.mouse.up();
  }
  s = await st(page);
  const cv = s.items.find((o) => o.cover);
  await page.evaluate(() => { const S = window.__pdfe.S, o = S.overlays.find((x) => x.cover); document.querySelector(`.ov[data-id="${o.id}"]`)?.scrollIntoView({ block: "center" }); });
  check(tag("cover: a black box on page 3 where it was drawn"), cv && cv.page === 2 && cv.cover === "black" && Math.abs(cv.x - box.x) < 3 && Math.abs(cv.h - box.h) < 3, cv);
  await sleep(300);
  shots.push(await shot(page, `${mode}-cover-box`));
  await page.click(android ? "#bb-save" : "#btn-export");
  await page.waitForSelector("#dlg-save[open]");
  const note = await page.locator("#save-img-note").textContent();
  check(tag("save dialog says which page becomes a picture and why"), await page.locator("#save-img-note").isVisible() && /Page 3 has a cover box/.test(note), note);
  shots.push(await shot(page, `${mode}-save-cover-note`));
  await closeDlg(page, "dlg-save");
  await saveVia(page, mode, { name: `three_covered_${mode}` });
  texts = await exportTexts(page);
  check(tag("cover: 6 pages saved"), texts.length === 6, texts.length);
  check(tag("cover: the covered page has no text left"), texts[2] === "" && !texts.join(" ").includes("SECRET"), texts[2]);
  check(tag("cover: pages without a cover keep their text"), /ALPHA/.test(texts[0]) && /CHARLIE/.test(texts[1]), texts.slice(0, 2));
  const pic = await page.evaluate(async () => {
    const doc = await window.pdfjsLib.getDocument({ data: window.__pdfeLastExport.slice(), isEvalSupported: false }).promise;
    const pg = await doc.getPage(3), ops = await pg.getOperatorList(), vp = pg.getViewport({ scale: 1 });
    const n = ops.fnArray.filter((f) => f === window.pdfjsLib.OPS.paintImageXObject || f === window.pdfjsLib.OPS.paintJpegXObject).length;
    await doc.destroy();
    return { n, w: Math.round(vp.width), h: Math.round(vp.height), rot: pg.rotate };
  });
  check(tag("cover: the page is a picture of the same size, with the stamp drawn on top"), pic.n >= 2 && pic.w === 842 && pic.h === 595 && pic.rot === 0, pic);

  // --- the text-free copy: every page a picture, no text anywhere
  await page.click(android ? "#bb-save" : "#btn-export");
  await page.waitForSelector("#dlg-save[open]");
  await page.evaluate(() => { document.getElementById("save-more").open = true; });
  await page.check("#save-textfree");
  check(tag("text-free: its own default file name"), /_text-free$/.test(await page.inputValue("#save-name")), await page.inputValue("#save-name"));
  const tfNote = await page.locator("#save-img-note").textContent();
  check(tag("text-free: the dialog says every page becomes a picture"), /Every page is saved as a picture/.test(tfNote), tfNote);
  check(tag("text-free: the honest sentence is next to the option"), /screen readers can't read it/.test(await page.locator("#save-tf-explain").textContent()));
  shots.push(await shot(page, `${mode}-save-text-free`));
  await closeDlg(page, "dlg-save");
  await saveVia(page, mode, { name: `three_textfree_${mode}`, textFree: true });
  texts = await exportTexts(page);
  check(tag("text-free: 6 pages, no text on any"), texts.length === 6 && texts.every((x) => x === ""), texts);
  check(tag("text-free: logged as a copy, the document's saved file stays the covered one"), await page.evaluate((m) => window.__pdfe.S.rec.export?.name === `three_covered_${m}.pdf` && window.__pdfe.S.rec.exportLog.at(-1)?.textFree === true, mode));
  check(tag("the original is still untouched"), sha(fs.readFileSync(src)) === srcHash);

  // --- small things: the range parser, the nothing-to-save path offers a text-free copy
  const pr = await page.evaluate(() => { const f = window.__pdfe.parseRange; return [f("", 5), f("1-3, 5", 5), f("2~4", 5), f("1-5", 5), f("0", 5), f("6", 5), f("a", 5), f("3, 1", 5)]; });
  check(tag("parseRange"), JSON.stringify(pr) === JSON.stringify([null, [0, 1, 2, 4], [1, 2, 3], null, false, false, false, [0, 2]]), pr);
  if (android) {
    check(tag("Android back closes the pages dialog"), await (async () => { await openPagesDlg(page, mode); await page.evaluate(() => window.__shimBack()); return !(await page.evaluate(() => document.getElementById("dlg-pages").open)); })());
  }
  await page.evaluate(() => window.__pdfe.setLang("ko"));
  await openPagesDlg(page, mode);
  shots.push(await shot(page, `${mode}-pages-dialog-ko`));
  await closeDlg(page, "dlg-pages");
  await page.click(android ? "#bb-save" : "#btn-export");
  await page.waitForSelector("#dlg-save[open]");
  await page.evaluate(() => { document.getElementById("save-more").open = true; });
  await page.check("#save-textfree");
  shots.push(await shot(page, `${mode}-save-text-free-ko`));
  await closeDlg(page, "dlg-save");
  check(tag("no page errors"), errors.length === 0, errors.slice(0, 5));
  await ctx.close();
}

(async () => {
  const home = await makeHome();
  const srv = await startServer(home);
  const browser = await chromium.launch({ executablePath: chromiumPath(), headless: !argv.includes("--headed") });
  try {
    for (const m of MODES) {
      fs.rmSync(path.join(home, "Library"), { recursive: true, force: true }); // each mode starts with an empty Library
      try { await run(m, browser, home); }
      catch (e) { check(`${m}: run finished`, false, String(e?.stack || e).split("\n").slice(0, 4).join(" | ")); }
    }
  } finally {
    await browser.close(); srv.kill();
    fs.rmSync(home, { recursive: true, force: true });
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (shots.length) console.log("screenshots:\n  " + shots.join("\n  "));
  process.exit(fail ? 1 : 0);
})();
