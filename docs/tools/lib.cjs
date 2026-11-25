// Shared helpers for the README image scripts (English and Korean UI). Run them through render.sh.
// Privacy: everything runs against a sandbox "home" folder (FAKE_HOME) filled with made-up documents.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "out");
const IMAGES = path.join(ROOT, "docs", "images");
// standalone=1: the Electron app's code paths (seal UI with the dev server's stand-in seal, language switch)
const URL_APP = process.env.PDFE_URL || "http://localhost:4320/?desktop=1&standalone=1";
const MARK = ".pdfe-fake-home";
const LANGS = ["en", "ko"];
// language of this run: first CLI argument (en | ko), else PDFE_LANG, else en
const LANG = LANGS.includes(process.argv[2]) ? process.argv[2] : LANGS.includes(process.env.PDFE_LANG) ? process.env.PDFE_LANG : "en";
const rawDir = (lang = LANG) => path.join(OUT, "raw-" + lang);
const RAW = rawDir();

// Everything the scripts type or name, per UI language. The documents are the app's own examples
// (docs/design/scenarios.md), saved under the names a person would give them. All people and companies are made up.
// One person throughout: 홍길동 / Jordan Lee rents a flat, runs a small design studio, has a child in primary school
// and settled a bicycle accident; the power of attorney waits for a parent's signature.
const SCENARIOS = {
  ko: {
    sig: "내 서명", seal: "홍길동 도장", ini: null, corp: "회사 직인", date: "오늘 날짜", check: "체크 표시", dateText: "2026. 11. 25.",
    sealer: { name: "홍길동", org: "주식회사 새솔디자인" },
    docs: {
      lease: "~/Downloads/월세계약서_성미산로_201호.pdf", agreement: "~/Documents/합의서_자전거사고.pdf",
      quote: "~/Documents/새솔디자인/견적서_한빛상사.pdf", school: "~/Downloads/현장체험학습_참가동의서.pdf", proxy: "~/Downloads/위임장_주민센터.pdf",
    },
    folders: ["~/Documents/새솔디자인", "~/Documents/집 계약"],
  },
  en: {
    sig: "Signature", seal: null, ini: "Initials", corp: "Studio stamp", date: "Today's date", check: "Check mark", dateText: "Nov 25, 2026",
    sealer: { name: "Jordan Lee", org: "Northwind Design Ltd." },
    docs: {
      lease: "~/Downloads/Lease_48_Maple_St_Apt_3B.pdf", agreement: "~/Documents/Settlement_Agreement_Avery.pdf",
      quote: "~/Documents/Northwind/Quote_Q-2026-118_Brightline.pdf", school: "~/Downloads/Field_Trip_Permission_Slip.pdf", proxy: "~/Downloads/Power_of_Attorney_Mom.pdf",
    },
    folders: ["~/Documents/Northwind", "~/Documents/Home"],
  },
};
for (const L of Object.values(SCENARIOS)) L.docs.contract = L.docs.lease; // the main document (older scripts call it contract)
const SC = SCENARIOS[LANG];
const SUFFIX = { ko: "_서명", en: "_signed" }[LANG];
const base = (p) => p.slice(p.lastIndexOf("/") + 1);
const stem = (p) => base(p).replace(/\.pdf$/i, "");
const signedPath = (p) => p.replace(/\.pdf$/i, SUFFIX + ".pdf");

function fakeHome() {
  const h = process.env.FAKE_HOME;
  if (!h) throw new Error("Set FAKE_HOME to the folder the dev server uses as PDFE_DEV_HOME (an empty scratch folder).");
  const abs = path.resolve(h);
  const real = fs.realpathSync.native(process.env.HOME);
  if (abs === real || abs === process.env.HOME || abs.includes(`${path.sep}web${path.sep}.devhome`)) throw new Error(`refusing to use ${abs} as the fake home`);
  fs.mkdirSync(abs, { recursive: true });
  const entries = fs.readdirSync(abs);
  if (entries.length && !entries.includes(MARK)) throw new Error(`${abs} is not empty and was not created by these scripts`);
  return abs;
}
function wipeFakeHome() {
  const h = fakeHome();
  for (const e of fs.readdirSync(h)) fs.rmSync(path.join(h, e), { recursive: true, force: true });
  fs.writeFileSync(path.join(h, MARK), "sandbox home for README screenshots\n");
  return h;
}

