"use strict";
// Page path namespace <-> OS paths.
//
// The page always speaks "/"-separated paths: "~" and "~/x" are the home folder, anything else
// is absolute. On Windows an OS path C:\a\b is the page path /C:/a/b (UNC \\srv\share\x is
// //srv/share/x, and "/" alone is the list of drives). The page keeps its data store under
// "~/Library/Application Support/<X>", which on Windows and Linux is <appData>/<X>.
// With a home override (tests), "~" is the override folder and that mapping is literal.
const path = require("node:path");

const APP_SUPPORT = "Library/Application Support";

function fsError(code, message) {
  const e = new Error(`${code}: ${message}`);
  e.code = code;
  return e;
}

function createPathMapper({ platform, home, appData, override = false }) {
  const isWin = platform === "win32";
  const P = isWin ? path.win32 : path.posix;
  const mapAppSupport = platform !== "darwin" && !override;
  // backslash separates folders only on Windows; on a Mac a\b.pdf is a legal file name
  const parts = (s) => s.split(isWin ? /[\\/]+/ : /\/+/).filter(Boolean);
  const within = (base, p) => {
    const rel = P.relative(base, p);
    return rel === "" || (!rel.startsWith("..") && !P.isAbsolute(rel));
  };

  /** page path -> OS path; returns WIN_ROOT for "/" on Windows */
  function toOs(p) {
    if (typeof p !== "string" || !p || p.includes("\0")) throw fsError("EINVAL", `invalid path: ${String(p)}`);
    if (p === "~" || p.startsWith("~/")) {
      const rest = p === "~" ? "" : p.slice(2);
      if (mapAppSupport && (rest === APP_SUPPORT || rest.startsWith(APP_SUPPORT + "/"))) {
        return P.join(appData, ...parts(rest.slice(APP_SUPPORT.length)));
      }
      return P.join(home, ...parts(rest));
    }
    if (isWin) {
      if (p === "/") return WIN_ROOT;
      const drive = /^\/?([A-Za-z]):(?:[\\/](.*))?$/.exec(p);
      if (drive) return P.join(`${drive[1].toUpperCase()}:\\`, ...parts(drive[2] || ""));
      if (p.startsWith("//") || p.startsWith("\\\\")) {
        const seg = parts(p);
        if (seg.length < 2) throw fsError("ENOENT", `no such file or directory: ${p}`);
        return "\\\\" + seg.join("\\");
      }
      if (p.startsWith("/")) throw fsError("ENOENT", `no such file or directory: ${p}`);
      return P.join(home, ...parts(p));
    }
    if (p.startsWith("/")) return P.normalize(p);
    return P.join(home, ...parts(p));
  }

  /** OS path -> page path */
  function toPage(o) {
    if (typeof o !== "string" || !o) return null;
    o = P.resolve(o);
    if (mapAppSupport && within(appData, o)) {
      const rel = P.relative(appData, o);
      return `~/${APP_SUPPORT}` + (rel ? "/" + parts(rel).join("/") : "");
    }
    if (within(home, o)) {
      const rel = P.relative(home, o);
      return rel ? "~/" + parts(rel).join("/") : "~";
    }
    if (isWin) {
      if (o.startsWith("\\\\")) return "//" + parts(o).join("/");
      const m = /^([A-Za-z]):[\\/]?(.*)$/.exec(o);
      if (m) return `/${m[1].toUpperCase()}:` + (m[2] ? "/" + parts(m[2]).join("/") : "");
    }
    return o;
  }

  return { toOs, toPage };
}

const WIN_ROOT = Symbol("windows-drives");

module.exports = { createPathMapper, fsError, WIN_ROOT };
