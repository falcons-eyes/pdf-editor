// Unit tests (plain Node, no Electron): page path mapping incl. the Mac App Store (sandboxed)
// mapping, the Microsoft Store package folder (src/msstore.js) and the security-scoped bookmark
// store (src/bookmarks.js), and the write allowlist (src/writeguard.js).
//
//   node test/unit.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createPathMapper, WIN_ROOT } = require(path.join(DESKTOP, "src", "paths.js"));
const { createBookmarks } = require(path.join(DESKTOP, "src", "bookmarks.js"));
const { packageOfExe, packageDataDir } = require(path.join(DESKTOP, "src", "msstore.js"));
const { createWriteGuard, makeCanon } = require(path.join(DESKTOP, "src", "writeguard.js"));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  return !!ok;
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- paths: DMG (darwin, literal), Windows, override, Mac App Store ----
{
  const mac = createPathMapper({ platform: "darwin", home: "/Users/u", appData: "/Users/u/Library/Application Support" });
  check("darwin: ~/Library/Application Support is literal", mac.toOs("~/Library/Application Support/PDF Editor") === "/Users/u/Library/Application Support/PDF Editor");
  check("darwin: home round trip", mac.toPage("/Users/u/Documents/a.pdf") === "~/Documents/a.pdf" && mac.toOs("~/Documents/a.pdf") === "/Users/u/Documents/a.pdf");
  check("darwin: a\\b.pdf is one file name", mac.toOs("~/a\\b.pdf") === "/Users/u/a\\b.pdf");

  const win = createPathMapper({ platform: "win32", home: "C:\\Users\\u", appData: "C:\\Users\\u\\AppData\\Roaming" });
  check("win32: app support -> %APPDATA%", win.toOs("~/Library/Application Support/PDF Editor") === "C:\\Users\\u\\AppData\\Roaming\\PDF Editor");
  check("win32: %APPDATA% -> page app support", win.toPage("C:\\Users\\u\\AppData\\Roaming\\PDF Editor\\docs") === "~/Library/Application Support/PDF Editor/docs");
  check("win32: drives", win.toOs("/") === WIN_ROOT && win.toOs("/D:/x/y.pdf") === "D:\\x\\y.pdf" && win.toPage("D:\\x\\y.pdf") === "/D:/x/y.pdf");

  const over = createPathMapper({ platform: "win32", home: "C:\\t\\home", appData: "C:\\Users\\u\\AppData\\Roaming", override: true });
  check("override: app support stays under the test home", over.toOs("~/Library/Application Support/PDF Editor") === "C:\\t\\home\\Library\\Application Support\\PDF Editor");

  // the store build: "~" is the real home, app support is the container's
  const C = "/Users/u/Library/Containers/com.falconoon.sealworks/Data";
  const mas = createPathMapper({ platform: "darwin", home: "/Users/u", appData: `${C}/Library/Application Support`, mapAppSupport: true });
  check("mas: data store -> container appData", mas.toOs("~/Library/Application Support/PDF Editor") === `${C}/Library/Application Support/PDF Editor`);
  check("mas: app support root -> container appData", mas.toOs("~/Library/Application Support") === `${C}/Library/Application Support`);
  check("mas: container store -> page path ~/Library/Application Support/…", mas.toPage(`${C}/Library/Application Support/PDF Editor/docs/x.pdf`) === "~/Library/Application Support/PDF Editor/docs/x.pdf");
  check("mas: ~ is the real home", mas.toOs("~") === "/Users/u" && mas.toOs("~/Documents/a.pdf") === "/Users/u/Documents/a.pdf" && mas.toPage("/Users/u/Desktop/b.pdf") === "~/Desktop/b.pdf");
  check("mas: ~/Library (other) stays real", mas.toOs("~/Library/Preferences") === "/Users/u/Library/Preferences" && mas.toOs("~/Library/Application Supportx/y") === "/Users/u/Library/Application Supportx/y");
  check("mas: other container paths map below the real home", mas.toPage(`${C}/tmp/z`) === "~/Library/Containers/com.falconoon.sealworks/Data/tmp/z");
  check("mas: outside home stays absolute", mas.toPage("/Volumes/USB/c.pdf") === "/Volumes/USB/c.pdf" && mas.toOs("/Volumes/USB/c.pdf") === "/Volumes/USB/c.pdf");
  check("mas: .. is resolved (main's guards see the real target)", mas.toOs("~/Library/Application Support/../../Documents/a.pdf") === `${C}/Documents/a.pdf`);
  // default (no mapAppSupport given) keeps the old behaviour
  const dflt = createPathMapper({ platform: "darwin", home: "/Users/u", appData: `${C}/Library/Application Support` });
  check("darwin default: no app-support mapping", dflt.toOs("~/Library/Application Support/PDF Editor") === "/Users/u/Library/Application Support/PDF Editor");
}

