// Render the Microsoft Store (MSIX/AppX) tile and logo images from build/icon.png (and build/icon-small.png,
// the 16-32 px cut of the artwork, for images of 48 px and less) into build/appx/
// (electron-builder's appx target maps every file there to assets\ and builds resources.pri from the
// .scale-*/.targetsize-* qualifiers; the manifest names the unqualified files).
//
//   StoreLogo            50 x 50   (scale 100/125/150/200/400)
//   Square44x44Logo      44 x 44   (scales, plus targetsize-16/24/32/48/256 plain and -unplated for the taskbar)
//   Square150x150Logo   150 x 150  (scales; the icon at 60 %, so it sits clear of the tile's name)
//   Wide310x150Logo     310 x 150  (scales; the icon at 60 % of the height, centred)
//
// Run: npm run icon:appx   (after npm run icon when the artwork changes; any OS)
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DESKTOP = path.resolve(__dirname, "..");
const OUT = path.join(DESKTOP, "build", "appx");
const ICON = fs.readFileSync(path.join(DESKTOP, "build", "icon.png")).toString("base64");
const SMALL = fs.readFileSync(path.join(DESKTOP, "build", "icon-small.png")).toString("base64");

const SCALES = [100, 125, 150, 200, 400];
const TARGETS = [16, 24, 32, 48, 256];
const jobs = [];
const add = (file, w, h, fill) => jobs.push({ file, w, h, fill });
for (const s of SCALES) {
  const k = s / 100;
  add(`StoreLogo.scale-${s}.png`, Math.round(50 * k), Math.round(50 * k), 1);
  add(`Square44x44Logo.scale-${s}.png`, Math.round(44 * k), Math.round(44 * k), 1);
  add(`Square150x150Logo.scale-${s}.png`, Math.round(150 * k), Math.round(150 * k), 0.6);
  add(`Wide310x150Logo.scale-${s}.png`, Math.round(310 * k), Math.round(150 * k), 0.6);
}
for (const t of TARGETS) {
  add(`Square44x44Logo.targetsize-${t}.png`, t, t, 1);
  add(`Square44x44Logo.targetsize-${t}_altform-unplated.png`, t, t, 1);
  add(`Square44x44Logo.targetsize-${t}_altform-lightunplated.png`, t, t, 1);
}

// never use the default userData (<appData>/PDF Editor is the page's data store)
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "pdfe-appx-ud-")));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL("about:blank");
  const out = await win.webContents.executeJavaScript(`(async () => {
    const load = async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); return i; };
    const img = await load("${ICON}"), small = await load("${SMALL}");
    // halve step by step so small sizes stay smooth; 48 px and less from the small cut
    function scaled(size) {
      let src = size <= 48 ? small : img, w = src.width;
      while (w / 2 >= size) {
        const c = document.createElement("canvas"); c.width = c.height = Math.round(w / 2);
        const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, c.width, c.height);
        src = c; w = c.width;
      }
      return src;
    }
    return ${JSON.stringify(jobs)}.map(({ file, w, h, fill }) => {
      const side = Math.round(Math.min(w, h) * fill);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
      g.drawImage(scaled(side), Math.round((w - side) / 2), Math.round((h - side) / 2), side, side);
      return [file, c.toDataURL("image/png")];
    });
  })()`);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [file, url] of out) fs.writeFileSync(path.join(OUT, file), Buffer.from(url.split(",")[1], "base64"));
  console.log(`wrote ${out.length} images to build/appx/`);
  app.quit();
}).catch((e) => { console.error(e); process.exit(1); });
