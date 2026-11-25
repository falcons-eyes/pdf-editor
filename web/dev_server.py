"""Local preview for the PDF Editor artifact.

The artifact host wraps the page in a small HTML skeleton at publish time;
this server does the same on every request, so a reload shows the latest
edit exactly as it will be published. Other files (vendor/…) are served as-is.

    python3 web/dev_server.py [port]

Open http://localhost:4310/?desktop=1 to test the installed-app code paths:
the page then gets a stand-in for Claude's `desktop` capability whose file
calls are served from a sandbox folder (PDFE_DEV_HOME, used as "~"). Add
&perm=prompt to start without file access granted, &os=win32 for Windows
wording and layout, &standalone=1 for the Electron app's extra hooks (native dialogs,
setLanguage, and a clearly fake in-memory `seal` so the seal UI can be exercised; the real
signing lives in desktop/). This stand-in exists only here; it is never part of the
published artifact.
"""

import base64
import http.server
import json
import os
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent
PAGE = ROOT / "pdf-editor.html"
DEV_HOME = pathlib.Path(os.environ.get("PDFE_DEV_HOME", ROOT / ".devhome")).resolve()
SKELETON_HEAD = (
    "<!doctype html><html><head><meta charset=utf8>"
    '<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);"
    "padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;"
    "font:14px/1.4 system-ui,-apple-system,sans-serif}img{max-width:100%}"
    "[hidden]{display:none!important}</style></head><body>"
)
SKELETON_TAIL = "</body></html>"

