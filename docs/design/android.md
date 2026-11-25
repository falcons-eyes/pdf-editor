# Sealworks for Android — design contract (v1.2)

Goal: the same app (`web/pdf-editor.html`, the bilingual page with Library, signatures & stamps,
Seal / Verify seal) as an Android app for phones and tablets, published on Google Play as
**Sealworks** (package `com.falconoon.sealworks`), offline, no data collected.

## Shape

- `mobile/` — a Capacitor project (Android only for now). Its web assets are the same offline
  page the desktop build assembles (`desktop/scripts/build-page.mjs` → `desktop/app/`: local
  pdf.js, pdf-lib, fonts, CMaps); `mobile/` may add its own small build step that reuses that
  output. No CDN or network at runtime.
- The page keeps talking to `window.claude.use("desktop")`. On Android a JS shim (in `mobile/`,
  injected before the page script) provides that object, backed by Capacitor plugins
  (community/official ones or small custom Kotlin plugins in `mobile/android/`).
- The desktop shell (`desktop/`) is not changed by the Android work. Seal code in
  `desktop/src/{pdfsig,pki,der,pdfobj,seal}.js` may be **reused by bundling** (esbuild with
  aliases/polyfills for `node:crypto`, `Buffer`, `fs`), not by editing it. If a small refactor
  of those files is truly needed, write it down instead of doing it — another person is editing
  `desktop/` right now (Microsoft Store build).

## `desktop` object on Android (same names as the desktop contract unless noted)

```ts
standalone: true; platform: "android"; mobile: true; sandboxed: true; version: string;
fs: { readFile, writeFile, readdir, stat, exists, mkdir, rename, rm, copyFile }
    // app-private store: page path "~/Library/Application Support/PDF Editor/..." → app files dir
    // user documents: only through picked/received URIs (below); anything else → EPERM
dialog.open({ kind: "pdf"|"image"|"cert", title?, multiple? }) → string[] | null   // SAF ACTION_OPEN_DOCUMENT, persistable read(/write) permission taken
dialog.save({ start?, name, title? }) → string | null                              // SAF ACTION_CREATE_DOCUMENT (application/pdf)
access.request(path, {kind}) → string | null                                      // re-pick when a permission was lost
onOpenFile(cb)                                                                     // ACTION_VIEW / ACTION_SEND of a PDF (incl. cold start)
shell: { openPath(path) → open in another app (ACTION_VIEW chooser), showItemInFolder → resolves (no-op), trashItem → EPERM }
openExternal(https url); links: { privacy, support, repo }
setLanguage(lang); Menu.setApplicationMenu → no-op; window.* → no-op; app.dock → no-op
seal: same API as desktop (identity, createIdentity, exportIdentity, importIdentity,
      removeIdentity, sign, verify). Key: generated in JS, stored as PKCS#8 encrypted with an
      AES key held in the Android Keystore (like DPAPI/safeStorage on desktop), so .p12 backup
      and import keep working. exportIdentity writes through dialog.save (".p12").
```

### Page paths for Android documents

SAF gives `content://` URIs whose last segment is not a file name. The shim maps each picked or
received document to a page path the page's helpers already understand:
`/android/<id>/<display name>` — `basename()` is the real display name, `dirname()` is
`/android/<id>` (never written to directly; saving "next to the original" falls back to
`dialog.save`, exactly like the Mac App Store sandbox: writes there reject with `EPERM`).
The shim keeps a persistent table `<id> → { uri, name, size, mtime }` in app storage and takes
persistable URI permissions. `stat` returns size and `mtimeMs` from the provider (`lastModified`
when available). Revoked or deleted documents: `ENOENT` when the provider says it's gone,
`EPERM` when access was lost.

## Page (mobile UI)

- Breakpoint for phones (< 700 px) and tablets; touch-first: one column, Library list as cards,
  the editor full-screen with a bottom toolbar; "Signatures & stamps" and the inspector as a
  bottom sheet; tap to place, drag to move, pinch to zoom the page, two-finger rotate optional,
  handles ≥ 44 px; signature pad full-width with finger/stylus pressure-free smoothing.
- No hover-only UI on touch (tooltips become long-press or are skipped).
- Respect safe-area insets and the Android back button (close sheet/dialog → leave editor → exit).
- Same Korean/English strings via the STR table; new strings in both languages.

## Store (later)

Google Play: AAB, Play App Signing, target the current required API level, Data safety
"No data collected", content rating questionnaire, privacy policy URL
`https://sealworks.falconoon.com/privacy/`, phone + 7"/10" tablet screenshots, feature graphic.
