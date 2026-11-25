// Records docs/images/seal-<lang>.gif (under 10 s): Verify seal on a sealed file -> "Seal intact";
// then the same file after a change made outside the app -> "Modified after sealing".
//   node seal.cjs en|ko
// The change is made by appending bytes to the file (what a re-save in another app does to a signed PDF).
const path = require("path");
const { IMAGES, LANG, SC, signedPath, base, wipeFakeHome, launch, newPage, openApp, seed, makeSealer, appendToFile, sleep } = require("./lib.cjs");
const { recorder, toGif } = require("./rec.cjs");

const CAPTION = {
  en: ["Later, someone changes the file in another app…", "…and Verify seal shows it."],
  ko: ["나중에 누군가 다른 앱에서 파일을 고치면…", "…‘봉인 확인’에 바로 드러납니다."],
}[LANG];

(async () => {
  wipeFakeHome();
  const browser = await launch();
  const page = await newPage(browser);
  await openApp(page);
  await seed(page);
  await makeSealer(page);
  const saved = signedPath(SC.docs.contract);
  // seal and save the signed contract, then go back to the Library
  await page.evaluate(async ([name, saved]) => {
    const p = window.__pdfe, S = p.S;
    await p.openRecord(S.docs.find((d) => d.name === name));
    await new Promise((r) => setTimeout(r, 900));
    await p.performSave(saved.slice(saved.lastIndexOf("/") + 1), saved.slice(0, saved.lastIndexOf("/")), false, { seal: true });
    p.showHome();
  }, [base(SC.docs.contract), saved]);
  await sleep(1200);
  await page.evaluate(() => { document.querySelectorAll("#toasts .toast").forEach((t) => t.remove()); window.__pdfe.openVerify(); });
  await sleep(600);

  const R = await recorder(page, "seal-" + LANG);
  await R.start(); await sleep(500);
  const pick = async () => {
    await page.evaluate((p) => { window.__shimDialogNext = [p]; }, saved); await R.clickSel("#v-pick", 550);
    await sleep(250); await R.glide(1110, 700, 500); // out of the way of the result
  };

  await pick();                       // -> Seal intact
  await sleep(2300);
  await R.caption(CAPTION[0]);
  await appendToFile(page, saved);    // the change, outside the app
  await sleep(1700);
  await R.caption(CAPTION[1]);
  await pick();                       // -> Modified after sealing
  await sleep(1200);
  await R.caption("");
  await sleep(1800);

  const frames = await R.stop();
  await browser.close();
  toGif(frames, "seal-" + LANG, path.join(IMAGES, `seal-${LANG}.gif`), { maxS: 9.8 });
})().catch((e) => { console.error(e); process.exit(1); });
