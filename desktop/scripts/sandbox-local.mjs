// Local App Sandbox test without Apple certificates (macOS only).
//
// Builds Electron's Mac App Store variant (mas-dev target, unsigned), signs it ad-hoc with the MAS
// entitlements and runs it for real inside the App Sandbox:
//   A. without a test home: where the data store lands (the container), what "~" is
//   B. test/smoke.mjs with a test home inside the container, an outside folder that must be denied
//      (EPERM, not ENOENT), sealing with the key in the Keychain (safeStorage), the import menu
//   C. sandbox denials the kernel reported during the run (`log stream`, test/out/sandbox-denials.log)
// and then removes what it created (the container, the Keychain item, the outside folder).
//
//   npm run test:sandbox                    # = node scripts/sandbox-local.mjs
//   node scripts/sandbox-local.mjs --skip-build --keep
//
// Differences from the real store build, all test-only (never in build/entitlements.mas.plist):
//   - bundle ID com.falconoon.sealmark.localtest, so the real ID never gets a container on this Mac
//   - ElectronTeamID LOCALTEST0 + application-groups ["LOCALTEST0.<id>"]: the MAS Electron registers
//     its Mach rendezvous service under "<team>.<bundle id>" and aborts without that group; a real
//     signing run gets both from the team ID (@electron/osx-sign preAutoEntitlements)
//   - com.apple.security.network.server: Playwright drives the app through the Node inspector and
//     DevTools on 127.0.0.1, which the sandbox otherwise refuses to bind
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { _electron as electron } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") { console.error("macOS only"); process.exit(2); }
const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(DESKTOP, "test", "out");
const argv = process.argv.slice(2);
const SKIP_BUILD = argv.includes("--skip-build");
const KEEP = argv.includes("--keep");
const ARCH = process.arch === "x64" ? "x64" : "arm64";
const ID = "com.falconoon.sealmark.localtest";
const TEAM = "LOCALTEST0";
const APP = path.join(DESKTOP, "dist", `mas-dev-${ARCH}`, "Sealmark.app");
const CONTAINER = path.join(os.homedir(), "Library", "Containers", ID);
const KEYCHAIN_SERVICE = "Sealmark Safe Storage";
const run = (cmd, args, o = {}) => execFileSync(cmd, args, { stdio: "inherit", cwd: DESKTOP, ...o });
const out = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  return !!ok;
};
const keychainHas = () => out("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE]).status === 0;
// everything this script may leave behind is named after the test-only bundle ID
const leftovers = () => [
  CONTAINER,
  path.join(os.homedir(), "Library", "Group Containers", `${TEAM}.${ID}`),
  path.join(os.homedir(), "Library", "Application Scripts", ID),
  path.join(os.homedir(), "Library", "Application Scripts", `${TEAM}.${ID}`),
  path.join(os.homedir(), "Library", "Saved Application State", `${ID}.savedState`),
].filter((p) => fs.existsSync(p));
function cleanContainers() {
  for (const p of leftovers()) {
    try { fs.rmSync(p, { recursive: true, force: true }); console.log(`removed ${p}`); }
    catch (e) { console.log(`could not remove ${p}: ${e.message}`); }
  }
}

// ---- build + sign ----
if (!SKIP_BUILD) {
  run("npm", ["run", "build:page"]);
  run(path.join(DESKTOP, "node_modules", ".bin", "electron-builder"), [
    "--config", "electron-builder.mas.cjs", "--mac", "mas-dev", `--${ARCH}`, "--publish", "never", `-c.mas.appId=${ID}`,
  ], { env: { ...process.env, MAS_DEV_IDENTITY: "none" } });
}
if (!fs.existsSync(APP)) { console.error(`missing ${APP}`); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sealmark-sbx-"));
const plist = path.join(APP, "Contents", "Info.plist");
run("plutil", ["-replace", "CFBundleIdentifier", "-string", ID, plist]);
run("plutil", ["-replace", "ElectronTeamID", "-string", TEAM, plist]);
const ents = path.join(tmp, "entitlements.localtest.plist");
fs.copyFileSync(path.join(DESKTOP, "build", "entitlements.mas.plist"), ents);
run("/usr/libexec/PlistBuddy", ["-c", "Add :com.apple.security.application-groups array", "-c", `Add :com.apple.security.application-groups:0 string ${TEAM}.${ID}`, "-c", "Add :com.apple.security.network.server bool true", ents]);
// inner code first (helpers, framework, dylibs: sandbox + inherit), then the app itself
run("codesign", ["--force", "--deep", "--sign", "-", "--entitlements", path.join(DESKTOP, "build", "entitlements.mas.inherit.plist"), APP]);
run("codesign", ["--force", "--sign", "-", "--entitlements", ents, APP]);
check("codesign --verify --deep --strict", out("codesign", ["--verify", "--deep", "--strict", APP]).status === 0);
const entsOf = (p) => out("codesign", ["-d", "--entitlements", "-", "--xml", p]).stdout;
const mainEnts = entsOf(APP), rendererEnts = entsOf(path.join(APP, "Contents", "Frameworks", "Sealmark Helper (Renderer).app"));
check("main entitlements: sandbox, user-selected r/w, app-scope bookmarks (+ test-only keys)", ["app-sandbox", "files.user-selected.read-write", "files.bookmarks.app-scope"].every((k) => mainEnts.includes(`com.apple.security.${k}`)) && !/device\.|\.print|network\.client|allow-jit/.test(mainEnts));
check("helper entitlements: sandbox + inherit", rendererEnts.includes("com.apple.security.app-sandbox") && rendererEnts.includes("com.apple.security.inherit"));

// ---- fresh state ----
cleanContainers();
const keychainBefore = keychainHas();
if (keychainBefore) console.log(`note: a "${KEYCHAIN_SERVICE}" Keychain item already exists; the safeStorage check is skipped and the item is left alone`);
const outside = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "sealmark-outside-")));
fs.writeFileSync(path.join(outside, "outside.pdf"), "%PDF-1.4\n%%EOF\n");
// the kernel's sandbox reports are streamed, not kept in the log store: collect them while the app runs
const streamFile = path.join(tmp, "stream.log");
const streamFd = fs.openSync(streamFile, "w");
const stream = spawn("/usr/bin/log", ["stream", "--style", "compact", "--predicate", 'sender == "Sandbox" OR subsystem == "com.apple.sandbox.reporting"'], { stdio: ["ignore", streamFd, streamFd] });
await new Promise((r) => setTimeout(r, 1500));
const env = { ...process.env };
for (const k of ["ELECTRON_RUN_AS_NODE", "PDFE_HOME_OVERRIDE", "PDFE_TEST_NO_DIALOGS", "PDFE_TEST_SANDBOXED", "PDFE_SEAL_SAFESTORAGE"]) delete env[k];
const exe = path.join(APP, "Contents", "MacOS", "Sealmark");

