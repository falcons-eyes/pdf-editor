// node:crypto for the seal bundle (Android WebView worker, and the Node test that checks the bundle).
//
// Covers exactly what desktop/src/{seal,pdfsig,pki}.js call, with Node's semantics and return
// types, synchronously where Node is synchronous:
//   createHash (md5, sha1, sha2, sha3)        @noble/hashes
//   sign / verify / createVerify              RSA PKCS#1 v1.5 + PSS (BigInt), ECDSA P-256/384/521 and
//                                             secp256k1, Ed25519 (@noble/curves), DSA (BigInt)
//   createPrivateKey / createPublicKey        PKCS#8 / SPKI DER (and PEM), KeyObject-like objects
//   X509Certificate                           .raw, .publicKey, .verify(publicKey)
//   generateKeyPair("rsa")                    WebCrypto (native speed); node-forge as a fallback
//   randomBytes                               crypto.getRandomValues
//   createCipheriv / createDecipheriv         aes-256-gcm only (node-forge), for seal.js's file protection
//   constants                                 the RSA padding numbers Node uses
//
// Native keys (Android): a private key that stays in Kotlin is a "handle" PKCS#8 (algorithm OID
// NATIVE_KEY_OID, holding a registry number and the public key). createPrivateKey turns it into a
// KeyObject whose sign() and export() call the registered native signer (see entry.js), so
// desktop/src/{seal,pdfsig,pki}.js use it unchanged while the private key never enters JS.
import { Buffer } from "buffer";
import forge from "node-forge";
import { md5, sha1 } from "@noble/hashes/legacy.js";
import { sha224, sha256, sha384, sha512 } from "@noble/hashes/sha2.js";
import { sha3_256, sha3_384, sha3_512 } from "@noble/hashes/sha3.js";
import { p256, p384, p521 } from "@noble/curves/nist.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import D from "../../../desktop/src/der.js";

export const constants = Object.freeze({
  RSA_PKCS1_PADDING: 1, RSA_NO_PADDING: 3, RSA_PKCS1_OAEP_PADDING: 4, RSA_PKCS1_PSS_PADDING: 6,
  RSA_PSS_SALTLEN_DIGEST: -1, RSA_PSS_SALTLEN_MAX_SIGN: -2, RSA_PSS_SALTLEN_AUTO: -2,
});

const fail = (msg, code = "ERR_CRYPTO") => { const e = new Error(msg); e.code = code; throw e; };
const buf = (d) => {
  if (Buffer.isBuffer(d)) return d;
  if (ArrayBuffer.isView(d)) return Buffer.from(d.buffer, d.byteOffset, d.byteLength);
  if (d instanceof ArrayBuffer) return Buffer.from(d);
  if (typeof d === "string") return Buffer.from(d, "utf8");
  fail("The data argument must be a string, Buffer, TypedArray or DataView", "ERR_INVALID_ARG_TYPE");
};

/* ---------------- hashes ---------------- */
const HASH = { md5, sha1, sha224, sha256, sha384, sha512, "sha3-256": sha3_256, "sha3-384": sha3_384, "sha3-512": sha3_512 };
const HASH_OID = {
  md5: "1.2.840.113549.2.5", sha1: "1.3.14.3.2.26", sha224: "2.16.840.1.101.3.4.2.4", sha256: "2.16.840.1.101.3.4.2.1",
  sha384: "2.16.840.1.101.3.4.2.2", sha512: "2.16.840.1.101.3.4.2.3", "sha3-256": "2.16.840.1.101.3.4.2.8",
  "sha3-384": "2.16.840.1.101.3.4.2.9", "sha3-512": "2.16.840.1.101.3.4.2.10",
};
function hashName(alg) {
  const n = String(alg).toLowerCase().replace(/^rsa-/, "").replace(/^sha-(\d)/, "sha$1");
  if (!HASH[n]) fail(`Digest method not supported: ${alg}`, "ERR_CRYPTO_INVALID_DIGEST");
  return n;
}
const digestOf = (alg, ...parts) => { const h = HASH[hashName(alg)].create(); for (const p of parts) h.update(buf(p)); return Buffer.from(h.digest()); };