DESKTOP_SHIM = r"""<script>
(() => {
  const q = new URLSearchParams(location.search);
  let perm = q.get("perm") || "granted";
  const call = async (op, args) => {
    const r = await fetch("/__fs", { method: "POST", headers: { "Content-Type": "application/json", "X-PDFE-Dev": "1" }, body: JSON.stringify({ op, ...args }) });
    const j = await r.json(); if (j.error) throw new Error(j.error); return j.result;
  };
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const log = (...a) => (window.__shimLog ||= []).push(a);
  const fs = {
    readFile: async (path, enc) => { const r = await call("readFile", { path }); return enc === "utf8" ? new TextDecoder().decode(unb64(r)) : enc === "base64" ? r : unb64(r); },
    writeFile: (path, data, enc) => call("writeFile", { path, data: typeof data === "string" ? b64(new TextEncoder().encode(data)) : b64(new Uint8Array(data)) }),
    readdir: (path) => call("readdir", { path }), stat: (path) => call("stat", { path }), exists: (path) => call("exists", { path }),
    mkdir: (path, o) => call("mkdir", { path, recursive: !!o?.recursive }), rename: (from, to) => call("rename", { from, to }),
    rm: (path, o) => call("rm", { path, force: !!o?.force }), copyFile: (from, to) => call("copyFile", { from, to }),
  };
  const desktop = {
    install: { state: async () => "installed", request: async () => "installed" },
    permissions: {
      state: async (n) => (n ? (n === "full-access" ? perm : "unavailable") : { "full-access": perm }),
      request: async () => { perm = "granted"; log("permissions.request"); return { "full-access": perm }; },
      manage: async () => log("permissions.manage"),
    },
    window: { setOptions: async (o) => (log("setOptions", o), { applied: "now", reloading: false, options: o }), getOptions: async () => ({}), show: async () => {}, hide: async () => {} },
    Menu: { setApplicationMenu: async (t) => { window.__shimMenu = t; }, popup: async () => {} },
    app: { dock: { setIcon: async (u) => (log("setIcon", u.length), { written: true }), setBadge: async () => true } },
    shell: { openPath: async (p) => log("openPath", p), showItemInFolder: async (p) => log("showItemInFolder", p), trashItem: async (p) => log("trashItem", p) },
    os: { platform: async () => q.get("os") || "darwin", arch: async () => "arm64" },
  };
  // &standalone=1 mimics the Electron app (desktop/): native dialogs, Open With, dropped-file paths.
  // Tests answer the dialog through window.__shimDialogNext and open files with window.__shimOpenFile(path).
  if (q.get("standalone")) Object.assign(desktop, {
    standalone: true, platform: q.get("os") || "darwin", version: "dev",
    dialog: { open: async (o) => { log("dialog.open", o); const r = window.__shimDialogNext ?? null; window.__shimDialogNext = undefined; return r; } },
    pathForFile: () => null,
    onOpenFile: (cb) => { window.__shimOpenFile = cb; },
    setLanguage: async (lang) => { log("setLanguage", lang); window.__shimLang = lang; },
    seal: mockSeal(),
  });
  // MOCK of desktop.seal (docs/design/seal-and-language.md) for exercising the page UI in a browser.
  // NOT a signature: "sign" appends a marker line with a SHA-256 of the bytes before it; "verify" reports
  // intact if that marker is present and the bytes before it are unchanged, modified otherwise, none without it.
  // The identity lives in memory only (a reload forgets it). Tests: window.__shimSealFail = "EIO: ..." makes
  // the next seal call reject; window.__shimSeal exposes the state.
  function mockSeal() {
    const MARK = "\n%PDFE-MOCK-SEAL ";
    const enc = new TextEncoder(), dec = new TextDecoder();
    const st = (window.__shimSeal = { id: null });
    const sha = async (u8) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", u8))].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const fail = () => { const f = window.__shimSealFail; if (f) { window.__shimSealFail = undefined; throw new Error(f); } };
    const lastIndexOf = (hay, needle) => { outer: for (let i = hay.length - needle.length; i >= 0; i--) { for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer; return i; } return -1; };
    const make = async ({ name, org, email }, imported = false) => {
      const fp = (await sha(enc.encode(name + "|" + (org || "") + "|" + Math.random()))).slice(0, 64).match(/.{4}/g).join(" ");
      const now = Date.now();
      return { name, org: org || undefined, email: email || undefined, fingerprint: fp, createdAt: now, notAfter: now + 10 * 365 * 864e5, imported };
    };
    return {
      identity: async () => (log("seal.identity"), st.id && { ...st.id }),
      createIdentity: async (o = {}) => {
        log("seal.createIdentity", o); fail();
        if (st.id && !o.replace) throw new Error("EEXIST: an identity already exists");
        if (!o.name) throw new Error("EINVAL: name is required");
        await new Promise((r) => setTimeout(r, 300)); // key generation takes a moment
        st.id = await make(o); return { ...st.id };
      },
      exportIdentity: async ({ password } = {}) => {
        log("seal.exportIdentity"); fail();
        if (!st.id) throw new Error("ENOENT: no identity");
        return enc.encode("MOCK-P12 " + JSON.stringify({ password, id: st.id }));
      },
      importIdentity: async (p12, { password } = {}) => {
        log("seal.importIdentity"); fail();
        const s = dec.decode(p12);
        if (!s.startsWith("MOCK-P12 ")) throw new Error("EINVAL: not a PKCS#12 file (mock reads only its own backups)");
        const j = JSON.parse(s.slice(9));
        if (j.password !== password) throw new Error("EPASSWORD: wrong password");
        st.id = { ...j.id, imported: true }; return { ...st.id };
      },
      removeIdentity: async () => { log("seal.removeIdentity"); st.id = null; },
      sign: async (pdf, o = {}) => {
        log("seal.sign", { bytes: pdf.byteLength, ...o }); fail();
        if (!st.id) throw new Error("ENOENT: no identity");
        const body = new Uint8Array(pdf);
        const info = { name: st.id.name, org: st.id.org, fingerprint: st.id.fingerprint, signedAt: Date.now(), reason: o.reason, len: body.length, sum: await sha(body) };
        const tail = enc.encode(MARK + JSON.stringify(info) + "\n");
        const out = new Uint8Array(body.length + tail.length); out.set(body); out.set(tail, body.length);
        await new Promise((r) => setTimeout(r, 200));
        return out;
      },
      verify: async (pdf) => {
        log("seal.verify", { bytes: pdf.byteLength }); fail();
        const u8 = new Uint8Array(pdf), at = lastIndexOf(u8, enc.encode(MARK));
        if (at < 0) return { status: "none", signatures: [] };
        let info; try { info = JSON.parse(dec.decode(u8.subarray(at + MARK.length)).split("\n")[0]); } catch { return { status: "invalid", signatures: [] }; }
        // unchanged before the marker, and nothing appended after its line (a re-save in another app appends)
        const before = u8.subarray(0, at), end = at + MARK.length + enc.encode(JSON.stringify(info)).length + 1;
        const ok = before.length === info.len && (await sha(before)) === info.sum && end === u8.length;
        const sig = { name: info.name, org: info.org, fingerprint: info.fingerprint, signedAt: info.signedAt, reason: info.reason, certify: true,
          coversWholeFile: ok, digestOk: true, signatureOk: true, mine: !!st.id && st.id.fingerprint === info.fingerprint, selfSigned: true };
        return { status: ok ? "intact" : "modified", signatures: [sig] };
      },
    };
  }
  get fs() {}
})();
</script>"""
# the getter line above is replaced below (kept simple: fs is attached only once access is granted)
DESKTOP_SHIM = DESKTOP_SHIM.replace(
    "  get fs() {}\n",
    '  Object.defineProperty(desktop, "fs", { get: () => (perm === "granted" ? fs : undefined) });\n'
    '  window.claude = { use: async (name) => (name === "desktop" ? desktop : null) };\n',
)


