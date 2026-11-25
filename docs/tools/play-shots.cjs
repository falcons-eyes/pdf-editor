// Google Play listing graphics from the real app UI in its Android mode (the dev server's &os=android&mobile=1 shim:
// touch layout, bottom sheet, Files-app wording), framed with a caption on the Sealworks navy background.
//   docs/tools/render.sh play          (both languages; starts the dev server on a throwaway fake home)
//   node play-shots.cjs en|ko          (with FAKE_HOME and PDFE_URL set the way render.sh sets them)
// Writes mobile/store/play/ (sizes are what the listing was set up with; 24-bit PNG, no alpha):
//   phone-<l>-1-editor   1080x1920  the lease with signature, stamp, 간인 and date (en: signature, initials, date)
//   phone-<l>-2-library             the Library with the example gallery open
//   phone-<l>-3-draw                drawing a signature with a finger
//   phone-<l>-4-seal                the save dialog with "Seal and save" on, for the signed settlement agreement
//   phone-<l>-5-verify              Verify seal on that saved agreement: "Seal intact"
//   tablet-<l>-1-editor  1440x2560  the school form with check marks, signature and date
//   tablet-<l>-2-library            the Library with the example gallery open
//   tablet-<l>-3-seal               the save dialog with "Seal and save" on
//   feature-<l>          1024x500   the app icon (docs/brand/sealworks-icon.svg), name, line, and the phone editor shot
// Raw captures go to docs/tools/out/play-<l>/. Documents are the app's own examples (lib.cjs seed()); all names made up.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { ROOT, OUT, LANG, SC, URL_APP, base, wipeFakeHome, launch, officeTimezone, openApp, seed, drawSignature, sleep } = require("./lib.cjs");

const DEST = path.join(ROOT, "mobile", "store", "play");
const RAW = path.join(OUT, "play-" + LANG);
const APP = (() => { const u = new URL(URL_APP); for (const [k, v] of [["desktop", "1"], ["standalone", "1"], ["sandboxed", "1"], ["os", "android"], ["mobile", "1"]]) u.searchParams.set(k, v); return u.href; })();
const DPR = 3;
// CSS viewports chosen so the capture fills the frame's screen exactly (see FRAME): a 412 pt wide phone, an 800 pt tablet
const PHONE = { width: 412, height: 797 }, TABLET = { width: 800, height: 1280 };
// canvas, caption box, device body and screen (px of the output image)
const FRAME = {
  phone: { W: 1080, H: 1920, pad: 80, top: 150, h1: 72, sub: 38, dev: { x: 130, y: 380, w: 820, h: 1640, r: 66, bezel: 16 } },
  tablet: { W: 1440, H: 2560, pad: 112, top: 190, h1: 92, sub: 46, dev: { x: 112, y: 500, w: 1216, h: 1924, r: 72, bezel: 18 } },
};

// Captions: Korean in 해요체, one short sentence each, no Hanja; English mirrors it.
const TXT = {
  ko: {
    phone: {
      "1-editor": ["출력 없이 계약서에 서명해요", "서명과 도장을 놓고 쪽마다 간인도 찍어요"],
      "2-library": ["예시로 바로 해 봐요", "월세 계약서부터 학교 동의서까지 눌러서 열어 보세요"],
      "3-draw": ["손가락으로 서명을 그려요", "한 번 그려 두면 다음 문서에도 바로 써요"],
      "4-seal": ["보내기 전에 봉인해요", "봉인한 뒤 누가 고치면 바로 드러나요"],
      "5-verify": ["받은 그대로인지 확인해요", "봉인 확인을 누르면 몇 초 만에 알 수 있어요"],
    },
    tablet: {
      "1-editor": ["동의서에 체크하고 서명해요", "사진 찍어 보내지 말고 깔끔하게 보내요"],
      "2-library": ["보관함에서 이어서 작업해요", "비슷한 상황의 예시도 바로 열어 볼 수 있어요"],
      "3-seal": ["보내기 전에 봉인해요", "봉인한 뒤 누가 고치면 바로 드러나요"],
    },
    feature: ["PDF에 서명하고 봉인까지 해요", "계정 없이 내 기기 안에서만 처리해요"],
  },
  en: {
    phone: {
      "1-editor": ["Sign a lease, no printer", "Add your signature and initial every page."],
      "2-library": ["Start from an example", "From leases to school forms, open one and try it."],
      "3-draw": ["Draw your signature", "Draw it once and reuse it on the next document."],
      "4-seal": ["Seal it before you send it", "If anyone edits it later, it shows right away."],
      "5-verify": ["Check it's what you sent", "Verify seal tells you in seconds."],
    },
    tablet: {
      "1-editor": ["Tick and sign the school form", "No more phone photos of a paper form."],
      "2-library": ["Pick up where you left off", "Or open an example that looks like your situation."],
      "3-seal": ["Seal it before you send it", "If anyone edits it later, it shows right away."],
    },
    feature: ["Sign, stamp and seal PDFs", "No account. Your files stay on your device."],
  },
}[LANG];

