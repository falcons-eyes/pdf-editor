// Records the 3-step demo: the Library home (with the example gallery) -> open the lease the landlord emailed ->
// drag the signature and stamp onto the tenant's line -> 간인 across the pages (en: initials on every page) ->
// Save as file -> back in the Library the lease shows as saved.
//   node demo.cjs en|ko
// Writes docs/images/demo-<lang>.gif (README) and site/assets/demo-<lang>.mp4 + demo-<lang>-poster.webp (website).
const path = require("path");
const { ROOT, IMAGES, LANG, SC, base, wipeFakeHome, launch, newPage, openApp, seed, sleep } = require("./lib.cjs");
const { recorder, toGif, toMp4 } = require("./rec.cjs");

const CAP = {
  ko: ["집주인이 보낸 월세 계약서를 열고", "내 서명과 도장을 끌어다 놓아요", "쪽 사이 간인도 한 번에 찍고", "새 파일로 저장하면 끝이에요"],
  en: ["Open the lease your landlord emailed", "Drag on your signature and the date", "Initial every page in one go", "Save it as a new file. Done."],
}[LANG];
const VW = 1280, VH = 800;

(async () => {
  wipeFakeHome();
  const browser = await launch();
  const page = await newPage(browser, { width: VW, height: VH });
  await openApp(page);
  const { ex } = await seed(page, { keepMainClean: true });
  const leaseName = base(SC.docs.lease);
  const items = ex.lease.items;
  const find = (re, pg) => items.find((it) => re.test(it.name) && !it.gan && (pg == null || it.page === pg));
  const sigAt = find(/서명|^Signature/), sealAt = find(/도장/), dateAt = find(/날짜|date/i), iniAt = find(/Initials/, 1);

  // start on the Library: the lease on top with nothing placed, the examples open below; "Seal and save" off
  await page.evaluate(async ([name, SC, w]) => {
    const p = window.__pdfe, S = p.S; const r = S.docs.find((d) => d.name === name);
    r.openedAt = Date.now() - 30e3; r.editedAt = null; S.rec = null; S.doc = null; S.prefs.sealOnSave = false; S.prefs.examplesOpen = true;
    // the sizes the user last used (the drop takes them)
    for (const a of S.assets.values()) { const k = Object.keys(w).find((n) => SC[n] === a.name); if (k && w[k]) { a.lastW = w[k]; await p.addToLibrary(a); } }
    p.showHome();
  }, [leaseName, SC, { sig: sigAt && sigAt.w * 1.12, seal: sealAt && sealAt.w, date: dateAt && dateAt.w * 1.05, ini: iniAt && iniAt.w }]);
  await sleep(800);
  await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach((t) => t.remove()));
  const R = await recorder(page, "demo-" + LANG);
  const { P, glide, click, clickSel } = R;

  const client = (pg, x, y) => P(([pg, x, y]) => { const S = window.__pdfe.S, r = S.pages[pg].el.getBoundingClientRect(); return { x: r.left + x * S.zoom, y: r.top + y * S.zoom }; }, [pg, x, y]);
  const center = (it) => ({ x: it.x + it.w / 2, y: it.y + it.h / 2 });
  // drag a library tile onto the page (the app's own drop handler places it; we draw the ghost)
  async function dragTile(name, pg, at) {
    const t = await P((n) => { const el = [...document.querySelectorAll("#lib .tile")].find((x) => x.querySelector(".nm, .name, [class*=name]")?.textContent.trim() === n || x.textContent.includes(n)); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 - 14, id: el.dataset.id, src: el.querySelector("img").src }; }, name);
    await glide(t.x, t.y, 600); await sleep(100);
    await R.ripple(t.x, t.y);
    await P(([src, x, y]) => window.__rec.ghost(src, 110, x, y), [t.src, t.x, t.y]);
    const dst = await client(pg, at.x, at.y);
    await glide(dst.x, dst.y, 850);
    await P(() => window.__rec.drop());
    await P(([id, pg, at]) => window.__pdfe.placeAsset(id, pg, at), [t.id, pg, at]);
    await sleep(200);
  }
  const smooth = (sel, to, ms = 900) => P(async ([sel, to, ms]) => {
    const st = document.querySelector(sel), from = st.scrollTop;
    await new Promise((res) => { const t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; st.scrollTop = from + (to - from) * e; k < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
  }, [sel, to, ms]);
  const stageTo = (pg, frac) => P(([pg, frac]) => { const S = window.__pdfe.S, st = document.querySelector("#stage"), p = S.pages[pg]; return p.el.offsetTop + p.el.offsetHeight * frac - st.clientHeight / 2; }, [pg, frac]);
  async function zoomTo(z, pg, frac, ms = 700) { // eased zoom, keeping a page point in the middle
    const z0 = await P(() => window.__pdfe.S.zoom), n = Math.round(ms / 50);
    for (let i = 1; i <= n; i++) {
      const k = i / n, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      await P(([z, pg, frac]) => { window.__pdfe.setZoom(z); const S = window.__pdfe.S, st = document.querySelector("#stage"), p = S.pages[pg]; st.scrollTop = p.el.offsetTop + p.el.offsetHeight * frac - st.clientHeight / 2; }, [z0 + (z - z0) * e, pg, frac]);
      await sleep(25);
    }
  }
  async function clickButton(re) { // a visible button whose text matches
    const b = await P((src) => { const re = new RegExp(src); const el = [...document.querySelectorAll("button")].find((x) => x.offsetParent && re.test(x.textContent.trim())); el.scrollIntoView({ block: "center", behavior: "smooth" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, re.source);
    await sleep(500); const r = await P((src) => { const re = new RegExp(src); const el = [...document.querySelectorAll("button")].find((x) => x.offsetParent && re.test(x.textContent.trim())); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, re.source);
    await click(r.x, r.y, 600);
  }

  await R.start(); await sleep(1100);

  // 0) the Library, then a look at the examples below it
  const exTop = await P(() => { const m = document.querySelector("#home .home-main"), e = document.querySelector("#examples"); return e.getBoundingClientRect().top - m.getBoundingClientRect().top + m.scrollTop - 90; });
  await glide(560, 520, 500);
  await smooth("#home .home-main", exTop, 1100); await sleep(1300);
  await smooth("#home .home-main", 0, 800); await sleep(300);

  // 1) open the lease from the Library
  const row = await R.box(`.doc-row:has-text("${leaseName.replace(/\.pdf$/, "")}") .doc-open`);
  await R.caption(CAP[0]);
  await click(row.b.x + 150, row.y, 700);
  await sleep(700);
  await P(() => window.__pdfe.setZoom(1.15)); await sleep(150);
  await smooth("#stage", await stageTo(1, 0.6), 1000);
  await sleep(250);

  // 2) signature on the tenant's line, then the stamp on (인) (en: the date)
  await R.caption(CAP[1]);
  await dragTile(SC.sig, 1, center(sigAt));
  await sleep(350);
  if (sealAt) await dragTile(SC.seal, 1, center(sealAt));
  else await dragTile(SC.date, 1, { x: dateAt.x + (dateAt.w * 1.05) / 2, y: dateAt.y + dateAt.h / 2 });
  await sleep(400); const posterWall = Date.now() / 1000; await sleep(200);

  // 3) 간인 from the stamp's inspector (en: initials at the foot of the page, then "on every page")
  await R.caption(CAP[2]);
  if (sealAt) {
    await P(() => document.querySelector("#f-ganin").scrollIntoView({ block: "center", behavior: "smooth" })); await sleep(500);
    await clickSel("#f-ganin", 650);
  } else {
    await smooth("#stage", await stageTo(1, 0.9), 700);
    await dragTile(SC.ini, 1, center(iniAt));
    await sleep(350);
    await clickButton(/^Put on every page at the same spot$/);
  }
  await sleep(1300);
  await glide(VW * 0.62, VH * 0.5, 500);
  await zoomTo(0.6, 0, sealAt ? 0.95 : 1.0, 800); // both pages in view
  await sleep(1900);

  // 4) Save as file
  await R.caption(CAP[3]);
  await clickSel("#btn-export", 700);
  await sleep(900);
  await clickSel("#save-ok", 650);
  await R.caption(""); // the saved toast takes over
  await sleep(2200);
  // back to the Library: the lease now has a saved file
  await clickSel("#btn-back", 650);
  await sleep(2400);

  const frames = await R.stop();
  await browser.close();
  toGif(frames, "demo-" + LANG, path.join(IMAGES, `demo-${LANG}.gif`), { maxS: +(process.env.DEMO_MAX_S || 28), fps: 12, colors: 160, width: 960 });
  await toMp4(frames, "demo-" + LANG, path.join(ROOT, "site", "assets", `demo-${LANG}.mp4`), { maxS: +(process.env.DEMO_MAX_S || 28),
    poster: path.join(ROOT, "site", "assets", `demo-${LANG}-poster.webp`), posterWall });
})().catch((e) => { console.error(e); process.exit(1); });
