/* Injected into the Sealworks page by the capture scripts (never shipped).
   The made-up documents come from the app's own example gallery (window.__pdfe.loadExample, the situations in
   docs/design/scenarios.md), written into the sandbox home as if they were the user's files. All names are made up. */
(() => {
  const P = () => window.__pdfe;
  const FF = '"IBM Plex Sans KR", "Apple SD Gothic Neo", sans-serif';
  const desk = () => window.claude.use("desktop");
  let LANG = "ko"; // set by setLang()

  async function fonts() {
    await Promise.allSettled([
      document.fonts.load(`600 40px ${FF}`, "가나다계약서 Agreement"), document.fonts.load(`400 24px ${FF}`, "가나다"),
      document.fonts.load('800 100px "Nanum Myeongjo"', "홍길동인"), document.fonts.load('100px "Nanum Pen Script"', "홍길동"),
    ]);
  }

  // Opens example `id` the way the gallery does and hands back its clean PDF (no items on it) and where the example put
  // its items (page points), each with the example asset's name and kind, so the same spots can be filled with the
  // user's own signature and stamps. Also returns the example's assets (src, kind, name) for copying into the Library.
  async function exampleDoc(id) {
    const p = P(), S = p.S;
    if (!(await p.loadExample(id, LANG))) throw new Error(`example ${id} did not open`);
    await new Promise((r) => setTimeout(r, 300));
    const items = S.overlays.map((o) => { const a = S.assets.get(o.assetId); return { name: a.name, kind: a.kind, page: o.page, x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot, opacity: o.opacity, gan: o.gan ? o.gan.side : null }; });
    const assets = S.samples.map((sid) => { const a = S.assets.get(sid); return { name: a.name, kind: a.kind, src: a.src }; });
    return { bytes: S.doc.bytes.slice(), pages: S.pages.length, items, assets };
  }
  // an example's asset, kept in the user's Library under a name of their own
  async function copyAsset(src, kind, name) {
    const a = await P().makeAssetFromSource(src, { kind, name });
    await P().addToLibrary(a); return a.id;
  }

  // Android mode (dev server &os=android): the page may only reach documents it was handed (/android/<id>/…), so the
  // sandbox home is written through the dev server's file endpoint, and documents are opened the way a share from
  // another app opens them (window.__shimOpenFile), which gives them their /android/ path.
  const android = () => !!window.__shimAndroid;
  async function rawFs(op, args) {
    const r = await fetch("/__fs", { method: "POST", headers: { "Content-Type": "application/json", "X-PDFE-Dev": "1" }, body: JSON.stringify({ op, ...args }) });
    const j = await r.json(); if (j.error) throw new Error(j.error); return j.result;
  }
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

  async function writeHome(path, bytes) {
    if (android()) {
      await rawFs("mkdir", { path: path.slice(0, path.lastIndexOf("/")), recursive: true });
      await rawFs("writeFile", { path, data: b64(new Uint8Array(bytes)) });
      const st = await rawFs("stat", { path });
      return { size: st.size, mtime: st.mtimeMs };
    }
    const d = await desk();
    await d.fs.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
    await d.fs.writeFile(path, bytes);
    const st = await d.fs.stat(path);
    return { size: st.size, mtime: st.mtimeMs };
  }
  async function openPath(path) {
    if (android()) {
      const name = path.slice(path.lastIndexOf("/") + 1), S = P().S, t0 = Date.now();
      window.__shimOpenFile(path);
      while (!(S.rec?.name === name && /^\/android\//.test(S.rec?.source?.path || "") && S.pages.length && S.view === "editor")) {
        if (Date.now() - t0 > 15000) throw new Error(`${path} did not open`);
        await new Promise((r) => setTimeout(r, 100));
      }
      await new Promise((r) => setTimeout(r, 700));
      return;
    }
    const d = await desk(); const bytes = new Uint8Array(await d.fs.readFile(path)); const st = await d.fs.stat(path);
    const name = path.slice(path.lastIndexOf("/") + 1);
    await P().openPdfBytes(bytes, name, { path, stat: { size: st.size, mtime: st.mtimeMs }, quiet: true });
    await new Promise((r) => setTimeout(r, 700)); // thumbnail
  }

  // signature strokes, normalised to a 0..1 box (x) and roughly -0.5..0.5 (y)
  function signatureStrokes() {
    const strokes = [];
    const s1 = [];
    for (let t = 0; t <= 1; t += 0.01) {
      const x = 0.02 + 0.10 * t + 0.03 * Math.sin(t * Math.PI * 2);
      const y = 0.38 - 0.85 * Math.sin(t * Math.PI * 0.95) + 0.1 * t;
      s1.push([x, y]);
    }
    strokes.push(s1);
    const s2 = []; const N = 5.3 * Math.PI * 2;
    for (let t = 0; t <= N; t += 0.035) {
      const p = t / N; const env = 0.75 + 0.35 * Math.sin(p * Math.PI * 1.3) - 0.25 * p;
      const x = 0.12 + p * 0.68 - 0.022 * Math.sin(t) * env * 1.4;
      const y = 0.12 - 0.20 * Math.cos(t) * env - 0.05 * Math.sin(p * 9) + 0.08 * p - 0.12;
      s2.push([x - 0.06 * (y - 0.1), y]);
    }
    strokes.push(s2);
    const s3 = [];
    for (let t = 0; t <= 1; t += 0.01) s3.push([0.06 + 0.9 * t, 0.42 - 0.12 * t + 0.10 * Math.sin(t * Math.PI) * -1 + 0.05 * t * t]);
    strokes.push(s3);
    return strokes;
  }

  const setLang = (l) => { LANG = l === "en" ? "en" : "ko"; };
  window.__seed = { setLang, fonts, exampleDoc, copyAsset, writeHome, openPath, signatureStrokes };
})();