// ---------- capture ----------
async function capture(page, name) {
  await page.evaluate(() => { document.querySelectorAll("#toasts .toast").forEach((t) => t.remove()); document.activeElement?.blur?.(); });
  await sleep(200);
  fs.mkdirSync(RAW, { recursive: true });
  const file = path.join(RAW, name + ".png");
  await page.screenshot({ path: file });
  return file;
}

async function shoot(browser) {
  wipeFakeHome();
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, colorScheme: "light",
    locale: LANG === "ko" ? "ko-KR" : "en-US", timezoneId: officeTimezone() });
  await ctx.addInitScript((l) => { try { localStorage.setItem("pdfe.lang", l); } catch {} }, LANG);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.warn("[pageerror]", e.message));
  await openApp(page, APP);
  if (!(await page.evaluate(() => document.documentElement.classList.contains("is-android")))) throw new Error("the page is not in its Android mode");
  await seed(page);
  // no sealer identity yet: the first "Seal and save" asks for the name (on a phone the dialog's one-line
  // "Sealed by … Manage…" row for an existing identity is wider than the screen)

  const P = (fn, arg) => page.evaluate(fn, arg);
  const openDoc = async (name) => {
    await P(() => window.__pdfe.closeSheet(false));
    await P((n) => window.__pdfe.openRecord(window.__pdfe.S.docs.find((d) => d.name === n)), name); await sleep(1400);
  };
  // put page i's point at fraction f of its height in the middle of the visible stage
  const scrollTo = (i, f) => P(([i, f]) => {
    const S = window.__pdfe.S, st = document.querySelector("#stage"), p = S.pages[i];
    st.scrollTop = p.el.offsetTop + p.el.offsetHeight * f - st.clientHeight / 2;
  }, [i, f]);
  const fitWidth = async () => { // the bottom bar's fit button toggles between page and width
    await P(() => { if (window.__pdfe.S.fit !== "width") document.querySelector("#bb-fit").click(); window.__pdfe.select(null); }); await sleep(800);
  };
  const closeDialogs = () => P(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
  // the Library with the example gallery open; scrolled so the last document card starts at the top (phone),
  // or from the top (tablet, where documents and gallery fit)
  const library = async (fromLastDoc) => {
    await page.mouse.move(0, 0); // no hover left on a card by an earlier click
    await P(() => { window.__pdfe.closeSheet(false); window.__pdfe.showHome(); }); await sleep(1200);
    await P(() => { const b = document.querySelector("#ex-toggle"); if (b && b.getAttribute("aria-expanded") === "false") b.click(); });
    await sleep(500);
    await P((fromLastDoc) => {
      const sc = document.querySelector("#home-main"); sc.scrollTop = 0;
      const t = document.querySelector("#doc-list > :last-child");
      if (fromLastDoc && t) sc.scrollTop = t.getBoundingClientRect().top - sc.getBoundingClientRect().top - 12;
    }, fromLastDoc);
    await sleep(600);
  };
  const D = SC.docs, shots = {};

  // phone 1: the lease, page 2 in view (signatures and stamps, 간인 or initials on the page edge, date)
  // a little closer than fit-width, the page's left edge (where the 간인 sits) kept in view
  await openDoc(base(D.lease)); await fitWidth();
  await P(() => window.__pdfe.setZoom(window.__pdfe.S.zoom * 1.22)); await sleep(800);
  await scrollTo(1, 0.3);
  await P(() => { const st = document.querySelector("#stage"), p = window.__pdfe.S.pages[1].el; st.scrollLeft = p.offsetLeft - 6; });
  await sleep(700);
  shots["phone-1-editor"] = await capture(page, "phone-1-editor");

  // phone 3: drawing a signature with a finger, over the agreement (cancelled afterwards)
  await openDoc(base(D.agreement)); await fitWidth();
  await P(() => window.__pdfe.openSheet("editor", "lib")); await sleep(600);
  await page.locator('#main .add-btn[data-add="draw"]').click(); await sleep(600);
  await drawSignature(page); await sleep(300);
  shots["phone-3-draw"] = await capture(page, "phone-3-draw");
  await closeDialogs(); await P(() => window.__pdfe.closeSheet(false)); await sleep(400);

  // phone 4: the save dialog for the agreement, "Seal and save" on
  await scrollTo(0, 0.5); await sleep(300);
  await P(() => { window.__pdfe.S.prefs.sealOnSave = true; });
  await P(() => window.__pdfe.openSaveDialog()); await sleep(1000);
  await page.locator("#save-seal-name").fill(SC.sealer.name);
  await page.locator("#save-seal-org").fill(SC.sealer.org);
  await P(() => { const d = document.querySelector("dialog[open] .dlg-body"); if (d) d.scrollLeft = 0; }); await sleep(300);
  shots["phone-4-seal"] = await capture(page, "phone-4-seal");

  // tablet 3: the same dialog on a tablet
  await page.setViewportSize(TABLET); await sleep(1200);
  shots["tablet-3-seal"] = await capture(page, "tablet-3-seal");
  // save it (the Files app's save panel answers with ~/Documents/<name>)
  await page.locator("#save-ok").click(); await sleep(2000);
  const sealed = await P(() => !!window.__pdfeLastExport && window.__pdfe.S.rec?.export?.sealed != null);
  if (!sealed) console.warn(`${LANG}: the agreement may not have been sealed`);

  // tablet 1: the school form (check marks, signature, date)
  await openDoc(base(D.school)); await fitWidth();
  await scrollTo(0, 0.5); await sleep(700);
  shots["tablet-1-editor"] = await capture(page, "tablet-1-editor");

  // tablet 2: the Library, example gallery open
  await library(false);
  shots["tablet-2-library"] = await capture(page, "tablet-2-library");

  // phone 2: the Library on the phone
  await page.setViewportSize(PHONE); await sleep(1200);
  await library(true);
  shots["phone-2-library"] = await capture(page, "phone-2-library");

  // phone 5: Verify seal on the saved agreement
  await P(async () => {
    const x = window.__pdfe, r = x.S.docs.find((d) => d.export?.sealed);
    x.openVerify();
    await x.verifyBytes(new Uint8Array(window.__pdfeLastExport), r.export.path.slice(r.export.path.lastIndexOf("/") + 1));
  });
  await sleep(800);
  shots["phone-5-verify"] = await capture(page, "phone-5-verify");
  await ctx.close();
  return shots;
}

