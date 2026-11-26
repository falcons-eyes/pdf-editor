// Records a short clip (6 to 15 s) of each 1.3 example of the gallery (docs/design/workflows.md rule 6,
// docs/samples/README.md), from the real UI: the Library home with the grouped gallery -> a click on the example's card
// -> the block at work (cover and pattern, receipts on one page, make many, page numbers, the hidden text notice,
// the No AI notice in Verify, photos as a page and the seal).
//   node workflows-demo.cjs en|ko [id …]        (through render.sh workflows, which runs the dev server)
// Writes docs/media/workflows/<id>-<lang>.mp4 (1200x750 H.264, 25 fps) and <id>-<lang>.webp (poster).
// Never writes to site/: the website doesn't announce 1.3 before it ships.
const fs = require("fs");
const path = require("path");
const { ROOT, LANG, fakeHome, wipeFakeHome, launch, newPage, openApp, makeSealer, sleep } = require("./lib.cjs");
const { recorder, toMp4 } = require("./rec.cjs");

const OUT = path.join(ROOT, "docs", "media", "workflows");
const IDS = ["idcopy", "receipts", "certificates", "bundle", "aiguard", "noai", "inspection"];
const VW = 1280, VH = 800;
const ko = LANG === "ko";
const CAP = {
  idcopy: ko ? ["은행에 낼 신분증 사본을 열면", "주민번호 뒷자리는 가리기 상자로 가리고", "쪽 전체에 제출용 무늬가 들어가요", "저장하면 가린 숫자는 파일에서 지워져요"]
    : ["Open the ID copy for the bank", "A cover box hides half the number", "and a “for this use only” pattern covers the page", "Save, and the covered digits are gone from the file"],
  receipts: ko ? ["영수증 증빙을 열면", "결재 도장은 첫 쪽에 찍혀 있고", "영수증 사진 네 장은 한 쪽에 모였어요", "쪽 정리에서 한 쪽에 몇 장 넣을지 골라요"]
    : ["Open the receipts for an expense claim", "The approval stamp is on the cover sheet", "and the four receipt photos share one page", "In Pages, choose how many photos go on a page"],
  certificates: ko ? ["수료증에 이름과 과정 칸을 두고", "명단을 넣으면", "사람마다 수료증이 한 장씩 생겨요"]
    : ["A certificate with name and course fields", "add the list of people", "and each person gets a certificate"],
  bundle: ko ? ["증거 서류 세 가지를 한 파일로 묶고", "모든 쪽에 쪽 번호를 넣고", "사본마다 원본대조필을 찍어요"]
    : ["Three documents in one file", "a page number on every page", "and each copy stamped as certified"],
  aiguard: ko ? ["받은 지원서를 열면 숨은 글자를 찾아 알려 줘요", "사람 눈엔 안 보이는 흰 글자가 AI에게 지시하고 있었어요"]
    : ["Open an application you got, and hidden text is found", "White text nobody can see was giving AI orders"],
  noai: ko ? ["제안서를 저장할 때", "AI 사용 거부 표시를 넣고 봉인해요", "봉인 확인에서 표시가 그대로인지 보여요"]
    : ["When you save your proposal", "add the No AI notice and seal it", "Verify seal shows the notice is intact"],
  inspection: ko ? ["입주하는 날 체크하고 두 사람이 서명해요", "방 사진은 한 쪽에 붙이고", "봉인해서 저장하면 나중에 바뀐 곳이 드러나요"]
    : ["Tick the checklist on move-in day, both of you sign", "the room photos go on a page", "and a seal shows any later change"],
};

