"use strict";
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, protocol, safeStorage, screen, session, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const fsp = fs.promises;
const os = require("node:os");
const { createPathMapper, fsError, WIN_ROOT } = require("./paths");
const { createSeal } = require("./seal");

const IS_MAC = process.platform === "darwin";
function realpath(p) { try { return fs.realpathSync.native(p); } catch { return p; } }
const IS_WIN = process.platform === "win32";
const SCHEME = "app";
const HOST = "pdf-editor";
const ORIGIN = `${SCHEME}://${HOST}`;
const INDEX_URL = `${ORIGIN}/index.html`;
const REPO_URL = "https://github.com/falcons-eyes/pdf-editor";
const APP_DIR = path.join(__dirname, "..", "app");
const BAR_H = 52;
const OVERLAY = { light: { color: "#fbfcfe", symbolColor: "#171a22" }, dark: { color: "#1b1e25", symbolColor: "#e8eaf0" } };
const STAGE_BG = { light: "#e9ecf2", dark: "#111318" };

// PDFE_HOME_OVERRIDE (tests/dev): use this folder as the page's "~" and keep Electron's own data
// inside it too, so a run never touches the real data store or the real app's single-instance lock.
const HOME_OVERRIDE = process.env.PDFE_HOME_OVERRIDE ? realpath(path.resolve(process.env.PDFE_HOME_OVERRIDE)) : null;
const HOME = HOME_OVERRIDE || os.homedir();
// The page keeps its data in <appData>/PDF Editor (on macOS ~/Library/Application Support/PDF Editor),
// so Electron's own caches and settings must live elsewhere: a hidden subfolder.
app.setPath("userData", HOME_OVERRIDE ? path.join(HOME_OVERRIDE, ".pdfe-electron") : path.join(app.getPath("appData"), "PDF Editor", ".electron"));
const paths = createPathMapper({ platform: process.platform, home: HOME, appData: app.getPath("appData"), override: !!HOME_OVERRIDE });
// the page's data store and the sealer key folder inside it
const STORE_DIR = paths.toOs("~/Library/Application Support/PDF Editor");
const SEAL_DIR = path.join(STORE_DIR, "seal");

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true } },
]);

let win = null;
let quitting = false;

/* ---------------- files opened from the OS ---------------- */
const pendingOpen = [];
let openListening = false;
const isPdfArg = (a) => typeof a === "string" && !a.startsWith("-") && /\.pdf$/i.test(a);
function pdfsFromArgv(argv, cwd = process.cwd()) {
  return argv.slice(app.isPackaged ? 1 : 2).filter(isPdfArg).map((a) => path.resolve(cwd, a)).filter((p) => fs.existsSync(p));
}
function openFromOs(osPath) {
  const pagePath = paths.toPage(osPath);
  if (!pagePath) return;
  if (win && !win.isDestroyed() && openListening) win.webContents.send("pdfe:open-file", pagePath);
  else pendingOpen.push(pagePath);
  if (app.isReady()) showWindow();
}
// macOS: Finder "Open With", drag onto the Dock icon; may arrive before ready
app.on("open-file", (e, p) => { e.preventDefault(); openFromOs(p); });

/* ---------------- window ---------------- */
const theme = () => (nativeTheme.shouldUseDarkColors ? "dark" : "light");
let pageOverlay = false; // the page set its own overlay colors; stop following the OS theme
const stateFile = () => path.join(app.getPath("userData"), "window-state.json");
function loadBounds() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    const w = Math.max(880, s.width | 0), h = Math.max(600, s.height | 0);
    if (Number.isFinite(s.x) && Number.isFinite(s.y)) {
      const visible = screen.getAllDisplays().some(({ workArea: a }) =>
        s.x < a.x + a.width - 80 && s.x + w > a.x + 80 && s.y >= a.y - 10 && s.y < a.y + a.height - 60);
      if (visible) return { x: s.x, y: s.y, width: w, height: h, maximized: !!s.maximized };
    }
    return { width: w, height: h, maximized: !!s.maximized };
  } catch {
    return { width: 1320, height: 860, maximized: false };
  }
}
let saveBoundsTimer = null;
function saveBounds() {
  if (!win || win.isDestroyed()) return;
  const b = win.getNormalBounds();
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch {}
}
const saveBoundsSoon = () => { clearTimeout(saveBoundsTimer); saveBoundsTimer = setTimeout(saveBounds, 500); };

