# Mac App Store 출시 준비

PDF Editor 데스크톱 앱(`desktop/`, Electron)을 **회사 명의(조직 개발자 계정, D-U-N-S 등록 완료)**로 Mac App Store에 내기 위한 준비 문서입니다.
지금 DMG는 임시 서명(ad-hoc)으로 스토어 밖에서 배포하고, 디스크 어디든 읽고 쓰는 구조입니다. 스토어에 내려면 **App Sandbox**에 맞게 파일 접근을 다시 설계해야 하는 것이 가장 큰 일입니다.

작성일 2026-11-25. 코드는 바꾸지 않았고, 이 폴더에 문서만 썼습니다.

| 문서 | 내용 |
|---|---|
| [sandbox-plan.md](sandbox-plan.md) | entitlements 파일, electron-builder `mas` 설정, 기능별 샌드박스 영향과 코드 변경, 데이터 이전, 테스트 계획 |
| [metadata.md](metadata.md) | 제품 페이지 글(한국어·영어), 이름 후보, 키워드, App Privacy, **수출 규정 답과 근거**, 연령 등급, 심사 메모, URL |
| [privacy-policy.md](privacy-policy.md) | 개인정보 처리방침 초안(한국어·영어) |
| [reference-notes.md](reference-notes.md) | mjmirza/app-store-compliance에서 가져온 것, 맞지 않는 것, 사용한 공식 자료 |
| [featuring.md](featuring.md), [featuring-assets.md](featuring-assets.md) | (다른 작업) 피처링 요청과 영상·스크린샷 자료 |

표시: `⚠ 확인 필요` = 공식 문서로 확인하지 못했거나 실제 빌드로 확인해야 함 · `[결정]` = 회사가 정할 일 · `[조건부]` = 봉인 기능처럼 출시 빌드에 들어갈 때만 해당

---

## 1. 핵심 요약

1. **샌드박스 때문에 깨지는 기능**: (a) 원본 옆에 `_서명.pdf`로 바로 저장, (b) 다음 실행에서 원본·저장 파일을 다시 확인(지금 코드는 권한 오류를 "파일 사라짐"으로 잘못 표시하게 됨), (c) Finder·드롭으로 연 파일을 다음 실행에도 추적. 열기 패널, 이미지 가져오기, 보관함(앱 데이터), 봉인 키 새로 만들기는 그대로 동작할 것으로 봅니다. → 보안 범위 북마크 + 저장 패널 + "권한 필요" 상태로 고칩니다([sandbox-plan.md](sandbox-plan.md) §4~5).
2. **데이터 위치가 바뀝니다**: `~/Library/Application Support/PDF Editor` → `~/Library/Containers/<bundle-id>/Data/Library/Application Support/PDF Editor`. 기존 DMG 사용자를 위해 `container-migration.plist` + 앱 안 "이전 버전 데이터 가져오기"를 함께 둡니다. 봉인 키는 옮겨지지 않아 .p12 백업·가져오기로 안내합니다.
3. **수출 규정**: 이 앱의 암호 기능은 디지털 서명·무결성·인증과 그 키 관리뿐이고, 키 보관은 macOS 키체인입니다. 미국 EAR 5A002.a Technical Note 1의 제외 항목에 들어가므로 **`ITSAppUsesNonExemptEncryption = NO`**, App Store Connect에서는 "면제 대상"으로 답하는 것이 맞다고 봅니다. **법무 확인 후 확정**([metadata.md](metadata.md) §8).
4. **App Privacy**: "데이터를 수집하지 않음". 네트워크 자체를 쓰지 않습니다.
5. **이름**: "PDF Editor"는 스토어에 같은·비슷한 이름이 많고, 일반 명사라 상표 보호가 어렵고, 기능(글자 편집이 아니라 서명·도장 얹기)과도 어긋납니다. 새 이름이 필요합니다.

---

## 2. 우선순위 체크리스트

담당: **code**(개발), **ASC**(App Store Connect·Apple Developer 계정 관리자), **legal**(법무/경영). 작업량: S(반나절 이하), M(1~3일), L(1주 이상). 상태: 따로 적지 않은 것은 `todo`.

### 2.1 Blockers — 이것 없이는 업로드·심사 통과가 안 됨

