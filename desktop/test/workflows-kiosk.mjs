// Sealworks 1.3, block 5 (docs/design/workflows.md): sign here mode (서명 받기 모드), driven through web/pdf-editor.html
// in Chromium (Playwright) with the dev server's desktop stand-in (web/dev_server.py): desktop, and Android mode on a
// tablet and on a phone (touch).
//
// Checks:
//   - signature, check and photo boxes placed from the menu, labelled, saved in a form (forms.json, v: 1)
//   - a normal save leaves the boxes out, and the save dialog says so
//   - the start screen: folder, file names, which fields the person types and which are set now, seal, No AI notice, PIN
//   - two people in a row, each a file of their own with their own signature, check, photo and name; sealed (verifies),
//     with the No AI notice, and in the seal log
//   - no Library documents or items added; nothing of the first person shown or kept for the second
//   - Escape and the Android back button never leave; a short press on the corner control doesn't either;
//     a long press and the confirmation (and the PIN) do
//   - a write that fails keeps what was filled in, and trying again saves it
// Screenshots go to test/out/workflows-kiosk/.
//
//   node test/workflows-kiosk.mjs                    every mode
//   node test/workflows-kiosk.mjs --mode tablet      one mode (desktop, tablet, phone)
// Needs: npm ci here (pdf-lib, pdfjs-dist, playwright), python3, and Chromium (PW_CHROMIUM, Playwright's own, or
// Chrome for Testing in ~/Library/Caches/ms-playwright). The dev server runs on a free port from 4541 to 4550 with
// a throwaway home folder; nothing is fetched from the network (cdnjs is served from node_modules).
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(DESKTOP, "..");
const OUT = path.join(DESKTOP, "test", "out", "workflows-kiosk");
const { chromium } = require("playwright");
const { PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream, rgb } = require("pdf-lib");

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const MODES = flag("--mode") ? [flag("--mode")] : ["desktop", "tablet", "phone"];

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
  for (let p = 4541; p <= 4550 && !port; p++) if (await portFree(p)) port = p;
  if (!port) throw new Error("no free port in 4541 to 4550");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pdfe-wf-kiosk-"));
  fs.writeFileSync(path.join(home, ".pdfe-fake-home"), "throwaway home for test/workflows-kiosk.mjs\n");
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
const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 },
  tablet: { viewport: { width: 800, height: 1280 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  phone: { viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};
async function openApp(browser, port, mode, lang) {
  const android = mode !== "desktop";
  const ctx = await browser.newContext({ ...VIEWPORTS[mode], locale: lang === "ko" ? "ko-KR" : "en-US" });
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
  await page.waitForFunction(() => window.__pdfe && window.__pdfeForms && window.__pdfeKiosk && window.__pdfe.S.seal && window.__pdfe.S.fs, null, { timeout: 20000 });
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
async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  await sleep(350);
  const file = path.join(OUT, name + ".png");
  await page.screenshot({ path: file });
  return file;
}
const clearToasts = (page) => page.evaluate(() => { for (const t of document.querySelectorAll(".toast")) t.remove(); });
// the pictures each page of a PDF draws (image XObjects, nested forms included)
async function imagesPerPage(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.getPages().map((p) => {
    const xo = p.node.Resources()?.lookup(PDFName.of("XObject"));
    if (!xo) return 0;
    return xo.keys().filter((k) => xo.lookup(k)?.dict?.get(PDFName.of("Subtype"))?.toString() === "/Image").length;
  });
}
async function xmpOf(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const s = doc.context.lookup(doc.catalog.get(PDFName.of("Metadata")));
  if (!s) return null;
  return Buffer.from(s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents()).toString("utf8");
}
// a box of a page as pdf.js draws it: how much ink, and a hash of the pixels (to tell two people's files apart)
const inkOf = (page, bytes, pageNo, box) => inPage(page, async (u8, [n, b]) => {
  const pdf = await window.__pdfeSeal.openScanDoc(u8), pg = await pdf.getPage(n), vp = pg.getViewport({ scale: 2 });
  const c = document.createElement("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const g = c.getContext("2d", { willReadFrequently: true }); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: g, viewport: vp }).promise;
  const d = g.getImageData(Math.round(b.x * 2), Math.round(b.y * 2), Math.round(b.w * 2), Math.round(b.h * 2)).data;
  let ink = 0, h = 0;
  for (let i = 0; i < d.length; i += 4) { const dark = d[i] + d[i + 1] + d[i + 2] < 600; if (dark) ink++; h = (h * 31 + (dark ? 1 : 0) + (i % 97)) >>> 0; }
  pdf.destroy();
  return { ink, hash: h };
}, bytes, [pageNo, box]);

/* ---------- test documents ---------- */
async function makePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++) {
    const p = doc.addPage([595.28, 841.89]);
    p.drawText(i === 0 ? "Membership Terms" : "Move-in condition", { x: 60, y: 760, size: 22, font, color: rgb(0.1, 0.1, 0.15) });
    p.drawText("Please read the terms, then sign below.", { x: 60, y: 720, size: 12, font });
    p.drawText("Member: ________________", { x: 60, y: 300, size: 13, font });
  }
  return Buffer.from(await doc.save());
}
// a small picture standing in for a camera photo: stripes, landscape (1) or portrait (2)
function makePng(seed) {
  const w = seed === 1 ? 160 : 90, h = seed === 1 ? 110 : 140;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const on = seed === 1 ? Math.floor(x / 16) % 2 : Math.floor(y / 14) % 2, o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = on ? 30 : 200; raw[o + 1] = on ? 60 : 210; raw[o + 2] = on ? 120 : 90;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function runMode(browser, mode) {
  const android = mode !== "desktop", lang = mode === "phone" ? "en" : "ko";
  prefix = `[${mode}] `;
  const srv = await startServer();
  const { ctx, page, errors } = await openApp(browser, srv.port, mode, lang);
  const docs = path.join(srv.home, "Documents");
  try {
    const T = (k, p) => page.evaluate(([k, p]) => window.__pdfe.t(k, p || {}), [k, p]);
    const K = (expr) => page.evaluate((e) => (0, eval)(`(() => { const KIOSK = window.__pdfeKiosk.KIOSK, P = window.__pdfe; return ${e}; })()`), expr);
    const NAME = lang === "ko" ? "이름" : "name", SHOP = lang === "ko" ? "매장명" : "shop";
    const people = lang === "ko" ? ["김하늘", "이서준", "박민지"] : ["Jordan Lee", "Sam Rivera", "Alex Kim"];
    const shopName = lang === "ko" ? "한빛 피트니스" : "Northwind Fitness";

    // the terms (2 pages), opened from the picker
    fs.writeFileSync(path.join(docs, "terms.pdf"), await makePdf());
    fs.writeFileSync(path.join(docs, "photo1.png"), makePng(1));
    fs.writeFileSync(path.join(docs, "photo2.png"), makePng(2));
    await page.evaluate(() => { window.__shimDialogNext = ["~/Documents/terms.pdf"]; });
    await page.click(android ? "#bb-open" : "#btn-open");
    await page.waitForFunction(() => window.__pdfe.S.pages.length === 2 && window.__pdfe.S.rec);
    await page.evaluate((z) => window.__pdfe.setZoom(z), mode === "phone" ? 0.55 : 0.8);
    await sleep(500);
    // the staff's own stamp with the fields: "{name} · {shop}" (a Library item of theirs, made before the session)
    await page.evaluate(async ([n, s]) => {
      const P = window.__pdfe, c = document.createElement("canvas"); c.width = 240; c.height = 40;
      const a = await P.makeAssetFromSource(c.toDataURL("image/png"), { kind: "text", name: "member line" });
      a.tpl = { look: "plain", text: `{${n}} · {${s}}`, sub: "", font: "sans", color: "#111318" }; a.autoRemoveBg = false;
      await P.addToLibrary(a); P.placeAsset(a.id, 0);
      P.act(() => { const o = P.S.overlays[0]; o.w = 220; o.h = 26; o.x = 150; o.y = 520; });
      P.select(null);
    }, [NAME, SHOP]);
    const S0 = await page.evaluate(() => ({ docs: window.__pdfe.S.docs.length, assets: [...window.__pdfe.S.assets.values()].filter((a) => !a.sample).length }));
    await clearToasts(page);

    // ---- slots from the menu ----
    const menu = async (label) => {
      if (android) await page.click("#btn-more"); else await page.click("#btn-forms");
      await page.getByRole("menuitem", { name: label }).click();
      await sleep(250);
    };
    check("menu: sign here mode can't start before there's a box", await (async () => {
      if (android) await page.click("#btn-more"); else await page.click("#btn-forms");
      const dis = await page.getByRole("menuitem", { name: await T("ks.start") }).getAttribute("aria-disabled");
      await page.keyboard.press("Escape"); await sleep(200);
      return dis === "true";
    })());
    await menu(await T("ks.add.sign"));
    await menu(await T("ks.add.check"));
    await menu(await T("ks.add.photo"));
    const slots0 = await page.evaluate(() => window.__pdfe.S.overlays.filter((o) => o.slot).map((o) => ({ kind: o.slot.kind, label: o.slot.label, required: o.slot.required, asset: o.assetId ?? null })));
    check("slots: a signature, a check and a photo box, no Library item behind them", slots0.length === 3 && slots0.map((s) => s.kind).join() === "sign,check,photo" && slots0.every((s) => s.asset === null)
      && slots0[0].required && !slots0[1].required && slots0[2].required, JSON.stringify(slots0));
    // where they go: the signature and the check box on page 1, the photo box on page 2
    await page.evaluate(() => window.__pdfe.act(() => {
      const [s, c, p] = window.__pdfe.S.overlays.filter((o) => o.slot);
      Object.assign(s, { page: 0, x: 330, y: 560, w: 180, h: 60 });
      Object.assign(c, { page: 0, x: 60, y: 640, w: 16, h: 16 });
      Object.assign(p, { page: 1, x: 60, y: 140, w: 240, h: 170 });
    }));
    // the check box's label, typed in its inspector
    const checkLabel = lang === "ko" ? "약관에 동의합니다" : "I agree to the terms";
    await page.evaluate(() => { const P = window.__pdfe; P.select(P.S.overlays.filter((o) => o.slot)[1].id); });
    if (android) { await page.click("#sb-adjust"); await sleep(400); }
    check("inspector: label, kind, “must be filled in”", await page.locator("#f-slot-label").isVisible() && (await page.locator("#f-slot-req").count()) === 1);
    await page.fill("#f-slot-label", checkLabel);
    await page.locator("#f-slot-label").press("Enter");
    await page.waitForFunction((l) => window.__pdfe.S.overlays.some((o) => o.slot?.label === l), checkLabel);
    if (!android) await shot(page, `${mode}-editor-slot-inspector`);
    if (android) await page.evaluate(() => window.__pdfe.closeSheet());
    await page.evaluate(() => window.__pdfe.select(null));
    const shown = await page.evaluate(() => [...document.querySelectorAll(".ov.slot")].map((n) => ({ kind: n.dataset.kind, text: n.querySelector(".slot-lbl")?.textContent, aria: n.getAttribute("aria-label") })));
    check("editor: dashed boxes with their labels and accessible names", shown.length === 3 && shown[0].text === (await T("ks.def.sign")) && shown[1].text === checkLabel && shown.every((s) => s.aria),
      JSON.stringify(shown));
    await shot(page, `${mode}-editor-slots`);

    // ---- a normal save leaves the boxes out, and says so ----
    const plain = await fromPage(page, "async () => window.__pdfe.buildPdf()");
    const imgs = await imagesPerPage(plain);
    check("normal save: no box in the file (only the stamp's picture)", imgs.join() === "1,0", imgs.join());
    await page.click(android ? "#bb-save" : "#btn-export");
    await page.waitForSelector("#dlg-save[open]");
    const note = await page.locator("#save-slot-note");
    check("save dialog: says the boxes aren't saved in the file", await note.isVisible() && (await note.innerText()) === (await T("ks.save.note")));
    await shot(page, `${mode}-save-dialog-slots`);
    await page.evaluate(() => document.querySelector("#dlg-save").close());

    // ---- save as form ----
    const formName = lang === "ko" ? "회원 약관" : "Membership terms";
    await menu(await T("form.saveAs"));
    await page.waitForSelector("#dlg-form[open]");
    await page.fill("#form-name", formName);
    await page.click("#form-save");
    await page.waitForFunction(() => window.__pdfeForms.FORMS.list?.length === 1);
    await sleep(400);
    const formsFile = path.join(srv.home, "Library", "Application Support", "PDF Editor", "forms.json");
    const stored = fs.existsSync(formsFile) ? JSON.parse(fs.readFileSync(formsFile, "utf8")) : [];
    const f0 = stored[0] || {}, fslots = (f0.items || []).filter((i) => i.slot);
    check("form: the boxes are in forms.json as items with a slot (v: 1, fields from the stamp)", f0.v === 1 && fslots.length === 3 && fslots.every((i) => !("assetId" in i) && ["sign", "check", "photo"].includes(i.slot.kind))
      && fslots[1].slot.label === checkLabel && f0.fields?.includes(NAME) && f0.fields?.includes(SHOP), JSON.stringify(fslots.map((i) => i.slot)));
    await clearToasts(page);

    // ---- the start screen: from the form in the Library (desktop, phone) or from the open document (tablet) ----
    await page.evaluate(async () => { const P = window.__pdfe; P.SEAL.id = await P.S.seal.createIdentity({ name: "홍길동", org: "한빛 피트니스" }); });
    const fromDoc = mode === "tablet";
    if (fromDoc) await menu(await T("ks.start"));
    else {
      await page.evaluate(() => window.__pdfe.showHome());
      await sleep(300);
      if (android) { await page.evaluate(() => window.__pdfe.openSheet("home")); await sleep(400); }
      else if (await page.evaluate(() => document.querySelector("#home").classList.contains("no-side"))) { await page.click("#btn-side"); await sleep(300); }
      await page.getByRole("button", { name: await T("ks.start.aria", { name: formName }) }).click();
    }
    await page.waitForSelector("#dlg-kiosk[open]");
    const outDir = path.join(docs, "Signed"); fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "keep-me.pdf"), "an older file, left alone");
    check("start screen: seal on by default (a sealer exists), the folder still to choose", await page.isChecked("#ks-seal") && (await page.locator("#ks-dir").innerText()) === (await T("many.folder.none")));
    check("start screen: Android says how to pin the app; not on desktop", android ? (await page.locator("#ks-pinning").innerText()) === (await T("ks.pinning")) && (await T("ks.pinning")).length > 20 : (await page.locator("#ks-pinning").count()) === 0);
    await page.click("#ks-go");
    check("start screen: asks for the folder first", (await page.locator("#ks-msg").innerText()) === (await T("many.folder.need")));
    await page.evaluate(() => { window.__shimDialogNext = ["~/Documents/Signed"]; });
    await page.click("#ks-dir-btn");
    await page.waitForFunction(() => /Signed|^\/android\//.test(document.querySelector("#ks-dir")?.title || ""));
    // {name} typed by each person, {shop} set now for everyone
    const rows = page.locator("#ks-body .ks-fld-row");
    check("start screen: one row per field, each typed by the person until set", (await rows.count()) === 2 && (await rows.nth(0).locator('button[aria-pressed="true"]').innerText()) === (await T("ks.field.ask")));
    const shopRow = (await rows.nth(0).innerText()).includes(SHOP) ? 0 : 1;
    await rows.nth(shopRow).getByRole("button", { name: await T("ks.field.fixed") }).click();
    await page.fill(`#ks-fld-${shopRow}`, shopName);
    if (!(await page.isChecked("#ks-ai"))) await page.check("#ks-ai");
    const pin = mode === "desktop" ? "2580" : "1357";
    // the form has a photo slot, whose picker can browse files: starting without a staff PIN is refused
    await page.fill("#ks-pin", ""); await page.click("#ks-go");
    check("start screen: a photo slot needs a staff PIN", (await page.locator("#ks-msg").innerText()) === (await T("ks.pin.photo")) && !(await K("KIOSK.on")));
    await page.fill("#ks-pin", "12"); await page.click("#ks-go"); check("start screen: a PIN must be four digits", (await page.locator("#ks-msg").innerText()) === (await T("ks.pin.bad")));
    await page.fill("#ks-pin", pin);
    const pattern = await page.inputValue("#ks-pattern");
    check("start screen: file names default to {date}_{form name}_{n}", pattern === `{${await T("st.f.date")}}_${fromDoc ? "terms" : formName}_{${await T("st.f.n")}}`, pattern);
    await shot(page, `${mode}-start-screen`);
    await page.click("#ks-go");
    await page.waitForFunction(() => window.__pdfeKiosk.KIOSK.on && document.querySelector("#ks-begin"));
    await page.evaluate(() => { window.__pdfeKiosk.KIOSK.thanksMs = 900; });
    check("full screen: the welcome screen with the name and a big Start", (await page.locator("#ks-h").innerText()) === (fromDoc ? "terms" : formName) && (await page.locator("#ks-begin").boundingBox()).height >= 56);
    check("full screen: everything else is out of reach", await page.evaluate(() => document.querySelector("#app").inert && !document.querySelector("#kiosk").inert));
    await shot(page, `${mode}-welcome`);
    if (!fromDoc) {
      const kept = await page.evaluate(() => window.__pdfeForms.FORMS.list[0].kiosk);
      check("form: remembers the start screen (file names, who types what, the set values)", kept?.ask?.includes(NAME) && kept.fixed?.[SHOP] === shopName, JSON.stringify(kept));
    }

    // ---- Escape and back don't leave ----
    await page.keyboard.press("Escape");
    await sleep(200);
    check("Escape doesn't leave", await K("KIOSK.on") && await page.locator("#kiosk").isVisible());
    if (android) check("back button doesn't leave", (await page.evaluate(() => window.__shimBack())) === true && await K("KIOSK.on"));
    // the editor's shortcuts do nothing
    const opens = () => page.evaluate(() => (window.__shimLog || []).filter((l) => l[0] === "dialog.open").length);
    const opens0 = await opens();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+o" : "Control+o");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+s" : "Control+s");
    await sleep(300);
    check("the editor's shortcuts do nothing (no picker, no save dialog)", (await opens()) === opens0 && !(await page.evaluate(() => document.querySelector("#dlg-save").open)) && await K("KIOSK.on"));

    // ---- one person ----
    const draw = async (pts) => {
      const box = await page.locator("#pad").boundingBox();
      await page.mouse.move(box.x + box.width * pts[0][0], box.y + box.height * pts[0][1]);
      await page.mouse.down();
      for (const [x, y] of pts.slice(1)) await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 6 });
      await page.mouse.up();
    };
    const strokes = [
      [[0.15, 0.6], [0.25, 0.3], [0.35, 0.7], [0.45, 0.35], [0.55, 0.65], [0.7, 0.4]],
      [[0.2, 0.3], [0.8, 0.7], [0.5, 0.2], [0.3, 0.8]],
      [[0.1, 0.5], [0.9, 0.5], [0.9, 0.2], [0.1, 0.8]],
    ];
    const signOne = async (k, { shots = false, failWrite = false } = {}) => {
      await page.click("#ks-begin");
      await page.waitForSelector("#ks-in-0");
      check(`person ${k + 1}: the typed field is empty`, (await page.inputValue("#ks-in-0")) === "");
      check(`person ${k + 1}: progress “1 of 4”`, (await page.locator("#ks-progress").innerText()) === (await T("ks.progress", { n: 4, k: 1 })));
      // an empty field isn't passed over
      if (k === 0) {
        await page.click("#ks-next");
        check("fields: an empty one is asked for", (await page.locator("#ks-need").innerText()) === (await T("ks.fields.need", { name: NAME })));
      }
      if (shots) await shot(page, `${mode}-fields`);
      await page.fill("#ks-in-0", people[k]);
      await page.click("#ks-next");
      await page.waitForSelector("#ks-act");
      await page.waitForFunction(() => document.querySelectorAll(".ks-slot").length === 3);
      const leftover = await page.evaluate(() => ({ imgs: document.querySelectorAll("#kiosk img").length, done: document.querySelectorAll(".ks-slot.done").length }));
      check(`person ${k + 1}: every box starts empty`, leftover.imgs === 0 && leftover.done === 0, JSON.stringify(leftover));
      check(`person ${k + 1}: the signature step, next waits for it`, (await page.locator("#ks-prompt").innerText()) === (await T("ks.do.sign.plain")) && await page.isDisabled("#ks-next"));
      if (shots) await shot(page, `${mode}-slot-sign`);
      await page.click("#ks-act");
      await page.waitForSelector("#dlg-draw.ks-pad[open]");
      check(`person ${k + 1}: the pad opens large and empty, titled with the box`, await page.evaluate(() => document.querySelector("#pad-save").disabled) && (await page.locator("#dlg-draw-title").innerText()) === (await T("ks.def.sign"))
        && (await page.locator("#pad").boundingBox()).height >= 200);
      if (android && k === 0) {
        check("back closes the pad, not sign here mode", (await page.evaluate(() => window.__shimBack())) === true && !(await page.evaluate(() => document.querySelector("#dlg-draw").open)) && await K("KIOSK.on"));
        await page.click("#ks-act");
        await page.waitForSelector("#dlg-draw.ks-pad[open]");
      }
      await draw(strokes[k]);
      if (shots) await shot(page, `${mode}-pad`);
      await page.click("#pad-save");
      await page.waitForFunction(() => !document.querySelector("#dlg-draw").open && !document.querySelector("#ks-next").disabled);
      check(`person ${k + 1}: the drawing sits in the box`, await page.evaluate(() => !!document.querySelector('.ks-slot.done[data-kind="sign"] img')));
      if (shots) await shot(page, `${mode}-slot-signed`);
      await page.click("#ks-next");
      await page.waitForFunction((l) => document.querySelector("#ks-prompt")?.textContent === l, checkLabel);
      await page.click("#ks-act");
      await page.waitForFunction(() => !!document.querySelector('.ks-slot.done[data-kind="check"] svg'));
      if (shots) await shot(page, `${mode}-slot-check`);
      await page.click("#ks-next");
      await page.waitForFunction(() => document.querySelector(".ks-slot.cur")?.dataset.kind === "photo");
      check(`person ${k + 1}: progress “4 of 4” on the photo`, (await page.locator("#ks-progress").innerText()) === (await T("ks.progress", { n: 4, k: 4 })));
      await page.evaluate((f) => { window.__shimDialogNext = [`~/Documents/${f}`]; }, `photo${(k % 2) + 1}.png`);
      await page.click("#ks-act");
      // the photo picker can browse files, so staff confirm it with the PIN first; a wrong PIN or 계속하기 opens nothing
      await page.waitForSelector("#ks-pin-in");
      if (k === 0) {
        await page.click("#ks-confirm-no");
        check("photo: without the staff PIN no picker opens", !(await page.evaluate(() => !!document.querySelector('.ks-slot.done[data-kind="photo"] img'))) && (await page.locator("#ks-pin-in").count()) === 0);
        await page.click("#ks-act"); await page.waitForSelector("#ks-pin-in");
        await page.fill("#ks-pin-in", "0000"); await page.click("#ks-confirm-ok");
        check("photo: a wrong PIN is refused", (await page.locator("#ks-confirm-err").innerText()) === (await T("ks.exit.pinBad")));
      }
      await page.fill("#ks-pin-in", pin); await page.click("#ks-confirm-ok");
      await page.waitForFunction(() => !!document.querySelector('.ks-slot.done[data-kind="photo"] img'));
      if (shots) await shot(page, `${mode}-slot-photo`);
      await page.click("#ks-next");
      await page.waitForSelector("#ks-done", { timeout: 30000 });
      const drawnNow = await page.evaluate(() => window.__pdfeForms.drawn().map((d) => d.text));
      check(`person ${k + 1}: the review is the file with their name and the set value`, drawnNow.includes(`${people[k]} · ${shopName}`), JSON.stringify(drawnNow));
      if (shots) await shot(page, `${mode}-review`);
      let restore = null;
      if (failWrite) {
        await page.evaluate(() => { const fs = window.__pdfe.S.fs; window.__realWrite = fs.writeFile; fs.writeFile = async () => { throw new Error("EIO: the disk is full"); }; });
        restore = async () => page.evaluate(() => { window.__pdfe.S.fs.writeFile = window.__realWrite; });
      }
      await page.click("#ks-done");
      if (failWrite) {
        await page.waitForSelector("#ks-retry", { timeout: 30000 });
        check("write fails: a calm message for the person", (await page.locator("#ks-h").innerText()) === (await T("ks.fail")) && (await page.locator("#ks-err").innerText()).includes("disk is full"));
        const kept = await K("({ fills: KIOSK.cur.fills.size, name: Object.values(KIOSK.cur.fields)[0], out: !!KIOSK.cur.out })");
        check("write fails: what was filled in is kept (and the sealed file, so it isn't sealed twice)", kept.fills === 3 && kept.name === people[k] && kept.out, JSON.stringify(kept));
        check("write fails: no file written", fs.readdirSync(outDir).filter((f) => f.endsWith(".pdf")).length === (k + 1));
        await shot(page, `${mode}-write-failed`);
        await restore();
        await page.click("#ks-retry");
      }
      await page.waitForFunction((l) => document.querySelector("#ks-h")?.textContent === l, await T("ks.thanks"), { timeout: 30000 });
      if (shots) await shot(page, `${mode}-thanks`);
      await page.waitForSelector("#ks-begin", { timeout: 10000 });
      const after = await page.evaluate((names) => ({ text: document.querySelector("#kiosk").innerText, html: document.querySelector("#kiosk").innerHTML, cur: window.__pdfeKiosk.KIOSK.cur,
        drawn: window.__pdfeForms.drawn().length, imgs: document.querySelectorAll("#kiosk img, #kiosk canvas").length, names }), people);
      check(`person ${k + 1}: back to a clean welcome screen, nothing of theirs kept`, after.cur === null && after.drawn === 0 && after.imgs === 0 && !after.html.includes(people[k]) && !after.html.includes("data:image"), JSON.stringify({ ...after, html: after.html.length, text: after.text.slice(0, 80) }));
    };
    const log0 = await page.evaluate(async () => { await window.__pdfeSeal.loadLog(); return window.__pdfeSeal.LOG.list.length; });
    await signOne(0, { shots: true });
    await shot(page, `${mode}-welcome-again`);
    await signOne(1);

    // ---- the files ----
    const date = new Date(), ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const base = fromDoc ? "terms" : formName;
    const want = [1, 2].map((n) => `${ymd}_${base}_${n}.pdf`);
    const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".pdf")).sort();
    check("two people: two new files named from the pattern, the older file left alone", want.every((w) => files.includes(w)) && files.includes("keep-me.pdf") && fs.readFileSync(path.join(outDir, "keep-me.pdf"), "utf8") === "an older file, left alone", files.join(", "));
    const outs = want.map((w) => (fs.existsSync(path.join(outDir, w)) ? fs.readFileSync(path.join(outDir, w)) : Buffer.alloc(0)));
    let sealed = 0;
    for (const b of outs) { const v = await inPage(page, (u8) => window.__pdfe.S.seal.verify(u8), b); if (v.status === "intact") sealed++; }
    check("every file is sealed and verifies", sealed === 2, `${sealed}/2`);
    const bodies = outs.map((b) => b.subarray(0, Math.max(0, b.lastIndexOf("\n%PDFE-MOCK-SEAL"))));
    const ims = await Promise.all(bodies.map(imagesPerPage));
    check("each file: the stamp, the signature and the check on page 1, the photo on page 2", ims.every((x) => x.join() === "3,1"), JSON.stringify(ims));
    const xm = await Promise.all(bodies.map(xmpOf));
    check("each file: the No AI notice", xm.every((x) => /<tdm:reservation>1<\/tdm:reservation>/.test(x || "")));
    const sigBox = { x: 330, y: 560, w: 180, h: 60 }, nameBox = { x: 150, y: 520, w: 220, h: 26 }, photoBox = { x: 60, y: 140, w: 240, h: 170 };
    const ink = [];
    for (const b of bodies) ink.push({ sig: await inkOf(page, b, 1, sigBox), name: await inkOf(page, b, 1, nameBox), photo: await inkOf(page, b, 2, photoBox) });
    check("each file: their own signature (ink in the box, different between the two)", ink.every((x) => x.sig.ink > 200) && ink[0].sig.hash !== ink[1].sig.hash, JSON.stringify(ink.map((x) => x.sig)));
    check("each file: their own name in the stamp", ink.every((x) => x.name.ink > 50) && ink[0].name.hash !== ink[1].name.hash, JSON.stringify(ink.map((x) => x.name)));
    check("each file: their own photo", ink[0].photo.hash !== ink[1].photo.hash, JSON.stringify(ink.map((x) => x.photo)));
    const log1 = await page.evaluate(() => window.__pdfeSeal.LOG.list.slice());
    const newLog = log1.slice(log0);
    check("every file is in the seal log (file, path, SHA-256, the boxes by name only)", newLog.length === 2 && newLog.every((r, i) => r.sealed && r.file === want[i] && r.path && r.sha256 === sha256(outs[i]))
      && newLog.every((r) => r.items.some((it) => it.name === checkLabel) && !JSON.stringify(r).includes(people[0]) && !JSON.stringify(r).includes(people[1])), JSON.stringify(newLog.map((r) => ({ f: r.file, items: r.items }))));
    const S1 = await page.evaluate(() => ({ docs: window.__pdfe.S.docs.length, assets: [...window.__pdfe.S.assets.values()].filter((a) => !a.sample).length }));
    check("no Library documents or items added", S1.docs === S0.docs && S1.assets === S0.assets, JSON.stringify({ S0, S1 }));
    const docsFile = path.join(srv.home, "Library", "Application Support", "PDF Editor", "documents.json");
    if (fs.existsSync(docsFile)) check("nothing of the people in the stored documents", !people.slice(0, 2).some((p) => fs.readFileSync(docsFile, "utf8").includes(p)));

    // ---- a write that fails, then trying again ----
    await signOne(2, { failWrite: true });
    const third = `${ymd}_${base}_3.pdf`;
    check("write fails: trying again saves the file", fs.existsSync(path.join(outDir, third)));

    // ---- start over clears what was filled in ----
    await page.click("#ks-begin");
    await page.waitForSelector("#ks-in-0");
    await page.fill("#ks-in-0", "Temp Person");
    await page.click("#ks-restart");
    await page.waitForSelector(".ks-confirm");
    await page.click("#ks-confirm-ok");
    await page.waitForSelector("#ks-begin");
    check("start over: back to the welcome screen, the typed name gone", await K("KIOSK.cur") === null && !(await page.locator("#kiosk").innerHTML()).includes("Temp Person"));

    // ---- leaving: a short press doesn't, a long press and the confirmation do ----
    const exitBox = await page.locator("#ks-exit").boundingBox();
    check("corner control: small, but at least 56 px to press", exitBox.width >= 56 && exitBox.height >= 56, JSON.stringify(exitBox));
    await page.click("#ks-exit");
    await sleep(300);
    check("a short press only says to hold it", !(await page.locator(".ks-confirm").count()) && (await page.locator(".ks-tip").innerText()) === (await T("ks.exit.hold")));
    const hold = async (ms) => {
      await page.mouse.move(exitBox.x + exitBox.width / 2, exitBox.y + exitBox.height / 2);
      await page.mouse.down(); await sleep(ms); await page.mouse.up();
    };
    await hold(900);
    await sleep(300);
    check("a press under 2 seconds doesn't ask", !(await page.locator(".ks-confirm").count()));
    await hold(2300);
    await page.waitForSelector(".ks-confirm");
    check("a long press asks first", (await page.locator("#ks-confirm-h").innerText()) === (await T("ks.exit.q")));
    await shot(page, `${mode}-leave-confirm`);
    await page.click("#ks-confirm-no");
    check("“keep going” stays", await K("KIOSK.on") && !(await page.locator(".ks-confirm").count()));
    if (!android) {
      // the keyboard: hold Enter on the control
      await page.focus("#ks-exit");
      await page.keyboard.down("Enter"); await sleep(2300); await page.keyboard.up("Enter");
    } else await hold(2300);
    await page.waitForSelector(".ks-confirm");
    if (pin) {
      await page.fill("#ks-pin-in", "1111");
      await page.click("#ks-confirm-ok");
      check("a wrong PIN doesn't leave", await K("KIOSK.on") && (await page.locator("#ks-confirm-err").innerText()) === (await T("ks.exit.pinBad")));
      await page.fill("#ks-pin-in", pin);
    }
    await page.click("#ks-confirm-ok");
    await page.waitForFunction(() => !window.__pdfeKiosk.KIOSK.on && !document.querySelector("#kiosk"));
    check("leaving: back where it started, everything in reach again", await page.evaluate(() => !document.querySelector("#app").inert));
    const doneMsg = await page.evaluate(() => [...document.querySelectorAll(".toast span")].map((s) => s.textContent).join(" | "));
    check("leaving: says how many files were saved", doneMsg.includes(await T("ks.done", { n: 3 })), doneMsg);
    await shot(page, `${mode}-after-leaving`);

    // accessible names on the new controls
    const unnamed = await page.evaluate(() => [...document.querySelectorAll("#dlg-kiosk button, #dlg-kiosk input, #inspector button, #inspector input")]
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
console.log(`\n${results.length - failed.length}/${results.length} sign here checks passed (${MODES.join(", ")}); screenshots in ${path.relative(DESKTOP, OUT)}/`);
process.exit(failed.length ? 1 : 0);