// PW_CHROMIUM overrides the browser; otherwise Playwright's own, else any Chrome for Testing already in its cache
async function launch() {
  if (process.env.PW_CHROMIUM) return chromium.launch({ executablePath: process.env.PW_CHROMIUM });
  try { return await chromium.launch(); } catch (e) {
    const cache = path.join(process.env.HOME || "", "Library", "Caches", "ms-playwright");
    const found = fs.existsSync(cache) && fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()
      .map((d) => path.join(cache, d, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing")).find((p) => fs.existsSync(p));
    if (!found) throw e;
    return chromium.launch({ executablePath: found });
  }
}

async function newPage(browser, { scale = 2, width = 1440, height = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: "light",
    locale: LANG === "ko" ? "ko-KR" : "en-US", timezoneId: LANG === "ko" ? "Asia/Seoul" : "America/New_York" });
  // first paint already in the right language (the page reads this hint before its storage loads)
  await ctx.addInitScript((l) => { try { localStorage.setItem("pdfe.lang", l); } catch {} }, LANG);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.warn("[pageerror]", e.message));
  return page;
}

async function openApp(page) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(URL_APP, { waitUntil: "networkidle" });
      await page.waitForFunction(() => window.__pdfe && window.__pdfe.S.fs && window.PDFLib, null, { timeout: 15000 });
      break;
    } catch (e) { if (i === 2) throw e; console.warn("reload:", e.message); }
  }
  await page.addScriptTag({ path: path.join(__dirname, "seed-page.js") });
  await page.evaluate(async (l) => { window.__seed.setLang(l); await window.__pdfe.setLang(l); }, LANG);
  await page.evaluate(() => window.__seed.fonts());
  await page.evaluate(() => document.fonts.ready);
  // no blinking caret / hover tips in captures
  await page.addStyleTag({ content: "*{caret-color:transparent!important} .tip{display:none!important}" });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// draw the made-up signature in the pad with real pointer events
async function drawSignature(page, { onFrame } = {}) {
  const box = await page.locator("#pad").boundingBox();
  const strokes = await page.evaluate(() => window.__seed.signatureStrokes());
  const ox = box.x + box.width * 0.2, oy = box.y + box.height * 0.45, sw = box.width * 0.6, sh = box.height * 0.55;
  for (const s of strokes) {
    const pts = s.map(([x, y]) => [ox + x * sw, oy + y * sh]);
    await page.mouse.move(pts[0][0], pts[0][1]);
    await page.mouse.down();
    for (let i = 1; i < pts.length; i++) {
      await page.mouse.move(pts[i][0], pts[i][1]);
      if (onFrame && i % 6 === 0) await onFrame(pts[i]);
    }
    await page.mouse.up();
  }
}

