// Builds the README images from the raw shots in out/raw-<lang>/, for each language:
//   hero, steps, features, before-after, social (1280x640), seal-states  ->  docs/images/<name>-<lang>.png
//   node compose.cjs              # every image, both languages
//   node compose.cjs en hero      # only some (languages and/or image names)
// Crop rectangles are in CSS px of the 1440x900 app window; rects.json (written by shoot.cjs) has the dialogs.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { ROOT, OUT, IMAGES, LANGS, rawDir, launch } = require("./lib.cjs");

const VW = 1440, VH = 900;
let L = "en", RAWD = rawDir("en"), R = {};
const raw = (n) => "file://" + path.join(RAWD, n + ".png");

// every caption, per language (UI words match web/pdf-editor.html's STR table)
const TXT = {
  en: {
    steps: [
      ["Open a PDF", "Click “Open new PDF”, or drop a file onto the window."],
      ["Place your signature", "Click or drag a signature or stamp onto the page, then set its size and angle."],
      ["Save a new file", "Your original stays as it is. Turn on “Seal and save” and any later edit shows."],
    ],
    feat: [
      ["Draw your signature", "Use a mouse or trackpad, in the ink color and weight you like."],
      ["Clean stamp photos", "Removes the white paper behind a photo of a stamp."],
      ["Seal: edits show", "A tamper-evident digital signature. “Verify seal” tells you if the file changed."],
      ["Text and date stamps", "Names, today’s date, “Copy” and more, in three typefaces."],
      ["Library saves as you go", "Placed signatures are kept. Each document shows whether it was saved."],
      ["English or 한국어", "Switch the language from the status bar. Nothing reloads, nothing is lost."],
    ],
    bgOff: "Photo as is", bgOn: "Paper removed",
    before: { tag: "Before", title: "Print → sign → scan", flow: ["Print<br>it out", "Sign<br>with a pen", "Scan<br>it back", "Tidy up<br>and send"],
      notes: ["You need a printer and a scanner.", "Scans often come out crooked or blurry.", "Or a paid app, or a website you upload files to."] },
    after: { tag: "Sealworks", title: "Drop it on and save", flow: ["Open<br>a PDF", "Place<br>signature", "Save a<br>new file"],
      notes: ["Right on your computer, no printer or scanner.", "Your files are never uploaded.", "Original untouched. Seal it, and later edits show."] },
    social: { head: "Sign and stamp PDFs.<br><span>Seal them, too.</span>", sub: "Free on Mac, Windows and Android.<br>Your files never leave your device.",
      chips: ["Free", "Source available", "Nothing uploaded"], platforms: ["Mac", "Windows", "Android"], sep: "·" },
    states: ["The file is exactly as it was sealed.", "Something was added or changed after sealing.", "There’s no seal, so changes can’t be detected."],
  },
  ko: {
    steps: [
      ["PDF 열기", "‘새 PDF 열기’를 누르거나, 파일을 창에 끌어다 놓습니다."],
      ["서명·도장 놓기", "오른쪽 목록에서 눌러 놓거나 끌어다 놓고, 크기와 각도를 맞춥니다."],
      ["새 파일로 저장", "원본은 그대로 둡니다. ‘봉인해서 저장’을 켜면 나중에 고친 티가 납니다."],
    ],
    feat: [
      ["직접 그리는 서명", "마우스나 트랙패드로 그리고, 잉크 색과 굵기를 고릅니다."],
      ["도장 사진도 깔끔하게", "종이에 찍은 도장을 사진으로 가져오면 흰 배경을 지워 줍니다."],
      ["봉인: 고치면 티가 남", "위·변조를 확인할 수 있는 디지털 서명. ‘봉인 확인’으로 바뀌었는지 봅니다."],
      ["글자·날짜 도장", "이름, 날짜, ‘(인)’, ‘사본’ 같은 글자를 고딕·손글씨·명조로."],
      ["보관함이 알아서 저장", "놓아 둔 서명은 자동 저장. 문서마다 저장 상태를 보여 줍니다."],
      ["한국어 · English", "아래 상태 막대에서 언어를 바꿉니다. 다시 열 필요도, 잃는 것도 없습니다."],
    ],
    bgOff: "도장 사진 그대로", bgOn: "흰 종이 배경 지우기",
    before: { tag: "이전", title: "출력 → 서명 → 스캔", flow: ["프린터로<br>출력", "펜으로<br>서명·날인", "스캐너로<br>다시 스캔", "파일 정리해<br>보내기"],
      notes: ["프린터와 스캐너가 있어야 합니다.", "스캔본은 기울거나 흐릿해지기 쉽습니다.", "아니면 유료 프로그램이나, 파일을 올려야 하는 웹사이트."] },
    after: { tag: "Sealworks", title: "끌어다 놓고 저장", flow: ["PDF<br>열기", "서명·도장<br>놓기", "새 파일로<br>저장"],
      notes: ["프린터·스캐너 없이 내 컴퓨터에서 바로.", "파일은 인터넷에 올라가지 않습니다.", "원본은 그대로. 봉인하면 나중에 고친 티가 납니다."] },
    social: { head: "PDF에 서명과 도장,<br><span>봉인까지.</span>", sub: "Mac과 Windows, Android에서 무료로 써요.<br>파일은 내 기기 밖으로 나가지 않아요.",
      chips: ["무료", "소스 공개", "업로드 없음"], platforms: ["Mac", "Windows", "Android"], sep: null },
    states: ["봉인한 그대로입니다.", "봉인한 뒤에 무언가 덧붙거나 바뀌었습니다.", "봉인이 없어서 바뀌었는지 알 수 없습니다."],
  },
};

