// node:util for the seal bundle: only promisify (desktop/src/pki.js uses it for generateKeyPair).
const custom = Symbol.for("nodejs.util.promisify.custom");
function promisify(fn) {
  if (typeof fn !== "function") throw new TypeError("promisify: function expected");
  if (fn[custom]) return fn[custom];
  return (...args) => new Promise((resolve, reject) => fn(...args, (err, value) => (err ? reject(err) : resolve(value))));
}
promisify.custom = custom;
module.exports = { promisify };