| # | 항목 | 담당 | 작업량 | 상태 | 근거·참고 |
|---|---|---|---|---|---|
| B1 | **Bundle ID 확정**(업로드 후 변경 불가). 회사 도메인 기반 권장. App ID 등록, App Store Connect에 앱 레코드 생성(이름·기본 언어·SKU) | ASC, legal | S | todo | App information; [sandbox-plan](sandbox-plan.md) §1 |
| B2 | **앱 이름 확정**(30자 이하, 스토어 중복 없음, 상표 검색) — "PDF Editor"는 쓰지 않음 | legal, ASC | M | todo | 2.3.7, 4.1, 5.2; [metadata](metadata.md) §1 |
| B3 | 인증서: **Apple Distribution**, **Mac Installer Distribution**, **Apple Development**. 프로파일: Mac App Store Connect 배포용, macOS 개발용 | ASC | S | todo | Electron MAS 가이드; [sandbox-plan](sandbox-plan.md) §1 |
| B4 | electron-builder `mas`/`masDev` 설정(상속되는 `identity: "-"` 덮어쓰기), `dist:mas` 스크립트, `buildVersion` 증가 규칙 | code | S | done (code) | [sandbox-plan](sandbox-plan.md) §3; **desktop**: `desktop/package.json` `mas`/`masDev` + `desktop/electron-builder.mas.cjs` (상속되는 `mac.identity "-"` 제거, 서명 설정은 환경변수), `dist:mas`(universal)/`dist:mas-dev`, `MAS_BUILD_VERSION` → CFBundleVersion (CI: run number) |
| B5 | **entitlements 파일 2개**(최소 권한). `@electron/osx-sign` 기본 템플릿(camera·mic·usb·print·network 포함)을 쓰지 않기 | code | S | done (code) | 2.4.5(i); [sandbox-plan](sandbox-plan.md) §2; **desktop**: `desktop/build/entitlements.mas.plist`: app-sandbox, user-selected.read-write, bookmarks.app-scope만; helper용 inherit 파일. application-groups(`<TEAMID>.com.falconoon.sealmark`)는 서명할 때 osx-sign이 추가 — 없으면 MAS Electron이 시작하자마자 죽음(로컬 확인) |
| B6 | **샌드박스 파일 접근 재설계**: 북마크 저장소, `withAccess` 래퍼, 저장 패널 경유 저장, `noaccess` 상태(페이지), 열기 패널 `exists` 검사 생략 | code | L | page done (`noaccess` 상태·접근 허용·저장 패널 대체·`exists` 생략) · desktop done | 2.4.5(i), 2.5.2, 2.1(깨진 기능은 거부 사유); [sandbox-plan](sandbox-plan.md) §4~5; **desktop**: `src/bookmarks.js`, 모든 fs/shell을 `withAccess()`로, 열기·저장 패널 북마크, `dialog.save`, `access.request`, `desktop.sandboxed`; 샌드박스에서는 stat/exists도 읽기 권한을 확인해 EPERM(샌드박스 자체는 메타데이터를 막지 않음). `npm run test:sandbox`로 실제 샌드박스에서 확인 |
| B7 | **`ITSAppUsesNonExemptEncryption = NO`** 넣기 + 법무 확인. 없으면 빌드가 "Missing Compliance"에 머묾 | code, legal | S | done (code) · legal 확인 대기 | [metadata](metadata.md) §8; **desktop**: `ITSAppUsesNonExemptEncryption = false` (mac.extendInfo → mas도 물려받음) |
| B8 | **개인정보 처리방침 URL**(macOS 필수) 게시 + **앱 안 링크**(도움말 메뉴) | legal, code | S | page done (Sealmark 정보 창·홈 옆 패널 링크, `desktop.links`) · URL 게시 todo · desktop done | 5.1.1(i), App information; [privacy-policy](privacy-policy.md); **desktop**: 도움말 › 개인정보 처리방침 / Privacy Policy 메뉴 |
| B9 | **지원 URL**(필수, 회사 연락처가 보이는 페이지) + 앱 안 "지원/문의" | legal, code | S | page done (지원 링크) · URL 게시 todo · desktop done | 1.5, Platform version information; **desktop**: 도움말 › 지원 / Support 메뉴 |
| B10 | **App Privacy** 답: 데이터를 수집하지 않음 | ASC | S | todo | [metadata](metadata.md) §7 |
| B11 | **연령 등급 질문지**(새 질문 포함) → 4+ | ASC | S | todo | [metadata](metadata.md) §9 |
| B12 | **Mac 스크린샷**: 16:10, 1280×800 / 1440×900 / 2560×1600 / 2880×1800 중 하나, 알파 없음, 1~10장, 한국어·영어 | ASC, code | M | todo | Screenshot specifications; [metadata](metadata.md) §12 |
| B13 | **EU DSA trader 상태** 신고(회사 주소·전화·이메일이 EU 페이지에 공개). EU에 안 내더라도 상태 선언 필요 | ASC, legal | S | todo | Upcoming requirements(2025-02-17) |
| B14 | 계약: 최신 Apple Developer Program License Agreement 동의(Account Holder). 무료 앱이라 유료 앱 계약·세금·은행은 IAP·유료화 전까지 불필요 | ASC | S | todo | 레퍼런스 APPLE.md (`⚠ 확인 필요`: 계정 알림 확인) |
| B15 | **빌드 패키지 1개**: universal(권장) 또는 arm64 전용 `[결정]`. `.pkg`는 `3rd Party Mac Developer Installer`로 서명 | code | S | done (code) | [sandbox-plan](sandbox-plan.md) §3; **desktop**: `--universal`; 서명 없이 universal 패키징 확인(`lipo -archs`: x86_64 arm64). .pkg 서명은 인증서가 있어야 함 |
| B16 | 업로드 전 검사: quarantine 속성 없음(`xattr -lr`), `altool --validate-app`, Transporter 업로드 | code | S | done (CI) | Upcoming requirements(2025-02-18), Upload builds; **desktop**: `release.yml`의 `mas` 잡: quarantine 검사, codesign·entitlements·lipo·pkgutil 확인, API 키가 있으면 `altool --validate-app`; 업로드는 저장소 변수 `MAS_UPLOAD=true`일 때만 |
| B17 | 심사 연락처(국제 형식 전화번호) + 심사 메모 | ASC | S | todo | [metadata](metadata.md) §10 |

