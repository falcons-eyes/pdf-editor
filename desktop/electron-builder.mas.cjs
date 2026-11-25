// electron-builder config for the Mac App Store targets: `npm run dist:mas` (universal .pkg for
// App Store Connect) and `npm run dist:mas-dev` (development-signed app for local testing).
// It is package.json's "build" plus the signing settings that must not live in git:
//
//   MAS_IDENTITY                  "Apple Distribution" identity, e.g. "Falcon Eyes Inc. (TEAMID)" (without the
//                                 "Apple Distribution: " prefix). Unset: electron-builder picks it from the keychain
//                                 or from CSC_LINK / CSC_KEY_PASSWORD (CI)
//   MAS_PROVISIONING_PROFILE      Mac App Store Connect profile (default build/mas/embedded.provisionprofile)
//   MAS_DEV_IDENTITY              "Apple Development: Name (ID)" for mas-dev; "none" = leave unsigned (used by
//                                 scripts/sandbox-local.mjs, which signs ad-hoc itself)
//   MAS_DEV_PROVISIONING_PROFILE  macOS App Development profile (default build/mas/dev.provisionprofile)
//   APPLE_TEAM_ID                 written to Info.plist as ElectronTeamID (otherwise @electron/osx-sign reads it
//                                 from the profile or the identity name)
//   MAS_BUILD_VERSION             CFBundleVersion; must grow with every upload (CI: the run number)
//
// The installer certificate ("3rd Party Mac Developer Installer" / "Mac Installer Distribution") is
// found in the keychain or taken from CSC_INSTALLER_LINK / CSC_INSTALLER_KEY_PASSWORD.
const fs = require("node:fs");
const path = require("node:path");

const env = process.env;
const build = structuredClone(require("./package.json").build);
const here = (p) => path.join(__dirname, p);
const existing = (p) => (p && fs.existsSync(path.resolve(__dirname, p)) ? p : undefined);
const set = (o, k, v) => { if (v === undefined) delete o[k]; else o[k] = v; };

// `mas` inherits `mac`: the DMG's ad-hoc identity "-" must never reach a store build
delete build.mac.identity;

const mas = build.mas;
set(mas, "identity", env.MAS_IDENTITY || undefined);
set(mas, "provisioningProfile", env.MAS_PROVISIONING_PROFILE || existing("build/mas/embedded.provisionprofile"));
if (env.APPLE_TEAM_ID) mas.extendInfo = { ...(mas.extendInfo || {}), ElectronTeamID: env.APPLE_TEAM_ID };

const dev = build.masDev;
const devId = env.MAS_DEV_IDENTITY;
set(dev, "identity", devId === "none" || devId === "null" ? null : devId || undefined);
set(dev, "provisioningProfile", env.MAS_DEV_PROVISIONING_PROFILE || existing("build/mas/dev.provisionprofile"));

if (env.MAS_BUILD_VERSION) build.buildVersion = String(env.MAS_BUILD_VERSION);

// a store package without its profile is rejected by App Store Connect: stop early
const argv = process.argv.join(" ");
if (/(^|\s)mas(\s|$)/.test(argv) && !/mas-dev/.test(argv) && !mas.provisioningProfile) {
  throw new Error(`dist:mas needs a Mac App Store Connect provisioning profile: put it at ${here("build/mas/embedded.provisionprofile")} or set MAS_PROVISIONING_PROFILE`);
}

module.exports = build;