function createWindow() {
  const b = loadBounds();
  const opts = {
    x: b.x, y: b.y, width: b.width, height: b.height, minWidth: 880, minHeight: 600,
    title: "PDF Editor", show: false, backgroundColor: STAGE_BG[theme()],
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false,
      spellcheck: false, navigateOnDragDrop: false,
    },
  };
  if (IS_MAC) Object.assign(opts, { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 18, y: 19 } });
  else Object.assign(opts, { titleBarStyle: "hidden", titleBarOverlay: { ...OVERLAY[theme()], height: BAR_H } });
  if (process.platform === "linux") opts.icon = path.join(APP_DIR, "icon.png");

  win = new BrowserWindow(opts);
  if (b.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  for (const ev of ["resize", "move", "maximize", "unmaximize"]) win.on(ev, saveBoundsSoon);

  const wc = win.webContents;
  wc.on("did-start-navigation", (d) => { if (d.isMainFrame && !d.isSameDocument) openListening = false; });
  wc.on("render-process-gone", () => { openListening = false; });
  win.on("close", (e) => {
    saveBounds();
    if (win.__flushed) return;
    // let the page write out its debounced state before the renderer goes away
    e.preventDefault();
    win.__flushed = true;
    flushPage(win).finally(() => {
      if (!win || win.isDestroyed()) return;
      win.destroy();
    });
  });
  win.on("closed", () => { win = null; openListening = false; if (quitting || !IS_MAC) app.quit(); });

  win.loadURL(INDEX_URL);
  return win;
}

// Fire the page's own pagehide flush, then wait until its file writes settle (max 4 s).
let fsInFlight = 0, fsLastActivity = 0;
async function flushPage(w) {
  try { await w.webContents.executeJavaScript("dispatchEvent(new Event('pagehide')); true", true); } catch {}
  const until = Date.now() + 4000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 100));
    if (fsInFlight === 0 && Date.now() - fsLastActivity > 350) break;
  }
}

function showWindow() {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

nativeTheme.on("updated", () => {
  if (!win || win.isDestroyed()) return;
  win.setBackgroundColor(STAGE_BG[theme()]);
  if (!IS_MAC && !pageOverlay) { try { win.setTitleBarOverlay({ ...OVERLAY[theme()], height: BAR_H }); } catch {} }
});

/* ---------------- app:// protocol ---------------- */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".woff2": "font/woff2", ".woff": "font/woff",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".map": "application/json",
};
async function serveApp(request) {
  let url;
  try { url = new URL(request.url); } catch { return new Response("bad request", { status: 400 }); }
  if (url.host !== HOST || !["GET", "HEAD"].includes(request.method)) return new Response("not found", { status: 404 });
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return new Response("bad request", { status: 400 }); }
  if (rel === "/" || rel === "") rel = "/index.html";
  const file = path.resolve(APP_DIR, "." + path.posix.normalize(rel));
  if (rel.includes("\0") || !file.startsWith(APP_DIR + path.sep)) return new Response("forbidden", { status: 403 });
  try {
    const body = await fsp.readFile(file);
    return new Response(request.method === "HEAD" ? null : body, {
      headers: {
        "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "content-security-policy": CSP,
        "x-content-type-options": "nosniff",
        "cache-control": "no-cache",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

/* ---------------- IPC: the desktop API ---------------- */
function trusted(e) {
  const f = e.senderFrame;
  return !!f && f.parent === null && typeof f.url === "string" && f.url.startsWith(ORIGIN + "/") && !!win && e.sender === win.webContents;
}
const errText = (err) => {
  const code = typeof err?.code === "string" && /^E[A-Z0-9]+$/.test(err.code) ? err.code : "EIO";
  const msg = String(err?.message || err);
  return /^E[A-Z0-9]+:/.test(msg) ? msg : `${code}: ${msg}`;
};
function handle(channel, fn) {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!trusted(e)) return { ok: false, error: "EPERM: untrusted sender" };
    try { return { ok: true, value: await fn(...args) }; }
    catch (err) { return { ok: false, error: errText(err) }; }
  });
}

async function winDrives() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const ok = await Promise.all(letters.map((l) => fsp.access(`${l}:\\`).then(() => true, () => false)));
  return letters.filter((_, i) => ok[i]);
}
const dirStat = () => ({ size: 0, mtimeMs: 0, isFile: false, isDirectory: true, isSymbolicLink: false });
const noRoot = (p) => { throw fsError("EPERM", `operation not permitted on the drive list: ${p}`); };
const osPath = (p) => { const o = paths.toOs(p); return o === WIN_ROOT ? noRoot(p) : o; };
// The sealer key folder is main's alone: the page may list it, never read or change what is in it.
const canon = (p) => {
  let probe = path.resolve(p), rest = [];
  for (let i = 0; i < 64; i++) {
    try { probe = path.join(fs.realpathSync.native(probe), ...rest); break; }
    catch { const up = path.dirname(probe); if (up === probe) break; rest.unshift(path.basename(probe)); probe = up; }
  }
  probe = probe.normalize("NFC");
  return IS_MAC || IS_WIN ? probe.toLowerCase() : probe;
};
function guarded(p, { tree = false } = {}) {
  const o = osPath(p);
  const seal = canon(SEAL_DIR), c = canon(o);
  if (c === seal || c.startsWith(seal + path.sep)) throw fsError("EPERM", `the sealer key folder is private: ${p}`);
  // moving, copying or deleting a folder that contains the key folder would expose or destroy it
  if (tree && (seal.startsWith(c.endsWith(path.sep) ? c : c + path.sep))) throw fsError("EPERM", `this folder holds the sealer key: ${p}`);
  return o;
}

