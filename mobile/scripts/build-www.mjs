// Builds mobile/www/ (Capacitor's webDir):
//   1. the offline page, assembled exactly like the desktop app (desktop/scripts/build-page.mjs, run
//      from a patched copy so it writes here and resolves its packages from mobile/node_modules;
//      desktop/ itself is never written to)
//   2. a strict CSP <meta> and the Android `desktop` shim (src/android-desktop.js, bundled with
//      @capacitor/core) injected before the page script
//   3. the seal: desktop/src/{seal,pdfsig,pki,der,pdfobj}.js bundled for the WebView with esbuild
//      (node:crypto, fs, path, util, Buffer, process replaced by src/seal/*), run in a Worker
//
//   node scripts/build-www.mjs              everything
//   node scripts/build-www.mjs --seal-only  only www/seal/seal-core.js (for test/seal.mjs)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(MOBILE, "..");
const DESKTOP = path.join(ROOT, "desktop");
const WWW = path.join(MOBILE, "www");
const SEAL_ONLY = process.argv.includes("--seal-only");
const fail = (m) => { console.error(`build-www: ${m}`); process.exit(1); };

// Same policy as the desktop app's app:// protocol (desktop/src/main.js), as a <meta>:
// nothing leaves the device; workers only from the app itself (pdf.js, the seal worker).
export const CSP = [
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

// bare imports in desktop/src resolve from mobile/node_modules (never desktop/node_modules)
const fromMobile = {
  name: "from-mobile",
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, async (args) => {
      if (args.pluginData === "from-mobile" || !args.importer.startsWith(DESKTOP + path.sep)) return undefined;
      const r = await build.resolve(args.path, { resolveDir: MOBILE, kind: args.kind, pluginData: "from-mobile" });
      return r.errors.length ? { errors: r.errors } : r;
    });
  },
};
const SEAL_SRC = path.join(MOBILE, "src", "seal");
const nodeAliases = {
  "node:crypto": path.join(SEAL_SRC, "node-crypto.js"),
  crypto: path.join(SEAL_SRC, "node-crypto.js"), // node-forge's optional require (unused: isNodejs is false)
  "node:fs": path.join(SEAL_SRC, "node-fs.cjs"),
  "node:path": path.join(SEAL_SRC, "node-path.cjs"),
  "node:util": path.join(SEAL_SRC, "node-util.cjs"),
  buffer: path.join(MOBILE, "node_modules", "buffer", "index.js"),
};

async function buildSeal() {
  fs.mkdirSync(path.join(WWW, "seal"), { recursive: true });
  const r = await esbuild.build({
    entryPoints: [path.join(SEAL_SRC, "entry.js")],
    outfile: path.join(WWW, "seal", "seal-core.js"),
    bundle: true, format: "iife", globalName: "SealworksSeal", platform: "browser", target: "es2022",
    minify: true, legalComments: "eof", logLevel: "warning", metafile: true,
    alias: nodeAliases,
    inject: [path.join(SEAL_SRC, "globals.js")],
    define: { global: "globalThis" },
    plugins: [fromMobile],
  });
  // the bundle must not reach for anything Node-only at runtime
  const inputs = Object.keys(r.metafile.inputs);
  const bad = inputs.filter((f) => /(^|\/)node:/.test(f));
  if (bad.length) fail(`node built-ins left in the seal bundle: ${bad.join(", ")}`);
  for (const f of ["seal.js", "pdfsig.js", "pki.js", "der.js", "pdfobj.js"]) {
    if (!inputs.some((i) => i.endsWith(`desktop/src/${f}`))) fail(`desktop/src/${f} is not in the seal bundle`);
  }
  fs.copyFileSync(path.join(SEAL_SRC, "seal-worker.js"), path.join(WWW, "seal", "seal-worker.js"));
  console.log(`seal: www/seal/seal-core.js (${(fs.statSync(path.join(WWW, "seal", "seal-core.js")).size / 1024).toFixed(0)} KB)`);
}

