# 참고 자료 노트: mjmirza/app-store-compliance 와 Apple 공식 문서

사용자가 지정한 레퍼런스 저장소를 읽고, 이 앱(Electron, Mac App Store)에 쓸 수 있는 것과 맞지 않는 것을 정리했습니다. 시간에 따라 바뀌는 내용은 Apple 공식 문서로 다시 확인했습니다(2026-11-25).

## 1. 레퍼런스 저장소 개요

- 저장소: https://github.com/mjmirza/app-store-compliance
- 읽은 커밋: `097f7e400e4afef653992854aaefa90cda7eda9b` (2026-11-25), `VERSION` 2.5.1
- 읽은 방법: 스크래치 폴더에 `git clone --depth 1`로 받아 **읽기만** 했습니다. 설치 스크립트(`scripts/install.sh`), 검사 스크립트(`agent-os/hooks/app-store-compliance-guard.sh`, `scripts/*.py`), 훅은 **실행하지 않았고**, 실행 파일이나 글을 이 저장소로 복사하지 않았습니다. 이 문서들은 레퍼런스의 내용을 요약·재구성한 것입니다.
- 라이선스: 2026-08-27 이후 릴리스는 **OpenRoots Agent License 2.3**(MIT/CC가 아님). 매출 2천만 달러 이하 회사는 무료로 쓸 수 있고, 재사용할 때 저작권 표시를 유지해야 하며, 플레이북 자체를 재판매하는 것은 금지, AI 학습은 별도 라이선스가 필요하다고 README에 적혀 있습니다. 우리는 **체크리스트의 아이디어만 참고**하고 글을 옮기지 않았습니다. 레퍼런스 문장을 그대로 문서에 넣을 경우 법무가 라이선스를 확인해야 합니다.
- README의 "에이전트에 붙여 넣을 프롬프트"(설치, 저장소 별 주기 요청 등)는 따르지 않았습니다.

### 무엇을 다루나

