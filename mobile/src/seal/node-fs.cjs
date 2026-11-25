// node:fs for the seal bundle. desktop/src/seal.js only uses fs.promises (readFile, writeFile,
// rename, rm, mkdir) inside its seal folder. Every path is "/<mount>/seal/<file>"; the mount names
// a storage backend registered by entry.js (Android: the SealworksSeal Kotlin plugin, via the
// worker; tests: an in-memory map). Backend: { readFile(rel) -> Uint8Array (rejects with code
// ENOENT when missing), writeFile(rel, bytes), rename(fromRel, toRel), rm(rel), mkdir(rel) }.
const { Buffer } = require("buffer");

const mounts = new Map();
function mount(name, backend) { mounts.set(name, backend); }

function split(p) {
  const m = /^\/([^/]+)\/(.+)$/.exec(String(p));
  const b = m && mounts.get(m[1]);
  if (!b) { const e = new Error(`ENOENT: no such file or directory, '${p}'`); e.code = "ENOENT"; throw e; }
  if (m[2].split("/").some((s) => s === ".." || s === "." || s === "")) { const e = new Error(`EINVAL: bad path '${p}'`); e.code = "EINVAL"; throw e; }
  return [b, m[2]];
}
const toBytes = (data) => (typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data.buffer, data.byteOffset, data.byteLength));

const promises = {
  async readFile(p, opt) {
    const [b, rel] = split(p);
    const bytes = Buffer.from(await b.readFile(rel));
    const enc = typeof opt === "string" ? opt : opt?.encoding;
    return enc ? bytes.toString(enc) : bytes;
  },
  async writeFile(p, data) { const [b, rel] = split(p); await b.writeFile(rel, new Uint8Array(toBytes(data))); },
  async rename(from, to) {
    const [b, a] = split(from), [b2, c] = split(to);
    if (b !== b2) { const e = new Error("EXDEV: cross-mount rename"); e.code = "EXDEV"; throw e; }
    await b.rename(a, c);
  },
  async rm(p, o) {
    const [b, rel] = split(p);
    try { await b.rm(rel); } catch (e) { if (!(o?.force && e?.code === "ENOENT")) throw e; }
  },
  async mkdir(p) { const [b, rel] = split(p); await b.mkdir(rel); },
};

module.exports = { promises, mount };
