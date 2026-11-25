// Writes <out>/licenses/: Sealworks' own license files and the license text of every third-party
// component the app ships, plus index.json for the page's "Licenses" dialog (web/pdf-editor.html).
// Used by build-page.mjs (desktop app, and the Android app through mobile/scripts/build-www.mjs,
// which adds its own components with addLicenses()). THIRD_PARTY_NOTICES.md lists the same set.
//
//   writeLicenses({ out, root, require })      Sealworks files + components common to both apps
//   addLicenses({ out, require, entries })     more components (each like COMMON below)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const OWN = [
  { id: "sealworks-license", src: "LICENSE", file: "Sealworks-LICENSE.txt",
    title: { ko: "Sealworks 라이선스 (PolyForm Strict 1.0.0)", en: "Sealworks License (PolyForm Strict 1.0.0)" } },
  { id: "sealworks-permissions", src: "LICENSE-PERMISSIONS.md", file: "Sealworks-LICENSE-PERMISSIONS.md",
    title: { ko: "추가 권한 (공식 앱 무료 사용·공유)", en: "Additional permissions (using and sharing the official app)" } },
  { id: "sealworks-trademarks", src: "TRADEMARKS.md", file: "Sealworks-TRADEMARKS.md",
    title: { ko: "상표 정책", en: "Trademark policy" } },
  { id: "third-party-notices", src: "THIRD_PARTY_NOTICES.md", file: "THIRD_PARTY_NOTICES.md",
    title: { ko: "제3자 고지 (전체 목록)", en: "Third-party notices (full list)" } },
];

// pkg: npm package (license file found in it); from: resolve the package from inside another one
// (pdf-lib's own tslib 1.x); text: a license text written out when the package has no file;
// optional: skip quietly when the package isn't installed (electron only exists for the desktop)
const MIT = (holder) => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
export { MIT };

export const COMMON = [
  { pkg: "pdfjs-dist", name: "PDF.js", license: "Apache-2.0" },
  { vendor: "LICENSE_CMAPS.txt", id: "adobe-cmaps", name: "Adobe CMaps (from pdfjs-dist)", license: "BSD-3-Clause" },
  { vendor: "LICENSE_FOXIT.txt", id: "foxit-fonts", name: "Foxit standard fonts (from pdfjs-dist)", license: "BSD-3-Clause" },
  { vendor: "LICENSE_LIBERATION.txt", id: "liberation-fonts", name: "Liberation Sans (from pdfjs-dist)", license: "OFL-1.1" },
  { pkg: "pdf-lib", name: "pdf-lib", license: "MIT" },
  { pkg: "@pdf-lib/standard-fonts", from: "pdf-lib", name: "@pdf-lib/standard-fonts", license: "MIT" },
  { pkg: "@pdf-lib/upng", from: "pdf-lib", name: "@pdf-lib/upng", license: "MIT" },
  { pkg: "pako", from: "pdf-lib", name: "pako", license: "MIT AND Zlib" },
  { pkg: "tslib", from: "pdf-lib", name: "tslib", license: "0BSD" },
  { pkg: "@signpdf/signpdf", name: "@signpdf/signpdf", license: "MIT", text: MIT("2019 The Authors") },
  { pkg: "@signpdf/utils", name: "@signpdf/utils", license: "MIT", text: MIT("2019 The Authors") },
  { pkg: "node-forge", name: "node-forge", license: "BSD-3-Clause (chosen from BSD-3-Clause OR GPL-2.0)" },
  { pkg: "@fontsource/ibm-plex-sans-kr", name: "IBM Plex Sans KR", license: "OFL-1.1" },
  { pkg: "@fontsource/ibm-plex-mono", name: "IBM Plex Mono", license: "OFL-1.1" },
  { pkg: "@fontsource/nanum-myeongjo", name: "Nanum Myeongjo", license: "OFL-1.1" },
  { pkg: "@fontsource/nanum-pen-script", name: "Nanum Pen Script", license: "OFL-1.1" },
  { pkg: "electron", name: "Electron", license: "MIT", optional: true,
    note: "Chromium and the other components inside Electron: LICENSES.chromium.html next to the app's executable." },
];

const fail = (m) => { throw new Error(`licenses: ${m}`); };
const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;

function pkgInfo(require, pkg, from) {
  const req = from ? createRequire(require.resolve(`${from}/package.json`)) : require;
  // by search path, not require.resolve("<pkg>/package.json"): packages with an "exports" map
  // (tslib 1.x) refuse that subpath
  // (a name shared with a Node built-in, like "buffer", gets null from resolve.paths: use the generic list)
  const dirs = req.resolve.paths(pkg) || req.resolve.paths("sealworks-no-such-package") || [];
  const dir = dirs.map((p) => path.join(p, pkg)).find((d) => fs.existsSync(path.join(d, "package.json")));
  if (!dir) throw new Error(`cannot find ${pkg}`);
  const version = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;
  const lic = fs.readdirSync(dir).find((f) => LICENSE_FILE.test(f));
  return { dir, version, licFile: lic ? path.join(dir, lic) : null };
}

const slug = (s) => s.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");

function readIndex(out) {
  const f = path.join(out, "index.json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
}
function writeIndex(out, index) { fs.writeFileSync(path.join(out, "index.json"), JSON.stringify(index, null, 1)); }

export function addLicenses({ out, require, entries, vendorDir }) {
  const index = readIndex(out);
  fs.mkdirSync(path.join(out, "third-party"), { recursive: true });
  for (const e of entries) {
    let version = e.version || null, text = null;
    if (e.vendor) {
      text = fs.readFileSync(path.join(vendorDir, e.vendor), "utf8");
    } else if (e.pkg) {
      let info;
      try { info = pkgInfo(require, e.pkg, e.from); } catch (err) { if (e.optional) continue; fail(`${e.pkg} not installed (${err.message})`); }
      version = info.version;
      text = info.licFile ? fs.readFileSync(info.licFile, "utf8") : e.text;
      if (!text) fail(`${e.pkg}@${version} has no license file and no text is given`);
    } else {
      text = e.text;
    }
    if (!text?.trim()) fail(`empty license text for ${e.name}`);
    if (e.note) text = `${text.trimEnd()}\n\n---\n${e.note}\n`;
    const id = e.id || slug(e.pkg || e.name);
    const file = `third-party/${id}.txt`;
    fs.writeFileSync(path.join(out, file), text);
    index.push({ id, group: "third", file, title: `${e.name}${version ? ` ${version}` : ""} · ${e.license}` });
  }
  writeIndex(out, index);
  return index.length;
}

export function writeLicenses({ out, root, require, vendorDir }) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const index = [];
  for (const o of OWN) {
    const src = path.join(root, o.src);
    if (!fs.existsSync(src)) fail(`${o.src} missing at the repository root`);
    fs.copyFileSync(src, path.join(out, o.file));
    index.push({ id: o.id, group: "sealworks", file: o.file, title: o.title });
  }
  writeIndex(out, index);
  return addLicenses({ out, require, entries: COMMON, vendorDir });
}
