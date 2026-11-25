// Unit tests (plain Node, no Electron): page path mapping incl. the Mac App Store (sandboxed)
// mapping, and the security-scoped bookmark store (src/bookmarks.js).
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

// ---- bookmarks ----
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pdfe-unit-"));
  const file = path.join(tmp, "ud", "bookmarks.json");
  const log = [];
  let active = 0;
  const startAccess = (b) => { log.push(`start ${b}`); active++; return () => { log.push(`stop ${b}`); active--; }; };
  const bm = createBookmarks({ file, enabled: true, startAccess });

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

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} unit checks passed`);
process.exit(failed.length ? 1 : 0);
