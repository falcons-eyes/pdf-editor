# Sealworks for Android

Capacitor 8 shell (Android only) for `web/pdf-editor.html`, the same offline page the desktop app ships.
Package `com.falconoon.sealworks`, version 1.2.0 (versionCode 1), minSdk 26, target/compile SDK 36.
Design contract: `docs/design/android.md` (plus `seal-and-language.md`, `appstore-build.md`).

```sh
cd mobile
npm ci
npm run sync          # build www/ and copy it into android/ (npx cap sync android)
npm run apk           # sync + ./gradlew assembleDebug  -> android/app/build/outputs/apk/debug/app-debug.apk
npm run aab           # sync + ./gradlew bundleRelease  -> android/app/build/outputs/bundle/release/app-release.aab
npm run test:seal     # seal bundle in plain Node (no device)
npm run test:android  # emulator test (boots the Pixel_7 AVD headless, see below)
npm run icons         # re-render launcher/splash icons from docs/brand/*.svg
```

Gradle needs **JDK 21** (Capacitor 8 compiles for Java 21). Android Studio's bundled JBR works:
`export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`. Android SDK path is in
`android/local.properties` (`sdk.dir=…`, not committed). Open `android/` in Android Studio to run on a device.

## Layout

| path | what |
| --- | --- |
| `scripts/build-www.mjs` | builds `www/` (gitignored): runs desktop's `scripts/build-page.mjs` from a patched copy in `.build/` (three lines swapped: output → `www/`, packages from `mobile/node_modules`; it fails if those lines change), injects a CSP `<meta>` and `android-desktop.js` before the page script, bundles the seal |
| `src/android-desktop.js` | the `desktop` shim: `window.claude.use("desktop")` (bundled with `@capacitor/core`) |
| `src/seal/` | the seal for the WebView: `entry.js` (bundle entry, native key store glue), `node-crypto.js` (node:crypto adapter), `node-fs.cjs`, `node-path.cjs`, `node-util.cjs`, `globals.js` (Buffer, process), `seal-worker.js` |
| `android/app/src/main/java/com/falconoon/sealworks/` | `MainActivity.kt` (plugins, splash, WebView hardening, key-store interceptor), `plugins/SealworksFilesPlugin.kt`, `DocTable.kt`, `SealworksSealPlugin.kt`, `SealKeys.kt`, `SealworksSystemPlugin.kt` |
| `android/app/src/main/res/xml/` | `file_paths.xml` (FileProvider: the store only; debug adds `test-docs/`), `data_extraction_rules.xml`, `backup_rules.xml` |
| `scripts/make-icons.mjs`, `store/play-icon-512.png` | icons (headless Chromium via playwright-core) and the 512 px Play listing icon |
| `test/seal.mjs`, `test/android.mjs` | tests; screenshots and pulled PDFs go to `test/out/` (gitignored) |