// Android-only components (THIRD_PARTY_NOTICES.md, "Android app only"). Cordova and AndroidX come
// from Maven, not npm: their Apache-2.0 text is taken from pdfjs-dist (the same license, verbatim).
async function addAndroidLicenses() {
  const { addLicenses } = await import(pathToFileURL(path.join(DESKTOP, "scripts", "licenses.mjs")).href);
  const require = createRequire(path.join(MOBILE, "package.json"));
  const apache = fs.readFileSync(path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "LICENSE"), "utf8");
  if (!/Apache License\s+Version 2\.0/.test(apache)) fail("pdfjs-dist/LICENSE is no longer the Apache-2.0 text");
  const gradle = fs.readFileSync(path.join(MOBILE, "android", "variables.gradle"), "utf8");
  const v = (k) => gradle.match(new RegExp(`${k}\\s*=\\s*'([^']+)'`))?.[1] || fail(`${k} missing in android/variables.gradle`);
  const androidx = [["activity", "androidxActivityVersion"], ["appcompat", "androidxAppCompatVersion"], ["coordinatorlayout", "androidxCoordinatorLayoutVersion"],
    ["core", "androidxCoreVersion"], ["core-splashscreen", "coreSplashScreenVersion"], ["fragment", "androidxFragmentVersion"], ["webkit", "androidxWebkitVersion"]]
    .map(([lib, key]) => `androidx.${lib} ${v(key)}`).join(", ");
  const cordovaNotice = "Apache Cordova\nCopyright 2015-2020 The Apache Software Foundation\n\nThis product includes software developed at\nThe Apache Software Foundation (http://www.apache.org/).\n";
  const n = addLicenses({ out: path.join(WWW, "licenses"), require, entries: [
    { pkg: "@capacitor/core", name: "Capacitor (@capacitor/core)", license: "MIT" },
    { pkg: "@capacitor/android", name: "Capacitor (@capacitor/android)", license: "MIT" },
    { id: "apache-cordova-android", name: "Apache Cordova Android framework", version: v("cordovaAndroidVersion"), license: "Apache-2.0",
      text: `NOTICE\n------\n${cordovaNotice}\n\n${apache}` },
    { id: "androidx", name: "AndroidX libraries", license: "Apache-2.0",
      text: `Copyright The Android Open Source Project.\nLibraries: ${androidx}.\n\n${apache}` },
    { pkg: "@noble/curves", name: "@noble/curves", license: "MIT" },
    { pkg: "@noble/hashes", name: "@noble/hashes", license: "MIT" },
    { pkg: "buffer", name: "buffer", license: "MIT" },
    { pkg: "base64-js", from: "buffer", name: "base64-js", license: "MIT" },
    { pkg: "ieee754", from: "buffer", name: "ieee754", license: "BSD-3-Clause" },
    { pkg: "path-browserify", name: "path-browserify", license: "MIT" },
  ] });
  console.log(`licenses: ${n} documents (with Android components)`);
}

async function buildPage() {
  // 1. desktop's page assembly, retargeted
  const src = fs.readFileSync(path.join(DESKTOP, "scripts", "build-page.mjs"), "utf8");
  let patched = src;
  const swap = (from, to) => {
    const n = patched.split(from).length - 1;
    if (n !== 1) fail(`desktop/scripts/build-page.mjs changed: expected one \`${from}\`, found ${n}`);
    patched = patched.replace(from, () => to);
  };
  swap("const require = createRequire(import.meta.url);", `const require = createRequire(${JSON.stringify(path.join(MOBILE, "package.json"))});`);
  swap("const HERE = path.dirname(fileURLToPath(import.meta.url));", `const HERE = ${JSON.stringify(path.join(DESKTOP, "scripts"))};`);
  swap('const OUT = path.join(DESKTOP, "app");', `const OUT = ${JSON.stringify(WWW)};`);
  const tmpDir = path.join(MOBILE, ".build");
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, "build-page.patched.mjs");
  fs.writeFileSync(tmp, patched);
  await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
  fs.rmSync(path.join(WWW, "icon.png"), { force: true }); // desktop's Linux window icon

  // 2. CSP + shim before the page's own scripts
  const index = path.join(WWW, "index.html");
  let html = fs.readFileSync(index, "utf8");
  const head = html.indexOf("</head>");
  const firstScript = html.search(/<script\b(?![^>]*type="application\/json")/i);
  if (head < 0 || (firstScript >= 0 && firstScript < head)) fail("unexpected page skeleton (</head> missing or a script before it)");
  html = html.slice(0, head)
    + `<meta http-equiv="Content-Security-Policy" content="${CSP}">`
    + `<meta name="color-scheme" content="light dark">`
    + `<script src="android-desktop.js"></script>`
    + html.slice(head);
  fs.writeFileSync(index, html);

  await esbuild.build({
    entryPoints: [path.join(MOBILE, "src", "android-desktop.js")],
    outfile: path.join(WWW, "android-desktop.js"),
    bundle: true, format: "iife", platform: "browser", target: "es2022", minify: false, logLevel: "warning",
  });

  // 3. licenses/: build-page wrote Sealworks' files and the shared components; add the Android-only ones
  await addAndroidLicenses();

  // nothing in www/ may point at the network (the page check is build-page's; this covers our files)
  for (const f of ["index.html", "android-desktop.js"]) {
    const text = fs.readFileSync(path.join(WWW, f), "utf8");
    const remote = text.match(/<(script|link|img|iframe)\b[^>]*(src|href)="(https?:)?\/\/[^"]*"/gi);
    if (remote) fail(`remote resources in www/${f}:\n  ${remote.join("\n  ")}`);
  }
}

if (!SEAL_ONLY) await buildPage();
await buildSeal();
if (!SEAL_ONLY) {
  let total = 0;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else total += fs.statSync(p).size; } };
  walk(WWW);
  console.log(`built www/ (${(total / 1048576).toFixed(1)} MB)`);
}
