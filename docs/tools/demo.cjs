// Records docs/images/demo-<lang>.gif:
//   Library -> open the contract -> drag signature and stamp -> resize/rotate -> Save as file with "Seal and save"
//   -> saved toast -> Verify seal -> "Seal intact".
//   node demo.cjs en|ko
const path = require("path");
const { IMAGES, LANG, SC, base, wipeFakeHome, launch, newPage, openApp, seed, makeSealer, sleep } = require("./lib.cjs");
const { recorder, toGif } = require("./rec.cjs");

(async () => {
  wipeFakeHome();
  const browser = await launch();
  const page = await newPage(browser);
  await openApp(page);
  const { contract } = await seed(page, { keepMainClean: true });
  await makeSealer(page); // made earlier, like a user who has sealed before (the first time the dialog asks for a name)
  const contractName = base(SC.docs.contract);

  // start on the Library with the contract on top, nothing placed yet; "Seal and save" starts off
  await page.evaluate((name) => {
    const p = window.__pdfe, S = p.S; const r = S.docs.find((d) => d.name === name);
    r.openedAt = Date.now() - 30e3; r.editedAt = null; S.rec = null; S.doc = null; S.prefs.sealOnSave = false; p.showHome();
  }, contractName);
  await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach((t) => t.remove()));
  const R = await recorder(page, "demo-" + LANG);
  const { P, glide, click, clickSel, dragReal } = R;
  await sleep(1500);

  // page point (pt) -> client px
  const client = (pg, x, y) => P(([pg, x, y]) => { const S = window.__pdfe.S, r = S.pages[pg].el.getBoundingClientRect(); return { x: r.left + x * S.zoom, y: r.top + y * S.zoom }; }, [pg, x, y]);
  // drag a library tile onto the page (the app's own drop handler places it; we draw the ghost)
  async function dragTile(name, pg, at) {
    const t = await P((n) => { const el = [...document.querySelectorAll("#lib .tile")].find((x) => x.textContent.includes(n)); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 - 14, id: el.dataset.id, src: el.querySelector("img").src }; }, name);
    await glide(t.x, t.y, 650); await sleep(120);
    await R.ripple(t.x, t.y);
    await P(([src, x, y]) => window.__rec.ghost(src, 120, x, y), [t.src, t.x, t.y]);
    const dst = await client(pg, at.x, at.y);
    await glide(dst.x, dst.y, 900);
    await P(() => window.__rec.drop());
    await P(([id, pg, at]) => window.__pdfe.placeAsset(id, pg, at), [t.id, pg, at]);
    await sleep(220);
  }

  await R.start(); await sleep(900);

  // 1) open the contract from the Library
  const row = await R.box(`.doc-row:has-text("${contractName.replace(/\.pdf$/, "")}") .doc-open`);
  await click(row.b.x + 160, row.y);
  await sleep(650);
  await P(() => window.__pdfe.setZoom(1.2)); await sleep(150);
  // scroll to the signing lines on page 2
  await P(async () => {
    const S = window.__pdfe.S, st = document.querySelector("#stage"), p = S.pages[1];
    const to = p.el.offsetTop + p.el.offsetHeight * 0.5 - st.clientHeight / 2, from = st.scrollTop;
    await new Promise((res) => { const t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 1000); const e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; st.scrollTop = from + (to - from) * e; k < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
  });
  await sleep(250);

  // 2) signature onto the contractor's line
  const m = contract[1];
  const sig = await P((n) => { const a = [...window.__pdfe.S.assets.values()].find((x) => x.name === n); return { w: a.w, h: a.h }; }, SC.sig);
  const sw = 595.28 * 0.24, sh = (sw * sig.h) / sig.w;
  await dragTile(SC.sig, 1, { x: (m.line.x0 + m.line.x1) / 2, y: m.line.y - sh / 2 + 8 });
  await sleep(400);

  // 3) stamp next to it, then make it smaller, move it into place and tilt it a little
  await dragTile(SC.seal, 1, { x: m.seal.x + 40, y: m.seal.y + 30 });
  await sleep(300);
  const ov = () => P(() => { const S = window.__pdfe.S; const n = document.querySelector(`.ov[data-id="${S.sel}"]`); const q = (h) => { const r = n.querySelector(".h." + h).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }; const r = n.getBoundingClientRect(); return { br: q("br"), rot: q("rot"), c: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }; });
  let h = await ov();
  await glide(h.br.x, h.br.y, 550); await R.ripple(h.br.x, h.br.y);
  const shrink = (595.28 * 0.24 - 52) * 1.2; // default width -> about 52 pt, at 120%
  await dragReal(h.br.x - shrink, h.br.y - shrink, 750);
  await sleep(250);
  h = await ov();
  const target = await client(1, m.seal.x, m.seal.y);
  await glide(h.c.x, h.c.y, 450); await R.ripple(h.c.x, h.c.y);
  await dragReal(target.x, target.y, 650);
  await sleep(250);
  h = await ov();
  await glide(h.rot.x, h.rot.y, 450); await R.ripple(h.rot.x, h.rot.y);
  await dragReal(h.rot.x - 9, h.rot.y + 1, 550);
  await sleep(500);

  // 4) Save as file, with "Seal and save" turned on
  await clickSel("#btn-export");
  await sleep(1000);
  await clickSel("#save-seal", 600);
  await sleep(1100);
  await clickSel("#save-ok", 600);
  await sleep(2300); // the "Sealed and saved" toast

  // 5) Verify seal on the saved file
  const saved = await P(() => window.__pdfe.S.rec.export.path);
  await clickSel("#btn-verify", 700);
  await sleep(800);
  await P((p) => { window.__shimDialogNext = [p]; }, saved); // the native open panel's answer
  await clickSel("#v-pick", 600);
  await sleep(250); await glide(1110, 700, 500); // out of the way of the result
  await sleep(2900);

  const frames = await R.stop();
  await browser.close();
  toGif(frames, "demo-" + LANG, path.join(IMAGES, `demo-${LANG}.gif`), { maxS: +(process.env.DEMO_MAX_S || 24) });
})().catch((e) => { console.error(e); process.exit(1); });