const CSS = `
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
.card { background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(20,28,52,.08), 0 10px 30px rgba(20,28,52,.08); }
`;
// fonts: IBM Plex Sans KR (Latin + Hangul) from Google Fonts, the same family the app uses
const FONTS = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">`;

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
function fit(shot, rect, bw, bh, bg = "#e9ecf2", radius = 10, inner = "") {
  const [, , w, h] = rect; const s = Math.min(bw / w, bh / h);
  const cw = Math.round(w * s);
  return `<div style="position:relative;width:${bw}px;height:${bh}px;background:${bg};border-radius:${radius}px;display:grid;place-items:center;overflow:hidden">
    <div style="border-radius:8px;overflow:hidden;box-shadow:0 0 0 1px rgba(20,28,52,.08),0 6px 18px rgba(20,28,52,.10)">${crop(shot, rect, cw)}</div>${inner}</div>`;
}
const pad = ([x, y, w, h], p) => [x - p, y - p, w + 2 * p, h + 2 * p];
const CURSOR = (left, top) => `<svg class="cursor" style="left:${left}px;top:${top}px" viewBox="0 0 22 33"><path d="M2 2v24.5l6.2-6 4.3 10 4-1.8-4.2-9.8h8.6z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;

const page = (body, w, h) => `<!doctype html><html lang="${L}"><head><meta charset="utf-8">${FONTS}<style>${CSS}</style></head><body><div class="canvas" style="width:${w}px;height:${h}px">${body}</div></body></html>`;

/* ---------------- hero ---------------- */
function hero() {
  const W = 1200, ww = 1080;
  return { w: W, h: Math.round(ww * VH / VW) + 120, html: `<div style="position:absolute;left:${(W - ww) / 2}px;top:56px">${win("editor-signed", ww)}</div>` };
}

/* ---------------- steps ---------------- */
function steps() {
  const T = TXT[L].steps;
  const pw = 452, ph = 300, gap = 22, W = (pw + 28) * 3 + gap * 2 + 80, left = 40;
  // 1: the Library, with the title-bar "Open new PDF" button shown larger
  const lr = [60, 0, 1080, 720], ls = Math.min(pw / lr[2], ph / lr[3]);
  const ob = pad(R.openBtn, 8), obW = Math.round(ob[2] * 1.9);
  const one = `<div style="position:relative">${fit("home", lr, pw, ph, "#dfe3eb")}
      <div style="position:absolute;right:22px;top:26px;border-radius:10px;overflow:hidden;box-shadow:0 0 0 1px rgba(20,28,52,.10),0 10px 24px rgba(20,28,52,.22)">${crop("home", ob, obW)}</div>
      ${CURSOR(pw - 22 - obW / 2 + 8, 26 + Math.round(ob[3] * 1.9 / 2) + 2)}</div>`;
  // 2: signature and stamp on the line, cursor on the stamp
  // the signing spot in the upper middle of the crop, cursor on the selected item
  const sa = R.signArea, so = R.selOv, ex = Math.max(0, Math.min(VW - 1080, Math.round(sa[0] + sa[2] / 2 - 420))), ey = Math.max(0, Math.min(VH - 720, Math.round(sa[1] - 260)));
  const er = [ex, ey, 1080, 720];
  const two = `<div style="position:relative">${fit("editor-signed", er, pw, ph, "#dfe3eb")}${CURSOR(Math.round(((so[0] + so[2] * 0.6 - ex) * pw) / 1080), Math.round(((so[1] + so[3] * 0.6 - ey) * pw) / 1080))}</div>`;
  // 3: the save dialog with "Seal and save" on, and the saved toast
  const sr = pad(R.save, 0);
  const three = `<div style="position:relative">${fit("save-dialog", [sr[0] - 60, sr[1] - 14, sr[2] + 120, sr[3] + 14 + 96], pw, ph, "#dfe3eb")}
      <div style="position:absolute;left:50%;bottom:12px;transform:translateX(-50%);border-radius:9px;overflow:hidden;box-shadow:0 8px 20px rgba(0,0,0,.25)">${crop("saved-toast", R.toast, Math.min(400, Math.round(R.toast[2] * 0.75)))}</div></div>`;
  const bodies = [one, two, three];
  const html = `<div style="position:absolute;left:${left}px;top:40px;display:grid;grid-template-columns:repeat(3,${pw + 28}px);gap:${gap}px">
    ${T.map(([t, d], i) => `<div class="card" style="padding:14px 14px 20px">
      ${bodies[i]}
      <div style="display:flex;align-items:center;gap:10px;margin:18px 6px 6px"><span style="width:30px;height:30px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:700;font-size:16px">${i + 1}</span>
        <b style="font-size:23px;font-weight:700">${t}</b></div>
      <p style="margin:6px 6px 0;color:var(--muted);font-size:16px;line-height:1.5">${d}</p></div>`).join("")}
  </div>`;
  return { w: W, h: 40 + ph + 28 + 112 + 32, html };
}

/* ---------------- features (2 x 3) ---------------- */
function features() {
  const T = TXT[L];
  const cols = 3, tw = 456, th = 270, gap = 22, W = (tw + 28) * cols + gap * (cols - 1) + 80, left = 40;
  const bgTile = "#e6eaf1";
  const sealPair = () => {
    const r = pad(R.sealBg, 33), s = 170;
    const one = (shot, label, on) => `<div style="display:grid;gap:10px;justify-items:center">
      <div style="border-radius:10px;overflow:hidden;box-shadow:0 0 0 1px rgba(20,28,52,.08),0 6px 18px rgba(20,28,52,.10)">${crop(shot, r, s)}</div>
      <span style="font-size:14px;font-weight:600;color:${on ? "var(--accent)" : "var(--muted)"}">${label}</span></div>`;
    return `<div style="width:${tw}px;height:${th}px;background:${bgTile};border-radius:10px;display:flex;align-items:center;justify-content:center;gap:26px">
      ${one("seal-bg-off", T.bgOff, false)}
      <svg width="34" height="20" viewBox="0 0 34 20" style="margin-bottom:30px"><path d="M2 10h28M22 3l8 7-8 7" fill="none" stroke="#5f6779" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      ${one("seal-bg-on", T.bgOn, true)}</div>`;
  };
  // Seal: the "Seal intact" result with the sealer and fingerprint
  const v = R.vresIntact, sealTile = fit("verify-intact", [v[0] - 6, v[1] - 6, v[2] + 12, R.vsigIntact[1] + 104 - v[1]], tw, th, bgTile);
  // language: the same panel in both languages, and the status-bar switch below them
  const pr = [1150, 52, 282, 352], half = 172;
  const panel = (shot) => `<div style="border-radius:8px;overflow:hidden;box-shadow:0 0 0 1px rgba(20,28,52,.08),0 6px 18px rgba(20,28,52,.10)">${crop(shot, pr, half)}</div>`;
  const sw = pad(R.langSw, 6);
  const langTile = `<div style="width:${tw}px;height:${th}px;background:${bgTile};border-radius:10px;display:grid;place-items:center;align-content:center;gap:12px">
      <div style="display:flex;gap:16px;align-items:center">${panel("editor-signed")}
        <svg width="28" height="20" viewBox="0 0 28 20"><path d="M3 7h21M18 2l6 5-6 5M25 13H4M10 8l-6 5 6 5" fill="none" stroke="#5f6779" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        ${panel("editor-other")}</div>
      <div style="border-radius:8px;overflow:hidden;box-shadow:0 0 0 1px rgba(20,28,52,.10),0 6px 16px rgba(20,28,52,.16)">${crop("home", sw, Math.round(sw[2] * 1.25))}</div></div>`;
  const dl = R.docList;
  const bodies = [
    fit("pad", pad(R.pad, 0), tw, th, bgTile),
    sealPair(),
    sealTile,
    fit("text-dialog", pad(R.text, 0), tw, th, bgTile),
    fit("home", [dl[0], dl[1], 780, Math.min(dl[3], 326)], tw, th, bgTile),
    langTile,
  ];
  const html = `<div style="position:absolute;left:${left}px;top:40px;display:grid;grid-template-columns:repeat(${cols},${tw + 28}px);gap:${gap}px">
    ${T.feat.map(([t, d], i) => `<div class="card" style="padding:14px 14px 18px">
      ${bodies[i]}<b style="display:block;font-size:21px;font-weight:700;margin:16px 6px 0">${t}</b>
      <p style="margin:6px 6px 0;color:var(--muted);font-size:15.5px;line-height:1.5">${d}</p></div>`).join("")}
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
  const { before: B, after: A } = TXT[L];
  const W = 1500, cw = 690;
  const flow = (items, color, bg) => `<div style="display:flex;align-items:flex-start;gap:6px">${items.map((it, i) => `
    ${i ? `<svg width="22" height="56" viewBox="0 0 22 56"><path d="M4 28h12M11 22l6 6-6 6" fill="none" stroke="#aab1c0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}
    <div style="display:grid;justify-items:center;gap:8px;width:${it.w || 120}px"><span style="width:56px;height:56px;border-radius:14px;background:${bg};display:grid;place-items:center">${icon(it.i, color)}</span>
    <span style="font-size:16px;font-weight:600;text-align:center;line-height:1.35">${it.t}</span></div>`).join("")}</div>`;
  const notes = (arr, ok) => `<ul style="list-style:none;padding:0;display:grid;gap:10px;margin-top:26px">${arr.map((n) => `<li style="display:flex;gap:10px;align-items:flex-start;font-size:16.5px;line-height:1.45;color:${ok ? "var(--fg)" : "var(--muted)"}">
    <span style="flex:none;width:22px;height:22px;border-radius:50%;margin-top:1px;display:grid;place-items:center;background:${ok ? "var(--ok-soft)" : "#eceef3"};color:${ok ? "var(--ok)" : "#8a91a1"};font-weight:700;font-size:13px">${ok ? "✓" : "–"}</span>${n}</li>`).join("")}</ul>`;
  const card = (inner, accent) => `<div style="width:${cw}px;min-height:470px;border-radius:20px;padding:34px 36px;background:${accent ? "#fff" : "#f4f5f8"};box-shadow:${accent ? "0 0 0 2px var(--accent),0 16px 40px rgba(36,70,199,.14)" : "0 0 0 1px rgba(20,28,52,.08)"}">${inner}</div>`;
  const tag = (t, accent) => `<span style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:14px;font-weight:700;background:${accent ? "var(--accent)" : "#dfe2e9"};color:${accent ? "#fff" : "#5f6779"}">${t}</span>`;
  const left = card(`${tag(B.tag, false)}<h2 style="font-size:30px;margin:14px 0 26px;font-weight:700;color:#3a404c">${B.title}</h2>
    ${flow(["printer", "pen", "scan", "mail"].map((i, k) => ({ i, t: B.flow[k] })), "#7a8192", "#e6e8ee")}
    ${notes(B.notes, false)}`, false);
  const right = card(`${tag(A.tag, true)}<h2 style="font-size:30px;margin:14px 0 26px;font-weight:700">${A.title}</h2>
    <div style="display:flex;gap:22px;align-items:flex-start">
      ${flow(["open", "drag", "save"].map((i, k) => ({ i, t: A.flow[k], w: 84 })), "#2446c7", "var(--accent-soft)")}
      <div style="flex:none;border-radius:10px;overflow:hidden;box-shadow:0 0 0 1px rgba(20,28,52,.10),0 6px 16px rgba(20,28,52,.10);margin-top:2px">${crop("editor-signed", ((a) => { const w = Math.max(290, a[2] + 40), h = Math.round(w * 125 / 290); return [Math.round(a[0] + a[2] / 2 - w / 2), Math.round(a[1] + a[3] / 2 - h / 2), w, h]; })(R.signArea), 232)}</div>
    </div>
    ${notes(A.notes, true)}`, true);
  const html = `<div style="position:absolute;left:${(W - cw * 2 - 60) / 2}px;top:44px;display:flex;align-items:center;gap:0">
    ${left}<svg width="60" height="40" viewBox="0 0 60 40"><path d="M12 20h34M38 11l9 9-9 9" fill="none" stroke="#2446c7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>${right}</div>`;
  return { w: W, h: 470 + 88, html };
}

