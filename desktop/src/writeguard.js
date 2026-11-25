"use strict";
// Where the page may write, rename or delete (main process only).
//
// The page (renderer) only ever hands main a path; it never decides on its own where a write may
// land. A write is allowed only
//   - inside the app's own data folder (the "roots": <appData>/PDF Editor), or
//   - at a place the user chose in this session through main: a file picked in a save panel, a
//     PDF picked in an open panel, granted again with access.request or opened from the OS
//     (Finder "Open With", the Dock, the command line, a second launch), or anything inside a
//     folder picked in an open panel.
//   - next to a PDF the user opened that way: a NEW .pdf file only (created exclusively, never
//     replacing or deleting anything), so "save next to the original" works without a panel.
// Grants live in memory for this launch only. Paths are compared after resolving symlinks (of
// the longest existing prefix), Unicode NFC and, on macOS/Windows, case, so "..", a symlinked
// folder or another spelling can't step outside a grant. Anything else is EPERM, which the page
// already treats as "needs permission" (it then asks with the save panel).
//
// The sandbox of the Mac App Store build still applies on top of this (security-scoped
// bookmarks, src/bookmarks.js): this guard narrows what the page may ask for, it never widens it.
const fs = require("node:fs");
const path = require("node:path");
const { fsError } = require("./paths");

/**
 * Canonical form of an OS path for comparisons: symlinks of the longest existing prefix
 * resolved, NFC, lower case where the file system is case-insensitive.
 * With strict, a dangling symlink on the way (realpath fails but the entry is a link) throws
 * EPERM: writing through it would create its target, wherever that is.
 */
function makeCanon({ realpath = fs.realpathSync.native, lstat = fs.lstatSync, caseInsensitive = process.platform !== "linux", pathImpl = path } = {}) {
  const P = pathImpl;
  return function canon(p, { strict = false } = {}) {
    let probe = P.resolve(String(p));
    const rest = [];
    for (let i = 0; i < 512; i++) {
      try { probe = P.join(realpath(probe), ...rest); break; }
      catch {
        if (strict) {
          let link = false;
          try { link = lstat(probe).isSymbolicLink(); } catch {}
          if (link) throw fsError("EPERM", `refusing to write through a broken symbolic link: ${p}`);
        }
        const up = P.dirname(probe);
        if (up === probe) { probe = P.join(probe, ...rest); break; }
        rest.unshift(P.basename(probe));
        probe = up;
      }
    }
    probe = probe.normalize("NFC");
    return caseInsensitive ? probe.toLowerCase() : probe;
  };
}

const OPS = new Set(["write", "mkdir", "remove", "replace"]);

/**
 * @param {object} o
 * @param {string[]} o.roots         the app's own data folder(s): every op allowed below them
 * @param {(p: string, o?: {strict?: boolean}) => string} o.canon   from makeCanon
 * @param {path.PlatformPath} [o.pathImpl]
 * @param {RegExp} [o.siblingExt]    which new files may be created next to an opened file
 */
function createWriteGuard({ roots, canon, pathImpl = path, siblingExt = /\.pdf$/i }) {
  const P = pathImpl;
  const files = new Set();     // exact files: write, replace, remove
  const folders = new Set();   // everything below them
  const siblings = new Set();  // folders of opened files: create a new .pdf only
  const inside = (base, c) => c.startsWith(base.endsWith(P.sep) ? base : base + P.sep);

  function grantFile(osPath, { siblings: alsoSiblings = false } = {}) {
    if (typeof osPath !== "string" || !osPath) return;
    const c = canon(osPath);
    files.add(c);
    if (alsoSiblings) siblings.add(P.dirname(c));
  }
  function grantFolder(osPath) {
    if (typeof osPath !== "string" || !osPath) return;
    folders.add(canon(osPath));
  }

  /**
   * May `op` land at osPath? Throws EPERM if not.
   * ops: "write" (create or overwrite a file), "mkdir", "remove" (rm, trash, the source of a
   * rename), "replace" (the target of a rename or copy).
   * @param {string} [label]  how the path is shown in the error (the page's own path)
   * @returns {{ exclusive: boolean, via: string }} exclusive: the file must be created new (open with "wx")
   */
  function check(osPath, op, label = osPath) {
    if (!OPS.has(op)) throw fsError("EINVAL", `unknown write operation ${op}`);
    let c;
    try { c = canon(osPath, { strict: true }); }
    catch (e) { throw e.code === "EPERM" ? fsError("EPERM", `refusing to write through a broken symbolic link: ${label}`) : e; }
    // the root or a granted folder itself may be created (mkdir -p), never removed or replaced
    const under = (base) => inside(base, c) || (op === "mkdir" && c === base);
    for (const r of roots) if (under(canon(r))) return { exclusive: false, via: "app data" };
    for (const f of folders) if (under(f)) return { exclusive: false, via: "folder" };
    if (op !== "mkdir" && files.has(c)) return { exclusive: false, via: "file" };
    if (op === "write" && siblings.has(P.dirname(c)) && siblingExt.test(c)) return { exclusive: true, via: "next to an opened file" };
    throw fsError("EPERM", `the app may only write into its own data folder or where you chose in this session (save panel, opened file or folder): ${label}`);
  }

  const granted = () => ({ files: [...files], folders: [...folders], siblings: [...siblings] });
  return { grantFile, grantFolder, check, granted };
}

module.exports = { createWriteGuard, makeCanon };
