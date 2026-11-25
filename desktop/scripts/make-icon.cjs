// Render the Sealworks app icon from its master artwork (docs/brand/sealworks-icon.svg, and the 16-32 px
// cut docs/brand/sealworks-icon-small.svg) with Electron's Chromium, and write:
//
//   build/icon.png         1024 px, the tile with a 32 px margin (Windows/Linux; the source for
//                          npm run icon:appx and mobile/ npm run icons)
//   build/icon-small.png   256 px, the small cut with the same margin (Store tiles of 48 px and less)
//   build/icon.icns        macOS: the tile on the 824 px icon grid with transparent margin and a soft
//                          shadow; 16 and 32 px from the small cut (iconutil)
//   build/icon.ico         16-256 px (16-32 from the small cut), PNG entries
//   ../site/assets/icon-32.png, icon-180.png (square, iOS rounds it), icon-512.png, logo-64.png,
//   ../site/favicon.ico    16/32/48
//
// Run: npm run icon   (any OS for everything but icon.icns, which needs macOS iconutil)
// The page's drawAppIcon() in web/pdf-editor.html draws the same artwork for the dock at runtime.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const DESKTOP = path.resolve(__dirname, "..");
const ROOT = path.join(DESKTOP, "..");
const BUILD = path.join(DESKTOP, "build");
const SITE = path.join(ROOT, "site");
const svg = (f) => fs.readFileSync(path.join(ROOT, "docs", "brand", f), "utf8");
const big = svg("sealworks-icon.svg");
const small = svg("sealworks-icon-small.svg");
// full-bleed square (no corner rounding) for platforms that apply their own mask
const square = big.replace(/ rx="230"/g, "");
const art = { big, small, square };

// each job: art, canvas size, tile size inside it (centred), macOS shadow
const jobs = [];
const job = (key, a, size, inner = size, shadow = false) => jobs.push({ key, a, size, inner, shadow });
// the tile `ratio` of `size`, on whole pixels with an equal margin on each side (sharp edges at 16-48 px)
const fit = (size, ratio) => size - 2 * Math.round(size * (1 - ratio) / 2);
job("icon.png", "big", 1024, fit(1024, 960 / 1024));
job("icon-small.png", "small", 256, fit(256, 960 / 1024));
const MAC = [16, 32, 128, 256, 512];
const mac = (px) => job(`mac-${px}`, px <= 32 ? "small" : "big", px, fit(px, 824 / 1024), px >= 64);
for (const s of MAC) { mac(s); mac(s * 2); }
const ICO = [16, 20, 24, 32, 40, 48, 64, 128, 256];
for (const s of ICO) job(`ico-${s}`, s <= 32 ? "small" : "big", s, s <= 32 ? s : fit(s, 960 / 1024));
job("site-icon-32", "small", 32);
job("site-icon-180", "square", 180);
job("site-icon-512", "big", 512);
job("site-logo-64", "big", 64);
job("fav-16", "small", 16);
job("fav-48", "big", 48);

/** An .ico with PNG entries (Windows Vista and later). */
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let off = head.length;
  entries.forEach(({ size, buf }, i) => {
    const o = 6 + 16 * i;
    head[o] = head[o + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(buf.length, o + 8); head.writeUInt32LE(off, o + 12);
    off += buf.length;
  });
  return Buffer.concat([head, ...entries.map((e) => e.buf)]);
}

// never use the default userData (<appData>/PDF Editor is the page's data store)
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "pdfe-icon-ud-")));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL("about:blank");
  const out = await win.webContents.executeJavaScript(`(async () => {
    const art = ${JSON.stringify(art)};
    const imgs = {};
    for (const [k, s] of Object.entries(art)) {
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
      await img.decode();
      imgs[k] = img;
    }
    const res = {};
    for (const { key, a, size, inner, shadow } of ${JSON.stringify(jobs)}) {
      const c = document.createElement("canvas"); c.width = c.height = size;
      const g = c.getContext("2d");
      if (shadow) { g.shadowColor = "rgba(0,0,0,.3)"; g.shadowBlur = size * 20 / 1024; g.shadowOffsetY = size * 10 / 1024; }
      const o = (size - inner) / 2;
      g.drawImage(imgs[a], o, o, inner, inner);
      res[key] = c.toDataURL("image/png").split(",")[1];
    }
    return res;
  })()`);
  const png = (k) => Buffer.from(out[k], "base64");
  fs.mkdirSync(BUILD, { recursive: true });
  fs.writeFileSync(path.join(BUILD, "icon.png"), png("icon.png"));
  fs.writeFileSync(path.join(BUILD, "icon-small.png"), png("icon-small.png"));
  fs.writeFileSync(path.join(BUILD, "icon.ico"), ico(ICO.map((s) => ({ size: s, buf: png(`ico-${s}`) }))));
  const assets = path.join(SITE, "assets");
  fs.writeFileSync(path.join(assets, "icon-32.png"), png("site-icon-32"));
  fs.writeFileSync(path.join(assets, "icon-180.png"), png("site-icon-180"));
  fs.writeFileSync(path.join(assets, "icon-512.png"), png("site-icon-512"));
  fs.writeFileSync(path.join(assets, "logo-64.png"), png("site-logo-64"));
  fs.writeFileSync(path.join(SITE, "favicon.ico"), ico([
    { size: 16, buf: png("fav-16") }, { size: 32, buf: png("site-icon-32") }, { size: 48, buf: png("fav-48") }]));

  if (process.platform === "darwin") {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pdfe-icon-"));
    const set = path.join(tmp, "icon.iconset");
    fs.mkdirSync(set);
    for (const s of MAC) {
      fs.writeFileSync(path.join(set, `icon_${s}x${s}.png`), png(`mac-${s}`));
      fs.writeFileSync(path.join(set, `icon_${s}x${s}@2x.png`), png(`mac-${s * 2}`));
    }
    execFileSync("iconutil", ["-c", "icns", set, "-o", path.join(BUILD, "icon.icns")], { stdio: "inherit" });
    fs.rmSync(tmp, { recursive: true, force: true });
  } else console.warn("not macOS: build/icon.icns left unchanged");
  console.log("wrote build/icon.{png,icns,ico}, build/icon-small.png, site/assets/{icon-32,icon-180,icon-512,logo-64}.png, site/favicon.ico");
  app.quit();
}).catch((e) => { console.error(e); process.exit(1); });