### 2.2 Required — 제출 전에 끝내야 하는 것

| # | 항목 | 담당 | 작업량 | 상태 | 근거·참고 |
|---|---|---|---|---|---|
| R1 | **기존 사용자 데이터 이전**: `container-migration.plist`(복사/이동 확인) + "이전 버전 데이터 가져오기…" 메뉴 | code | M | done (code) · TestFlight 확인 대기 | [sandbox-plan](sandbox-plan.md) §6; **desktop**: `container-migration.plist`는 넣지 않음(Move가 원본을 옮겨 DMG·Claude판 데이터가 사라질 수 있음). 앱 메뉴 "이전 버전 데이터 가져오기…": 고른 폴더에서 **복사**, 기존 파일은 `.before-import-*`로 보관, `seal/`·`.electron/` 제외, 끝나면 페이지 다시 불러오기 |
| R2 | **봉인 키 이전 안내**: DMG판 .p12 백업 → MAS판 가져오기. 키 없이 옮기면 지문이 바뀐다는 안내 `[조건부]` | code | S | done (code) | [sandbox-plan](sandbox-plan.md) §6.3; **desktop**: 가져오기 확인·완료 문구에 .p12 백업 안내 |
| R3 | `mas-dev` 빌드로 테스트 표 T1~T14 통과, 샌드박스 거부 로그 확인 | code | M | partly · 패널 시나리오는 수동 | [sandbox-plan](sandbox-plan.md) §7; **desktop**: `npm run test:sandbox`(ad-hoc 서명한 MAS Electron, 실제 샌드박스): 컨테이너 저장소, 실제 홈 매핑, EPERM, 봉인(Keychain), LaunchServices로 열기, 페이지 "권한 필요" 흐름, 가져오기, 거부 로그. 패널을 직접 눌러야 하는 T3·T4 등은 수동 |
| R4 | **TestFlight(macOS) 내부 테스트**: 배포 서명 빌드는 로컬에서 실행되지 않음 | code, ASC | S | todo | Electron MAS 가이드 |
| R5 | `safeStorage`가 샌드박스에서 키체인 프롬프트 없이 동작하는지 확인. `productName`을 바꾸면 키체인 항목 이름도 바뀌므로 이름 확정 후 구현 `[조건부]` | code | S | verified locally | `⚠ 확인 필요`; **desktop**: ad-hoc 샌드박스 빌드에서 safeStorage 동작(`protected: "os"`, 프롬프트 없음). Keychain 항목 "Sealmark Safe Storage" |
| R6 | **제품 페이지 글** 한국어·영어(이름, 부제, 프로모션 텍스트, 설명, 키워드 100바이트) | ASC, legal | M | todo | [metadata](metadata.md) §1~5 |
| R7 | **"서명/전자서명" 표현 법무 검토**: 법적 효력·공인·인증·위조 불가 같은 표현 금지 | legal | S | todo | 2.3.1, 2.3.7; [metadata](metadata.md) §13 |
| R8 | 메타데이터·앱 화면에서 **Windows, Claude, 다른 배포처** 언급 제거 확인(스토어 빌드에서 보이는 문구만). 페이지의 "Claude 앱을 업데이트…" 안내는 데스크톱 앱에서 나오지 않는 경로인지 확인 | code | S | todo | 2.3.10 |
| R9 | 봉인 기능은 **출시 빌드에 있을 때만** 메타데이터·스크린샷에. 심사 메모에 사용 경로 명시 | ASC | S | todo | 2.3.1, 2.5.19 |
| R10 | 카테고리: 주 생산성(빌드의 `LSApplicationCategoryType`과 일치), 보조 비즈니스. 가격 무료, IAP 없음. 콘텐츠 권한 답 | ASC | S | todo | App information |
| R11 | 저작권 표시를 회사 법인명으로(`package.json`의 `copyright`, `author`, About 패널, 스토어 Copyright 칸) | code, legal | S | done (code) | —; **desktop**: "Copyright © 2026 Falcon Eyes Inc.", author Falcon Eyes Inc., About 패널, NSHumanReadableCopyright |
| R12 | **오픈소스 고지**를 앱 안에서 볼 수 있게(About 또는 도움말 › 오픈소스 라이선스): pdf.js(Apache-2.0, `pdfjs-dist`에는 NOTICE 파일 없이 LICENSE만 있음), pdf-lib(MIT), @signpdf(MIT), node-forge(BSD-3-Clause 선택), pako(MIT·Zlib), tslib(0BSD), 글꼴(OFL-1.1), Electron(MIT)·Chromium(`LICENSES.chromium.html`) | code, legal | S | todo | 아래 §4 |
| R13 | 최소 macOS 표기 정리: Electron 45 바이너리는 **macOS 13.0 이상**(`LSMinimumSystemVersion`). 저장소 README는 "macOS 12 이상"이라 적혀 있음(DMG판도 13 이상일 것) | code | S | done (code) | 로컬 `Info.plist` 확인; **desktop**: `minimumSystemVersion: "13.0"` |
| R14 | Electron 버전 운영: 45 지원 종료 예정 2027-04-27 전에 다음 메이저로 올려 재심사 | code | S | todo | [sandbox-plan](sandbox-plan.md) §8 |

