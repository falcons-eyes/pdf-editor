// Android launcher icons and the splash icon from desktop/build/icon.png (the same artwork as the
// desktop and store apps), rendered with headless Chromium (playwright-core; uses the browser
// Playwright already installed: `npx playwright install chromium-headless-shell` if missing).
//
//   mipmap-*/ic_launcher.png, ic_launcher_round.png   legacy icons (48 dp)
//   mipmap-*/ic_launcher_foreground.png                adaptive foreground (108 dp): the page and the
//                                                      seal, cut out of icon.png along their outlines,
//                                                      inside the 66 dp safe zone
//   drawable/ic_launcher_background.xml                adaptive background: the icon's blue gradient
//   drawable-*/ic_splash.png                           splash icon (Android 12+ SplashScreen API)
//   values/ic_launcher_background.xml                  colors sampled from icon.png
//
//   node scripts/make-icons.mjs   (npm run icons)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.resolve(MOBILE, "..", "desktop", "build", "icon.png");
const RES = path.join(MOBILE, "android", "app", "src", "main", "res");
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// Playwright's own browser if present, else any headless shell already in its cache, else Chrome
async function launch() {
  try { return await chromium.launch(); } catch (e) {
    const cache = path.join(os.homedir(), process.platform === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright");
    const shells = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse() : [];
    for (const d of shells) {
      for (const sub of fs.readdirSync(path.join(cache, d))) {
        const exe = path.join(cache, d, sub, process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell");
        if (fs.existsSync(exe)) return chromium.launch({ executablePath: exe });
      }
    }
    try { return await chromium.launch({ channel: "chrome" }); } catch { throw e; }
  }
}
const browser = await launch();
const page = await browser.newPage();
await page.setContent("<canvas></canvas>");
const icon = `data:image/png;base64,${fs.readFileSync(SRC).toString("base64")}`;

// All drawing happens in the page; returns base64 PNGs.
const out = await page.evaluate(async ({ icon, dens }) => {
  const img = new Image();
  img.src = icon;
  await img.decode();
  const N = img.width; // 1024
  const s = N / 1024;
  const probe = document.createElement("canvas"); probe.width = N; probe.height = N;
  const pg = probe.getContext("2d"); pg.drawImage(img, 0, 0);
  const px = (x, y) => { const d = pg.getImageData(x * s, y * s, 1, 1).data; return "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join(""); };
  const top = px(512, 60), bottom = px(512, 965), mid = px(150, 512);
  // outline of the page (with its folded corner) and the seal ring, in icon.png coordinates
  const glyph = (g) => {
    g.beginPath();
    g.moveTo(264, 176); g.lineTo(648, 176); g.lineTo(784, 312); g.lineTo(784, 856); g.lineTo(264, 856); g.closePath();
    g.moveTo(744 + 139, 760); g.arc(744, 760, 139, 0, Math.PI * 2);
  };
  const box = { x0: 264, y0: 176, x1: 883, y1: 899 }; // bounding box of the glyph
  const png = (c) => c.toDataURL("image/png").split(",")[1];
  const canvas = (w) => { const c = document.createElement("canvas"); c.width = w; c.height = w; return c; };
  /** the glyph alone, fitted into `inner` px centred in a `size` px square */
  const foreground = (size, inner) => {
    const c = canvas(size), g = c.getContext("2d");
    const k = inner / Math.max(box.x1 - box.x0, box.y1 - box.y0);
    g.translate(size / 2 - ((box.x0 + box.x1) / 2) * k, size / 2 - ((box.y0 + box.y1) / 2) * k);
    g.scale(k, k);
    g.save(); glyph(g); g.clip("nonzero"); g.drawImage(img, 0, 0, 1024, 1024); g.restore();
    return c;
  };
  const r = {};
  for (const [d, m] of Object.entries(dens)) {
    // legacy square icon: icon.png as it is
    const L = Math.round(48 * m);
    let c = canvas(L); c.getContext("2d").drawImage(img, 0, 0, L, L); r[`mipmap-${d}/ic_launcher.png`] = png(c);
    // legacy round icon: gradient disc + glyph
    c = canvas(L); let g = c.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, L); grd.addColorStop(0, top); grd.addColorStop(1, bottom);
    g.fillStyle = grd; g.beginPath(); g.arc(L / 2, L / 2, L / 2 - 0.5 * m, 0, Math.PI * 2); g.fill();
    g.drawImage(foreground(L, L * 0.56), 0, 0); r[`mipmap-${d}/ic_launcher_round.png`] = png(c);
    // adaptive foreground: 108 dp canvas; the glyph box (46 dp tall) keeps its corners inside the 66 dp safe circle
    const A = Math.round(108 * m);
    r[`mipmap-${d}/ic_launcher_foreground.png`] = png(foreground(A, A * 46 / 108));
    // splash icon (SplashScreen API: 108 dp drawable, shown masked to a circle of 2/3)
    r[`drawable-${d}/ic_splash.png`] = png(foreground(A, A * 50 / 108));
  }
  // Play Store listing icon (512 x 512, full bleed; Play applies its own mask)
  const P = canvas(512), pg2 = P.getContext("2d");
  const grd = pg2.createLinearGradient(0, 0, 0, 512); grd.addColorStop(0, top); grd.addColorStop(1, bottom);
  pg2.fillStyle = grd; pg2.fillRect(0, 0, 512, 512); pg2.drawImage(foreground(512, 512 * 0.62), 0, 0);
  r["../../../../../store/play-icon-512.png"] = png(P);
  return { files: r, colors: { top, bottom, mid } };
}, { icon, dens: DENS });
await browser.close();

for (const [rel, b64] of Object.entries(out.files)) {
  const f = path.resolve(RES, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.from(b64, "base64"));
}
const { top, bottom, mid } = out.colors;
fs.writeFileSync(path.join(RES, "values", "ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>
<!-- sampled from desktop/build/icon.png by scripts/make-icons.mjs -->
<resources>
    <color name="ic_launcher_background">${mid}</color>
    <color name="ic_launcher_background_top">${top}</color>
    <color name="ic_launcher_background_bottom">${bottom}</color>
    <color name="splash_background">${mid}</color>
</resources>
`);
fs.writeFileSync(path.join(RES, "drawable", "ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>
<!-- adaptive icon background: the blue gradient of desktop/build/icon.png (scripts/make-icons.mjs) -->
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:angle="270" android:startColor="@color/ic_launcher_background_top" android:endColor="@color/ic_launcher_background_bottom" />
</shape>
`);
for (const n of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
  fs.writeFileSync(path.join(RES, "mipmap-anydpi-v26", n), `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`);
}
console.log(`icons: ${Object.keys(out.files).length} files; background ${top} -> ${bottom}`);