// Build the sandbox: the user's Library (drawn signature, personal stamp or initials, company stamp scan, date stamp,
// check mark) and the Library's documents, taken from the app's examples and left in believable states:
//   lease      the main document: signature, stamp, 간인 and date (en: signature, date, initials on every page)
//   agreement  signed, not saved yet (seal.cjs seals and saves it)
//   quote      company stamp and date, saved          school  ticks, signature and date, saved
//   proxy      opened, nothing placed (waiting for the parent's signature)
// opts.keepMainClean: leave the lease without items (for the demo)
async function seed(page, { keepMainClean = false, shots = null } = {}) {
  // 1) the examples' clean PDFs, written into the sandbox home under the user's own file names
  const ex = {};
  for (const [key, id] of [["lease", "lease"], ["agreement", "agreement"], ["quote", "quote"], ["school", "school"], ["proxy", "proxy"]]) {
    ex[key] = await page.evaluate(async ([id, dest]) => {
      const d = await window.__seed.exampleDoc(id);
      await window.__seed.writeHome(dest, d.bytes);
      return { pages: d.pages, items: d.items, assets: d.assets };
    }, [id, SC.docs[key]]);
    await page.evaluate(() => { document.querySelectorAll("dialog[open]").forEach((d) => d.close()); document.querySelectorAll("#toasts .toast").forEach((t) => t.remove()); });
  }
  await page.evaluate(() => window.__pdfe.showHome());
  await sleep(300);
  // show the library panel on the home screen
  await page.evaluate(() => { const S = window.__pdfe.S; if (!S.prefs.homeSide) document.querySelector("#btn-side").click(); });
  await sleep(200);

  // 2) signature drawn in the pad
  await page.locator('#home .add-btn[data-add="draw"]').click();
  await sleep(300);
  await drawSignature(page);
  await sleep(200);
  if (shots?.pad) await shots.pad();
  await page.locator("#pad-save").click();
  await sleep(400);
  await page.evaluate(async (SC) => {
    const S = window.__pdfe.S; const a = [...S.assets.values()].find((x) => x.kind === "draw" && !x.sample);
    a.name = SC.sig; a.lastW = 100; await window.__pdfe.addToLibrary(a);
  }, SC);

  // 3) stamps the user keeps: personal stamp (ko) or initials (en), the studio's stamp scanned on paper, a check mark
  const pick = (exKey, re) => ex[exKey].assets.find((a) => re.test(a.name));
  const copies = [
    SC.seal && [pick("lease", /도장/), SC.seal, 42],
    SC.ini && [pick("lease", /Initials/), SC.ini, 44],
    [pick("quote", /직인|stamp/i), SC.corp, 62],
    [pick("school", /✓/), SC.check, 14],
  ].filter(Boolean);
  await page.evaluate(async (copies) => {
    for (const [a, name, lastW] of copies) {
      const id = await window.__seed.copyAsset(a.src, a.kind, name);
      const x = window.__pdfe.S.assets.get(id); x.lastW = lastW; await window.__pdfe.addToLibrary(x);
    }
  }, copies);
  // date stamp typed in the text dialog
  await page.locator('#home .add-btn[data-add="text"]').click();
  await sleep(300);
  await page.locator("#txt-input").fill(SC.dateText);
  await page.locator("#txt-input").dispatchEvent("input");
  await sleep(500);
  if (shots?.text) await shots.text();
  await page.locator("#txt-save").click();
  await sleep(400);
  await page.evaluate(async (SC) => {
    const S = window.__pdfe.S; const a = [...S.assets.values()].find((x) => x.kind === "text" && !x.sample);
    if (a) { a.name = SC.date; await window.__pdfe.addToLibrary(a); }
    // library order: signature first, then stamp or initials, date, company stamp, check mark
    const now = Date.now(); const order = [SC.sig, SC.seal || SC.ini, SC.date, SC.corp, SC.check];
    for (const x of S.assets.values()) if (!x.sample) { const i = order.indexOf(x.name); x.lastUsed = now - (i < 0 ? 9 : i) * 1000; await window.__pdfe.addToLibrary(x); }
  }, SC);

  // 4) open each document and put the user's items where the example had its own
  await page.evaluate(async ({ keepMainClean, SC, SUFFIX, ex }) => {
    const p = window.__pdfe, s = window.__seed, S = p.S, D = SC.docs;
    const base = (x) => x.slice(x.lastIndexOf("/") + 1), signed = (x) => base(x).replace(/\.pdf$/i, SUFFIX + ".pdf");
    const mine = (name) => name && [...S.assets.values()].find((a) => a.name === name && !a.sample);
    const role = (it) => it.kind === "draw" ? (/Initials/.test(it.name) ? SC.ini : SC.sig) : it.kind === "seal" ? SC.seal : it.kind === "image" ? SC.corp : it.kind === "mark" ? SC.check : it.kind === "text" && /날짜|date/i.test(it.name) ? SC.date : null;
    const fill = (items) => {
      let ganFrom = null;
      for (const it of items) {
        const a = mine(role(it)); if (!a) continue;
        if (it.gan) { ganFrom = ganFrom || a; continue; }
        const r = a.h / a.w; let w, h, x, y;
        if (a.kind === "text") { h = it.h; w = h / r; x = it.x; y = it.y; }
        else if (a.kind === "draw") { w = it.w * (/Initials/.test(it.name) ? 1 : 1.12); h = w * r; x = it.x + it.w / 2 - w / 2; y = it.y + it.h * 0.7 - h * 0.7; }
        else { w = it.w; h = w * r; x = it.x + it.w / 2 - w / 2; y = it.y + it.h / 2 - h / 2; }
        p.placeAsset(a.id, it.page, { x: x + w / 2, y: y + h / 2 });
        const o = S.overlays[S.overlays.length - 1];
        p.act(() => { o.w = w; o.h = h; o.x = x; o.y = y; o.rot = it.rot || 0; o.opacity = it.opacity ?? 1; });
      }
      if (ganFrom) { // 간인 with the same stamp, the way the inspector's button does it
        const o = S.overlays.find((x) => x.assetId === ganFrom.id && !x.gan);
        if (o) { p.select(o.id); p.ganinSel(); }
      }
      p.select(null);
    };
    const save = async (name) => { const src = S.rec.source.path; await p.performSave(name, src.slice(0, src.lastIndexOf("/")), false); };

    await s.openPath(D.proxy);
    await s.openPath(D.school); fill(ex.school.items); await save(signed(D.school));
    await s.openPath(D.quote); fill(ex.quote.items); await save(signed(D.quote));
    await s.openPath(D.agreement); fill(ex.agreement.items);
    const d = await window.claude.use("desktop"); for (const f of SC.folders) await d.fs.mkdir(f, { recursive: true });
    await s.openPath(D.lease);
    if (!keepMainClean) fill(ex.lease.items);
  }, { keepMainClean, SC, SUFFIX, ex });
  await sleep(600);
  await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach((t) => t.remove()));

  // believable times in the list
  await page.evaluate(async (D) => {
    const p = window.__pdfe, S = p.S, now = Date.now(), min = 60e3, hr = 3600e3, day = 86400e3;
    const base = (x) => x.slice(x.lastIndexOf("/") + 1);
    const T = { [base(D.lease)]: [3 * min, 2 * min], [base(D.agreement)]: [2 * hr, 2 * hr - 6 * min], [base(D.quote)]: [day + 2 * hr, day + 2 * hr - 5 * min], [base(D.school)]: [3 * day, 3 * day - 4 * min], [base(D.proxy)]: [5 * day, null] };
    for (const r of S.docs) {
      const t = T[r.name]; if (!t) continue;
      r.openedAt = now - t[0]; r.editedAt = t[1] == null ? null : now - t[1];
      if (r.export) { r.export.at = now - t[1] + 20e3; for (const e of r.exportLog || []) e.at = r.export.at; }
    }
    await p.Store.saveDocs(S.docs);
  }, SC.docs);
  return { ex };
}

