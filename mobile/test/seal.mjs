// Seal test for the Android bundle (www/seal/seal-core.js), run in plain Node the way the WebView
// worker runs it: the bundle's own Buffer, node:crypto adapter, fs mounts and the native key store
// (simulated with SealKeys.kt's request format), no Node built-ins inside. Mirrors desktop/test/seal.mjs (same fixtures, same expected
// statuses) and adds cross-checks against desktop's Node implementation when desktop/node_modules
// is installed (seal with one, verify with the other; .p12 both ways; identical verify results).
//
//   node scripts/build-www.mjs --seal-only && node test/seal.mjs     (npm run test:seal)
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DESKTOP = path.resolve(MOBILE, "..", "desktop");
const { PDFDocument, StandardFonts } = require("pdf-lib");

// load the bundle like the worker does (a global scope with `self` and WebCrypto)
globalThis.self = globalThis;
const bundleFile = path.join(MOBILE, "www", "seal", "seal-core.js");
vm.runInThisContext(fs.readFileSync(bundleFile, "utf8"), { filename: bundleFile });
const SW = globalThis.SealworksSeal;
const { pdfsig: sig, pki, createAndroidSeal, memoryStorage, crypto: mc } = SW;

// desktop's Node implementation, for cross-checks (needs desktop/node_modules)
let desk = null;
try {
  desk = { sig: require(path.join(DESKTOP, "src", "pdfsig.js")), pki: require(path.join(DESKTOP, "src", "pki.js")) };
} catch (e) { console.log(`note: desktop/src can't be loaded (${String(e.message).split("\n")[0]}), cross-checks skipped`); }

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  return !!ok;
};
const rejects = async (p) => { try { await p; return "resolved"; } catch (e) { return String(e.message); } };
const status = async (b, o) => (await sig.verifyPdf(b, o)).status;
const nb = (b) => Buffer.from(b.buffer ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : b); // -> Node Buffer

let openssl = null;
try { execFileSync("openssl", ["version"], { stdio: "pipe" }); openssl = "openssl"; } catch {}

async function samplePdf(pages = 2) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) doc.addPage([400, 300]).drawText(`page ${i + 1}`, { x: 40, y: 150, size: 24, font });
  return Buffer.from(await doc.save());
}
function appendUpdate(pdf) {
  pdf = nb(pdf);
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
// SealKeys.kt in Node: the same request format, checks and file layout, with a random AES key as the Keystore key
function simulatedKeyStore(mem) {
  let kek = crypto.randomBytes(32);
  const ub = (x) => Buffer.from(x, "base64url");
  const sim = { stored: 0, signed: 0, ticket: false, lose() { kek = crypto.randomBytes(32); } };
  const load = (fp) => {
    const b = Buffer.from(mem.files.get("seal/key.bin") || []);
    if (!b.length) throw new Error("ENOENT: there is no sealer key");
    const n = b.readUInt16BE(14), spki = b.subarray(16, 16 + n), iv = b.subarray(16 + n, 28 + n), body = b.subarray(28 + n);
    if (crypto.createHash("sha256").update(spki).digest("hex") !== fp) throw new Error("EIO: the sealer key changed");
    const d = crypto.createDecipheriv("aes-256-gcm", kek, iv); d.setAuthTag(body.subarray(body.length - 16));
    try { return Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]); } catch { throw new Error("EIO: the Android Keystore did not unlock the sealer key"); }
  };
  sim.request = (op, p) => {
    try {
      if (op === "store") {
        if (!/^seal\/key\.bin(\.[A-Za-z0-9]{1,32}\.tmp)?$/.test(p.path)) throw new Error("EINVAL: bad key path");
        const key = crypto.createPrivateKey({ key: ub(p.k), format: "der", type: "pkcs8" });
        const pub = crypto.createPublicKey({ key: ub(p.p), format: "der", type: "spki" });
        const probe = Buffer.from("Sealworks key check");
        if (!crypto.verify("sha256", probe, pub, crypto.sign("sha256", probe, key))) throw new Error("EINVAL: mismatch");
        const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", kek, iv);
        const ct = Buffer.concat([c.update(ub(p.k)), c.final(), c.getAuthTag()]);
        const spki = ub(p.p), len = Buffer.alloc(2); len.writeUInt16BE(spki.length);
        mem.files.set(p.path, new Uint8Array(Buffer.concat([Buffer.from("PDFEK1O\nSWKS2\n"), len, spki, iv, ct])));
        sim.stored++;
        return { ok: true, text: "ok" };
      }
      if (op === "sign") {
        const d = ub(p.d);
        if (d.length < 16 || d[0] !== 0x31 || !d.includes(Buffer.from("06092a864886f70d010904", "hex"))) throw new Error("EINVAL: only CMS signed attributes are signed");
        const key = crypto.createPrivateKey({ key: load(p.fp), format: "der", type: "pkcs8" });
        sim.signed++;
        return { ok: true, text: crypto.sign(p.alg, d, key.asymmetricKeyType === "ec" ? { key, dsaEncoding: "der" } : key).toString("base64") };
      }
      if (op === "export") {
        if (!sim.ticket) throw new Error("EPERM: a backup needs the user's save panel first");
        sim.ticket = false;
        return { ok: true, text: load(p.fp).toString("base64") };
      }
      throw new Error("EINVAL: unknown operation");
    } catch (e) { return { ok: false, text: e.message }; }
  };
  return sim;
}
const strip = (v) => ({ status: v.status, signatures: v.signatures.map(({ mine, error, ...s }) => s) });