export function createHash(alg) {
  const h = HASH[hashName(alg)].create();
  let done = false;
  return {
    update(data, enc) {
      if (done) fail("Digest already called", "ERR_CRYPTO_HASH_FINALIZED");
      h.update(typeof data === "string" ? Buffer.from(data, enc || "utf8") : buf(data));
      return this;
    },
    digest(enc) {
      if (done) fail("Digest already called", "ERR_CRYPTO_HASH_FINALIZED");
      done = true;
      const out = Buffer.from(h.digest());
      return enc ? out.toString(enc) : out;
    },
  };
}

export function randomBytes(n, cb) {
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i += 65536) globalThis.crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
  if (typeof cb === "function") { queueMicrotask(() => cb(null, out)); return undefined; }
  return out;
}

/* ---------------- BigInt helpers ---------------- */
const big = (u8) => (u8.length ? BigInt("0x" + Buffer.from(u8).toString("hex")) : 0n);
const bitLen = (n) => (n === 0n ? 0 : n.toString(2).length);
function bytesOf(n, len) {
  let h = n.toString(16);
  if (h.length % 2) h = "0" + h;
  const b = Buffer.from(n === 0n ? "" : h, "hex");
  if (len === undefined) return b;
  if (b.length > len) return null;
  return Buffer.concat([Buffer.alloc(len - b.length), b]);
}
function modPow(b, e, m) {
  let r = 1n;
  b %= m;
  for (const bit of e.toString(2)) { r = (r * r) % m; if (bit === "1") r = (r * b) % m; }
  return r;
}
function modInv(a, m) {
  let [r0, r1, s0, s1] = [((a % m) + m) % m, m, 1n, 0n];
  while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
  if (r0 !== 1n) fail("not invertible");
  return ((s0 % m) + m) % m;
}
const intDer = (n) => { let b = bytesOf(n); if (!b.length || b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]); return D.int(b); };
const intOf = (node) => big(D.value(D.expect(node, 2, "INTEGER")));
const bitString = (b) => D.tlv(0x03, Buffer.from([0]), b);
const bitsOf = (node) => { const v = D.value(D.expect(node, 3, "BIT STRING")); if (!v.length || v[0] !== 0) fail("unsupported BIT STRING"); return v.subarray(1); };

/* ---------------- keys ---------------- */
export const NATIVE_KEY_OID = "1.3.6.1.4.1.57264.5.1";
const natives = new Map();
let nativeCount = 0;
/** native: { sign(hash, data, spki) -> bytes (sync), exportKey(spki) -> PKCS#8 bytes (sync) } -> registry number */
export function registerNative(native) { natives.set(++nativeCount, native); return nativeCount; }
/** the handle PKCS#8 for a native key */
export function nativeHandle(id, spki) {
  return D.seq(D.int(id), D.seq(D.oid(NATIVE_KEY_OID)), D.octet(D.seq(D.int(id), D.octet(buf(spki)))));
}
const OID = { rsa: "1.2.840.113549.1.1.1", rsaPss: "1.2.840.113549.1.1.10", ec: "1.2.840.10045.2.1", ed25519: "1.3.101.112", dsa: "1.2.840.10040.4.1" };
const CURVES = {
  "1.2.840.10045.3.1.7": { name: "prime256v1", c: p256 },
  "1.3.132.0.34": { name: "secp384r1", c: p384 },
  "1.3.132.0.35": { name: "secp521r1", c: p521 },
  "1.3.132.0.10": { name: "secp256k1", c: secp256k1 },
};
const curveOf = (oid) => CURVES[oid] || fail(`Unsupported elliptic curve ${oid}`, "ERR_OSSL_EC_UNKNOWN_GROUP");
const secretLen = (c) => c.lengths?.secretKey ?? c.Point.Fn.BYTES;
const padLeft = (b, len) => (b.length >= len ? b.subarray(b.length - len) : Buffer.concat([Buffer.alloc(len - b.length), b]));

