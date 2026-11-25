// Builds the README images (hero, steps, features, before-after, social) from the raw shots in out/raw/.
// Crop rectangles are in CSS px of the 1440x900 app window.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { OUT, RAW, IMAGES, launch } = require("./lib.cjs");

const VW = 1440, VH = 900;
const raw = (n) => "file://" + path.join(RAW, n + ".png");

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap');
:root { --fg:#171a22; --muted:#5f6779; --faint:#8a91a1; --accent:#2446c7; --accent-soft:#e4e9fb; --seal:#c3302a; --seal-soft:#f9e5e3; --ok:#19794a; --ok-soft:#e2f3ea; --line:#dde1ea; --panel:#f3f5f9; --bg:#e9ecf2; }
* { box-sizing: border-box; margin: 0; }
html, body { background: transparent; }
body { font-family: "IBM Plex Sans KR", "Apple SD Gothic Neo", sans-serif; color: var(--fg); -webkit-font-smoothing: antialiased; word-break: keep-all; }
.canvas { position: relative; overflow: hidden; background: linear-gradient(160deg, #f5f7fc 0%, #e9eefb 55%, #e4e9fb 100%); }
.win { position: relative; border-radius: 12px; overflow: hidden; background: #fbfcfe;
  box-shadow: 0 0 0 1px rgba(20,28,52,.10), 0 28px 70px rgba(20,28,52,.20), 0 6px 18px rgba(20,28,52,.08); }
.win > img { display: block; width: 100%; }
.lights { position: absolute; display: flex; }
.lights i { display: block; border-radius: 50%; box-shadow: inset 0 0 0 .5px rgba(0,0,0,.18); }
.lights i:nth-child(1) { background: #ff5f57; } .lights i:nth-child(2) { background: #febc2e; } .lights i:nth-child(3) { background: #28c840; }
.crop { position: relative; overflow: hidden; }
.crop img { position: absolute; max-width: none; }
.cursor { position: absolute; width: 22px; height: 33px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.3)); }
`;

// macOS-style window with traffic lights (the app leaves 76px for them in desktop mode)
function win(shot, width) {
  const s = width / VW;
  return `<div class="win" style="width:${width}px"><img src="${raw(shot)}">
    <div class="lights" style="left:${18 * s}px;top:${19 * s}px;gap:${8 * s}px">${`<i style="width:${12 * s}px;height:${12 * s}px"></i>`.repeat(3)}</div></div>`;
}
// a piece of a screenshot, scaled to boxW wide
function crop(shot, [x, y, w, h], boxW, extra = "") {
  const s = boxW / w;
  return `<div class="crop" style="width:${boxW}px;height:${Math.round(h * s)}px;${extra}"><img src="${raw(shot)}" style="width:${VW * s}px;left:${-x * s}px;top:${-y * s}px"></div>`;
}
// fit a crop inside a fixed box (centered on a soft backdrop)
function fit(shot, rect, bw, bh, bg = "#e9ecf2", radius = 10) {
  const [, , w, h] = rect; const s = Math.min(bw / w, bh / h);
  const cw = Math.round(w * s), ch = Math.round(h * s);
  return `<div style="width:${bw}px;height:${bh}px;background:${bg};border-radius:${radius}px;display:grid;place-items:center;overflow:hidden">
    <div style="border-radius:8px;overflow:hidden;box-shadow:0 0 0 1px rgba(20,28,52,.08),0 6px 18px rgba(20,28,52,.10)">${crop(shot, rect, cw)}</div></div>`;
}
const CURSOR = `<svg class="cursor" viewBox="0 0 22 33"><path d="M2 2v24.5l6.2-6 4.3 10 4-1.8-4.2-9.8h8.6z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;

const page = (body, w, h, extraCss = "") => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${CSS}${extraCss}</style></head><body><div class="canvas" style="width:${w}px;height:${h}px">${body}</div></body></html>`;

/* ---------------- hero ---------------- */
function hero() {
  const W = 1200, ww = 1080;
  return { w: W, h: Math.round(ww * VH / VW) + 120, html: `<div style="position:absolute;left:${(W - ww) / 2}px;top:56px">${win("editor-signed", ww)}</div>` };
}

/* ---------------- steps ---------------- */
function steps() {
  const pw = 452, ph = 300, gap = 22, W = (pw + 28) * 3 + gap * 2 + 80, left = 40;
  const steps = [
    { n: "1", t: "PDF 열기", d: "새 PDF 열기를 누르거나, 파일을 창에 끌어다 놓습니다.", body: fit("browse", [249, 162, 941, 576], pw, ph, "#dfe3eb") },
    { n: "2", t: "서명·도장 놓기", d: "오른쪽 목록에서 눌러 놓거나 끌어다 놓고, 크기와 각도를 맞춥니다.",
      body: `<div style="position:relative">${fit("editor-signed", [360, 120, 1080, 720], pw, ph, "#dfe3eb")}${CURSOR.replace('class="cursor"', 'class="cursor" style="left:' + Math.round((706 - 360) * pw / 1080) + 'px;top:' + Math.round((440 - 120) * pw / 1080) + 'px"')}</div>` },
    { n: "3", t: "새 파일로 저장", d: "원본은 그대로 두고, 이름 뒤에 ‘_서명’이 붙은 새 PDF를 만듭니다.",
      body: `<div style="position:relative">${fit("save-dialog", [330, 215, 780, 520], pw, ph, "#dfe3eb")}
        <div style="position:absolute;left:50%;bottom:12px;transform:translateX(-50%);border-radius:9px;overflow:hidden;box-shadow:0 8px 20px rgba(0,0,0,.25)">${crop("saved-toast", [513, 814, 414, 42], 330)}</div></div>` },
  ];
  const html = `<div style="position:absolute;left:${left}px;top:40px;display:grid;grid-template-columns:repeat(3,${pw + 28}px);gap:${gap}px">
    ${steps.map((s) => `<div style="background:#fff;border-radius:16px;padding:14px 14px 20px;box-shadow:0 0 0 1px rgba(20,28,52,.08),0 10px 30px rgba(20,28,52,.08)">
      ${s.body}
      <div style="display:flex;align-items:center;gap:10px;margin:18px 6px 6px"><span style="width:30px;height:30px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:700;font-size:16px">${s.n}</span>
        <b style="font-size:23px;font-weight:700">${s.t}</b></div>
      <p style="margin:6px 6px 0;color:var(--muted);font-size:16px;line-height:1.5">${s.d}</p></div>`).join("")}
  </div>`;
  return { w: W, h: 40 + ph + 28 + 112 + 32, html };
}

/* ---------------- features ---------------- */
function features() {
  const cols = 3, tw = 456, th = 270, gap = 22, W = (tw + 28) * cols + gap * (cols - 1) + 80, left = 40;
  const bgTile = "#e6eaf1";
  const sealPair = () => {
    const r = [650, 470, 195, 195], s = 170;
    const one = (shot, label, on) => `<div style="display:grid;gap:10px;justify-items:center">
      <div style="border-radius:10px;overflow:hidden;box-shadow:0 0 0 1px rgba(20,28,52,.08),0 6px 18px rgba(20,28,52,.10)">${crop(shot, r, s)}</div>
      <span style="font-size:14px;font-weight:600;color:${on ? "var(--accent)" : "var(--muted)"}">${label}</span></div>`;
    return `<div style="width:${tw}px;height:${th}px;background:${bgTile};border-radius:10px;display:flex;align-items:center;justify-content:center;gap:26px">
      ${one("seal-bg-off", "도장 사진 그대로", false)}
      <svg width="34" height="20" viewBox="0 0 34 20" style="margin-bottom:30px"><path d="M2 10h28M22 3l8 7-8 7" fill="none" stroke="#5f6779" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      ${one("seal-bg-on", "흰 종이 배경 지우기", true)}</div>`;
  };
  const tiles = [
    { t: "직접 그리는 서명", d: "마우스나 트랙패드로 그리고, 잉크 색과 굵기를 고릅니다.", body: fit("pad", [420, 241, 600, 380], tw, th, bgTile) },
    { t: "도장 사진도 깔끔하게", d: "종이에 찍어 찍은 도장 사진의 흰 배경을 지웁니다.", body: sealPair() },
    { t: "글자·날짜 도장", d: "이름, 날짜, ‘(인)’, ‘사본’ 같은 글자를 고딕·손글씨·명조로.", body: fit("text-dialog", [420, 224, 600, 390], tw, th, bgTile) },
    { t: "한 번 등록하면 계속", d: "서명·도장은 남아 있어서 다음 문서에서 바로 다시 씁니다.", body: fit("editor-signed", [1141, 52, 299, 360], tw, th, bgTile) },
    { t: "보관함이 알아서 저장", d: "놓아 둔 서명은 자동 저장. 문서마다 저장 상태를 보여 줍니다.", body: fit("home", [80, 236, 870, 468], tw, th, bgTile) },
    { t: "원본이 바뀌면 알려 줌", d: "Finder·탐색기에서 원본을 옮기거나 고치면 바로 알려 줍니다.", body: fit("source-changed", [290, 52, 720, 360], tw, th, bgTile) },
  ];
  const html = `<div style="position:absolute;left:${left}px;top:40px;display:grid;grid-template-columns:repeat(${cols},${tw + 28}px);gap:${gap}px">
    ${tiles.map((s) => `<div style="background:#fff;border-radius:16px;padding:14px 14px 18px;box-shadow:0 0 0 1px rgba(20,28,52,.08),0 10px 30px rgba(20,28,52,.08)">
      ${s.body}<b style="display:block;font-size:21px;font-weight:700;margin:16px 6px 0">${s.t}</b>
      <p style="margin:6px 6px 0;color:var(--muted);font-size:15.5px;line-height:1.5">${s.d}</p></div>`).join("")}
  </div>`;
  return { w: W, h: 40 + (th + 28 + 105) * 2 + gap + 40, html };
}

/* ---------------- before / after ---------------- */
const IC = {
  printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  pen: '<path d="M4 20l1.2-4.6L15.5 5.1a2.1 2.1 0 0 1 3 3L8.2 18.4z"/><path d="M3 22h18" opacity=".5"/>',
  scan: '<rect x="3" y="11" width="18" height="8" rx="2"/><path d="M6 11V5h12v6"/><path d="M2 15h20" stroke-dasharray="2 2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  open: '<path d="M3 7V5h6l2 2h10v12H3z"/>',
  drag: '<path d="M8 4v10l2.5-2.5L13 17l2-1-2.4-5H16z"/><path d="M15 4h5v5M20 4l-4 4" opacity=".6"/>',
  save: '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 17v3h16v-3"/>',
};
const icon = (k, color) => `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`;
function beforeAfter() {
  const W = 1500, cw = 690;
  const flow = (items, color, bg) => `<div style="display:flex;align-items:flex-start;gap:6px">${items.map((it, i) => `
    ${i ? `<svg width="22" height="56" viewBox="0 0 22 56"><path d="M4 28h12M11 22l6 6-6 6" fill="none" stroke="#aab1c0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}
    <div style="display:grid;justify-items:center;gap:8px;width:${it.w || 120}px"><span style="width:56px;height:56px;border-radius:14px;background:${bg};display:grid;place-items:center">${icon(it.i, color)}</span>
    <span style="font-size:16px;font-weight:600;text-align:center;line-height:1.35">${it.t}</span></div>`).join("")}</div>`;
  const notes = (arr, ok) => `<ul style="list-style:none;padding:0;display:grid;gap:10px;margin-top:26px">${arr.map((n) => `<li style="display:flex;gap:10px;align-items:flex-start;font-size:16.5px;line-height:1.45;color:${ok ? "var(--fg)" : "var(--muted)"}">
    <span style="flex:none;width:22px;height:22px;border-radius:50%;margin-top:1px;display:grid;place-items:center;background:${ok ? "var(--ok-soft)" : "#eceef3"};color:${ok ? "var(--ok)" : "#8a91a1"};font-weight:700;font-size:13px">${ok ? "✓" : "–"}</span>${n}</li>`).join("")}</ul>`;
  const card = (inner, accent) => `<div style="width:${cw}px;min-height:470px;border-radius:20px;padding:34px 36px;background:${accent ? "#fff" : "#f4f5f8"};box-shadow:${accent ? "0 0 0 2px var(--accent),0 16px 40px rgba(36,70,199,.14)" : "0 0 0 1px rgba(20,28,52,.08)"}">${inner}</div>`;
  const tag = (t, accent) => `<span style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:14px;font-weight:700;background:${accent ? "var(--accent)" : "#dfe2e9"};color:${accent ? "#fff" : "#5f6779"}">${t}</span>`;
  const left = card(`${tag("이전", false)}<h2 style="font-size:30px;margin:14px 0 26px;font-weight:700;color:#3a404c">출력 → 서명 → 스캔</h2>
    ${flow([{ i: "printer", t: "프린터로<br>출력" }, { i: "pen", t: "펜으로<br>서명·날인" }, { i: "scan", t: "스캐너로<br>다시 스캔" }, { i: "mail", t: "파일 정리해<br>보내기" }], "#7a8192", "#e6e8ee")}
    ${notes(["프린터와 스캐너가 있어야 합니다.", "스캔본은 기울거나 흐릿해지기 쉽습니다.", "아니면 유료 프로그램이나, 파일을 올려야 하는 웹사이트."], false)}`, false);
  const right = card(`${tag("PDF Editor", true)}<h2 style="font-size:30px;margin:14px 0 26px;font-weight:700">끌어다 놓고 저장</h2>
    <div style="display:flex;gap:22px;align-items:flex-start">
      ${flow([{ i: "open", t: "PDF<br>열기", w: 84 }, { i: "drag", t: "서명·도장<br>놓기", w: 84 }, { i: "save", t: "새 파일로<br>저장", w: 84 }], "#2446c7", "var(--accent-soft)")}
      <div style="flex:none;border-radius:10px;overflow:hidden;box-shadow:0 0 0 1px rgba(20,28,52,.10),0 6px 16px rgba(20,28,52,.10);margin-top:2px">${crop("editor-signed", [600, 360, 290, 125], 232)}</div>
    </div>
    ${notes(["프린터·스캐너 없이 내 컴퓨터에서 바로.", "파일은 인터넷에 올라가지 않습니다.", "원본은 그대로, ‘_서명’이 붙은 새 PDF로 저장."], true)}`, true);
  const html = `<div style="position:absolute;left:${(W - cw * 2 - 60) / 2}px;top:44px;display:flex;align-items:center;gap:0">
    ${left}<svg width="60" height="40" viewBox="0 0 60 40"><path d="M12 20h34M38 11l9 9-9 9" fill="none" stroke="#2446c7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>${right}</div>`;
  return { w: W, h: 470 + 88, html };
}

/* ---------------- social preview (1280x640) ---------------- */
const APP_ICON = `<svg viewBox="0 0 256 256" width="92" height="92"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient></defs>
  <rect x="8" y="8" width="240" height="240" rx="56" fill="#2446c7"/><rect x="8" y="8" width="240" height="240" rx="56" fill="url(#g)"/>
  <path d="M66 44h96l34 34v136H66z" fill="#fff"/><path d="M162 44v34h34z" fill="#d7ddf2"/>
  <path d="M88 96h86M88 118h86M88 140h52" stroke="#c9d0e6" stroke-width="7" stroke-linecap="round"/>
  <path d="M84 186c20-36 32 10 46-14 12-20 20 18 40-2" fill="none" stroke="#1d3fb8" stroke-width="7" stroke-linecap="round"/>
  <circle cx="186" cy="190" r="30" fill="none" stroke="#d33a2f" stroke-width="9"/></svg>`;
function social() {
  const W = 1280, H = 640;
  const chip = (t) => `<span style="padding:7px 14px;border-radius:999px;background:#fff;box-shadow:0 0 0 1px rgba(20,28,52,.10);font-size:17px;font-weight:600;color:#3a404c">${t}</span>`;
  const html = `
    <div style="position:absolute;left:70px;top:84px;width:560px">
      <div style="display:flex;align-items:center;gap:20px">${APP_ICON}<span style="font-size:58px;font-weight:700;letter-spacing:-.5px">PDF Editor</span></div>
      <p style="font-size:38px;font-weight:700;line-height:1.35;margin-top:34px;letter-spacing:-.3px">PDF에 서명·도장,<br><span style="color:var(--accent)">끌어다 놓고 저장.</span></p>
      <p style="font-size:20px;color:var(--muted);margin-top:18px;line-height:1.5">Sign and stamp PDFs on Mac &amp; Windows.<br>Free, open source, nothing uploaded.</p>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:30px">${chip("무료 · 오픈소스")}${chip("인터넷 업로드 없음")}${chip("macOS · Windows")}</div>
    </div>
    <div style="position:absolute;left:660px;top:92px">${win("editor-signed", 860)}</div>`;
  return { w: W, h: H, html, outW: W, outH: H };
}

async function render(browser, name, spec, scale) {
  const file = path.join(OUT, name + ".html");
  fs.writeFileSync(file, page(spec.html, spec.w, spec.h));
  const ctx = await browser.newContext({ viewport: { width: spec.w, height: spec.h }, deviceScaleFactor: scale });
  const p = await ctx.newPage();
  await p.goto("file://" + file, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  const tmp = path.join(OUT, name + ".full.png");
  await p.locator(".canvas").screenshot({ path: tmp });
  await ctx.close();
  const dest = path.join(IMAGES, name + ".png");
  let img = sharp(tmp);
  if (spec.outW) img = img.resize(spec.outW, spec.outH);
  await img.png({ palette: true, quality: 92, effort: 10, dither: 0.6 }).toFile(dest);
  console.log(name, (fs.statSync(dest).size / 1024).toFixed(0) + " KB");
}

(async () => {
  fs.mkdirSync(IMAGES, { recursive: true });
  const only = process.argv.slice(2);
  const jobs = { hero: [hero, 1.6], steps: [steps, 1.4], features: [features, 1.4], "before-after": [beforeAfter, 1.4], social: [social, 2] };
  const browser = await launch();
  for (const [name, [fn, scale]] of Object.entries(jobs)) if (!only.length || only.includes(name)) await render(browser, name, fn(), scale);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
