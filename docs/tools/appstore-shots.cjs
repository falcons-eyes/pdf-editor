// Mac App Store screenshots from the real app UI: 2880x1800 PNG (1440x900 @2x, 16:10), sRGB, no alpha channel.
//   node appstore-shots.cjs en|ko        (run through `render.sh appstore`, which starts the dev server and fake home)
// Writes docs/appstore/screenshots/<lang>/01-editor.png … 05-verify-seal.png:
//   01 editor: contract with signature on the signing line and a stamp, right panel with signatures & stamps
//   02 draw signature pad with a drawn signature
//   03 Library with documents in several states (saved, not saved, needs a look)
//   04 save dialog with "Seal and save" on and the _signed / _서명 file name
//   05 Verify seal: "Seal intact" (Your seal, Certified)
// The app window fills the frame; the macOS traffic lights are drawn where the page leaves room for them (18,19).
// No captions, no device frame. Only made-up people, companies and files (lib.cjs SCENARIOS).
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { ROOT, LANG, SC, signedPath, base, wipeFakeHome, launch, openApp, seed, makeSealer, verifyPath, drawSignature, sleep } = require("./lib.cjs");

const OUT_DIR = path.join(ROOT, "docs", "appstore", "screenshots", LANG);
const W = 1440, H = 900, SCALE = 2;

// macOS window buttons (close, minimize, zoom) at the position desktop/src/main.js sets (trafficLightPosition 18,19)
const LIGHTS = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${H * SCALE}" viewBox="0 0 ${W} ${H}">
  ${["#ff5f57", "#febc2e", "#28c840"].map((c, i) => `<circle cx="${18 + 6 + i * 20}" cy="${19 + 6}" r="6" fill="${c}"/>
  <circle cx="${18 + 6 + i * 20}" cy="${19 + 6}" r="5.75" fill="none" stroke="rgba(0,0,0,.18)" stroke-width=".5"/>`).join("")}
</svg>`);

function pickTimezone() {
  if (LANG !== "en") return "Asia/Seoul";
  const now = new Date();
  const parts = (tz) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map((p) => [p.type, p.value]));
  const ny = parts("America/New_York");
  if (+ny.hour >= 9 && +ny.hour <= 17) return "America/New_York";
  const day = `${ny.year}-${ny.month}-${ny.day}`;
  let best = null;
  for (let off = -12; off <= 14; off++) {
    const tz = off === 0 ? "Etc/GMT" : `Etc/GMT${off > 0 ? "-" : "+"}${Math.abs(off)}`; // Etc/GMT-3 is UTC+3
    const p = parts(tz);
    if (`${p.year}-${p.month}-${p.day}` !== day || +p.hour < 9 || +p.hour > 17) continue;
    if (!best || Math.abs(+p.hour - 10) < Math.abs(best.h - 10)) best = { tz, h: +p.hour };
  }
  return best ? best.tz : "America/New_York";
}

async function save(page, name) {
  await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach((t) => t.remove()));
  await sleep(150);
  const png = await page.screenshot({ type: "png" });
  const file = path.join(OUT_DIR, name + ".png");
  // flatten onto an opaque background and drop the alpha channel; sRGB with an embedded sRGB profile
  await sharp(png).composite([{ input: LIGHTS, top: 0, left: 0 }]).flatten({ background: "#ffffff" }).removeAlpha()
    .toColorspace("srgb").withIccProfile("srgb").png({ compressionLevel: 9 }).toFile(file);
  const m = await sharp(file).metadata();
  if (m.width !== W * SCALE || m.height !== H * SCALE || m.hasAlpha || m.channels !== 3) throw new Error(`${file}: ${m.width}x${m.height} channels ${m.channels} alpha ${m.hasAlpha}`);
  console.log(`${LANG}/${name}.png  ${m.width}x${m.height}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}

