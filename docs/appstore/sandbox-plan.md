# Mac App Store 빌드 기술 계획 (App Sandbox)

이 문서는 `desktop/`(Electron 45.5.0, electron-builder 26.18.0)을 Mac App Store(MAS)용으로 빌드할 때 필요한 **설정 파일, 코드 변경, 데이터 이전, 테스트**를 정리합니다.
코드는 아직 바꾸지 않았습니다. 여기 적힌 파일 이름과 함수 이름은 2026-11-25 기준 저장소에서 읽은 것입니다. 다른 작업(영어·한국어 UI, 봉인 기능)이 `web/pdf-editor.html`과 `desktop/`을 바꾸는 중이라, **줄 번호 대신 함수 이름**으로 가리킵니다.

표시:
- `⚠ 확인 필요`: 공식 문서로 확인하지 못했거나, `mas-dev` 빌드로 직접 돌려 봐야 하는 내용
- `[결정]`: 제품·법무 쪽에서 정해야 하는 내용

---

## 0. 한눈에 보기

| 지금(DMG) | MAS에서 | 할 일 |
|---|---|---|
| 임시 서명(`identity: "-"`), 하드닝 런타임 없음, 샌드박스 없음 | **App Sandbox 필수** (2.4.5(i)). Apple Distribution 인증서 + 프로비저닝 프로파일 | `mas`/`masDev` 설정, entitlements 파일 2개 |
| 페이지가 `fs.*`로 디스크 어디든 읽고 씀 | 컨테이너 밖은 **사용자가 고른 파일·폴더**만, 그것도 다음 실행 때는 **보안 범위 북마크**가 있어야 함 | `main.js`에 북마크 저장소와 접근 래퍼 |
| 원본 옆에 `_서명.pdf` 저장 | 원본 **파일**만 허락받았고 **폴더**는 아님 → 바로 쓰면 거부 | 저장은 NSSavePanel(또는 폴더 허락) 경유 |
| 창으로 돌아올 때 원본을 `stat`/해시로 다시 확인 | 다음 실행부터는 북마크 없이는 `EPERM` | 북마크 + "권한 필요" 상태 추가 |
| 데이터: `~/Library/Application Support/PDF Editor` | `~/Library/Containers/<bundle-id>/Data/Library/Application Support/PDF Editor` | 이전(migration) 경로 2가지 |
| 봉인 키: `safeStorage`(Keychain) | 서명 주체가 바뀌어 DMG판 Keychain 항목을 못 읽음 | .p12 백업 → 가져오기 안내 |
| 아키텍처별 DMG 2개 | 한 버전에 **패키지 1개**만 업로드 | `universal` 빌드 (또는 arm64 전용 `[결정]`) |

---

## 1. 인증서, 식별자, 프로파일 (조직 계정)

| 항목 | 내용 | 담당 |
|---|---|---|
| Bundle ID `[결정]` | 지금 `io.github.falcons-eyes.pdf-editor`. **업로드한 뒤에는 바꿀 수 없습니다.** 회사 도메인 기반(`com.<회사>.<앱>`)을 권합니다. DMG판과 ID를 다르게 두면 두 앱이 서로의 컨테이너·Keychain 항목과 엉키지 않습니다 | 법무/ASC |
| App ID | Certificates, Identifiers & Profiles에서 위 ID로 등록. 추가 Capability는 필요 없음 (App Groups는 `TEAMID.<bundle-id>` 형태라 프로파일 없이도 됨, `⚠ 확인 필요`) | ASC |
| 앱 서명 인증서 | **Apple Distribution** (옛 이름 "3rd Party Mac Developer Application"). electron-builder 26은 MAS 배포용으로 `Apple Distribution` → `3rd Party Mac Developer Application` 순서로 찾습니다 (`app-builder-lib/out/mac/MacTargetHelper.js`) | ASC |
| 설치 패키지 인증서 | **Mac Installer Distribution**. 키체인에는 `3rd Party Mac Developer Installer: <회사> (TEAMID)`로 보입니다. electron-builder가 `.pkg`에 이 이름으로 서명합니다 | ASC |
| 배포 프로파일 | **Mac App Store Connect** 유형 프로파일 → `embedded.provisionprofile`. TestFlight에 올리려면 들어 있어야 합니다 (`⚠ 확인 필요`: 없으면 TestFlight 사용 불가 경고) | ASC |
| 개발 프로파일 | `mas-dev` 로컬 실행용 **macOS App Development** 프로파일. 테스트할 Mac의 Provisioning UDID를 등록해야 함 | ASC |
| 개발 인증서 | **Apple Development** | ASC |
| Developer ID | DMG를 계속 밖에서 배포하려면 따로 필요(공증용). MAS와는 무관 | 선택 |

- 인증서 `.p12`와 프로파일은 저장소에 넣지 않습니다. CI에서는 GitHub Secrets → 임시 키체인(`CSC_LINK`/`CSC_KEY_PASSWORD`, `CSC_INSTALLER_LINK`/`CSC_INSTALLER_KEY_PASSWORD`)으로 넣습니다.
- `ElectronTeamID`: `@electron/osx-sign` 1.3.3의 `preAutoEntitlements`가 인증서 이름이나 프로파일에서 팀 ID를 읽어 `Info.plist`에 넣고, `com.apple.application-identifier`, `com.apple.developer.team-identifier`, `com.apple.security.application-groups`(`TEAMID.<bundle-id>`)도 자동으로 추가합니다 (로컬 `node_modules/@electron/osx-sign/dist/cjs/util-entitlements.js`에서 확인). 그래서 아래 entitlements 파일에는 이 세 키를 적지 않아도 됩니다. 확실히 하려면 `mas.extendInfo.ElectronTeamID`에 직접 적습니다.