def resolve(path: str) -> pathlib.Path:
    """Map "~/x" (and relative paths) into DEV_HOME; refuse anything outside it."""
    if path == "~":
        p = DEV_HOME
    elif path.startswith("~/"):
        p = DEV_HOME / path[2:]
    elif path.startswith("/"):
        p = pathlib.Path(path)
    else:
        p = DEV_HOME / path
    p = p.resolve()
    if p != DEV_HOME and DEV_HOME not in p.parents:
        raise PermissionError(f"EACCES: outside the dev home: {path}")
    return p


def fs_op(req):
    op = req["op"]
    if op == "readFile":
        return base64.b64encode(resolve(req["path"]).read_bytes()).decode()
    if op == "writeFile":
        p = resolve(req["path"]); p.write_bytes(base64.b64decode(req["data"])); return None
    if op == "readdir":
        return [{"name": c.name, "isFile": c.is_file(), "isDirectory": c.is_dir(), "isSymbolicLink": c.is_symlink()}
                for c in sorted(resolve(req["path"]).iterdir())]
    if op == "stat":
        p = resolve(req["path"]); st = p.stat()
        return {"size": st.st_size, "mtimeMs": st.st_mtime * 1000, "isFile": p.is_file(), "isDirectory": p.is_dir(), "isSymbolicLink": p.is_symlink()}
    if op == "exists":
        try: return resolve(req["path"]).exists()
        except PermissionError: return False
    if op == "mkdir":
        resolve(req["path"]).mkdir(parents=req.get("recursive", False), exist_ok=req.get("recursive", False)); return None
    if op == "rename":
        resolve(req["from"]).replace(resolve(req["to"])); return None
    if op == "rm":
        p = resolve(req["path"])
        if not p.exists():
            if req.get("force"): return None
            raise FileNotFoundError(f"ENOENT: {req['path']}")
        shutil.rmtree(p) if p.is_dir() else p.unlink(); return None
    if op == "copyFile":
        shutil.copyfile(resolve(req["from"]), resolve(req["to"])); return None
    raise ValueError(f"EINVAL: unknown op {op}")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path in ("/", "/index.html"):
            shim = DESKTOP_SHIM if "desktop=1" in query else ""
            body = (SKELETON_HEAD + shim + PAGE.read_text(encoding="utf-8") + SKELETON_TAIL).encode()
            self._send(200, body, "text/html; charset=utf-8")
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/__fs":
            self._send(404, b"{}", "application/json"); return
        # only this page may use the file API: other sites can't send the custom header without a
        # CORS preflight (which this server never answers), and DNS rebinding fails the Host check
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0]
        origin = self.headers.get("Origin")
        if (self.headers.get("X-PDFE-Dev") != "1" or host not in ("localhost", "127.0.0.1")
                or (origin and origin.split("://", 1)[-1].rsplit(":", 1)[0] not in ("localhost", "127.0.0.1"))):
            self._send(403, b'{"error":"EACCES: forbidden"}', "application/json"); return
        req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        try:
            out = {"result": fs_op(req)}
        except FileNotFoundError as e:
            out = {"error": f"ENOENT: {e}"}
        except PermissionError as e:
            out = {"error": str(e) if str(e).startswith("E") else f"EACCES: {e}"}
        except FileExistsError as e:
            out = {"error": f"EEXIST: {e}"}
        except Exception as e:  # noqa: BLE001 - dev tool, report everything
            out = {"error": f"EIO: {e}"}
        self._send(200, json.dumps(out).encode(), "application/json")

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4310
    DEV_HOME.mkdir(parents=True, exist_ok=True)
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