try {
  // ---- A: the real mapping (no test home) ----
  const app = await electron.launch({ executablePath: exe, env, timeout: 90_000 });
  try {
    const main = await app.evaluate(({ app: a }) => {
      const osm = process.mainModule.require("node:os");
      return { mas: process.mas === true, home: osm.homedir(), realHome: osm.userInfo().homedir, appData: a.getPath("appData"), userData: a.getPath("userData") };
    });
    console.log("main:", JSON.stringify(main));
    check("A: MAS Electron, sandboxed (HOME is the container)", main.mas && main.home === path.join(CONTAINER, "Data"), main.home);
    check("A: os.userInfo().homedir is the real home inside the sandbox", main.realHome === os.homedir(), main.realHome);
    check("A: userData inside the container's data store", main.userData === path.join(CONTAINER, "Data", "Library", "Application Support", "PDF Editor", ".electron"), main.userData);
    const page = await app.firstWindow();
    await page.waitForFunction(() => window.__pdfe && window.__pdfe.Store && window.__pdfe.Store.disk, null, { timeout: 30_000 });
    const pg = await page.evaluate(async () => {
      const d = await window.claude.use("desktop");
      const err = async (p) => { try { const v = await p; return Array.isArray(v) ? `list(${v.length})` : "resolved"; } catch (e) { return String(e.message); } };
      return {
        url: location.href, sandboxed: d.sandboxed, store: window.__pdfe.Store.DIR,
        home: await err(d.fs.readdir("~")), documents: await err(d.fs.stat("~/Documents/.")),
        support: (await d.fs.readdir("~/Library/Application Support")).map((e) => e.name),
      };
    });
    console.log("page:", JSON.stringify(pg));
    check("A: page loads from app:// with desktop.sandboxed", pg.url.startsWith("app://pdf-editor/") && pg.sandboxed === true, pg.url);
    const store = path.join(CONTAINER, "Data", "Library", "Application Support", "PDF Editor");
    check("A: data store created in the container", fs.existsSync(path.join(store, "docs")) || fs.existsSync(path.join(store, "prefs.json")) || fs.readdirSync(store).length > 0, store);
    check("A: page \"~\" is the real home (listing it is denied), app support is the container's", /^(EPERM|EACCES)/.test(pg.home) && pg.support.includes("PDF Editor"), `readdir("~") -> ${pg.home}; stat("~/Documents") -> ${pg.documents}`);
    await page.screenshot({ path: path.join(OUT, "sandbox-home-darwin.png") }).catch(() => {});
  } finally { await app.close().catch(() => {}); }

  // ---- B: the smoke test inside the sandbox ----
  const homes = path.join(CONTAINER, "Data", "smoke-homes");
  fs.mkdirSync(homes, { recursive: true });
  const smokeArgs = [path.join(DESKTOP, "test", "smoke.mjs"), "--app", APP, "--home", homes, "--outside", outside, "--expect-sandboxed", "--expect-mas"];
  if (!keychainBefore) smokeArgs.push("--safestorage");
  const smoke = spawnSync(process.execPath, smokeArgs, { stdio: "inherit", env, cwd: DESKTOP });
  check("B: smoke test inside the sandbox", smoke.status === 0, `exit ${smoke.status}`);
} catch (e) {
  check("sandbox run", false, e?.stack || String(e));
}