---

## 2. Entitlements 파일

### 2.1 `desktop/build/entitlements.mas.plist` (앱 본체)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- 필수: Mac App Store 앱은 샌드박스 안에서 돈다 (2.4.5(i)) -->
  <key>com.apple.security.app-sandbox</key>
  <true/>

  <!-- 열기·저장 패널에서 사용자가 고른 파일/폴더 읽기·쓰기
       (PDF 열기, 이미지 가져오기, 저장, 저장 폴더 고르기, .p12 가져오기/내보내기) -->
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>

  <!-- 다음 실행 때도 같은 원본·저장 폴더를 다시 확인하기 위한 앱 범위 보안 북마크 -->
  <key>com.apple.security.files.bookmarks.app-scope</key>
  <true/>

  <!-- 기본 저장 위치(~/Downloads)를 패널 없이 쓰기 위함.
       심사에서 이유를 물으면: "저장 위치를 고르지 않은 첫 저장의 기본값이 다운로드 폴더"
       필요 없다고 판단되면 지운다 (쓰지 않는 entitlement는 2.4.5(i) 질의 대상) -->
  <key>com.apple.security.files.downloads.read-write</key>
  <true/>

  <!-- V8 JIT. 하드닝 런타임을 끈 MAS 빌드에서는 필요 없을 수 있다.
       electron-builder 문서는 Electron 20+ arm64에서 없으면 죽을 수 있다고 경고한다.
       mas-dev에서 빼고 돌려 보고, 문제가 없으면 지운다. ⚠ 확인 필요 -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>

  <!-- 넣지 않는 것 (지금 기능에 쓰지 않음):
       network.client  : 앱은 네트워크를 쓰지 않는다. 링크는 shell.openExternal로 기본 브라우저가 연다.
                         나중에 RFC 3161 타임스탬프를 붙이면 그때 추가 (export compliance도 다시 검토)
       print, device.camera, device.microphone, device.usb : @electron/osx-sign 기본 템플릿
                         (default.mas.plist)에 들어 있지만 이 앱은 쓰지 않으므로 반드시 빼야 한다
       temporary-exception.* : 쓰지 않는다. 심사에서 강하게 질의받는다 -->
</dict>
</plist>
```

주의: `mas.entitlements`를 지정하지 않으면 `@electron/osx-sign`이 `default.mas.plist`를 씁니다. 그 파일에는 **network.client, print, camera, microphone, usb**가 들어 있습니다 (로컬 `node_modules/@electron/osx-sign/entitlements/default.mas.plist`에서 확인). 쓰지 않는 권한을 요청하는 것이 되므로 반드시 위 파일을 지정합니다.

### 2.2 `desktop/build/entitlements.mas.inherit.plist` (Helper 앱, 프레임워크, dylib)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <true/>
  <key>com.apple.security.inherit</key>
  <true/>
</dict>
</plist>
```

- Electron 공식 MAS 가이드의 child entitlements와 같습니다. `Electron Helper`, `Electron Helper (GPU)`, `(Renderer)`, `(Plugin)`, `Electron Framework.framework` 등 안쪽 실행 파일 전부에 적용됩니다.
- 로그인 항목(`setLoginItemSettings`)은 쓰지 않으므로 `entitlementsLoginHelper`는 필요 없습니다. 쓰게 되면 2.4.5(iii) 때문에 사용자 동의가 필요합니다.

---

## 3. electron-builder 설정 (`desktop/package.json` → `build`)

electron-builder **26**은 `mas` 아래에 서명 옵션을 평평하게 둡니다(`entitlements`, `entitlementsInherit`, `provisioningProfile`, `identity`, `type`, `hardenedRuntime`; `node_modules/app-builder-lib/out/options/macOptions.d.ts`에서 확인). 공식 문서 최신판(v27)은 이 옵션들을 `sign` 객체 아래로 옮겼으니, 27로 올릴 때 다시 맞춰야 합니다.

`mas`는 `mac` 설정을 물려받고(`deepAssign(mac, mas)`), `mas-dev`는 `mac` + `mas` + `masDev`를 물려받습니다. 지금 `mac`에 있는 **`"identity": "-"`(임시 서명)와 `"hardenedRuntime": false`가 그대로 내려오므로, `mas`에서 identity를 반드시 덮어써야** 합니다.

```jsonc
// build 안에 추가 (주석은 설명용, 실제 JSON에는 넣지 않음)
"mas": {
  "type": "distribution",
  "identity": "<회사 이름> (<TEAMID>)",          // "Apple Distribution: " 접두어 없이 이름 부분
  "hardenedRuntime": false,                      // MAS는 샌드박스가 필수, 하드닝 런타임은 공증용
  "entitlements": "build/entitlements.mas.plist",
  "entitlementsInherit": "build/entitlements.mas.inherit.plist",
  "provisioningProfile": "build/mas/embedded.provisionprofile",   // git에 넣지 않음, CI에서 복원
  "minimumSystemVersion": "13.0",                // Electron 45 바이너리의 LSMinimumSystemVersion과 같게
  "extendInfo": {
    "ITSAppUsesNonExemptEncryption": false,      // 근거: metadata.md §8
    "ElectronTeamID": "<TEAMID>"
    // CFBundleDocumentTypes는 mac.extendInfo에서 물려받음 (빌드 후 plutil로 확인)
  },
  "extraResources": [
    { "from": "build/mas/PrivacyInfo.xcprivacy", "to": "PrivacyInfo.xcprivacy" },
    { "from": "build/mas/container-migration.plist", "to": "container-migration.plist" }
  ],
  "artifactName": "PDF-Editor-${version}-mas.${ext}"
},
"masDev": {
  "type": "development",
  "identity": "Apple Development: <이름> (<ID>)",
  "provisioningProfile": "build/mas/dev.provisionprofile"
}
```

