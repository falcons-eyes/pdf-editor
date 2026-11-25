"use strict";
// Sealer identity crypto (no Electron): key + self-signed certificate, PKCS#12 export/import.
// Node's crypto does the key work; node-forge builds the X.509 certificate and reads PKCS#12.
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const forge = require("node-forge");
const der = require("./der");
const { certInfo, isSelfSigned } = require("./pdfsig");

const A = forge.asn1, T = A.Type, U = A.Class.UNIVERSAL, C = A.Class.CONTEXT_SPECIFIC;
const MARKER_OID = "2.16.840.1.113730.1.13"; // Netscape comment: marks certificates this app made
const MARKER = "Sealmark seal";
const MARKERS = new Set([MARKER, "PDF Editor seal"]); // also certificates made before the rename
const ADOBE_DOC_SIGNING = "1.2.840.113583.1.1.5";
const VALID_YEARS = 10;

// `key` names the reason; seal.js turns it into a short localized message
const err = (code, message, key) => Object.assign(new Error(`${code}: ${message}`), { code, key });
const bin = (b) => Buffer.from(b).toString("binary");
const unbin = (s) => Buffer.from(s, "binary");

/** RSA-2048 key + self-signed X.509 (CN/O/emailAddress, digitalSignature+nonRepudiation, 10 years). */
async function createSelfSigned({ name, org, email }) {
  const { privateKey } = await promisify(crypto.generateKeyPair)("rsa", { modulusLength: 2048, publicExponent: 0x10001 });
  const keyDer = privateKey.export({ type: "pkcs8", format: "der" });
  const fkey = forge.pki.privateKeyFromAsn1(A.fromDer(bin(keyDer)));
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.setRsaPublicKey(fkey.n, fkey.e);
  const serial = crypto.randomBytes(16);
  serial[0] = (serial[0] & 0x3f) | 0x40; // positive, no leading zero
  cert.serialNumber = serial.toString("hex");
  const notBefore = new Date(Date.now() - 5 * 60 * 1000);
  const notAfter = new Date(notBefore);
  notAfter.setUTCFullYear(notAfter.getUTCFullYear() + VALID_YEARS);
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;
  const attrs = [];
  if (org) attrs.push({ shortName: "O", value: org, valueTagClass: T.UTF8 });
  attrs.push({ shortName: "CN", value: name, valueTagClass: T.UTF8 });
  if (email) attrs.push({ name: "emailAddress", value: email, valueTagClass: T.IA5STRING });
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  const exts = [
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", critical: true, digitalSignature: true, nonRepudiation: true },
    { name: "extKeyUsage", emailProtection: true, [ADOBE_DOC_SIGNING]: true },
    { name: "subjectKeyIdentifier" },
    { id: MARKER_OID, value: A.create(U, T.IA5STRING, false, MARKER) },
  ];
  if (email) exts.push({ name: "subjectAltName", altNames: [{ type: 1, value: email }] });
  cert.setExtensions(exts);
  cert.sign(fkey, forge.md.sha256.create());
  const certDer = unbin(A.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
  // sanity: the certificate verifies with its own key
  const x = new crypto.X509Certificate(certDer);
  if (!x.verify(x.publicKey)) throw err("EIO", "certificate self-check failed", "io");
  return { keyDer, certDer };
}

/** Public description of a certificate (name/org/email from the subject, validity, marker). */
function describeCert(certDer) {
  const ci = certInfo(certDer);
  let marker = false;
  const m = ci.extensions.get(MARKER_OID);
  if (m) { try { marker = MARKERS.has(der.value(der.read(m)).toString("latin1")); } catch {} }
  return { ...ci, ours: marker && isSelfSigned(ci), selfSigned: isSelfSigned(ci) };
}

/** Checks that a private key can seal and belongs to the certificate. */
function checkKeyPair(key, certDer) {
  const t = key.asymmetricKeyType;
  if (t === "ec") {
    const curve = key.asymmetricKeyDetails?.namedCurve;
    if (!["prime256v1", "secp384r1", "secp521r1"].includes(curve)) throw err("EINVAL", `EC curve ${curve} is not supported`, "keyType");
  } else if (t !== "rsa") throw err("EINVAL", `${t} keys are not supported (RSA or EC needed)`, "keyType");
  const pub = crypto.createPublicKey(key).export({ type: "spki", format: "der" });
  const certPub = new crypto.X509Certificate(certDer).publicKey.export({ type: "spki", format: "der" });
  return pub.equals(certPub);
}

/* ---------------- PKCS#12 ---------------- */
const oidNode = (o) => A.create(U, T.OID, false, A.oidToDer(o).getBytes());
const dataCI = (bytes) => A.create(U, T.SEQUENCE, true, [
  oidNode(forge.pki.oids.data),
  A.create(C, 0, true, [A.create(U, T.OCTETSTRING, false, bytes)]),
]);

/**
 * PKCS#12 with the key in a pkcs8ShroudedKeyBag (pbeWithSHAAnd3-KeyTripleDES-CBC), certificates
 * in a plain SafeContents and an HMAC-SHA1 MAC: the combination macOS Keychain, Windows and
 * Acrobat all import.
 */
function exportP12({ keyDer, certDer, chainDers = [], password, friendlyName = "Sealmark seal" }) {
  if (typeof password !== "string" || !password) throw err("EINVAL", "a password is required", "needPassword");
  const localKeyId = crypto.createHash("sha1").update(certDer).digest();
  const bagAttrs = A.create(U, T.SET, true, [
    A.create(U, T.SEQUENCE, true, [oidNode(forge.pki.oids.localKeyId), A.create(U, T.SET, true, [A.create(U, T.OCTETSTRING, false, bin(localKeyId))])]),
    A.create(U, T.SEQUENCE, true, [oidNode(forge.pki.oids.friendlyName), A.create(U, T.SET, true, [A.create(U, T.BMPSTRING, false, friendlyName)])]),
  ]);
  const certBag = (d, attrs) => A.create(U, T.SEQUENCE, true, [
    oidNode(forge.pki.oids.certBag),
    A.create(C, 0, true, [A.create(U, T.SEQUENCE, true, [
      oidNode(forge.pki.oids.x509Certificate),
      A.create(C, 0, true, [A.create(U, T.OCTETSTRING, false, bin(d))]),
    ])]),
    ...(attrs ? [attrs] : []),
  ]);
  const certSafe = A.create(U, T.SEQUENCE, true, [certBag(certDer, bagAttrs), ...chainDers.map((d) => certBag(d))]);
  const epki = forge.pki.encryptPrivateKeyInfo(A.fromDer(bin(keyDer)), password, { algorithm: "3des", count: 10000, saltSize: 8 });
  const keySafe = A.create(U, T.SEQUENCE, true, [A.create(U, T.SEQUENCE, true, [
    oidNode(forge.pki.oids.pkcs8ShroudedKeyBag), A.create(C, 0, true, [epki]), bagAttrs,
  ])]);
  const authSafe = A.toDer(A.create(U, T.SEQUENCE, true, [dataCI(A.toDer(certSafe).getBytes()), dataCI(A.toDer(keySafe).getBytes())])).getBytes();
  const salt = forge.util.createBuffer(bin(crypto.randomBytes(20)));
  const iterations = 10000;
  const macKey = forge.pkcs12.generateKey(password, salt, 3, iterations, 20, forge.md.sha1.create());
  const hmac = forge.hmac.create();
  hmac.start("sha1", macKey);
  hmac.update(authSafe);
  const pfx = A.create(U, T.SEQUENCE, true, [
    A.create(U, T.INTEGER, false, A.integerToDer(3).getBytes()),
    dataCI(authSafe),
    A.create(U, T.SEQUENCE, true, [
      A.create(U, T.SEQUENCE, true, [
        A.create(U, T.SEQUENCE, true, [oidNode(forge.pki.oids.sha1), A.create(U, T.NULL, false, "")]),
        A.create(U, T.OCTETSTRING, false, hmac.digest().getBytes()),
      ]),
      A.create(U, T.OCTETSTRING, false, salt.bytes()),
      A.create(U, T.INTEGER, false, A.integerToDer(iterations).getBytes()),
    ]),
  ]);
  return unbin(A.toDer(pfx).getBytes());
}

/**
 * Reads a .p12/.pfx (legacy RC2/3DES or PBES2/AES, SHA-1/SHA-2 MAC; RSA or EC keys).
 * @returns {{ keyDer: Buffer, certDer: Buffer, chainDers: Buffer[] }}
 */
function importP12(bytes, password) {
  if (typeof password !== "string") password = "";
  let asn;
  try { asn = A.fromDer(bin(bytes), { strict: false }); }
  catch { throw err("EINVAL", "not a .p12/.pfx file", "notP12"); }
  // keep certificates as the exact bytes in the file (re-encoding a parsed certificate can change
  // it), and give PBES2 the password as UTF-8 like OpenSSL does (PKCS#12 MAC/PBE keep BMPString)
  const certFromAsn1 = forge.pki.certificateFromAsn1;
  const pbkdf2 = forge.pkcs5.pbkdf2;
  forge.pki.certificateFromAsn1 = () => { throw new Error("raw"); };
  forge.pkcs5.pbkdf2 = (p, ...rest) => pbkdf2(typeof p === "string" && /[^\x00-\x7f]/.test(p) ? forge.util.encodeUtf8(p) : p, ...rest);
  let p12, last;
  try {
    for (const pw of password === "" ? ["", null] : [password]) {
      try { p12 = forge.pkcs12.pkcs12FromAsn1(asn, false, pw); break; } catch (e) { last = e; }
    }
  } finally {
    forge.pki.certificateFromAsn1 = certFromAsn1;
    forge.pkcs5.pbkdf2 = pbkdf2;
  }
  if (!p12) {
    const m = String(last?.message || last);
    if (/MAC could not be verified|wrong password|Invalid password|Unable to decrypt/i.test(m)) throw err("EPASSWORD", "wrong password for this certificate file", "password");
    if (/unsupported|not supported/i.test(m)) throw err("EINVAL", m.slice(0, 200), "notP12");
    throw err("EINVAL", `can't read this .p12/.pfx file (${m.slice(0, 160)})`, "notP12");
  }
  const bags = p12.safeContents.flatMap((sc) => sc.safeBags);
  const keys = [], certs = [];
  for (const b of bags) {
    try {
      if (b.type === forge.pki.oids.pkcs8ShroudedKeyBag || b.type === forge.pki.oids.keyBag) {
        const asn1 = b.key ? forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(b.key)) : b.asn1;
        if (asn1) keys.push(crypto.createPrivateKey({ key: unbin(A.toDer(asn1).getBytes()), format: "der", type: "pkcs8" }));
      } else if (b.type === forge.pki.oids.certBag && b.asn1) {
        const d = unbin(A.toDer(b.asn1).getBytes());
        if (!certs.some((c) => c.equals(d))) certs.push(d);
      }
    } catch {}
  }
  if (!keys.length) throw err("EINVAL", "the file has no private key", "p12Incomplete");
  if (!certs.length) throw err("EINVAL", "the file has no certificate", "p12Incomplete");
  for (const key of keys) {
    const cert = certs.find((c) => { try { return checkKeyPair(key, c); } catch (e) { if (e.key === "keyType") throw e; return false; } });
    if (!cert) continue;
    return {
      keyDer: key.export({ type: "pkcs8", format: "der" }),
      certDer: cert,
      chainDers: certs.filter((c) => c !== cert).slice(0, 10),
    };
  }
  throw err("EINVAL", "no certificate in the file matches its private key", "p12Mismatch");
}

module.exports = { createSelfSigned, describeCert, checkKeyPair, exportP12, importP12, MARKER_OID };
