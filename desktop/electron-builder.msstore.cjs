// electron-builder config for the Microsoft Store package: `npm run dist:msstore` (appx target,
// x64 + arm64, Windows only). It is package.json's "build" plus the package identity, which comes
// from Partner Center (Product management › Product identity) once the name is reserved:
//
//   MSSTORE_IDENTITY_NAME            Package/Identity/Name, e.g. "FalconEyesInc.Sealworks"
//   MSSTORE_PUBLISHER                Package/Identity/Publisher, e.g. "CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
//   MSSTORE_PUBLISHER_DISPLAY_NAME   Package/Properties/PublisherDisplayName (default "Falcon Eyes Inc.")
//
// Without them the package gets a test identity ("FalconEyes.Sealworks.Test", "CN=SealworksTest"):
// fine for sideloading with a self-signed certificate of that subject (CI does this), never for the
// Store. MSSTORE_REQUIRE_IDENTITY=1 makes missing values an error (use it for submission builds).
// MSSTORE_BUILD_NUMBER sets the 4th version part (Store uploads must keep it 0; tests use it to
// build an "update").
//
// The package is not signed here: the Store signs it on submission. To sideload, sign it with a
// certificate whose subject equals MSSTORE_PUBLISHER (see .github/workflows/msstore.yml).
// What differs at runtime (data in the package's LocalState, import menu): src/msstore.js, src/main.js.
const env = process.env;
const build = structuredClone(require("./package.json").build);

const TEST = { name: "FalconEyes.Sealworks.Test", publisher: "CN=SealworksTest" };
const identityName = env.MSSTORE_IDENTITY_NAME || TEST.name;
const publisher = env.MSSTORE_PUBLISHER || TEST.publisher;
if (env.MSSTORE_REQUIRE_IDENTITY === "1" && (!env.MSSTORE_IDENTITY_NAME || !env.MSSTORE_PUBLISHER)) {
  throw new Error("dist:msstore: set MSSTORE_IDENTITY_NAME and MSSTORE_PUBLISHER to the values from Partner Center (Product identity)");
}
if (!env.MSSTORE_IDENTITY_NAME || !env.MSSTORE_PUBLISHER) {
  console.warn(`dist:msstore: no Partner Center identity in the environment; using the test identity ${identityName} / ${publisher} (not for Store submission)`);
}
if (!/^CN=/.test(publisher)) throw new Error(`MSSTORE_PUBLISHER must be a distinguished name starting with CN=, got ${publisher}`);

build.directories = { ...build.directories, output: "dist/msstore" };
build.win = {
  ...build.win,
  target: [{ target: "appx", arch: ["x64", "arm64"] }],
  // Explorer's "Open with" list for .pdf; a packaged app can never make itself the default handler
  fileAssociations: [{ ext: "pdf", name: "PDF Document", description: "PDF document" }],
};
build.appx = {
  identityName,
  publisher,
  publisherDisplayName: env.MSSTORE_PUBLISHER_DISPLAY_NAME || "Falcon Eyes Inc.",
  applicationId: "Sealworks",
  displayName: "Sealworks",
  // the tile images (build/appx/, npm run icon:appx) are the icon on transparent
  backgroundColor: "transparent",
  showNameOnTiles: true,
  languages: ["en-US", "ko-KR"],
  // only runFullTrust (electron-builder always adds it, and nothing else unless listed here):
  // the app makes no network connections, so no internetClient
  capabilities: [],
  addAutoLaunchExtension: false,
  electronUpdaterAware: false,
  // Windows 10 1809 is the oldest Windows 10 still serviced in LTSC; tested on Windows 11 24H2 / Server 2025
  minVersion: "10.0.17763.0",
  maxVersionTested: "10.0.26100.0",
  setBuildNumber: !!env.MSSTORE_BUILD_NUMBER,
  // the default template + desktop4:SupportsMultipleInstances (see the file)
  customManifestPath: "appx-manifest.xml",
  artifactName: "Sealworks-${version}-${arch}.${ext}",
};
if (env.MSSTORE_BUILD_NUMBER) build.buildNumber = String(env.MSSTORE_BUILD_NUMBER);

module.exports = build;
