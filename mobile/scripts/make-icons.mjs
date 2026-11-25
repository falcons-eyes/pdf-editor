// Android launcher icons and the splash icon from the Sealworks master artwork (docs/brand/: the same
// artwork as the desktop and store apps), rendered with headless Chromium (playwright-core; uses the
// browser Playwright already installed: `npx playwright install chromium-headless-shell` if missing).
//
//   mipmap-*/ic_launcher.png, ic_launcher_round.png   legacy icons (48 dp)
//   mipmap-*/ic_launcher_foreground.png                adaptive foreground (108 dp): the page and the wax
//                                                      seal without the tile, inside the 66 dp safe zone
//   mipmap-*/ic_launcher_monochrome.png                themed icon (Android 13+): the one-colour mark
//   drawable/ic_launcher_background.xml                adaptive background: the tile's blue gradient
//   drawable-*/ic_splash.png                           splash icon (Android 12+ SplashScreen API)
//   values/ic_launcher_background.xml                  the tile's colours
//   ../store/play-icon-512.png                         Play listing icon (square, Play applies its mask)
//
//   node scripts/make-icons.mjs   (npm run icons)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRAND = path.resolve(MOBILE, "..", "docs", "brand");
const RES = path.join(MOBILE, "android", "app", "src", "main", "res");
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const icon = fs.readFileSync(path.join(BRAND, "sealworks-icon.svg"), "utf8");
const small = fs.readFileSync(path.join(BRAND, "sealworks-icon-small.svg"), "utf8");
const mono = fs.readFileSync(path.join(BRAND, "sealworks-mark-mono.svg"), "utf8");
const [top, bottom] = [...icon.match(/<linearGradient id="sw-tile"[^]*?<\/linearGradient>/)[0].matchAll(/stop-color="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
const mid = "#" + [1, 3, 5].map((i) => Math.round((parseInt(top.slice(i, i + 2), 16) + parseInt(bottom.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, "0")).join("");
// the symbol (page + seal) in icon units: its box from the mark's viewBox; R_ART = the distance from the
// box centre to the farthest point of the artwork (the page's top-left corner)
const [mx, my, mw, mh] = mono.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const CX = mx + mw / 2, CY = my + mh / 2, R_ART = 505;
/** the artwork centred so that R_ART becomes r dp of a 108 dp square */
const framed = (svg, r) => {
  const V = 108 * R_ART / r;
  return svg.replace(/viewBox="[^"]+"/, `viewBox="${CX - V / 2} ${CY - V / 2} ${V} ${V}"`);
};
const noTile = icon.replace(/<rect width="1024" height="1024" rx="230"[^>]*\/>\n?/g, "");
const art = {
  icon, small,
  square: icon.replace(/ rx="230"/g, ""),
  fg: framed(noTile, 32.5),               // adaptive: the 66 dp safe circle has r = 33 dp
  splash: framed(noTile, 34),             // splash: shown masked to a circle of r = 36 dp
  round: framed(noTile, 40),              // legacy round icon: glyph on a disc filling the 48 dp square
  mono: framed(mono.replace("<svg ", '<svg color="#ffffff" '), 32.5),
};

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

// All drawing happens in the page; returns base64 PNGs.
const files = await page.evaluate(async ({ art, dens, top, bottom }) => {
  const imgs = {};
  for (const [k, s] of Object.entries(art)) {
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
    await img.decode();
    imgs[k] = img;
  }
  const png = (c) => c.toDataURL("image/png").split(",")[1];
  const canvas = (w) => { const c = document.createElement("canvas"); c.width = c.height = w; return c; };
  const draw = (k, size, inner = size) => {
    const c = canvas(size), o = (size - inner) / 2;
    c.getContext("2d").drawImage(imgs[k], o, o, inner, inner);
    return c;
  };
  const r = {};
  for (const [d, m] of Object.entries(dens)) {
    // legacy square icon: the tile with the desktop icon's margin (the small cut at 48 px and less)
    const L = Math.round(48 * m);
    r[`mipmap-${d}/ic_launcher.png`] = png(draw(L <= 48 ? "small" : "icon", L, Math.round(L * 960 / 1024)));
    // legacy round icon: gradient disc + the artwork
    const c = canvas(L), g = c.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, L); grd.addColorStop(0, top); grd.addColorStop(1, bottom);
    g.fillStyle = grd; g.beginPath(); g.arc(L / 2, L / 2, L / 2 - 0.5 * m, 0, Math.PI * 2); g.fill();
    g.drawImage(imgs.round, 0, 0, L, L);
    r[`mipmap-${d}/ic_launcher_round.png`] = png(c);
    // adaptive layers and the splash icon: 108 dp
    const A = Math.round(108 * m);
    r[`mipmap-${d}/ic_launcher_foreground.png`] = png(draw("fg", A));
    r[`mipmap-${d}/ic_launcher_monochrome.png`] = png(draw("mono", A));
    r[`drawable-${d}/ic_splash.png`] = png(draw("splash", A));
  }
  // Play Store listing icon (512 x 512, full bleed; Play applies its own mask)
  r["../../../../../store/play-icon-512.png"] = png(draw("square", 512));
  return r;
}, { art, dens: DENS, top, bottom });
await browser.close();

for (const [rel, b64] of Object.entries(files)) {
  const f = path.resolve(RES, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.from(b64, "base64"));
}
fs.writeFileSync(path.join(RES, "values", "ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>
<!-- the tile colours of docs/brand/sealworks-icon.svg (scripts/make-icons.mjs) -->
<resources>
    <color name="ic_launcher_background">${mid}</color>
    <color name="ic_launcher_background_top">${top}</color>
    <color name="ic_launcher_background_bottom">${bottom}</color>
    <color name="splash_background">${mid}</color>
</resources>
`);
fs.writeFileSync(path.join(RES, "drawable", "ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>
<!-- adaptive icon background: the blue gradient of docs/brand/sealworks-icon.svg (scripts/make-icons.mjs) -->
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:angle="270" android:startColor="@color/ic_launcher_background_top" android:endColor="@color/ic_launcher_background_bottom" />
</shape>
`);
for (const n of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
  fs.writeFileSync(path.join(RES, "mipmap-anydpi-v26", n), `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`);
}
console.log(`icons: ${Object.keys(files).length} files; background ${top} -> ${bottom}`);
