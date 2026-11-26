// Seal unit test (plain Node, no Electron): certificate, PKCS#12, signing and every verify status,
// plus interoperability with signatures made by other tools:
//   - test/fixtures/pyhanko-certified-plus-approval.pdf: pyHanko 0.38 certification signature
//     (PAdES, RSA, DocMDP P=2) followed by an approval signature (adbe.pkcs7.detached, ECDSA P-256)
//   - test/fixtures/p1-sealed-plus-later-signature.pdf: this app's DocMDP P=1 seal, then an
//     approval signature appended by pyHanko with its DocMDP check disabled (must read "modified")
//   - `openssl cms -sign` signatures (DER and BER/indefinite-length), when openssl is on PATH
//   - .p12 files from `openssl pkcs12 -export` (AES/PBES2, -legacy RC2/3DES, EC, empty and
//     non-ASCII passwords), when openssl is on PATH
//
//   node test/seal.mjs
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { PDFDocument, StandardFonts, PDFName, PDFRawStream, decodePDFRawStream } = require("pdf-lib");
const sig = require(path.join(DESKTOP, "src", "pdfsig.js"));
const pki = require(path.join(DESKTOP, "src", "pki.js"));
const { createSeal } = require(path.join(DESKTOP, "src", "seal.js"));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  return !!ok;
};
const rejects = async (p) => { try { await p; return "resolved"; } catch (e) { return String(e.message); } };
const status = async (b, o) => (await sig.verifyPdf(b, o)).status;

let openssl = null;
try { execFileSync("openssl", ["version"], { stdio: "pipe" }); openssl = "openssl"; } catch {}

async function samplePdf(pages = 2) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) doc.addPage([400, 300]).drawText(`page ${i + 1}`, { x: 40, y: 150, size: 24, font });
  return Buffer.from(await doc.save());
}

// 1.3 seal: a PDF carrying the page's No AI notice (web/pdf-editor.html addAiNotice): an XMP /Metadata stream
// on the catalog with the TDMRep reservation, the PLUS data mining value and a rights sentence
const NO_AI_XMP = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:tdm="http://www.w3.org/ns/tdmrep/" xmlns:plus="http://ns.useplus.org/ldf/xmp/1.0/"><tdm:reservation>1</tdm:reservation><plus:DataMining>http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED-AIMLTRAINING</plus:DataMining><dc:rights><rdf:Alt><rdf:li xml:lang="x-default">권리자는 이 문서를 AI 학습과 분석을 포함한 텍스트와 데이터 마이닝에 쓰는 것을 허락하지 않습니다.</rdf:li></rdf:Alt></dc:rights></rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
async function noAiPdf() {
  const doc = await PDFDocument.load(await samplePdf());
  const xmp = doc.context.stream(new TextEncoder().encode(NO_AI_XMP), { Type: "Metadata", Subtype: "XML" });
  doc.catalog.set(PDFName.of("Metadata"), doc.context.register(xmp));
  return Buffer.from(await doc.save({ useObjectStreams: true })); // as the page saves it
}
async function metadataOf(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const s = doc.context.lookup(doc.catalog.get(PDFName.of("Metadata")));
  if (!s) return null;
  return Buffer.from(s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents()).toString("utf8");
}