// ---- Microsoft Store package (MSIX): family name from the install folder, data in LocalState ----
{
  const exe = "C:\\Program Files\\WindowsApps\\FalconEyesInc.Sealworks_1.1.0.0_x64__8wekyb3d8bbwe\\app\\Sealworks.exe";
  const pkg = packageOfExe(exe);
  check("msstore: package full name parsed from the exe path", pkg?.name === "FalconEyesInc.Sealworks" && pkg.version === "1.1.0.0" && pkg.arch === "x64" && pkg.resourceId === "" && pkg.familyName === "FalconEyesInc.Sealworks_8wekyb3d8bbwe", JSON.stringify(pkg));
  check("msstore: other drives, arm64, forward slashes", packageOfExe("D:/WindowsApps/A.B-c_2.0.1.0_arm64_~_abcdefghijklm/app/Sealworks.exe")?.familyName === "A.B-c_abcdefghijklm");
  check("msstore: not a package install -> null", [
    "C:\\Users\\u\\AppData\\Local\\Programs\\Sealworks\\Sealworks.exe",
    "C:\\Program Files\\WindowsApps\\Sealworks.exe",
    "C:\\Program Files\\WindowsApps\\NotAPackage\\app\\Sealworks.exe",
    "C:\\Program Files\\WindowsApps\\A_1.0.0.0_x64__short\\app\\Sealworks.exe",
    "", undefined,
  ].every((e) => packageOfExe(e) === null));
  const local = "C:\\Users\\u\\AppData\\Local";
  const family = `${local}\\Packages\\FalconEyesInc.Sealworks_8wekyb3d8bbwe`;
  const dir = packageDataDir({ exe, localAppData: local, exists: (p) => p === family });
  check("msstore: data in the package's LocalState", dir === `${family}\\LocalState`, dir);
  check("msstore: package folder missing (not registered for this user) -> null", packageDataDir({ exe, localAppData: local, exists: () => false }) === null);
  const m = createPathMapper({ platform: "win32", home: "C:\\Users\\u", appData: dir });
  check("msstore: page store -> LocalState\\PDF Editor", m.toOs("~/Library/Application Support/PDF Editor/seal") === `${dir}\\PDF Editor\\seal`);
  check("msstore: LocalState -> page path, the real %APPDATA% stays a home path", m.toPage(`${dir}\\PDF Editor\\docs\\a.pdf`) === "~/Library/Application Support/PDF Editor/docs/a.pdf" && m.toPage("C:\\Users\\u\\AppData\\Roaming\\PDF Editor") === "~/AppData/Roaming/PDF Editor");
}

