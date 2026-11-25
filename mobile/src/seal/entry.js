// The seal bundle (www/seal/seal-core.js, global `SealworksSeal`): desktop/src/seal.js unchanged,
// with its Node dependencies replaced (see node-*.cjs, node-crypto.js), and the Android key store
// plugged in where Electron's safeStorage sits on desktop.
//
// The private key lives in Kotlin (SealKeys.kt), never in the page and, at rest, never in JS:
//   - seal.js hands a new key (createIdentity / importIdentity) to safeStorage.encryptString; that
//     only parks it in this worker and returns a placeholder blob. When seal.js writes that blob
//     to seal/key.bin(.tmp), the storage wrapper below sends the PKCS#8 to native `storeKey`,
//     which encrypts it with a non-exportable AES-256-GCM key in the Android Keystore and writes
//     key.bin itself ("PDFEK1O\n" + "SWKS2\n" + public key + IV + ciphertext).
//   - safeStorage.decryptString(key.bin) returns a *handle* PKCS#8 (public key + native registry
//     number, see node-crypto.js), so seal.js "unlocks" a KeyObject whose sign() asks native to
//     decrypt the key and sign (SHA256withRSA / SHA256withECDSA) the CMS signed attributes.
//   - exportIdentity's key.export() asks native for the PKCS#8 once, only right after the user
//     picked where the .p12 goes in the system save panel (an export ticket), like the desktop
//     shell writes the backup only to a place the user chose.
// The worker sees a plaintext key only while creating, importing or exporting an identity.
import { Buffer } from "buffer";
import forge from "node-forge";
import { mount } from "./node-fs.cjs";
import nodeCrypto from "./node-crypto.js";
import { createSeal } from "../../../desktop/src/seal.js";
import pdfsig from "../../../desktop/src/pdfsig.js";
import pki from "../../../desktop/src/pki.js";

const MAGIC_OS = Buffer.from("PDFEK1O\n"); // seal.js's own frame for safeStorage blobs
const PARKED = Buffer.from("SWKH1\n"); // placeholder: a key parked in this worker
const STORED = Buffer.from("SWKS2\n"); // written by native storeKey

const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const nativeError = (msg) => {
  const m = /^(E[A-Z0-9]+): ?([\s\S]*)$/.exec(String(msg || "EIO: native key store failed"));
  // "key" makes seal.js answer with its localized "the sealer key can't be unlocked"
  return Object.assign(new Error(m ? `${m[1]}: ${m[2]}` : `EIO: ${msg}`), { code: m ? m[1] : "EIO", key: "key" });
};

/**
 * The native key store over a synchronous request function (the worker uses a synchronous
 * XMLHttpRequest to https://localhost/_sealworks/<op>, answered in Kotlin by SealKeys.kt; the Node
 * test simulates the same endpoints). requestSync(op, params) -> { ok, text }.
 */
export function httpNative(requestSync) {
  const call = (op, params) => {
    const r = requestSync(op, params);
    if (!r.ok) throw nativeError(r.text);
    return r.text;
  };
  const fp = (spki) => nodeCrypto.createHash("sha256").update(spki).digest("hex");
  return {
    storeKey: (rel, pkcs8, spki) => { call("store", { path: rel, k: b64u(pkcs8), p: b64u(spki) }); },
    sign: (hash, data, spki) => Buffer.from(call("sign", { alg: hash, d: b64u(data), fp: fp(spki) }), "base64"),
    exportKey: (spki) => Buffer.from(call("export", { fp: fp(spki) }), "base64"),
  };
}

/** safeStorage look-alike: parks new keys, opens stored ones as native handles. */
function nativeSafeStorage(native) {
  const id = nodeCrypto.registerNative(native);
  const parked = new Map();
  return {
    parked,
    isEncryptionAvailable: () => true,
    encryptString(b64) {
      const h = nodeCrypto.randomBytes(16).toString("hex");
      parked.set(h, String(b64));
      return Buffer.concat([PARKED, Buffer.from(h)]);
    },
    decryptString(blob) {
      const b = Buffer.from(blob);
      if (!b.subarray(0, STORED.length).equals(STORED)) throw new Error("not a key stored by this app");
      const n = b.readUInt16BE(STORED.length);
      const spki = b.subarray(STORED.length + 2, STORED.length + 2 + n);
      if (spki.length !== n) throw new Error("damaged key file");
      return nodeCrypto.nativeHandle(id, spki).toString("base64");
    },
  };
}

/** storage that hands parked keys to native instead of writing the placeholder */
function keyAwareStorage(storage, safe, native) {
  const prefix = Buffer.concat([MAGIC_OS, PARKED]);
  return {
    ...storage,
    readFile: (p) => storage.readFile(p),
    async writeFile(p, bytes) {
      const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (!b.subarray(0, prefix.length).equals(prefix)) return storage.writeFile(p, bytes);
      const h = b.subarray(prefix.length).toString("latin1");
      const b64 = safe.parked.get(h);
      safe.parked.delete(h);
      if (!b64) throw nativeError("EIO: the new key is gone");
      const pkcs8 = Buffer.from(b64, "base64");
      try {
        const spki = nodeCrypto.createPublicKey(nodeCrypto.createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" })).export({ type: "spki", format: "der" });
        await native.storeKey(p, pkcs8, spki);
      } finally { pkcs8.fill(0); }
    },
  };
}

let mounts = 0;
/**
 * @param {{ storage: { readFile, writeFile, rename, rm, mkdir }, native?: ReturnType<typeof httpNative> | null,
 *           lang?: () => "ko" | "en", appVersion?: string }} o
 * storage paths are "seal/<file>" (see node-fs.cjs). Without `native` (tests only) seal.js uses
 * its own "file" protection (random key file next to key.bin), as on desktop without a keyring.
 */
export function createAndroidSeal({ storage, native = null, lang = () => "en", appVersion = "" }) {
  const name = `m${++mounts}`;
  if (!native) {
    mount(name, storage);
    return createSeal({ dir: `/${name}/seal`, useOs: false, appVersion, lang });
  }
  const safe = nativeSafeStorage(native);
  mount(name, keyAwareStorage(storage, safe, native));
  return createSeal({ dir: `/${name}/seal`, safeStorage: safe, useOs: true, appVersion, lang });
}

/** in-memory storage backend (tests) */
export function memoryStorage() {
  const files = new Map();
  const enoent = (p) => Object.assign(new Error(`ENOENT: no such file or directory, '${p}'`), { code: "ENOENT" });
  return {
    files,
    async readFile(p) { if (!files.has(p)) throw enoent(p); return new Uint8Array(files.get(p)); },
    async writeFile(p, b) { files.set(p, new Uint8Array(b)); },
    async rename(a, b) { if (!files.has(a)) throw enoent(a); files.set(b, files.get(a)); files.delete(a); },
    async rm(p) { if (!files.delete(p)) throw enoent(p); },
    async mkdir() {},
  };
}

export { pdfsig, pki, nodeCrypto as crypto, Buffer, forge };
