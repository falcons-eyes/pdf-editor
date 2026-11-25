"use strict";
// PDF seal core (no Electron): PAdES B-B certification signatures and signature verification.
//
// Signing: pdf-lib adds the signature dictionary (SubFilter ETSI.CAdES.detached, DocMDP P=1 via
// /Reference + catalog /Perms, ESIC extension), @signpdf/signpdf fills /ByteRange and /Contents,
// and the CMS SignedData (CAdES: contentType, messageDigest, signing-certificate-v2; no
// signing-time, per PAdES) is built here with Node's crypto.
//
// Verification works on the raw bytes: every dictionary holding a /ByteRange is parsed where it
// sits, the /Contents must fill the ByteRange gap exactly, the covered bytes are hashed and the CMS
// signature is checked with the embedded certificate. pdf-lib adds the AcroForm and /Perms view.
const crypto = require("node:crypto");
const { PDFDocument, PDFName, PDFNumber, PDFArray, PDFDict, PDFHexString, PDFString, PDFRef, PDFInvalidObject, PDFHeader } = require("pdf-lib");
const { SignPdf } = require("@signpdf/signpdf");
const { Signer, DEFAULT_BYTE_RANGE_PLACEHOLDER } = require("@signpdf/utils");
const der = require("./der");
const { parseIndirectAt, objectStartsBefore, makeResolver, textOf, pdfDate, isWs, isDelim } = require("./pdfobj");

const MAX_PDF_BYTES = 300 * 1024 * 1024;

const OID = {
  data: "1.2.840.113549.1.7.1",
  signedData: "1.2.840.113549.1.7.2",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  signingTime: "1.2.840.113549.1.9.5",
  signingCertificate: "1.2.840.113549.1.9.16.2.12",
  signingCertificateV2: "1.2.840.113549.1.9.16.2.47",
  tstInfo: "1.2.840.113549.1.9.16.1.4",
  sha256: "2.16.840.1.101.3.4.2.1",
  sha256WithRSA: "1.2.840.113549.1.1.11",
  ecdsaWithSHA256: "1.2.840.10045.4.3.2",
  commonName: "2.5.4.3",
  organization: "2.5.4.10",
  emailAddress: "1.2.840.113549.1.9.1",
  subjectAltName: "2.5.29.17",
  subjectKeyId: "2.5.29.14",
};
const HASHES = {
  "1.3.14.3.2.26": "sha1", "2.16.840.1.101.3.4.2.4": "sha224", "2.16.840.1.101.3.4.2.1": "sha256",
  "2.16.840.1.101.3.4.2.2": "sha384", "2.16.840.1.101.3.4.2.3": "sha512", "1.2.840.113549.2.5": "md5",
  "2.16.840.1.101.3.4.2.8": "sha3-256", "2.16.840.1.101.3.4.2.9": "sha3-384", "2.16.840.1.101.3.4.2.10": "sha3-512",
};
const SIG_ALGS = {
  "1.2.840.113549.1.1.1": { kind: "rsa" },
  "1.2.840.113549.1.1.4": { kind: "rsa", hash: "md5" },
  "1.2.840.113549.1.1.5": { kind: "rsa", hash: "sha1" },
  "1.2.840.113549.1.1.14": { kind: "rsa", hash: "sha224" },
  "1.2.840.113549.1.1.11": { kind: "rsa", hash: "sha256" },
  "1.2.840.113549.1.1.12": { kind: "rsa", hash: "sha384" },
  "1.2.840.113549.1.1.13": { kind: "rsa", hash: "sha512" },
  "1.2.840.113549.1.1.10": { kind: "pss" },
  "1.2.840.10045.2.1": { kind: "ec" },
  "1.2.840.10045.4.1": { kind: "ec", hash: "sha1" },
  "1.2.840.10045.4.3.1": { kind: "ec", hash: "sha224" },
  "1.2.840.10045.4.3.2": { kind: "ec", hash: "sha256" },
  "1.2.840.10045.4.3.3": { kind: "ec", hash: "sha384" },
  "1.2.840.10045.4.3.4": { kind: "ec", hash: "sha512" },
  "1.2.840.10040.4.3": { kind: "dsa", hash: "sha1" },
  "2.16.840.1.101.3.4.3.2": { kind: "dsa", hash: "sha256" },
  "1.3.101.112": { kind: "ed25519" },
};

// `key` names the reason; seal.js turns it into a short localized message
const err = (code, message, key) => Object.assign(new Error(`${code}: ${message}`), { code, key });
const toBuffer = (b) => {
  if (Buffer.isBuffer(b)) return b;
  if (b instanceof Uint8Array) return Buffer.from(b.buffer, b.byteOffset, b.byteLength);
  if (b instanceof ArrayBuffer) return Buffer.from(b);
  throw err("EINVAL", "PDF bytes expected", "notBytes");
};