### 2.3 Recommended — 하면 좋은 것

| # | 항목 | 담당 | 작업량 | 상태 | 메모 |
|---|---|---|---|---|---|
| C1 | 최소 `PrivacyInfo.xcprivacy`(추적 없음, 수집 없음) 번들에 포함 | code | S | done | macOS는 required reason API 신고 의무 없음. 향후 대비; **desktop**: `desktop/build/mas/PrivacyInfo.xcprivacy` → `Contents/Resources` |
| C2 | 네이티브 애드온으로 드롭·Finder로 연 파일의 북마크 생성, 이동·이름 변경 추적(해석된 새 경로) | code | L | todo | Electron에 해당 API 없음. 2차 출시 |
| C3 | 아이콘을 macOS 26 아이콘 규격(Icon Composer, Liquid Glass)에 맞게 다시 그리기 | code(디자인) | M | todo | `⚠ 확인 필요`: 옛 아이콘이 틀에 들어가 보이는지 |
| C4 | 접근성 영양 성분표(Accessibility Nutrition Labels): 실제 확인한 항목만 | ASC, code | M | page done (키보드·VoiceOver 레이블, 대비 AA, 동작 줄이기; axe 위반 0) · 실기기 VoiceOver 점검·ASC 신고 todo | 선택 항목 |
| C5 | 상표 출원(한국 KIPRIS 등 출시 국가) | legal | L | todo | 이름 확정 후 |
| C6 | 앱 미리보기 영상(1920×1080, 15~30초) | ASC | M | todo | [featuring-assets.md](featuring-assets.md) |
| C7 | 피처링 요청 | ASC(Marketing) | S | todo | [featuring.md](featuring.md) |
| C8 | DMG판과 MAS판 공존 정책 `[결정]`: Bundle ID를 다르게 두거나, Mac은 스토어로 일원화. 데이터 공유(Claude 설치 앱과 같은 폴더)를 끊어도 되는지 | legal, code | S | todo | [sandbox-plan](sandbox-plan.md) §6 |
| C9 | 업로드 자동화: CI에 `dist:mas` + Transporter CLI(또는 `altool`), Secrets로 인증서·프로파일 | code | M | done (CI) · 비밀 값 등록 대기 | [sandbox-plan](sandbox-plan.md) §5.7; **desktop**: 비밀 값이 있을 때만 도는 잡; 목록은 `desktop/README.md` |
| C10 | 나중 기능(RFC 3161 타임스탬프, PDF 암호화)을 넣기 전에 수출 규정·App Privacy·entitlement 재검토 | legal, code | S | todo | [metadata](metadata.md) §8.5 |

