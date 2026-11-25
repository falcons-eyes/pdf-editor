"use strict";
// Minimal ASN.1 plumbing for the seal: a bounds-checked DER/BER reader that keeps byte offsets
// (CMS verification needs the exact bytes of signedAttrs, certificates, names) and a DER writer.

const MAX_DEPTH = 64;

class Asn1Error extends Error {}
const fail = (m) => { throw new Asn1Error(`asn1: ${m}`); };

/** Reads one TLV at `off`. Supports BER indefinite lengths (end-of-contents scanned). */
function read(buf, off = 0, end = buf.length, depth = 0) {
  if (depth > MAX_DEPTH) fail("nested too deeply");
  if (off + 2 > end) fail("truncated header");
  const start = off;
  let b = buf[off++];
  const cls = b >> 6, constructed = (b & 0x20) !== 0;
  let tag = b & 0x1f;
  if (tag === 0x1f) {
    tag = 0;
    for (let n = 0; ; n++) {
      if (off >= end || n > 3) fail("bad tag");
      b = buf[off++];
      tag = tag * 128 + (b & 0x7f);
      if (!(b & 0x80)) break;
    }
  }
  if (off >= end) fail("truncated length");
  let len = buf[off++];
  let valueEnd, tlvEnd;
  if (len === 0x80) {
    if (!constructed) fail("indefinite length on a primitive");
    let p = off;
    for (;;) {
      if (p + 2 > end) fail("missing end-of-contents");
      if (buf[p] === 0 && buf[p + 1] === 0) { valueEnd = p; tlvEnd = p + 2; break; }
      p = read(buf, p, end, depth + 1).end;
    }
  } else {
    if (len & 0x80) {
      const n = len & 0x7f;
      if (n > 4 || off + n > end) fail("bad length");
      len = 0;
      for (let i = 0; i < n; i++) len = len * 256 + buf[off++];
    }
    valueEnd = off + len;
    if (valueEnd > end) fail("value runs past the end");
    tlvEnd = valueEnd;
  }
  return { buf, cls, constructed, tag, start, valueStart: off, valueEnd, end: tlvEnd, depth };
}

function children(node) {
  if (!node.constructed) fail("not constructed");
  const out = [];
  for (let p = node.valueStart; p < node.valueEnd;) {
    const c = read(node.buf, p, node.valueEnd, node.depth + 1);
    out.push(c);
    p = c.end;
  }
  return out;
}

const raw = (n) => n.buf.subarray(n.start, n.end);
const value = (n) => n.buf.subarray(n.valueStart, n.valueEnd);
const is = (n, tag, cls = 0) => !!n && n.tag === tag && n.cls === cls;
const expect = (n, tag, what, cls = 0) => { if (!is(n, tag, cls)) fail(`expected ${what}`); return n; };

/** OCTET STRING contents, joining BER constructed chunks */
function octets(n) {
  if (!n.constructed) return Buffer.from(value(n));
  return Buffer.concat(children(n).map(octets));
}

function oidString(n) {
  const v = value(expect(n, 6, "OID"));
  if (!v.length) fail("empty OID");
  const parts = [];
  let acc = 0;
  for (let i = 0; i < v.length; i++) {
    acc = acc * 128 + (v[i] & 0x7f);
    if (!(v[i] & 0x80)) {
      if (!parts.length) { const first = acc < 80 ? Math.floor(acc / 40) : 2; parts.push(first, acc - first * 40); }
      else parts.push(acc);
      acc = 0;
    }
  }
  return parts.join(".");
}

function time(n) {
  const s = value(n).toString("latin1");
  let m;
  if (n.tag === 23) m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?(Z|[+-]\d{4})?$/.exec(s);
  else if (n.tag === 24) m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})?(\d{2})?(?:[.,](\d+))?(Z|[+-]\d{4})?$/.exec(s);
  if (!m) return null;
  let y = +m[1];
  if (n.tag === 23) y += y < 50 ? 2000 : 1900;
  const tz = n.tag === 23 ? m[7] : m[8];
  let ms = Date.UTC(y, +m[2] - 1, +m[3], +m[4], +(m[5] || 0), +(m[6] || 0));
  if (n.tag === 24 && m[7]) ms += Math.round(+("0." + m[7]) * 1000);
  if (tz && tz !== "Z") ms -= (tz[0] === "-" ? -1 : 1) * (+tz.slice(1, 3) * 60 + +tz.slice(3, 5)) * 60000;
  return Number.isFinite(ms) ? ms : null;
}

/** Directory string (UTF8, Printable, IA5, T61, BMP, Universal) */
function text(n) {
  const v = value(n);
  switch (n.tag) {
    case 12: return v.toString("utf8");
    case 30: { const b = Buffer.from(v); if (b.length % 2) return ""; b.swap16(); return b.toString("utf16le"); }
    case 28: { let s = ""; for (let i = 0; i + 3 < v.length; i += 4) s += String.fromCodePoint(v.readUInt32BE(i)); return s; }
    default: return v.toString("latin1");
  }
}

/* ---------------- writer ---------------- */
function encLen(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  while (n > 0) { bytes.unshift(n & 0xff); n = Math.floor(n / 256); }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tagByte, ...parts) => {
  const body = Buffer.concat(parts.flat().filter(Boolean));
  return Buffer.concat([Buffer.from([tagByte]), encLen(body.length), body]);
};
const seq = (...p) => tlv(0x30, ...p);
/** DER SET OF: elements sorted by their encodings */
const set = (...p) => tlv(0x31, ...sortDer(p.flat().filter(Boolean)));
const sortDer = (items) => [...items].sort(Buffer.compare);
function oid(s) {
  const p = s.split(".").map(Number);
  const out = [];
  const push = (v) => { const b = [v & 0x7f]; v = Math.floor(v / 128); while (v > 0) { b.unshift(0x80 | (v & 0x7f)); v = Math.floor(v / 128); } out.push(...b); };
  push(p[0] * 40 + p[1]);
  for (const v of p.slice(2)) push(v);
  return tlv(0x06, Buffer.from(out));
}
function int(v) {
  if (Buffer.isBuffer(v)) return tlv(0x02, v);
  const b = [];
  do { b.unshift(v & 0xff); v = Math.floor(v / 256); } while (v > 0);
  if (b[0] & 0x80) b.unshift(0);
  return tlv(0x02, Buffer.from(b));
}
const octet = (b) => tlv(0x04, b);
const nul = () => Buffer.from([0x05, 0x00]);
/** context-specific [n]; constructed by default (EXPLICIT, or IMPLICIT of a constructed type) */
const ctx = (n, ...p) => tlv(0xa0 | n, ...p);

module.exports = { Asn1Error, read, children, raw, value, is, expect, octets, oidString, time, text, tlv, seq, set, oid, int, octet, nul, ctx };