class KeyObject {
  constructor(type, kind, k) { this.type = type; this.asymmetricKeyType = kind; Object.defineProperty(this, "k", { value: k }); }
  get asymmetricKeyDetails() {
    const k = this.k;
    if (k.n) return { modulusLength: bitLen(k.n), publicExponent: k.e };
    if (k.curveOid) return { namedCurve: CURVES[k.curveOid]?.name || k.curveOid };
    if (k.p) return { modulusLength: bitLen(k.p), divisorLength: bitLen(k.q) };
    return {};
  }
  export(o = {}) {
    const fmt = o.format || "pem";
    let der;
    if (this.type === "private" && this.k.native && (o.type || "pkcs8") === "pkcs8") der = Buffer.from(this.k.native.exportKey(this.k.spki));
    else if (this.type === "private" && (o.type || "pkcs8") === "pkcs8") der = Buffer.from(this.k.der);
    else if (this.type === "public" && (o.type || "spki") === "spki") der = spkiOf(this);
    else fail(`unsupported export ${this.type}/${o.type}`, "ERR_CRYPTO_INCOMPATIBLE_KEY_OPTIONS");
    if (fmt === "der") return der;
    const label = this.type === "private" ? "PRIVATE KEY" : "PUBLIC KEY";
    return `-----BEGIN ${label}-----\n${der.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END ${label}-----\n`;
  }
  equals(other) { return other instanceof KeyObject && other.type === this.type && this.export({ format: "der" }).equals(other.export({ format: "der" })); }
}

function spkiOf(key) {
  const k = key.k;
  switch (key.asymmetricKeyType) {
    case "rsa": return D.seq(D.seq(D.oid(OID.rsa), D.nul()), bitString(D.seq(intDer(k.n), intDer(k.e))));
    case "rsa-pss": return Buffer.from(k.spki); // parameters are part of the key; keep them as given
    case "ec": return D.seq(D.seq(D.oid(OID.ec), D.oid(k.curveOid)), bitString(Buffer.from(curveOf(k.curveOid).c.Point.fromBytes(k.point).toBytes(false))));
    case "ed25519": return D.seq(D.seq(D.oid(OID.ed25519)), bitString(Buffer.from(k.point)));
    case "dsa": return D.seq(D.seq(D.oid(OID.dsa), D.seq(intDer(k.p), intDer(k.q), intDer(k.g))), bitString(intDer(k.y)));
    default: return fail("unsupported key type");
  }
}

const pemBody = (s, label) => {
  const m = new RegExp(`-----BEGIN ${label}-----([\\s\\S]*?)-----END ${label}-----`).exec(s);
  return m ? Buffer.from(m[1].replace(/\s+/g, ""), "base64") : null;
};
function keyInput(input) {
  if (input instanceof KeyObject) return { key: input };
  if (typeof input === "string" || Buffer.isBuffer(input) || ArrayBuffer.isView(input)) input = { key: input };
  if (!input || typeof input !== "object") fail("invalid key", "ERR_INVALID_ARG_TYPE");
  return input;
}

function parsePkcs8(der) {
  const top = D.read(der);
  const f = D.children(top);
  const alg = D.children(f[1]);
  const oid = D.oidString(alg[0]);
  const inner = D.octets(D.expect(f[2], 4, "OCTET STRING"));
  const raw = Buffer.from(der.subarray(0, top.end));
  if (oid === NATIVE_KEY_OID) {
    const [idNode, spkiNode] = D.children(D.read(inner));
    const native = natives.get(Number(intOf(idNode)));
    if (!native) fail("unknown native key", "ERR_OSSL_UNSUPPORTED");
    const spki = Buffer.from(D.value(spkiNode));
    const pub = parseSpki(spki);
    return new KeyObject("private", pub.asymmetricKeyType, { ...pub.k, der: raw, spki, native });
  }
  if (oid === OID.rsa || oid === OID.rsaPss) {
    const r = D.children(D.read(inner)).map((n) => intOf(n));
    const [, n, e, d, p, q, dp, dq, qi] = r;
    return new KeyObject("private", oid === OID.rsa ? "rsa" : "rsa-pss", { der: raw, n, e, d, p, q, dp, dq, qi });
  }
  if (oid === OID.ec) {
    const curveOid = D.oidString(alg[1]);
    const { c } = curveOf(curveOid);
    const ec = D.children(D.read(inner));
    const priv = padLeft(D.value(D.expect(ec[1], 4, "OCTET STRING")), secretLen(c));
    let point = null;
    for (const x of ec.slice(2)) if (x.cls === 2 && x.tag === 1) point = bitsOf(D.children(x)[0]);
    if (!point) point = Buffer.from(c.getPublicKey(priv, false));
    return new KeyObject("private", "ec", { der: raw, curveOid, priv, point });
  }
  if (oid === OID.ed25519) {
    const priv = D.octets(D.read(inner));
    return new KeyObject("private", "ed25519", { der: raw, priv, point: Buffer.from(ed25519.getPublicKey(priv)) });
  }
  if (oid === OID.dsa) {
    const [p, q, g] = D.children(alg[1]).map(intOf);
    const x = intOf(D.read(inner));
    return new KeyObject("private", "dsa", { der: raw, p, q, g, x, y: modPow(g, x, p) });
  }
  return fail(`unsupported key algorithm ${oid}`, "ERR_OSSL_UNSUPPORTED");
}