/* ---------------- certificates ---------------- */
function fingerprintOf(certDer) {
  return crypto.createHash("sha256").update(certDer).digest("hex").toUpperCase().match(/.{4}/g).join(" ");
}

function nameAttrs(nameNode) {
  const out = {};
  for (const rdn of der.children(nameNode)) {
    for (const atv of der.children(rdn)) {
      const [t, v] = der.children(atv);
      const k = der.oidString(t);
      if (!(k in out)) out[k] = der.text(v);
    }
  }
  return out;
}

/** Parses the parts of an X.509 certificate the seal needs, keeping raw DER where it matters. */
function certInfo(certDer) {
  certDer = toBuffer(certDer);
  const top = der.read(certDer);
  if (top.end !== certDer.length) throw err("EINVAL", "trailing bytes after the certificate", "badCert");
  const [tbs] = der.children(top);
  const f = der.children(tbs);
  let i = f[0].cls === 2 && f[0].tag === 0 ? 1 : 0;
  const serial = f[i], issuer = f[i + 2], validity = f[i + 3], subject = f[i + 4];
  const [nb, na] = der.children(validity);
  const exts = new Map();
  for (const x of f.slice(i + 6)) {
    if (x.cls !== 2 || x.tag !== 3) continue;
    for (const e of der.children(der.children(x)[0])) {
      const parts = der.children(e);
      exts.set(der.oidString(parts[0]), der.octets(parts[parts.length - 1]));
    }
  }
  const subj = nameAttrs(subject);
  let email = subj[OID.emailAddress];
  if (!email && exts.has(OID.subjectAltName)) {
    try {
      const gn = der.children(der.read(exts.get(OID.subjectAltName))).find((g) => g.cls === 2 && g.tag === 1);
      if (gn) email = der.value(gn).toString("latin1");
    } catch {}
  }
  return {
    der: certDer,
    serialRaw: Buffer.from(der.raw(serial)),
    issuerRaw: Buffer.from(der.raw(issuer)),
    subjectRaw: Buffer.from(der.raw(subject)),
    name: subj[OID.commonName] || subj[OID.organization] || "",
    org: subj[OID.organization],
    email,
    notBefore: der.time(nb),
    notAfter: der.time(na),
    extensions: exts,
    fingerprint: fingerprintOf(certDer),
  };
}

function isSelfSigned(ci) {
  if (!ci.subjectRaw.equals(ci.issuerRaw)) return false;
  try { const x = new crypto.X509Certificate(ci.der); return x.verify(x.publicKey); } catch { return false; }
}

/* ---------------- CMS (CAdES-BES / PAdES B-B) ---------------- */
function signAlgorithm(key) {
  if (key.asymmetricKeyType === "rsa") return { alg: der.seq(der.oid(OID.sha256WithRSA), der.nul()), opts: { key, padding: crypto.constants.RSA_PKCS1_PADDING } };
  if (key.asymmetricKeyType === "ec") return { alg: der.seq(der.oid(OID.ecdsaWithSHA256)), opts: { key, dsaEncoding: "der" } };
  throw err("EINVAL", `keys of type ${key.asymmetricKeyType} can't seal (RSA or EC needed)`, "keyType");
}

/** CMS SignedData (detached) over `digest` = SHA-256 of the covered PDF bytes. */
function buildCms({ certDer, chainDers = [], key, digest }) {
  const ci = certInfo(certDer);
  const essCertIdV2 = der.seq(
    der.octet(crypto.createHash("sha256").update(ci.der).digest()), // hashAlgorithm omitted: DEFAULT sha256
    der.seq(der.seq(der.tlv(0xa4, ci.issuerRaw)), ci.serialRaw),
  );
  const attrs = [
    der.seq(der.oid(OID.contentType), der.set(der.oid(OID.data))),
    der.seq(der.oid(OID.messageDigest), der.set(der.octet(digest))),
    der.seq(der.oid(OID.signingCertificateV2), der.set(der.seq(der.seq(essCertIdV2)))),
  ].sort(Buffer.compare);
  const { alg, opts } = signAlgorithm(key);
  const signature = crypto.sign("sha256", der.tlv(0x31, attrs), opts);
  const sha256Alg = der.seq(der.oid(OID.sha256));
  const signerInfo = der.seq(
    der.int(1),
    der.seq(ci.issuerRaw, ci.serialRaw),
    sha256Alg,
    der.tlv(0xa0, attrs),
    alg,
    der.octet(signature),
  );
  const signedData = der.seq(
    der.int(1),
    der.set(sha256Alg),
    der.seq(der.oid(OID.data)),
    der.ctx(0, ci.der, ...chainDers.map(toBuffer)),
    der.set(signerInfo),
  );
  return der.seq(der.oid(OID.signedData), der.ctx(0, signedData));
}