// ---------- compose ----------
const FONTS = (() => {
  for (const d of ["desktop", "mobile"]) {
    const p = path.join(ROOT, d, "node_modules", "@fontsource", "ibm-plex-sans-kr");
    if (fs.existsSync(path.join(p, "700.css"))) return ["400", "500", "700"].map((w) => `<link rel="stylesheet" href="file://${p}/${w}.css">`).join("");
  }
  return '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&display=block">';
})();
const ICON = "file://" + path.join(ROOT, "docs", "brand", "sealworks-icon.svg");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const BG = "linear-gradient(168deg, #22328a 0%, #18246a 42%, #0e1540 100%)";
const BASE_CSS = `* { box-sizing: border-box; margin: 0; } html, body { background: #0e1540; }
body { font-family: "IBM Plex Sans KR", "Apple SD Gothic Neo", sans-serif; -webkit-font-smoothing: antialiased; word-break: keep-all; }
.c { position: relative; overflow: hidden; background: ${BG}; }
.c::before { content: ""; position: absolute; inset: 0; background: radial-gradient(1200px 700px at 20% -10%, rgba(120,150,255,.22), transparent 60%); }
h1 { position: relative; color: #fff; font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; white-space: nowrap; }
p.sub { position: relative; color: #c6cff3; font-weight: 400; line-height: 1.35; white-space: nowrap; }
.dev { position: absolute; background: #0a0e1e; box-shadow: 0 0 0 2px #2b3570 inset, 0 40px 90px rgba(3, 6, 24, .55); }
.scr { position: absolute; overflow: hidden; background: #fff; }
.scr img { display: block; width: 100%; }`;
// shrink a caption line until it fits its width
const FIT = `<script>document.fonts.ready.then(() => { for (const e of document.querySelectorAll("[data-fit]")) { let s = parseFloat(getComputedStyle(e).fontSize); while (e.scrollWidth > e.clientWidth && s > 10) e.style.fontSize = (s -= 1) + "px"; } document.body.dataset.ready = 1; });</script>`;

