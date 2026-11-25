"use strict";
// desktop.seal: the sealer identity (private key + certificate) kept in <data store>/seal/, and
// sealing / verifying PDFs. The private key never leaves the main process.
//
// <store>/seal/
//   identity.json   { version, name, org?, email?, createdAt, imported, protected }
//   cert.pem        signer certificate; chain.pem: further certificates from an imported .p12
//   key.bin         PKCS#8 private key, encrypted:
//                     protected "os":   Electron safeStorage (macOS Keychain, Windows DPAPI, libsecret)
//                     protected "file": AES-256-GCM with the random key in key.secret (used when
//                                       safeStorage is unavailable, e.g. Linux without a keyring, CI,
//                                       and under PDFE_HOME_OVERRIDE unless PDFE_SEAL_SAFESTORAGE=1)
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const pdfsig = require("./pdfsig");
const pki = require("./pki");

// `key` names the reason; seal.js turns it into a short localized message
const err = (code, message, key) => Object.assign(new Error(`${code}: ${message}`), { code, key });
const MAGIC_OS = Buffer.from("PDFEK1O\n"), MAGIC_FILE = Buffer.from("PDFEK1F\n");
const DEFAULT_REASON = { ko: "Sealworks로 봉인함", en: "Sealed with Sealworks" };

// Rejections are "CODE: message" with CODE one of EPASSWORD, ENOENT, EEXIST, EINVAL, EIO and a short
// message in the last setLanguage() language (the page shows it inside its own sentence).
const MSG = {
  password: ["EPASSWORD", "비밀번호가 맞지 않습니다", "wrong password"],
  noIdentity: ["ENOENT", "봉인하는 사람 정보가 아직 없습니다", "there is no sealer identity yet"],
  exists: ["EEXIST", "봉인하는 사람 정보가 이미 있습니다", "a sealer identity already exists"],
  notPdf: ["EINVAL", "읽을 수 있는 PDF가 아닙니다", "not a readable PDF"],
  notBytes: ["EINVAL", "파일 내용이 없습니다", "no file data"],
  encrypted: ["EINVAL", "암호가 걸린 PDF는 봉인할 수 없습니다", "password-protected PDFs can't be sealed"],
  tooBig: ["EINVAL", "300MB가 넘는 PDF는 다룰 수 없습니다", "PDFs over 300 MB aren't supported"],
  noPages: ["EINVAL", "페이지가 없는 PDF입니다", "the PDF has no pages"],
  notP12: ["EINVAL", ".p12/.pfx 인증서 파일이 아니거나 읽을 수 없습니다", "not a readable .p12/.pfx certificate file"],
  p12Incomplete: ["EINVAL", "인증서 파일에 인증서나 개인 키가 없습니다", "the certificate file lacks a certificate or private key"],
  p12Mismatch: ["EINVAL", "인증서와 개인 키가 짝이 맞지 않습니다", "the certificate doesn't match its private key"],
  badCert: ["EINVAL", "인증서를 읽을 수 없습니다", "the certificate can't be read"],
  keyType: ["EINVAL", "지원하지 않는 키 종류입니다 (RSA·EC만 가능)", "unsupported key type (RSA or EC only)"],
  certExpired: ["EINVAL", "만료된 인증서입니다", "the certificate has expired"],
  identityExpired: ["EIO", "봉인 인증서가 만료되었습니다. 새로 만들어 주세요", "the sealer certificate has expired; make a new one"],
  needName: ["EINVAL", "이름을 적어 주세요", "a name is required"],
  needPassword: ["EINVAL", "비밀번호를 정해 주세요", "a password is required"],
  badEmail: ["EINVAL", "이메일 주소가 올바르지 않습니다", "not a valid e-mail address"],
  tooLong: ["EINVAL", "입력이 너무 깁니다", "the text is too long"],
  badText: ["EINVAL", "입력이 올바르지 않습니다", "invalid input"],
  key: ["EIO", "봉인 키를 열 수 없습니다", "the sealer key can't be unlocked"],
  io: ["EIO", "봉인 정보를 저장하거나 읽지 못했습니다", "the sealer identity couldn't be saved or read"],
};
const CODES = new Set(["EPASSWORD", "ENOENT", "EEXIST", "EINVAL", "EIO"]);
function localize(e, lang) {
  const m = MSG[e?.key] || (CODES.has(e?.code) ? null : MSG.io);
  if (!m) return e;
  const out = new Error(`${m[0]}: ${lang === "ko" ? m[1] : m[2]}`);
  out.code = m[0];
  out.detail = String(e?.message || e); // the English specifics, for logs
  return out;
}

