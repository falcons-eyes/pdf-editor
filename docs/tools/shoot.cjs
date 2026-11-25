// Seeds the sandbox and saves raw 1440x900@2x screenshots of real app states to docs/tools/out/raw/.
const { wipeFakeHome, launch, newPage, openApp, seed, shot, sleep } = require("./lib.cjs");

(async () => {
  wipeFakeHome();
  const browser = await launch();
  const page = await newPage(browser);
  await openApp(page);

  await seed(page, {
    shots: {
      pad: () => shot(page, "pad"),
      text: () => shot(page, "text-dialog"),
    },
  });

  const P = (fn, arg) => page.evaluate(fn, arg);
  const scrollTo = (pageIdx, frac) => P(([i, f]) => {
    const S = window.__pdfe.S, st = document.querySelector("#stage"), p = S.pages[i];
    st.scrollTop = p.el.offsetTop + p.el.offsetHeight * f - st.clientHeight / 2;
  }, [pageIdx, frac]);
  const openDoc = async (name) => { await P((n) => window.__pdfe.openRecord(window.__pdfe.S.docs.find((d) => d.name === n)), name); await sleep(1200); };
  const selectAsset = (name) => P((n) => { const S = window.__pdfe.S; const o = S.overlays.find((x) => S.assets.get(x.assetId)?.name === n); window.__pdfe.select(o ? o.id : null); }, name);

  // home with several documents
  await P(() => window.__pdfe.showHome()); await sleep(1500);
  await shot(page, "home");

  // file browser (step 1)
  await P(() => { window.__pdfe.browse({ kind: "pdf", start: "~/Documents" }); });
  await sleep(900);
  await page.locator(".fb-row", { hasText: "용역계약서_가나다" }).first().click().catch(() => {});
  await sleep(500);
  await shot(page, "browse");
  await page.keyboard.press("Escape"); await sleep(300);

  // main contract, signed (hero)
  await openDoc("용역계약서_가나다.pdf");
  await P(() => window.__pdfe.setZoom(1.2)); await sleep(500);
  await scrollTo(1, 0.5); await sleep(600);
  await selectAsset("홍길동 도장"); await sleep(500);
  await shot(page, "editor-signed");
  await selectAsset("내 서명"); await sleep(500);
  await shot(page, "editor-signed-sig");

  // save dialog (step 3) and the saved toast
  await P(() => window.__pdfe.openSaveDialog()); await sleep(700);
  await shot(page, "save-dialog");
  await page.locator("#save-ok").click(); await sleep(900);
  await shot(page, "saved-toast", { keepToasts: true });
  await sleep(3500);

  // seal photo: background removal on/off (견적서)
  await openDoc("견적서_라온스튜디오.pdf");
  await scrollTo(0, 0.72); await sleep(300);
  await selectAsset("홍길동 도장"); await sleep(400);
  await P(() => { const S = window.__pdfe.S; const o = S.overlays.find((x) => x.id === S.sel); window.__pdfe.act(() => { o.w = 74; o.h = 74; o.x -= 14; o.y -= 14; o.fx.removeBg = false; }); }); await sleep(700);
  await shot(page, "seal-bg-off");
  await P(() => { const S = window.__pdfe.S; const o = S.overlays.find((x) => x.id === S.sel); window.__pdfe.act(() => { o.fx.removeBg = true; }); }); await sleep(900);
  await shot(page, "seal-bg-on");
  await P(() => window.__pdfe.undo()); await P(() => window.__pdfe.undo()); await sleep(300);

  // original changed outside the app (비밀유지서약서)
  await P(() => window.__pdfe.showHome()); await sleep(1200);
  await openDoc("비밀유지서약서.pdf"); await sleep(800);
  await shot(page, "source-changed");

  await P(() => window.__pdfe.showHome()); await sleep(1500);
  await shot(page, "home-final");

  await browser.close();
  console.log("raw shots done");
})().catch((e) => { console.error(e); process.exit(1); });
