// Injected into the seal bundle (esbuild `inject`): the free identifiers Buffer and process that the
// desktop seal code (written for Node) uses. `process` is deliberately not Node-like, so node-forge
// takes its browser paths (WebCrypto getRandomValues) in the WebView and in the Node test alike.
import { Buffer } from "buffer";

const process = {
  platform: "android",
  browser: true,
  env: {},
  versions: {},
  version: "",
  cwd: () => "/",
  nextTick: (fn, ...a) => queueMicrotask(() => fn(...a)),
};

export { Buffer, process };