const pemOf = (d) => `-----BEGIN CERTIFICATE-----\n${d.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----\n`;
const dersOf = (pem) => [...String(pem).matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g)].map((m) => Buffer.from(m[1].replace(/\s+/g, ""), "base64"));
const toBuffer = (b, what) => {
  if (b instanceof Uint8Array) return Buffer.from(b.buffer, b.byteOffset, b.byteLength);
  if (b instanceof ArrayBuffer) return Buffer.from(b);
  throw err("EINVAL", `${what} must be bytes`, "notBytes");
};
function cleanText(v, what, max, required = false) {
  if (v === undefined || v === null || v === "") { if (required) throw err("EINVAL", `${what} is required`, what === "name" ? "needName" : "badText"); return undefined; }
  if (typeof v !== "string") throw err("EINVAL", `${what} must be a string`, "badText");
  // eslint-disable-next-line no-control-regex
  const s = v.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!s) { if (required) throw err("EINVAL", `${what} is required`, what === "name" ? "needName" : "badText"); return undefined; }
  if ([...s].length > max) throw err("EINVAL", `${what} is longer than ${max} characters`, "tooLong");
  return s;
}

/** a Uint8Array that owns exactly its bytes (a Buffer may be a view into a shared pool, and IPC copies the whole pool) */
const exact = (b) => (b.byteOffset === 0 && b.buffer.byteLength === b.byteLength ? new Uint8Array(b.buffer) : new Uint8Array(b));