const FS = {
  async readFile(p, enc) {
    const buf = await fsp.readFile(guarded(p));
    if (enc === "utf8" || enc === "utf-8") return buf.toString("utf8");
    if (enc === "base64") return buf.toString("base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  },
  async writeFile(p, data, enc) {
    let buf;
    if (typeof data === "string") buf = Buffer.from(data, enc === "base64" ? "base64" : "utf8");
    else if (data instanceof Uint8Array) buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    else throw fsError("EINVAL", "data must be a string or bytes");
    await fsp.writeFile(guarded(p), buf);
  },
  async readdir(p) {
    const o = paths.toOs(p);
    if (o === WIN_ROOT) return (await winDrives()).map((l) => ({ name: `${l}:`, isFile: false, isDirectory: true, isSymbolicLink: false }));
    const ents = await fsp.readdir(o, { withFileTypes: true });
    const out = await Promise.all(ents.map(async (d) => {
      let isFile = d.isFile(), isDirectory = d.isDirectory();
      const isSymbolicLink = d.isSymbolicLink();
      if (isSymbolicLink) { try { const st = await fsp.stat(path.join(o, d.name)); isFile = st.isFile(); isDirectory = st.isDirectory(); } catch {} }
      return { name: d.name, isFile, isDirectory, isSymbolicLink };
    }));
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  },
  async stat(p) {
    const o = paths.toOs(p);
    if (o === WIN_ROOT) return dirStat();
    const l = await fsp.lstat(o);
    const st = l.isSymbolicLink() ? await fsp.stat(o).catch(() => l) : l;
    return { size: st.size, mtimeMs: st.mtimeMs, isFile: st.isFile(), isDirectory: st.isDirectory(), isSymbolicLink: l.isSymbolicLink() };
  },
  async exists(p) {
    try {
      const o = paths.toOs(p);
      if (o === WIN_ROOT) return true;
      await fsp.access(o); return true;
    } catch { return false; }
  },
  async mkdir(p, o) { await fsp.mkdir(guarded(p), { recursive: !!o?.recursive }); },
  async rename(from, to) { await fsp.rename(guarded(from, { tree: true }), guarded(to, { tree: true })); },
  // the page only deletes its own single files (保管함 copies, thumbnails): folders are refused,
  // so a bug or injected script can never wipe a whole tree
  async rm(p, o) {
    const target = guarded(p);
    const st = await fsp.lstat(target).catch((e) => { if (e.code === "ENOENT" && o?.force) return null; throw e; });
    if (!st) return;
    if (st.isDirectory()) throw fsError("EPERM", `refusing to delete a folder: ${p}`);
    await fsp.rm(target, { force: !!o?.force });
  },
  async copyFile(from, to) { await fsp.copyFile(guarded(from, { tree: true }), guarded(to, { tree: true })); },
};

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];
async function openDialog(o = {}) {
  const kind = ["pdf", "image", "folder", "cert"].includes(o?.kind) ? o.kind : "pdf";
  const props = kind === "folder" ? ["openDirectory", "createDirectory"] : ["openFile"];
  if (o.multiple && kind !== "folder") props.push("multiSelections");
  const filters = kind === "pdf" ? [{ name: "PDF", extensions: ["pdf"] }]
    : kind === "image" ? [{ name: L().images, extensions: IMAGE_EXT }]
    : kind === "cert" ? [{ name: L().certs, extensions: ["p12", "pfx"] }] : undefined;
  let defaultPath;
  if (typeof o.start === "string") { try { const s = paths.toOs(o.start); if (s !== WIN_ROOT) defaultPath = s; } catch {} }
  const opts = { title: typeof o.title === "string" ? o.title : undefined, defaultPath, properties: props, filters };
  if (IS_MAC && typeof o.title === "string") opts.message = o.title;
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  if (r.canceled || !r.filePaths?.length) return null;
  return r.filePaths.map((p) => paths.toPage(p));
}

function openExternal(url) {
  let u;
  try { u = new URL(String(url)); } catch { throw fsError("EINVAL", "invalid url"); }
  if (u.protocol !== "https:") throw fsError("EPERM", "only https links can be opened");
  return shell.openExternal(u.href);
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));
const isColor = (c) => typeof c === "string" && /^#[0-9a-f]{3,8}$|^(rgb|hsl)a?\([^)]*\)$/i.test(c.trim());
function setWindowOptions(o = {}) {
  if (!win || win.isDestroyed()) throw fsError("EIO", "no window");
  const [mw, mh] = win.getMinimumSize();
  const nw = Number.isFinite(o.minWidth) ? Math.max(400, o.minWidth | 0) : mw;
  const nh = Number.isFinite(o.minHeight) ? Math.max(300, o.minHeight | 0) : mh;
  if (nw !== mw || nh !== mh) win.setMinimumSize(nw, nh);
  if (IS_MAC && o.trafficLightPosition && Number.isFinite(o.trafficLightPosition.x) && Number.isFinite(o.trafficLightPosition.y)) {
    try { win.setWindowButtonPosition({ x: o.trafficLightPosition.x | 0, y: o.trafficLightPosition.y | 0 }); } catch {}
  }
  if (!IS_MAC && o.titleBarOverlay && typeof o.titleBarOverlay === "object") {
    const t = o.titleBarOverlay, next = {};
    if (isColor(t.color)) next.color = t.color.trim();
    if (isColor(t.symbolColor)) next.symbolColor = t.symbolColor.trim();
    if (Number.isFinite(t.height)) next.height = Math.min(120, Math.max(24, t.height | 0));
    try { win.setTitleBarOverlay(next); pageOverlay = true; } catch {}
  }
  return { applied: "now", reloading: false, options: pick(o, ["minWidth", "minHeight", "titleBarOverlay", "trafficLightPosition"]) };
}
function getWindowOptions() {
  if (!win || win.isDestroyed()) return {};
  const [minWidth, minHeight] = win.getMinimumSize();
  return { titleBarStyle: IS_MAC ? "hiddenInset" : "hidden", minWidth, minHeight };
}

