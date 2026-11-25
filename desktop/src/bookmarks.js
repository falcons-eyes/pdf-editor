"use strict";
// Security-scoped bookmarks for the Mac App Store (sandboxed) build. Main process only: the page
// never sees bookmark data, it only knows page paths.
//
// <userData>/bookmarks.json  { "<OS absolute path>": { "b": "<base64 bookmark>", "dir": bool, "at": ms } }
//
// Files and folders the user picks in an open/save panel (or grants again via access.request)
// are remembered here, so the next launch can reach them again: withAccess(osPath, fn) finds the
// bookmark for that path (or for the nearest folder above it), starts accessing it around fn and
// always stops again. Without a bookmark fn simply runs (the container, files granted for this
// launch by a panel, a drop or Finder's "Open With").
const fs = require("node:fs");
const path = require("node:path");

const MAX = 500;

/**
 * @param {object} o
 * @param {string} o.file              where the store lives (in userData, inside the container)
 * @param {boolean} o.enabled          false outside the sandboxed build: remember() is a no-op and withAccess() just runs fn
 * @param {(b: string) => (() => void)} [o.startAccess]  app.startAccessingSecurityScopedResource (MAS Electron only)
 * @param {boolean} [o.caseInsensitive] macOS/Windows file systems: compare paths case-insensitively
 * @param {number} [o.max]
 * @param {path.PlatformPath} [o.pathImpl]
 */
function createBookmarks({ file, enabled, startAccess, caseInsensitive = true, max = MAX, pathImpl = path }) {
  const P = pathImpl;
  let map = null;
  const key = (p) => {
    const k = P.resolve(String(p)).normalize("NFC");
    return caseInsensitive ? k.toLowerCase() : k;
  };
  function load() {
    if (map) return map;
    map = new Map();
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (raw && typeof raw === "object") {
        for (const [p, v] of Object.entries(raw)) {
          if (v && typeof v.b === "string" && v.b) map.set(key(p), { path: p, b: v.b, dir: !!v.dir, at: Number(v.at) || 0 });
        }
      }
    } catch {}
    return map;
  }
  function save() {
    const out = {};
    for (const v of map.values()) out[v.path] = { b: v.b, dir: v.dir, at: v.at };
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true }); // the store file is a local path, keys use P
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(out), { mode: 0o600 });
      fs.renameSync(tmp, file);
    } catch {}
  }

  /** remember a bookmark for an OS path (the latest wins; oldest entries beyond `max` are dropped) */
  function remember(osPath, bookmark, isDir) {
    if (!enabled || typeof osPath !== "string" || !osPath || typeof bookmark !== "string" || !bookmark) return false;
    const m = load();
    const k = key(osPath);
    m.delete(k);
    m.set(k, { path: P.resolve(osPath), b: bookmark, dir: !!isDir, at: Date.now() });
    if (m.size > max) {
      const byAge = [...m.entries()].sort((a, b) => a[1].at - b[1].at);
      for (const [k2] of byAge.slice(0, m.size - max)) m.delete(k2);
    }
    save();
    return true;
  }
  function forget(osPath) {
    const m = load();
    if (m.delete(key(osPath))) { save(); return true; }
    return false;
  }
  /** the bookmark for exactly this path, else for the nearest folder above it, else null */
  function lookup(osPath) {
    if (typeof osPath !== "string" || !osPath) return null;
    const m = load();
    if (!m.size) return null;
    let k = key(osPath);
    const exact = m.get(k);
    if (exact) return { ...exact };
    for (let i = 0; i < 256; i++) {
      const up = P.dirname(k);
      if (up === k) break;
      k = up;
      const hit = m.get(k);
      if (hit && hit.dir) return { ...hit };
    }
    return null;
  }
  async function withAccess(osPath, fn) {
    if (!enabled) return fn();
    const hit = lookup(osPath);
    if (!hit || typeof startAccess !== "function") return fn();
    let stop = null;
    try { stop = startAccess(hit.b); } catch {}
    try { return await fn(); }
    // always stop: an unbalanced start leaks kernel resources until the app quits
    finally { if (typeof stop === "function") { try { stop(); } catch {} } }
  }
  /** nested access for two paths (rename, copyFile) */
  const withAccess2 = (a, b, fn) => withAccess(a, () => withAccess(b, fn));
  const size = () => load().size;

  return { remember, forget, lookup, withAccess, withAccess2, size, file };
}

module.exports = { createBookmarks, MAX };
