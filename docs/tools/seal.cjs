// Records the seal clip (about 17 s), the agreement scenario of docs/design/scenarios.md:
//   the signed settlement agreement -> Save as file with "Seal and save" -> Verify seal on the saved file: "Seal intact"
//   -> the copy that came back edited (bytes added after sealing, what a re-save in another app does): "Modified after sealing".
//   node seal.cjs en|ko
// Writes docs/images/seal-<lang>.gif (README) and site/assets/seal-<lang>.mp4 + seal-<lang>-poster.webp (website).
const fs = require("fs");
const path = require("path");
const { ROOT, IMAGES, LANG, SC, base, signedPath, fakeHome, wipeFakeHome, launch, newPage, openApp, seed, makeSealer, appendToFile, sleep } = require("./lib.cjs");
const { recorder, toGif, toMp4 } = require("./rec.cjs");

const CAP = {
  ko: ["서명한 합의서는 봉인해서 저장하고", "돌려받은 파일은 봉인 확인으로 열어 봐요", "누가 고쳤다면 바로 드러나요"],
  en: ["Seal the signed agreement as you save it", "Open the copy you get back in Verify seal", "If anyone changed it, it shows"],
}[LANG];
const RETURNED = { ko: "~/Downloads/합의서_돌려받음.pdf", en: "~/Downloads/Settlement_Agreement_returned.pdf" }[LANG];
const VW = 1280, VH = 800;

(async () => {
  wipeFakeHome();
  const browser = await launch();
  const page = await newPage(browser, { width: VW, height: VH });
  await openApp(page);
  await seed(page);
  await makeSealer(page); // made earlier, like a user who has sealed before
  const name = base(SC.docs.agreement), saved = signedPath(SC.docs.agreement);
  await page.evaluate(async (name) => {
    const p = window.__pdfe, S = p.S; S.prefs.sealOnSave = false;
    await p.openRecord(S.docs.find((d) => d.name === name));
    await new Promise((r) => setTimeout(r, 900));
    p.select(null); p.setZoom(1.1);
    const st = document.querySelector("#stage"), pg = S.pages[0]; st.scrollTop = pg.el.offsetTop + pg.el.offsetHeight * 0.62 - st.clientHeight / 2;
  }, name);
  await sleep(1000);
  await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach((t) => t.remove()));

  const R = await recorder(page, "seal-" + LANG);
  await R.start(); await sleep(700);

  // 1) Save as file with "Seal and save"
  await R.caption(CAP[0]);
  await R.clickSel("#btn-export", 700);
  await sleep(800);
  await R.clickSel("#save-seal", 600);
  await sleep(700);
  await R.clickSel("#save-ok", 550);
  await sleep(1900); // "Sealed and saved"

  // the copy that comes back: the sealed file, changed afterwards in another app
  const h = fakeHome();
  fs.copyFileSync(path.join(h, saved.slice(2)), path.join(h, RETURNED.slice(2)));
  await appendToFile(page, RETURNED);

  // 2) Verify seal on the saved file -> intact
  await R.caption(CAP[1], { top: true });
  await R.clickSel("#btn-verify", 650);
  await sleep(600);
  const pick = async (p) => {
    await page.evaluate((p) => { window.__shimDialogNext = [p]; }, p); await R.clickSel("#v-pick", 550);
    await sleep(200); await R.glide(VW * 0.86, VH * 0.82, 500); // out of the way of the result
  };
  await pick(saved);
  await sleep(1600); const posterWall = Date.now() / 1000; await sleep(800);

  // 3) the edited copy -> modified after sealing
  await R.caption(CAP[2], { top: true });
  await pick(RETURNED);
  await sleep(3000);
  await R.caption("");
  await sleep(600);

  const frames = await R.stop();
  await browser.close();
  toGif(frames, "seal-" + LANG, path.join(IMAGES, `seal-${LANG}.gif`), { maxS: 18, fps: 12, colors: 160, width: 960 });
  await toMp4(frames, "seal-" + LANG, path.join(ROOT, "site", "assets", `seal-${LANG}.mp4`), { maxS: 18,
    poster: path.join(ROOT, "site", "assets", `seal-${LANG}-poster.webp`), posterWall });
})().catch((e) => { console.error(e); process.exit(1); });