`scripts`에 추가:

```jsonc
"dist:mas": "npm run build:page && electron-builder --mac mas --universal --publish never",
"dist:mas-dev": "npm run build:page && electron-builder --mac mas-dev --arm64 --publish never"
```

- `buildVersion`: App Store는 업로드마다 `CFBundleVersion`이 커져야 합니다. `version`(=`CFBundleShortVersionString`)은 그대로 두고, CI에서 `-c.buildVersion=$GITHUB_RUN_NUMBER`처럼 넘깁니다.
- `category`: 이미 `public.app-category.productivity` → `LSApplicationCategoryType`. App Store Connect의 주 카테고리(생산성)와 맞아야 합니다.
- `electronLanguages: ["en","en-US","ko"]`: 번들에 `en.lproj`, `ko.lproj`만 남습니다. 스토어의 "언어" 표시는 번들의 `.lproj` 기준이라 영어·한국어로 나옵니다 (`⚠ 확인 필요`: 업로드 후 App Store Connect에서 확인). 2.4.5(ix)(모든 현지화를 한 번들에) 조건도 맞습니다.
- `universal` vs arm64 `[결정]`: App Store Connect에는 한 버전에 `.pkg` 하나만 올라갑니다. 인텔 Mac 사용자를 받으려면 `universal`(`@electron/universal`이 x64·arm64 앱을 합침)로 만듭니다. 이 앱은 네이티브 모듈이 없어서(`@signpdf/*`, `node-forge`, `pdf-lib` 모두 순수 JS) 합치기가 쉽습니다. 단, 나중에 북마크용 네이티브 애드온(§5.3)을 넣으면 그것도 universal로 빌드해야 합니다. 참고: Apple은 macOS 26이 인텔 Mac을 지원하는 마지막 버전이라고 발표했습니다(레퍼런스 저장소 인용, `⚠ 확인 필요`).
- MAS용 Electron 바이너리: electron-builder가 `electron-v45.5.0-mas-<arch>.zip`을 받아 씁니다. 일반 darwin 바이너리는 샌드박스에서 실행되지 않고, 비공개 API 때문에 업로드가 거부될 수 있습니다(Electron 가이드).
- MAS 빌드에서 꺼지는 Electron 모듈: `crashReporter`, `autoUpdater` (이 앱은 둘 다 안 씀). 2.4.5(vii)상 자체 업데이트는 원래 금지입니다.

### 3.1 `build/mas/PrivacyInfo.xcprivacy` (권장, 필수 아님)