No third-party Capacitor plugins: three small Kotlin plugins do files, keys and system bits. JS
dependencies bundled into the app: `@capacitor/core` (MIT), and for the seal `node-forge` (already the
desktop's), `pdf-lib`, `@signpdf/*` (MIT), `@noble/hashes`, `@noble/curves` (MIT, audited, maintained),
`buffer`, `path-browserify` (MIT).

## The `desktop` object on Android

Everything in `docs/design/android.md`, with these values and additions:

| member | Android |
| --- | --- |
| `standalone`, `platform`, `mobile`, `sandboxed`, `version` | `true`, `"android"`, `true`, `true`, `"1.2.0"` |
| `links` | privacy `https://sealworks.falconoon.com/privacy/`, support `…/support/`, repo GitHub |
| `fs.*` | store paths and document paths only (below); everything else rejects `EPERM`, `exists()` → `false`; `<store>/seal/…` → `EPERM`. Bytes cross the bridge as base64 in 3 MB chunks; a write reaches its target only when complete |
| `dialog.open({kind})` | `ACTION_OPEN_DOCUMENT` (`pdf`, `image` = `image/*`, `cert` = PKCS#12 types), `kind: "folder"` = `ACTION_OPEN_DOCUMENT_TREE`; read+write persistable permission taken when the provider allows; `start` (a `/android/…` path) becomes `EXTRA_INITIAL_URI` |
| `dialog.save({name, start})` | `ACTION_CREATE_DOCUMENT`, `application/pdf`, `.pdf` added → page path or `null` |
| `access.request(path, {kind})` | the open panel at that document (or folder); picking the same file returns the same page path |
| `onOpenFile(cb)` | `ACTION_VIEW` / `ACTION_SEND` / `ACTION_SEND_MULTIPLE` of `application/pdf` (`content://`), at cold start and while running; queued until a callback registers |
| `shell.openPath(p)` | `ACTION_VIEW` chooser ("Open with" / "다른 앱으로 열기"); store files go out through the FileProvider, read-only, per request |
| `shell.showItemInFolder` / `trashItem` | resolves (no-op) / `EPERM` |
| `openExternal(url)` | https only (`EINVAL` otherwise), in the browser |
| `setLanguage(lang)` | saved (SharedPreferences), used for native strings and seal errors; first run follows the system (ko* → ko) |
| `window.*`, `Menu.*`, `app.dock.*` | no-ops; `pathForFile()` → `null` |
| **`onBack(cb)`** | **addition.** `cb()` runs on the system back button/gesture; return (or resolve) `true` when the page used it (closed a sheet/dialog, left the editor). Newest callback first; returns an unsubscribe function. If no callback returns `true`, the app goes to the background (Android's own behaviour at the root). While *no* callback is registered, the shim's fallback closes the top open `<dialog>`, then leaves the editor (`__pdfe.showHome()`), then backgrounds |
| `seal.*` | same API and results as desktop (desktop/src/seal.js itself, bundled); confirmations are native dialogs (`ECANCELED` when declined); `exportIdentity` writes the `.p12` through the save panel; `identity().protected` is `"os"` |

Errors reject with `"CODE: message"` and `.code` (`ENOENT`, `EPERM`, `EEXIST`, `EISDIR`, `ENOTDIR`, `EINVAL`, `EIO`).

### How paths map

| page path | Android |
| --- | --- |
| `~/Library/Application Support/PDF Editor/…` | `filesDir/store/…` (app-private; the page's prefs, library, document copies, thumbnails) |
| `/android/<id>/<display name>` | a document the user picked, created or sent; `<id>` → `{ uri, name, tree, persisted }` in `noBackupFilesDir/documents.json` |
| `/android/<id>` | that document's virtual folder (`dirname()`; listing shows the one file; writing another name there is `EPERM`, so "save next to the original" falls back to `dialog.save`), or a picked folder (tree): its files are `/android/<id>/<name>`, writing a new name creates it |

The same URI always gets the same id (re-picking a file keeps its page path). `stat` returns the
provider's size and `lastModified`. A provider that says the document is gone → `ENOENT`; lost access
(no persistable grant, e.g. a file shared for one session, or after restore on another device) →
`EPERM`. Some providers revoke the grant when a file is deleted, so a deleted file can also read `EPERM`.

## The seal on Android

`desktop/src/{seal,pdfsig,pki,der,pdfobj}.js` are bundled **unchanged** with esbuild (nothing copied):
`node:crypto` → `src/seal/node-crypto.js` (sync SHA-1/2/3 and MD5 from @noble/hashes; RSA PKCS#1 v1.5/PSS
and DSA with BigInt; ECDSA P-256/384/521, secp256k1 and Ed25519 from @noble/curves; RSA key generation
with WebCrypto; AES-GCM with node-forge), `Buffer` → `buffer`, `fs` → a mount over the seal files. It
runs in a dedicated Worker (`www/seal/`), so sealing doesn't block the page. Results are the desktop's:
`test/seal.mjs` checks the same fixtures and statuses and cross-verifies with desktop's Node code.

**Key storage.** The private key never sits in the page, and at rest only in the Keystore-encrypted file:

- `noBackupFilesDir/seal/key.bin` = `PDFEK1O\n` `SWKS2\n` | public key | IV | AES-256-GCM(PKCS#8), encrypted
  with a non-exportable AES key in the **Android Keystore** (alias `sealworks.seal.kek.v1`), written by
  `SealKeys.kt`. `identity.json`, `cert.pem`, `chain.pem` sit next to it (same layout as desktop).
- Signing happens in Kotlin (`SHA256withRSA` / `SHA256withECDSA` over the CMS signed attributes). The worker
  reaches `SealKeys` with synchronous `GET https://localhost/_sealworks/{store,sign,export}` requests,
  answered in `MainActivity`'s `shouldInterceptRequest` (in-process, no network). desktop's seal code signs
  synchronously, which is why it isn't a Capacitor call. `seal.js` sees a *handle* key (public key +
  native reference) from its `safeStorage.decryptString`, so its code is unchanged.
- `sign` accepts only CMS signed attributes (a DER SET with messageDigest); `export` hands out the PKCS#8
  once, within 2 minutes after the user picked where a `.p12` goes in the save panel. So a compromised page
  can at most seal PDFs (as on desktop), not take the key.
- Plaintext key material exists only inside the seal worker while creating, importing or exporting an
  identity (JS strings can't be wiped; the Kotlin side zeroes its buffers).
- Lost Keystore key (reset, restore to another device): `sign` → `EIO` "the sealer key can't be unlocked";
  import the `.p12` backup. Move an identity between devices with the `.p12` backup.

## Backup (`android:allowBackup="true"`)

- Google cloud backup (Android 12+ `data_extraction_rules.xml`, 8–11 `backup_rules.xml`): only the
  language setting. Not the store (signature images, records, document copies), not `no_backup/`.
- Device-to-device transfer: the store moves (the library comes along; documents then need re-granting).
  Never `no_backup/` (seal key, document table) — it is excluded by the system and explicitly.

## Permissions and offline

The merged manifest has **no** `INTERNET` (removed with `tools:node="remove"`, which also keeps a future
plugin from adding it) and no dangerous permissions (SAF needs none). The only entry is androidx's
signature-level `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. Capacitor serves the page from the APK through
`shouldInterceptRequest` on `https://localhost`, which needs no network permission (verified in the
emulator, including the CDP test in debug builds, which uses a local abstract socket). CSP (same as the
desktop `app://` policy): `default-src 'self'`, `connect-src 'self' data: blob:`, `object-src`/`frame-src 'none'` …;
the test checks a remote `fetch` is blocked and every request stays on `https://localhost`. WebView file
and content URL access are off; geolocation off; remote debugging only in debug builds.

## Tests

`npm run test:seal` — 75 checks: the crypto adapter against Node (hashes, RSA/PSS/ECDSA/Ed25519/DSA, AES-GCM,
key generation), certificate, sign → verify → tamper statuses, both `desktop/test/fixtures`, identical
verify results to desktop's Node implementation, seal on one side / verify on the other, `.p12` both ways,
openssl interop, and the identity store with a simulated `SealKeys` (same requests and file layout).

`npm run test:android` (or `node test/android.mjs [--build] [--keep-emulator] [--serial <adb serial>]`):
boots `Pixel_7` headless (`-read-only`, port 5584), reinstalls the debug APK, attaches over CDP
(`adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`) and checks boot, CSP/offline, fs and
path rules, example document, placing a signature, save (EPERM → save panel), seal + verify intact on the
device and with desktop's Node verifier, tamper, language, `.p12` backup/import, the key-store guards,
the page's own "Seal and save" + "Verify seal", back button, VIEW/SEND intents (running and cold start,
through the app's own FileProvider `content://` URIs), restart persistence, open-with, and finally the
real DocumentsUI save and open panels (tapped through uiautomator). Stops the emulator at the end.

Debug-only test hook (like `PDFE_TEST_NO_DIALOGS` on desktop): `window.__sealworksTest.Files.testHook({ enable, pick? })`
— while on, save/open/access panels answer themselves with files in `filesDir/test-docs/` (served by the
FileProvider, read and written through the ContentResolver), open-with records the URI, confirmations
pass. `testHook` rejects in release builds, and `__sealworksTest` exists only in debug builds.

## Release (AAB for Google Play)

1. Create the upload key once and keep it out of the repo (`*.jks`/`*.keystore` are gitignored):
   ```sh
   keytool -genkeypair -v -keystore ~/keys/sealworks-upload.jks -alias upload \
     -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Falcon Eyes Inc., O=Falcon Eyes Inc., C=KR"
   ```
2. Give Gradle the values as Gradle properties (`~/.gradle/gradle.properties`) or environment variables:
   `SEALWORKS_UPLOAD_STORE_FILE=/Users/…/keys/sealworks-upload.jks`, `SEALWORKS_UPLOAD_STORE_PASSWORD=…`,
   `SEALWORKS_UPLOAD_KEY_ALIAS=upload`, `SEALWORKS_UPLOAD_KEY_PASSWORD=…` (defaults to the store password).
   On macOS the password can stay out of files: store it once with
   `security add-generic-password -a upload -s sealworks-upload-key -w` (it prompts), and set only
   `SEALWORKS_UPLOAD_STORE_FILE`; Gradle reads the password from the login Keychain.
3. `npm run aab` → `android/app/build/outputs/bundle/release/app-release.aab` (signed with the upload key;
   without `SEALWORKS_UPLOAD_STORE_FILE` Gradle warns and the bundle is unsigned). Check with
   `jarsigner -verify -certs app-release.aab`.
4. Play Console: enrol in Play App Signing (Google holds the app signing key), upload the AAB.
   Language splits are off (`bundle.language.enableSplit false`): the app switches ko/en itself.
5. For every upload, raise `versionCode` in `android/app/build.gradle` (and `versionName` with the app version).

Release is not minified (R8 off): Capacitor finds plugin methods by reflection.

## Icons and splash

`npm run icons` renders from the brand masters in `docs/brand/` (see its README): legacy
`ic_launcher`/`ic_launcher_round` (48 dp, all densities), adaptive icon = gradient background drawable
(the tile's colours) + foreground (the page and wax seal without the tile, inside the 66 dp safe zone)
+ `ic_launcher_monochrome` (the one-colour mark, for themed icons),
`ic_splash` for the SplashScreen API (`windowSplashScreenAnimatedIcon` on the icon blue; kept until the page
has loaded, at most 3 s), and `store/play-icon-512.png`.