/* ---------------- language and menus ---------------- */
const LABELS = {
  ko: {
    about: (n) => `${n}에 관하여`, services: "서비스", hide: (n) => `${n} 가리기`, hideOthers: "기타 가리기", unhide: "모두 보기", quit: (n) => `${n} 종료`,
    edit: "편집", undo: "실행 취소", redo: "실행 복귀", cut: "오려두기", copy: "복사하기", paste: "붙여넣기", selectAll: "모두 선택",
    window: IS_MAC ? "윈도우" : "창", minimize: "최소화", zoom: "확대/축소", front: "모두 앞으로 가져오기", close: "닫기",
    help: "도움말", repo: "GitHub 저장소", dev: "개발", reload: "새로 고침", devTools: "개발자 도구", images: "이미지", certs: "인증서 (.p12, .pfx)",
    backupTitle: "봉인 정보 백업 저장", replaceQ: "지금 쓰는 봉인 정보를 바꿀까요?", replaceD: "지금 열쇠로 만든 봉인은 그대로 확인되지만, 앞으로는 새 열쇠로 봉인합니다. 백업이 없으면 지금 열쇠는 되찾을 수 없습니다.",
    removeQ: "봉인 정보를 지울까요?", removeD: "백업이 없으면 지금 열쇠는 되찾을 수 없습니다.", replaceOk: "바꾸기", removeOk: "지우기", cancel: "취소",
  },
  en: {
    about: (n) => `About ${n}`, services: "Services", hide: (n) => `Hide ${n}`, hideOthers: "Hide Others", unhide: "Show All", quit: (n) => `Quit ${n}`,
    edit: "Edit", undo: "Undo", redo: "Redo", cut: "Cut", copy: "Copy", paste: "Paste", selectAll: "Select All",
    window: "Window", minimize: "Minimize", zoom: "Zoom", front: "Bring All to Front", close: "Close",
    help: "Help", repo: "GitHub repository", dev: "Develop", reload: "Reload", devTools: "Developer Tools", images: "Images", certs: "Certificates (.p12, .pfx)",
    backupTitle: "Save sealer backup", replaceQ: "Replace your current sealer identity?", replaceD: "Files you already sealed still verify, but new seals will use the new key. Without a backup, the current key can't be recovered.",
    removeQ: "Delete your sealer identity?", removeD: "Without a backup, the current key can't be recovered.", replaceOk: "Replace", removeOk: "Delete", cancel: "Cancel",
  },
};
// the last language the page chose, kept with Electron's own settings so the first menu is already right
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
function loadLang() {
  try { const l = JSON.parse(fs.readFileSync(settingsFile(), "utf8")).lang; if (l === "ko" || l === "en") return l; } catch {}
  let sys = "";
  try { sys = (app.getPreferredSystemLanguages?.()[0] || app.getLocale() || "").toLowerCase(); } catch {}
  return sys.startsWith("ko") ? "ko" : "en";
}
let lang = null;
const L = () => LABELS[lang || (lang = loadLang())];
function setLanguage(next) {
  if (next !== "ko" && next !== "en") throw fsError("EINVAL", `unsupported language: ${String(next)}`);
  lang = next;
  try {
    let cur = {};
    try { cur = JSON.parse(fs.readFileSync(settingsFile(), "utf8")) || {}; } catch {}
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify({ ...cur, lang: next }));
  } catch {}
  setMenu(lastPageTemplate);
  return lang;
}

