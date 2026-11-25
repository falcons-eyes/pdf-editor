// Seeds the sandbox and saves raw 1440x900@2x screenshots of real app states to docs/tools/out/raw-<lang>/,
// plus the website's hero screenshot (1280x800@2x -> site/assets/app-<lang>-{1600,960}.webp).
//   node shoot.cjs en|ko
// Also writes rects.json there: where dialogs and panels were on screen (CSS px), so compose.cjs can crop them.
const fs = require("fs");
const path = require("path");
const { ROOT, RAW, LANG, SC, signedPath, base, wipeFakeHome, launch, newPage, openApp, seed, makeSealer, appendToFile, verifyPath, shot, sleep } = require("./lib.cjs");
const sharp = require("sharp");

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

  // the lease, signed and stamped, 간인 on the page edges (en: initials on every page) (hero)
  const stamp = SC.seal || SC.sig;
  await openDoc(base(contract));
  await P(() => window.__pdfe.setZoom(1.2)); await sleep(500);
  await scrollTo(1, SC.seal ? 0.5 : 0.62); await sleep(600);
  await selectAsset(stamp); await sleep(500);
  await rect("lib", "#lib"); await rect("verifyBtn", "#btn-verify"); await rect("exportBtn", "#btn-export");
  // where the selected item and the signing spot (signature + stamp or date) are, for crops and the drawn cursor
  Object.assign(rects, await P((names) => {
    const S = window.__pdfe.S, box = (o) => document.querySelector(`.ov[data-id="${o.id}"]`).getBoundingClientRect();
    const os = S.overlays.filter((o) => !o.gan && o.page === 1 && names.includes(S.assets.get(o.assetId)?.name)).map(box);
    const x0 = Math.min(...os.map((r) => r.left)), y0 = Math.min(...os.map((r) => r.top)), x1 = Math.max(...os.map((r) => r.right)), y1 = Math.max(...os.map((r) => r.bottom));
    const sel = box(S.overlays.find((o) => o.id === S.sel));
    return { signArea: [x0, y0, x1 - x0, y1 - y0].map(Math.round), selOv: [sel.left, sel.top, sel.width, sel.height].map(Math.round) };
  }, [SC.sig, SC.seal || SC.date]));
  await shot(page, "editor-signed");
  await selectAsset(SC.sig); await sleep(500);
  await shot(page, "editor-signed-sig");

  // the same screen in the other language (for the language-switch tile), then back
  const other = LANG === "ko" ? "en" : "ko";
  await selectAsset(stamp); await sleep(200);
  await P((l) => window.__pdfe.setLang(l), other); await sleep(900);
  await shot(page, "editor-other");
  await P((l) => window.__pdfe.setLang(l), LANG); await sleep(900);

  // the website's hero (site/assets/app-<lang>-{960,1600}.webp): the same document in a 1280x800 window
  await page.setViewportSize({ width: 1280, height: 800 }); await sleep(600);
  await P(() => window.__pdfe.setZoom(1.1)); await sleep(400);
  await scrollTo(1, SC.seal ? 0.47 : 0.6); await sleep(600);
  await selectAsset(stamp); await sleep(500);
  await P(() => { const l = document.createElement("div"); l.id = "shot-lights"; l.style.cssText = "position:fixed;left:18px;top:19px;display:flex;gap:8px;z-index:2147483647;pointer-events:none";
    l.innerHTML = ["#ff5f57", "#febc2e", "#28c840"].map((c) => `<i style="width:12px;height:12px;border-radius:50%;background:${c};box-shadow:inset 0 0 0 .5px rgba(0,0,0,.18)"></i>`).join(""); document.body.append(l); });
  await shot(page, "site-hero");
  await P(() => document.querySelector("#shot-lights")?.remove());
  await page.setViewportSize({ width: 1440, height: 900 }); await sleep(600);
  await P(() => window.__pdfe.setZoom(1.2)); await sleep(300);

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
  await page.evaluate(async (p) => { const d = await window.claude.use("desktop"); window.__keep = new Uint8Array(await d.fs.readFile(p)); return window.__keep.length; }, saved);
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

  // company stamp scanned on paper: background removal on/off (quote)
  await openDoc(base(SC.docs.quote));
  await selectAsset(SC.corp); await sleep(300);
  await P(() => { const S = window.__pdfe.S; const o = S.overlays.find((x) => x.id === S.sel); window.__pdfe.act(() => { o.x -= 8; o.y -= 8; o.w += 16; o.h += 16; o.fx.removeBg = false; });
    const st = document.querySelector("#stage"), p = S.pages[o.page]; st.scrollTop = p.el.offsetTop + (o.y + o.h / 2) * S.zoom - st.clientHeight / 2; }); await sleep(700);
  rects.sealBg = await P(() => { const S = window.__pdfe.S; const r = document.querySelector(`.ov[data-id="${S.sel}"]`).getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); });
  await shot(page, "seal-bg-off");
  await P(() => { const S = window.__pdfe.S; const o = S.overlays.find((x) => x.id === S.sel); window.__pdfe.act(() => { o.fx.removeBg = true; }); }); await sleep(900);
  await shot(page, "seal-bg-on");
  await P(() => window.__pdfe.undo()); await P(() => window.__pdfe.undo()); await sleep(300);

  await P(() => window.__pdfe.showHome()); await sleep(1500);
  await shot(page, "home-final");

  fs.writeFileSync(path.join(RAW, "rects.json"), JSON.stringify(rects, null, 1));
  await browser.close();
  // website hero: 2560x1600 raw -> 1600x1000 and 960x600 WebP
  for (const w of [1600, 960]) {
    const out = path.join(ROOT, "site", "assets", `app-${LANG}-${w}.webp`);
    await sharp(path.join(RAW, "site-hero.png")).resize({ width: w, kernel: "lanczos3" }).webp({ quality: w > 1000 ? 80 : 82, effort: 6, smartSubsample: true }).toFile(out);
    console.log(path.basename(out), (fs.statSync(out).size / 1024).toFixed(0) + " KB");
  }
  console.log(`raw shots (${LANG}) done`);
})().catch((e) => { console.error(e); process.exit(1); });