---

## 3. 심사 가이드라인 위험 분석

| 가이드라인 | 위험 | 판단 | 대응 |
|---|---|---|---|
| **2.4.5(i)** 샌드박스·파일 시스템 | 지금 구조(어디든 읽고 쓰기)는 그대로는 불가 | 높음 → 재설계로 해소 | B5, B6 |
| 2.4.5(ii) Xcode 기술로 패키지, 설치 프로그램 금지, 공용 위치에 설치 금지 | electron-builder의 `.pkg`는 `productbuild` 기반 | 낮음 | 앱 번들 하나만 설치 |
| 2.4.5(iii) 로그인 자동 실행·종료 후 남는 프로세스 금지 | 사용하지 않음. 창 닫을 때 페이지 저장 후 종료(`flushPage()` 최대 4초) | 낮음 | 유지 |
| 2.4.5(iv), **2.5.2** 코드 다운로드 금지, 컨테이너 밖 읽기·쓰기 금지 | 페이지·라이브러리 모두 번들, CSP가 외부 스크립트 차단. 컨테이너 밖 접근은 사용자 선택분만 | 낮음 | 유지 |
| 2.4.5(vi)(vii) 라이선스 키·자체 업데이트 금지 | 없음. Electron `autoUpdater`는 MAS에서 꺼짐 | 낮음 | — |
| 2.4.5(viii), **2.5.1** 공개 API만, 현재 OS | 일반 Electron 바이너리는 비공개 API 때문에 거부될 수 있음 → MAS용 Electron 사용. 2019년 대량 거부 사례가 있었음 | 중간 | MAS 빌드 사용 확인, 업로드 경고 메일 확인, 지원되는 Electron 유지 |
| **2.4.5(ix)** 모든 현지화를 한 번들에 | 한국어·영어 UI가 페이지 안에 있고 `electronLanguages`로 `en`, `ko` lproj 포함 | 낮음 | 스토어 "언어"에 한국어·영어가 보이는지 확인 |
| **4.2** 최소 기능(포장한 웹사이트?) | 원래 Claude 아티팩트로 돌던 HTML 페이지를 Electron으로 감싼 앱 | 중간~낮음 | 웹사이트가 아니라 **완전 오프라인 네이티브 기능**(Finder 열기·다음으로 열기, 네이티브 열기/저장 패널, 메뉴, 키체인 봉인, 원본 변경 알림, 보관함)이 있음을 심사 메모·스크린샷에 보여 줌. 웹 느낌이 나는 부분(브라우저식 링크, 웹 폰트 깜빡임) 점검 |
| 4.3(b) 포화 카테고리 | PDF 도구가 많음(2026-06 강화 목록에는 PDF가 없음, 레퍼런스 기준) | 중간 | 차별점: 오프라인·업로드 없음, 한국식 도장(배경 제거, 글자 도장), 봉인 |
| 4.1, 2.3.7, 5.2 이름·상표 | "PDF Editor"는 흔하고 일반 명사 | 높음 | B2 |
| **2.3.1** 정확한 메타데이터 | "Editor"인데 글자 편집 불가, "서명"의 법적 의미 오해 | 중간 | 이름 변경, "알아 두세요" 단락, R7 |
| 2.3.10 다른 플랫폼 언급 | README·다운로드 페이지에 Windows | 중간 | 스토어 글·스크린샷에서 제외(R8) |
| 2.5.19 숨은 기능 | 개발 메뉴는 `app.isPackaged`가 아닐 때만 | 낮음 | 출시 빌드에 개발 메뉴 없는지 확인 |
| **5.1.1/5.1.2** 개인정보 | 수집 없음, 계정 없음, 추적 없음. 처리방침 URL과 앱 안 링크 필요 | 낮음(링크만 추가) | B8, B10 |
| 1.5 개발자 정보 | 지원 URL에 연락처 필요 | 낮음 | B9 |
| 3.1.1 IAP | 무료, 구입 없음 | 해당 없음 | 유료화 시 IAP |

