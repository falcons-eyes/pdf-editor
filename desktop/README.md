# Sealworks — desktop app

Electron shell for `web/pdf-editor.html` (the same page that runs as a Claude artifact). The page is
not edited here: `npm run build:page` wraps it in the artifact skeleton and swaps its CDN scripts and
Google Fonts for local copies, so the app works fully offline.

Product name **Sealworks** (version 1.1.0, © Falcon Eyes Inc.). Two macOS builds share this code:

| build | bundle ID | signed | data store |
| --- | --- | --- | --- |
| GitHub DMG (arm64, x64), Windows NSIS/portable | `com.falconoon.sealworks.direct` | ad-hoc (macOS), unsigned (Windows) | `~/Library/Application Support/PDF Editor` (unchanged, keeps existing users' data) |
| Mac App Store (`mas`, universal) | `com.falconoon.sealworks` | Apple Distribution + provisioning profile | the container: `~/Library/Containers/com.falconoon.sealworks/Data/Library/Application Support/PDF Editor` |

Decisions and the page-facing API: `docs/design/appstore-build.md`; plan: `docs/appstore/sandbox-plan.md`.

```sh
cd desktop
npm ci
npm start            # build:page + electron . (uses your real data store, see below)
npm run pack         # unpacked app in dist/ (mac-arm64/, mac/ or win-unpacked/)
npm test             # seal + unit tests (plain Node), then the smoke test against the unpacked app
                     # (or: npm run test:seal / test:unit; node test/smoke.mjs --dev | --app <path>)
npm run dist:mac     # dist/Sealworks-<v>-arm64.dmg and -x64.dmg (ad-hoc signed, not notarized)
npm run dist:win     # dist/Sealworks-<v>-setup-x64.exe (NSIS) and -portable-x64.exe
npm run dist:mas     # dist/mas-universal/Sealworks-<v>-mas-universal.pkg (needs the Apple certificates, below)
npm run dist:mas-dev # dist/mas-dev-universal/Sealworks.app, development-signed (needs a dev profile)
npm run test:sandbox # local App Sandbox test without certificates (macOS, below)
npm run icon         # re-render build/icon.{png,icns,ico} from the page's drawAppIcon() (macOS, python3 + Pillow)
```

CI: `.github/workflows/build.yml` builds and smoke-tests on macos-latest and windows-latest for every
push/PR; `release.yml` does the same for `v*` tags (tag must equal `version` here) and attaches the
DMGs and EXEs to the GitHub release. When the signing secrets are set, `release.yml` also builds the
Mac App Store package (job `mas`, below); it is kept as a workflow artifact, never attached to the release.

## Layout

- `scripts/build-page.mjs` → `app/` (gitignored): `index.html`, `lib/` (pdf.js 3.11.174 `build/pdf.min.js`
  and pdf-lib 1.17.1, checked against the page's SRI hashes), `fonts/` (@fontsource woff2 for the
  families in the page's Google Fonts link), `vendor/pdfjs/` (copied from `web/`).
- `src/main.js` — window, `app://pdf-editor/` protocol (CSP, traversal-safe), IPC for the desktop API,
  menus, file-open events, single-instance lock, window bounds.
- `src/preload.js` — `window.claude.use("desktop")` via `contextBridge`.
- `src/paths.js` — page path ⇄ OS path mapping (incl. the store build's real-home/container mapping).
- `src/bookmarks.js` — security-scoped bookmarks for the store build (main only, `<userData>/bookmarks.json`).
- `src/seal.js` — `desktop.seal` (contract: `docs/design/seal-and-language.md`): sealer identity in
  `<data store>/seal/`, localized `CODE: message` errors. `src/pdfsig.js` signs (PAdES B-B,
  `ETSI.CAdES.detached` with signing-certificate-v2, certification DocMDP P=1 via `/Reference` +
  catalog `/Perms`, ESIC extension; pdf-lib places the dictionary, `@signpdf/signpdf` fills
  `/ByteRange`/`/Contents`, the CMS is built with Node's crypto) and verifies (raw scan of every
  `/ByteRange` dictionary + the AcroForm via pdf-lib; RSA/PSS/ECDSA/Ed25519, adbe.pkcs7.detached/sha1,
  adbe.x509.rsa_sha1, document timestamps). `src/pki.js`: RSA-2048 self-signed certificate
  (node-forge), PKCS#12 export/import. `src/pdfobj.js`, `src/der.js`: raw PDF object and ASN.1 readers.
- Runtime `dependencies` (bundled into app.asar): pdf-lib, @signpdf/signpdf, @signpdf/utils,
  node-forge. Everything else stays a devDependency.
- `test/unit.mjs` — path mapping (DMG, Windows, test home, store build) and the bookmark store.
- `test/seal.mjs` — seal unit test incl. a pyHanko-signed fixture (`test/fixtures/`) and, when
  `openssl` is on PATH, `openssl cms` signatures and `openssl pkcs12` files.
  `test/validate_pyhanko.py` — optional independent check of a sealed PDF with pyHanko (see its header).
- `build/` — icons, `installer.nsh` (adds "Open with" for .pdf on Windows without becoming the default),
  `entitlements.mas.plist` / `entitlements.mas.inherit.plist`, `mas/PrivacyInfo.xcprivacy`.
- `electron-builder.mas.cjs` — the build config for `dist:mas`/`dist:mas-dev`: package.json's `build`
  plus the signing settings from the environment (never committed).
- `scripts/sandbox-local.mjs` — `npm run test:sandbox`.

## Data locations

- Page data store: page path `~/Library/Application Support/PDF Editor` — literally that on macOS (DMG),
  `%APPDATA%\PDF Editor` on Windows (`~/.config/PDF Editor` on Linux). Shared with the Claude-installed app.
  The folder name stays "PDF Editor" after the rename so existing data keeps working.
- Store build: the page's `~` is the user's real home (`os.userInfo().homedir`, checked to be
  `/Users/<name>` inside the sandbox), so recorded paths and panel start folders are real; only
  `~/Library/Application Support/…` maps to the container's appData.
- Electron's own data (cache, window bounds, `settings.json`, `bookmarks.json`): `<that folder>/.electron`.
- Sealer identity: `<data store>/seal/` (`identity.json`, `cert.pem`, `chain.pem`, `key.bin`; plus
  `key.secret` when the key is file-protected). The page's fs API can list that folder but not read or
  change it. `key.bin` is encrypted with Electron safeStorage (macOS Keychain item "PDF Editor Safe
  Storage", DPAPI on Windows); without it (Linux with no keyring) a random key file is used and
  `identity().protected` says `"file"`.
- `PDFE_HOME_OVERRIDE=<dir>`: test/dev switch. `~` becomes `<dir>` (the store is then
  `<dir>/Library/Application Support/PDF Editor` on every OS) and Electron data goes to
  `<dir>/.pdfe-electron`, so a run never touches the real store or the real app's single-instance lock.
  The smoke test always sets it to a temp folder. Under the override the sealer key is file-protected
  so tests never touch the login keychain; `PDFE_SEAL_SAFESTORAGE=1` uses safeStorage anyway.
  Further test switches, honoured only together with the override: `PDFE_TEST_NO_DIALOGS=1` (no native
  panels: confirmations pass, save/access panels return the prefilled path), `PDFE_TEST_SANDBOXED=1`
  (a regular build behaves as the store build in main: `desktop.sandboxed`, bookmark store, import
  menu), `PDFE_TEST_IMPORT_FROM=<dir>` (the folder "Import data from the previous version" uses).

## Desktop API (`await window.claude.use("desktop")`)

Same shape as Claude's desktop capability, every call async over IPC (main checks the sender is the
top frame at `app://pdf-editor/`). Errors reject with messages starting with the code (`ENOENT: …`).

| member | notes |
| --- | --- |
| `fs.readFile(path, enc?)` | `Uint8Array`, or a string for `"utf8"` / `"base64"` |
| `fs.writeFile(path, data, enc?)` | string (utf8, or base64 with `enc`), `Uint8Array`, `ArrayBuffer`, Blob |
| `fs.readdir / stat / exists / mkdir({recursive}) / rename / rm({force}) / copyFile` | `rm` is recursive; `readdir` sorted, symlinks resolved for `isFile`/`isDirectory` |
| `shell.openPath / showItemInFolder / trashItem` | |
| `permissions.state(name?) / request() / manage()` | always `"granted"` |
| `window.setOptions(o)` | applies `minWidth`/`minHeight`, `titleBarOverlay` (Windows/Linux), `trafficLightPosition` (macOS); returns `{applied:"now"}`. `getOptions`, `show`, `hide` |
| `Menu.setApplicationMenu(template)` | click functions stay in the preload; macOS gets the app menu, `editMenu`/`windowMenu` become main's menus in the `setLanguage` language, plus Help › Privacy Policy / Support / GitHub repository (도움말 › 개인정보 처리방침 / 지원 / GitHub 저장소); store build: Sealworks › Import data from the previous version… |
| `app.dock.setIcon` | no-op `{written:false}` (the bundled icon is used) |
| `os.platform() / arch()`, `install.state() / request()` | `"installed"` |
| `standalone`, `platform`, `version` | sync values (`true`, `process.platform`, app version) |
| `dialog.open({kind:"pdf"\|"image"\|"folder"\|"cert", title, start, multiple})` | native dialog → page paths or `null`; store build: picked PDFs/folders are remembered (bookmarks) |
| `dialog.save({start, name, title?})` | native save panel for a PDF (folder `start`, file `name`, `.pdf` added) → page path or `null`; store build: access kept |
| `access.request(path, {kind:"pdf"\|"folder"})` | open panel at `path` asking to allow it → granted page path (may differ) or `null` |
| `sandboxed` | `true` only in the Mac App Store build |
| `links` | `{privacy, support, repo}` https URLs (also Help › Privacy Policy / Support / GitHub repository) |
| `pathForFile(file)` | sync; dropped `File` → page path or `null` |
| `onOpenFile(cb)` | PDFs from Finder/Explorer/Dock/argv/second launch; queued until a callback registers; returns an unsubscribe function |
| `openExternal(url)` | https only |
| `seal.*` | identity / createIdentity / exportIdentity / importIdentity / removeIdentity / sign / verify, see the design doc |
| `setLanguage("ko"\|"en")` | main's own menus (app, Edit, Window, Help), dialog filter names and seal error messages; remembered |

Errors keep their codes: `ENOENT` = really missing; `EPERM`/`EACCES` = no permission (store build:
the sandbox; show "needs permission", never "missing"). The sandbox itself doesn't restrict metadata, so in
the store build main's `stat` also opens the file (or folder) and rejects with `EPERM` when the app may
not read it; `exists` returns `false` then. A missing file is still `ENOENT`.

Paths: `/`-separated; `~`, `~/x` = home. Windows `C:\a\b` ⇄ `/C:/a/b`, `\\srv\share` ⇄ `//srv/share`,
`/` = drive list. OS paths under home come back as `~/…`.

## macOS install note

The DMGs are ad-hoc signed (no Developer ID, no notarization). A downloaded copy is quarantined, so the
first launch needs System Settings › Privacy & Security › "Open Anyway" (or
`xattr -dr com.apple.quarantine "/Applications/Sealworks.app"`). The renamed app has a new bundle ID, so
macOS and Windows treat it as a new app next to an installed "PDF Editor"; the data store is the same.

## Mac App Store build

Electron's MAS variant (`process.mas`) inside the App Sandbox. Only these entitlements
(`build/entitlements.mas.plist`; helpers get `entitlements.mas.inherit.plist` = sandbox + inherit):

| entitlement | why |
| --- | --- |
| `app-sandbox` | required for the Mac App Store (2.4.5(i)) |
| `files.user-selected.read-write` | open/save panels: open a PDF, import an image or .p12, choose a save folder, save, export a .p12 |
| `files.bookmarks.app-scope` | keep those files/folders reachable on the next launch |

Added by `@electron/osx-sign` when signing (not in the file): `application-identifier`,
`developer.team-identifier` and `application-groups = ["<TEAMID>.com.falconoon.sealworks"]`. The
group is required: the MAS Electron registers its Mach rendezvous service as
`<TEAMID>.<bundle id>.MachPortRendezvousServer.<pid>` and aborts at launch without it (seen locally).
Not requested: `network.*` (offline; links open in the browser), `files.downloads.*` (saves go through
the save panel), `cs.allow-jit` (only matters under the hardened runtime, which MAS builds don't use;
runs fine without it), camera/microphone/usb/print (in osx-sign's default template, unused). No
`container-migration.plist`: its `Move` really moves the old folder (the DMG and Claude-installed app
would lose their data) and is reported not to work with iCloud Desktop & Documents; the store build
has Sealworks › "Import data from the previous version…" instead, which copies `prefs.json`,
`documents.json`, `library.json`, `library/`, `docs/`, `thumbs/` from a folder the user picks (current
data kept as `*.before-import-<time>`, never `seal/` or `.electron/`) and reloads the page. Seal keys
move with a .p12 backup (export in the DMG build, import in the store build; same fingerprint).

Store-build behaviour in main (`process.mas` only; DMG and Windows unchanged): every `fs`/`shell`
operation runs inside `withAccess()` (starts the security-scoped bookmark for the path or its nearest
granted folder, always stops it); open panels for PDFs/folders, `dialog.save` and `access.request` ask
for bookmarks; a 0-byte file the save panel pre-created is removed if the write to it fails (or never
comes before quit). `bookmarks.json` is main's: the page's fs API refuses it like the seal folder.

### Signing material (owner's Apple Developer account)

- Certificates: **Apple Distribution**, **Mac Installer Distribution** (keychain name "3rd Party Mac
  Developer Installer"), and **Apple Development** for `mas-dev`.
- App ID `com.falconoon.sealworks`; profiles: **Mac App Store Connect** (`build/mas/embedded.provisionprofile`)
  and **macOS App Development** with the test Mac's UDID (`build/mas/dev.provisionprofile`). Both are
  git-ignored (`desktop/.gitignore`).
- Local: install the certificates in the login keychain, put the profiles in `build/mas/`, then
  `APPLE_TEAM_ID=<TEAMID> npm run dist:mas` (or `MAS_IDENTITY="Falcon Eyes Inc. (TEAMID)"` to pick one).
  Environment read by `electron-builder.mas.cjs`: `MAS_IDENTITY`, `MAS_PROVISIONING_PROFILE`,
  `MAS_DEV_IDENTITY` (`none` = unsigned), `MAS_DEV_PROVISIONING_PROFILE`, `APPLE_TEAM_ID`,
  `MAS_BUILD_VERSION` (CFBundleVersion, must grow per upload). `mac.identity: "-"` (the DMG's ad-hoc
  signature) is dropped for store builds, and `dist:mas` stops if the profile is missing.
- A distribution-signed app doesn't run locally; test with `mas-dev` or TestFlight.
- CI secrets (`release.yml`, job `mas`, runs only when they exist): `MAS_APP_CERT_P12` + `MAS_APP_CERT_PASSWORD`
  (base64 Apple Distribution .p12), `MAS_INSTALLER_CERT_P12` + `MAS_INSTALLER_CERT_PASSWORD`,
  `MAS_PROVISIONING_PROFILE` (base64), `APPLE_TEAM_ID`; optional `ASC_API_KEY_P8` (base64),
  `ASC_API_KEY_ID`, `ASC_API_ISSUER_ID` for `altool --validate-app`. Uploading from CI only with the
  repository variable `MAS_UPLOAD=true`; otherwise upload the `mas-pkg` artifact with Transporter.
  The job checks the signature, entitlements, `lipo -archs`, Info.plist and that no file carries
  `com.apple.quarantine` (App Store Connect rejects those).
- Base64 for a secret: `base64 -i cert.p12 | pbcopy`.

### Local sandbox test (no certificates)

`npm run test:sandbox` builds the real MAS Electron variant unsigned (`mas-dev`, `MAS_DEV_IDENTITY=none`),
signs it ad-hoc with the MAS entitlements (`codesign --force --deep --sign - --entitlements
build/entitlements.mas.inherit.plist`, then the app with `entitlements.mas.plist`) and runs it in the
App Sandbox: first without a test home (data store in the container, `~` = real home), then
`test/smoke.mjs` with a test home inside the container, an outside folder that must be denied, the
sealer key in the Keychain (safeStorage) and the import menu. Kernel sandbox reports during the run go
to `test/out/sandbox-denials.log`. Test-only differences: bundle ID `com.falconoon.sealworks.localtest`
(the real ID never gets a container here), a fake `ElectronTeamID`/app group `LOCALTEST0`, and
`network.server` so Playwright can reach the inspector on 127.0.0.1. Afterwards it removes the
container, group/app-scripts folders and the "Sealworks Safe Storage" Keychain item it created
(`--keep` keeps them, `--skip-build` re-signs the existing build). `node test/smoke.mjs --simulate-sandbox`
exercises the store-build code paths in a regular build.

Still manual (needs real panels): picking/saving through panels and the bookmark round trip across
launches, Finder "Open With"/Dock drops, the T1–T14 table in `docs/appstore/sandbox-plan.md` §7.
