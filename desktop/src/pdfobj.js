"use strict";
// Tolerant reader for single PDF objects at byte offsets, for signature verification. It works on
// the raw file (no xref, no streams), so it sees exactly the bytes a signature covers, and records
// the offsets of every value (a signature's /Contents must sit exactly in its ByteRange gap).

const isWs = (c) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
const isDelim = (c) => c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25;
const isDigit = (c) => c >= 0x30 && c <= 0x39;
const MAX_DEPTH = 64;

class PdfSyntaxError extends Error {}
const fail = (m) => { throw new PdfSyntaxError(`pdf: ${m}`); };

class Parser {
  constructor(buf, pos, end = buf.length) { this.buf = buf; this.pos = pos; this.end = end; }

  skip() {
    const b = this.buf;
    while (this.pos < this.end) {
      const c = b[this.pos];
      if (isWs(c)) this.pos++;
      else if (c === 0x25) { while (this.pos < this.end && b[this.pos] !== 10 && b[this.pos] !== 13) this.pos++; }
      else break;
    }
  }

  regular() {
    const s = this.pos;
    while (this.pos < this.end && !isWs(this.buf[this.pos]) && !isDelim(this.buf[this.pos])) this.pos++;
    return this.buf.toString("latin1", s, this.pos);
  }

  value(depth = 0) {
    if (depth > MAX_DEPTH) fail("nested too deeply");
    this.skip();
    if (this.pos >= this.end) fail("unexpected end");
    const b = this.buf, start = this.pos, c = b[start];
    if (c === 0x3c && b[start + 1] === 0x3c) return this.dict(depth);
    if (c === 0x3c) return this.hex();
    if (c === 0x28) return this.literal();
    if (c === 0x5b) return this.array(depth);
    if (c === 0x2f) return this.name();
    if (isDigit(c) || c === 0x2b || c === 0x2d || c === 0x2e) return this.numberOrRef();
    const kw = this.regular();
    if (!kw) fail(`unexpected byte 0x${c.toString(16)} at ${start}`);
    if (kw === "true" || kw === "false") return { t: "bool", v: kw === "true", start, end: this.pos };
    if (kw === "null") return { t: "null", start, end: this.pos };
    return { t: "kw", v: kw, start, end: this.pos };
  }

  dict(depth) {
    const start = this.pos;
    this.pos += 2;
    const v = new Map(), keys = new Map();
    for (;;) {
      this.skip();
      if (this.pos + 1 >= this.end) fail("unterminated dictionary");
      if (this.buf[this.pos] === 0x3e && this.buf[this.pos + 1] === 0x3e) { this.pos += 2; break; }
      const k = this.value(depth + 1);
      if (k.t !== "name") fail(`dictionary key is not a name at ${k.start}`);
      const val = this.value(depth + 1);
      if (val.t === "kw") fail(`unexpected keyword ${val.v} at ${val.start}`);
      v.set(k.v, val);
      keys.set(k.v, k.start);
    }
    return { t: "dict", v, keys, start, end: this.pos };
  }

  array(depth) {
    const start = this.pos++;
    const v = [];
    for (;;) {
      this.skip();
      if (this.pos >= this.end) fail("unterminated array");
      if (this.buf[this.pos] === 0x5d) { this.pos++; break; }
      const item = this.value(depth + 1);
      if (item.t === "kw") fail(`unexpected keyword ${item.v} at ${item.start}`);
      v.push(item);
    }
    return { t: "arr", v, start, end: this.pos };
  }

  numberOrRef() {
    const start = this.pos;
    const s = this.regular();
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) fail(`bad number ${s.slice(0, 20)} at ${start}`);
    if (/^\d+$/.test(s)) {
      const save = this.pos;
      this.skip();
      const g = this.regular();
      if (/^\d+$/.test(g)) {
        this.skip();
        const n = this.buf[this.pos + 1];
        if (this.buf[this.pos] === 0x52 && (this.pos + 1 >= this.end || isWs(n) || isDelim(n))) {
          this.pos++;
          return { t: "ref", n: +s, g: +g, start, end: this.pos };
        }
      }
      this.pos = save;
    }
    return { t: "num", v: Number(s), start, end: this.pos };
  }

  name() {
    const start = this.pos++;
    const s = this.regular();
    const v = s.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return { t: "name", v: Buffer.from(v, "latin1").toString("utf8"), start, end: this.pos };
  }

  hex() {
    const start = this.pos++;
    const close = this.buf.indexOf(0x3e, this.pos);
    if (close < 0 || close >= this.end) fail("unterminated hex string");
    let h = this.buf.toString("latin1", this.pos, close).replace(/[\0\t\n\f\r ]+/g, "");
    if (/[^0-9a-fA-F]/.test(h)) fail(`bad hex string at ${start}`);
    if (h.length % 2) h += "0";
    this.pos = close + 1;
    return { t: "str", hex: true, bytes: Buffer.from(h, "hex"), start, end: this.pos };
  }

  literal() {
    const start = this.pos++;
    const b = this.buf, out = [];
    let depth = 1;
    while (this.pos < this.end) {
      let c = b[this.pos++];
      if (c === 0x5c) {
        if (this.pos >= this.end) break;
        c = b[this.pos++];
        const esc = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12, 0x28: 0x28, 0x29: 0x29, 0x5c: 0x5c }[c];
        if (esc !== undefined) out.push(esc);
        else if (c >= 0x30 && c <= 0x37) {
          let v = c - 0x30;
          for (let i = 0; i < 2 && this.pos < this.end && b[this.pos] >= 0x30 && b[this.pos] <= 0x37; i++) v = v * 8 + (b[this.pos++] - 0x30);
          out.push(v & 0xff);
        } else if (c === 13) { if (b[this.pos] === 10) this.pos++; }
        else if (c !== 10) out.push(c);
        continue;
      }
      if (c === 0x28) depth++;
      else if (c === 0x29 && --depth === 0) return { t: "str", hex: false, bytes: Buffer.from(out), start, end: this.pos };
      out.push(c);
    }
    fail("unterminated string");
  }
}