class CadesSigner extends Signer {
  constructor(o) { super(); this.o = o; }
  async sign(covered) {
    const digest = crypto.createHash("sha256").update(covered).digest();
    return buildCms({ ...this.o, digest });
  }
}

/* ---------------- placing the signature ---------------- */
const N = (s) => PDFName.of(s);
const pdfText = (s) => (/^[A-Za-z0-9 .,:;_@+\-]*$/.test(s) ? PDFString.of(s) : PDFHexString.fromText(s));

/** Earlier signatures can't survive a rewrite (and a certification must come first): drop them. */
function stripSignatures(doc) {
  const ctx = doc.context, cat = doc.catalog;
  cat.delete(N("Perms"));
  const drop = new Set();
  const tag = (r) => (r instanceof PDFRef ? r.tag : null);
  const form = cat.lookupMaybe(N("AcroForm"), PDFDict);
  const fields = form?.lookupMaybe(N("Fields"), PDFArray);
  const walk = (arr, inheritedFt, depth) => {
    if (!arr || depth > 20) return;
    for (let i = arr.size() - 1; i >= 0; i--) {
      const entry = arr.get(i);
      const d = ctx.lookup(entry);
      if (!(d instanceof PDFDict)) continue;
      const ft = d.get(N("FT")) || inheritedFt;
      if (ft === N("Sig")) {
        arr.remove(i);
        const mark = (r, dd, k) => {
          if (tag(r)) drop.add(r.tag);
          const v = dd?.get(N("V"));
          if (tag(v)) drop.add(v.tag);
          const kids = dd?.lookupMaybe(N("Kids"), PDFArray);
          if (kids && k < 20) for (let j = 0; j < kids.size(); j++) mark(kids.get(j), ctx.lookup(kids.get(j)), k + 1);
        };
        mark(entry, d, 0);
      } else walk(d.lookupMaybe(N("Kids"), PDFArray), ft, depth + 1);
    }
  };
  walk(fields, undefined, 0);
  // stray signature dictionaries (unreferenced, document timestamps…) would show up as broken seals
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.has(N("ByteRange")) && obj.has(N("Contents"))) drop.add(ref.tag);
  }
  if (drop.size) {
    for (const page of doc.getPages()) {
      const annots = page.node.lookupMaybe(N("Annots"), PDFArray);
      if (!annots) continue;
      for (let i = annots.size() - 1; i >= 0; i--) if (drop.has(tag(annots.get(i)))) annots.remove(i);
    }
    for (const [ref] of ctx.enumerateIndirectObjects()) if (drop.has(ref.tag)) ctx.delete(ref);
  }
  return drop.size;
}

function headerVersion(doc) {
  const m = /%PDF-(\d+)\.(\d+)/.exec(doc.context.header.toString());
  return m ? [+m[1], +m[2]] : [1, 7];
}

