// Assemble desktop/app/ from web/pdf-editor.html so the app runs fully offline:
//   index.html = artifact skeleton head + page + tail, with the cdnjs scripts and Google Fonts
//   rewritten to local copies; lib/ (pdf.js, pdf-lib), fonts/ (@fontsource woff2), vendor/pdfjs/.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, "..");
const WEB = path.resolve(DESKTOP, "..", "web");
const OUT = path.join(DESKTOP, "app");
const PAGE = path.join(WEB, "pdf-editor.html");

// Same skeleton the artifact host (and web/dev_server.py) wraps the page in.
const SKELETON_HEAD =
  "<!doctype html><html><head><meta charset=utf8>" +
  '<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);" +
  "padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;" +
  "font:14px/1.4 system-ui,-apple-system,sans-serif}img{max-width:100%}" +
  "[hidden]{display:none!important}</style></head><body>";
const SKELETON_TAIL = "</body></html>";

const pkgDir = (name) => path.dirname(require.resolve(`${name}/package.json`));
const sri = (file) => "sha384-" + createHash("sha384").update(fs.readFileSync(file)).digest("base64");
const fail = (msg) => { console.error(`build-page: ${msg}`); process.exit(1); };
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };

// cdnjs script -> local file (the npm file must match the page's SRI hash, i.e. be the same build)
const LIBS = [
  { re: /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/([\d.]+)\/pdf\.min\.js/, pkg: "pdfjs-dist", file: "build/pdf.min.js", out: "lib/pdf.min.js", license: "LICENSE" },
  { re: /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf-lib\/([\d.]+)\/pdf-lib\.min\.js/, pkg: "pdf-lib", file: "dist/pdf-lib.min.js", out: "lib/pdf-lib.min.js", license: "LICENSE.md" },
];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let page = fs.readFileSync(PAGE, "utf8");

// ---- scripts ----
page = page.replace(/<script\b([^>]*)\bsrc="(https:\/\/[^"]+)"([^>]*)><\/script>/g, (tag, _a, src) => {
  const lib = LIBS.find((l) => l.re.test(src));
  if (!lib) fail(`unknown remote script ${src}`);
  const want = lib.re.exec(src)[1];
  const dir = pkgDir(lib.pkg);
  const have = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;
  if (have !== want) fail(`${lib.pkg}@${have} installed but the page loads ${want}; update desktop/package.json`);
  const file = path.join(dir, lib.file);
  const integrity = /integrity="([^"]+)"/.exec(tag)?.[1];
  if (integrity && integrity !== sri(file)) fail(`${lib.pkg} ${lib.file} does not match the page's integrity hash`);
  copy(file, path.join(OUT, lib.out));
  copy(path.join(dir, lib.license), path.join(OUT, "lib", `LICENSE-${lib.pkg}.txt`));
  return `<script src="${lib.out}"></script>`;
});

// ---- fonts: Google Fonts css2 link -> local @fontsource css ----
page = page.replace(/<link\s+rel="preconnect"\s+href="https:\/\/fonts\.(googleapis|gstatic)\.com"[^>]*>\s*/g, "");
let fontsDone = false;
page = page.replace(/<link\s+rel="stylesheet"\s+href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"\s*>/g, (_tag, href) => {
  const url = new URL(href.replace(/&amp;/g, "&"));
  const css = [];
  const files = new Set();
  for (const fam of url.searchParams.getAll("family")) {
    const [name, axes] = fam.split(":");
    const weights = axes?.startsWith("wght@") ? axes.slice(5).split(";") : ["400"];
    const pkg = "@fontsource/" + name.trim().toLowerCase().replace(/\s+/g, "-");
    let dir;
    try { dir = pkgDir(pkg); } catch { fail(`font ${name}: install ${pkg}`); }
    for (const w of weights) {
      const cssFile = path.join(dir, `${w}.css`);
      if (!fs.existsSync(cssFile)) fail(`font ${name} ${w}: ${cssFile} missing`);
      // keep only the woff2 source (Chromium supports it); collect the files it needs
      const text = fs.readFileSync(cssFile, "utf8").replace(/src:\s*url\(\.\/files\/([^)]+\.woff2)\)\s*format\('woff2'\)[^;]*;/g, (_m, f) => {
        files.add(path.join(dir, "files", f));
        return `src: url(files/${f}) format('woff2');`;
      });
      css.push(text);
    }
    copy(path.join(dir, "LICENSE"), path.join(OUT, "fonts", `LICENSE-${path.basename(pkg)}.txt`));
  }
  for (const f of files) copy(f, path.join(OUT, "fonts", "files", path.basename(f)));
  fs.writeFileSync(path.join(OUT, "fonts", "fonts.css"), css.join("\n"));
  fontsDone = true;
  console.log(`fonts: ${files.size} woff2 files`);
  return `<link rel="stylesheet" href="fonts/fonts.css">`;
});
if (!fontsDone) console.warn("build-page: no Google Fonts link found (fonts unchanged)");

// ---- nothing remote may remain ----
const remote = page.match(/<(script|link|img|iframe)\b[^>]*(src|href)="(https?:)?\/\/[^"]*"/gi);
if (remote) fail(`remote resources left in the page:\n  ${remote.join("\n  ")}`);

fs.writeFileSync(path.join(OUT, "index.html"), SKELETON_HEAD + page + SKELETON_TAIL);

// ---- vendor/pdfjs (worker, packed cmaps and standard fonts) ----
for (const f of fs.readdirSync(path.join(WEB, "vendor", "pdfjs"))) copy(path.join(WEB, "vendor", "pdfjs", f), path.join(OUT, "vendor", "pdfjs", f));
const worker = path.join(OUT, "vendor", "pdfjs", "pdf.worker.min.js");
if (!fs.existsSync(worker)) fail("web/vendor/pdfjs/pdf.worker.min.js missing");
if (sri(worker) !== sri(path.join(pkgDir("pdfjs-dist"), "build", "pdf.worker.min.js"))) console.warn("build-page: vendor worker differs from pdfjs-dist build/pdf.worker.min.js");

// window icon for Linux
if (fs.existsSync(path.join(DESKTOP, "build", "icon.png"))) copy(path.join(DESKTOP, "build", "icon.png"), path.join(OUT, "icon.png"));

let total = 0;
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else total += fs.statSync(p).size; } };
walk(OUT);
console.log(`built ${path.relative(process.cwd(), OUT) || OUT} (${(total / 1048576).toFixed(1)} MB)`);
