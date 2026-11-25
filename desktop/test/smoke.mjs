// Smoke test: launches the app with Playwright's Electron driver against an isolated home folder
// (PDFE_HOME_OVERRIDE), checks the desktop API, opens the sample, places an asset, saves a signed
// PDF through the page's own save path and verifies it with pdf-lib. Screenshots go to test/out/.
//
//   node test/smoke.mjs                 # the unpacked build in dist/ (npm run pack)
//   node test/smoke.mjs --dev           # electron . (needs npm run build:page)
//   node test/smoke.mjs --app <path>    # a .app bundle, an executable, or PDFE_APP=<path>
import { _electron as electron } from "playwright";
import { PDFDocument } from "pdf-lib";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(DESKTOP, "test", "out");
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };

function resolveTarget() {
  if (argv.includes("--dev")) return { executablePath: require("electron"), args: [DESKTOP], label: "electron ." };
  let p = flag("--app") || process.env.PDFE_APP;
  if (!p) {
    const dist = path.join(DESKTOP, "dist");
    const candidates = process.platform === "darwin"
      ? [`mac-${process.arch}`, "mac", "mac-arm64", "mac-universal"].map((d) => path.join(dist, d, "PDF Editor.app"))
      : process.platform === "win32" ? [path.join(dist, "win-unpacked", "PDF Editor.exe"), path.join(dist, "win-arm64-unpacked", "PDF Editor.exe")]
      : [path.join(dist, "linux-unpacked", "pdf-editor-desktop")];
    p = candidates.find((c) => fs.existsSync(c));
    if (!p) throw new Error(`no unpacked build found in ${dist}; run npm run pack or pass --app`);
  }
  if (p.endsWith(".app")) p = path.join(p, "Contents", "MacOS", path.basename(p, ".app"));
  return { executablePath: p, args: [], label: p };
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  return !!ok;
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const home = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "pdfe-smoke-")));
  fs.mkdirSync(path.join(home, "Out"));
  const target = resolveTarget();
  console.log(`app:  ${target.label}\nhome: ${home}`);
  const env = { ...process.env, PDFE_HOME_OVERRIDE: home };
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({ executablePath: target.executablePath, args: target.args, env, timeout: 90_000 });
  const problems = [];
  const watch = (page) => {
    page.on("console", (m) => {
      const t = m.text();
      if (m.type() === "error") problems.push(`console.error: ${t}`);
      if (/fake worker|Content Security Policy|Refused to/i.test(t)) problems.push(`${m.type()}: ${t}`);
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("requestfailed", (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));
  };
  app.on("window", watch);
  let page;
  try {
    page = await app.firstWindow();
    watch(page);
    await page.waitForFunction(() => window.__pdfe && window.__pdfe.S.fs && window.__pdfe.Store.disk, null, { timeout: 30_000 });
    check("boot: __pdfe present, disk storage enabled", true);
    check("loaded from app://", page.url().startsWith("app://pdf-editor/"), page.url());

    const storeDir = path.join(home, "Library", "Application Support", "PDF Editor");
    check("data store created under the override home", fs.existsSync(storeDir), storeDir);
    check("electron userData kept out of the data store", !fs.existsSync(path.join(storeDir, ".electron")) && fs.existsSync(path.join(home, ".pdfe-electron")));

    // ---- desktop API contract ----
    const api = await page.evaluate(async () => {
      const d = await window.claude.use("desktop");
      const r = { standalone: d.standalone, platform: d.platform, version: d.version, other: await window.claude.use("nope") };
      const err = async (p) => { try { await p; return "resolved"; } catch (e) { return String(e.message); } };
      r.enoent = await err(d.fs.stat("~/does-not-exist"));
      await d.fs.mkdir("~/api/a/b", { recursive: true });
      await d.fs.writeFile("~/api/a/t.txt", "안녕 hello");
      r.text = await d.fs.readFile("~/api/a/t.txt", "utf8");
      const bin = await d.fs.readFile("~/api/a/t.txt");
      r.binIsU8 = bin instanceof Uint8Array; r.binLen = bin.length;
      r.b64 = await d.fs.readFile("~/api/a/t.txt", "base64");
      await d.fs.writeFile("~/api/a/b.bin", new Uint8Array([1, 2, 3]).buffer);
      r.stat = await d.fs.stat("~/api/a/b.bin");
      await d.fs.copyFile("~/api/a/b.bin", "~/api/a/c.bin");
      await d.fs.rename("~/api/a/c.bin", "~/api/a/d.bin");
      r.list = (await d.fs.readdir("~/api/a")).map((e) => `${e.name}:${e.isDirectory ? "d" : "f"}`);
      r.exists = [await d.fs.exists("~/api/a/d.bin"), await d.fs.exists("~/api/a/c.bin")];
      await d.fs.rm("~/api", { force: true });
      r.gone = !(await d.fs.exists("~/api"));
      r.rmMissing = await err(d.fs.rm("~/api"));
      r.rmForce = await err(d.fs.rm("~/api", { force: true }));
      r.perm = [await d.permissions.state("full-access"), await d.permissions.state(), await d.permissions.request(["full-access"])];
      r.win = await d.window.setOptions({ minWidth: 880, minHeight: 600, titleBarStyle: "hiddenInset" });
      r.os = [await d.os.platform(), await d.os.arch()];
      r.dock = await d.app.dock.setIcon("data:image/png;base64,");
      r.pathForBlobFile = d.pathForFile(new File(["x"], "x.pdf"));
      r.badUrl = await err(d.openExternal("file:///etc/passwd"));
      r.install = await d.install.state();
      return r;
    });
    check("standalone flags", api.standalone === true && api.platform === process.platform && /^\d+\.\d+\.\d+/.test(api.version) && api.other === null, `${api.platform} ${api.version}`);
    check("fs errors start with the code", /^ENOENT: /.test(api.enoent), api.enoent);
    check("fs write/read utf8/binary/base64", api.text === "안녕 hello" && api.binIsU8 && api.binLen === Buffer.byteLength("안녕 hello") && api.b64 === Buffer.from("안녕 hello").toString("base64"));
    check("fs stat", api.stat.size === 3 && api.stat.isFile && !api.stat.isDirectory && api.stat.mtimeMs > 0);
    check("fs readdir/copy/rename", JSON.stringify(api.list) === JSON.stringify(["b.bin:f", "b:d", "d.bin:f", "t.txt:f"]) || JSON.stringify([...api.list].sort()) === JSON.stringify(["b.bin:f", "b:d", "d.bin:f", "t.txt:f"]), api.list.join(" "));
    check("fs exists/rm", api.exists[0] && !api.exists[1] && api.gone && /^ENOENT/.test(api.rmMissing) && api.rmForce === "resolved", api.rmMissing);
    check("permissions granted", api.perm[0] === "granted" && api.perm[1]["full-access"] === "granted" && api.perm[2]["full-access"] === "granted");
    check("window.setOptions applied now", api.win?.applied === "now");
    check("os / dock / install", api.os[0] === process.platform && api.os[1] && api.dock.written === false && api.install === "installed");
    check("pathForFile on an in-memory File is null", api.pathForBlobFile === null);
    check("openExternal refuses non-https", /^EPERM/.test(api.badUrl), api.badUrl);
    check("files written into the override home", !fs.existsSync(path.join(home, "api")));

    // menus: the page's template reached the native menu, and clicks come back to the page
    const labels = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((i) => i.label) || []);
    check("application menu from the page", labels.includes("파일") && labels.includes("편집") && labels.includes("도움말"), labels.join(" | "));

    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `home-${process.platform}.png`) });

    // ---- sample document, place an asset, save ----
    await page.evaluate(() => window.__pdfe.loadSample());
    await page.waitForFunction(() => window.__pdfe.S.view === "editor" && window.__pdfe.S.pages.length > 0 && window.__pdfe.S.overlays.length >= 2, null, { timeout: 30_000 });
    const before = await page.evaluate(() => window.__pdfe.S.overlays.length);
    await page.evaluate(() => {
      const { S, placeAsset } = window.__pdfe;
      const a = [...S.assets.values()].find((x) => x.sample) || [...S.assets.values()][0];
      placeAsset(a.id, 0);
    });
    const after = await page.evaluate(() => window.__pdfe.S.overlays.length);
    check("placed an asset", after === before + 1, `${before} -> ${after}`);
    const info = await page.evaluate(() => ({ inputSize: window.__pdfe.S.doc.bytes.length, pages: window.__pdfe.S.pages.length }));
    await page.evaluate(() => window.__pdfe.performSave("smoke_signed.pdf", "~/Out", false));
    const saved = path.join(home, "Out", "smoke_signed.pdf");
    check("saved PDF exists", fs.existsSync(saved), saved);
    const bytes = fs.readFileSync(saved);
    check("saved PDF is larger than the input", bytes.length > info.inputSize, `${info.inputSize} -> ${bytes.length} bytes`);
    const doc = await PDFDocument.load(bytes);
    check("saved PDF parses with pdf-lib, page count matches", doc.getPageCount() === info.pages, `${doc.getPageCount()} pages`);
    const exp = await page.evaluate(() => window.__pdfe.S.rec ? window.__pdfe.S.rec.export?.path : "(sample: no record)");
    check("page recorded the export path", exp === "~/Out/smoke_signed.pdf" || exp === "(sample: no record)", exp);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `editor-${process.platform}.png`) });

    // ---- menu click round trip: 파일 > 보관함으로 돌아가기 ----
    await app.evaluate(({ Menu }) => {
      const file = Menu.getApplicationMenu().items.find((i) => i.label === "파일");
      file.submenu.items.find((i) => i.label === "보관함으로 돌아가기").click();
    });
    await page.waitForFunction(() => window.__pdfe.S.view === "home", null, { timeout: 10_000 }).catch(() => {});
    check("menu click reaches the page", (await page.evaluate(() => window.__pdfe.S.view)) === "home");

    // ---- open a PDF from the OS (macOS open-file / second-instance argv elsewhere) ----
    await page.evaluate(async () => {
      const d = await window.claude.use("desktop");
      window.__smokeOpened = [];
      d.onOpenFile((p) => window.__smokeOpened.push(p));
    });
    await app.evaluate(({ app: a }, file) => {
      if (process.platform === "darwin") a.emit("open-file", { preventDefault() {} }, file);
      else a.emit("second-instance", {}, [process.execPath, ...(a.isPackaged ? [] : ["."]), file], process.cwd());
    }, saved);
    await page.waitForFunction(() => window.__smokeOpened.length > 0, null, { timeout: 10_000 }).catch(() => {});
    const opened = await page.evaluate(() => window.__smokeOpened);
    check("onOpenFile delivers a page path", opened[0] === "~/Out/smoke_signed.pdf", JSON.stringify(opened));
    // the page's own onOpenFile handler opens it in the editor
    await page.waitForFunction(() => window.__pdfe.S.view === "editor" && window.__pdfe.S.rec?.source?.path === "~/Out/smoke_signed.pdf", null, { timeout: 15_000 }).catch(() => {});
    const src = await page.evaluate(() => ({ view: window.__pdfe.S.view, path: window.__pdfe.S.rec?.source?.path, pages: window.__pdfe.S.pages.length }));
    check("page opened the PDF from the OS", src.view === "editor" && src.path === "~/Out/smoke_signed.pdf" && src.pages === info.pages, JSON.stringify(src));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, `opened-${process.platform}.png`) });

    check("no console errors / CSP violations / failed requests", problems.length === 0, problems.slice(0, 8).join("\n      "));
  } catch (e) {
    check("smoke run", false, e?.stack || String(e));
    if (page) await page.screenshot({ path: path.join(OUT, `failure-${process.platform}.png`) }).catch(() => {});
  } finally {
    await app.close().catch(() => {});
  }
  const docsJson = path.join(home, "Library", "Application Support", "PDF Editor", "documents.json");
  check("documents.json written on close", fs.existsSync(docsJson) && JSON.parse(fs.readFileSync(docsJson, "utf8")).length >= 1);
  if (!process.env.PDFE_KEEP_HOME) fs.rmSync(home, { recursive: true, force: true });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed; screenshots in ${path.relative(process.cwd(), OUT) || OUT}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
