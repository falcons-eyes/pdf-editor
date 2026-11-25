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

// Everything the scripts type or name, per UI language. All people, companies and files are made up.
const SCENARIOS = {
  ko: {
    sig: "내 서명", seal: "홍길동 도장", corp: "회사 직인", date: "오늘 날짜", dateText: "2026. 11. 25.",
    sealer: { name: "홍길동", org: "라온스튜디오" },
    docs: {
      proxy: "~/Downloads/위임장.pdf", lease: "~/Documents/임대차계약서.pdf", employ: "~/Documents/재직증명서.pdf",
      nda: "~/Desktop/비밀유지서약서.pdf", quote: "~/Downloads/견적서_라온스튜디오.pdf", contract: "~/Documents/용역계약서_가나다.pdf",
    },
    folders: ["~/Documents/2025 정산", "~/Documents/견적서 모음"],
  },
  en: {
    sig: "My signature", seal: "Jordan's stamp", corp: "Company seal", date: "Today's date", dateText: "Nov 25, 2026",
    sealer: { name: "Jordan Lee", org: "Lumen Studio" },
    docs: {
      proxy: "~/Downloads/Power_of_Attorney.pdf", lease: "~/Documents/Office_Lease.pdf", employ: "~/Documents/Employment_Verification.pdf",
      nda: "~/Desktop/NDA_Brightline.pdf", quote: "~/Downloads/Quote_Lumen_Studio.pdf", contract: "~/Documents/Service_Agreement_Brightline.pdf",
    },
    folders: ["~/Documents/2025 Taxes", "~/Documents/Quotes"],
  },
};
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

// Build the sandbox: library (signature, seal photo, company seal, date stamp) and a Library with documents in several states.
// opts.keepMainClean: leave the main contract without overlays (for the demo)
async function seed(page, { keepMainClean = false, shots = null } = {}) {
  // show the library panel on the home screen
  await page.evaluate(() => { const S = window.__pdfe.S; if (!S.prefs.homeSide) document.querySelector("#btn-side").click(); });
  await sleep(200);

  // 1) signature drawn in the pad
  await page.locator('#home .add-btn[data-add="draw"]').click();
  await sleep(300);
  await drawSignature(page);
  await sleep(200);
  if (shots?.pad) await shots.pad();
  await page.locator("#pad-save").click();
  await sleep(400);
  await page.evaluate(async (SC) => {
    const S = window.__pdfe.S; const a = [...S.assets.values()].find((x) => x.kind === "draw" && !x.sample);
    a.name = SC.sig; await window.__pdfe.addToLibrary(a);
  }, SC);

  // 2) seal photo (off-white paper -> background removal), company seal, date stamp
  await page.evaluate(async (SC) => {
    const s = window.__seed;
    await s.addImageAsset(s.companySeal(), SC.corp);
    await s.addImageAsset(s.sealPhoto(), SC.seal);
  }, SC);
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
    // library order: signature first, then seal, company seal, date
    const now = Date.now(); const order = [SC.sig, SC.seal, SC.corp, SC.date];
    for (const x of S.assets.values()) if (!x.sample) { const i = order.indexOf(x.name); x.lastUsed = now - (i < 0 ? 9 : i) * 1000; await window.__pdfe.addToLibrary(x); }
  }, SC);

  // 3) documents
  const marks = await page.evaluate(async ({ keepMainClean, SC, SUFFIX }) => {
    const p = window.__pdfe, s = window.__seed, S = p.S, D = SC.docs;
    const base = (x) => x.slice(x.lastIndexOf("/") + 1), signed = (x) => base(x).replace(/\.pdf$/i, SUFFIX + ".pdf");
    const id = (name) => [...S.assets.values()].find((a) => a.name === name && !a.sample).id;
    const SIG = id(SC.sig), SEAL = id(SC.seal), CORP = id(SC.corp);
    const place = (assetId, page, cx, cy, w, h, rot = 0) => {
      p.placeAsset(assetId, page, { x: cx, y: cy });
      const o = S.overlays[S.overlays.length - 1];
      p.act(() => { const a = S.assets.get(assetId); const hh = h ?? (w * a.h) / a.w; o.w = w; o.h = hh; o.x = cx - w / 2; o.y = cy - hh / 2; o.rot = rot; });
      return o;
    };
    const sign = (m, { seal = true } = {}) => {
      const a = S.assets.get(SIG); const w = 112, h = (w * a.h) / a.w;
      place(SIG, m.page, (m.line.x0 + m.line.x1) / 2, m.line.y - h / 2 + 6, w);
      if (seal) place(SEAL, m.page, m.seal.x, m.seal.y, 50, 50, 354);
    };
    const save = async (name) => { const src = S.rec.source.path; await p.performSave(name, src.slice(0, src.lastIndexOf("/")), false); };
    const out = {};

    // power of attorney: opened, nothing placed yet
    await s.createDoc("proxy", D.proxy); await s.openPath(D.proxy);
    // lease: signed + saved, then the saved file was deleted in Finder
    let m = await s.createDoc("lease", D.lease); await s.openPath(D.lease);
    sign(m[1]); await save(signed(D.lease));
    // employment letter: company seal, saved
    await s.createDoc("employ", D.employ); await s.openPath(D.employ);
    place(CORP, 0, 470, 655, 62, 62, 0); await save(signed(D.employ));
    // NDA: signed + saved, then the original was edited outside the app
    m = await s.createDoc("nda", D.nda); await s.openPath(D.nda);
    sign(m[0]); await save(signed(D.nda));
    // quote: stamped, not saved yet
    await s.createDoc("quote", D.quote); await s.openPath(D.quote);
    place(SEAL, 0, 360, 676, 46, 46, 352);
    // service agreement: the main document
    m = await s.createDoc("contract", D.contract); await s.openPath(D.contract);
    out.contract = m;
    const d = await window.claude.use("desktop"); for (const f of SC.folders) await d.fs.mkdir(f, { recursive: true });
    if (!keepMainClean) sign(m[1]);
    return out;
  }, { keepMainClean, SC, SUFFIX });
  await sleep(600);

  // outside-the-app changes (what Finder would do)
  const h = fakeHome();
  fs.rmSync(path.join(h, signedPath(SC.docs.lease).slice(2)));
  await page.evaluate(async (ndaPath) => {
    // rewrite the original NDA with a visibly different version
    const s = window.__seed;
    const { bytes } = await s.makePdf(s.NDA_REVISED(), 1);
    await new Promise((r) => setTimeout(r, 1600)); // newer mtime
    await s.writeHome(ndaPath, bytes);
  }, SC.docs.nda);

  // believable times in the list
  await page.evaluate(async (D) => {
    const p = window.__pdfe, S = p.S, now = Date.now(), min = 60e3, hr = 3600e3, day = 86400e3;
    const base = (x) => x.slice(x.lastIndexOf("/") + 1);
    const T = { [base(D.contract)]: [2 * min, 1 * min], [base(D.quote)]: [2 * hr, 2 * hr - 4 * min], [base(D.nda)]: [day + 3 * hr, day + 3 * hr], [base(D.employ)]: [3 * day, 3 * day], [base(D.lease)]: [5 * day, 5 * day], [base(D.proxy)]: [8 * day, null] };
    for (const r of S.docs) {
      const t = T[r.name]; if (!t) continue;
      r.openedAt = now - t[0]; r.editedAt = t[1] == null ? null : now - t[1];
      if (r.export) { r.export.at = now - t[1] + 20e3; for (const e of r.exportLog || []) e.at = r.export.at; }
    }
    await p.Store.saveDocs(S.docs);
  }, SC.docs);
  return marks;
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