function addSealPlaceholder(doc, o) {
  const ctx = doc.context, cat = doc.catalog;
  const page = doc.getPages()[0];
  if (!page) throw err("EINVAL", "the PDF has no pages", "noPages");

  const byteRange = PDFArray.withContext(ctx);
  byteRange.push(PDFNumber.of(0));
  for (let i = 0; i < 3; i++) byteRange.push(N(DEFAULT_BYTE_RANGE_PLACEHOLDER));
  const sig = new Map([
    ["Type", N("Sig")],
    ["Filter", N("Adobe.PPKLite")],
    ["SubFilter", N("ETSI.CAdES.detached")],
    ["ByteRange", byteRange],
    ["Contents", PDFHexString.of("0".repeat(o.contentsBytes * 2))],
    ["M", PDFString.fromDate(o.signingTime)],
  ]);
  if (o.name) sig.set("Name", pdfText(o.name));
  if (o.reason) sig.set("Reason", pdfText(o.reason));
  if (o.location) sig.set("Location", pdfText(o.location));
  if (o.contactInfo) sig.set("ContactInfo", pdfText(o.contactInfo));
  sig.set("Reference", ctx.obj([{
    Type: "SigRef", TransformMethod: "DocMDP",
    TransformParams: { Type: "TransformParams", P: 1, V: "1.2" },
  }]));
  const app = { Name: o.appName || "Sealworks" };
  if (o.appVersion) app.REx = PDFString.of(String(o.appVersion));
  sig.set("Prop_Build", ctx.obj({ Filter: { Name: "Adobe.PPKLite" }, App: app }));
  const sigDict = PDFDict.fromMapWithContext(new Map([...sig].map(([k, v]) => [N(k), v])), ctx);
  // frozen bytes: pdf-lib writes them verbatim, so the placeholders stay where @signpdf looks for them
  const frozen = new Uint8Array(sigDict.sizeInBytes());
  sigDict.copyBytesInto(frozen, 0);
  const sigRef = ctx.register(PDFInvalidObject.of(frozen));

  let form = cat.lookupMaybe(N("AcroForm"), PDFDict);
  if (!form) { form = ctx.obj({ Fields: [] }); cat.set(N("AcroForm"), ctx.register(form)); }
  let fields = form.lookupMaybe(N("Fields"), PDFArray);
  if (!fields) { fields = ctx.obj([]); form.set(N("Fields"), fields); }
  const names = new Set();
  for (let i = 0; i < fields.size(); i++) {
    const t = ctx.lookup(fields.get(i))?.get?.(N("T"));
    if (t && typeof t.decodeText === "function") names.add(t.decodeText());
  }
  let fieldName = "Seal";
  for (let n = 2; names.has(fieldName); n++) fieldName = `Seal${n}`;

  const ap = ctx.formXObject([], { BBox: [0, 0, 0, 0], Resources: {} });
  const widget = ctx.obj({
    Type: "Annot", Subtype: "Widget", FT: "Sig", Rect: [0, 0, 0, 0], V: sigRef,
    T: PDFString.of(fieldName), F: 132, P: page.ref, AP: { N: ctx.register(ap) },
  });
  const widgetRef = ctx.register(widget);
  fields.push(widgetRef);
  const flags = form.lookupMaybe(N("SigFlags"), PDFNumber)?.asNumber() || 0;
  form.set(N("SigFlags"), PDFNumber.of(flags | 3));

  let annots = page.node.lookupMaybe(N("Annots"), PDFArray);
  if (!annots) { annots = ctx.obj([]); page.node.set(N("Annots"), annots); }
  annots.push(widgetRef);

  // certification: DocMDP P=1 (no changes permitted)
  cat.set(N("Perms"), ctx.obj({ DocMDP: sigRef }));
  // PAdES (ETSI EN 319 142-1) developer extension, and a 1.7 header for ETSI.CAdES.detached
  const [maj, min] = headerVersion(doc);
  if (maj < 2) {
    if (maj === 1 && min < 7) ctx.header = PDFHeader.forVersion(1, 7);
    let ext = cat.lookupMaybe(N("Extensions"), PDFDict);
    if (!ext) { ext = ctx.obj({}); cat.set(N("Extensions"), ext); }
    if (!ext.has(N("ESIC"))) ext.set(N("ESIC"), ctx.obj({ BaseVersion: "1.7", ExtensionLevel: 1 }));
  }
  return sigRef;
}

/**
 * Seals a PDF: certification signature (DocMDP P=1), PAdES B-B, invisible field on page 1.
 * @returns {Promise<Buffer>}
 */
async function signPdf(input, o) {
  const bytes = toBuffer(input);
  if (bytes.length > MAX_PDF_BYTES) throw err("EINVAL", "PDFs over 300 MB can't be sealed", "tooBig");
  const key = o.key;
  const chainDers = (o.chainDers || []).map(toBuffer);
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(String(e?.message)) || e?.constructor?.name === "EncryptedPDFError") throw err("EINVAL", "password-protected PDFs can't be sealed", "encrypted");
    throw err("EINVAL", `not a readable PDF (${String(e?.message || e).slice(0, 200)})`, "notPdf");
  }
  stripSignatures(doc);
  // size the placeholder from a real CMS (lengths don't depend on the digest value)
  const probe = buildCms({ certDer: o.certDer, chainDers, key, digest: Buffer.alloc(32) });
  const signingTime = o.signingTime || new Date();
  addSealPlaceholder(doc, { ...o, signingTime, contentsBytes: Math.max(probe.length + 512, o.contentsBytes || 0) });
  const saved = Buffer.from(await doc.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false }));
  // o.signCovered (tests only): produce the CMS some other way, e.g. with `openssl cms`
  const signer = o.signCovered
    ? Object.assign(new Signer(), { sign: async (covered) => o.signCovered(covered) })
    : new CadesSigner({ certDer: o.certDer, chainDers, key });
  return new SignPdf().sign(saved, signer);
}

/* ---------------- verification ---------------- */
function hashRanges(buf, br, alg) {
  const h = crypto.createHash(alg);
  for (let i = 0; i < br.length; i += 2) h.update(buf.subarray(br[i], br[i] + br[i + 1]));
  return h.digest();
}

