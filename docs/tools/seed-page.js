/* Injected into the Sealworks page by the capture scripts (never shipped).
   Builds clearly fake documents and stamps so screenshots never show real data.
   All names, companies and numbers below are made up. */
(() => {
  const P = () => window.__pdfe;
  const FF = '"IBM Plex Sans KR", "Apple SD Gothic Neo", sans-serif';
  const W = 1240, H = 1754, K = 595.28 / 1240; // drawing px -> PDF pt
  const canvasOf = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const b64 = (url) => { const b = atob(url.split(",")[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  const desk = () => window.claude.use("desktop");
  let LANG = "ko"; // set by setLang(): picks the made-up documents and stamps for that UI language

  async function fonts() {
    await Promise.allSettled([
      document.fonts.load(`600 40px ${FF}`, "가나다계약서 Agreement"), document.fonts.load(`400 24px ${FF}`, "가나다"),
      document.fonts.load('800 100px "Nanum Myeongjo"', "홍길동인"), document.fonts.load('100px "Nanum Pen Script"', "홍길동"),
    ]);
  }

  // A4 page drawn on a canvas (like the app's own example), returns where the signing lines are (in pt)
  function drawPage(spec, pi, total, variant = 0) {
    const c = canvasOf(W, H), g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); g.fillStyle = "#1a1d24";
    let y = 190; const marks = [];
    if (spec.title) { g.font = `600 58px ${FF}`; g.textAlign = "center"; g.fillText(spec.title, W / 2, y); g.textAlign = "left"; y += 120; }
    g.font = `400 27px ${FF}`;
    for (const line of spec.lines) { g.fillText(line, 140, y); y += line ? 50 : 26; }
    if (variant) { g.fillStyle = "#c3302a"; g.font = `600 24px ${FF}`; g.fillText(LANG === "ko" ? "※ 수정본: 내용을 일부 바꿈" : "* Revised version: some terms changed", 140, y + 10); g.fillStyle = "#1a1d24"; y += 40; }
    if (spec.signers) {
      y += 60;
      for (const [who, co, rep] of spec.signers) {
        const label = LANG === "ko" ? `“${who}”` : who;
        g.font = `600 28px ${FF}`; g.fillText(label, 140, y);
        g.font = `400 27px ${FF}`; const cx = Math.max(240, 140 + Math.ceil(g.measureText(label).width * 1.05) + 26); g.fillText(co, cx, y); g.fillText(rep, cx, y + 50);
        if (LANG === "ko") g.fillText("(인)", 900, y + 50); // English contracts: the stamp simply goes next to the signature
        g.strokeStyle = "#9aa1b1"; g.lineWidth = 2; g.beginPath(); g.moveTo(600, y + 60); g.lineTo(880, y + 60); g.stroke();
        marks.push({ who, line: { x0: 600 * K, x1: 880 * K, y: (y + 60) * K }, seal: { x: 925 * K, y: (y + 42) * K } });
        y += 190;
      }
    }
    if (spec.box) { // a simple table for 견적서
      g.strokeStyle = "#c9cfdb"; g.lineWidth = 2;
      const x0 = 140, x1 = W - 140; let ty = y + 20;
      const rows = spec.box; const colX = [x0, x0 + 520, x0 + 700, x1];
      for (let r = 0; r <= rows.length; r++) { g.beginPath(); g.moveTo(x0, ty + r * 64); g.lineTo(x1, ty + r * 64); g.stroke(); }
      for (const cx of colX) { g.beginPath(); g.moveTo(cx, ty); g.lineTo(cx, ty + rows.length * 64); g.stroke(); }
      rows.forEach((row, r) => { g.font = `${r === 0 ? 600 : 400} 25px ${FF}`; row.forEach((cell, ci) => g.fillText(cell, colX[ci] + 18, ty + r * 64 + 42)); });
      y = ty + rows.length * 64 + 70;
      if (spec.after) { g.font = `400 27px ${FF}`; for (const line of spec.after) { g.fillText(line, 140, y); y += line ? 50 : 26; } }
    }
    g.font = `400 20px ${FF}`; g.fillStyle = "#8a91a1"; g.textAlign = "center"; g.fillText(`- ${pi + 1} / ${total} -`, W / 2, H - 90);
    return { c, marks };
  }

  async function makePdf(pages, variant = 0) {
    await fonts();
    const { PDFDocument } = window.PDFLib;
    const doc = await PDFDocument.create(); const marks = [];
    for (let i = 0; i < pages.length; i++) {
      const r = drawPage(pages[i], i, pages.length, i === pages.length - 1 ? variant : 0);
      const jpg = await doc.embedJpg(b64(r.c.toDataURL("image/jpeg", 0.9)));
      doc.addPage([595.28, 841.89]).drawImage(jpg, { x: 0, y: 0, width: 595.28, height: 841.89 });
      for (const m of r.marks) marks.push({ page: i, ...m });
    }
    return { bytes: new Uint8Array(await doc.save()), marks };
  }

  const DOCS_KO = {
    contract: [
      { title: "용역 계약서", lines: [
        "발주자 가나다 주식회사(이하 “갑”)와 수급자 라온스튜디오(이하 “을”)는",
        "다음과 같이 용역 계약을 맺는다.", "",
        "제1조 (목적)  이 계약은 “갑”의 회사 소개 영상 제작 용역에 관한 사항을 정한다.", "",
        "제2조 (기간)  2026년 12월 1일부터 2027년 1월 31일까지로 한다.", "",
        "제3조 (금액)  금 오백만 원정(₩5,000,000, 부가가치세 별도)",
        "  · 선금 50%: 계약 후 7일 이내", "  · 잔금 50%: 결과물 검수 후 14일 이내", "",
        "제4조 (결과물)  “을”은 편집 원본과 최종 영상 파일을 “갑”에게 넘긴다.", "",
        "제5조 (비밀 유지)  두 당사자는 일하면서 알게 된 상대방의 정보를",
        "제3자에게 알리지 않는다.",
      ] },
      { title: "", lines: [
        "제6조 (해지)  한쪽이 계약을 어기고 14일 안에 바로잡지 않으면",
        "상대방은 서면으로 계약을 해지할 수 있다.", "",
        "제7조 (분쟁)  이 계약에 관한 분쟁은 서울중앙지방법원을 관할 법원으로 한다.", "",
        "이 계약을 증명하기 위해 계약서 2부를 만들어 서명 날인한 뒤 1부씩 나눠 갖는다.", "", "",
        "2026년 11월 25일",
      ], signers: [["갑", "가나다 주식회사", "대표이사  김 철 수"], ["을", "라온스튜디오", "대표  홍 길 동"]] },
    ],
    quote: [{ title: "견 적 서", lines: ["수신: 가나다 주식회사 귀중", "견적일: 2026년 11월 20일", ""],
      box: [["품목", "수량", "금액"], ["회사 소개 영상 (3분)", "1", "4,000,000"], ["자막·번역", "1", "600,000"], ["촬영 장비 대여", "2일", "400,000"], ["합계 (부가세 별도)", "", "5,000,000"]],
      after: ["", "위와 같이 견적합니다.", "", "라온스튜디오  대표  홍 길 동"] }],
    employ: [{ title: "재 직 증 명 서", lines: [
      "성명: 홍길동", "소속: 가나다 주식회사 디자인팀", "직위: 선임", "재직 기간: 2023년 3월 2일 ~ 현재", "",
      "용도: 금융기관 제출용", "", "위 사람이 우리 회사에 재직 중임을 증명합니다.", "", "", "2026년 11월 18일", "", "가나다 주식회사  대표이사  김 철 수"] }],
    nda: [{ title: "비밀 유지 서약서", lines: [
      "본인은 가나다 주식회사와의 프로젝트를 하면서 알게 된 정보를", "다음과 같이 지킬 것을 서약합니다.", "",
      "1. 업무로 알게 된 정보를 회사 허락 없이 외부에 알리지 않습니다.", "2. 프로젝트가 끝나면 받은 자료를 돌려주거나 지웁니다.", "3. 이 서약은 프로젝트 종료 후 2년 동안 유효합니다.", ""],
      signers: [["서약자", "라온스튜디오", "대표  홍 길 동"]] }],
    proxy: [{ title: "위 임 장", lines: [
      "위임하는 사람: 홍길동", "위임받는 사람: 김영희", "", "위임 내용: 사업자 등록 서류 발급 및 수령", "", "위와 같이 위임합니다.", "", "2026년 11월 10일"],
      signers: [["위임인", "", "홍 길 동"]] }],
    lease: [{ title: "사무실 임대차 계약서", lines: [
      "임대인 박민수와 임차인 라온스튜디오는 아래 사무실에 대해 임대차 계약을 맺는다.", "",
      "소재지: 서울특별시 가상구 예시로 12, 3층", "보증금: 금 일천만 원정", "월 임대료: 금 팔십만 원정 (매월 25일 지급)", "기간: 2026년 12월 1일부터 2년"],
      signers: [["임대인", "", "박 민 수"], ["임차인", "라온스튜디오", "대표  홍 길 동"]] }],
  };

  // English: all people, companies and addresses are made up
  const DOCS_EN = {
    contract: [
      { title: "Service Agreement", lines: [
        "This agreement is between Brightline Trading Inc. (the “Client”)",
        "and Lumen Studio (the “Contractor”).", "",
        "1. Purpose  The Contractor will produce a company video for the Client.", "",
        "2. Term  From December 1, 2026 to January 31, 2027.", "",
        "3. Fee  USD 5,000, excluding tax.",
        "  · 50% deposit within 7 days of signing", "  · 50% within 14 days after the final video is accepted", "",
        "4. Deliverables  The Contractor delivers the edit project and the",
        "final video files to the Client.", "",
        "5. Confidentiality  Neither party will share the other party’s",
        "confidential information with anyone else.",
      ] },
      { title: "", lines: [
        "6. Termination  If one party breaks this agreement and does not fix it",
        "within 14 days, the other party may end it in writing.", "",
        "7. Disputes  Any dispute about this agreement will be settled in the",
        "courts of Sampletown County.", "",
        "Signed in two copies. Each party keeps one.", "", "",
        "November 25, 2026",
      ], signers: [["Client", "Brightline Trading Inc.", "Sam Carter, CEO"], ["Contractor", "Lumen Studio", "Jordan Lee, Owner"]] },
    ],
    quote: [{ title: "Quote", lines: ["To: Brightline Trading Inc.", "Date: November 20, 2026", ""],
      box: [["Item", "Qty", "Amount (USD)"], ["Company video (3 min)", "1", "4,000.00"], ["Subtitles and translation", "1", "600.00"], ["Camera rental", "2 days", "400.00"], ["Total (excluding tax)", "", "5,000.00"]],
      after: ["", "Thank you for considering us.", "", "Lumen Studio  ·  Jordan Lee, Owner"] }],
    employ: [{ title: "Employment Verification", lines: [
      "Name: Casey Park", "Department: Design, Brightline Trading Inc.", "Position: Senior Designer", "Employed since: March 2, 2023", "",
      "Purpose: for submission to a bank", "", "We confirm that the person above is currently employed by us.", "", "", "November 18, 2026", "", "Brightline Trading Inc.  ·  Sam Carter, CEO"] }],
    nda: [{ title: "Non-Disclosure Agreement", lines: [
      "I agree to protect the information I learn while working on a project", "with Brightline Trading Inc., as follows.", "",
      "1. I will not share work information without the company’s consent.", "2. When the project ends, I will return or delete all materials.", "3. This agreement stays in effect for 2 years after the project ends.", ""],
      signers: [["Signed by", "Lumen Studio", "Jordan Lee, Owner"]] }],
    proxy: [{ title: "Power of Attorney", lines: [
      "Principal: Jordan Lee", "Agent: Morgan Bae", "", "Scope: requesting and collecting business registration documents", "", "I grant the authority described above.", "", "November 10, 2026"],
      signers: [["Principal", "", "Jordan Lee"]] }],
    lease: [{ title: "Office Lease Agreement", lines: [
      "Landlord Pat Rivera and tenant Lumen Studio agree to lease the office below.", "",
      "Address: 12 Example Street, Suite 300, Sampletown", "Deposit: USD 10,000", "Monthly rent: USD 800, due on the 25th", "Term: 2 years from December 1, 2026"],
      signers: [["Landlord", "", "Pat Rivera"], ["Tenant", "Lumen Studio", "Jordan Lee, Owner"]] }],
  };
  // the NDA as rewritten "outside the app" (the shots show the app noticing the change)
  const NDA_REVISED = {
    ko: [{ title: "비밀 유지 서약서", lines: ["본인은 가나다 주식회사와의 프로젝트를 하면서 알게 된 정보를", "다음과 같이 지킬 것을 서약합니다.", "", "1. 업무로 알게 된 정보를 회사 허락 없이 외부에 알리지 않습니다.", "2. 프로젝트가 끝나면 받은 자료를 돌려주거나 지웁니다.", "3. 이 서약은 프로젝트 종료 후 3년 동안 유효합니다.", ""], signers: [["서약자", "라온스튜디오", "대표  홍 길 동"]] }],
    en: [{ title: "Non-Disclosure Agreement", lines: ["I agree to protect the information I learn while working on a project", "with Brightline Trading Inc., as follows.", "", "1. I will not share work information without the company’s consent.", "2. When the project ends, I will return or delete all materials.", "3. This agreement stays in effect for 3 years after the project ends.", ""], signers: [["Signed by", "Lumen Studio", "Jordan Lee, Owner"]] }],
  };

  async function writeHome(path, bytes) {
    const d = await desk();
    await d.fs.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
    await d.fs.writeFile(path, bytes);
    const st = await d.fs.stat(path);
    return { size: st.size, mtime: st.mtimeMs };
  }
  async function createDoc(key, path, variant = 0) {
    const { bytes, marks } = await makePdf((LANG === "ko" ? DOCS_KO : DOCS_EN)[key], variant);
    await writeHome(path, bytes);
    return marks;
  }
  async function openPath(path) {
    const d = await desk(); const bytes = new Uint8Array(await d.fs.readFile(path)); const st = await d.fs.stat(path);
    const name = path.slice(path.lastIndexOf("/") + 1);
    await P().openPdfBytes(bytes, name, { path, stat: { size: st.size, mtime: st.mtimeMs }, quiet: true });
    await new Promise((r) => setTimeout(r, 700)); // thumbnail
  }

  // red seal, photographed on off-white paper (so "remove white paper background" has something to do)
  function sealPhoto() {
    const N = 420, c = canvasOf(N, N), g = c.getContext("2d");
    g.fillStyle = "#f7f5f0"; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(120,110,90,${Math.random() * 0.04})`; g.fillRect(Math.random() * N, Math.random() * N, 2, 2); }
    const grd = g.createRadialGradient(N * 0.3, N * 0.25, 20, N / 2, N / 2, N * 0.75); grd.addColorStop(0, "rgba(255,255,255,.35)"); grd.addColorStop(1, "rgba(0,0,0,.035)");
    g.fillStyle = grd; g.fillRect(0, 0, N, N);
    g.save(); g.translate(N / 2, N / 2); g.rotate(-0.06);
    g.strokeStyle = "#c62a22"; g.lineWidth = 15; g.beginPath(); g.arc(0, 0, 160, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#c62a22"; g.textAlign = "center"; g.textBaseline = "middle";
    if (LANG === "ko") {
      g.font = '800 104px "Nanum Myeongjo", serif';
      for (const [ch, dx, dy] of [["홍", 54, -52], ["길", 54, 56], ["동", -54, -52], ["인", -54, 56]]) g.fillText(ch, dx, dy);
    } else { // a Latin-letter name seal: JORDAN over LEE
      g.font = '800 46px "Nanum Myeongjo", serif'; g.fillText("JORDAN", 0, -40);
      g.lineWidth = 6; g.beginPath(); g.moveTo(-112, 4); g.lineTo(112, 4); g.stroke();
      g.font = '800 92px "Nanum Myeongjo", serif'; g.fillText("LEE", 0, 62);
    }
    g.restore();
    // worn ink
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(60,60,60,${Math.random() * 0.35})`; g.beginPath(); g.arc(Math.random() * N, Math.random() * N, Math.random() * 2.5 + 0.4, 0, Math.PI * 2); g.fill(); }
    return c.toDataURL("image/jpeg", 0.9);
  }
  // company seal: square 직인 (ko) or a round "official seal" with lettering around the edge (en)
  function companySeal() {
    const N = 360, c = canvasOf(N, N), g = c.getContext("2d");
    g.strokeStyle = "#c3302a"; g.fillStyle = "#c3302a"; g.textAlign = "center"; g.textBaseline = "middle";
    if (LANG === "ko") {
      g.lineWidth = 14; g.strokeRect(22, 22, N - 44, N - 44);
      g.lineWidth = 4; g.strokeRect(42, 42, N - 84, N - 84);
      g.font = '800 70px "Nanum Myeongjo", serif';
      const cols = [["가", "나", "다"], ["주", "식", "회"], ["사", "지", "인"]]; // read right column first
      cols.forEach((col, ci) => col.forEach((ch, ri) => g.fillText(ch, N - 98 - ci * 82, 98 + ri * 82)));
    } else {
      const R = N / 2;
      g.lineWidth = 12; g.beginPath(); g.arc(R, R, R - 16, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.arc(R, R, R - 80, 0, Math.PI * 2); g.stroke();
      const ring = (text, mid, dir) => { // letters along the ring between the two circles
        g.font = '800 34px "Nanum Myeongjo", serif';
        const r = R - 48, step = 0.168, a0 = mid - (dir * step * (text.length - 1)) / 2;
        [...text].forEach((ch, i) => { const a = a0 + dir * i * step; g.save(); g.translate(R + r * Math.cos(a), R + r * Math.sin(a)); g.rotate(a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2)); g.fillText(ch, 0, 0); g.restore(); });
      };
      ring("BRIGHTLINE TRADING", -Math.PI / 2, 1);
      ring("INC.", Math.PI / 2, -1);
      g.font = '800 30px "Nanum Myeongjo", serif'; g.fillText("OFFICIAL", R, R - 22); g.fillText("SEAL", R, R + 22);
      g.beginPath(); for (const dx of [-112, 112]) { g.moveTo(R + dx, R - 9); g.lineTo(R + dx + 9, R); g.lineTo(R + dx, R + 9); g.lineTo(R + dx - 9, R); g.closePath(); } g.fill();
    }
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 700; i++) { g.globalAlpha = Math.random() * 0.5; g.beginPath(); g.arc(Math.random() * N, Math.random() * N, Math.random() * 2.6 + 0.4, 0, Math.PI * 2); g.fill(); }
    return c.toDataURL("image/png");
  }
  async function addImageAsset(src, name, kind = "image") {
    const a = await P().makeAssetFromSource(src, { kind, name });
    await P().addToLibrary(a); return a.id;
  }

  // signature strokes, normalised to a 0..1 box (x) and roughly -0.5..0.5 (y)
  function signatureStrokes() {
    const strokes = [];
    // capital-like opening stroke
    const s1 = [];
    for (let t = 0; t <= 1; t += 0.01) {
      const x = 0.02 + 0.10 * t + 0.03 * Math.sin(t * Math.PI * 2);
      const y = 0.38 - 0.85 * Math.sin(t * Math.PI * 0.95) + 0.1 * t;
      s1.push([x, y]);
    }
    strokes.push(s1);
    // loopy cursive body
    const s2 = []; const N = 5.3 * Math.PI * 2;
    for (let t = 0; t <= N; t += 0.035) {
      const p = t / N; const env = 0.75 + 0.35 * Math.sin(p * Math.PI * 1.3) - 0.25 * p;
      const x = 0.12 + p * 0.68 - 0.022 * Math.sin(t) * env * 1.4;
      const y = 0.12 - 0.20 * Math.cos(t) * env - 0.05 * Math.sin(p * 9) + 0.08 * p - 0.12;
      s2.push([x - 0.06 * (y - 0.1), y]);
    }
    strokes.push(s2);
    // underline swoosh
    const s3 = [];
    for (let t = 0; t <= 1; t += 0.01) s3.push([0.06 + 0.9 * t, 0.42 - 0.12 * t + 0.10 * Math.sin(t * Math.PI) * -1 + 0.05 * t * t]);
    strokes.push(s3);
    return strokes;
  }

  const setLang = (l) => { LANG = l === "en" ? "en" : "ko"; };
  window.__seed = { setLang, fonts, makePdf, createDoc, openPath, writeHome, sealPhoto, companySeal, addImageAsset, signatureStrokes, NDA_REVISED: () => NDA_REVISED[LANG], K };
})();
