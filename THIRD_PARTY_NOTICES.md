# Third-party notices

[English](#english) · [한국어](#한국어)

## English

Sealworks includes the third-party components listed below. **Each keeps its own license.** The Sealworks license ([LICENSE](LICENSE), PolyForm Strict 1.0.0, and the [additional permissions](LICENSE-PERMISSIONS.md)) covers only the code and other material that Falcon Eyes Inc. owns. It does not cover these components, and nothing in it limits the rights their licenses give you.

Versions are the ones pinned in `desktop/package.json`, `mobile/package.json` and `mobile/android/variables.gradle` at the time of writing. The full license texts ship inside the apps: open **About Sealworks › Third-party licenses** to read them, or look in the app's `licenses/` folder (one file per component, plus this list and the Sealworks license files). The paths below are where the original copies also sit.

### Desktop app (macOS, Windows) and Android app

| Component | Version | License | Copyright | License text in the app |
| --- | --- | --- | --- | --- |
| [PDF.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | 3.11.174 | Apache-2.0 | Mozilla Foundation | `lib/LICENSE-pdfjs-dist.txt`, `vendor/pdfjs/LICENSE.txt` |
| Adobe CMaps (Korean subset, from `pdfjs-dist`) | 3.11.174 | BSD-3-Clause | Copyright 1990-2009 Adobe Systems Incorporated | `vendor/pdfjs/LICENSE_CMAPS.txt` |
| Foxit standard fonts (from `pdfjs-dist`) | 3.11.174 | BSD-3-Clause | Copyright 2014 PDFium Authors | `vendor/pdfjs/LICENSE_FOXIT.txt` |
| Liberation Sans fonts (from `pdfjs-dist`) | 3.11.174 | SIL OFL 1.1 | Copyright (c) 2010 Google Corporation; Copyright (c) 2012 Red Hat, Inc. | `vendor/pdfjs/LICENSE_LIBERATION.txt` |
| [pdf-lib](https://github.com/Hopding/pdf-lib) | 1.17.1 | MIT | Copyright (c) 2019 Andrew Dillon | `lib/LICENSE-pdf-lib.txt` |
| `@pdf-lib/standard-fonts` | 1.0.0 | MIT | Copyright (c) 2018 Andrew Dillon | in the package |
| `@pdf-lib/upng` | 1.0.1 | MIT | Copyright (c) 2017 Photopea | in the package |
| [pako](https://github.com/nodeca/pako) | 1.0.11 | MIT AND Zlib | Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn | in the package |
| [tslib](https://github.com/microsoft/tslib) | 1.14.1 | 0BSD | Copyright (c) Microsoft Corporation | in the package |
| [@signpdf/signpdf](https://github.com/vbuch/node-signpdf), `@signpdf/utils` | 4.0.0 | MIT | Copyright (c) 2019 The Authors | in the package |
| [node-forge](https://github.com/digitalbazaar/forge) | 1.4.4 | BSD-3-Clause (chosen from "BSD-3-Clause OR GPL-2.0") | Copyright (c) 2010, Digital Bazaar, Inc. | in the package |
| [IBM Plex Sans KR](https://github.com/IBM/plex) (via `@fontsource`) | 5.3.0 | SIL OFL 1.1 | Copyright 2018 IBM Corp. | `fonts/LICENSE-ibm-plex-sans-kr.txt` |
| [IBM Plex Mono](https://github.com/IBM/plex) (via `@fontsource`) | 5.3.0 | SIL OFL 1.1 | Copyright 2017 IBM Corp. | `fonts/LICENSE-ibm-plex-mono.txt` |
| Nanum Myeongjo (via `@fontsource`) | 5.3.0 | SIL OFL 1.1 | Copyright © 2010 NHN Corporation | `fonts/LICENSE-nanum-myeongjo.txt` |
| Nanum Pen Script (via `@fontsource`) | 5.3.0 | SIL OFL 1.1 | Copyright © 2010 NHN Corporation | `fonts/LICENSE-nanum-pen-script.txt` |

Sealworks uses node-forge under the **BSD-3-Clause** license, not GPL-2.0.

The fonts are bundled unchanged with the app and are not sold on their own, as the SIL Open Font License allows.

### Desktop app only

| Component | Version | License | Copyright |
| --- | --- | --- | --- |
| [Electron](https://www.electronjs.org/) | 45.5.0 | MIT | Copyright (c) Electron contributors; Copyright (c) 2013-2020 GitHub Inc. |
| Chromium and the other components inside Electron | (as shipped with Electron 45.5.0) | various, listed in `LICENSES.chromium.html` | various |

Electron's own license and `LICENSES.chromium.html` ship with the desktop app. Some components inside Electron, such as the FFmpeg library (`libffmpeg` / `ffmpeg.dll`), are licensed under the GNU Lesser General Public License (LGPL) 2.1 and are dynamically linked. For those components the LGPL applies, and nothing in the Sealworks license restricts the rights it gives you, including replacing the library with a modified version and reverse engineering to debug such changes.

### Android app only

| Component | Version | License | Copyright |
| --- | --- | --- | --- |
| [Capacitor](https://capacitorjs.com/) (`@capacitor/core`, `@capacitor/android`) | 8.6.2 | MIT | Copyright (c) 2017-present Drifty Co. |
| [Apache Cordova Android](https://cordova.apache.org/) framework (used by Capacitor) | 14.0.1 | Apache-2.0 | Copyright 2015-2020 The Apache Software Foundation |
| AndroidX libraries (activity, appcompat, coordinatorlayout, core, core-splashscreen, fragment, webkit) | see `mobile/android/variables.gradle` | Apache-2.0 | The Android Open Source Project |
| [@noble/curves](https://github.com/paulmillr/noble-curves), [@noble/hashes](https://github.com/paulmillr/noble-hashes) | 2.4.0 | MIT | Copyright (c) 2022 Paul Miller |
| [buffer](https://github.com/feross/buffer) | 6.0.3 | MIT | Copyright (c) Feross Aboukhadijeh, and other contributors |
| [base64-js](https://github.com/beatgammit/base64-js) | 1.5.1 | MIT | Copyright (c) 2014 Jameson Little |
| [ieee754](https://github.com/feross/ieee754) | 1.2.1 | BSD-3-Clause | Copyright 2008 Fair Oaks Labs, Inc. |
| [path-browserify](https://github.com/browserify/path-browserify) | 1.0.1 | MIT | Copyright (c) 2013 James Halliday |

Apache Cordova's NOTICE file reads:

```
Apache Cordova
Copyright 2015-2020 The Apache Software Foundation

This product includes software developed at
The Apache Software Foundation (http://www.apache.org/).
```

The `pdfjs-dist` package that Sealworks uses has no NOTICE file, so for PDF.js only the Apache-2.0 license text is required.

### Build tools

Tools used only to build or test Sealworks (for example electron-builder, esbuild, Playwright and the Capacitor CLI) are not included in the apps.

---

## 한국어

Sealworks에는 위 표에 적은 제3자 구성 요소가 들어 있습니다. **각 구성 요소는 원래 라이선스를 그대로 따릅니다.** Sealworks 라이선스([LICENSE](LICENSE)의 PolyForm Strict 1.0.0과 [추가 권한](LICENSE-PERMISSIONS.md#한국어))는 팔콘아이즈(Falcon Eyes Inc.)가 권리를 가진 코드와 자료에만 적용되고, 이 구성 요소에는 적용되지 않습니다. 각 라이선스가 주는 권리를 제한하지도 않습니다.

- 라이선스 전문은 앱 안에 들어 있습니다. **Sealworks 정보 › 제3자 라이선스**에서 읽을 수 있고, 앱의 `licenses/` 폴더에도 구성 요소별 파일로 들어 있습니다. 각 패키지에도 원본이 있습니다.
- node-forge는 GPL-2.0이 아닌 **BSD-3-Clause** 라이선스로 사용합니다.
- 글꼴(OFL 1.1)은 고치지 않고 앱에 함께 넣어 배포하며, 글꼴만 따로 팔지 않습니다.
- 데스크톱 앱에 들어 있는 Electron의 일부 구성 요소(예: FFmpeg)는 LGPL 2.1로 동적 링크됩니다. 이 구성 요소에는 LGPL이 적용되며, Sealworks 라이선스는 LGPL이 주는 권리(라이브러리를 고친 버전으로 바꾸는 것, 그 변경을 디버깅하기 위한 리버스 엔지니어링 포함)를 제한하지 않습니다.
- Android 앱에 들어 있는 Apache Cordova의 NOTICE 내용은 위에 그대로 옮겼습니다.