function verifySignature(algOid, paramsNode, digestHash, publicKey, parts, signature) {
  const a = SIG_ALGS[algOid];
  if (!a) throw new Error(`unsupported signature algorithm ${algOid}`);
  if (a.kind === "ed25519") return crypto.verify(null, Buffer.concat(parts), publicKey, signature);
  let hash = a.hash || digestHash, opts = { key: publicKey };
  if (a.kind === "rsa") opts.padding = crypto.constants.RSA_PKCS1_PADDING;
  else if (a.kind === "ec" || a.kind === "dsa") opts.dsaEncoding = "der";
  else if (a.kind === "pss") {
    hash = "sha1"; let salt = 20;
    if (paramsNode && der.is(paramsNode, 16)) {
      for (const p of der.children(paramsNode)) {
        if (p.cls === 2 && p.tag === 0) hash = HASHES[der.oidString(der.children(der.children(p)[0])[0])] || hash;
        if (p.cls === 2 && p.tag === 2) salt = der.value(der.children(p)[0]).readUIntBE(0, Math.min(6, der.value(der.children(p)[0]).length));
      }
    }
    Object.assign(opts, { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: salt });
  }
  if (!hash) throw new Error("unknown digest algorithm");
  const v = crypto.createVerify(hash);
  for (const p of parts) v.update(p);
  return v.verify(opts, signature);
}

function attrMap(signedAttrs) {
  const m = new Map();
  for (const a of der.children(signedAttrs)) {
    const [t, vals] = der.children(a);
    m.set(der.oidString(t), der.children(vals));
  }
  return m;
}

/** Verifies a CMS SignedData /Contents against the covered byte ranges. */
function verifyCms(contents, buf, br, subFilter) {
  const top = der.read(contents);
  const [ctOid, ctBody] = der.children(top);
  if (der.oidString(ctOid) !== OID.signedData) throw new Error("not a CMS SignedData");
  const f = der.children(der.children(ctBody)[0]);
  let i = 1; // version
  i++; // digestAlgorithms
  const encap = der.children(f[i++]);
  const eContentType = der.oidString(encap[0]);
  let eContent = encap[1] ? der.octets(der.children(encap[1])[0]) : null;
  if (eContent && !eContent.length) eContent = null; // `openssl cms -sign -stream` writes an empty one for detached data
  const certs = [];
  for (; i < f.length && f[i].cls === 2; i++) {
    if (f[i].tag === 0) for (const c of der.children(f[i])) if (der.is(c, 16)) certs.push(Buffer.from(der.raw(c)));
  }
  const signerInfos = der.children(f[i]);
  if (!signerInfos.length) throw new Error("no signer in the CMS");
  const si = der.children(signerInfos[0]);
  let j = 1;
  const sid = si[j++];
  const digestOid = der.oidString(der.children(si[j++])[0]);
  const digestHash = HASHES[digestOid];
  if (!digestHash) throw new Error(`unsupported digest algorithm ${digestOid}`);
  let signedAttrs = null;
  if (si[j].cls === 2 && si[j].tag === 0) signedAttrs = si[j++];
  const sigAlgParts = der.children(si[j++]);
  const signature = der.octets(si[j++]);

  // signer certificate
  const infos = certs.map((c) => { try { return certInfo(c); } catch { return null; } }).filter(Boolean);
  let signer = null;
  if (der.is(sid, 16)) {
    const [iss, ser] = der.children(sid);
    const issRaw = der.raw(iss), serVal = der.value(ser);
    signer = infos.find((c) => c.issuerRaw.equals(issRaw) && der.value(der.read(c.serialRaw)).equals(serVal));
  } else if (sid.cls === 2 && sid.tag === 0) {
    const ski = der.value(sid);
    signer = infos.find((c) => { const e = c.extensions.get(OID.subjectKeyId); try { return e && der.value(der.read(e)).equals(ski); } catch { return false; } });
  }
  if (!signer && infos.length === 1) signer = infos[0];
  if (!signer) throw new Error("signer certificate not found in the CMS");
  const publicKey = new crypto.X509Certificate(signer.der).publicKey;

  let digestOk = true, signedAt = null;
  // what the signature's messageDigest covers
  let content = null; // null = the PDF byte ranges
  if (eContent) {
    if (eContentType === OID.tstInfo) {
      // document timestamp: TSTInfo.messageImprint = hash of the byte ranges
      const tst = der.children(der.read(eContent));
      const [imprintAlg, imprint] = der.children(tst[2]);
      const h = HASHES[der.oidString(der.children(imprintAlg)[0])];
      if (!h) throw new Error("unsupported timestamp imprint algorithm");
      digestOk = der.octets(imprint).equals(hashRanges(buf, br, h));
      signedAt = der.time(tst[4]);
    } else if (subFilter === "adbe.pkcs7.sha1") {
      digestOk = eContent.equals(hashRanges(buf, br, "sha1"));
    } else {
      // attached content (e.g. `openssl cms -sign -stream`): fine when it is exactly the covered bytes
      const h = digestHash;
      if (!crypto.createHash(h).update(eContent).digest().equals(hashRanges(buf, br, h))) throw new Error("the signature carries content other than the PDF bytes");
    }
    content = eContent;
  }
  let signatureOk;
  if (signedAttrs) {
    const attrs = attrMap(signedAttrs);
    const md = attrs.get(OID.messageDigest)?.[0];
    if (!md) throw new Error("messageDigest attribute missing");
    const expected = content ? crypto.createHash(digestHash).update(content).digest() : hashRanges(buf, br, digestHash);
    digestOk = digestOk && der.octets(md).equals(expected);
    const st = attrs.get(OID.signingTime)?.[0];
    if (st && signedAt == null) signedAt = der.time(st);
    const toVerify = Buffer.from(der.raw(signedAttrs));
    toVerify[0] = 0x31;
    signatureOk = verifySignature(der.oidString(sigAlgParts[0]), sigAlgParts[1], digestHash, publicKey, [toVerify], signature);
  } else {
    const parts = content ? [content] : [];
    if (!content) for (let k = 0; k < br.length; k += 2) parts.push(buf.subarray(br[k], br[k] + br[k + 1]));
    signatureOk = verifySignature(der.oidString(sigAlgParts[0]), sigAlgParts[1], digestHash, publicKey, parts, signature);
    digestOk = digestOk && signatureOk;
  }
  return { signer, digestOk, signatureOk, signedAt };
}