/* ---------------- social preview (1280x640): docs/images/social-<l>.png and the website's og:image ---------------- */
const BRAND_ICON = "file://" + path.join(ROOT, "docs", "brand", "sealworks-icon.svg");
const SEAL_MARK = "file://" + path.join(ROOT, "site", "assets", "seal-mark.svg");
function social() {
  const S = TXT[L].social, W = 1280, H = 640;
  const chip = (t) => `<span style="padding:7px 15px;border-radius:999px;background:#fff;box-shadow:0 0 0 1px rgba(20,28,52,.10);font-size:18px;font-weight:600;color:#3a404c">${t}</span>`;
  // platforms: one line, kept apart by space and thin rules (English also shows the dots: "Mac · Windows · Android")
  const plat = S.platforms.map((p) => `<span>${p}</span>`).join(S.sep ? `<span style="color:#9aa1b1">${S.sep}</span>` : `<i style="width:1.5px;height:18px;background:#c3c8d4;display:block"></i>`);
  const html = `
    <div style="position:absolute;left:72px;top:72px;width:560px">
      <div style="display:flex;align-items:center;gap:18px"><img src="${BRAND_ICON}" width="76" height="76" style="border-radius:17px;box-shadow:0 6px 16px rgba(20,28,52,.14)"><span style="font-size:50px;font-weight:700;letter-spacing:-.5px">Sealworks</span></div>
      <p style="font-size:${L === "ko" ? 56 : 54}px;font-weight:700;line-height:1.18;margin-top:40px;letter-spacing:-1px">${S.head.replace("<span>", '<span style="white-space:nowrap">').replace("</span>", `<img src="${SEAL_MARK}" width="60" height="60" style="vertical-align:-8px;margin-left:10px"></span>`)}</p>
      <p style="font-size:22px;color:var(--muted);margin-top:22px;line-height:1.5">${S.sub}</p>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:28px">${S.chips.map(chip).join("")}</div>
      <div style="display:flex;align-items:center;gap:14px;margin-top:18px;font-size:19px;font-weight:600;color:#3a404c">${plat}</div>
    </div>
    <div style="position:absolute;left:680px;top:96px">${win("editor-signed", 880)}</div>`;
  return { w: W, h: H, html, outW: W, outH: H };
}