(async () => {
  wipeFakeHome();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUT_DIR)) if (/^\d\d-.*\.png$/.test(f)) fs.rmSync(path.join(OUT_DIR, f));
  const browser = await launch();
  // same as lib.cjs newPage(), but times shown in the app (e.g. "Sealed on") read as office hours whenever this runs:
  // Korean stays on Asia/Seoul; English uses America/New_York when it is daytime there, else a fixed-offset zone
  // on the same date where it is about 10 AM
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, colorScheme: "light",
    locale: LANG === "ko" ? "ko-KR" : "en-US", timezoneId: pickTimezone() });
  await ctx.addInitScript((l) => { try { localStorage.setItem("pdfe.lang", l); } catch {} }, LANG);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.warn("[pageerror]", e.message));
  await openApp(page);
  // App Store build: no link to the source repository (guideline 2.3.10 – nothing about other platforms or downloads),
  // and no Library-location box (its folder path still carries the app's old working name)
  await page.addStyleTag({ content: "#about-side .side-links a:nth-of-type(3){display:none!important} #store-info{display:none!important}" });

  await seed(page);
  await makeSealer(page);

  const P = (fn, arg) => page.evaluate(fn, arg);
  const scrollTo = (pageIdx, frac) => P(([i, f]) => {
    const S = window.__pdfe.S, st = document.querySelector("#stage"), p = S.pages[i];
    st.scrollTop = p.el.offsetTop + p.el.offsetHeight * f - st.clientHeight / 2;
  }, [pageIdx, frac]);
  const openDoc = async (name) => { await P((n) => window.__pdfe.openRecord(window.__pdfe.S.docs.find((d) => d.name === n)), name); await sleep(1200); };
  const selectAsset = (name) => P((n) => { const S = window.__pdfe.S; const o = S.overlays.find((x) => S.assets.get(x.assetId)?.name === n); window.__pdfe.select(o ? o.id : null); document.activeElement?.blur?.(); }, name);
  const closeDialogs = () => P(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
  const contract = SC.docs.contract, saved = signedPath(contract);

  // 01 editor: the signed contract, stamp selected
  await openDoc(base(contract));
  await P(() => window.__pdfe.setZoom(1.2)); await sleep(500);
  await scrollTo(1, 0.5); await sleep(600);
  // select the stamp (handles shown) unless its settings run past the bottom of the side panel; then the signature,
  // then nothing, so no control is cut off at the window's edge
  for (const name of [SC.seal, SC.sig, null]) {
    await selectAsset(name); await sleep(600);
    const fits = await P(() => { const a = [...document.querySelectorAll("aside.side")].find((x) => x.offsetParent); return a.scrollHeight <= a.clientHeight + 1; });
    if (fits) { console.log(`${LANG}: 01 selection = ${name}`); break; }
  }
  await save(page, "01-editor");

  // 02 draw signature, over the same document (cancelled afterwards, so nothing is added)
  await selectAsset(null); await sleep(200);
  await page.locator('.add-btn[data-add="draw"]:visible').first().click();
  await sleep(500);
  await drawSignature(page);
  await page.mouse.move(W / 2, H - 7); await sleep(400);
  await save(page, "02-draw-signature");
  await closeDialogs(); await sleep(400);

  // 04 save dialog with "Seal and save" on (taken before 03 so the Library shows the sealed file)
  await P(() => { window.__pdfe.S.prefs.sealOnSave = true; });
  await P(() => window.__pdfe.openSaveDialog()); await sleep(900);
  await save(page, "04-save-sealed");
  await page.locator("#save-ok").click(); await sleep(1600);

  // 05 Verify seal on the saved file
  await verifyPath(page, saved); await sleep(400);
  await page.mouse.move(W / 2, H - 7);
  await save(page, "05-verify-seal");
  await closeDialogs(); await sleep(400);

  // 03 Library with documents in several states
  await P(() => window.__pdfe.showHome()); await sleep(1500);
  await page.mouse.move(W / 2, H - 7); await sleep(300);
  await save(page, "03-library");

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