const editMenu = () => { const l = L(); return { label: l.edit, submenu: [
  { role: "undo", label: l.undo }, { role: "redo", label: l.redo }, { type: "separator" },
  { role: "cut", label: l.cut }, { role: "copy", label: l.copy }, { role: "paste", label: l.paste },
  { role: "selectAll", label: l.selectAll },
] }; };
const windowMenu = () => { const l = L(); return IS_MAC
  ? { label: l.window, role: "window", submenu: [{ role: "minimize", label: l.minimize }, { role: "zoom", label: l.zoom }, { type: "separator" }, { role: "front", label: l.front }] }
  : { label: l.window, submenu: [{ role: "minimize", label: l.minimize }, { role: "close", label: l.close }] }; };
function appMenu() {
  const l = L(), n = app.name;
  return { label: n, submenu: [
    { role: "about", label: l.about(n) }, { type: "separator" },
    { role: "services", label: l.services }, { type: "separator" },
    { role: "hide", label: l.hide(n) }, { role: "hideOthers", label: l.hideOthers }, { role: "unhide", label: l.unhide },
    { type: "separator" }, { role: "quit", label: l.quit(n) },
  ] };
}
const helpMenu = () => ({ label: L().help, role: "help", submenu: [{ label: L().repo, click: () => shell.openExternal(REPO_URL) }] });
const devMenu = () => ({ label: L().dev, submenu: [{ role: "reload", label: L().reload }, { role: "toggleDevTools", label: L().devTools }] });
const ALLOWED_ROLES = new Set(["undo", "redo", "cut", "copy", "paste", "pasteAndMatchStyle", "delete", "selectAll", "reload", "forceReload",
  "togglefullscreen", "minimize", "close", "zoom", "front", "resetZoom", "zoomIn", "zoomOut", "editMenu", "windowMenu", "viewMenu", "fileMenu", "appMenu", "help", "window", "services", "about", "hide", "hideOthers", "unhide", "quit"]);