/* ---------------- seal states: intact / modified / not sealed ---------------- */
function sealStates() {
  const T = TXT[L].states, cw = 520, W = cw * 3 + 2 * 26 + 80;
  // each: from the file name line down to the bottom of the status box
  const part = (shot, res, stat) => [res[0] - 4, res[1] - 4, res[2] + 8, stat[1] + stat[3] - res[1] + 12];
  const items = [
    ["verify-intact", part(null, R.vresIntact, R.vstatIntact), T[0]],
    ["verify-modified", part(null, R.vresModified, R.vstatModified), T[1]],
    ["verify-none", part(null, R.vresNone, R.vstatNone), T[2]],
  ];
  const tallest = Math.max(...items.map(([, r]) => (r[3] * (cw - 28)) / r[2]));
  const html = `<div style="position:absolute;left:40px;top:40px;display:flex;gap:26px;align-items:stretch">
    ${items.map(([shot, r, cap]) => `<div class="card" style="width:${cw}px;padding:14px 14px 18px;display:grid;align-content:start">
      <div style="height:${Math.ceil(tallest)}px;display:flex;align-items:flex-start"><div style="border-radius:8px;overflow:hidden;box-shadow:0 0 0 1px rgba(20,28,52,.08)">${crop(shot, r, cw - 28)}</div></div>
      <p style="margin:14px 6px 0;color:var(--muted);font-size:16px;line-height:1.5">${cap}</p></div>`).join("")}
  </div>`;
  return { w: W, h: 40 + Math.ceil(tallest) + 86 + 40, html };
}