function framed(kind, img, [h1, sub]) {
  const F = FRAME[kind], d = F.dev, sw = d.w - 2 * d.bezel;
  return { W: F.W, H: F.H, html: `<div class="c" style="width:${F.W}px;height:${F.H}px">
  <h1 data-fit style="margin:${F.top}px ${F.pad}px 0;font-size:${F.h1}px;overflow:hidden">${esc(h1)}</h1>
  <p class="sub" data-fit style="margin:${Math.round(F.h1 * 0.36)}px ${F.pad}px 0;font-size:${F.sub}px;overflow:hidden">${esc(sub)}</p>
  <div class="dev" style="left:${d.x}px;top:${d.y}px;width:${d.w}px;height:${d.h}px;border-radius:${d.r}px"></div>
  <div class="scr" style="left:${d.x + d.bezel}px;top:${d.y + d.bezel}px;width:${sw}px;height:${d.h - 2 * d.bezel}px;border-radius:${d.r - d.bezel}px"><img src="${img}"></div>
</div>` };
}

function feature(img, [line, sub]) {
  return { W: 1024, H: 500, html: `<div class="c" style="width:1024px;height:500px">
  <img src="${ICON}" style="position:absolute;left:72px;top:92px;width:124px;height:124px;filter:drop-shadow(0 12px 24px rgba(0,0,0,.35))">
  <h1 style="position:absolute;left:72px;top:236px;font-size:72px;line-height:1;letter-spacing:-0.02em">Sealworks</h1>
  <p class="sub" data-fit style="position:absolute;left:72px;top:330px;width:520px;font-size:32px;color:#fff;font-weight:500;overflow:hidden">${esc(line)}</p>
  <p class="sub" data-fit style="position:absolute;left:72px;top:384px;width:520px;font-size:21px;overflow:hidden">${esc(sub)}</p>
  <div style="position:absolute;left:640px;top:58px;width:336px;height:640px;transform:rotate(-7deg);transform-origin:50% 0">
    <div class="dev" style="left:0;top:0;width:336px;height:640px;border-radius:40px"></div>
    <div class="scr" style="left:10px;top:10px;width:316px;height:620px;border-radius:30px"><img src="${img}"></div>
  </div>
</div>` };
}

async function render(browser, spec, dest, scale = 1) {
  fs.mkdirSync(RAW, { recursive: true });
  const html = path.join(RAW, path.basename(dest, ".png") + ".html");
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8">${FONTS}<style>${BASE_CSS}</style><body>${spec.html}${FIT}</body>`);
  const ctx = await browser.newContext({ viewport: { width: spec.W, height: spec.H }, deviceScaleFactor: scale });
  const p = await ctx.newPage();
  await p.goto("file://" + html, { waitUntil: "networkidle" });
  await p.waitForFunction(() => document.body.dataset.ready === "1");
  const ok = await p.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, "") === "IBM Plex Sans KR" && f.status === "loaded"));
  if (!ok) throw new Error("IBM Plex Sans KR did not load for the captions");
  await p.waitForTimeout(200);
  const png = await p.locator(".c").screenshot();
  await ctx.close();
  await sharp(png).resize(spec.W, spec.H, { kernel: "lanczos3" }).flatten({ background: "#0e1540" }).removeAlpha().toColorspace("srgb").png({ compressionLevel: 9 }).toFile(dest);
  const m = await sharp(dest).metadata();
  if (m.width !== spec.W || m.height !== spec.H || m.hasAlpha) throw new Error(`${dest}: ${m.width}x${m.height} alpha ${m.hasAlpha}`);
  console.log(`${path.relative(ROOT, dest)}  ${m.width}x${m.height}  ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`);
}

// the raw capture scaled to the frame's screen width (Lanczos), as a file the caption page can load
async function screenImage(file, width) {
  const out = file.replace(/\.png$/, `.${width}.png`);
  await sharp(file).resize({ width, kernel: "lanczos3" }).png().toFile(out);
  return "file://" + out;
}

(async () => {
  fs.mkdirSync(DEST, { recursive: true });
  const browser = await launch();
  const shots = process.argv.includes("--compose-only")
    ? Object.fromEntries(fs.readdirSync(RAW).filter((f) => /^(phone|tablet)-\d-[a-z]+\.png$/.test(f)).map((f) => [f.slice(0, -4), path.join(RAW, f)]))
    : await shoot(browser);
  for (const [key, file] of Object.entries(shots)) {
    const [kind, ...rest] = key.split("-"), scene = rest.join("-");
    const F = FRAME[kind], img = await screenImage(file, F.dev.w - 2 * F.dev.bezel);
    await render(browser, framed(kind, img, TXT[kind][scene]), path.join(DEST, `${kind}-${LANG}-${scene}.png`));
  }
  await render(browser, feature(await screenImage(shots["phone-1-editor"], 316 * 2), TXT.feature), path.join(DEST, `feature-${LANG}.png`), 2);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