// ---- C: sandbox denials during the run ----
await new Promise((r) => setTimeout(r, 1500));
stream.kill();
fs.closeSync(streamFd);
const lines = fs.readFileSync(streamFile, "utf8").split("\n").filter((l) => /Sandbox: Sealmark[^(]*\(\d+\) deny/.test(l));
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "sandbox-denials.log"), lines.join("\n") + "\n");
const kinds = new Map();
for (const l of lines) {
  const m = /(?:(\d+) duplicate reports? for )?Sandbox: (Sealmark[^(]*)\(\d+\) deny\(\d+\) (\S+)\s*(.*)$/.exec(l);
  if (!m) continue;
  const k = `${m[2]}: ${m[3]} ${m[4].replace(outside, "<outside>").replace(os.homedir(), "~").replace(/pdfe-smoke-\w+/, "pdfe-smoke-*").slice(0, 120)}`;
  kinds.set(k, (kinds.get(k) || 0) + (m[1] ? +m[1] : 1));
}
console.log(`\nsandbox denials during the run (${lines.length} report lines, test/out/sandbox-denials.log):`);
for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${String(n).padStart(5)}  ${k}`);

// ---- cleanup ----
if (!KEEP) {
  cleanContainers();
  if (!keychainBefore && keychainHas()) {
    const del = out("security", ["delete-generic-password", "-s", KEYCHAIN_SERVICE]);
    console.log(del.status === 0 ? `removed Keychain item "${KEYCHAIN_SERVICE}"` : `could not remove Keychain item: ${del.stderr}`);
  }
  fs.rmSync(outside, { recursive: true, force: true });
}
fs.rmSync(tmp, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} sandbox checks passed${KEEP ? " (kept the container: " + CONTAINER + ")" : ""}`);
process.exit(failed.length ? 1 : 0);
