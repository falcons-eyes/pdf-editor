# Seal (tamper-evident PDF) and language switching — v1.1 contract

Shared contract between the page (`web/pdf-editor.html`) and the desktop shell (`desktop/`).
Everything here is **standalone-app only** (`desktop.standalone === true`); in the Claude
artifact or a plain browser `desktop.seal` is absent and the page hides the seal UI.

## Why a seal, not DRM

DRM controls who may open a file and needs a server and a client agent. Owner-password
"no editing" flags in PDFs are trivially removed. What a signing app needs is
**tamper evidence**: a PDF digital signature (PAdES, ISO 32000-2 §12.8) over the final bytes.
Any change to a sealed file shows as "modified after sealing"; making a new valid seal needs
the private key, which never leaves the user's computer. Nothing can make a file impossible
to edit — the seal makes edits impossible to hide.

## Words

| | 한국어 | English |
| --- | --- | --- |
| the feature / action | 봉인해서 저장 | Seal and save |
| subtitle | 고치면 바로 티가 나는 PDF | Any later edit shows |
| state: intact | 봉인 그대로 | Seal intact |
| state: modified | 봉인 뒤 수정됨 | Modified after sealing |
| state: invalid | 봉인이 올바르지 않음 | Seal is not valid |
| state: none | 봉인 없음 | Not sealed |
| check action | 봉인 확인 | Verify seal |
| signer identity | 봉인하는 사람 (서명자 정보) | Sealer (signer identity) |

## `desktop.seal` (preload → main over IPC; all async; errors reject with "CODE: message")

Error codes (the message after `CODE: ` is short and in the last `setLanguage` language, ko/en, so
the page can put it inside its own sentence):

| code | when |
| --- | --- |
| `EPASSWORD` | wrong .p12/.pfx password |
| `ENOENT` | `sign` / `exportIdentity` with no identity |
| `EEXIST` | `createIdentity` when one exists (without `replace: true`) |
| `EINVAL` | not a (readable) PDF, encrypted PDF, over 300 MB, not a usable .p12/.pfx (unreadable, no key, unsupported key type, expired), missing name/password, bad e-mail |
| `EIO` | anything else (key can't be unlocked from the keychain, disk errors, expired sealer certificate) |

`verify` never rejects for garbage bytes (→ `none` or `invalid`); only non-bytes or > 300 MB reject (`EINVAL`).

```ts
type Identity = {
  name: string;            // shown as signer, e.g. "홍길동"
  org?: string;            // optional organization
  email?: string;          // optional
  fingerprint: string;     // SHA-256 of the certificate DER, upper-case hex in groups of 4 ("AB12 CD34 …")
  createdAt: number;       // ms
  notAfter: number;        // ms, certificate expiry
  imported: boolean;       // true when it came from a .p12/.pfx the user brought
                           // (restoring this app's own backup gives false)
  protected: "os" | "file";// (addition) "os": key encrypted with Electron safeStorage (Keychain/DPAPI/
                           // libsecret); "file": safeStorage unavailable (Linux without keyring, CI,
                           // test homes), key encrypted with a random key file next to it
};
type SigInfo = {
  name: string; org?: string; fingerprint: string;
  signedAt: number | null;      // CMS signingTime (or /M), ms
  reason?: string; location?: string;
  certify: boolean;             // DocMDP certification signature
  coversWholeFile: boolean;     // ByteRange reaches end of file (no bytes appended after)
  digestOk: boolean;            // message digest matches the covered bytes
  signatureOk: boolean;         // CMS signature verifies with the embedded certificate
  mine: boolean;                // fingerprint equals this app's current identity
  selfSigned: boolean;
  error?: string;               // (addition) why digestOk/signatureOk is false, English, for diagnostics
};
type Verify = { status: "none" | "intact" | "modified" | "invalid"; signatures: SigInfo[] };

seal.identity(): Promise<Identity | null>
seal.createIdentity({ name, org?, email? }): Promise<Identity>     // RSA-2048 + self-signed X.509, 10 years; rejects EEXIST if one exists unless { replace: true }
seal.exportIdentity({ password }): Promise<Uint8Array>             // PKCS#12 backup (page saves it via a save dialog)
seal.importIdentity(p12: Uint8Array, { password }): Promise<Identity>  // also how a user brings their own certificate (.pfx/.p12); replaces the current identity
seal.removeIdentity(): Promise<void>
seal.sign(pdf: Uint8Array, { reason?, location?, lang?: "ko"|"en" }): Promise<Uint8Array>
seal.verify(pdf: Uint8Array): Promise<Verify>

dialog.open({ kind: "cert", title?, start? })   // (addition) native open dialog filtered to .p12/.pfx → page paths | null
```

Implementation notes (desktop): `desktop/src/seal.js` (store, localized errors), `pdfsig.js`
(sign/verify), `pki.js` (certificate, PKCS#12), `pdfobj.js`/`der.js` (raw PDF and ASN.1 readers).
Exported .p12: key in a pkcs8ShroudedKeyBag with pbeWithSHAAnd3-KeyTripleDES-CBC, HMAC-SHA1 MAC
(imports into macOS Keychain, Windows, Acrobat). Import reads OpenSSL 3 defaults (PBES2/AES-256,
SHA-256 MAC), `-legacy` (RC2-40/3DES), RSA and EC P-256/384/521 keys. The page's fs API refuses
to read or change anything inside `<store>/seal/` (`EPERM`).

Status rules for `verify`: `none` = no signature dictionaries; `invalid` = any signature whose
digest or CMS check fails or can't be parsed; `modified` = all signatures check out but the
last one doesn't cover the whole file (bytes appended after sealing); `intact` = otherwise.

Signing: PAdES baseline B-B (`/SubFilter /ETSI.CAdES.detached`, SHA-256, signing-certificate-v2
attribute), invisible signature field, **certification signature with DocMDP P=1** (no changes
permitted). The private key is stored encrypted with Electron `safeStorage` (macOS Keychain /
Windows DPAPI) under the data store's `seal/` folder; it is never sent to the page.
No network access (RFC 3161 timestamps are a later, opt-in step).

## `desktop.setLanguage(lang: "ko" | "en")`

Standalone only; rejects `EINVAL` for other values. Main switches the labels it owns (macOS app menu, 편집/Edit, 창/Window,
도움말/Help menus, dialog buttons/titles it sets) and resolves. The page then re-sends its own
menu template in the same language via `Menu.setApplicationMenu`. Main keeps the choice in
Electron's settings (`<userData>/settings.json`), so the first menu after launch is already right; with
nothing saved it follows the system language (ko* → ko, else en). It also sets the language of
the seal error messages and of native dialog filter names.

## Page side

- `prefs.lang` = "ko" | "en"; default from `navigator.language` (ko* → ko, else en).
  Switch from the status bar and the 보기/View menu; switching re-renders without reload.
- Save dialog: "봉인해서 저장 / Seal and save" option (remembered). First use asks for the
  sealer name (creates the identity). Sealed exports are recorded on the 보관함 record
  (`rec.export.sealed = { at, fingerprint, name }`) and shown as a chip.
- "봉인 확인 / Verify seal…": title-bar/home action, File menu, and drop target; shows the
  status in plain words, signer, time, fingerprint, whether it is "my" seal, and the
  self-signed caveat ("Acrobat shows the signer as not verified, because the certificate is
  made by this app").
- Sealer panel: name, fingerprint (to share with recipients), back up (.p12), import, replace.