async function render(browser, name, spec, scale) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${name}-${L}.html`);
  fs.writeFileSync(file, page(spec.html, spec.w, spec.h));
  const ctx = await browser.newContext({ viewport: { width: spec.w, height: spec.h }, deviceScaleFactor: scale });
  const p = await ctx.newPage();
  await p.goto("file://" + file, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  const tmp = path.join(OUT, `${name}-${L}.full.png`);
  await p.locator(".canvas").screenshot({ path: tmp });
  await ctx.close();
  const dest = path.join(IMAGES, `${name}-${L}.png`);
  let img = sharp(tmp);
  if (spec.outW) img = img.resize(spec.outW, spec.outH);
  await img.png({ palette: true, quality: 92, effort: 10, dither: 0.6 }).toFile(dest);
  console.log(`${name}-${L}`, (fs.statSync(dest).size / 1024).toFixed(0) + " KB");
  if (name === "social") { // the website's og:image is the same picture
    const site = path.join(ROOT, "site", "assets", `social-${L}.png`);
    fs.copyFileSync(dest, site); console.log(`site/assets/social-${L}.png`);
  }
}

(async () => {
  fs.mkdirSync(IMAGES, { recursive: true });
  const args = process.argv.slice(2);
  const langs = args.filter((a) => LANGS.includes(a)), only = args.filter((a) => !LANGS.includes(a));
  const jobs = { hero: [hero, 1.6], steps: [steps, 1.4], features: [features, 1.4], "before-after": [beforeAfter, 1.4], social: [social, 2], "seal-states": [sealStates, 1.4] };
  const browser = await launch();
  for (const lang of langs.length ? langs : LANGS) {
    L = lang; RAWD = rawDir(lang);
    R = JSON.parse(fs.readFileSync(path.join(RAWD, "rects.json"), "utf8"));
    for (const [name, [fn, scale]] of Object.entries(jobs)) if (!only.length || only.includes(name)) await render(browser, name, fn(), scale);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