/** a classic incremental update: a new /Info object, xref section and trailer with /Prev */
function appendUpdate(pdf) {
  const s = pdf.toString("latin1");
  const prev = +/startxref\s+(\d+)\s+%%EOF\s*$/.exec(s)[1];
  const root = /\/Root\s+(\d+\s+\d+\s+R)/.exec(s.slice(s.lastIndexOf("trailer")))[1];
  const size = +/\/Size\s+(\d+)/.exec(s.slice(s.lastIndexOf("trailer")))[1];
  const head = `\n${size} 0 obj\n<< /Producer (edited later) >>\nendobj\n`;
  const objAt = pdf.length + 1;
  const xrefAt = pdf.length + Buffer.byteLength(head);
  const tail = `xref\n${size} 1\n${String(objAt).padStart(10, "0")} 00000 n \ntrailer\n<< /Size ${size + 1} /Root ${root} /Info ${size} 0 R /Prev ${prev} >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.concat([pdf, Buffer.from(head + tail, "latin1")]);
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pdfe-seal-"));
  try {
    // ---- certificate ----
    const id = await pki.createSelfSigned({ name: "홍길동", org: "테스트 주식회사", email: "hong@example.com" });
    const x = new crypto.X509Certificate(id.certDer);
    const d = pki.describeCert(id.certDer);
    const years = (d.notAfter - d.notBefore) / (365.25 * 86400e3);
    check("certificate: subject, self-signed, 10 years", d.name === "홍길동" && d.org === "테스트 주식회사" && d.email === "hong@example.com" && d.selfSigned && d.ours && Math.abs(years - 10) < 0.01, x.subject.replace(/\n/g, ", "));
    check("certificate: RSA-2048, key usage, Adobe document signing EKU",
      x.publicKey.asymmetricKeyDetails.modulusLength === 2048 && x.keyUsage?.includes("1.3.6.1.5.5.7.3.4") && x.keyUsage?.includes("1.2.840.113583.1.1.5"),
      (x.keyUsage || []).join(" "));
    const key = crypto.createPrivateKey({ key: id.keyDer, format: "der", type: "pkcs8" });
    const fp = sig.fingerprintOf(id.certDer);
    check("fingerprint format", /^[0-9A-F]{4}( [0-9A-F]{4}){15}$/.test(fp), fp);

    // ---- sign + verify ----
    const plain = await samplePdf();
    const sealed = await sig.signPdf(plain, { certDer: id.certDer, key, name: "홍길동", reason: "계약서 (최종)", location: "Seoul" });
    const v = await sig.verifyPdf(sealed, { myFingerprint: fp });
    const s0 = v.signatures[0] || {};
    check("sealed: intact, mine, certify", v.status === "intact" && v.signatures.length === 1 && s0.mine && s0.certify && s0.digestOk && s0.signatureOk && s0.coversWholeFile && s0.selfSigned, JSON.stringify(s0));
    check("sealed: signer, reason, location, time", s0.name === "홍길동" && s0.org === "테스트 주식회사" && s0.reason === "계약서 (최종)" && s0.location === "Seoul" && Math.abs(s0.signedAt - Date.now()) < 120e3 && s0.fingerprint === fp);

    // ---- 1.3: the No AI notice (XMP /Metadata on the catalog) survives sealing, and the seal covers it ----
    {
      const noAi = await noAiPdf();
      const sealedNoAi = await sig.signPdf(noAi, { certDer: id.certDer, key, name: "홍길동", reason: "Sealed with Sealworks" });
      const vn = await sig.verifyPdf(sealedNoAi, { myFingerprint: fp });
      check("No AI notice: /Metadata survives sealing, byte for byte", (await metadataOf(sealedNoAi)) === NO_AI_XMP);
      check("No AI notice: the sealed file verifies intact over the whole file", vn.status === "intact" && vn.signatures[0]?.coversWholeFile);
      const stripped = await PDFDocument.load(sealedNoAi, { updateMetadata: false });
      stripped.catalog.delete(PDFName.of("Metadata"));
      check("No AI notice: removing it and re-saving breaks the seal", (await status(Buffer.from(await stripped.save()))) !== "intact");
    }
    const txt = sealed.toString("latin1");
    check("sealed: PAdES subfilter, DocMDP P=1, /Perms, ESIC", /\/SubFilter\s*\/ETSI\.CAdES\.detached/.test(txt) && /\/TransformMethod\s*\/DocMDP/.test(txt) && /\/P\s+1\b/.test(txt) && /\/Perms\s*<<\s*\/DocMDP\s+\d+ 0 R/.test(txt) && /\/ESIC/.test(txt));
    const reparsed = await PDFDocument.load(sealed);
    check("sealed: still a PDF with the same pages", reparsed.getPageCount() === 2);
    check("verify without an identity: not mine", (await sig.verifyPdf(sealed)).signatures[0].mine === false);

    const flipped = Buffer.from(sealed); flipped[30] ^= 0x01;
    check("one byte flipped inside the covered range -> invalid", (await status(flipped)) === "invalid");
    // change a byte of the RSA signature value (the last bytes of the DER before the zero padding)
    const br = /\/ByteRange\s*\[\s*0\s+(\d+)\s+(\d+)/.exec(txt);
    const cmsHex = txt.slice(+br[1] + 1, +br[2] - 1);
    const cmsLen = 4 + parseInt(cmsHex.slice(4, 8), 16); // 30 82 LL LL
    const at = +br[1] + 1 + (cmsLen - 10) * 2;
    const inGap = Buffer.from(sealed); inGap[at] = inGap[at] === 0x30 ? 0x31 : 0x30;
    check("signature value changed -> invalid", cmsHex.startsWith("3082") && (await status(inGap)) === "invalid");
    const updated = appendUpdate(sealed);
    check("incremental update appended -> modified", (await status(updated)) === "modified");
    check("appended update: pdf-lib still opens it", (await PDFDocument.load(updated)).getPageCount() === 2);
    check("trailing newline only -> still intact", (await status(Buffer.concat([sealed, Buffer.from("\r\n")]))) === "intact");
    check("unsigned PDF -> none", (await status(plain)) === "none");
    check("random bytes -> none", (await status(crypto.randomBytes(4096))) === "none");
    check("empty input -> none", (await status(new Uint8Array(0))) === "none");
    const junk = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Sig /ByteRange [0 10 20 30] /Contents <00ff> >>\nendobj\n%%EOF\n");
    check("bogus signature dictionary -> invalid (no throw)", (await status(junk)) === "invalid");
    check("truncated sealed file -> invalid", (await status(sealed.subarray(0, sealed.length - 200))) === "invalid");
    check("non-bytes -> EINVAL", /^EINVAL/.test(await rejects(sig.verifyPdf("nope"))));
    const resealed = await sig.signPdf(sealed, { certDer: id.certDer, key, name: "홍길동" });
    const rv = await sig.verifyPdf(resealed);
    check("re-sealing replaces the old seal", rv.status === "intact" && rv.signatures.length === 1, `${rv.status} ${rv.signatures.length}`);
    check("sealing garbage -> EINVAL", /^EINVAL/.test(await rejects(sig.signPdf(Buffer.from("not a pdf"), { certDer: id.certDer, key }))));

    // ---- other tools' signatures ----
    const fixture = fs.readFileSync(path.join(DESKTOP, "test", "fixtures", "pyhanko-certified-plus-approval.pdf"));
    const fv = await sig.verifyPdf(fixture);
    check("pyHanko: certification + approval -> intact",
      fv.status === "intact" && fv.signatures.length === 2 && fv.signatures[0].certify && !fv.signatures[0].coversWholeFile && !fv.signatures[1].certify && fv.signatures[1].coversWholeFile && fv.signatures.every((s) => s.digestOk && s.signatureOk),
      fv.signatures.map((s) => `${s.name}${s.certify ? " (certify)" : ""}`).join(", "));
    const ff = Buffer.from(fixture); ff[200] ^= 0x01;
    check("pyHanko: tampered -> invalid", (await status(ff)) === "invalid");
    // a "no changes" (P=1) seal from this app, then a second signature added by a tool that ignores
    // DocMDP (pyHanko with its check disabled): every signature verifies, but the seal is broken
    const later = await sig.verifyPdf(fs.readFileSync(path.join(DESKTOP, "test", "fixtures", "p1-sealed-plus-later-signature.pdf")));
    check("P=1 seal + a later signature -> modified",
      later.status === "modified" && later.signatures.length === 2 && later.signatures[0].certify && later.signatures[0].docMdp === 1 && later.signatures.every((s) => s.digestOk && s.signatureOk),
      later.status);

    const crt = path.join(tmp, "rsa.crt"), k = path.join(tmp, "rsa.key"), eck = path.join(tmp, "ec.key"), ecc = path.join(tmp, "ec.crt");
    const run = (args, input) => execFileSync(openssl, args, { input, stdio: ["pipe", "pipe", "pipe"] });
    if (openssl) {
      try {
        run(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", k, "-out", crt, "-days", "365", "-subj", "/O=OpenSSL Test/CN=OpenSSL Signer"]);
        run(["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-keyout", eck, "-out", ecc, "-days", "365", "-subj", "/CN=OpenSSL EC"]);
      } catch (e) {
        console.log(`note: this openssl can't make test keys (${String(e.stderr || e).split("\n")[0]}), openssl interop checks skipped`);
        openssl = null;
      }
    }
    if (openssl) {
      const ocert = new crypto.X509Certificate(fs.readFileSync(crt)).raw;
      const okey = crypto.createPrivateKey(fs.readFileSync(k));
      for (const stream of [false, true]) {
        const out = await sig.signPdf(plain, {
          certDer: ocert, key: okey, contentsBytes: 8192,
          signCovered: (covered) => run(["cms", "-sign", "-binary", ...(stream ? ["-stream"] : []), "-outform", "DER", "-md", "sha256", "-signer", crt, "-inkey", k], covered),
        });
        const ov = await sig.verifyPdf(out);
        check(`openssl cms ${stream ? "(BER, -stream, attached content)" : "(DER, detached)"} signature -> intact`, ov.status === "intact" && ov.signatures[0].name === "OpenSSL Signer" && ov.signatures[0].org === "OpenSSL Test" && ov.signatures[0].signedAt > 0, ov.signatures[0]?.error || "");
      }
      const ofp = sig.fingerprintOf(ocert);
      const p12 = (name, extra, pass) => { const f = path.join(tmp, name); run(["pkcs12", "-export", ...extra, "-out", f, "-passout", `pass:${pass}`]); return fs.readFileSync(f); };
      const cases = [
        ["modern (PBES2/AES-256, SHA-256 MAC)", p12("m.p12", ["-inkey", k, "-in", crt], "secret"), "secret", ofp],
        ["empty password", p12("e.p12", ["-inkey", k, "-in", crt], ""), "", ofp],
        // (command-line arguments aren't UTF-8 on Windows)
        ...(process.platform === "win32" ? [] : [["non-ASCII password", p12("k.p12", ["-inkey", k, "-in", crt], "비밀번호"), "비밀번호", ofp]]),
        ["EC P-256", p12("ec.p12", ["-inkey", eck, "-in", ecc], "secret"), "secret", sig.fingerprintOf(new crypto.X509Certificate(fs.readFileSync(ecc)).raw)],
      ];
      try { cases.push(["legacy (RC2-40/3DES, SHA-1 MAC)", p12("l.p12", ["-legacy", "-inkey", k, "-in", crt], "secret"), "secret", ofp]); }
      catch { console.log("note: openssl -legacy unavailable, legacy .p12 case skipped"); }
      for (const [label, file, pass, want] of cases) {
        let got;
        try { got = pki.importP12(file, pass); } catch (e) { got = e; }
        check(`import openssl .p12: ${label}`, got && !(got instanceof Error) && sig.fingerprintOf(got.certDer) === want, got instanceof Error ? got.message : "");
      }
      check("import openssl .p12: wrong password -> EPASSWORD", (() => { try { pki.importP12(cases[0][1], "nope"); return false; } catch (e) { return /^EPASSWORD/.test(e.message); } })());
      // EC key seals too
      const ec = pki.importP12(cases.find((c) => c[0] === "EC P-256")[1], "secret");
      const ecSealed = await sig.signPdf(plain, { certDer: ec.certDer, key: crypto.createPrivateKey({ key: ec.keyDer, format: "der", type: "pkcs8" }) });
      check("EC key from a .p12 seals -> intact", (await status(ecSealed)) === "intact");
      // our export reads back in openssl
      const ours = path.join(tmp, "ours.p12");
      fs.writeFileSync(ours, pki.exportP12({ keyDer: id.keyDer, certDer: id.certDer, password: "backup password" }));
      let info = "";
      try { info = run(["pkcs12", "-in", ours, "-info", "-nokeys", "-passin", "pass:backup password"]).toString(); }
      catch { try { info = run(["pkcs12", "-legacy", "-in", ours, "-info", "-nokeys", "-passin", "pass:backup password"]).toString(); } catch (e) { info = String(e.stderr || e); } }
      check("our .p12 opens in openssl (3DES key bag, SHA-1 MAC)", /BEGIN CERTIFICATE/.test(info) && /friendlyName: Sealworks seal/.test(info), info.split("\n")[0]);
    } else console.log("note: openssl not found, openssl interop checks skipped");

    // ---- p12 round trip ----
    const backup = pki.exportP12({ keyDer: id.keyDer, certDer: id.certDer, password: "pw-테스트" });
    const back = pki.importP12(backup, "pw-테스트");
    check("export -> import: same certificate and key", back.certDer.equals(id.certDer) && back.keyDer.equals(id.keyDer));
    check("export -> import: wrong password -> EPASSWORD", (() => { try { pki.importP12(backup, "x"); return false; } catch (e) { return /^EPASSWORD/.test(e.message); } })());
    check("import garbage -> EINVAL", (() => { try { pki.importP12(crypto.randomBytes(300), "x"); return false; } catch (e) { return /^EINVAL/.test(e.message); } })());

    // ---- identity store (file protection, as without a keyring) ----
    const store = createSeal({ dir: path.join(tmp, "store", "seal"), useOs: false, appVersion: "0.0.0" });
    check("store: no identity yet", (await store.identity()) === null);
    check("store: sign without identity -> ENOENT", (await rejects(store.sign(plain))) === "ENOENT: there is no sealer identity yet");
    check("store: export without identity -> ENOENT", /^ENOENT: /.test(await rejects(store.exportIdentity({ password: "x" }))));
    check("store: verify of non-bytes -> EINVAL", (await rejects(store.verify("x"))).startsWith("EINVAL: "));
    const sid = await store.createIdentity({ name: "  Kim  ", email: "kim@example.com" });
    check("store: createIdentity", sid.name === "Kim" && sid.email === "kim@example.com" && !sid.imported && sid.protected === "file" && sid.notAfter > Date.now() && /^[0-9A-F]{4} /.test(sid.fingerprint), JSON.stringify(sid));
    check("store: not a PDF -> EINVAL", (await rejects(store.sign(Buffer.from("not a pdf")))) === "EINVAL: not a readable PDF");
    check("store: second create -> EEXIST", /^EEXIST/.test(await rejects(store.createIdentity({ name: "x" }))));
    check("store: empty name -> EINVAL", /^EINVAL/.test(await rejects(store.createIdentity({ name: "  ", replace: true }))));
    const keyBin = fs.readFileSync(path.join(tmp, "store", "seal", "key.bin"));
    check("store: key is not stored in the clear", !keyBin.includes(Buffer.from("PRIVATE")) && keyBin.subarray(0, 7).toString() === "PDFEK1F");
    const ss = await store.sign(plain, { lang: "en" });
    const sv = await store.verify(ss);
    check("store: sign -> verify intact + mine", sv.status === "intact" && sv.signatures[0].mine && sv.signatures[0].reason === "Sealed with Sealworks");
    const bk = await store.exportIdentity({ password: "pw" });
    check("store: export without password -> EINVAL", /^EINVAL/.test(await rejects(store.exportIdentity({}))));
    await store.removeIdentity();
    check("store: removed", (await store.identity()) === null && (await store.verify(ss)).signatures[0].mine === false);
    check("store: import wrong password -> EPASSWORD", /^EPASSWORD/.test(await rejects(store.importIdentity(bk, { password: "nope" }))));
    const koStore = createSeal({ dir: path.join(tmp, "store", "seal"), useOs: false, lang: () => "ko" });
    check("store: messages follow the language", (await rejects(koStore.importIdentity(bk, { password: "nope" }))) === "EPASSWORD: 비밀번호가 맞지 않습니다"
      && (await rejects(koStore.importIdentity(crypto.randomBytes(64), { password: "x" }))).startsWith("EINVAL: ")
      && (await rejects(koStore.sign(Buffer.from("x")))) === "ENOENT: 봉인하는 사람 정보가 아직 없습니다");
    const rid = await store.importIdentity(bk, { password: "pw" });
    check("store: import own backup -> same fingerprint, not 'imported'", rid.fingerprint === sid.fingerprint && rid.imported === false && rid.name === "Kim");
    check("store: restored key seals", (await store.verify(await store.sign(plain))).signatures[0].mine);
    if (openssl) {
      const rsa = path.join(tmp, "m.p12");
      const imp = await store.importIdentity(fs.readFileSync(rsa), { password: "secret" });
      check("store: import another tool's .p12 -> imported", imp.imported === true && imp.name === "OpenSSL Signer" && imp.org === "OpenSSL Test");
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} seal checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
