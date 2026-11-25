# Sealmark v1.1 — Mac App Store build contract

Decisions (2026-11-25, from the owner):

| | |
| --- | --- |
| Product name | **Sealmark** (store: "Sealmark: Sign & Seal PDFs" / "씰마크 – PDF 서명·봉인") |
| Mac App Store bundle ID | `com.falconoon.sealmark` |
| GitHub DMG / Windows app ID | `com.falconoon.sealmark.direct` (different from the store build so the two never share a container, Keychain items or Launch Services identity) |
| Distribution | both: Mac App Store, and GitHub releases (DMG arm64/x64, Windows NSIS/portable) |
| Copyright / publisher | Falcon Eyes Inc. (주식회사 팔콘아이즈) |
| Data store (DMG, Windows) | unchanged: page path `~/Library/Application Support/PDF Editor` (keeps existing users' data) |
| Data store (store build) | the container (`~/Library/Containers/com.falconoon.sealmark/Data/...`), same page path |
| Minimum macOS | 13.0 (Electron 45) |
| Privacy policy URL | `https://github.com/falcons-eyes/pdf-editor/blob/main/PRIVACY.md` |
| Support URL | `https://github.com/falcons-eyes/pdf-editor/issues` |

Background and the full plan: `docs/appstore/README.md`, `docs/appstore/sandbox-plan.md`.

## Additions to the desktop API (on top of `docs/design/seal-and-language.md`)

```ts
desktop.sandboxed: boolean               // true only in the Mac App Store build (process.mas)
desktop.dialog.save({ start, name, title? }): Promise<string | null>
  // native save panel for a PDF, prefilled with folder `start` (page path) and file `name`;
  // returns the chosen page path (access granted and remembered) or null when cancelled
desktop.access.request(path: string, { kind: "pdf" | "folder" }): Promise<string | null>
  // asks the user to grant a file or folder again (open panel starting at it, with a short
  // message); returns the granted page path (may differ if the user picked another) or null
desktop.links: { privacy: string; support: string; repo: string }   // https URLs above
```

Errors from `fs.*` keep their codes: `ENOENT` = really missing; `EPERM`/`EACCES` = the
sandbox has no permission for that path (the page must show "needs permission", never
"missing"). Outside the store build these members exist too (`sandboxed: false`,
`dialog.save` works, `access.request` just opens the panel), so the page has one code path.

## Page behavior in the store build

- Files picked in the open panel, saved through the save panel, or granted via
  `access.request` stay accessible across launches (main keeps security-scoped bookmarks;
  the page never sees bookmark data). Files opened from Finder or dropped on the window work
  for this launch only; later they read "needs permission" with a "Grant access…" action.
- "Save as file": if writing to the chosen folder fails with EPERM, the page falls back to
  `dialog.save` (prefilled) — the user confirms once; after a folder is granted, saves there
  go straight through.
- Library state for a record whose original or saved file can't be checked: "권한이 필요해
  확인하지 못함 / Needs permission to check", action "접근 허용… / Grant access…".
- Help menu and the about/side panel: Privacy policy, Support, GitHub (`desktop.links`).
- "이전 버전 데이터 가져오기… / Import data from the previous version…" (store build only):
  main asks for the old folder `~/Library/Application Support/PDF Editor` via an open panel
  and copies it into the container; seal keys are not copied (use a .p12 backup).