// a sealer identity in the stand-in seal (the real app keeps it in the Keychain / DPAPI)
async function makeSealer(page) {
  await page.evaluate(async (who) => {
    const p = window.__pdfe; const st = p.S.seal;
    p.SEAL.id = (await st.identity()) || (await st.createIdentity(who));
  }, SC.sealer);
}
// read a file of the fake home / append bytes to it (a change made "outside the app")
async function readHome(page, p) { return page.evaluate(async (p) => [...new Uint8Array(await (await window.claude.use("desktop")).fs.readFile(p))], p); }
async function appendToFile(page, p, text = "\n% edited in another app\n") {
  await page.evaluate(async ([p, text]) => {
    const fsx = (await window.claude.use("desktop")).fs;
    const a = new Uint8Array(await fsx.readFile(p)), b = new TextEncoder().encode(text), out = new Uint8Array(a.length + b.length);
    out.set(a); out.set(b, a.length); await fsx.writeFile(p, out);
  }, [p, text]);
}
// open the Verify seal dialog on a file of the fake home (what "Choose file…" does after the native panel)
async function verifyPath(page, p) {
  await page.evaluate(async (p) => {
    const x = window.__pdfe; x.openVerify();
    const bytes = new Uint8Array(await x.S.fs.readFile(p));
    await x.verifyBytes(bytes, p.slice(p.lastIndexOf("/") + 1));
  }, p);
  await sleep(500);
}

async function shot(page, name, { clip, keepToasts = false } = {}) {
  fs.mkdirSync(RAW, { recursive: true });
  if (!keepToasts) await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach((t) => t.remove()));
  const file = path.join(RAW, name + ".png");
  await page.screenshot({ path: file, clip });
  return file;
}

module.exports = { ROOT, OUT, RAW, IMAGES, LANG, LANGS, SC, SCENARIOS, SUFFIX, rawDir, base, stem, signedPath, fakeHome, wipeFakeHome, launch, newPage, openApp, seed, makeSealer, readHome, appendToFile, verifyPath, drawSignature, shot, sleep };
