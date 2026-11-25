// Shared helpers for the README image scripts. Run them through render.sh.
// Privacy: everything runs against a sandbox "home" folder (FAKE_HOME) filled with made-up documents.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "out");
const RAW = path.join(OUT, "raw");
const IMAGES = path.join(ROOT, "docs", "images");
const URL_APP = process.env.PDFE_URL || "http://localhost:4320/?desktop=1";
const MARK = ".pdfe-fake-home";

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
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: "light", locale: "ko-KR", timezoneId: "Asia/Seoul" });
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

// Build the sandbox: library (signature, seal photo, company seal, date stamp) and a 보관함 with documents in several states.
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
  await page.evaluate(async () => {
    const S = window.__pdfe.S; const a = [...S.assets.values()].find((x) => x.kind === "draw" && !x.sample);
    a.name = "내 서명"; await window.__pdfe.addToLibrary(a);
  });

  // 2) seal photo (off-white paper -> background removal), company seal, date stamp
  await page.evaluate(async () => {
    const s = window.__seed;
    await s.addImageAsset(s.companySeal(), "회사 직인");
    await s.addImageAsset(s.sealPhoto(), "홍길동 도장");
  });
  await page.locator('#home .add-btn[data-add="text"]').click();
  await sleep(300);
  await page.locator("#txt-input").fill("2026. 11. 25.");
  await page.locator("#txt-input").dispatchEvent("input");
  await sleep(500);
  if (shots?.text) await shots.text();
  await page.locator("#txt-save").click();
  await sleep(400);
  await page.evaluate(async () => {
    const S = window.__pdfe.S; const a = [...S.assets.values()].find((x) => x.kind === "text" && !x.sample);
    if (a) { a.name = "오늘 날짜"; await window.__pdfe.addToLibrary(a); }
  });
  // library order: signature first, then seal, company seal, date
  await page.evaluate(async () => {
    const S = window.__pdfe.S; const now = Date.now(); const order = ["내 서명", "홍길동 도장", "회사 직인", "오늘 날짜"];
    for (const a of S.assets.values()) if (!a.sample) { const i = order.indexOf(a.name); a.lastUsed = now - (i < 0 ? 9 : i) * 1000; await window.__pdfe.addToLibrary(a); }
  });

  // 3) documents
  const marks = await page.evaluate(async ({ keepMainClean }) => {
    const p = window.__pdfe, s = window.__seed, S = p.S;
    const id = (name) => [...S.assets.values()].find((a) => a.name === name && !a.sample).id;
    const SIG = id("내 서명"), SEAL = id("홍길동 도장"), CORP = id("회사 직인");
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

    // 위임장: opened, nothing placed yet
    await s.createDoc("proxy", "~/Downloads/위임장.pdf"); await s.openPath("~/Downloads/위임장.pdf");
    // 임대차계약서: signed + saved, then the saved file was deleted in Finder
    let m = await s.createDoc("lease", "~/Documents/임대차계약서.pdf"); await s.openPath("~/Documents/임대차계약서.pdf");
    sign(m[1]); await save("임대차계약서_서명.pdf");
    // 재직증명서: company seal, saved
    await s.createDoc("employ", "~/Documents/재직증명서.pdf"); await s.openPath("~/Documents/재직증명서.pdf");
    place(CORP, 0, 470, 655, 62, 62, 0); await save("재직증명서_서명.pdf");
    // 비밀유지서약서: signed + saved, then the original was edited outside the app
    m = await s.createDoc("nda", "~/Desktop/비밀유지서약서.pdf"); await s.openPath("~/Desktop/비밀유지서약서.pdf");
    sign(m[0]); await save("비밀유지서약서_서명.pdf");
    // 견적서: stamped, not saved yet
    await s.createDoc("quote", "~/Downloads/견적서_라온스튜디오.pdf"); await s.openPath("~/Downloads/견적서_라온스튜디오.pdf");
    place(SEAL, 0, 360, 676, 46, 46, 352);
    // 용역계약서: the main document
    m = await s.createDoc("contract", "~/Documents/용역계약서_가나다.pdf"); await s.openPath("~/Documents/용역계약서_가나다.pdf");
    out.contract = m;
    const d = await window.claude.use("desktop"); for (const f of ["~/Documents/2025 정산", "~/Documents/견적서 모음"]) await d.fs.mkdir(f, { recursive: true });
    if (!keepMainClean) sign(m[1]);
    return out;
  }, { keepMainClean });
  await sleep(600);

  // outside-the-app changes (what Finder would do)
  const h = fakeHome();
  fs.rmSync(path.join(h, "Documents", "임대차계약서_서명.pdf"));
  await page.evaluate(async () => {
    // rewrite the original NDA with a visibly different version
    const s = window.__seed;
    const pages = [{ title: "비밀 유지 서약서", lines: ["본인은 가나다 주식회사와의 프로젝트를 하면서 알게 된 정보를", "다음과 같이 지킬 것을 서약합니다.", "", "1. 업무로 알게 된 정보를 회사 허락 없이 외부에 알리지 않습니다.", "2. 프로젝트가 끝나면 받은 자료를 돌려주거나 지웁니다.", "3. 이 서약은 프로젝트 종료 후 3년 동안 유효합니다.", ""], signers: [["서약자", "라온스튜디오", "대표  홍 길 동"]] }];
    const { bytes } = await s.makePdf(pages, 1);
    await new Promise((r) => setTimeout(r, 1600)); // newer mtime
    await s.writeHome("~/Desktop/비밀유지서약서.pdf", bytes);
  });

  // believable times in the list
  await page.evaluate(async () => {
    const p = window.__pdfe, S = p.S, now = Date.now(), min = 60e3, hr = 3600e3, day = 86400e3;
    const T = { "용역계약서_가나다.pdf": [2 * min, 1 * min], "견적서_라온스튜디오.pdf": [2 * hr, 2 * hr - 4 * min], "비밀유지서약서.pdf": [day + 3 * hr, day + 3 * hr], "재직증명서.pdf": [3 * day, 3 * day], "임대차계약서.pdf": [5 * day, 5 * day], "위임장.pdf": [8 * day, null] };
    for (const r of S.docs) {
      const t = T[r.name]; if (!t) continue;
      r.openedAt = now - t[0]; r.editedAt = t[1] == null ? null : now - t[1];
      if (r.export) { r.export.at = now - t[1] + 20e3; for (const e of r.exportLog || []) e.at = r.export.at; }
    }
    await p.Store.saveDocs(S.docs);
  });
  return marks;
}

async function shot(page, name, { clip, keepToasts = false } = {}) {
  fs.mkdirSync(RAW, { recursive: true });
  if (!keepToasts) await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach((t) => t.remove()));
  const file = path.join(RAW, name + ".png");
  await page.screenshot({ path: file, clip });
  return file;
}

module.exports = { ROOT, OUT, RAW, IMAGES, fakeHome, wipeFakeHome, launch, newPage, openApp, seed, drawSignature, shot, sleep };