function parseSpki(der) {
  const top = D.read(der);
  const [algSeq, bits] = D.children(top);
  const alg = D.children(algSeq);
  const oid = D.oidString(alg[0]);
  const pub = bitsOf(bits);
  if (oid === OID.rsa || oid === OID.rsaPss) {
    const [n, e] = D.children(D.read(pub)).map(intOf);
    return new KeyObject("public", oid === OID.rsa ? "rsa" : "rsa-pss", { n, e, spki: Buffer.from(der.subarray(0, top.end)) });
  }
  if (oid === OID.ec) {
    const curveOid = D.oidString(alg[1]);
    curveOf(curveOid).c.Point.fromBytes(pub); // validates the point
    return new KeyObject("public", "ec", { curveOid, point: Buffer.from(pub) });
  }
  if (oid === OID.ed25519) return new KeyObject("public", "ed25519", { point: Buffer.from(pub) });
  if (oid === OID.dsa) {
    const [p, q, g] = D.children(alg[1]).map(intOf);
    return new KeyObject("public", "dsa", { p, q, g, y: intOf(D.read(pub)) });
  }
  return fail(`unsupported key algorithm ${oid}`, "ERR_OSSL_UNSUPPORTED");
}

export function createPrivateKey(input) {
  const o = keyInput(input);
  if (o.key instanceof KeyObject) { if (o.key.type !== "private") fail("not a private key", "ERR_INVALID_ARG_VALUE"); return o.key; }
  let der;
  if (typeof o.key === "string" || (o.format || "pem") === "pem") {
    der = pemBody(buf(o.key).toString("latin1"), "PRIVATE KEY");
    if (!der) fail("unsupported private key encoding (PKCS#8 only)", "ERR_OSSL_UNSUPPORTED");
  } else {
    if (o.type && o.type !== "pkcs8") fail("only PKCS#8 private keys are supported", "ERR_OSSL_UNSUPPORTED");
    der = buf(o.key);
  }
  try { return parsePkcs8(der); } catch (e) { if (e.code) throw e; return fail(`error:1E08010C:DECODER routines::unsupported (${e.message})`, "ERR_OSSL_UNSUPPORTED"); }
}

export function createPublicKey(input) {
  const o = keyInput(input);
  if (o.key instanceof KeyObject) {
    const k = o.key;
    if (k.type === "public") return k;
    if (k.k.native) return parseSpki(k.k.spki);
    const { n, e, curveOid, point, p, q, g, y } = k.k;
    if (k.asymmetricKeyType === "rsa") return new KeyObject("public", "rsa", { n, e });
    if (k.asymmetricKeyType === "rsa-pss") return new KeyObject("public", "rsa-pss", { n, e, spki: D.seq(D.seq(D.oid(OID.rsaPss)), bitString(D.seq(intDer(n), intDer(e)))) });
    if (k.asymmetricKeyType === "ec") return new KeyObject("public", "ec", { curveOid, point });
    if (k.asymmetricKeyType === "ed25519") return new KeyObject("public", "ed25519", { point });
    if (k.asymmetricKeyType === "dsa") return new KeyObject("public", "dsa", { p, q, g, y });
  }
  let der;
  if (typeof o.key === "string" || (o.format || "pem") === "pem") {
    const s = buf(o.key).toString("latin1");
    der = pemBody(s, "PUBLIC KEY");
    if (!der) { const c = pemBody(s, "CERTIFICATE"); if (c) return new X509Certificate(c).publicKey; }
    if (!der) { const pk = pemBody(s, "PRIVATE KEY"); if (pk) return createPublicKey(parsePkcs8(pk)); }
    if (!der) fail("unsupported public key encoding", "ERR_OSSL_UNSUPPORTED");
  } else der = buf(o.key);
  try { return parseSpki(der); } catch (e) { if (e.code) throw e; return fail(`unsupported public key (${e.message})`, "ERR_OSSL_UNSUPPORTED"); }
}