/** Parses "N G obj <value>" at pos. */
function parseIndirectAt(buf, pos) {
  const p = new Parser(buf, pos);
  const n = p.regular(); p.skip();
  const g = p.regular(); p.skip();
  const kw = p.regular();
  if (!/^\d+$/.test(n) || !/^\d+$/.test(g) || kw !== "obj") fail(`no object header at ${pos}`);
  return { n: +n, g: +g, start: pos, value: p.value() };
}

/** Offsets of "N G obj" headers before pos, nearest first. */
function* objectStartsBefore(buf, pos, maxBack = 8 << 20) {
  const limit = Math.max(0, pos - maxBack);
  let i = pos;
  while (i > limit) {
    i = buf.lastIndexOf("obj", i - 1, "latin1");
    if (i < limit || i < 0) return;
    if (i >= 3 && buf.toString("latin1", i - 3, i) === "end") continue;
    let j = i - 1;
    while (j >= 0 && isWs(buf[j])) j--;
    const gEnd = j;
    while (j >= 0 && isDigit(buf[j])) j--;
    if (j === gEnd || !isWs(buf[j])) continue;
    while (j >= 0 && isWs(buf[j])) j--;
    const nEnd = j;
    while (j >= 0 && isDigit(buf[j])) j--;
    if (j === nEnd) continue;
    if (j >= 0 && !isWs(buf[j]) && !isDelim(buf[j])) continue;
    yield j + 1;
  }
}

/** Resolves indirect objects by searching the raw file (latest definition wins). */
function makeResolver(buf) {
  const cache = new Map();
  return function resolve(node, depth = 0) {
    if (!node || node.t !== "ref") return node;
    if (depth > 8) return null;
    const key = `${node.n} ${node.g}`;
    if (cache.has(key)) return cache.get(key);
    let found = null;
    const needle = `${node.n} ${node.g} obj`;
    for (let i = buf.length; i > 0;) {
      i = buf.lastIndexOf(needle, i - 1, "latin1");
      if (i < 0) break;
      if (i > 0 && !isWs(buf[i - 1]) && !isDelim(buf[i - 1])) continue;
      try { found = parseIndirectAt(buf, i).value; } catch { found = null; }
      break;
    }
    cache.set(key, found);
    return found && found.t === "ref" ? resolve(found, depth + 1) : found;
  };
}

/** Text string bytes -> JS string (UTF-16BE / UTF-8 with BOM, else PDFDocEncoding ~ Latin-1). */
function textOf(node) {
  if (!node || node.t !== "str") return undefined;
  const b = node.bytes;
  if (b[0] === 0xfe && b[1] === 0xff) { const c = Buffer.from(b.subarray(2, 2 + ((b.length - 2) & ~1))); c.swap16(); return c.toString("utf16le"); }
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.subarray(3).toString("utf8");
  return b.toString("latin1");
}

/** "D:YYYYMMDDHHmmSS+HH'mm'" -> ms */
function pdfDate(s) {
  if (typeof s !== "string") return null;
  const m = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?\s*([Zz+-])?\s*(\d{2})?'?(\d{2})?'?/.exec(s.trim());
  if (!m) return null;
  let ms = Date.UTC(+m[1], (+(m[2] || 1)) - 1, +(m[3] || 1), +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  if (m[7] === "+" || m[7] === "-") ms -= (m[7] === "-" ? -1 : 1) * ((+(m[8] || 0)) * 60 + +(m[9] || 0)) * 60000;
  return Number.isFinite(ms) ? ms : null;
}

module.exports = { Parser, PdfSyntaxError, parseIndirectAt, objectStartsBefore, makeResolver, textOf, pdfDate, isWs, isDelim };
