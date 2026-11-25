# Sealworks — Microsoft Store (MSIX) build

A third build next to the NSIS/portable `.exe` (GitHub) and the Mac App Store package, following the
same "store variant" pattern as `docs/design/appstore-build.md`: one code base, a separate
electron-builder config, store-only behaviour in main keyed off the runtime.

| | |
| --- | --- |
| Config | `desktop/electron-builder.msstore.cjs` (package.json's `build` + `appx`), `npm run dist:msstore` |
| Manifest template | `desktop/build/appx-manifest.xml`: electron-builder's template + `desktop4:SupportsMultipleInstances="true"` (every activation starts a process, like a Win32 launch) |
| Output | `desktop/dist/msstore/Sealworks-<version>-x64.appx`, `-arm64.appx` (unsigned; the Store signs on submission) |
| Package identity | from Partner Center › Product management › Product identity, via the environment (below) |
| Display name / publisher display name | "Sealworks" / "Falcon Eyes Inc." |
| Application Id (AUMID suffix) | `Sealworks` → AUMID `<PackageFamilyName>!Sealworks` |
| Languages | `en-US`, `ko-KR` |
| Capabilities | `runFullTrust` only (electron-builder adds nothing else unless listed; the app makes no network connections, so no `internetClient`) |
| File types | `.pdf` in Explorer's "Open with" (`uap:FileTypeAssociation`); a packaged app can't make itself the default |
| Version | `<major>.<minor>.<patch>.0` from package.json (the Store requires the 4th part to be 0) |
| Min / max tested Windows | 10.0.17763.0 / 10.0.26100.0 |
| Tiles | `desktop/build/appx/` (StoreLogo, Square44x44Logo incl. taskbar target sizes, Square150x150Logo, Wide310x150Logo; scale 100–400), rendered from `build/icon.png` by `npm run icon:appx`; transparent background |

## Identity (environment)

| variable | manifest | example |
| --- | --- | --- |
| `MSSTORE_IDENTITY_NAME` | `Package/Identity/Name` | `FalconEyesInc.Sealworks` |
| `MSSTORE_PUBLISHER` | `Package/Identity/Publisher` | `CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX` |
| `MSSTORE_PUBLISHER_DISPLAY_NAME` | `Package/Properties/PublisherDisplayName` | `Falcon Eyes Inc.` (default) |
| `MSSTORE_REQUIRE_IDENTITY=1` | — | fail instead of falling back to the test identity (use for submission builds) |
| `MSSTORE_BUILD_NUMBER` | 4th version part | tests only (an "update" package); never for the Store |

Unset → test identity `FalconEyes.Sealworks.Test` / `CN=SealworksTest` (sideloading only). CI reads the
same names from repository variables when they exist.

Submission build (Windows): `MSSTORE_REQUIRE_IDENTITY=1 MSSTORE_IDENTITY_NAME=… MSSTORE_PUBLISHER=… npm run dist:msstore`,
then upload both `.appx` files to the submission's Packages page.

## Runtime differences (main only; the page is unchanged)

Detection: `process.windowsStore` (set by Electron when the app runs as an MSIX package) or the exe
running from `…\WindowsApps\<package full name>\app\`, so any launch of the installed files behaves the
same (in CI, `windowsStore` was `true` even when the smoke test started the exe by path).

### Data store

Packaged desktop apps get AppData *write virtualization*: new files under `%APPDATA%` go to the
package's `LocalCache\Roaming`, but files that already exist in the real `%APPDATA%` are changed in
place. With the NSIS build installed (its store is `%APPDATA%\PDF Editor`), that would split one store
across two folders, and Explorer (outside the package) couldn't see the redirected half.

So the store build keeps everything in the package's own data folder (`ApplicationData.LocalFolder`):

- page store `~/Library/Application Support/PDF Editor` → `%LOCALAPPDATA%\Packages\<PackageFamilyName>\LocalState\PDF Editor`
- Electron's data (cache, window bounds, `settings.json`, safeStorage `Local State`) → `…\LocalState\PDF Editor\.electron`
- sealer key `…\LocalState\PDF Editor\seal\` (DPAPI via safeStorage, as in the NSIS build)

The family name is taken from the install folder name (`src/msstore.js`); if that folder isn't
registered for the user, main falls back to `%APPDATA%` (then virtualized). `PDFE_HOME_OVERRIDE` still
wins over all of this (tests).

| event | data |
| --- | --- |
| relaunch, update (same identity) | kept |
| "Reset" in Settings › Apps › Sealworks › Advanced options | removed |
| uninstall | removed (Windows deletes the package's data folder; MSIX has no "keep data" option) |
| the NSIS build's `%APPDATA%\PDF Editor` | never read or written, except by the import below |

PDFs the user saved elsewhere (Documents, Desktop, …) are ordinary files and stay. What goes with an
uninstall is the 보관함/library copies and the sealer key: users should export a `.p12` backup first.

### Import from the NSIS build

Help › "Import data from the previous version…" (도움말 › 이전 버전 데이터 가져오기…), the same code as the
Mac App Store build: the folder panel starts at `%APPDATA%\PDF Editor`; `prefs.json`, `documents.json`,
`library.json`, `library/`, `docs/`, `thumbs/` are copied (current data kept as `*.before-import-<time>`),
never `seal/` or `.electron/` (the safeStorage key lives in `.electron\Local State`), then the page
reloads. Seal keys move with a `.p12` backup. No automatic import on first launch.

### Unchanged

- `desktop.sandboxed` is `false` (no sandbox: full trust), so the page has no store-specific path;
  no `desktop.store` flag was needed.
- `~` is the real user profile; Documents, Desktop etc. are not virtualized.
- Single instance + "Open with": Windows starts `Sealworks.exe "<file>"`; a second launch hands its argv
  to the running instance (`second-instance`), as with NSIS. Verified in CI with package identity for
  Start while running and a file activation while running. One open item: Explorer's "Open with" through
  the package ProgID *while the app runs* ended the running instance on the CI runner (exit code 1, by
  Windows, before the new process started; the new process then opened the file). The runner uses the
  built-in administrator, for which `ActivateForFile` is refused (0x80270254), so this may be specific to
  that account — check on a regular account (CI reports it as a warning). Worst case the window restarts
  with the file; the page's last ~0.5 s of unsaved state could be lost.
- `shell.openPath` / `showItemInFolder` / `trashItem`, `openExternal` (https only), Help menu links.
- safeStorage (DPAPI) — per user, independent of the package.

## Tests

- `desktop/test/unit.mjs`: package name parsing and the LocalState mapping.
- `desktop/test/smoke.mjs --expect-msstore`: the whole smoke test against the installed package's exe
  (started by path with a test home), the import menu and import flow, the sealer key via DPAPI
  (`--safestorage`). `--simulate-msstore` shows the import menu in a regular build.
- `desktop/test/msstore-installed.ps1`: launches with package identity — "Open with" for a PDF
  (`IApplicationActivationManager.ActivateForFile`; on the CI runner that returns 0x80270254, activation
  blocked for the built-in administrator, so the script falls back to what Explorer's "Open with" does:
  `ShellExecuteEx` with the package's `AppX…` ProgID), a second "Open with" while it runs, then Start
  (`ActivateApplication`) — and checks the process's package identity (`GetPackageFullName`), that the
  page opened each file, the data lands in LocalState and not in LocalCache or the real
  `%APPDATA%\PDF Editor`, the `.pdf` registration (OpenWithProgids, not UserChoice), an update to
  x.y.z.1 keeps the data, uninstall removes it.
- Windows App Certification Kit (CI, `-appxpackagepath`, static tests only: it reports "Running tests
  without application deployment"): everything passes except "Blocked executables", which flags strings
  such as `cmd`/`reg`/`bash` inside Chromium's binaries and `.pak` files and `CreateProcessW` in the exe —
  the same for every Electron app; Partner Center's own validation decides.
- `.github/workflows/msstore.yml` (windows-latest): build, update package, manifest checks, self-signed
  certificate with subject = Publisher (trusted in LocalMachine\TrustedPeople), `signtool`,
  `Add-AppxPackage`, the tests above, then the Windows App Certification Kit when installed; artifacts
  `msstore-appx-test-signed` (+ the test `.cer`), `msstore-screenshots`, `msstore-wack-report`.

## Owner

- Reserve the name in Partner Center, copy Package/Identity/Name, Publisher and PublisherDisplayName
  into the variables above (repository variables for CI).
- Store listing: privacy policy URL, support contact, screenshots, age rating. If the submission asks
  why the restricted capability `runFullTrust` is used: it is a Win32 (Electron) desktop app.
- `release.yml` doesn't build the Store package yet.