/* ---------------- RSA ---------------- */
const digestInfos = (h, digest) => {
  const alg = D.oid(HASH_OID[h]);
  return [D.seq(D.seq(alg, D.nul()), D.octet(digest)), D.seq(D.seq(alg), D.octet(digest))];
};
function rsaPrivate(k, m) {
  if (!k.p || !k.q || !k.dp || !k.dq || !k.qi) return modPow(m, k.d, k.n);
  const m1 = modPow(m % k.p, k.dp, k.p), m2 = modPow(m % k.q, k.dq, k.q);
  let h = (k.qi * (m1 - m2)) % k.p;
  if (h < 0n) h += k.p;
  const s = m2 + h * k.q;
  if (modPow(s, k.e, k.n) !== m) return modPow(m, k.d, k.n); // fault check
  return s;
}
function rsaSignPkcs1(key, h, digest) {
  const k = key.k, len = Math.ceil(bitLen(k.n) / 8);
  const t = digestInfos(h, digest)[0];
  if (len < t.length + 11) fail("digest too big for rsa key", "ERR_OSSL_RSA_DIGEST_TOO_BIG_FOR_RSA_KEY");
  const em = Buffer.concat([Buffer.from([0, 1]), Buffer.alloc(len - t.length - 3, 0xff), Buffer.from([0]), t]);
  return bytesOf(rsaPrivate(k, big(em)), len);
}
function rsaVerifyPkcs1(key, h, digest, sig) {
  const k = key.k, len = Math.ceil(bitLen(k.n) / 8);
  if (sig.length !== len) return false;
  const s = big(sig);
  if (s >= k.n) return false;
  const em = bytesOf(modPow(s, k.e, k.n), len);
  if (!em) return false;
  return digestInfos(h, digest).some((t) => {
    if (len < t.length + 11) return false;
    return em.equals(Buffer.concat([Buffer.from([0, 1]), Buffer.alloc(len - t.length - 3, 0xff), Buffer.from([0]), t]));
  });
}
function mgf1(h, seed, len) {
  const out = [];
  for (let c = 0, n = 0; n < len; c++) { const d = digestOf(h, seed, Buffer.from([c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255, c & 255])); out.push(d); n += d.length; }
  return Buffer.concat(out).subarray(0, len);
}
function rsaVerifyPss(key, h, mHash, sig, saltLength) {
  const k = key.k, modBits = bitLen(k.n), len = Math.ceil(modBits / 8);
  if (sig.length !== len) return false;
  const s = big(sig);
  if (s >= k.n) return false;
  const emBits = modBits - 1, emLen = Math.ceil(emBits / 8);
  const em = bytesOf(modPow(s, k.e, k.n), emLen);
  const hLen = HASH[h].outputLen;
  if (!em || emLen < hLen + 2 || em[emLen - 1] !== 0xbc) return false;
  const masked = em.subarray(0, emLen - hLen - 1), H = em.subarray(emLen - hLen - 1, emLen - 1);
  const zeroBits = 8 * emLen - emBits;
  if (masked[0] & (0xff << (8 - zeroBits)) & 0xff) return false;
  const db = Buffer.from(mgf1(h, H, masked.length).map((b, i) => b ^ masked[i]));
  db[0] &= 0xff >> zeroBits;
  let i = 0;
  while (i < db.length && db[i] === 0) i++;
  if (i >= db.length || db[i] !== 1) return false;
  const salt = db.subarray(i + 1);
  if (saltLength === constants.RSA_PSS_SALTLEN_DIGEST) { if (salt.length !== hLen) return false; }
  else if (saltLength !== constants.RSA_PSS_SALTLEN_AUTO && saltLength !== undefined && salt.length !== saltLength) return false;
  return digestOf(h, Buffer.alloc(8), mHash, salt).equals(H);
}