function fromPage(items, depth = 0) {
  if (!Array.isArray(items) || depth > 4) return [];
  return items.slice(0, 80).map((it) => {
    if (!it || typeof it !== "object") return null;
    if (it.role === "editMenu") return editMenu();
    if (it.role === "windowMenu") return windowMenu();
    const out = {};
    if (typeof it.label === "string") out.label = it.label.slice(0, 120);
    if (["normal", "separator", "submenu", "checkbox", "radio"].includes(it.type)) out.type = it.type;
    if (typeof it.role === "string" && ALLOWED_ROLES.has(it.role)) out.role = it.role;
    if (typeof it.accelerator === "string") out.accelerator = it.accelerator.slice(0, 60);
    for (const k of ["enabled", "visible", "checked"]) if (typeof it[k] === "boolean") out[k] = it[k];
    if (typeof it.__clickId === "number") {
      const id = it.__clickId;
      out.click = () => { if (win && !win.isDestroyed()) win.webContents.send("pdfe:menu-click", id); };
    }
    if (Array.isArray(it.submenu)) out.submenu = fromPage(it.submenu, depth + 1);
    return out;
  }).filter(Boolean);
}
let lastPageTemplate = null;
function setMenu(pageTemplate) {
  lastPageTemplate = pageTemplate || null;
  const t = [];
  if (IS_MAC) t.push(appMenu());
  t.push(...(pageTemplate ? fromPage(pageTemplate) : [editMenu()]));
  if (!t.some((m) => m.role === "window" || m.label === L().window)) t.push(windowMenu());
  if (!app.isPackaged) t.push(devMenu());
  t.push(helpMenu());
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

function registerIpc() {
  ipcMain.on("pdfe:sync", (e, op, arg) => {
    if (!trusted(e)) { e.returnValue = null; return; }
    if (op === "info") e.returnValue = { version: app.getVersion(), platform: process.platform, arch: process.arch };
    else if (op === "toPage") { try { e.returnValue = paths.toPage(String(arg)); } catch { e.returnValue = null; } }
    else e.returnValue = null;
  });
  ipcMain.handle("pdfe:fs", async (e, op, ...args) => {
    if (!trusted(e)) return { ok: false, error: "EPERM: untrusted sender" };
    if (!Object.hasOwn(FS, op)) return { ok: false, error: `EINVAL: unknown operation ${op}` };
    fsInFlight++;
    try { return { ok: true, value: await FS[op](...args) }; }
    catch (err) { return { ok: false, error: errText(err) }; }
    finally { fsInFlight--; fsLastActivity = Date.now(); }
  });
  const OPENABLE = /\.(pdf|png|jpe?g|webp|gif|bmp|heic|tiff?)$/i;
  handle("pdfe:shell", async (op, p) => {
    // open only folders and documents/images, never programs or scripts
    if (op === "openPath") {
      const target = guarded(p);
      const st = await fsp.stat(target);
      if (!st.isDirectory() && !OPENABLE.test(target)) throw fsError("EPERM", `not a document: ${p}`);
      const r = await shell.openPath(target); if (r) throw fsError("EIO", r); return;
    }
    if (op === "showItemInFolder") return shell.showItemInFolder(osPath(p));
    if (op === "trashItem") {
      const target = guarded(p);
      if ((await fsp.stat(target)).isDirectory()) throw fsError("EPERM", `refusing to trash a folder: ${p}`);
      return shell.trashItem(target);
    }
    throw fsError("EINVAL", `unknown operation ${op}`);
  });
  handle("pdfe:window", async (op, o) => {
    if (op === "setOptions") return setWindowOptions(o);
    if (op === "getOptions") return getWindowOptions();
    if (op === "show") return void showWindow();
    if (op === "hide") return void win?.hide();
    throw fsError("EINVAL", `unknown operation ${op}`);
  });
  handle("pdfe:menu", async (template) => { setMenu(template); return true; });
  handle("pdfe:dialog", async (o) => openDialog(o));
  handle("pdfe:open-external", async (url) => { await openExternal(url); return true; });
  handle("pdfe:open-file-ready", async () => { openListening = true; return pendingOpen.splice(0); });
  handle("pdfe:lang", async (l) => { setLanguage(l); return null; });

  // desktop.seal: identity, sign, verify (the private key stays in this process)
  const seal = createSeal({
    dir: SEAL_DIR, safeStorage, appVersion: app.getVersion(), lang: () => (L(), lang),
    // test homes never touch the login keychain unless asked to
    useOs: !HOME_OVERRIDE || process.env.PDFE_SEAL_SAFESTORAGE === "1",
  });
  const SEAL_OPS = new Set(["identity", "createIdentity", "exportIdentity", "importIdentity", "removeIdentity", "sign", "verify"]);
  // tests (only with a test home) skip the native panels: confirmations pass, backups go to the default path
  const NO_DIALOGS = !!HOME_OVERRIDE && process.env.PDFE_TEST_NO_DIALOGS === "1";
  const confirmNative = async (q, d, ok) => {
    if (NO_DIALOGS) return true;
    const o = { type: "warning", message: q, detail: d, buttons: [ok, L().cancel], defaultId: 1, cancelId: 1 };
    const r = win ? await dialog.showMessageBox(win, o) : await dialog.showMessageBox(o);
    return r.response === 0;
  };
  handle("pdfe:seal", async (op, ...args) => {
    if (typeof op !== "string" || !SEAL_OPS.has(op)) throw fsError("EINVAL", `unknown operation ${op}`);
    // the key backup never reaches the page: main asks where to save it and writes it itself
    if (op === "exportIdentity") {
      const o = args[0] || {};
      const p12 = await seal.exportIdentity({ password: o.password });
      const name = String(o.defaultName || "sealer-backup.p12").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120);
      let dir; try { dir = typeof o.start === "string" ? paths.toOs(o.start) : app.getPath("documents"); } catch { dir = app.getPath("documents"); }
      if (dir === WIN_ROOT) dir = app.getPath("documents");
      const opts = { title: L().backupTitle, defaultPath: path.join(dir, /\.p12$/i.test(name) ? name : name + ".p12"), filters: [{ name: L().certs, extensions: ["p12"] }] };
      const r = NO_DIALOGS ? { filePath: opts.defaultPath } : win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (r.canceled || !r.filePath) return null;
      const target = guarded(paths.toPage(r.filePath));
      await fsp.writeFile(target, p12);
      return { path: paths.toPage(target) };
    }
    // replacing or deleting the identity is confirmed outside the page
    const has = await seal.identity().catch(() => null);
    if (has && ((op === "createIdentity" && args[0]?.replace) || op === "importIdentity") && !(await confirmNative(L().replaceQ, L().replaceD, L().replaceOk))) throw fsError("ECANCELED", "cancelled");
    if (has && op === "removeIdentity" && !(await confirmNative(L().removeQ, L().removeD, L().removeOk))) throw fsError("ECANCELED", "cancelled");
    return seal[op](...args);
  });
}

