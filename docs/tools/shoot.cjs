// Seeds the sandbox and saves raw 1440x900@2x screenshots of real app states to docs/tools/out/raw-<lang>/.
//   node shoot.cjs en|ko
// Also writes rects.json there: where dialogs and panels were on screen (CSS px), so compose.cjs can crop them.
const fs = require("fs");
const path = require("path");
const { RAW, LANG, SC, signedPath, base, wipeFakeHome, launch, newPage, openApp, seed, makeSealer, appendToFile, verifyPath, shot, sleep } = require("./lib.cjs");

(async () => {
  wipeFakeHome();
  fs.rmSync(RAW, { recursive: true, force: true });
  const browser = await launch();
  const page = await newPage(browser);
  await openApp(page);
  const rects = {};
  const rect = async (name, sel) => { const b = await page.locator(sel).first().boundingBox(); rects[name] = b && [b.x, b.y, b.width, b.height].map(Math.round); return rects[name]; };

  await seed(page, {
    shots: {
      pad: async () => { await rect("pad", "#dlg-draw"); await shot(page, "pad"); },
      text: async () => { await rect("text", "#dlg-text"); await shot(page, "text-dialog"); },
    },
  });
  await makeSealer(page);

  const P = (fn, arg) => page.evaluate(fn, arg);
  const scrollTo = (pageIdx, frac) => P(([i, f]) => {
    const S = window.__pdfe.S, st = document.querySelector("#stage"), p = S.pages[i];
    st.scrollTop = p.el.offsetTop + p.el.offsetHeight * f - st.clientHeight / 2;
  }, [pageIdx, frac]);
  const openDoc = async (name) => { await P((n) => window.__pdfe.openRecord(window.__pdfe.S.docs.find((d) => d.name === n)), name); await sleep(1200); };
  const selectAsset = (name) => P((n) => { const S = window.__pdfe.S; const o = S.overlays.find((x) => S.assets.get(x.assetId)?.name === n); window.__pdfe.select(o ? o.id : null); }, name);
  const closeDialogs = () => P(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
  const contract = SC.docs.contract, saved = signedPath(contract);

  // home with several documents
  await P(() => window.__pdfe.showHome()); await sleep(1500);
  await rect("openBtn", "#btn-open"); await rect("docList", "#doc-list"); await rect("langSw", "#lang-sw"); await rect("status", "footer.status");
  await shot(page, "home");

  // main contract, signed (hero)
  await openDoc(base(contract));
  await P(() => window.__pdfe.setZoom(1.2)); await sleep(500);
  await scrollTo(1, 0.5); await sleep(600);
  await selectAsset(SC.seal); await sleep(500);
  await rect("lib", "#lib"); await rect("verifyBtn", "#btn-verify"); await rect("exportBtn", "#btn-export");
  await shot(page, "editor-signed");
  await selectAsset(SC.sig); await sleep(500);
  await shot(page, "editor-signed-sig");

  // the same screen in the other language (for the language-switch tile), then back
  const other = LANG === "ko" ? "en" : "ko";
  await selectAsset(SC.seal); await sleep(200);
  await P((l) => window.__pdfe.setLang(l), other); await sleep(900);
  await shot(page, "editor-other");
  await P((l) => window.__pdfe.setLang(l), LANG); await sleep(900);

  // save dialog with "Seal and save" on (step 3) and the saved toast
  await P(() => { window.__pdfe.S.prefs.sealOnSave = true; });
  await P(() => window.__pdfe.openSaveDialog()); await sleep(800);
  await rect("save", "#dlg-save"); await rect("sealOpt", "#save-seal-wrap");
  await shot(page, "save-dialog");
  await page.locator("#save-ok").click(); await sleep(1400);
  await rect("toast", "#toasts .toast");
  await shot(page, "saved-toast", { keepToasts: true });
  await sleep(3500);

  // Verify seal: intact, modified after sealing, not sealed
  await verifyPath(page, saved);
  await rect("verify", "#dlg-verify"); await rect("vresIntact", "#v-result"); await rect("vstatIntact", "#v-result .v-status"); await rect("vsigIntact", "#v-result .v-sig");
  await shot(page, "verify-intact");
  // the same file, changed afterwards (bytes appended, like a re-save in another app), then put back as it was
  const keep = await page.evaluate(async (p) => { const d = await window.claude.use("desktop"); window.__keep = new Uint8Array(await d.fs.readFile(p)); return window.__keep.length; }, saved);
  await appendToFile(page, saved);
  await verifyPath(page, saved);
  await rect("verifyModified", "#dlg-verify"); await rect("vresModified", "#v-result"); await rect("vstatModified", "#v-result .v-status");
  await shot(page, "verify-modified");
  await page.evaluate(async (p) => { const d = await window.claude.use("desktop"); await d.fs.writeFile(p, window.__keep); }, saved);
  await verifyPath(page, contract);
  await rect("verifyNone", "#dlg-verify"); await rect("vresNone", "#v-result"); await rect("vstatNone", "#v-result .v-status");
  await shot(page, "verify-none");
  await closeDialogs();
  await sleep(400);

  // seal photo: background removal on/off (quote)
  await openDoc(base(SC.docs.quote));
  await scrollTo(0, 0.72); await sleep(300);
  await selectAsset(SC.seal); await sleep(400);
  await P(() => { const S = window.__pdfe.S; const o = S.overlays.find((x) => x.id === S.sel); window.__pdfe.act(() => { o.w = 74; o.h = 74; o.x -= 14; o.y -= 14; o.fx.removeBg = false; }); }); await sleep(700);
  rects.sealBg = await P(() => { const S = window.__pdfe.S; const r = document.querySelector(`.ov[data-id="${S.sel}"]`).getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); });
  await shot(page, "seal-bg-off");
  await P(() => { const S = window.__pdfe.S; const o = S.overlays.find((x) => x.id === S.sel); window.__pdfe.act(() => { o.fx.removeBg = true; }); }); await sleep(900);
  await shot(page, "seal-bg-on");
  await P(() => window.__pdfe.undo()); await P(() => window.__pdfe.undo()); await sleep(300);

  // original changed outside the app (NDA)
  await P(() => window.__pdfe.showHome()); await sleep(1200);
  await openDoc(base(SC.docs.nda)); await sleep(800);
  await shot(page, "source-changed");

  await P(() => window.__pdfe.showHome()); await sleep(1500);
  await shot(page, "home-final");

  fs.writeFileSync(path.join(RAW, "rects.json"), JSON.stringify(rects, null, 1));
  await browser.close();
  console.log(`raw shots (${LANG}) done`);
})().catch((e) => { console.error(e); process.exit(1); });