/* ---------------- DSA ---------------- */
function dsaVerify(key, digest, sig) {
  const { p, q, g, y } = key.k;
  let r, s;
  try { [r, s] = D.children(D.read(sig)).map(intOf); } catch { return false; }
  if (!(r > 0n && r < q && s > 0n && s < q)) return false;
  const N = bitLen(q);
  let z = big(digest);
  if (digest.length * 8 > N) z >>= BigInt(digest.length * 8 - N);
  const w = modInv(s, q);
  const v = ((modPow(g, (z * w) % q, p) * modPow(y, (r * w) % q, p)) % p) % q;
  return v === r;
}

/* ---------------- sign / verify ---------------- */
function signDigest(key, h, digest, o) {
  if (key.k.native) fail("native keys sign whole messages only", "ERR_OSSL_UNSUPPORTED");
  switch (key.asymmetricKeyType) {
    case "rsa":
      if (o.padding !== undefined && o.padding !== constants.RSA_PKCS1_PADDING) fail("only PKCS#1 v1.5 signing is supported", "ERR_OSSL_UNSUPPORTED");
      return rsaSignPkcs1(key, h, digest);
    case "ec": {
      const { c } = curveOf(key.k.curveOid);
      const format = o.dsaEncoding === "ieee-p1363" ? "compact" : "der";
      return Buffer.from(c.sign(digest, key.k.priv, { prehash: false, format, extraEntropy: true }));
    }
    default: return fail(`signing with ${key.asymmetricKeyType} keys is not supported`, "ERR_OSSL_UNSUPPORTED");
  }
}
function verifyDigest(key, h, digest, sig, o) {
  switch (key.asymmetricKeyType) {
    case "rsa": case "rsa-pss":
      return o.padding === constants.RSA_PKCS1_PSS_PADDING || key.asymmetricKeyType === "rsa-pss"
        ? rsaVerifyPss(key, h, digest, sig, o.saltLength ?? constants.RSA_PSS_SALTLEN_AUTO)
        : rsaVerifyPkcs1(key, h, digest, sig);
    case "ec": {
      const { c } = curveOf(key.k.curveOid);
      try { return c.verify(sig, digest, key.k.point, { prehash: false, lowS: false, format: o.dsaEncoding === "ieee-p1363" ? "compact" : "der" }); }
      catch { return false; }
    }
    case "dsa": return dsaVerify(key, digest, sig);
    default: return fail(`verifying with ${key.asymmetricKeyType} keys needs crypto.verify(null, …)`, "ERR_OSSL_UNSUPPORTED");
  }
}
const keyOpts = (o, priv) => {
  const ko = keyInput(o);
  const key = priv ? createPrivateKey(ko.key instanceof KeyObject ? ko.key : ko) : (ko.key instanceof KeyObject ? (ko.key.type === "private" ? createPublicKey(ko.key) : ko.key) : createPublicKey(ko));
  return { key, padding: ko.padding, saltLength: ko.saltLength, dsaEncoding: ko.dsaEncoding };
};

export function sign(alg, data, keyIn) {
  const o = keyOpts(keyIn, true);
  if (o.key.k.native) {
    if (o.padding !== undefined && o.padding !== constants.RSA_PKCS1_PADDING) fail("native keys sign PKCS#1 v1.5 only", "ERR_OSSL_UNSUPPORTED");
    if (o.dsaEncoding === "ieee-p1363") fail("native keys sign DER ECDSA only", "ERR_OSSL_UNSUPPORTED");
    return Buffer.from(o.key.k.native.sign(hashName(alg || "sha256"), buf(data), o.key.k.spki));
  }
  if (o.key.asymmetricKeyType === "ed25519") {
    if (alg) fail("Ed25519 takes no digest", "ERR_CRYPTO_INVALID_DIGEST");
    return Buffer.from(ed25519.sign(buf(data), o.key.k.priv));
  }
  const h = hashName(alg || "sha256");
  return signDigest(o.key, h, digestOf(h, data), o);
}

export function verify(alg, data, keyIn, signature) {
  const o = keyOpts(keyIn, false);
  const sig = buf(signature);
  if (o.key.asymmetricKeyType === "ed25519") {
    try { return ed25519.verify(sig, buf(data), o.key.k.point, { zip215: false }); } catch { return false; }
  }
  const h = hashName(alg || "sha256");
  return verifyDigest(o.key, h, digestOf(h, data), sig, o);
}

