// Records docs/images/demo.gif: 보관함 -> open the contract -> drag signature and seal -> resize/rotate -> 파일로 저장.
// Frames come from Chrome's screencast (only when the page repaints), so holds cost nothing in the GIF.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { OUT, IMAGES, wipeFakeHome, launch, newPage, openApp, seed, sleep } = require("./lib.cjs");

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const GIF_W = 1200, FPS = 15;

// cursor, click ripple and window buttons, drawn into the page for the recording only
const OVERLAY = `(() => {
  const st = document.createElement("style");
  st.textContent = \`
    #rec-cursor { position: fixed; left: 0; top: 0; width: 22px; height: 33px; z-index: 2147483647; pointer-events: none; transform: translate(-3px,-2px); filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    #rec-ripple { position: fixed; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; background: rgba(36,70,199,.28); z-index: 2147483646; pointer-events: none; transform: scale(.3); opacity: 0; transition: transform .25s ease-out, opacity .35s ease-out; }
    #rec-ripple.on { transform: scale(1); opacity: 1; transition: none; }
    #rec-ghost { position: fixed; z-index: 2147483645; pointer-events: none; opacity: .85; transform: translate(-50%,-50%); filter: drop-shadow(0 6px 14px rgba(20,28,52,.25)); }
    #rec-lights { position: fixed; left: 18px; top: 19px; display: flex; gap: 8px; z-index: 2147483640; pointer-events: none; }
    #rec-lights i { width: 12px; height: 12px; border-radius: 50%; box-shadow: inset 0 0 0 .5px rgba(0,0,0,.18); }
    .tip { display: none !important; }\`;
  document.head.append(st);
  const c = document.createElement("div"); c.id = "rec-cursor";
  c.innerHTML = '<svg viewBox="0 0 22 33" width="22" height="33"><path d="M2 2v24.5l6.2-6 4.3 10 4-1.8-4.2-9.8h8.6z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
  const r = document.createElement("div"); r.id = "rec-ripple";
  const l = document.createElement("div"); l.id = "rec-lights"; l.innerHTML = '<i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>';
  document.body.append(c, r, l);
  window.__rec = {
    move(x, y) { c.style.left = x + "px"; c.style.top = y + "px"; const g = document.getElementById("rec-ghost"); if (g) { g.style.left = x + "px"; g.style.top = y + "px"; } },
    click(x, y) { r.style.left = x + "px"; r.style.top = y + "px"; r.classList.add("on"); requestAnimationFrame(() => requestAnimationFrame(() => r.classList.remove("on"))); },
    ghost(src, w, x, y) { const g = document.createElement("img"); g.id = "rec-ghost"; g.src = src; g.style.width = w + "px"; g.style.left = x + "px"; g.style.top = y + "px"; document.body.append(g); },
    drop() { document.getElementById("rec-ghost")?.remove(); },
  };
  window.addEventListener("mousemove", (e) => window.__rec.move(e.clientX, e.clientY), true);
})();`;