Apple 문서상 **required reason API 신고는 iOS·iPadOS·tvOS·visionOS·watchOS 대상이고 macOS는 대상이 아닙니다.** 수집 데이터 신고는 모든 플랫폼이 대상이지만 이 앱은 수집하지 않습니다. 그래서 아래 최소 파일이면 충분합니다. Electron 45.5.0 번들에는 `PrivacyInfo.xcprivacy`가 없습니다(로컬 `find`로 확인).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array/>
</dict>
</plist>
```

참고: 앱이 실제로 쓰는 "required reason" 범주는 파일 타임스탬프(원본 확인의 `stat().mtimeMs`), 디스크 공간(Chromium 내부), 시스템 부팅 시간(Chromium 타이머) 정도로 추정됩니다(`⚠ 확인 필요`). macOS에서는 신고 의무가 없으므로 빈 배열로 둡니다. 나중에 Apple이 macOS까지 넓히면 `NSPrivacyAccessedAPICategoryFileTimestamp` 이유 `C617.1`(앱 컨테이너·사용자가 준 파일의 타임스탬프 표시/비교) 같은 값을 채웁니다.

---

## 4. 샌드박스에서 각 기능이 어떻게 되는가

컨테이너: 샌드박스 앱이 처음 실행되면 `~/Library/Containers/<bundle-id>/`가 생기고, 앱의 `HOME`과 `app.getPath("home"/"appData"/"userData")`가 그 안의 `Data/...`를 가리킵니다. Node의 `os.homedir()`도 `HOME`을 따르므로 **지금 코드는 손대지 않아도 데이터 저장소가 컨테이너로 옮겨 갑니다.** 문제는 사용자 파일 쪽입니다.

| 기능 (코드 위치) | 샌드박스에서 | 판정 | 필요한 일 |
|---|---|---|---|
| PDF 열기 대화상자: `openDialog()` (`main.js`, `pdfe:dialog`) → 페이지 `nativeBrowse()` | 패널에서 고른 파일은 이번 실행 동안 읽기·쓰기 가능 | 동작 | `securityScopedBookmarks: true`로 북마크를 받아 저장 (§5.1) |
| 이미지 가져오기 (`kind:"image"`) | 위와 같음. 한 번 읽고 끝 | 동작 | 북마크 불필요 |
| 저장 폴더 고르기 (`kind:"folder"`, 페이지 `#save-dir-btn`) | 고른 폴더 아래 전부(하위 폴더 포함) 쓰기 가능 | 동작 | 폴더 북마크 저장 → 다음 실행에도 같은 폴더에 바로 저장 |
| **원본 옆에 `_서명.pdf` 저장** (`performSave()` → `S.fs.writeFile(joinPath(dir, fileName))`, 기본 `dir = dirname(source.path)`) | 원본 **파일**만 허락받았고 그 **폴더**는 아님 → `EPERM` | **깨짐** | §5.2: 폴더 북마크가 있으면 바로 쓰고, 없으면 NSSavePanel(`dialog.showSaveDialog`)을 원본 폴더·파일 이름을 채워서 띄움 |
| 같은 이름 덮어쓰기 확인 (`checkSaveTarget()` → `exists`/`stat`) | 폴더 권한이 없으면 `EPERM` | 일부 깨짐 | `EPERM`은 "확인 못 함"으로 처리. NSSavePanel이 자체 덮어쓰기 확인을 함 |
| 마지막 저장 파일 다시 덮어쓰기 | 저장 패널에서 받은 **파일** 북마크로 그 파일은 다시 쓸 수 있음 | 동작 | 임시 파일+rename 방식으로 바꾸면 폴더 권한이 필요하니, 지금처럼 직접 쓰기 유지 |
| **창으로 돌아올 때 원본 확인** (`refreshFileChecks()` → `fileStateOf()` → `stat`/`readFile`/해시) | 이번 실행에 연 파일은 됨. **다음 실행부터는 북마크 없으면 `EPERM`** → 지금 코드는 "missing(사라짐)"으로 잘못 표시 | **깨짐** | 북마크로 접근 + 새 상태 `"noaccess"`("확인하려면 권한 필요", 버튼 "다시 연결") |
| **Finder에서 옮긴 원본 추적** (`relinkSource()`, 해시로 같은 내용 찾기) | 보안 북마크는 원래 파일 이동·이름 변경을 따라가지만, **Electron API는 북마크를 해석한 새 경로를 돌려주지 않음** (`startAccessingSecurityScopedResource`는 stop 함수만 반환) | 그대로(수동 재연결) | 1차: 지금처럼 "사라짐 → 다시 찾기". 2차: 네이티브 애드온으로 해석된 새 경로 받기 (§5.3) |
| Finder "다음으로 열기"/Dock 드롭: `app.on("open-file")` → `openFromOs()` | 시스템이 그 파일 접근을 열어 줌(이번 실행 동안) | 동작 | **Electron에는 이 경로로 북마크를 만드는 API가 없음** → 다음 실행에는 "권한 필요". 1차: 그대로 두고 상태만 정확히 표시. 2차: 네이티브 애드온 |
| 창에 끌어다 놓기: `pathForFile()` (`webUtils.getPathForFile`) → `openPdfPath()` → main의 `fs.readFile` | 드래그로 받은 파일은 접근이 열린다고 Apple 문서에 있음(Dock 아이콘 기준). 창 드롭도 같을 것으로 예상 | 동작 예상 `⚠ 확인 필요` | 실패하면 페이지 `openPdfFile(File)`(렌더러가 직접 읽기)로 대체 |
| 데이터 저장소 `~/Library/Application Support/PDF Editor` (페이지 `Store.DIR`) | `paths.toOs("~/...")` → 컨테이너 안 경로. 읽기·쓰기 자유 | 동작 | 기존 사용자 데이터 이전 (§6) |
| Electron 데이터(`userData` = `.../PDF Editor/.electron`), `window-state.json`, 단일 인스턴스 잠금 | 컨테이너 안 | 동작 | 없음 |
| `shell.openPath` (저장 후 "열기", `openPath(Store.DIR)`) | 접근 권한이 있는 파일을 다른 앱으로 여는 것은 허용될 것으로 예상. 열기 전에 하는 `fsp.stat`은 권한이 필요 | 동작 예상 `⚠ 확인 필요` | 북마크 접근 래퍼 안에서 `stat` |
| `shell.showItemInFolder` ("Finder에서 보기") | NSWorkspace로 Finder에 보여 주기는 샌드박스에서도 됨 (예상) | 동작 예상 `⚠ 확인 필요` | 없음 |
| `shell.trashItem` | 앱이 지우는 것은 저장소 안 자기 파일뿐 → 컨테이너 안 | 동작 | 없음 |
| `openDialog`의 `defaultPath` (`lastDir`, `recentDirs`, `~/Documents`) | 패널은 다른 프로세스라 아무 폴더에서나 시작 가능. 단 페이지가 그 전에 하는 `S.fs.exists(from)`은 권한 없어서 `false` → 늘 `~`로 떨어짐 | 일부 어긋남 | MAS에서는 `exists` 검사를 건너뛰고 그대로 넘김. "~"를 **실제 홈**으로 매핑 (§5.4) |
| 앱 안 파일 탐색기 (`#dlg-files`, `browse()`의 `fbLoad()`/`basePlaces()`: `readdir("~")`, `/Volumes`, iCloud 폴더) | 데스크톱 앱에서는 `S.desktop.dialog`가 있어서 **이미 쓰이지 않음**(`nativeBrowse()`로 감). 샌드박스에서는 `readdir`이 대부분 `EPERM` | 쓰지 않음 | MAS에서도 네이티브 패널만 쓰게 유지. 앱 안 탐색기로 돌아가는 경로가 없는지 확인 |
| 외부 링크 `openExternal` (https만), 도움말 › GitHub | LaunchServices로 기본 브라우저가 엶. `network.client` 필요 없음 | 동작 | 없음 |
| 클립보드 복사 `navigator.clipboard.writeText` | 권한 불필요 | 동작 | 없음 |
| `app://pdf-editor/` 프로토콜, 오프라인 폰트·pdf.js | 번들 안 파일만 읽음 | 동작 | 없음 |
| 봉인 키 `safeStorage` (Keychain, `seal/` 폴더) | 샌드박스 앱은 자기 Keychain 항목은 씀 (예상). DMG판이 만든 "PDF Editor Safe Storage" 항목은 서명 주체가 달라 못 읽음 | 새 키는 동작 예상 `⚠ 확인 필요`. 옛 키는 깨짐 | §6.3 .p12로 옮기기. `safeStorage.isEncryptionAvailable()`을 `ready` 후 확인 |
| PKCS#12 내보내기/가져오기 | 저장·열기 패널 경유라 동작 | 동작 | 북마크 불필요 |
| 나중에: RFC 3161 타임스탬프 (네트워크) | `network.client` 필요 | 미정 | entitlement 추가 + export compliance 재검토 (metadata.md §8.5) |