export function createVerify(alg) {
  const h = hashName(alg);
  const hasher = HASH[h].create();
  return {
    update(d, enc) { hasher.update(typeof d === "string" ? Buffer.from(d, enc || "utf8") : buf(d)); return this; },
    verify(keyIn, signature, enc) {
      const o = keyOpts(keyIn, false);
      const sig = typeof signature === "string" ? Buffer.from(signature, enc || "utf8") : buf(signature);
      return verifyDigest(o.key, h, Buffer.from(hasher.digest()), sig, o);
    },
  };
}

export function createSign(alg) {
  const h = hashName(alg);
  const hasher = HASH[h].create();
  return {
    update(d, enc) { hasher.update(typeof d === "string" ? Buffer.from(d, enc || "utf8") : buf(d)); return this; },
    sign(keyIn, enc) { const o = keyOpts(keyIn, true); const s = signDigest(o.key, h, Buffer.from(hasher.digest()), o); return enc ? s.toString(enc) : s; },
  };
}

/* ---------------- X.509 ---------------- */
const X509_SIG = {
  "1.2.840.113549.1.1.4": ["rsa", "md5"], "1.2.840.113549.1.1.5": ["rsa", "sha1"], "1.2.840.113549.1.1.14": ["rsa", "sha224"],
  "1.2.840.113549.1.1.11": ["rsa", "sha256"], "1.2.840.113549.1.1.12": ["rsa", "sha384"], "1.2.840.113549.1.1.13": ["rsa", "sha512"],
  "1.2.840.113549.1.1.10": ["pss"],
  "1.2.840.10045.4.1": ["ec", "sha1"], "1.2.840.10045.4.3.1": ["ec", "sha224"], "1.2.840.10045.4.3.2": ["ec", "sha256"],
  "1.2.840.10045.4.3.3": ["ec", "sha384"], "1.2.840.10045.4.3.4": ["ec", "sha512"],
  "1.2.840.10040.4.3": ["dsa", "sha1"], "2.16.840.1.101.3.4.3.2": ["dsa", "sha256"],
  "1.3.101.112": ["ed25519"],
};
const HASH_BY_OID = Object.fromEntries(Object.entries(HASH_OID).map(([k, v]) => [v, k]));

export class X509Certificate {
  constructor(input) {
    let der = buf(input);
    if (der.subarray(0, 11).toString("latin1") === "-----BEGIN ") der = pemBody(der.toString("latin1"), "CERTIFICATE") || fail("not a certificate", "ERR_OSSL_PEM_NO_START_LINE");
    let parts;
    try {
      const top = D.read(der);
      const [tbs, alg, sig] = D.children(top);
      const f = D.children(tbs);
      const i = f[0].cls === 2 && f[0].tag === 0 ? 1 : 0;
      parts = { raw: Buffer.from(der.subarray(0, top.end)), tbs: Buffer.from(D.raw(tbs)), alg: D.children(alg), sig: Buffer.from(bitsOf(sig)), spki: Buffer.from(D.raw(f[i + 5])) };
    } catch (e) { fail(`error:0680007B:asn1 encoding routines::header too long (${e.message})`, "ERR_OSSL_ASN1_HEADER_TOO_LONG"); }
    this.raw = parts.raw;
    Object.defineProperty(this, "_p", { value: parts });
    this.publicKey = createPublicKey({ key: parts.spki, format: "der", type: "spki" });
  }
  verify(publicKey) {
    const { tbs, alg, sig } = this._p;
    const a = X509_SIG[D.oidString(alg[0])];
    if (!a) return false;
    const key = publicKey instanceof KeyObject ? publicKey : createPublicKey(publicKey);
    try {
      if (a[0] === "ed25519") return verify(null, tbs, key, sig);
      if (a[0] === "pss") {
        let h = "sha1", salt = 20;
        const params = alg[1];
        if (params && D.is(params, 16)) {
          for (const p of D.children(params)) {
            if (p.cls === 2 && p.tag === 0) h = HASH_BY_OID[D.oidString(D.children(D.children(p)[0])[0])] || h;
            if (p.cls === 2 && p.tag === 2) salt = Number(intOf(D.children(p)[0]));
          }
        }
        return verifyDigest(key, h, digestOf(h, tbs), sig, { padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: salt });
      }
      return verifyDigest(key, a[1], digestOf(a[1], tbs), sig, { padding: constants.RSA_PKCS1_PADDING, dsaEncoding: "der" });
    } catch { return false; }
  }
  get fingerprint256() { return digestOf("sha256", this.raw).toString("hex").toUpperCase().match(/.{2}/g).join(":"); }
}

