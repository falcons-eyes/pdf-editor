// Screen recording helpers for demo.cjs and seal.cjs: a drawn cursor, click ripples, window buttons, captions,
// Chrome screencast capture and the frames -> GIF step (ffmpeg).
// Frames come from Chrome's screencast (only when the page repaints), so holds cost nothing in the GIF.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { OUT, sleep } = require("./lib.cjs");

const FFMPEG = process.env.FFMPEG || "ffmpeg";

// cursor, click ripple, window buttons and an optional caption, drawn into the page for the recording only
const OVERLAY = `(() => {
  const st = document.createElement("style");
  st.textContent = \`
    #rec-cursor { position: fixed; left: 0; top: 0; width: 22px; height: 33px; z-index: 2147483647; pointer-events: none; transform: translate(-3px,-2px); filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    #rec-ripple { position: fixed; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; background: rgba(36,70,199,.28); z-index: 2147483646; pointer-events: none; transform: scale(.3); opacity: 0; transition: transform .25s ease-out, opacity .35s ease-out; }
    #rec-ripple.on { transform: scale(1); opacity: 1; transition: none; }
    #rec-ghost { position: fixed; z-index: 2147483645; pointer-events: none; opacity: .85; transform: translate(-50%,-50%); filter: drop-shadow(0 6px 14px rgba(20,28,52,.25)); }
    #rec-lights { position: fixed; left: 18px; top: 19px; display: flex; gap: 8px; z-index: 2147483640; pointer-events: none; }
    #rec-lights i { width: 12px; height: 12px; border-radius: 50%; box-shadow: inset 0 0 0 .5px rgba(0,0,0,.18); }
    #rec-caption { position: fixed; left: 50%; bottom: 104px; transform: translate(-50%, 12px); z-index: 2147483644; pointer-events: none; opacity: 0;
      padding: 12px 22px; border-radius: 12px; background: rgba(23,26,34,.92); color: #fff; font: 600 19px/1.35 "IBM Plex Sans KR", system-ui, sans-serif;
      box-shadow: 0 12px 30px rgba(0,0,0,.25); transition: opacity .25s, transform .25s; white-space: nowrap; }
    #rec-caption.on { opacity: 1; transform: translate(-50%, 0); }
    #rec-caption.top { bottom: auto; top: 6px; transform: translate(-50%, -12px); }
    #rec-caption.top.on { transform: translate(-50%, 0); }
    #rec-root { position: fixed; inset: 0; width: 100vw; height: 100vh; margin: 0; padding: 0; border: 0; background: transparent; overflow: visible; pointer-events: none; }
    .tip { display: none !important; }\`;
  document.head.append(st);
  const c = document.createElement("div"); c.id = "rec-cursor";
  c.innerHTML = '<svg viewBox="0 0 22 33" width="22" height="33"><path d="M2 2v24.5l6.2-6 4.3 10 4-1.8-4.2-9.8h8.6z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
  const r = document.createElement("div"); r.id = "rec-ripple";
  const l = document.createElement("div"); l.id = "rec-lights"; l.innerHTML = '<i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>';
  const cap = document.createElement("div"); cap.id = "rec-caption";
  // one manual popover holds it all, so it sits in the top layer above modal dialogs; it re-raises itself whenever a dialog opens
  const root = document.createElement("div"); root.id = "rec-root"; root.setAttribute("popover", "manual");
  root.append(c, r, l, cap); document.body.append(root); root.showPopover();
  const raise = () => { try { root.hidePopover(); root.showPopover(); } catch {} };
  new MutationObserver((ms) => { if (ms.some((m) => m.target.tagName === "DIALOG")) raise(); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
  window.__rec = {
    move(x, y) { c.style.left = x + "px"; c.style.top = y + "px"; const g = document.getElementById("rec-ghost"); if (g) { g.style.left = x + "px"; g.style.top = y + "px"; } },
    click(x, y) { r.style.left = x + "px"; r.style.top = y + "px"; r.classList.add("on"); requestAnimationFrame(() => requestAnimationFrame(() => r.classList.remove("on"))); },
    ghost(src, w, x, y) { const g = document.createElement("img"); g.id = "rec-ghost"; g.src = src; g.style.width = w + "px"; g.style.left = x + "px"; g.style.top = y + "px"; root.append(g); },
    drop() { document.getElementById("rec-ghost")?.remove(); },
    caption(text, top) { if (text) { cap.textContent = text; cap.classList.toggle("top", !!top); cap.classList.add("on"); } else cap.classList.remove("on"); },
  };
  window.addEventListener("mousemove", (e) => window.__rec.move(e.clientX, e.clientY), true);
})();`;