// ---- bookmarks ----
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pdfe-unit-"));
  const file = path.join(tmp, "ud", "bookmarks.json");
  const log = [];
  let active = 0;
  const startAccess = (b) => { log.push(`start ${b}`); active++; return () => { log.push(`stop ${b}`); active--; }; };
  // bookmarks exist only in the Mac App Store build: macOS paths on every test runner
  const bm = createBookmarks({ file, enabled: true, startAccess, pathImpl: path.posix });

  check("bookmarks: empty store, lookup null", bm.lookup("/Users/u/a.pdf") === null && bm.size() === 0 && !fs.existsSync(file));
  check("bookmarks: refuses empty bookmark data", bm.remember("/Users/u/a.pdf", "", false) === false && bm.size() === 0);
  bm.remember("/Users/u/Documents/a.pdf", "FILE-A", false);
  bm.remember("/Users/u/Projects", "DIR-P", true);
  check("bookmarks: exact file hit", bm.lookup("/Users/u/Documents/a.pdf")?.b === "FILE-A");
  check("bookmarks: a file bookmark doesn't cover its folder or siblings", bm.lookup("/Users/u/Documents") === null && bm.lookup("/Users/u/Documents/b.pdf") === null);
  check("bookmarks: nearest folder above", bm.lookup("/Users/u/Projects/x/y/z.pdf")?.b === "DIR-P" && bm.lookup("/Users/u/Projects")?.b === "DIR-P");
  check("bookmarks: no false prefix match", bm.lookup("/Users/u/ProjectsOld/z.pdf") === null);
  check("bookmarks: case-insensitive and NFC/NFD alike (macOS)", bm.lookup("/users/U/projects/q.pdf")?.b === "DIR-P");
  bm.remember("/Users/u/한글".normalize("NFD"), "DIR-K", true);
  check("bookmarks: NFD remembered, NFC looked up", bm.lookup("/Users/u/한글/문서.pdf".normalize("NFC"))?.b === "DIR-K");
  bm.remember("/Users/u/Projects/x", "DIR-X", true);
  check("bookmarks: deeper folder wins", bm.lookup("/Users/u/Projects/x/y.pdf")?.b === "DIR-X");

  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  check("bookmarks: stored as {path: {b, dir, at}}", onDisk["/Users/u/Projects"]?.b === "DIR-P" && onDisk["/Users/u/Projects"].dir === true && onDisk["/Users/u/Documents/a.pdf"].dir === false && onDisk["/Users/u/Projects"].at > 0);
  check("bookmarks: file is private (0600)", process.platform === "win32" || (fs.statSync(file).mode & 0o777) === 0o600);
  const again = createBookmarks({ file, enabled: true, startAccess });
  check("bookmarks: reloaded from disk", again.size() === 4 && again.lookup("/Users/u/Projects/x/y.pdf")?.b === "DIR-X");
  check("bookmarks: forget", again.forget("/Users/u/Projects/x") && again.lookup("/Users/u/Projects/x/y.pdf")?.b === "DIR-P" && !again.forget("/nope"));

  // withAccess: starts and always stops, even when fn throws; passes the value through
  log.length = 0;
  const v = await bm.withAccess("/Users/u/Projects/x/y.pdf", async () => { if (active !== 1) throw new Error("not active"); return 42; });
  check("withAccess: start/stop around fn, value returned", v === 42 && eq(log, ["start DIR-X", "stop DIR-X"]) && active === 0, log.join(", "));
  log.length = 0;
  const err = await bm.withAccess("/Users/u/Documents/a.pdf", async () => { const e = new Error("EPERM: denied"); e.code = "EPERM"; throw e; }).catch((e) => e);
  check("withAccess: stops after a failure, error (and its code) kept", err?.code === "EPERM" && eq(log, ["start FILE-A", "stop FILE-A"]) && active === 0, log.join(", "));
  log.length = 0;
  check("withAccess: no bookmark -> fn runs without access", (await bm.withAccess("/Users/u/elsewhere.pdf", () => "plain")) === "plain" && log.length === 0);
  log.length = 0;
  await bm.withAccess2("/Users/u/Documents/a.pdf", "/Users/u/Projects/new.pdf", async () => { if (active !== 2) throw new Error("both should be active"); });
  check("withAccess2: both paths accessed", eq(log, ["start FILE-A", "start DIR-P", "stop DIR-P", "stop FILE-A"]) && active === 0, log.join(", "));
  const throwing = createBookmarks({ file: path.join(tmp, "t.json"), enabled: true, startAccess: () => { throw new Error("stale"); } });
  throwing.remember("/a/b", "X", true);
  check("withAccess: a failing start still runs fn", (await throwing.withAccess("/a/b/c", () => "ran")) === "ran");
  const noApi = createBookmarks({ file: path.join(tmp, "n.json"), enabled: true });
  noApi.remember("/a/b", "X", true);
  check("withAccess: no startAccess API (regular Electron) -> fn runs", (await noApi.withAccess("/a/b/c", () => "ran")) === "ran");

  // limit: the oldest entries go first
  const small = createBookmarks({ file: path.join(tmp, "small.json"), enabled: true, startAccess, max: 3 });
  const realNow = Date.now;
  let t = 1000;
  Date.now = () => t++;
  try { for (const n of ["a", "b", "c", "d", "e"]) small.remember(`/v/${n}`, n.toUpperCase(), true); }
  finally { Date.now = realNow; }
  check("bookmarks: capped, oldest dropped", small.size() === 3 && small.lookup("/v/a") === null && small.lookup("/v/b") === null && small.lookup("/v/e/x")?.b === "E");
  small.remember("/v/c", "C2", true);
  check("bookmarks: re-remembering refreshes the entry", small.lookup("/v/c")?.b === "C2" && small.size() === 3);

  // disabled (DMG, Windows): nothing stored, fn runs directly
  const off = createBookmarks({ file: path.join(tmp, "off.json"), enabled: false, startAccess });
  log.length = 0;
  check("disabled: remember is a no-op", off.remember("/x", "B", true) === false && !fs.existsSync(path.join(tmp, "off.json")));
  check("disabled: withAccess just runs fn", (await off.withAccess("/x/y", () => 7)) === 7 && log.length === 0);

  fs.writeFileSync(path.join(tmp, "bad.json"), "{not json");
  const bad = createBookmarks({ file: path.join(tmp, "bad.json"), enabled: true, startAccess });
  check("bookmarks: a corrupt file reads as empty", bad.size() === 0 && bad.lookup("/x") === null);
  const cs = createBookmarks({ file: path.join(tmp, "cs.json"), enabled: true, startAccess, caseInsensitive: false });
  cs.remember("/Data/A", "A", true);
  check("bookmarks: case-sensitive mode (Linux)", cs.lookup("/data/a/x") === null && cs.lookup("/Data/A/x")?.b === "A");
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- write allowlist (src/writeguard.js): the data store + what the user picked this session ----
{
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "pdfe-unit-wg-")));
  const J = (...a) => path.join(tmp, ...a);
  for (const d of ["store/docs", "outside", "picked/sub", "pickedOld", "opened", "elsewhere"]) fs.mkdirSync(J(d), { recursive: true });
  fs.writeFileSync(J("opened", "orig.pdf"), "%PDF");
  fs.writeFileSync(J("opened", "existing.pdf"), "%PDF");
  fs.writeFileSync(J("elsewhere", "chosen.pdf"), "");
  let links = true;
  try {
    fs.symlinkSync(J("outside"), J("store", "link"));                          // store/link -> outside
    fs.symlinkSync(J("outside", "planted.txt"), J("store", "dangling"));       // dangling, points outside
    fs.symlinkSync(J("outside"), J("picked", "escape"));                       // a granted folder's way out
    fs.symlinkSync(J("picked"), J("alias"));                                   // another name for a granted folder
  } catch { links = false; } // Windows without symlink rights
  const ci = process.platform !== "linux";
  const canon = makeCanon({ caseInsensitive: ci });
  const g = createWriteGuard({ roots: [J("store")], canon });
  const code = (p, op) => { try { const r = g.check(p, op); return r.exclusive ? "new-only" : "ok"; } catch (e) { return e.code || String(e); } };

  check("guard: the data store is writable (files, subfolders, mkdir, remove, replace)", ["write", "mkdir", "remove", "replace"].every((op) => code(J("store", "docs", "a.pdf"), op) === "ok") && code(J("store", "new", "deep"), "mkdir") === "ok");
  check("guard: the store folder itself may be created, never removed or replaced", code(J("store"), "mkdir") === "ok" && code(J("store"), "remove") === "EPERM" && code(J("store"), "replace") === "EPERM");
  check("guard: nothing outside is writable before a grant", ["write", "mkdir", "remove", "replace"].every((op) => code(J("outside", "x.pdf"), op) === "EPERM") && code(J("opened", "orig.pdf"), "write") === "EPERM");
  check("guard: ../ out of the store is refused", code(J("store") + "/../outside/x.pdf", "write") === "EPERM" && code(J("store", "docs", "..", "..", "outside", "y"), "replace") === "EPERM" && code(J("store", "docs", "..", "ok.json"), "write") === "ok");
  check("guard: a sibling folder with the same prefix doesn't count", code(J("storeX", "a"), "write") === "EPERM" && code(J("store") + "X/a", "write") === "EPERM");
  check("guard: unknown op -> EINVAL", code(J("store", "a"), "chmod") === "EINVAL");
  let e0 = null; try { g.check(J("outside", "z"), "write"); } catch (e) { e0 = e; }
  check("guard: the error reads EPERM: … with the path", /^EPERM: .*outside/.test(e0?.message || "") && e0.code === "EPERM", e0?.message);
  if (ci) check("guard: case-insensitive file systems: another spelling of the store is the store", code(J("store").toUpperCase().replace(tmp.toUpperCase(), tmp) + "/A.PDF", "write") === "ok" && code(J("STORE", "x"), "write") === "ok");
  check("guard: NFD and NFC spellings are the same folder", (() => {
    const k = J("store", "한글".normalize("NFD"));
    const g2 = createWriteGuard({ roots: [k], canon });
    try { return g2.check(J("store", "한글".normalize("NFC"), "a.pdf"), "write").exclusive === false; } catch { return false; }
  })());

  if (links) {
    // (resolved before the check, so even removing or replacing the link entry itself is refused)
    check("guard: a symlink inside the store that points outside is refused", code(J("store", "link", "x.pdf"), "write") === "EPERM" && code(J("store", "link", "x.pdf"), "replace") === "EPERM" && code(J("store", "link"), "remove") === "EPERM");
    check("guard: writing through a dangling symlink is refused", code(J("store", "dangling"), "write") === "EPERM" && !fs.existsSync(J("outside", "planted.txt")));
  }

  // a folder picked in an open panel: everything below it
  g.grantFolder(J("picked"));
  check("guard: picked folder -> files and subfolders inside", ["write", "mkdir", "remove", "replace"].every((op) => code(J("picked", "sub", "a.pdf"), op) === "ok"));
  check("guard: picked folder doesn't cover its parent, siblings or same-prefix folders", code(J("x.pdf"), "write") === "EPERM" && code(J("pickedOld", "a.pdf"), "write") === "EPERM" && code(J("picked", "..", "outside", "a"), "write") === "EPERM");
  if (links) {
    check("guard: a symlink out of the picked folder is refused", code(J("picked", "escape", "a.pdf"), "write") === "EPERM");
    check("guard: the picked folder through another name (symlink) is the same folder", code(J("alias", "b.pdf"), "write") === "ok");
  }

  // a file picked in a save panel: exactly that file
  g.grantFile(J("elsewhere", "chosen.pdf"));
  check("guard: save-panel file -> write, replace, remove that file", ["write", "replace", "remove"].every((op) => code(J("elsewhere", "chosen.pdf"), op) === "ok"));
  check("guard: save-panel file -> not its folder or neighbours", code(J("elsewhere", "other.pdf"), "write") === "EPERM" && code(J("elsewhere"), "mkdir") === "EPERM" && code(J("elsewhere", "chosen.pdf", "x"), "mkdir") === "EPERM");

  // a PDF the user opened: the file itself, plus new .pdf files next to it (created exclusively)
  g.grantFile(J("opened", "orig.pdf"), { siblings: true });
  check("guard: opened file -> write/replace/remove the file itself", ["write", "replace", "remove"].every((op) => code(J("opened", "orig.pdf"), op) === "ok"));
  check("guard: next to an opened file -> a new .pdf only (exclusive create)", code(J("opened", "new.pdf"), "write") === "new-only" && code(J("opened", "NEW2.PDF"), "write") === "new-only");
  check("guard: next to an opened file -> no other types, no remove/replace/mkdir, not below", code(J("opened", "run.command"), "write") === "EPERM" && code(J("opened", "note.txt"), "write") === "EPERM" && code(J("opened", "existing.pdf"), "remove") === "EPERM" && code(J("opened", "existing.pdf"), "replace") === "EPERM" && code(J("opened", "d"), "mkdir") === "EPERM" && code(J("opened", "d", "x.pdf"), "write") === "EPERM");
  // exclusive really means exclusive: an existing sibling can't be overwritten with flag "wx"
  const ex = (() => { try { fs.writeFileSync(J("opened", "existing.pdf"), "x", { flag: "wx" }); return "written"; } catch (e) { return e.code; } })();
  check("guard: exclusive create (\"wx\") of an existing sibling fails EEXIST", ex === "EEXIST" && fs.readFileSync(J("opened", "existing.pdf"), "utf8") === "%PDF");
  // a file created next to the opened one becomes an exact grant (main grants it after the write)
  g.grantFile(J("opened", "new.pdf"));
  check("guard: a file the app created this session can be saved again", code(J("opened", "new.pdf"), "write") === "ok");
  check("guard: granted() lists canonical paths", g.granted().files.length === 3 && g.granted().folders.length === 1 && g.granted().siblings.length === 1);

  // a fresh guard (next launch): nothing granted any more
  const g3 = createWriteGuard({ roots: [J("store")], canon });
  check("guard: grants don't outlive the launch", (() => { try { g3.check(J("picked", "a.pdf"), "write"); return false; } catch (e) { return e.code === "EPERM"; } })());
  fs.rmSync(tmp, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} unit checks passed`);
process.exit(failed.length ? 1 : 0);