/* ---------------- key generation ---------------- */
async function generateRsa(bits, exponent) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const kp = await subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: bits, publicExponent: Uint8Array.from(bytesOf(BigInt(exponent))), hash: "SHA-256" },
      true, ["sign", "verify"]);
    const privateKey = createPrivateKey({ key: Buffer.from(await subtle.exportKey("pkcs8", kp.privateKey)), format: "der", type: "pkcs8" });
    return { privateKey, publicKey: createPublicKey(privateKey) };
  }
  const kp = await new Promise((res, rej) => forge.pki.rsa.generateKeyPair({ bits, e: exponent, workers: -1 }, (e, k) => (e ? rej(e) : res(k))));
  const der = Buffer.from(forge.asn1.toDer(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(kp.privateKey))).getBytes(), "binary");
  const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  return { privateKey, publicKey: createPublicKey(privateKey) };
}
async function generate(type, o = {}) {
  if (type !== "rsa") fail(`generateKeyPair: only "rsa" is supported here (got ${type})`, "ERR_OSSL_UNSUPPORTED");
  return generateRsa(o.modulusLength || 2048, o.publicExponent || 0x10001);
}
export function generateKeyPair(type, o, cb) {
  generate(type, o).then((r) => cb(null, r.publicKey, r.privateKey), (e) => cb(e));
}
generateKeyPair[Symbol.for("nodejs.util.promisify.custom")] = generate;

/* ---------------- AES-256-GCM (seal.js file protection) ---------------- */
const bin = (b) => buf(b).toString("binary");
const unbin = (s) => Buffer.from(s, "binary");
export function createCipheriv(alg, key, iv) {
  if (String(alg).toLowerCase() !== "aes-256-gcm") fail(`Unsupported cipher ${alg}`, "ERR_CRYPTO_UNKNOWN_CIPHER");
  const c = forge.cipher.createCipher("AES-GCM", bin(key));
  c.start({ iv: bin(iv), tagLength: 128 });
  let tag = null;
  return {
    update(d) { c.update(forge.util.createBuffer(bin(d))); return unbin(c.output.getBytes()); },
    final() { c.finish(); const out = unbin(c.output.getBytes()); tag = unbin(c.mode.tag.getBytes()); return out; },
    getAuthTag() { if (!tag) fail("getAuthTag before final", "ERR_CRYPTO_INVALID_STATE"); return tag; },
  };
}
export function createDecipheriv(alg, key, iv) {
  if (String(alg).toLowerCase() !== "aes-256-gcm") fail(`Unsupported cipher ${alg}`, "ERR_CRYPTO_UNKNOWN_CIPHER");
  let tag = null;
  const chunks = [];
  return {
    setAuthTag(t) { tag = buf(t); return this; },
    update(d) { chunks.push(Buffer.from(buf(d))); return Buffer.alloc(0); },
    final() {
      if (!tag) fail("Unsupported state or unable to authenticate data");
      const d = forge.cipher.createDecipher("AES-GCM", bin(key));
      d.start({ iv: bin(iv), tag: forge.util.createBuffer(bin(tag)), tagLength: tag.length * 8 });
      d.update(forge.util.createBuffer(bin(Buffer.concat(chunks))));
      if (!d.finish()) fail("Unsupported state or unable to authenticate data");
      return unbin(d.output.getBytes());
    },
  };
}

export default {
  constants, createHash, randomBytes, createPrivateKey, createPublicKey, sign, verify, createVerify, createSign,
  X509Certificate, generateKeyPair, createCipheriv, createDecipheriv, KeyObject, registerNative, nativeHandle, NATIVE_KEY_OID,
};
export { KeyObject };
