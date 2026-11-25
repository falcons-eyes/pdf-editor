// Render the page's own app icon (drawAppIcon() in web/pdf-editor.html) at 1024 px and write
// build/icon.png (full bleed, used for Windows/Linux), build/icon.icns (macOS: artwork scaled to the
// 824 px icon grid with transparent margin) and build/icon.ico (16-256 px).
// Run: npm run icon   (needs `npm run build:page` first for the fonts; macOS iconutil; python3 + Pillow)
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const DESKTOP = path.resolve(__dirname, "..");
const BUILD = path.join(DESKTOP, "build");
const page = fs.readFileSync(path.join(DESKTOP, "..", "web", "pdf-editor.html"), "utf8");
const m = /function drawAppIcon\(\) \{[\s\S]*?\n\}\n/.exec(page);
if (!m) { console.error("drawAppIcon() not found in the page"); process.exit(1); }

// never use the default userData (<appData>/PDF Editor is the page's data store)
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "pdfe-icon-ud-")));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pdfe-icon-"));
  const html = path.join(tmp, "icon.html");
  const fontsCss = path.join(DESKTOP, "app", "fonts", "fonts.css");
  fs.writeFileSync(html, `<!doctype html><meta charset=utf-8><link rel=stylesheet href="${new URL("file://" + fontsCss).href}"><body>`);
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadFile(html);
  const render = (scale, offset) => win.webContents.executeJavaScript(`(async () => {
    await document.fonts.load("800 30px 'Nanum Myeongjo'", "印").catch(() => {});
    const canvasOf = (w, h) => {
      const c = document.createElement("canvas"); c.width = 1024; c.height = 1024;
      const g = c.getContext("2d"); g.translate(${offset}, ${offset}); g.scale(${scale}, ${scale}); return c;
    };
    ${m[0]}
    return [drawAppIcon(), document.fonts.check("800 30px 'Nanum Myeongjo'", "印")];
  })()`);
  // full bleed: the 256-unit artwork fills 1024 px
  const [full, fontOk] = await render(4, 0);
  // macOS grid: the 240-unit rounded square (8..248) becomes 824 px, centred
  const s = 824 / 240;
  const [mac] = await render(s, 100 - 8 * s);
  if (!fontOk) console.warn("warning: Nanum Myeongjo did not load; 印 rendered with a fallback font");
  const png = (u) => Buffer.from(u.split(",")[1], "base64");
  fs.mkdirSync(BUILD, { recursive: true });
  fs.writeFileSync(path.join(BUILD, "icon.png"), png(full));
  const macPng = path.join(tmp, "icon-mac.png");
  fs.writeFileSync(macPng, png(mac));

  const py = process.env.PYTHON || (fs.existsSync("/usr/local/bin/python3") ? "/usr/local/bin/python3" : "python3"); // needs Pillow
  if (process.platform === "darwin") {
    const set = path.join(tmp, "icon.iconset");
    fs.mkdirSync(set);
    const sizes = [16, 32, 128, 256, 512];
    const script = `import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("RGBA")\nfor s in [${sizes.join(",")}]:\n  im.resize((s, s), Image.LANCZOS).save(f"{sys.argv[2]}/icon_{s}x{s}.png")\n  im.resize((s*2, s*2), Image.LANCZOS).save(f"{sys.argv[2]}/icon_{s}x{s}@2x.png")\n`;
    execFileSync(py, ["-c", script, macPng, set], { stdio: "inherit", cwd: tmp });
    execFileSync("iconutil", ["-c", "icns", set, "-o", path.join(BUILD, "icon.icns")], { stdio: "inherit" });
  } else console.warn("not macOS: build/icon.icns left unchanged");
  const ico = `import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("RGBA")\nim.save(sys.argv[2], sizes=[(16,16),(20,20),(24,24),(32,32),(40,40),(48,48),(64,64),(128,128),(256,256)])\n`;
  execFileSync(py, ["-c", ico, path.join(BUILD, "icon.png"), path.join(BUILD, "icon.ico")], { stdio: "inherit", cwd: tmp });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("wrote build/icon.png, build/icon.icns, build/icon.ico");
  app.quit();
}).catch((e) => { console.error(e); process.exit(1); });