/** adbe.x509.rsa_sha1: /Contents is a DER OCTET STRING with a PKCS#1 signature, /Cert holds the certificate(s). */
function verifyX509Sha1(contents, buf, br, certStrings) {
  if (!certStrings.length) throw new Error("no /Cert in an adbe.x509.rsa_sha1 signature");
  const signer = certInfo(certStrings[0]);
  const signature = der.octets(der.read(contents));
  const v = crypto.createVerify("sha1");
  for (let k = 0; k < br.length; k += 2) v.update(buf.subarray(br[k], br[k] + br[k + 1]));
  const ok = v.verify({ key: new crypto.X509Certificate(signer.der).publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, signature);
  return { signer, digestOk: ok, signatureOk: ok, signedAt: null };
}

/** All dictionaries with a /ByteRange key, parsed where they sit in the raw file. */
function scanRaw(buf) {
  const out = [];
  const keyHit = (node, at) => {
    if (!node || at < node.start || at >= node.end) return null;
    if (node.t === "dict") {
      if (node.keys.get("ByteRange") === at) return node;
      for (const v of node.v.values()) { const r = keyHit(v, at); if (r) return r; }
    } else if (node.t === "arr") for (const v of node.v) { const r = keyHit(v, at); if (r) return r; }
    return null;
  };
  for (let pos = 0; (pos = buf.indexOf("/ByteRange", pos, "latin1")) !== -1; pos += 10) {
    const at = pos, nx = buf[at + 10];
    if (nx !== undefined && !isWs(nx) && !isDelim(nx)) continue;
    let hit = null, tries = 0;
    for (const s of objectStartsBefore(buf, at)) {
      if (++tries > 16) break;
      let obj;
      try { obj = parseIndirectAt(buf, s); } catch { continue; }
      const dict = keyHit(obj.value, at);
      if (dict) { hit = { objNum: obj.n, objGen: obj.g, dict }; break; }
      if (obj.value.end > at) break; // inside an object, but not as a dictionary key (stream data…)
    }
    if (hit) out.push(hit);
    else if (/^\/ByteRange\s*\[\s*\d+\s+\d+\s+\d+\s+\d+\s*\]/.test(buf.toString("latin1", at, Math.min(buf.length, at + 80)))) {
      out.push({ broken: "signature dictionary could not be parsed", at });
    }
  }
  return out;
}

function recordFromRaw(entry, resolve) {
  if (entry.broken) return { error: entry.broken, at: entry.at };
  const d = entry.dict.v;
  const get = (k) => resolve(d.get(k));
  const nameOf = (n) => (n && n.t === "name" ? n.v : undefined);
  const brNode = get("ByteRange");
  const contents = d.get("Contents");
  const rec = {
    objNum: entry.objNum,
    byteRange: brNode?.t === "arr" ? brNode.v.map((x) => (x.t === "num" ? x.v : NaN)) : null,
    contents: contents?.t === "str" ? contents.bytes : null,
    contentsSpan: contents?.t === "str" ? [contents.start, contents.end] : null,
    type: nameOf(get("Type")), filter: nameOf(get("Filter")), subFilter: nameOf(get("SubFilter")),
    m: textOf(get("M")), reason: textOf(get("Reason")), location: textOf(get("Location")), name: textOf(get("Name")),
    docMdp: null, certs: [],
  };
  const refs = get("Reference");
  for (const r of refs?.t === "arr" ? refs.v : []) {
    const rd = resolve(r);
    if (rd?.t !== "dict" || nameOf(resolve(rd.v.get("TransformMethod"))) !== "DocMDP") continue;
    const tp = resolve(rd.v.get("TransformParams"));
    const p = tp?.t === "dict" ? resolve(tp.v.get("P")) : null;
    rec.docMdp = p?.t === "num" ? p.v : 2;
  }
  const cert = get("Cert");
  if (cert?.t === "str") rec.certs = [cert.bytes];
  else if (cert?.t === "arr") rec.certs = cert.v.map(resolve).filter((c) => c?.t === "str").map((c) => c.bytes);
  return rec;
}

/** pdf-lib's view: catalog /Perms /DocMDP and the AcroForm signature fields. */
async function formView(buf) {
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
  const ctx = doc.context;
  const perms = doc.catalog.lookupMaybe(N("Perms"), PDFDict);
  const dm = perms?.get(N("DocMDP"));
  const fields = [];
  const form = doc.catalog.lookupMaybe(N("AcroForm"), PDFDict);
  const walk = (arr, ft0, depth) => {
    if (!(arr instanceof PDFArray) || depth > 20) return;
    for (let i = 0; i < arr.size(); i++) {
      const d = ctx.lookup(arr.get(i));
      if (!(d instanceof PDFDict)) continue;
      const ft = d.get(N("FT")) || ft0;
      const v = d.get(N("V"));
      if (ft === N("Sig") && v) {
        const vd = ctx.lookup(v);
        if (vd instanceof PDFDict) fields.push({ objNum: v instanceof PDFRef ? v.objectNumber : null, dict: vd });
      }
      walk(ctx.lookup(d.get(N("Kids"))), ft, depth + 1);
    }
  };
  walk(form ? ctx.lookup(form.get(N("Fields"))) : null, undefined, 0);
  return { docMdpObjNum: dm instanceof PDFRef ? dm.objectNumber : dm ? "direct" : null, fields, ctx };
}

function recordFromLib(f, ctx) {
  const d = f.dict;
  const g = (k) => ctx.lookup(d.get(N(k)));
  const name = (k) => { const v = g(k); return v instanceof PDFName ? v.decodeText() : undefined; };
  const txt = (k) => { const v = g(k); return v && typeof v.decodeText === "function" && !(v instanceof PDFName) ? v.decodeText() : undefined; };
  const br = g("ByteRange");
  const c = g("Contents");
  let contents = null;
  if (c instanceof PDFHexString) contents = Buffer.from(c.asBytes());
  else if (c instanceof PDFString) contents = Buffer.from(c.asBytes());
  let docMdp = null;
  const refs = g("Reference");
  if (refs instanceof PDFArray) {
    for (let i = 0; i < refs.size(); i++) {
      const r = ctx.lookup(refs.get(i));
      if (!(r instanceof PDFDict) || ctx.lookup(r.get(N("TransformMethod"))) !== N("DocMDP")) continue;
      const p = ctx.lookup(r.get(N("TransformParams")))?.get?.(N("P"));
      docMdp = p instanceof PDFNumber ? p.asNumber() : 2;
    }
  }
  return {
    objNum: f.objNum, fromForm: true,
    byteRange: br instanceof PDFArray ? br.asArray().map((x) => (ctx.lookup(x) instanceof PDFNumber ? ctx.lookup(x).asNumber() : NaN)) : null,
    contents, contentsSpan: null,
    type: name("Type"), filter: name("Filter"), subFilter: name("SubFilter"),
    m: txt("M"), reason: txt("Reason"), location: txt("Location"), name: txt("Name"),
    docMdp, certs: [],
  };
}

const TAIL_WS = (buf, from) => { for (let i = from; i < buf.length; i++) if (!isWs(buf[i])) return false; return true; };

function checkRecord(buf, rec, view, myFingerprint) {
  const info = {
    name: rec.name || "", fingerprint: "", signedAt: pdfDate(rec.m), certify: false,
    coversWholeFile: false, digestOk: false, signatureOk: false, mine: false, selfSigned: false,
  };
  if (rec.reason) info.reason = rec.reason;
  if (rec.location) info.location = rec.location;
  let end = 0;
  try {
    if (rec.error) throw new Error(rec.error);
    const br = rec.byteRange;
    if (!br || br.length !== 4 || !br.every((x) => Number.isSafeInteger(x) && x >= 0)) throw new Error("bad /ByteRange");
    if (br[0] !== 0 || br[1] < 1 || br[2] < br[1] + 2 || br[2] + br[3] > buf.length) throw new Error("/ByteRange does not fit the file");
    end = br[2] + br[3];
    if (!rec.contents) throw new Error("no /Contents");
    if (rec.contentsSpan) {
      if (rec.contentsSpan[0] !== br[1] || rec.contentsSpan[1] !== br[2]) throw new Error("/Contents is not where /ByteRange leaves its gap");
    } else {
      const gap = buf.toString("latin1", br[1], br[2]).replace(/[\0\t\n\f\r ]+/g, "");
      if (!/^<[0-9a-fA-F]*>$/.test(gap) || !Buffer.from(gap.slice(1, -1), "hex").equals(rec.contents)) throw new Error("/Contents is not where /ByteRange leaves its gap");
    }
    info.coversWholeFile = end === buf.length || TAIL_WS(buf, end);
    const v = rec.subFilter === "adbe.x509.rsa_sha1"
      ? verifyX509Sha1(rec.contents, buf, br, rec.certs)
      : verifyCms(rec.contents, buf, br, rec.subFilter);
    info.digestOk = v.digestOk;
    info.signatureOk = v.signatureOk;
    if (v.signedAt != null) info.signedAt = v.signedAt;
    info.name = v.signer.name || info.name;
    if (v.signer.org) info.org = v.signer.org;
    info.fingerprint = v.signer.fingerprint;
    info.selfSigned = isSelfSigned(v.signer);
    info.mine = !!myFingerprint && v.signer.fingerprint === myFingerprint;
    if (!info.digestOk) info.error = "the covered bytes don't match the signed digest";
    else if (!info.signatureOk) info.error = "the signature doesn't verify with the signer's certificate";
  } catch (e) {
    info.digestOk = false;
    info.signatureOk = false;
    info.error = String(e?.message || e).replace(/^(asn1|pdf): /, "").slice(0, 200);
  }
  // certification: DocMDP transform on the signature and the catalog's /Perms pointing at it
  if (rec.docMdp != null) {
    const p = view?.docMdpObjNum;
    info.certify = !view || p === "direct" || p === rec.objNum;
    info.docMdp = rec.docMdp;
  }
  return { info, end };
}

/**
 * @returns {Promise<{status: "none"|"intact"|"modified"|"invalid", signatures: object[]}>}
 */
async function verifyPdf(input, { myFingerprint } = {}) {
  const buf = toBuffer(input);
  if (buf.length > MAX_PDF_BYTES) throw err("EINVAL", "PDFs over 300 MB can't be checked", "tooBig");
  const resolve = makeResolver(buf);
  let raw = [];
  try { raw = scanRaw(buf); } catch { raw = []; }
  const recs = raw.map((e) => { try { return recordFromRaw(e, resolve); } catch (x) { return { error: String(x?.message || x) }; } });
  let view = null;
  const header = buf.indexOf("%PDF-", 0, "latin1");
  if (header >= 0 && header < 1024) {
    try {
      view = await formView(buf);
      const known = new Set(recs.map((r) => r.objNum).filter((n) => n != null));
      for (const f of view.fields) {
        if (f.objNum != null && known.has(f.objNum)) continue;
        // a signature the raw scan didn't see (e.g. its dictionary was rewritten into an object stream)
        try { recs.push(recordFromLib(f, view.ctx)); } catch (x) { recs.push({ error: String(x?.message || x) }); }
      }
    } catch { view = null; }
  }
  const checked = recs.map((r) => checkRecord(buf, r, view, myFingerprint)).sort((a, b) => a.end - b.end);
  const signatures = checked.map((c) => c.info);
  let status = "intact";
  if (!signatures.length) status = "none";
  else if (signatures.some((s) => !s.digestOk || !s.signatureOk)) status = "invalid";
  else if (!signatures[signatures.length - 1].coversWholeFile) status = "modified";
  // a certification that permits no changes (P=1) is broken by anything added later, even another signature
  else if (signatures.some((s) => s.certify && s.docMdp === 1 && !s.coversWholeFile)) status = "modified";
  return { status, signatures };
}

module.exports = { signPdf, verifyPdf, buildCms, certInfo, fingerprintOf, isSelfSigned, MAX_PDF_BYTES, OID };