async function writeAtomic(file, data, mode = 0o600) {
  const tmp = `${file}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fsp.writeFile(tmp, data, { mode });
  await fsp.rename(tmp, file);
}

/**
 * @param {{ dir: string, safeStorage?: Electron.SafeStorage, useOs?: boolean, appVersion?: string }} o
 */
function createSeal({ dir, safeStorage, useOs = true, appVersion = "", lang = () => "en" }) {
  const file = (n) => path.join(dir, n);
  let cached = null; // { fingerprint, key }

  function osProtectionAvailable() {
    if (!useOs || !safeStorage) return false;
    try {
      if (!safeStorage.isEncryptionAvailable()) return false;
      if (process.platform === "linux" && typeof safeStorage.getSelectedStorageBackend === "function") {
        return !["basic_text", "unknown"].includes(safeStorage.getSelectedStorageBackend());
      }
      return true;
    } catch { return false; }
  }

  async function encryptKey(keyDer) {
    if (osProtectionAvailable()) {
      try {
        const blob = safeStorage.encryptString(keyDer.toString("base64"));
        return { protected: "os", blob: Buffer.concat([MAGIC_OS, blob]) };
      } catch { /* fall back to a key file */ }
    }
    const secret = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", secret, iv);
    const ct = Buffer.concat([c.update(keyDer), c.final()]);
    return { protected: "file", secret, blob: Buffer.concat([MAGIC_FILE, iv, c.getAuthTag(), ct]) };
  }

  async function decryptKey(blob) {
    if (blob.subarray(0, MAGIC_OS.length).equals(MAGIC_OS)) {
      if (!safeStorage) throw err("EIO", "the sealer key is protected by the system keychain, which is not available", "key");
      try { return Buffer.from(safeStorage.decryptString(blob.subarray(MAGIC_OS.length)), "base64"); }
      catch (e) { throw err("EIO", `the system keychain did not unlock the sealer key (${String(e?.message || e).slice(0, 120)})`, "key"); }
    }
    if (blob.subarray(0, MAGIC_FILE.length).equals(MAGIC_FILE)) {
      const secret = await fsp.readFile(file("key.secret")).catch(() => { throw err("EIO", "the sealer key file key.secret is missing", "key"); });
      const b = blob.subarray(MAGIC_FILE.length);
      try {
        const d = crypto.createDecipheriv("aes-256-gcm", secret, b.subarray(0, 12));
        d.setAuthTag(b.subarray(12, 28));
        return Buffer.concat([d.update(b.subarray(28)), d.final()]);
      } catch { throw err("EIO", "the sealer key could not be decrypted", "key"); }
    }
    throw err("EIO", "unknown sealer key format", "key");
  }

  /** identity.json + cert.pem -> full record, or null */
  async function load() {
    let meta, certPem;
    try {
      meta = JSON.parse(await fsp.readFile(file("identity.json"), "utf8"));
      certPem = await fsp.readFile(file("cert.pem"), "utf8");
    } catch { return null; }
    const [certDer] = dersOf(certPem);
    if (!certDer) return null;
    let ci;
    try { ci = pdfsig.certInfo(certDer); } catch { return null; }
    const chainDers = dersOf(await fsp.readFile(file("chain.pem"), "utf8").catch(() => ""));
    return { meta, certDer, chainDers, ci };
  }

  function publicIdentity(rec) {
    const { meta, ci } = rec;
    const out = { name: meta.name || ci.name || "", fingerprint: ci.fingerprint, createdAt: meta.createdAt, notAfter: ci.notAfter, imported: !!meta.imported, protected: meta.protected };
    const org = meta.org ?? ci.org, email = meta.email ?? ci.email;
    if (org) out.org = org;
    if (email) out.email = email;
    return out;
  }

  async function save({ keyDer, certDer, chainDers = [], meta }) {
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    const enc = await encryptKey(keyDer);
    cached = null;
    if (enc.secret) await writeAtomic(file("key.secret"), enc.secret);
    await writeAtomic(file("key.bin"), enc.blob);
    if (!enc.secret) await fsp.rm(file("key.secret"), { force: true });
    await writeAtomic(file("cert.pem"), pemOf(certDer), 0o644);
    if (chainDers.length) await writeAtomic(file("chain.pem"), chainDers.map(pemOf).join(""), 0o644);
    else await fsp.rm(file("chain.pem"), { force: true });
    await writeAtomic(file("identity.json"), JSON.stringify({ version: 1, ...meta, protected: enc.protected }, null, 2) + "\n", 0o644);
    return publicIdentity(await load());
  }

  async function unlock(rec) {
    if (cached && cached.fingerprint === rec.ci.fingerprint) return cached.key;
    const blob = await fsp.readFile(file("key.bin")).catch(() => { throw err("EIO", "the sealer's private key is missing", "key"); });
    const keyDer = await decryptKey(blob);
    let key;
    try { key = crypto.createPrivateKey({ key: keyDer, format: "der", type: "pkcs8" }); }
    catch { throw err("EIO", "the sealer's private key is damaged", "key"); }
    if (!pki.checkKeyPair(key, rec.certDer)) throw err("EIO", "the sealer's private key does not match its certificate", "key");
    cached = { fingerprint: rec.ci.fingerprint, key };
    return key;
  }

  const api = {
    async identity() {
      const rec = await load();
      return rec ? publicIdentity(rec) : null;
    },

    async createIdentity(o = {}) {
      const name = cleanText(o?.name, "name", 64, true);
      const org = cleanText(o?.org, "org", 64);
      const email = cleanText(o?.email, "email", 128);
      if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) throw err("EINVAL", "email is not an e-mail address", "badEmail");
      if (email && /[^\x20-\x7e]/.test(email)) throw err("EINVAL", "email must be plain ASCII", "badEmail");
      if (!o?.replace && (await load())) throw err("EEXIST", "a sealer identity already exists (pass { replace: true } to make a new one)", "exists");
      const { keyDer, certDer } = await pki.createSelfSigned({ name, org, email });
      const meta = { name, createdAt: Date.now(), imported: false };
      if (org) meta.org = org;
      if (email) meta.email = email;
      return save({ keyDer, certDer, meta });
    },

    async exportIdentity(o = {}) {
      const password = o?.password;
      if (typeof password !== "string" || !password) throw err("EINVAL", "a password is required", "needPassword");
      const rec = await load();
      if (!rec) throw err("ENOENT", "there is no sealer identity to back up", "noIdentity");
      const key = await unlock(rec);
      const p12 = pki.exportP12({
        keyDer: key.export({ type: "pkcs8", format: "der" }), certDer: rec.certDer, chainDers: rec.chainDers,
        password, friendlyName: `${rec.meta.name || rec.ci.name} (Sealworks)`,
      });
      return exact(p12);
    },

    /** Replaces the current identity with the one in a .p12/.pfx (a backup, or the user's own certificate). */
    async importIdentity(bytes, o = {}) {
      const buf = toBuffer(bytes, "the .p12/.pfx file");
      if (buf.length > 1024 * 1024) throw err("EINVAL", "a .p12/.pfx over 1 MB is not a certificate file", "notP12");
      const { keyDer, certDer, chainDers } = pki.importP12(buf, typeof o?.password === "string" ? o.password : "");
      const d = pki.describeCert(certDer);
      if (d.notAfter && d.notAfter < Date.now()) throw err("EINVAL", `the certificate expired on ${new Date(d.notAfter).toISOString().slice(0, 10)}`, "certExpired");
      const meta = { name: d.name || "?", createdAt: d.ours ? (d.notBefore ?? Date.now()) : Date.now(), imported: !d.ours };
      if (d.org) meta.org = d.org;
      if (d.email) meta.email = d.email;
      return save({ keyDer, certDer, chainDers, meta });
    },

    async removeIdentity() {
      cached = null;
      for (const n of ["identity.json", "key.bin", "key.secret", "cert.pem", "chain.pem"]) await fsp.rm(file(n), { force: true });
    },

    async sign(pdf, o = {}) {
      const bytes = toBuffer(pdf, "pdf");
      const rec = await load();
      if (!rec) throw err("ENOENT", "create a sealer identity first", "noIdentity");
      if (rec.ci.notAfter && rec.ci.notAfter < Date.now()) throw err("EIO", "the sealer certificate has expired; make a new one", "identityExpired");
      const key = await unlock(rec);
      const lang = o?.lang === "en" ? "en" : "ko";
      const out = await pdfsig.signPdf(bytes, {
        certDer: rec.certDer, chainDers: rec.chainDers, key,
        name: rec.meta.name || rec.ci.name,
        reason: cleanText(o?.reason, "reason", 200) ?? DEFAULT_REASON[lang],
        location: cleanText(o?.location, "location", 200),
        appName: "Sealworks", appVersion,
      });
      return exact(out);
    },

    async verify(pdf) {
      const bytes = toBuffer(pdf, "pdf");
      const rec = await load().catch(() => null);
      return pdfsig.verifyPdf(bytes, { myFingerprint: rec?.ci.fingerprint });
    },
  };
  // every member rejects with a localized "CODE: message"
  const wrapped = {};
  for (const [k, fn] of Object.entries(api)) {
    wrapped[k] = async (...a) => { try { return await fn(...a); } catch (e) { throw localize(e, lang()); } };
  }
  return wrapped;
}

module.exports = { createSeal };