---

## 4. 오픈소스 라이선스와 App Store

- **이 앱(MIT)**: 저작권자인 회사가 App Store(Apple 표준 EULA)로 배포하는 데 문제 없습니다. 외부 기여자 코드도 MIT라 재배포·재라이선스가 허용됩니다. 저작권 표시와 MIT 고지를 앱 안에 두면 됩니다.
- **production 의존성**(`desktop/package-lock.json`에서 확인): `@signpdf/signpdf` MIT, `@signpdf/utils` MIT, `pdf-lib` MIT, `@pdf-lib/standard-fonts` MIT, `@pdf-lib/upng` MIT, `pako` MIT AND Zlib, `tslib` 0BSD, **`node-forge` (BSD-3-Clause OR GPL-2.0)**.
  - node-forge는 **둘 중 하나를 고르는 이중 라이선스**입니다. **BSD-3-Clause를 선택**한다고 고지에 적으면 GPL 의무(소스 공개, 추가 제한 금지)는 생기지 않습니다. GPL-2.0을 고를 이유가 없습니다.
  - 그 밖에 GPL 의존성은 없습니다.
- **번들되는 개발 의존성 산출물**(`desktop/scripts/build-page.mjs`가 `app/`에 복사): pdf.js `pdfjs-dist` Apache-2.0(빌드 때 `app/lib/LICENSE-pdfjs-dist.txt`로 복사됨. NOTICE 파일은 패키지에 없음), 글꼴 IBM Plex Mono·IBM Plex Sans KR·Nanum Myeongjo·Nanum Pen Script 모두 **OFL-1.1**(앱에 넣어 배포 가능, 글꼴만 따로 팔지 않으면 됨), `web/vendor/pdfjs/`의 `LICENSE_FOXIT`, `LICENSE_LIBERATION`.
- **Electron/Chromium**: Electron MIT, Chromium 구성 요소 고지는 번들의 `LICENSES.chromium.html`. 일부 구성 요소(예: FFmpeg)는 LGPL로 동적 링크됩니다. App Store 배포와 LGPL 동적 링크의 관계는 일반적으로 허용되는 것으로 알려져 있으나 공식 확인은 못 했습니다(`⚠ 확인 필요`, 법무). 이 앱은 오디오·비디오를 쓰지 않습니다.

---

## 5. 확인하지 못한 것

[reference-notes.md](reference-notes.md) §5에 모았습니다. 가장 중요한 것: App Store Connect 화면 안 질문 문구(로그인하지 않음), `container-migration.plist`의 복사/이동 동작, MAS 빌드에서의 `safeStorage`·창 드롭·`shell.openPath` 동작, `allow-jit` 필요 여부, 이름 후보의 상표 중복.
