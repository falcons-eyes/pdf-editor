# PDF Editor — desktop app

Electron shell for `web/pdf-editor.html` (the same page that runs as a Claude artifact). The page is
not edited here: `npm run build:page` wraps it in the artifact skeleton and swaps its CDN scripts and
Google Fonts for local copies, so the app works fully offline.

```sh
cd desktop
npm ci
npm start            # build:page + electron . (uses your real data store, see below)
npm run pack         # unpacked app in dist/ (mac-arm64/, mac/ or win-unpacked/)
npm test             # smoke test against the unpacked app (or: node test/smoke.mjs --dev | --app <path>)
npm run dist:mac     # dist/PDF-Editor-<v>-arm64.dmg and -x64.dmg (ad-hoc signed, not notarized)
npm run dist:win     # dist/PDF-Editor-<v>-setup-x64.exe (NSIS) and -portable-x64.exe
npm run icon         # re-render build/icon.{png,icns,ico} from the page's drawAppIcon() (macOS, python3 + Pillow)
```

CI: `.github/workflows/build.yml` builds and smoke-tests on macos-14 and windows-latest for every
push/PR; `release.yml` does the same for `v*` tags (tag must equal `version` here) and attaches the
DMGs and EXEs to the GitHub release.

## Layout

- `scripts/build-page.mjs` → `app/` (gitignored): `index.html`, `lib/` (pdf.js 3.11.174 `build/pdf.min.js`
  and pdf-lib 1.17.1, checked against the page's SRI hashes), `fonts/` (@fontsource woff2 for the
  families in the page's Google Fonts link), `vendor/pdfjs/` (copied from `web/`).
- `src/main.js` — window, `app://pdf-editor/` protocol (CSP, traversal-safe), IPC for the desktop API,
  menus, file-open events, single-instance lock, window bounds.
- `src/preload.js` — `window.claude.use("desktop")` via `contextBridge`.
- `src/paths.js` — page path ⇄ OS path mapping.
- `build/` — icons and `installer.nsh` (adds "Open with" for .pdf on Windows without becoming the default).

## Data locations

- Page data store: page path `~/Library/Application Support/PDF Editor` — literally that on macOS,
  `%APPDATA%\PDF Editor` on Windows (`~/.config/PDF Editor` on Linux). Shared with the Claude-installed app.
- Electron's own data (cache, window bounds): `<that folder>/.electron`.
- `PDFE_HOME_OVERRIDE=<dir>`: test/dev switch. `~` becomes `<dir>` (the store is then
  `<dir>/Library/Application Support/PDF Editor` on every OS) and Electron data goes to
  `<dir>/.pdfe-electron`, so a run never touches the real store or the real app's single-instance lock.
  The smoke test always sets it to a temp folder.

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
| `Menu.setApplicationMenu(template)` | click functions stay in the preload; macOS gets the app menu, `editMenu`/`windowMenu` become Korean menus, plus 도움말 › GitHub 저장소 |
| `app.dock.setIcon` | no-op `{written:false}` (the bundled icon is used) |
| `os.platform() / arch()`, `install.state() / request()` | `"installed"` |
| `standalone`, `platform`, `version` | sync values (`true`, `process.platform`, app version) |
| `dialog.open({kind:"pdf"\|"image"\|"folder", title, start, multiple})` | native dialog → page paths or `null` |
| `pathForFile(file)` | sync; dropped `File` → page path or `null` |
| `onOpenFile(cb)` | PDFs from Finder/Explorer/Dock/argv/second launch; queued until a callback registers; returns an unsubscribe function |
| `openExternal(url)` | https only |

Paths: `/`-separated; `~`, `~/x` = home. Windows `C:\a\b` ⇄ `/C:/a/b`, `\\srv\share` ⇄ `//srv/share`,
`/` = drive list. OS paths under home come back as `~/…`.

## macOS install note

The DMGs are ad-hoc signed (no Developer ID, no notarization). A downloaded copy is quarantined, so the
first launch needs System Settings › Privacy & Security › "Open Anyway" (or
`xattr -dr com.apple.quarantine "/Applications/PDF Editor.app"`).