---

## 5. 코드 변경 계획 (한 코드베이스 유지)

원칙: **`process.mas`가 `true`일 때만** 달라지게 합니다. DMG(mac)·Windows 빌드 동작은 그대로 둡니다. `process.mas`는 Electron MAS 빌드에서만 `true`입니다. 샌드박스 preload에서는 `process` 객체가 제한되므로, main이 `pdfe:sync "info"` 응답에 `mas: !!process.mas`를 실어 보내고 preload가 `desktop.sandboxed`로 노출합니다.

### 5.1 `desktop/src/bookmarks.js` (새 파일, main 전용)

- 저장 위치: `path.join(app.getPath("userData"), "bookmarks.json")` (컨테이너 안). **페이지에는 북마크 데이터를 절대 넘기지 않습니다.** 페이지는 경로만 압니다.
- 형식: `{ "<OS 절대경로>": { "b": "<base64 bookmark>", "dir": true|false, "at": <ms> } }`, 최대 500개, 오래된 것부터 정리.
- `remember(osPath, bookmark, isDir)`, `forget(osPath)`, `lookup(osPath)` → 정확히 같은 경로, 없으면 가장 가까운 상위 폴더 북마크.
- `withAccess(osPath, fn)`:

```js
// 설명용 스케치 (실제 구현 아님)
async function withAccess(osPath, fn) {
  if (!process.mas) return fn();
  const hit = lookup(osPath);
  if (!hit) return fn();                  // 이번 실행에 받은 권한(패널/드롭/open-file)으로 시도
  let stop = null;
  try { stop = app.startAccessingSecurityScopedResource(hit.b); } catch {}
  try { return await fn(); }
  finally { try { stop?.(); } catch {} }   // 반드시 호출: 안 하면 커널 자원이 샘 (Electron 문서)
}
```

### 5.2 `desktop/src/main.js`

| 위치 | 변경 |
|---|---|
| 맨 위 상수 | `const IS_MAS = !!process.mas;` |
| `createPathMapper({...})` 호출 | MAS에서는 `home`을 **실제 사용자 홈**으로(`os.userInfo().homedir`, 샌드박스에서도 `/Users/<이름>`을 돌려주는지 `⚠ 확인 필요`), 그리고 `~/Library/Application Support/...`는 컨테이너의 `app.getPath("appData")`로 매핑. 이유: 페이지에 기록된 원본 경로(`~/Documents/a.pdf`)가 실제 파일을 가리키고, 열기 패널 시작 위치도 실제 폴더가 됨. (그냥 두면 `~`가 컨테이너 `Data`가 되어 표시 경로가 모두 이상해짐) |
| `openDialog(o)` | `opts.securityScopedBookmarks = IS_MAS`. 결과 `r.bookmarks[i]`가 빈 문자열이 아니면 `bookmarks.remember(r.filePaths[i], r.bookmarks[i], kind === "folder")` |
| 새 IPC `pdfe:dialog-save` → `saveDialog({ start, name, title })` | `dialog.showSaveDialog(win, { defaultPath: path.join(dir, name), filters: [{name:"PDF", extensions:["pdf"]}], properties: ["createDirectory"], securityScopedBookmarks: IS_MAS })` → `{ path: paths.toPage(r.filePath) }`. 북마크 저장(`dir:false`). 주의: 이 옵션을 켜면 **파일이 없을 때 빈 파일을 먼저 만든다**(Electron 문서) → 저장이 실패하면 0바이트 파일을 지우는 처리 필요 |
| 새 IPC `pdfe:access` → `request(pagePath)` | 원본·저장 폴더 권한을 다시 받는 흐름: `openDialog({kind:"folder"\|"pdf", start: 그 위치})`를 "이 폴더 허용" 문구로 띄움 |
| `FS.*` (`readFile`, `writeFile`, `stat`, `exists`, `readdir`, `mkdir`, `rename`, `rm`, `copyFile`) | 각 함수 본문을 `withAccess(osPath(p), () => …)`로 감쌈. 저장소 안(컨테이너) 경로는 래퍼가 바로 통과 |
| `errText(err)` | 샌드박스 거부(`EPERM`/`EACCES`)를 그대로 보내되, `stat` 거부를 페이지가 "missing"으로 오해하지 않도록 코드 유지가 중요 (`ENOENT`만 missing) |
| `pdfe:shell` `openPath`/`showItemInFolder` | `withAccess` 안에서 `fsp.stat` 후 실행 |
| `app.on("open-file")` → `openFromOs()` | 그대로. (북마크 못 만듦 → 다음 실행에 `noaccess`) |
| `setMenu()` › `helpMenu()` | **개인정보 처리방침**, **지원/문의** 메뉴 항목 추가 (5.1.1(i)은 앱 안에서도 쉽게 볼 수 있는 링크를 요구, 1.5는 연락 방법). MAS/DMG 공통으로 넣어도 됨. 언어 전환(`desktop.setLanguage`)과 함께 라벨 2개 언어로 |
| 새 메뉴 `이전 버전 데이터 가져오기…` (MAS만) | §6.2 |
| `registerIpc()` › `pdfe:sync "info"` | `mas: IS_MAS` 추가 |

### 5.3 (2차) 네이티브 애드온 — 드롭/open-file 파일의 북마크, 이동 추적

