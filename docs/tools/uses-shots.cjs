// The website's "for your situation" cards: a crop of each example document with its signature,
// stamp, 간인 or check marks already placed, straight from the app's example gallery
// (window.__pdfe.loadExample, docs/design/scenarios.md).
//   node uses-shots.cjs en|ko            (with PDFE_URL set the way render.sh sets it)
// Writes site/assets/uses/<id>-<lang>.webp (960x600, shown at up to 480x300 CSS px).
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { ROOT, OUT, LANG, launch, newPage, openApp, sleep } = require("./lib.cjs");

// the six cards on the landing page, in order
const IDS = ["lease", "parttime", "quote", "school", "expense", "freelance"];
// crops that read better against the right edge of the page (an approval box in the top corner)
const RIGHT = new Set(["expense"]);
const W = 960, H = 600;

(async () => {
  const dir = path.join(ROOT, "site", "assets", "uses");
  const raw = path.join(OUT, "uses-" + LANG);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(raw, { recursive: true });
  const browser = await launch();
  const page = await newPage(browser, { scale: 2, width: 1440, height: 1000 });
  await openApp(page);
  // no selection frame, handles or toasts in the crops
  await page.addStyleTag({ content: ".ov .h, .ov .rot, .sel-frame, .toast, .ex-banner, .example-note { display: none !important } .ov.sel, .ov:focus { outline: none !important; box-shadow: none !important }" });
  for (const id of IDS) {
    await page.evaluate(([i, l]) => window.__pdfe.loadExample(i, l), [id, LANG]);
    await sleep(2500);
    await page.evaluate(() => { window.__pdfe.select(null); window.__pdfe.setZoom(1.6); });
    await sleep(1200);
    // where to look: the page with the most placed items (ties: the later page), and on it the
    // tightest group of items (items closer than 15% of the page height belong together)
    const pick = await page.evaluate(() => {
      const S = window.__pdfe.S;
      const count = new Map();
      for (const o of S.overlays) count.set(o.page, (count.get(o.page) || 0) + 1);
      let best = 0, n = -1;
      for (const [p, c] of count) if (c > n || (c === n && p > best)) { best = p; n = c; }
      const pg = S.pages[best];
      const os = S.overlays.filter((o) => o.page === best).sort((a, b) => a.y - b.y);
      const groups = [];
      for (const o of os) {
        const g = groups[groups.length - 1];
        if (g && o.y - g.y1 < pg.h * 0.15) { g.items.push(o); g.y1 = Math.max(g.y1, o.y + o.h); } else groups.push({ items: [o], y1: o.y + o.h });
      }
      // a stamp or signature tells the story better than a date line
      const weight = (o) => { const k = S.assets.get(o.assetId)?.kind; return o.gan ? 0.5 : k === "seal" || k === "image" ? 3 : k === "draw" ? 2 : 1; };
      const score = (g) => g.items.reduce((n, o) => n + weight(o), 0);
      const g = groups.sort((a, b) => score(b) - score(a))[0].items;
      const x0 = Math.min(...g.map((o) => o.x)), x1 = Math.max(...g.map((o) => o.x + o.w));
      const y0 = Math.min(...g.map((o) => o.y)), y1 = Math.max(...g.map((o) => o.y + o.h));
      return { page: best, x0: x0 / pg.w, x1: x1 / pg.w, y0: y0 / pg.h, y1: y1 / pg.h, ratio: pg.h / pg.w };
    });
    // bring that spot into view, then crop around it at 16:10, at least 68% of the page wide
    await page.evaluate(([i, f]) => {
      const S = window.__pdfe.S, st = document.querySelector("#stage"), p = S.pages[i];
      st.scrollTop = p.el.offsetTop + p.el.offsetHeight * f - st.clientHeight / 2;
    }, [pick.page, (pick.y0 + pick.y1) / 2]);
    await sleep(1500);
    const box = await page.evaluate((k) => {
      const r = window.__pdfe.S.pages[k.page].el.getBoundingClientRect();
      const st = document.querySelector("#stage").getBoundingClientRect();
      const gw = (k.x1 - k.x0) * r.width, gh = (k.y1 - k.y0) * r.height;
      // start at the text margin so the labels next to a signature stay in the picture
      const margin = 0.07 * r.width, right = r.left + k.x1 * r.width + 0.12 * r.width;
      const w = Math.min(r.width, Math.max(r.width * 0.68, right - (r.left + margin), (gh + r.height * 0.08) / 0.625));
      const h = w * 0.625;
      const cy = r.top + ((k.y0 + k.y1) / 2) * r.height;
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
      const x = k.right ? r.right - margin - w : Math.min(r.left + margin, r.left + k.x0 * r.width - 0.04 * r.width);
      const y = clamp(cy - h / 2, Math.max(r.top, st.top), Math.min(r.bottom, st.bottom) - h);
      return { x: clamp(x, r.left, r.right - w), y, width: w, height: h };
    }, { ...pick, right: RIGHT.has(id) });
    const png = path.join(raw, `${id}.png`);
    await page.screenshot({ path: png, clip: box });
    const out = path.join(dir, `${id}-${LANG}.webp`);
    await sharp(png).resize(W, H, { fit: "cover", position: "centre" }).webp({ quality: 82 }).toFile(out);
    const kb = Math.round(fs.statSync(out).size / 1024);
    console.log(`site/assets/uses/${id}-${LANG}.webp  page ${pick.page + 1}  ${kb} KB`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