(async () => {
  wipeFakeHome();
  const browser = await launch();
  const page = await newPage(browser);
  await openApp(page);
  const { contract } = await seed(page, { keepMainClean: true });
  const P = (fn, arg) => page.evaluate(fn, arg);

  // start on the 보관함 with the contract on top, nothing placed yet
  await P(() => { const S = window.__pdfe.S; const r = S.docs.find((d) => d.name === "용역계약서_가나다.pdf"); r.openedAt = Date.now() - 30e3; r.editedAt = null; S.rec = null; S.doc = null; window.__pdfe.showHome(); });
  await P(() => document.querySelectorAll("#toasts .toast").forEach((t) => t.remove()));
  await page.evaluate(OVERLAY);
  await sleep(1500);

  // ---- recording ----
  const cdp = await page.context().newCDPSession(page);
  const frames = []; const dir = path.join(OUT, "demo-frames");
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  cdp.on("Page.screencastFrame", async (f) => {
    const file = path.join(dir, String(frames.length).padStart(5, "0") + ".jpg");
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });

  let cur = { x: 640, y: 560 };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  async function glide(x, y, ms = 650) {
    const n = Math.max(6, Math.round(ms / 30)); const a = { ...cur };
    const t0 = Date.now();
    for (let i = 1; i <= n; i++) { const k = ease(i / n); await page.mouse.move(a.x + (x - a.x) * k, a.y + (y - a.y) * k); const wait = t0 + (ms * i) / n - Date.now(); if (wait > 0) await sleep(wait); }
    cur = { x, y };
  }
  async function click(x, y) { await glide(x, y); await P(([x, y]) => window.__rec.click(x, y), [x, y]); await page.mouse.down(); await sleep(70); await page.mouse.up(); }
  async function dragReal(x, y, ms = 700) { await page.mouse.down(); await sleep(60); await glide(x, y, ms); await sleep(60); await page.mouse.up(); }
  const box = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
  // page point (pt) -> client px
  const client = (pg, x, y) => P(([pg, x, y]) => { const S = window.__pdfe.S, r = S.pages[pg].el.getBoundingClientRect(); return { x: r.left + x * S.zoom, y: r.top + y * S.zoom }; }, [pg, x, y]);
  // drag a library tile onto the page (the app's own drop handler places it; we draw the ghost)
  async function dragTile(name, pg, at) {
    const t = await P((n) => { const el = [...document.querySelectorAll("#lib .tile")].find((x) => x.textContent.includes(n)); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 - 14, id: el.dataset.id, src: el.querySelector("img").src }; }, name);
    await glide(t.x, t.y, 700); await sleep(150);
    await P(([x, y]) => window.__rec.click(x, y), [t.x, t.y]);
    await P(([src, x, y]) => window.__rec.ghost(src, 120, x, y), [t.src, t.x, t.y]);
    const dst = await client(pg, at.x, at.y);
    await glide(dst.x, dst.y, 950);
    await P(() => window.__rec.drop());
    await P(([id, pg, at]) => window.__pdfe.placeAsset(id, pg, at), [t.id, pg, at]);
    await sleep(250);
  }

  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 2880, maxHeight: 1800, everyNthFrame: 1 });
  await page.mouse.move(cur.x, cur.y); await sleep(1000);

  // 1) open the contract from the 보관함
  const row = await box('.doc-row:has-text("용역계약서_가나다") .doc-open');
  await click(row.b.x + 160, row.y);
  await sleep(700);
  await P(() => window.__pdfe.setZoom(1.2)); await sleep(150);
  // scroll to the signing lines on page 2
  await P(async () => {
    const S = window.__pdfe.S, st = document.querySelector("#stage"), p = S.pages[1];
    const to = p.el.offsetTop + p.el.offsetHeight * 0.5 - st.clientHeight / 2, from = st.scrollTop;
    await new Promise((res) => { const t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 1100); const e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; st.scrollTop = from + (to - from) * e; k < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
  });
  await sleep(300);

  // 2) signature onto the “을” line
  const m = contract[1];
  const sig = await P(() => { const a = [...window.__pdfe.S.assets.values()].find((x) => x.name === "내 서명"); return { w: a.w, h: a.h }; });
  const sw = 595.28 * 0.24, sh = (sw * sig.h) / sig.w;
  await dragTile("내 서명", 1, { x: (m.line.x0 + m.line.x1) / 2, y: m.line.y - sh / 2 + 8 });
  await sleep(500);

  // 3) seal next to it, then make it smaller, put it on (인) and tilt it a little
  await dragTile("홍길동 도장", 1, { x: m.seal.x + 40, y: m.seal.y + 30 });
  await sleep(400);
  const ov = () => P(() => { const S = window.__pdfe.S; const n = document.querySelector(`.ov[data-id="${S.sel}"]`); const q = (h) => { const r = n.querySelector(".h." + h).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }; const r = n.getBoundingClientRect(); return { br: q("br"), rot: q("rot"), c: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }; });
  let h = await ov();
  await glide(h.br.x, h.br.y, 600); await P(([x, y]) => window.__rec.click(x, y), [h.br.x, h.br.y]);
  const shrink = (595.28 * 0.24 - 52) * 1.2; // default width -> about 52 pt, at 120%
  await dragReal(h.br.x - shrink, h.br.y - shrink, 800);
  await sleep(300);
  h = await ov();
  const target = await client(1, m.seal.x, m.seal.y);
  await glide(h.c.x, h.c.y, 500); await P(([x, y]) => window.__rec.click(x, y), [h.c.x, h.c.y]);
  await dragReal(target.x, target.y, 700);
  await sleep(300);
  h = await ov();
  await glide(h.rot.x, h.rot.y, 500); await P(([x, y]) => window.__rec.click(x, y), [h.rot.x, h.rot.y]);
  await dragReal(h.rot.x - 9, h.rot.y + 1, 600);
  await sleep(600);

  // 4) 파일로 저장
  const save = await box("#btn-export");
  await click(save.x, save.y);
  await sleep(1500);
  const ok = await box("#save-ok");
  await click(ok.x, ok.y);
  await sleep(2200);

  await cdp.send("Page.stopScreencast");
  await sleep(300);
  await browser.close();

  // ---- frames -> GIF ----
  // resample to a constant frame rate (the screencast only sends frames on repaint)
  const seq = path.join(OUT, "demo-seq");
  fs.rmSync(seq, { recursive: true, force: true }); fs.mkdirSync(seq, { recursive: true });
  const t0 = frames[0].t, rec = frames[frames.length - 1].t - t0 + 1, maxS = +(process.env.DEMO_MAX_S || 18);
  const speed = Math.min(1, maxS / rec); // play a bit faster if the recording ran long
  const outS = rec * speed; let k = 0, n = 0;
  for (let t = 0; t < outS; t += 1 / FPS) {
    while (k + 1 < frames.length && (frames[k + 1].t - t0) * speed <= t) k++;
    fs.copyFileSync(frames[k].file, path.join(seq, String(n++).padStart(5, "0") + ".jpg"));
  }
  console.log(`${frames.length} frames, ${rec.toFixed(1)} s recorded -> ${outS.toFixed(1)} s GIF (${n} frames @ ${FPS} fps)`);
  const out = path.join(IMAGES, "demo.gif");
  const vf = `scale=${GIF_W}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=full:reserve_transparent=0[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  execFileSync(FFMPEG, ["-loglevel", "error", "-y", "-framerate", String(FPS), "-i", path.join(seq, "%05d.jpg"), "-vf", vf, "-loop", "0", out], { stdio: "inherit" });
  console.log("demo.gif", (fs.statSync(out).size / 1048576).toFixed(2) + " MB");
})().catch((e) => { console.error(e); process.exit(1); });