async function cryptoAdapter() {
  // hashes
  const data = crypto.randomBytes(100000);
  const algs = ["md5", "sha1", "sha224", "sha256", "sha384", "sha512", "sha3-256", "sha3-384", "sha3-512"];
  check("adapter: createHash matches Node for " + algs.join(", "), algs.every((a) => mc.createHash(a).update(data.subarray(0, 7)).update(data.subarray(7)).digest("hex") === crypto.createHash(a).update(data).digest("hex")));
  // RSA PKCS#1 v1.5 + PSS, verified by the adapter
  const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const spki = rsa.publicKey.export({ type: "spki", format: "der" });
  const pub = mc.createPublicKey({ key: spki, format: "der", type: "spki" });
  check("adapter: SPKI round trip (RSA)", nb(pub.export({ type: "spki", format: "der" })).equals(spki));
  for (const h of ["sha1", "sha256", "sha512"]) {
    const s = crypto.sign(h, data, { key: rsa.privateKey, padding: crypto.constants.RSA_PKCS1_PADDING });
    const ok = mc.createVerify(h).update(data).verify({ key: pub, padding: mc.constants.RSA_PKCS1_PADDING }, s);
    const bad = Buffer.from(s); bad[10] ^= 1;
    check(`adapter: RSA PKCS#1 ${h} verify (good / bad)`, ok && !mc.createVerify(h).update(data).verify({ key: pub, padding: 1 }, bad));
  }
  for (const salt of [20, 32]) {
    const s = crypto.sign("sha256", data, { key: rsa.privateKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: salt });
    check(`adapter: RSA-PSS sha256 salt ${salt} verify`, mc.createVerify("sha256").update(data).verify({ key: pub, padding: 6, saltLength: salt }, s)
      && !mc.createVerify("sha256").update(data).verify({ key: pub, padding: 6, saltLength: salt === 20 ? 32 : 20 }, s));
  }
  // RSA signing by the adapter, verified by Node
  const priv = mc.createPrivateKey({ key: rsa.privateKey.export({ type: "pkcs8", format: "der" }), format: "der", type: "pkcs8" });
  const ms = mc.sign("sha256", data, { key: priv, padding: 1 });
  check("adapter: RSA sign verified by Node", crypto.verify("sha256", data, rsa.publicKey, nb(ms)));
  check("adapter: private key details", priv.asymmetricKeyType === "rsa" && priv.asymmetricKeyDetails.modulusLength === 2048
    && nb(mc.createPublicKey(priv).export({ type: "spki", format: "der" })).equals(spki));
  // ECDSA
  for (const [curve, h] of [["prime256v1", "sha256"], ["secp384r1", "sha384"], ["secp521r1", "sha512"], ["prime256v1", "sha512"], ["secp256k1", "sha256"]]) {
    const ec = crypto.generateKeyPairSync("ec", { namedCurve: curve });
    const epub = mc.createPublicKey({ key: ec.publicKey.export({ type: "spki", format: "der" }), format: "der", type: "spki" });
    const s = crypto.sign(h, data, { key: ec.privateKey, dsaEncoding: "der" });
    const epriv = mc.createPrivateKey({ key: ec.privateKey.export({ type: "pkcs8", format: "der" }), format: "der", type: "pkcs8" });
    const ms2 = mc.sign(h, data, { key: epriv, dsaEncoding: "der" });
    check(`adapter: ECDSA ${curve}/${h} both ways`, mc.createVerify(h).update(data).verify({ key: epub, dsaEncoding: "der" }, s)
      && !mc.createVerify(h).update(data.subarray(1)).verify({ key: epub, dsaEncoding: "der" }, s)
      && crypto.verify(h, data, { key: ec.publicKey, dsaEncoding: "der" }, nb(ms2))
      && epriv.asymmetricKeyDetails.namedCurve === curve);
  }
  // Ed25519, DSA (verification only, as in pdfsig)
  const ed = crypto.generateKeyPairSync("ed25519");
  const edPub = mc.createPublicKey({ key: ed.publicKey.export({ type: "spki", format: "der" }), format: "der", type: "spki" });
  const es = crypto.sign(null, data, ed.privateKey);
  check("adapter: Ed25519 verify (good / bad)", mc.verify(null, data, edPub, es) && !mc.verify(null, data.subarray(1), edPub, es));
  const dsa = crypto.generateKeyPairSync("dsa", { modulusLength: 2048, divisorLength: 256 });
  const dPub = mc.createPublicKey({ key: dsa.publicKey.export({ type: "spki", format: "der" }), format: "der", type: "spki" });
  const ds = crypto.sign("sha256", data, { key: dsa.privateKey, dsaEncoding: "der" });
  check("adapter: DSA sha256 verify (good / bad)", mc.createVerify("sha256").update(data).verify({ key: dPub, dsaEncoding: "der" }, ds)
    && !mc.createVerify("sha256").update(data.subarray(2)).verify({ key: dPub, dsaEncoding: "der" }, ds));
  // AES-256-GCM interop with Node (seal.js's file protection)
  const k = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const c = mc.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([nb(c.update(data)), nb(c.final())]);
  const d = crypto.createDecipheriv("aes-256-gcm", k, iv); d.setAuthTag(nb(c.getAuthTag()));
  const nc = crypto.createCipheriv("aes-256-gcm", k, iv); const nct = Buffer.concat([nc.update(data), nc.final()]);
  const md = mc.createDecipheriv("aes-256-gcm", k, iv); md.setAuthTag(nc.getAuthTag());
  const tampered = mc.createDecipheriv("aes-256-gcm", k, iv); tampered.setAuthTag(Buffer.alloc(16));
  check("adapter: AES-256-GCM both ways, bad tag rejected", Buffer.concat([d.update(ct), d.final()]).equals(data)
    && Buffer.concat([nb(md.update(nct)), nb(md.final())]).equals(data)
    && (() => { try { tampered.update(nct); tampered.final(); return false; } catch { return true; } })());
  // WebCrypto key generation
  const t0 = Date.now();
  const { privateKey } = await new Promise((res, rej) => mc.generateKeyPair("rsa", { modulusLength: 2048, publicExponent: 0x10001 }, (e, publicKey, privateKey) => (e ? rej(e) : res({ publicKey, privateKey }))));
  const nodeKey = crypto.createPrivateKey({ key: nb(privateKey.export({ type: "pkcs8", format: "der" })), format: "der", type: "pkcs8" });
  check("adapter: generateKeyPair (WebCrypto) gives a key Node accepts", nodeKey.asymmetricKeyDetails.modulusLength === 2048, `${Date.now() - t0} ms`);
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sealworks-mobile-seal-"));
  try {
    await cryptoAdapter();

    // ---- certificate ----
    const id = await pki.createSelfSigned({ name: "홍길동", org: "테스트 주식회사", email: "hong@example.com" });
    const x = new crypto.X509Certificate(nb(id.certDer));
    const d = pki.describeCert(id.certDer);
    const years = (d.notAfter - d.notBefore) / (365.25 * 86400e3);
    check("certificate: subject, self-signed, 10 years", d.name === "홍길동" && d.org === "테스트 주식회사" && d.email === "hong@example.com" && d.selfSigned && d.ours && Math.abs(years - 10) < 0.01, x.subject.replace(/\n/g, ", "));
    check("certificate: Node accepts it (RSA-2048, key usage, Adobe EKU, self-verifies)",
      x.publicKey.asymmetricKeyDetails.modulusLength === 2048 && x.keyUsage?.includes("1.2.840.113583.1.1.5") && x.verify(x.publicKey));
    const key = mc.createPrivateKey({ key: id.keyDer, format: "der", type: "pkcs8" });
    const fp = sig.fingerprintOf(id.certDer);
    check("fingerprint format and value", /^[0-9A-F]{4}( [0-9A-F]{4}){15}$/.test(fp) && fp.replace(/ /g, "") === crypto.createHash("sha256").update(nb(id.certDer)).digest("hex").toUpperCase(), fp);

    // ---- sign + verify ----
    const plain = await samplePdf();
    const t0 = Date.now();
    const sealed = await sig.signPdf(plain, { certDer: id.certDer, key, name: "홍길동", reason: "계약서 (최종)", location: "Seoul" });
    const signMs = Date.now() - t0;
    const v = await sig.verifyPdf(sealed, { myFingerprint: fp });
    const s0 = v.signatures[0] || {};
    check("sealed: intact, mine, certify", v.status === "intact" && v.signatures.length === 1 && s0.mine && s0.certify && s0.docMdp === 1 && s0.digestOk && s0.signatureOk && s0.coversWholeFile && s0.selfSigned, `sign ${signMs} ms`);
    check("sealed: signer, reason, location, time", s0.name === "홍길동" && s0.org === "테스트 주식회사" && s0.reason === "계약서 (최종)" && s0.location === "Seoul" && Math.abs(s0.signedAt - Date.now()) < 120e3 && s0.fingerprint === fp);
    const txt = nb(sealed).toString("latin1");
    check("sealed: PAdES subfilter, DocMDP P=1, /Perms, ESIC", /\/SubFilter\s*\/ETSI\.CAdES\.detached/.test(txt) && /\/TransformMethod\s*\/DocMDP/.test(txt) && /\/P\s+1\b/.test(txt) && /\/Perms\s*<<\s*\/DocMDP\s+\d+ 0 R/.test(txt) && /\/ESIC/.test(txt));
    check("sealed: still a PDF with the same pages", (await PDFDocument.load(nb(sealed))).getPageCount() === 2);
    check("verify without an identity: not mine", (await sig.verifyPdf(sealed)).signatures[0].mine === false);
    const flipped = Buffer.from(nb(sealed)); flipped[30] ^= 0x01;
    check("tamper: one byte flipped inside the covered range -> invalid", (await status(flipped)) === "invalid");
    const br = /\/ByteRange\s*\[\s*0\s+(\d+)\s+(\d+)/.exec(txt);
    const cmsHex = txt.slice(+br[1] + 1, +br[2] - 1);
    const cmsLen = 4 + parseInt(cmsHex.slice(4, 8), 16);
    const at = +br[1] + 1 + (cmsLen - 10) * 2;
    const inGap = Buffer.from(nb(sealed)); inGap[at] = inGap[at] === 0x30 ? 0x31 : 0x30;
    check("tamper: signature value changed -> invalid", cmsHex.startsWith("3082") && (await status(inGap)) === "invalid");
    const updated = appendUpdate(sealed);
    check("tamper: incremental update appended -> modified", (await status(updated)) === "modified");
    check("trailing newline only -> still intact", (await status(Buffer.concat([nb(sealed), Buffer.from("\r\n")]))) === "intact");
    check("unsigned PDF -> none", (await status(plain)) === "none");
    check("random bytes -> none", (await status(crypto.randomBytes(4096))) === "none");
    check("empty input -> none", (await status(new Uint8Array(0))) === "none");
    const junk = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Sig /ByteRange [0 10 20 30] /Contents <00ff> >>\nendobj\n%%EOF\n");
    check("bogus signature dictionary -> invalid (no throw)", (await status(junk)) === "invalid");
    check("truncated sealed file -> invalid", (await status(nb(sealed).subarray(0, sealed.length - 200))) === "invalid");
    check("non-bytes -> EINVAL", /^EINVAL/.test(await rejects(sig.verifyPdf("nope"))));
    const rv = await sig.verifyPdf(await sig.signPdf(sealed, { certDer: id.certDer, key, name: "홍길동" }));
    check("re-sealing replaces the old seal", rv.status === "intact" && rv.signatures.length === 1);
    check("sealing garbage -> EINVAL", /^EINVAL/.test(await rejects(sig.signPdf(Buffer.from("not a pdf"), { certDer: id.certDer, key }))));

    // ---- fixtures (desktop/test/fixtures) ----
    const fixture = fs.readFileSync(path.join(DESKTOP, "test", "fixtures", "pyhanko-certified-plus-approval.pdf"));
    const fv = await sig.verifyPdf(fixture);
    check("fixture pyHanko (RSA certification P=2 + ECDSA P-256 approval) -> intact",
      fv.status === "intact" && fv.signatures.length === 2 && fv.signatures[0].certify && !fv.signatures[0].coversWholeFile && !fv.signatures[1].certify && fv.signatures[1].coversWholeFile && fv.signatures.every((s) => s.digestOk && s.signatureOk),
      fv.signatures.map((s) => `${s.name}${s.certify ? " (certify)" : ""}`).join(", "));
    const ff = Buffer.from(fixture); ff[200] ^= 0x01;
    check("fixture pyHanko: tampered -> invalid", (await status(ff)) === "invalid");
    const laterBytes = fs.readFileSync(path.join(DESKTOP, "test", "fixtures", "p1-sealed-plus-later-signature.pdf"));
    const later = await sig.verifyPdf(laterBytes);
    check("fixture P=1 seal + a later signature -> modified",
      later.status === "modified" && later.signatures.length === 2 && later.signatures[0].certify && later.signatures[0].docMdp === 1 && later.signatures.every((s) => s.digestOk && s.signatureOk), later.status);

    // ---- cross-checks with desktop's Node implementation ----
    if (desk) {
      const same = async (bytes) => JSON.stringify(strip(await sig.verifyPdf(bytes))) === JSON.stringify(strip(await desk.sig.verifyPdf(nb(bytes))));
      check("same verify result as desktop: both fixtures, sealed, tampered, appended",
        (await same(fixture)) && (await same(laterBytes)) && (await same(ff)) && (await same(sealed)) && (await same(flipped)) && (await same(updated)));
      const dv = await desk.sig.verifyPdf(nb(sealed), { myFingerprint: fp });
      check("sealed on Android -> desktop verifies intact + mine", dv.status === "intact" && dv.signatures[0].mine);
      const nodeKey = crypto.createPrivateKey({ key: nb(id.keyDer), format: "der", type: "pkcs8" });
      const dsealed = await desk.sig.signPdf(plain, { certDer: nb(id.certDer), key: nodeKey, name: "홍길동" });
      check("sealed on desktop -> Android verifies intact + mine", (await sig.verifyPdf(dsealed, { myFingerprint: fp })).signatures[0].mine && (await status(dsealed)) === "intact");
      const p12 = pki.exportP12({ keyDer: id.keyDer, certDer: id.certDer, password: "백업 pw" });
      const back = desk.pki.importP12(nb(p12), "백업 pw");
      check(".p12 from Android imports on desktop (same cert and key)", back.certDer.equals(nb(id.certDer)) && back.keyDer.equals(nb(id.keyDer)));
      const dp12 = desk.pki.exportP12({ keyDer: nb(id.keyDer), certDer: nb(id.certDer), password: "pw" });
      const mback = pki.importP12(dp12, "pw");
      check(".p12 from desktop imports on Android (same fingerprint)", sig.fingerprintOf(mback.certDer) === fp);
    }

    // ---- other tools (openssl) ----
    if (openssl) {
      const crt = path.join(tmp, "rsa.crt"), k = path.join(tmp, "rsa.key"), eck = path.join(tmp, "ec.key"), ecc = path.join(tmp, "ec.crt");
      const run = (args, input) => execFileSync(openssl, args, { input, stdio: ["pipe", "pipe", "pipe"] });
      try {
        run(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", k, "-out", crt, "-days", "365", "-subj", "/O=OpenSSL Test/CN=OpenSSL Signer"]);
        run(["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-keyout", eck, "-out", ecc, "-days", "365", "-subj", "/CN=OpenSSL EC"]);
        const ocert = new crypto.X509Certificate(fs.readFileSync(crt)).raw;
        for (const stream of [false, true]) {
          const out = await sig.signPdf(plain, {
            certDer: ocert, key: mc.createPrivateKey(fs.readFileSync(k)), contentsBytes: 8192,
            signCovered: (covered) => run(["cms", "-sign", "-binary", ...(stream ? ["-stream"] : []), "-outform", "DER", "-md", "sha256", "-signer", crt, "-inkey", k], nb(covered)),
          });
          const ov = await sig.verifyPdf(out);
          check(`openssl cms ${stream ? "(BER, attached)" : "(DER, detached)"} -> intact`, ov.status === "intact" && ov.signatures[0].name === "OpenSSL Signer", ov.signatures[0]?.error || "");
        }
        const p12 = (name, extra, pass) => { const f = path.join(tmp, name); run(["pkcs12", "-export", ...extra, "-out", f, "-passout", `pass:${pass}`]); return fs.readFileSync(f); };
        const ofp = sig.fingerprintOf(ocert);
        const cases = [["modern (PBES2/AES-256)", p12("m.p12", ["-inkey", k, "-in", crt], "secret"), "secret", ofp], ["non-ASCII password", p12("k.p12", ["-inkey", k, "-in", crt], "비밀번호"), "비밀번호", ofp],
          ["EC P-256", p12("ec.p12", ["-inkey", eck, "-in", ecc], "secret"), "secret", sig.fingerprintOf(new crypto.X509Certificate(fs.readFileSync(ecc)).raw)]];
        try { cases.push(["legacy (RC2-40/3DES)", p12("l.p12", ["-legacy", "-inkey", k, "-in", crt], "secret"), "secret", ofp]); } catch {}
        for (const [label, file, pass, want] of cases) {
          let got; try { got = pki.importP12(file, pass); } catch (e) { got = e; }
          check(`import openssl .p12: ${label}`, got && !(got instanceof Error) && sig.fingerprintOf(got.certDer) === want, got instanceof Error ? got.message : "");
        }
        const ec = pki.importP12(cases[2][1], "secret");
        const ecSealed = await sig.signPdf(plain, { certDer: ec.certDer, key: mc.createPrivateKey({ key: ec.keyDer, format: "der", type: "pkcs8" }) });
        check("EC key from a .p12 seals -> intact (and desktop agrees)", (await status(ecSealed)) === "intact" && (!desk || (await desk.sig.verifyPdf(nb(ecSealed))).status === "intact"));
      } catch (e) { console.log(`note: openssl interop skipped (${String(e.stderr || e).split("\n")[0]})`); }
    } else console.log("note: openssl not found, interop checks skipped");

    // ---- p12 round trip ----
    const backup = pki.exportP12({ keyDer: id.keyDer, certDer: id.certDer, password: "pw-테스트" });
    const back = pki.importP12(backup, "pw-테스트");
    check("export -> import: same certificate and key", nb(back.certDer).equals(nb(id.certDer)) && nb(back.keyDer).equals(nb(id.keyDer)));
    check("export -> import: wrong password -> EPASSWORD", (() => { try { pki.importP12(backup, "x"); return false; } catch (e) { return /^EPASSWORD/.test(e.message); } })());

    // ---- identity store with the native key store (simulated here exactly like SealKeys.kt) ----
    const mem = memoryStorage();
    const sim = simulatedKeyStore(mem);
    const native = SW.httpNative(sim.request);
    const store = createAndroidSeal({ storage: mem, native, appVersion: "1.2.0" });
    check("store: no identity yet", (await store.identity()) === null);
    check("store: sign without identity -> ENOENT", (await rejects(store.sign(plain))) === "ENOENT: there is no sealer identity yet");
    const sid = await store.createIdentity({ name: "  Kim  ", email: "kim@example.com" });
    check("store: createIdentity, protected os", sid.name === "Kim" && sid.email === "kim@example.com" && !sid.imported && sid.protected === "os" && /^[0-9A-F]{4} /.test(sid.fingerprint), JSON.stringify(sid));
    const keyBin = nb(mem.files.get("seal/key.bin"));
    check("store: key.bin written by the key store (PDFEK1O + SWKS2 frame), no key.secret, nothing parked",
      keyBin.subarray(0, 14).toString() === "PDFEK1O\nSWKS2\n" && !mem.files.has("seal/key.secret") && sim.stored === 1, [...mem.files.keys()].join(" "));
    check("store: second create -> EEXIST", /^EEXIST/.test(await rejects(store.createIdentity({ name: "x" }))));
    check("store: not a PDF -> EINVAL", (await rejects(store.sign(Buffer.from("not a pdf")))) === "EINVAL: not a readable PDF");
    const ss = await store.sign(plain, { lang: "en" });
    const sv = await store.verify(ss);
    check("store: sign (by the key store) -> verify intact + mine", sv.status === "intact" && sv.signatures[0].mine && sv.signatures[0].reason === "Sealed with Sealworks" && sim.signed >= 1, `${sim.signed} native signatures`);
    const tam = Buffer.from(nb(ss)); tam[40] ^= 0x01;
    check("store: tampered -> invalid", (await store.verify(tam)).status === "invalid");
    check("store: the key store signs CMS signed attributes only", sim.request("sign", { alg: "sha256", d: "AAAA", fp: "00" }).ok === false);
    check("store: export without the save panel's ticket -> refused", /^EIO: /.test(await rejects(store.exportIdentity({ password: "pw" }))));
    sim.ticket = true;
    const bk = await store.exportIdentity({ password: "pw" });
    check("store: export with a ticket (once)", bk.length > 1000 && sim.ticket === false);
    check("store: export without password -> EINVAL", /^EINVAL/.test(await rejects(store.exportIdentity({}))));
    if (desk) check("store: exported .p12 opens on desktop", desk.sig.fingerprintOf(desk.pki.importP12(nb(bk), "pw").certDer) === sid.fingerprint);
    sim.lose();
    const lost = createAndroidSeal({ storage: mem, native });
    check("store: Keystore key lost -> EIO (localized), identity still listed", /^EIO: the sealer key can't be unlocked$/.test(await rejects(lost.sign(plain))) && (await lost.identity())?.fingerprint === sid.fingerprint);
    await store.removeIdentity();
    check("store: removed", (await store.identity()) === null && mem.files.size === 0);
    const koStore = createAndroidSeal({ storage: mem, native, lang: () => "ko" });
    check("store: messages follow the language", (await rejects(koStore.importIdentity(bk, { password: "nope" }))) === "EPASSWORD: 비밀번호가 맞지 않습니다"
      && (await rejects(koStore.sign(Buffer.from("x")))) === "ENOENT: 봉인하는 사람 정보가 아직 없습니다");
    const rid = await store.importIdentity(bk, { password: "pw" });
    check("store: import own backup -> same fingerprint, not 'imported'", rid.fingerprint === sid.fingerprint && rid.imported === false && rid.name === "Kim");
    check("store: restored key seals", (await store.verify(await store.sign(plain))).signatures[0].mine);
    if (openssl && fs.existsSync(path.join(tmp, "ec.p12"))) {
      const ecId = await store.importIdentity(fs.readFileSync(path.join(tmp, "ec.p12")), { password: "secret" });
      const ecSealed = await store.sign(plain);
      check("store: imported EC key seals through the key store", ecId.imported && (await store.verify(ecSealed)).signatures[0].mine && (!desk || (await desk.sig.verifyPdf(nb(ecSealed))).status === "intact"));
    }
    const fileStore = createAndroidSeal({ storage: memoryStorage(), native: null });
    const fid = await fileStore.createIdentity({ name: "No Keystore" });
    check("store: without a key store (tests only) -> protected file, still seals", fid.protected === "file" && (await fileStore.verify(await fileStore.sign(plain))).status === "intact");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} seal checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