/* ---------------- hardening ---------------- */
app.on("web-contents-created", (_e, wc) => {
  wc.on("will-attach-webview", (e) => e.preventDefault());
  wc.on("will-navigate", (e, url) => {
    if (url === INDEX_URL || url === ORIGIN + "/") return;
    e.preventDefault();
    if (/^https:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
  });
  wc.on("will-redirect", (e, url) => { if (!url.startsWith(ORIGIN + "/")) e.preventDefault(); });
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
});

/* ---------------- boot ---------------- */
function main() {
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  app.on("second-instance", (_e, argv, cwd) => {
    const files = IS_MAC ? [] : pdfsFromArgv(argv, cwd);
    if (files.length) files.forEach(openFromOs);
    else if (app.isReady()) showWindow();
  });
  if (!IS_MAC) pdfsFromArgv(process.argv).forEach(openFromOs);

  app.setAboutPanelOptions({ applicationName: "PDF Editor", applicationVersion: app.getVersion(), copyright: "MIT License", website: REPO_URL });

  app.whenReady().then(() => {
    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((_wc, perm, cb) => cb(["clipboard-sanitized-write", "fullscreen"].includes(perm)));
    protocol.handle(SCHEME, serveApp);
    registerIpc();
    setMenu(null);
    createWindow();
    app.on("activate", () => { if (!win) createWindow(); });
  });
  app.on("before-quit", () => { quitting = true; });
  app.on("window-all-closed", () => { if (!IS_MAC || quitting) app.quit(); });
}
main();