Electron에는 (1) 임의 경로로 보안 북마크를 만드는 API, (2) 북마크를 해석해 **현재 경로**와 stale 여부를 받는 API가 없습니다(2026-11 Electron `app`·`dialog` 문서 기준). 둘 다 필요하면 작은 N-API 애드온(Objective-C, `NSURL bookmarkDataWithOptions:NSURLBookmarkCreationWithSecurityScope` / `URLByResolvingBookmarkData:options:NSURLBookmarkResolutionWithSecurityScope ... bookmarkDataIsStale:`)을 만듭니다.
- 이점: Finder에서 원본을 옮기거나 이름을 바꿔도 앱이 따라갑니다(지금 DMG판보다 나아짐). stale이면 새로 만들어 저장합니다.
- 비용: universal 빌드, 서명, Electron 버전마다 재빌드. 쓸 만한 npm 패키지가 있는지는 확인하지 못했습니다(`⚠ 확인 필요`). 1차 출시에는 넣지 않는 것을 권합니다.

### 5.4 `desktop/src/paths.js`

- `createPathMapper({ platform, home, appData, override, mapAppSupport })`: 지금은 `mapAppSupport = platform !== "darwin" && !override`로 고정. 옵션으로 받아 MAS에서 `true`로 넘길 수 있게 합니다. 나머지 로직은 그대로.
- 테스트: `desktop/test/`에 MAS 매핑 단위 테스트(`home=/Users/u`, `appData=/Users/u/Library/Containers/x/Data/Library/Application Support`) 추가.

### 5.5 `desktop/src/preload.js`

- `desktop.sandboxed` (bool, `info.mas`)
- `desktop.dialog.save({ start, name, title })` → page path 또는 `null`
- `desktop.access.request(path)` → `true/false`
- 나머지(`fs`, `shell`, `dialog.open`, `pathForFile`, `onOpenFile`)는 이름 그대로

### 5.6 `web/pdf-editor.html` (다른 작업이 끝난 뒤, 함께 조율)

| 함수 | 변경 |
|---|---|
| `fileStateOf(fp)` | `catch`에서 `ENOENT`만 `"missing"`, `EPERM`/`EACCES`는 `"noaccess"` |
| `sourceLabel()`, `fileLabel()`, `needsCheck()` | `"noaccess"` 문구: ko "권한이 필요해 확인하지 못함" / en "Needs permission to check". 버튼 "다시 연결"(`relinkSource()` 재사용) |
| `openSaveDialog()` / `performSave()` | `S.desktop.sandboxed`이고 저장 폴더 권한이 없으면(첫 `writeFile`이 `EPERM`) `S.desktop.dialog.save({start: dir, name: fileName})`로 넘어감. 폴더 행 문구 "폴더를 한 번 허용하면 다음부터 바로 저장" |
| `checkSaveTarget()` | `EPERM`이면 경고 문구 대신 "저장할 때 확인" |
| `nativeBrowse()` | `sandboxed`면 `S.fs.exists(from)` 검사 생략 |
| `browse()` 앱 안 탐색기 | `sandboxed`면 절대 쓰지 않음 |
| 설정/정보 화면 | "개인정보 처리방침", "지원" 링크 (`openExternal`) |

### 5.7 CI (`.github/workflows/release.yml`) — 나중에

- macOS 잡에 `dist:mas` 단계를 따로 둡니다(인증서·프로파일 Secrets 필요). 지금 `CSC_IDENTITY_AUTO_DISCOVERY: "false"`는 DMG용이니 MAS 단계에서는 빼야 합니다.
- 업로드 전 검사: `xattr -lr "PDF Editor.app" | grep com.apple.quarantine`가 비어 있어야 함 (2025-02-18부터 quarantine 속성이 있으면 업로드 거부, Apple Upcoming requirements).
- 업로드: **Transporter**(앱 또는 CLI) 또는 `xcrun altool --upload-app -f <pkg> -t macos --apiKey ... --apiIssuer ...`. `notarytool`은 **공증 전용**이라 App Store 업로드에는 쓰지 않습니다. MAS 빌드는 공증하지 않습니다.

---

## 6. 기존 DMG 사용자 데이터 이전

기존 저장소(실제 Mac에서 확인한 구성): `~/Library/Application Support/PDF Editor/` 안에 `prefs.json`, `documents.json`, `library.json`, `library/`(서명·도장 이미지), `docs/`(PDF 사본), `thumbs/`, `.electron/`(Chromium 캐시·창 크기), 앞으로 `seal/`(봉인 키).
주의: `desktop/README.md`에 따르면 이 폴더는 **Claude에 설치된 앱과 함께 씁니다.** 옮기면 DMG판·Claude판에서 데이터가 사라질 수 있습니다. `[결정]` 공유를 끊어도 되는지.

### 6.1 1안: `container-migration.plist` (첫 실행 때 시스템이 처리)