async function recorder(page, name) {
  await page.evaluate(OVERLAY);
  const P = (fn, arg) => page.evaluate(fn, arg);
  const cdp = await page.context().newCDPSession(page);
  const frames = []; const dir = path.join(OUT, name + "-frames");
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
  const ripple = (x, y) => P(([x, y]) => window.__rec.click(x, y), [x, y]);
  async function click(x, y, ms) { await glide(x, y, ms); await ripple(x, y); await page.mouse.down(); await sleep(70); await page.mouse.up(); }
  async function dragReal(x, y, ms = 700) { await page.mouse.down(); await sleep(60); await glide(x, y, ms); await sleep(60); await page.mouse.up(); }
  const box = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
  async function clickSel(sel, ms) { const b = await box(sel); await click(b.x, b.y, ms); return b; }
  const caption = (text, { top = false } = {}) => P(([t, top]) => window.__rec.caption(t, top), [text || "", top]); // top: above an open dialog

  return {
    P, glide, click, clickSel, dragReal, box, ripple, caption,
    get cur() { return cur; },
    async start() {
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 2880, maxHeight: 1800, everyNthFrame: 1 });
      await page.mouse.move(cur.x, cur.y);
    },
    async stop() { await cdp.send("Page.stopScreencast"); await sleep(300); return frames; },
  };
}

// resample the screencast frames to a constant frame rate (holds repeat the last frame) into out/<name>-seq[-fps]/
function resample(frames, name, fps, maxS) {
  const seq = path.join(OUT, `${name}-seq-${fps}`);
  fs.rmSync(seq, { recursive: true, force: true }); fs.mkdirSync(seq, { recursive: true });
  const t0 = frames[0].t, rec = frames[frames.length - 1].t - t0 + 1;
  const speed = Math.min(1, maxS / rec); // play a bit faster if the recording ran long
  const outS = rec * speed; let k = 0, n = 0;
  for (let t = 0; t < outS; t += 1 / fps) {
    while (k + 1 < frames.length && (frames[k + 1].t - t0) * speed <= t) k++;
    fs.copyFileSync(frames[k].file, path.join(seq, String(n++).padStart(5, "0") + ".jpg"));
  }
  return { seq, rec, outS, n, t0, speed };
}

// frames -> looping GIF (README)
function toGif(frames, name, out, { fps = 15, width = 1200, maxS = 24, colors = 256 } = {}) {
  const { seq, rec, outS, n } = resample(frames, name, fps, maxS);
  const vf = `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=full:reserve_transparent=0[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  execFileSync(FFMPEG, ["-loglevel", "error", "-y", "-framerate", String(fps), "-i", path.join(seq, "%05d.jpg"), "-vf", vf, "-loop", "0", out], { stdio: "inherit" });
  console.log(`${path.basename(out)}: ${frames.length} frames, ${rec.toFixed(1)} s recorded -> ${outS.toFixed(1)} s (${n} frames @ ${fps} fps), ${(fs.statSync(out).size / 1048576).toFixed(2)} MB`);
}

// frames -> H.264 MP4 for the website (1200x750, 25 fps, no audio, fast start) and a WebP poster
// (posterAt: seconds into the output, or a negative number counted from the end; posterWall: wall-clock seconds)
async function toMp4(frames, name, out, { fps = 25, width = 1200, maxS = 24, crf = 30, poster = null, posterAt = -0.5, posterWall = null } = {}) {
  const { seq, rec, outS, n, t0, speed } = resample(frames, name, fps, maxS);
  if (posterWall) posterAt = (posterWall - t0) * speed; // a moment taken with Date.now() / 1000 during the recording
  execFileSync(FFMPEG, ["-loglevel", "error", "-y", "-framerate", String(fps), "-i", path.join(seq, "%05d.jpg"),
    "-vf", `scale=${width}:-2:flags=lanczos:in_range=pc:out_range=tv,format=yuv420p`, "-color_range", "tv", "-c:v", "libx264", "-preset", "veryslow", "-tune", "animation", "-crf", String(crf),
    "-profile:v", "high", "-movflags", "+faststart", "-an", out], { stdio: "inherit" });
  console.log(`${path.basename(out)}: ${rec.toFixed(1)} s recorded -> ${outS.toFixed(1)} s (${n} frames @ ${fps} fps), ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  if (poster) {
    const i = Math.max(0, Math.min(n - 1, Math.round((posterAt < 0 ? outS + posterAt : posterAt) * fps)));
    await require("sharp")(path.join(seq, String(i).padStart(5, "0") + ".jpg")).resize({ width, kernel: "lanczos3" }).webp({ quality: 80, effort: 6 }).toFile(poster);
    console.log(`${path.basename(poster)}: ${(fs.statSync(poster).size / 1024).toFixed(0)} KB`);
  }
}

module.exports = { recorder, toGif, toMp4 };