| 영역 | 내용 | 주요 파일 |
|---|---|---|
| Apple 거부 사유 지도 | 가이드라인 1~5장, 각 항목의 거부 계기와 대처, 2026년 변경 사항 목록 | [docs/APPLE.md](https://github.com/mjmirza/app-store-compliance/blob/main/docs/APPLE.md) |
| 제출 전 체크리스트 | 공통·Apple·Google·EU·기타 지역·플랫폼 기계 장치 | [docs/PRE-SUBMISSION-CHECKLIST.md](https://github.com/mjmirza/app-store-compliance/blob/main/docs/PRE-SUBMISSION-CHECKLIST.md) |
| 업로드 단계 검사 | 개인정보 매니페스트, required reason API, `ITSAppUsesNonExemptEncryption`, SDK 최소 버전, 계정 선행 조건(DSA trader 등), 메타데이터 길이 | [docs/ADVANCED-2026.md](https://github.com/mjmirza/app-store-compliance/blob/main/docs/ADVANCED-2026.md) §1~2 |
| 플랫폼 기계 장치 | macOS 공증(스토어 밖 배포), 4.2/4.3, 프랑스 ANSSI 암호 신고, 콘텐츠 권한, SDK 최소 버전 | [docs/PLATFORM-MECHANICS-2026.md](https://github.com/mjmirza/app-store-compliance/blob/main/docs/PLATFORM-MECHANICS-2026.md) §1.1~1.6 |
| 앱 유형별 | macOS·Mac App Store 항목(2.4.5) | [references/guidelines/by-app-type/macos-and-the-mac-app-store.md](https://github.com/mjmirza/app-store-compliance/blob/main/references/guidelines/by-app-type/macos-and-the-mac-app-store.md), [docs/BY-APP-TYPE.md](https://github.com/mjmirza/app-store-compliance/blob/main/docs/BY-APP-TYPE.md) |
| 규칙 모음 | entitlements(쓰지 않는 entitlement), export(암호 선언 누락), privacy(처리방침·매니페스트·영양 성분표), metadata(타 플랫폼 언급, 미래 기능, URL, 장식) | [references/rules/](https://github.com/mjmirza/app-store-compliance/tree/main/references/rules) |
| 심사 메모 양식 | 6개 단락(녹화, 목적, 접근 방법, 외부 서비스, 지역 차이, 규제 서류) | [templates/REVIEW-NOTES-TEMPLATE.md](https://github.com/mjmirza/app-store-compliance/blob/main/templates/REVIEW-NOTES-TEMPLATE.md) |
| EU 법 | DSA trader 상태(§3), EU AI Act, DMA, 유럽 접근성법 | [docs/EU-REGULATORY-2026.md](https://github.com/mjmirza/app-store-compliance/blob/main/docs/EU-REGULATORY-2026.md) |
| 기타 | Google Play, 다른 스토어, 도박, 보안, 접근성, 지역 규제, 자동 검사 도구 | `docs/`, `data/`, `scripts/` |
| Mac 범위에 대한 자기 설명 | "검사기에는 macOS 전용 검사가 없고, 2.4.5는 손으로 보는 체크리스트" | [docs/FAQ.md](https://github.com/mjmirza/app-store-compliance/blob/main/docs/FAQ.md) "Does it check Mac App Store…" |

## 2. 이 계획에 가져온 것

| 가져온 아이디어 | 레퍼런스 위치 | 이 저장소에서 |
|---|---|---|
| 심사관은 한 번 돌리는 "적대적 통합 테스트" — 필요한 것이 제출 시점에 모두 보여야 함 | README "The first principle" | 심사 메모에 예시 문서 경로, entitlement 이유 ([metadata.md](metadata.md) §10) |
| 쓰지 않는 entitlement는 질의·지연 사유 | [references/rules/entitlements.md](https://github.com/mjmirza/app-store-compliance/blob/main/references/rules/entitlements.md) | `@electron/osx-sign` 기본 템플릿의 camera·mic·usb·print·network 제거 ([sandbox-plan.md](sandbox-plan.md) §2) |
| `ITSAppUsesNonExemptEncryption` 누락 → "Missing Compliance"에 걸림 | [references/rules/export.md](https://github.com/mjmirza/app-store-compliance/blob/main/references/rules/export.md) | `mas.extendInfo`에 NO + 근거 ([metadata.md](metadata.md) §8) |
| 프랑스 ANSSI 신고 표 | PLATFORM-MECHANICS §1.4 | Apple 원문으로 다시 확인해 반영 |
| 계정 선행 조건: 계약 동의, DSA trader, 국제 형식 전화번호 | ADVANCED-2026 §2, APPLE.md "2026 changes", EU-REGULATORY §3 | [README.md](README.md) 체크리스트 |
| 메타데이터 제한·장식 금지(가격·"최고" 등), 타 플랫폼 언급 금지, 미래 기능 금지 | ADVANCED-2026 §2, [references/rules/metadata.md](https://github.com/mjmirza/app-store-compliance/blob/main/references/rules/metadata.md) | 설명에서 Windows·Claude 언급 제외, 봉인 문구 `[조건부]` |
| 2.5.19 숨은 기능 금지(2026-10-16 신설) | APPLE.md §2 | 봉인 기능은 출시 빌드에 있을 때만 메타데이터에 |
| 새 연령 등급(4+/9+/13+/16+/18+) 질문지, 추가 질문 | APPLE.md, PRE-SUBMISSION-CHECKLIST | Apple 원문으로 확인 후 답안 작성 |
| 4.2 최소 기능 / 4.3 포화 카테고리 | PLATFORM-MECHANICS §1.2 | 위험 분석 ([README.md](README.md) §3) |
| 개인정보 처리방침은 앱 안에서도 접근 가능해야 함 | PRE-SUBMISSION-CHECKLIST "Privacy and data" | 도움말 메뉴 링크를 필수 항목으로 |
| 콘텐츠 권한 질문 | PLATFORM-MECHANICS §1.5 | [metadata.md](metadata.md) §6 |
| 심사 메모 양식(녹화, 목적, 외부 서비스, 지역 차이) | templates/REVIEW-NOTES-TEMPLATE.md | 심사 메모 구성에 참고 |
| macOS 26이 인텔·Rosetta 마지막 버전(레퍼런스가 Apple 뉴스 인용) | APPLE.md "Rosetta sunset" | universal 빌드 판단 근거. Apple 원문은 직접 열어 보지 않음 `⚠ 확인 필요` |

## 3. 낡았거나 macOS·Electron에는 맞지 않는 것

| 레퍼런스 내용 | 문제 | 공식 확인 결과 |
|---|---|---|
| macOS 2.4.5 요약의 번호: "(iii) 자동 실행·Dock·바탕화면 바로가기", "(iv) 앱·kext 다운로드", "(v)~(vii) root·라이선스 키·업데이트", "(viii) 최신 OS" | **(ix) "모든 현지화를 한 번들에"가 빠짐**, 번호 일부가 원문과 다름 | Apple 원문은 (i)~(ix) 9개. (ix)는 이 앱의 한국어·영어 지원과 직접 관련 |
| "개인정보 매니페스트 누락이 가장 흔한 업로드 거부" (iOS 기준) | **macOS에서는 required reason API 신고 의무가 없음** | Apple: required reason API는 iOS, iPadOS, tvOS, visionOS, watchOS 대상. 수집 데이터 신고만 모든 플랫폼 |
| "1024px 앱 아이콘, 알파·투명 금지" | iOS 규칙. macOS 아이콘은 모양 있는 투명 배경이 보통이고 빌드의 `.icns`에서 가져옴 | 스크린샷은 알파 금지(Apple 스크린샷 규격). 아이콘 투명은 macOS에서 금지 아님 `⚠ 확인 필요`(공식 문장으로는 확인 못 함) |
| PRE-SUBMISSION-CHECKLIST "SDK floor: 오늘은 26 SDK" | **macOS는 해당 없음.** 같은 저장소의 PLATFORM-MECHANICS §1.6은 "macOS는 Apple 목록에 없음"이라고 맞게 적음(내부 불일치) | Apple Upcoming requirements: Xcode 26/SDK 26 규정은 iOS·iPadOS·tvOS·visionOS·watchOS만 |
| `ITSAppUsesNonExemptEncryption` 설명이 "모든 iOS 빌드", "HTTPS만 쓰면 면제" 수준 | macOS·Electron은 OS 밖 암호 라이브러리(BoringSSL)가 **번들에 포함**되고, 이 앱은 RSA 서명·PKCS#12를 직접 씀. "HTTPS만" 공식으로는 판단 불가 | Apple Complying with Encryption Export Regulations + BIS Technical Note 1 to 5A002.a로 별도 분석 ([metadata.md](metadata.md) §8) |
| macOS 항목이 "공증(notarization)" 위주 | 공증은 **스토어 밖(Developer ID) 배포용**. MAS 빌드는 공증하지 않음 | Apple Upload builds: 업로드는 Xcode, Transporter, altool, App Store Connect API |
| 데모 계정·라이브 백엔드를 최우선 검사 | 이 앱은 계정·서버가 없음. 해당 없음 | 대신 "예시 문서"로 테스트 경로 제공 |
| iPhone Duo, Dynamic Island, iPad 스크린샷, ATT, Sign in with Apple, IAP, UGC, Kids | 이 앱과 무관 | Mac 스크린샷 규격(16:10, 4가지 크기)만 해당 |
| 검사기(`guard.sh`)가 Xcode/Android 프로젝트를 찾음 | Electron 프로젝트는 "NOT CHECKED"가 될 것으로 보임(실행하지 않음) | 수동 체크리스트로 대체 |
| Electron에 대한 내용 | **없음** (`grep -i electron` 결과: 관련 문서 없음). 크로스플랫폼 문서는 Flutter, RN, Expo, Capacitor, Unity, MAUI, Tauri, KMP만 | Electron 공식 MAS 가이드와 electron-builder 문서로 보완 |
| App Sandbox, 보안 범위 북마크, 컨테이너 이전 | **없음** | Apple "Accessing files from the macOS App Sandbox", "Migrating your app's files to its App Sandbox container" |
| 키워드 "100자" | Apple 원문은 **100바이트**. 한글은 1자 3바이트라 차이가 큼 | Apple Platform version information |

## 4. 사용한 Apple·기타 공식 자료

App Store 심사·정책
- App Review Guidelines (1.5, 2.3.x, 2.4.5, 2.5.1, 2.5.2, 4.1, 4.2, 5.1.1, 5.2) — https://developer.apple.com/app-store/review/guidelines/
- Upcoming requirements — https://developer.apple.com/news/upcoming-requirements/
- App privacy details — https://developer.apple.com/app-store/app-privacy-details/

App Store Connect 도움말
- App information — https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
- Platform version information — https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- Screenshot specifications — https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- Age ratings values and definitions — https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions
- Upload builds — https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds
- Overview of export compliance — https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/
- Determine and upload app encryption documentation — https://developer.apple.com/help/app-store-connect/manage-app-information/determine-and-upload-app-encryption-documentation
- Export compliance documentation for encryption — https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption

Apple 개발자 문서
- Complying with Encryption Export Regulations — https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations
- Privacy manifest files — https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
- Describing use of required reason API — https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api
- Accessing files from the macOS App Sandbox — https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox
- Migrating your app's files to its App Sandbox container — https://developer.apple.com/documentation/security/migrating-your-app-s-files-to-its-app-sandbox-container
- Entitlements: user-selected.read-write, downloads.read-write — https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.files.user-selected.read-write , https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.files.downloads.read-write
- Developer Forums, container-migration.plist — https://developer.apple.com/forums/thread/763674 , https://developer.apple.com/forums/thread/767586

미국 수출 규정
- BIS, Cryptography for data confidentiality — https://www.bis.gov/learn-support/encryption-controls/cryptography-for-data-confidentiality
- 2021 BIS 규칙 해설 (로펌, 공식 아님) — https://www.wsgr.com/en/insights/us-department-of-commerces-bureau-of-industry-and-security-relaxes-several-classification-and-reporting-requirements-for-encryption-items.html

Electron / electron-builder
- Mac App Store Submission Guide — https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide
- `dialog` API — https://www.electronjs.org/docs/latest/api/dialog
- `app` API — https://www.electronjs.org/docs/latest/api/app
- Electron Timelines / Release schedule — https://www.electronjs.org/docs/latest/tutorial/electron-timelines , https://releases.electronjs.org/schedule
- electron-builder MAS — https://www.electron.build/docs/mas
- 2019년 Electron 비공개 API 거부 보도 (참고) — https://9to5mac.com/2019/11/04/electron-app-rejections/

## 5. 확인하지 못한 것 (요약)

- App Store Connect 화면 안의 실제 질문 문구(수출 규정, 연령 등급 새 질문, 소셜 미디어 질문). 로그인하지 않았습니다.
- `container-migration.plist`가 복사인지 이동인지(문서와 포럼 경험담이 다름), iCloud 데스크탑·문서 환경에서의 동작.
- MAS 빌드에서 `safeStorage`(키체인), 창 드롭 파일 접근, `shell.openPath`/`showItemInFolder`, `os.userInfo().homedir`의 실제 동작 → `mas-dev`로 확인.
- `com.apple.security.cs.allow-jit`이 MAS(하드닝 런타임 없음)에서 필요한지.
- Electron 45 MAS 바이너리의 SDK 정보가 업로드 검사에 걸리는지.
- 앱 이름 후보의 상표·스토어 중복 여부.
- macOS 26의 아이콘 규격(Icon Composer) 적용 여부와 영향.