`Contents/Resources/container-migration.plist` (위 `extraResources`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Move</key>
  <array>
    <string>${ApplicationSupport}/PDF Editor/prefs.json</string>
    <string>${ApplicationSupport}/PDF Editor/documents.json</string>
    <string>${ApplicationSupport}/PDF Editor/library.json</string>
    <string>${ApplicationSupport}/PDF Editor/library</string>
    <string>${ApplicationSupport}/PDF Editor/docs</string>
    <string>${ApplicationSupport}/PDF Editor/thumbs</string>
    <!-- .electron(캐시)와 seal/(다른 서명 주체의 Keychain으로 암호화된 키)은 옮기지 않는다 -->
  </array>
</dict>
</plist>
```

- Apple 문서: 원본 경로의 변수는 홈 기준, 대상은 컨테이너 최상위 기준으로 펼쳐지고 "같은 상대 위치로 복사"한다고 적혀 있습니다. 키 이름은 `Move`이고, 포럼에는 실제로 옮겨져(원본이 사라져) 버렸다는 경험담과 iCloud 데스크탑·문서 설정에서 동작하지 않았다는 보고(FB16099616)가 있습니다. **복사인지 이동인지 `mas-dev`로 반드시 확인**합니다(`⚠ 확인 필요`).
- 컨테이너가 처음 만들어질 때 **한 번만** 돕니다. 테스트할 때는 `~/Library/Containers/<bundle-id>`를 지우고 다시 실행합니다.
- 옮긴 `documents.json`의 원본 경로는 북마크가 없으므로 전부 `"noaccess"`로 시작합니다. 앱은 `docs/`의 사본으로 계속 열리고 작업할 수 있습니다. 원본 확인이 필요한 문서만 "다시 연결"하면 됩니다.

### 6.2 2안(1안과 함께): 앱 안 "이전 버전 데이터 가져오기…"

- MAS 빌드의 파일 메뉴(또는 첫 실행 안내)에서 열기 패널을 `defaultPath: <실제 홈>/Library/Application Support/PDF Editor`, `openDirectory`로 띄웁니다. 사용자가 "열기"를 누르면 그 폴더 읽기 권한이 생기고, main이 위 목록만 컨테이너 저장소로 **복사**합니다(원본은 그대로 → DMG판·Claude판도 계속 동작).
- 컨테이너에 이미 데이터가 있으면 덮어쓰기 전에 묻고, 기존 파일은 `*.before-import-<시각>`으로 남깁니다(페이지 `readJSON()`의 손상 파일 보관 방식과 같은 원칙).
- 1안이 실패하는 환경(iCloud 데스크탑·문서 사용 등)의 안전망입니다.

### 6.3 봉인 키

- DMG판 키는 DMG판 서명 주체에 묶인 Keychain 항목으로 암호화되어 있어 MAS판이 풀 수 없습니다. 그래서 `seal/`은 옮기지 않습니다.
- 출시 안내: "DMG판에서 봉인하는 사람 › 백업(.p12)으로 내보낸 뒤, Mac App Store판에서 가져오기". 같은 인증서(지문)를 유지하므로 받는 사람에게 알려 준 지문이 바뀌지 않습니다.
- 백업 없이 옮기면 새 신원을 만들어야 하고 지문이 바뀝니다. 이 점을 가져오기 화면에서 알려 줍니다.

---

## 7. 테스트 계획

### 7.1 로컬 `mas-dev`

1. Apple Development 인증서 + macOS App Development 프로파일(이 Mac UDID 포함) 준비 → `npm run dist:mas-dev`.
2. 서명·entitlement 확인:
   - `codesign -dv --verbose=4 "dist/mas-dev-arm64/PDF Editor.app"`
   - `codesign -d --entitlements - "dist/mas-dev-arm64/PDF Editor.app"` → §2.1 키만 있어야 함 (+ 자동 추가된 application-identifier, team-identifier, application-groups)
   - Helper 각각: `codesign -d --entitlements - ".../Contents/Frameworks/PDF Editor Helper (Renderer).app"` → sandbox + inherit
   - `codesign --verify --deep --strict --verbose=2 ".../PDF Editor.app"`
   - `plutil -p ".../Contents/Info.plist" | grep -E "ITSAppUses|ElectronTeamID|LSMinimum|CFBundleDocumentTypes|LSApplicationCategoryType|CFBundleVersion"`
3. 실행 후 활동 모니터에 "샌드박스" 열을 켜서 `예`인지, `~/Library/Containers/<bundle-id>/Data/Library/Application Support/PDF Editor`가 생겼는지 확인.
4. 샌드박스 거부 로그:
   - 콘솔.app에서 `sandbox` 또는 `deny`로 필터
   - 터미널: `log stream --style compact --predicate 'sender == "Sandbox" AND eventMessage CONTAINS "PDF Editor"'`
5. 시나리오(각각 거부 로그가 없어야 함, 또는 예상한 거부만 있어야 함):

| # | 시나리오 | 기대 |
|---|---|---|
| T1 | 첫 실행 (컨테이너 없음, 옛 저장소 있음) | 1안 이전 결과 확인 (복사/이동/실패 기록) |
| T2 | 예시 문서로 둘러보기 → 서명 놓기 → 저장 | 저장 패널(또는 다운로드) 경유 저장 성공 |
| T3 | 열기 패널로 `~/Documents/a.pdf` 열기 → 저장 기본값(원본 폴더) | 첫 저장은 저장 패널이 원본 폴더·`a_서명.pdf`로 열림. "폴더 허용" 후에는 바로 저장 |
| T4 | 앱 종료 → 재실행 → 보관함 | 열기 패널로 연 원본은 북마크로 "같음", 드롭/Finder로 연 원본은 "권한 필요" (missing 아님) |
| T5 | Finder에서 원본 이름 변경 후 창으로 돌아오기 | 1차: "사라짐 → 다시 찾기". (2차 애드온이면 따라감) |
| T6 | Finder 더블클릭/다음으로 열기, Dock 아이콘에 드롭, 창에 드롭 | 열림. 창 드롭에서 `EPERM`이면 렌더러 읽기로 대체되는지 |
| T7 | 저장 후 "열기", "Finder에서 보기", 저장소 폴더 보기 | 동작 |
| T8 | 봉인: 신원 만들기 → 봉인해서 저장 → 봉인 확인 → 앱 재시작 후 다시 봉인 | Keychain 접근 프롬프트 없이 동작. `safeStorage.isEncryptionAvailable()` true |
| T9 | .p12 내보내기 → 다른 컨테이너(컨테이너 삭제 후)에서 가져오기 | 지문 같음 |
| T10 | "이전 버전 데이터 가져오기" | 복사, 원본 유지, 충돌 시 질문 |
| T11 | 네트워크 끊고 전체 시나리오 | 차이 없음 (오프라인 앱) |
| T12 | `allow-jit` 뺀 빌드로 T2 반복 | 죽지 않으면 entitlement 삭제 |
| T13 | 한국어/영어 전환, 메뉴의 개인정보 처리방침·지원 링크 | 기본 브라우저로 열림 |
| T14 | 외장 디스크·iCloud Drive·네트워크 볼륨의 PDF | 패널로 연 경우 동작 |

### 7.2 배포 빌드 (`mas`)

- `Apple Distribution`으로 서명한 앱은 **로컬에서 실행되지 않습니다**(스토어에서 받은 경우만 실행, Electron 가이드). 실제 실행 검증은 **TestFlight(macOS)** 내부 테스트로 합니다.
- `pkgutil --check-signature dist/mas-universal/PDF-Editor-<v>-mas.pkg` → `3rd Party Mac Developer Installer`
- `lipo -archs ".../Contents/MacOS/PDF Editor"` → `x86_64 arm64` (universal인 경우)
- `xattr -lr` → quarantine 없음
- `xcrun altool --validate-app -f <pkg> -t macos ...` → 업로드 전 검증
- Transporter로 업로드 → App Store Connect에서 처리 완료 메일·경고(ITMS-xxxxx) 확인 → TestFlight 설치 → 7.1 시나리오 반복

### 7.3 자동 테스트

- 지금 `npm test`(`test/smoke.mjs`)는 `PDFE_HOME_OVERRIDE`로 임시 홈을 쓰는 비샌드박스 실행입니다. MAS 빌드는 환경변수 주입·자동 실행이 어렵기 때문에 위 수동 표를 릴리스 체크리스트로 씁니다.
- 단위 테스트로 가능한 것: `paths.js` MAS 매핑, `bookmarks.js`의 `lookup`(상위 폴더 찾기, 개수 제한), `fileStateOf`의 `EPERM → noaccess`.

---

## 8. Electron 버전 정책

- Electron은 **최신 안정 메이저 3개**만 지원합니다. 2026-11 기준 지원 중: 43, 44, 45. **45의 지원 종료 예정일은 2027-04-27**, 46 안정판은 2027-01-05 예정(releases.electronjs.org/schedule, 날짜는 잠정).
- App Store에는 macOS용 최소 SDK/Xcode 규정이 지금 없습니다(Apple Upcoming requirements: SDK 규정은 iOS·iPadOS·tvOS·visionOS·watchOS만). Electron 45.5.0 MAS 바이너리의 빌드 SDK 정보는 업로드 검사에서 문제 될 수 있으니 업로드 경고를 확인합니다. 참고로 로컬 darwin 바이너리는 `Info.plist`의 `DTSDKName=macosx15.5`, `DTXcode=1640`, `LC_BUILD_VERSION`의 `minos 13.0, sdk 26.5`로 서로 다르게 적혀 있습니다(`⚠ 확인 필요`).
- 운영 규칙(권장): 지원 종료 전에 다음 메이저로 올려 다시 심사. 보안 패치(마이너)는 스토어 업데이트로만 배포(2.4.5(vii)).
- 2019년에 Electron 6·7 앱이 비공개 API(`CAContext`, `CALayerHost` 등) 때문에 대량 거부된 일이 있었고, 이후 MAS 빌드에서 빠졌습니다. 2025~2026년에 같은 사례 보고는 찾지 못했습니다. 업로드 시 "non-public API" 메일이 오면 MAS용 Electron을 썼는지부터 확인합니다(Electron 가이드).

---

## 출처

- Apple App Review Guidelines 2.4.5, 2.5.1, 2.5.2 — https://developer.apple.com/app-store/review/guidelines/
- Apple, Accessing files from the macOS App Sandbox — https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox
- Apple, Migrating your app's files to its App Sandbox container — https://developer.apple.com/documentation/security/migrating-your-app-s-files-to-its-app-sandbox-container
- Apple, entitlement `com.apple.security.files.user-selected.read-write` — https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.files.user-selected.read-write
- Apple, entitlement `com.apple.security.files.downloads.read-write` — https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.files.downloads.read-write
- Apple, Privacy manifest files — https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
- Apple, Describing use of required reason API — https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api
- Apple, Upcoming requirements (quarantine 속성, SDK 규정) — https://developer.apple.com/news/upcoming-requirements/
- Apple, Upload builds — https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds
- Apple Developer Forums, container-migration.plist — https://developer.apple.com/forums/thread/763674 , https://developer.apple.com/forums/thread/767586
- Electron, Mac App Store Submission Guide — https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide
- Electron, `dialog` (`securityScopedBookmarks`) — https://www.electronjs.org/docs/latest/api/dialog
- Electron, `app.startAccessingSecurityScopedResource` — https://www.electronjs.org/docs/latest/api/app
- Electron, Release schedule — https://releases.electronjs.org/schedule
- electron-builder, MAS — https://www.electron.build/docs/mas (v27 문서. 이 저장소는 v26이라 옵션 위치가 다름)
- 로컬 확인: `desktop/node_modules/@electron/osx-sign/entitlements/default.mas.plist`, `.../dist/cjs/util-entitlements.js`, `desktop/node_modules/app-builder-lib/out/mac/MacTargetHelper.js`, `desktop/node_modules/electron/dist/Electron.app/Contents/Info.plist`