async function record(browser, id) {
  const home = wipeFakeHome();
  for (const d of ["Documents", "Downloads", "Desktop"]) fs.mkdirSync(path.join(home, d), { recursive: true }); // where saves go
  const page = await newPage(browser, { width: VW, height: VH });
  await openApp(page);
  if (id === "noai" || id === "inspection") await makeSealer(page);
  await page.evaluate(() => {
    const p = window.__pdfe, S = p.S;
    Object.assign(S.prefs, { examplesOpen: true, sealOnSave: false, aiNotice: false, aiLine: false, sheetPer: 4 });
    p.showHome();
  });
  await sleep(600);
  // the gallery in view, the card's group near the top
  await page.evaluate((id) => {
    const m = document.querySelector("#home .home-main"), card = document.querySelector(`.ex-card[data-ex="${id}"]`), h = card.closest(".ex-group").querySelector("h3");
    m.scrollTop = h.getBoundingClientRect().top - m.getBoundingClientRect().top + m.scrollTop - 110;
  }, id);
  await sleep(500);
  await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach((t) => t.remove()));

  const name = `wf-${id}-${LANG}`, R = await recorder(page, name), { P, glide, click, clickSel, caption } = R;
  const smooth = (sel, to, ms = 900) => P(async ([sel, to, ms]) => {
    const st = document.querySelector(sel), from = st.scrollTop;
    await new Promise((res) => { const t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; st.scrollTop = from + (to - from) * e; k < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
  }, [sel, to, ms]);
  const stageTo = (pg, frac) => P(([pg, frac]) => { const S = window.__pdfe.S, st = document.querySelector("#stage"), p = S.pages[pg]; return p.el.offsetTop + p.el.offsetHeight * frac - st.clientHeight / 2; }, [pg, frac]);
  async function zoomTo(z, pg, frac, ms = 700) { // eased zoom, keeping a page point in the middle
    const z0 = await P(() => window.__pdfe.S.zoom), n = Math.max(1, Math.round(ms / 50));
    for (let i = 1; i <= n; i++) {
      const k = i / n, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      await P(([z, pg, frac]) => { window.__pdfe.setZoom(z); const S = window.__pdfe.S, st = document.querySelector("#stage"), p = S.pages[pg]; st.scrollTop = p.el.offsetTop + p.el.offsetHeight * frac - st.clientHeight / 2; }, [z0 + (z - z0) * e, pg, frac]);
      await sleep(25);
    }
  }
  // a point of a page (page points) on screen
  const client = (pg, x, y) => P(([pg, x, y]) => { const S = window.__pdfe.S, r = S.pages[pg].el.getBoundingClientRect(); return { x: r.left + x * S.zoom, y: r.top + y * S.zoom }; }, [pg, x, y]);
  const item = (test) => P((src) => { const S = window.__pdfe.S, f = (0, eval)(src); const o = S.overlays.find((o) => f(o, S.assets.get(o.assetId))); return o ? { page: o.page, x: o.x + o.w / 2, y: o.y + o.h / 2 } : null; }, test);
  const toastBtn = (label) => P((label) => { const b = [...document.querySelectorAll(".toast button")].find((x) => x.textContent.trim() === label); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, label);
  const T = (k, p) => P(([k, p]) => window.__pdfe.t(k, p || {}), [k, p]);
  const newestPdf = () => { // the file just saved in the sandbox home
    let best = null; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== "Library") walk(f); } else if (/\.pdf$/i.test(e.name)) { const m = fs.statSync(f).mtimeMs; if (!best || m > best.m) best = { f, m }; } } };
    walk(fakeHome()); return best ? "~/" + path.relative(fakeHome(), best.f).split(path.sep).join("/") : null;
  };
  const c = CAP[id];
  let posterWall = null;

  await R.start(); await sleep(900);
  await caption(c[0]);
  await clickSel(`.ex-card[data-ex="${id}"]`, 750);
  await page.waitForFunction((id) => window.__pdfe.S.doc?.exampleId === id && window.__pdfe.S.view === "editor", id, { timeout: 20000 });
  await sleep(900);

  if (id === "idcopy") {
    await zoomTo(1.05, 0, 0.42, 600); await sleep(500);
    await caption(c[1]);
    const box = await item("(o) => o.cover"), at = await client(box.page, box.x, box.y);
    await click(at.x, at.y, 700); await sleep(1500);
    await caption(c[2]);
    await P(() => window.__pdfe.select(null));
    await glide(VW * 0.32, VH * 0.72, 700); await sleep(1400); posterWall = Date.now() / 1000;
    await caption(c[3], { top: true });
    await clickSel("#btn-export", 650); await sleep(1700);
    await clickSel("#save-ok", 600); await sleep(1900);
  } else if (id === "receipts") {
    await zoomTo(0.8, 0, 0.18, 500);
    await caption(c[1]); await sleep(1300);
    await caption(c[2]);
    await smooth("#stage", await stageTo(1, 0.5), 1100); await sleep(1300); posterWall = Date.now() / 1000;
    await caption(c[3], { top: true });
    await clickSel("#btn-pages", 650); await sleep(900);
    await clickSel("#pg-per button[aria-pressed='true']", 600); await sleep(1600);
    await clickSel("#dlg-pages [data-close]", 600); await sleep(600);
  } else if (id === "certificates") {
    await zoomTo(0.95, 0, 0.36, 500);
    await sleep(1200);
    await caption(c[1], { top: true });
    const b = await toastBtn(await T("form.many"));
    if (b) await click(b.x, b.y, 650); else await P(() => window.__pdfeForms.openMany());
    await page.waitForSelector("#dlg-many[open]"); await sleep(1300);
    fs.mkdirSync(path.join(fakeHome(), "Documents", ko ? "수료증" : "Certificates"), { recursive: true });
    await P((d) => { window.__shimDialogNext = [d]; }, ko ? "~/Documents/수료증" : "~/Documents/Certificates");
    await P(() => document.querySelector("#many-dir-btn").scrollIntoView({ block: "center", behavior: "smooth" })); await sleep(600);
    await clickSel("#many-dir-btn", 600);
    await page.waitForFunction(() => window.__pdfeForms.MANY.dir, null, { timeout: 10000 }); await sleep(500);
    await caption(c[2], { top: true });
    await clickSel("#many-go", 600);
    await page.waitForFunction(() => window.__pdfeForms.MANY.step === "done", null, { timeout: 60000 })
      .catch(async (e) => { console.log(await P(() => JSON.stringify({ dir: window.__pdfeForms.MANY.dir, step: window.__pdfeForms.MANY.step, msg: window.__pdfeForms.MANY.msg, status: document.querySelector("#many-status")?.innerText, toasts: [...document.querySelectorAll(".toast span")].map((x) => x.textContent) }))); await page.screenshot({ path: path.join(OUT, "..", "debug.png") }); throw e; });
    await sleep(400); posterWall = Date.now() / 1000;
    await P(() => document.querySelector("#many-status")?.scrollIntoView({ block: "center", behavior: "smooth" }));
    await sleep(2200);
  } else if (id === "bundle") {
    await caption(c[0], { top: true });
    await clickSel("#btn-pages", 650); await sleep(1700);
    await clickSel("#dlg-pages [data-close]", 600); await sleep(400);
    await caption(c[1]);
    await zoomTo(0.75, 0, 0.92, 700); await sleep(900);
    await smooth("#stage", await stageTo(1, 0.95), 1100); await sleep(600);
    await caption(c[2]);
    await smooth("#stage", await stageTo(2, 0.22), 900); posterWall = Date.now() / 1000 + 0.6; await sleep(1800);
  } else if (id === "aiguard") {
    await page.waitForFunction(() => document.querySelectorAll(".toast button").length, null, { timeout: 10000 });
    await sleep(900);
    const b = await toastBtn(await T("hid.see"));
    if (b) await click(b.x, b.y, 650);
    await page.waitForSelector("#dlg-hidden[open]"); await sleep(500);
    await caption(c[1], { top: true }); posterWall = Date.now() / 1000 + 0.8;
    await glide(VW * 0.7, VH * 0.86, 600); await sleep(2600);
  } else if (id === "noai") {
    await P(() => document.querySelectorAll("#toasts .toast").forEach((t) => t.remove()));
    await clickSel("#btn-export", 650); await sleep(700);
    await clickSel("#save-more > summary", 600); await sleep(500);
    await P(() => document.querySelector("#save-ai")?.scrollIntoView({ block: "center", behavior: "smooth" })); await sleep(700);
    await caption(c[1], { top: true });
    await glide((await R.box("#save-ai")).x, (await R.box("#save-ai")).y, 600); await sleep(1100);
    await clickSel("#save-ok", 600); await sleep(1800);
    const saved = newestPdf();
    await caption(c[2], { top: true });
    await clickSel("#btn-verify", 600); await sleep(500);
    await P((p) => { window.__shimDialogNext = [p]; }, saved);
    await clickSel("#v-pick", 550); await sleep(900);
    await P(() => document.querySelector("#dlg-verify .v-checks")?.scrollIntoView({ block: "center", behavior: "smooth" })); await sleep(500);
    posterWall = Date.now() / 1000;
    await glide(VW * 0.86, VH * 0.84, 500); await sleep(2200);
  } else if (id === "inspection") {
    await zoomTo(0.9, 0, 0.55, 600); await sleep(1500);
    await caption(c[1]);
    await smooth("#stage", await stageTo(1, 0.5), 1100); await sleep(1200); posterWall = Date.now() / 1000;
    await caption(c[2], { top: true });
    await clickSel("#btn-export", 650); await sleep(700);
    await clickSel("#save-seal", 600); await sleep(800);
    await clickSel("#save-ok", 600); await sleep(2000);
  }
  await caption(""); await sleep(500);
  const frames = await R.stop();
  await page.context().close();
  fs.mkdirSync(OUT, { recursive: true });
  await toMp4(frames, name, path.join(OUT, `${id}-${LANG}.mp4`), { maxS: 15, crf: 31, poster: path.join(OUT, `${id}-${LANG}.webp`), posterWall });
}

(async () => {
  const want = process.argv.slice(3).filter((x) => IDS.includes(x));
  const browser = await launch();
  for (const id of want.length ? want : IDS) await record(browser, id);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
