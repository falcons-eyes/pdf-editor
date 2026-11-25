# App Store 제품 페이지·심사 답변 초안 (한국어 / English)

App Store Connect에 넣을 글과 질문지 답변의 초안입니다. 제출 전에 **법무 검토**(이름 상표, 서명 관련 표현, 수출 규정)를 거쳐야 합니다.
글자 수는 Python `len()`(글자)과 UTF-8 바이트로 셌습니다. App Store Connect 화면에서 한 번 더 확인하세요.

표시: `⚠ 확인 필요` = 공식 문서로 확인하지 못했거나 화면에서 확인해야 함, `[결정]` = 회사가 정할 일, `[조건부]` = 해당 기능을 출시할 때만 남길 문구.

공식 제한(Apple 문서 확인):

| 입력란 | 제한 | 출처 |
|---|---|---|
| 이름 (Name) | 2~30자, 현지화 가능 | App information |
| 부제 (Subtitle) | 30자 이하 | App information |
| 프로모션 텍스트 | 170자, 심사 없이 언제든 수정 | Platform version information |
| 설명 (Description) | 4,000자, 일반 텍스트 | Platform version information |
| 키워드 | **100바이트**, 쉼표로 구분, 각 키워드 2자 초과. 한글은 1자 = 3바이트라 약 30자 | Platform version information |
| 지원 URL | **필수**. 실제 연락처(주소·이메일·전화 중, 현지 법에 따라)가 있어야 함 | Platform version information |
| 개인정보 처리방침 URL | **macOS 앱 필수** | App information |
| 마케팅 URL | 선택 | Platform version information |
| Mac 스크린샷 | 16:10, **1280×800 / 1440×900 / 2560×1600 / 2880×1800** 중 하나, 1~10장, JPEG/PNG, **알파 채널·투명 금지** | Screenshot specifications |

---

## 1. 앱 이름 `[결정]`

### 확정: **Sealworks** (2026-11-25)

- 스토어 이름: **Sealworks: Sign & Seal PDFs** / **씰웍스 – PDF 서명·봉인**
- Bundle ID: Mac App Store `com.falconoon.sealworks`, GitHub DMG·Windows `com.falconoon.sealworks.direct`
- Android 패키지 이름(나중에 만들 때): `com.falconoon.sealworks`

이름 겹침 확인 (2026-11-25, 공개 검색 기준 — 상표 검색은 아님):

| 이름 | Apple App Store (US·KR·JP·UK, iPhone·iPad·Mac) | Google Play | Microsoft Store |
| --- | --- | --- | --- |
| **Sealworks** | 없음 | 없음 | 없음 |
| Sealmark | **있음**: "Sealmark: Condition Reports" (iOS, Productivity) → 포기 | – | 없음 |
| Sealwise / Sealkit / Stampseal / Sealbook / Sealry | 없음 | 확인 안 함 | 없음 (Sealwise·Sealkit·Stampseal) |
| SealSign / SealDesk / SealProof / SealNote / Sealio / Sealform | **있음** (SealSign은 전자서명 서비스) | SealSign 있음 | – |

참고: Google Play에 "Sign & Seal: Stamp PDFs"(Veridir)라는 앱이 있어서, 부제·설명에서 "Sign & Seal"만 단독 브랜드처럼 쓰지 않습니다. 산업용 실링(seal) 회사 중 "Seal Works"라는 상호가 있을 수 있으니 KIPRIS·USPTO에서 **9류(소프트웨어)** 상표를 확인한 뒤 출원을 검토합니다.

이름 선점 방법(계정 주인이 직접):
1. **App Store Connect** › 앱 › `+` 새로운 앱 › 플랫폼 macOS, 이름 "Sealworks: Sign & Seal PDFs", 기본 언어, Bundle ID `com.falconoon.sealworks`(먼저 Certificates, Identifiers & Profiles에서 등록), SKU. 앱 레코드를 만들면 그 이름이 예약됩니다. 오래 제출하지 않으면 이름을 잃을 수 있습니다(`⚠ 확인 필요`: 현재 기간 규정).
2. **Microsoft Partner Center** › 앱 및 게임 › 새 제품 › MSIX/PWA 앱 › "Sealworks" **이름 예약**(제출 전 3개월간 유지, `⚠ 확인 필요`). Win32 설치 파일(.exe) 그대로 올리는 방식도 있습니다.
3. **Google Play Console** › 앱 만들기 › 앱 이름 "Sealworks". Play는 이름을 독점 예약하지 않고 **패키지 이름**이 고유합니다. 지금은 Android 앱이 없으므로 출시 시점에 `com.falconoon.sealworks`로 만듭니다.

### "PDF Editor"를 그대로 쓰기 어려운 이유

1. **이미 같은·비슷한 이름이 매우 많습니다.** 웹 검색만으로도 Mac App Store에 "PDF Editor", "PDF Editor +", "PDF Editor Pro", "PDF Editor - for Adobe PDF …" 등이 보입니다. App Store 이름은 스토어 안에서 겹칠 수 없으므로 정확히 "PDF Editor"는 등록이 안 될 가능성이 큽니다(`⚠ 확인 필요`: App Store Connect에서 앱을 만들 때 이름 중복 여부가 바로 나옵니다).
2. **일반 명사라 상표로 보호받기 어렵습니다.** 회사 브랜드로 키우기 어렵고, 비슷한 이름 앱과 혼동됩니다(4.1 Copycats 관점에서도 불리).
3. **기능과 딱 맞지 않습니다.** 이 앱은 PDF 글자를 고치는 편집기가 아니라 서명·도장·이미지를 얹어 새 PDF로 저장하는 앱입니다. "Editor"만 보고 글자 수정 기능을 기대한 사용자가 실망하면 2.3(정확한 메타데이터) 문제와 낮은 평점으로 이어질 수 있습니다.
4. 이름에 남의 상표(Adobe, Acrobat 등)를 넣으면 안 됩니다(2.3.7, 5.2).

### 후보 (모두 상표·스토어 검색 전 초안)

| # | English (글자) | 한국어 (글자) | 메모 |
|---|---|---|---|
| A | **Dojang: Sign & Stamp PDFs** (25) | **도장 – PDF 서명·도장 찍기** (17) | 한국 "도장"을 브랜드로. 외국 사용자에게는 생소하지만 기억에 남음 |
| B | **Sealworks: Sign & Seal PDFs** (26) | **씰웍스 – PDF 서명·봉인** (15) | 봉인(tamper-evident) 기능을 앞세움. 봉인이 출시될 때만 `[조건부]` |
| C | **Stamp & Seal for PDF** (20) | **PDF 도장·서명·봉인** (12) | 설명형. 상표 등록은 어려움 |
| D | (회사 브랜드) + ": PDF Sign & Stamp" | (회사 브랜드) + " PDF 서명·도장" | 회사 이름이 짧으면 가장 안전 |

- 할 일: KIPRIS(한국), USPTO, EUIPO에서 상표 검색 + App Store 검색 + 도메인 확인. 출시 국가에 따라 상표 출원 검토(법무).
- 앱 번들 이름(Dock·Finder에 보이는 `CFBundleName`/`CFBundleDisplayName`)도 스토어 이름과 비슷하게 맞추는 것을 권합니다. 데이터 폴더 이름(`PDF Editor`)은 바꾸지 않아도 됩니다. `productName`을 바꾸면 `safeStorage`의 Keychain 항목 이름도 바뀌므로 봉인 기능 출시 전에 정합니다(`⚠ 확인 필요`).

---

## 2. 부제 (30자 이하)

| 언어 | 초안 | 글자 |
|---|---|---|
| English | **Sign & stamp PDFs, offline** | 26 |
| English (대안) | Sign, stamp & seal PDFs (봉인 출시 시) | 23 |
| 한국어 | **PDF에 서명·도장, 오프라인으로** | 18 |
| 한국어 (대안) | 서명·도장 찍고 위변조 확인까지 `[조건부]` | 17 |

부제에는 확인할 수 없는 주장("최고", "법적 효력 보장" 등)이나 다른 앱 이름을 넣지 않습니다(2.3.7).

---

## 3. 프로모션 텍스트 (170자 이하)

- **한국어** (80자 내외): 계약서 한 장에 서명하려고 출력·스캔하지 마세요. 서명과 도장을 끌어다 놓고 새 PDF로 저장하면 끝. 파일은 내 Mac 밖으로 나가지 않습니다.
- **English**: Stop printing and scanning just to sign one page. Drag your signature or stamp onto the PDF and save a new copy. Your files never leave your Mac.

---

## 4. 설명 (4,000자 이하)

### 한국어

```
PDF에 서명과 도장을 끌어다 놓고, 새 PDF로 저장하세요.
출력도, 스캔도, 업로드도 필요 없습니다. 모든 작업은 내 Mac 안에서 이루어지고, 파일은 밖으로 나가지 않습니다.

3단계면 끝
1. PDF 열기: 창에 끌어다 놓거나, Finder에서 "다음으로 열기"를 고릅니다.
2. 서명·도장 놓기: 원하는 자리에 끌어다 놓고, 크기·각도·불투명도를 맞춥니다.
3. 새 파일로 저장: 원본은 그대로 두고, "계약서_서명.pdf"처럼 새 파일로 저장합니다.

할 수 있는 일
• 직접 서명: 트랙패드나 마우스로 그립니다. 잉크 색과 굵기를 고를 수 있습니다.
• 도장·이미지: PNG·JPG를 가져오거나 붙여 넣습니다. 종이에 찍은 도장 사진은 흰 배경을 지워 줍니다.
• 글자·날짜 도장: 이름, 오늘 날짜, (인), 사본 같은 글자를 고딕·손글씨·명조로 만듭니다.
• 정확한 위치: mm 단위 위치 입력과 맞춤선.
• 여러 쪽: 다른 쪽에 복사하거나, 모든 쪽의 같은 위치에 한 번에 넣습니다.
• 한 번 등록하면 계속: 등록한 서명·도장은 다음 문서에서 바로 다시 씁니다.
• 보관함: 연 문서와 놓아 둔 서명이 자동으로 저장되어, 나중에 이어서 작업할 수 있습니다.
• 원본 변경 알림: 원본이나 저장한 파일이 앱 밖에서 바뀌면 알려 줍니다.
• 봉인해서 저장: 저장한 PDF에 디지털 서명(PAdES)을 넣어, 이후에 누가 내용을 고치면 "봉인 뒤 수정됨"으로 드러나게 합니다. 서명 키는 내 Mac의 키체인에만 보관됩니다. [조건부]
• 한국어·영어 화면.

개인정보
계정이 없고, 인터넷 연결 없이 동작합니다. 앱은 사용 기록이나 문서 내용을 수집하지 않습니다.

알아 두세요
• 이 앱은 PDF의 글자를 고치는 편집기가 아니라, 서명·도장·이미지를 얹어 새 PDF를 만드는 앱입니다.
• 봉인은 파일이 바뀌었는지 확인하기 위한 기능입니다. 공인된 인증기관의 인증서를 쓰지 않으므로, 다른 PDF 뷰어에서는 서명자가 "확인되지 않음"으로 보일 수 있습니다. 특정 법령상 전자서명의 효력이 필요한 문서라면 해당 기관의 요구 사항을 먼저 확인하세요. [조건부]
```

### English

```
Drag your signature or stamp onto a PDF and save it as a new file.
No printing, no scanning, no uploading. Everything happens on your Mac, and your files never leave it.

Three steps
1. Open a PDF: drop it on the window, or choose Open With in Finder.
2. Place your signature or stamp: drag it where it belongs, then adjust size, angle and opacity.
3. Save a new file: the original stays untouched; you get a new copy such as "Contract_signed.pdf".

What you can do
• Draw your signature with the trackpad or mouse, in your choice of ink color and weight.
• Import stamps and images (PNG, JPG) or paste them. Photos of ink stamps get their white background removed.
• Make text and date stamps: your name, today's date, "Copy" and more, in several typefaces.
• Place things precisely with millimeter positions and alignment guides.
• Copy an item to other pages, or place it at the same spot on every page at once.
• Reuse what you've added: your signatures and stamps stay ready for the next document.
• Pick up where you left off: opened documents and placed items are saved automatically in the Library.
• Get notified when the original or a saved file is changed outside the app.
• Seal and save: add a PDF digital signature (PAdES) so that any later edit shows as "Modified after sealing". The signing key stays in your Mac's keychain. [conditional]
• English and Korean interface.

Privacy
No account, and it works without an internet connection. The app does not collect usage data or the contents of your documents.

Good to know
• This app doesn't edit the text of a PDF. It adds signatures, stamps and images and saves a new PDF.
• Sealing is for detecting changes. It doesn't use a certificate from a public certificate authority, so other PDF viewers may show the signer as "not verified". If a document requires a legally recognized electronic signature, check the requirements first. [conditional]
```

메모:
- **Windows, Claude, GitHub 다운로드** 같은 다른 플랫폼·배포 경로는 설명과 스크린샷에 넣지 않습니다(2.3.10). 앱 안 도움말 › GitHub 저장소 링크는 괜찮지만, 앱 안에 "Windows용 받기" 같은 문구가 없는지 확인합니다.
- "무료"는 이름·부제·아이콘에 넣지 않습니다. 가격은 스토어가 보여 줍니다.
- `[조건부]` 줄은 봉인 기능이 출시 빌드에 있을 때만 남깁니다(2.3.1·2.5.19: 앱에 없는 기능이나 숨은 기능 금지).

---

## 5. 키워드 (100바이트)

이름·부제에 이미 있는 단어는 반복하지 않는 것이 좋습니다(이름도 검색에 쓰임, `⚠ 확인 필요`: Apple 공식 문서가 아니라 일반적인 ASO 권고). 아래는 이름 후보 A 기준입니다.

| 언어 | 초안 | 바이트 |
|---|---|---|
| English | `signature,seal,contract,initials,tamper,PAdES,offline,overlay,watermark,esign,document,fill` | 91 |
| 한국어 | `서명,날인,계약서,사인,봉인,위변조,오프라인,전자문서,이미지` | 83 |

(실제 바이트는 저장 직전에 `python3 -c 'print(len("…".encode()))'`로 다시 셉니다.) 남의 상표(Adobe, Acrobat, DocuSign 등)는 넣지 않습니다(2.3.7).

---

## 6. 카테고리, 가격, 기타

| 항목 | 답 | 이유 |
|---|---|---|
| 주 카테고리 | **생산성 (Productivity)** | 빌드의 `LSApplicationCategoryType = public.app-category.productivity`와 맞아야 함 (App information) |
| 보조 카테고리 | 비즈니스 (Business) | 계약서·업무 문서 |
| 가격 | 무료 | 지금 계획 |
| 앱 내 구입 | 없음 | 있다면 3.1.1 IAP 필수 |
| 콘텐츠 권한 (Content Rights) | "제3자 콘텐츠를 포함·표시·접근하지 않음" | 앱에 들어 있는 글꼴(OFL)·라이브러리는 라이선스로 사용. 사용자가 여는 PDF는 사용자 것. `⚠ 확인 필요`: 번들 글꼴을 "제3자 콘텐츠"로 볼지 법무 판단 |
| 저작권 (Copyright) | `© 2026 <회사 법인명>` | 지금 `package.json`은 "falcons-eyes"라 회사명으로 맞춤 |
| 출시 지역 | 전 세계 (또는 우선 한국·미국 등) `[결정]` | EU에 내려면 아래 DSA trader 필수 |
| EU DSA trader 상태 | **trader로 신고** (회사) → 주소·전화·이메일이 EU 제품 페이지에 공개됨 | 2025-02-17부터 trader 상태 없으면 EU 스토어에서 내려감 (Upcoming requirements) |
| 소셜 미디어 질문 | "없음" | 레퍼런스 저장소에 따르면 2026-09부터 제출 전 답해야 함 (`⚠ 확인 필요`) |
| 접근성 영양 성분표 (Accessibility Nutrition Labels) | 권장: VoiceOver, 키보드 조작, 다크 모드, 충분한 대비 등 실제로 확인한 것만 표시 | 선택 항목. 확인하지 않은 항목은 표시하지 않음 |

---

## 7. App Privacy (개인정보 보호 "영양 성분표")

### 답: **데이터를 수집하지 않음 (Data Not Collected)**

Apple 정의: "수집"은 데이터를 **기기 밖으로 보내** 개발자나 제3자가 실시간 처리에 필요한 시간보다 오래 접근할 수 있게 하는 것입니다. **기기 안에서만 처리하는 데이터는 수집이 아니며 신고하지 않습니다.** 제3자 SDK가 수집하는 것도 개발자 책임입니다. (App Privacy Details)

근거 (코드에서 확인):

| 확인한 것 | 결과 |
|---|---|
| 네트워크 | 페이지 CSP가 `connect-src 'self' data: blob:` (`desktop/src/main.js` `CSP`). 폰트·pdf.js·pdf-lib는 번들에 포함(`desktop/scripts/build-page.mjs`). MAS entitlements에 `network.client`가 없어 샌드박스가 나가는 연결 자체를 막음 |
| 분석·광고·크래시 SDK | 없음. `dependencies`는 `@signpdf/signpdf`, `@signpdf/utils`, `node-forge`, `pdf-lib`뿐. MAS 빌드에서는 Electron `crashReporter`도 꺼짐 |
| 계정 | 없음 |
| 사용자 데이터 저장 | 서명·도장 이미지, 문서 사본, 썸네일, 설정, 봉인 신원(이름·조직·이메일, 키)은 모두 앱 컨테이너 안에만 저장 |
| 외부 링크 | 도움말의 https 링크를 기본 브라우저로 여는 것뿐(앱이 데이터를 보내지 않음) |
| 추적 (ATT) | 없음 |

- 봉인할 때 넣는 "봉인하는 사람" 이름·이메일은 **사용자가 만든 PDF 안에** 들어갑니다. 사용자가 그 PDF를 남에게 보내는 것은 사용자의 행동이고, 앱이 개발자에게 보내는 것이 아니므로 "수집"이 아닙니다. 다만 개인정보 처리방침에 이 사실을 적어 둡니다([privacy-policy.md](privacy-policy.md)).
- 나중에 RFC 3161 타임스탬프를 붙이면 문서 해시가 타임스탬프 서버(제3자)로 갑니다. 해시는 문서 내용이 아니지만, 그때는 서버 이름과 보내는 것을 처리방침에 적고 App Privacy 답을 다시 검토합니다.

---

## 8. 수출 규정 (Export Compliance)

### 8.1 결론

- `Info.plist`: **`ITSAppUsesNonExemptEncryption` = `NO`(false)** (`sandbox-plan.md` §3의 `mas.extendInfo`)
- App Store Connect에서 물으면: "암호화를 사용함 → **EAR Category 5 Part 2의 면제에 해당함**" → 서류(CCATS, 프랑스 신고서) 업로드 없음.
- **법무 확인을 받고 확정**합니다. Apple은 "규정을 잘못 해석하거나 면제를 부정확하게 주장한 책임은 개발자에게 있다"고 적고 있습니다(Overview of export compliance).

### 8.2 왜 대상인가

Apple: App Store Connect에 올리는 것 자체가 미국 서버로 올리는 것이라, 미국·캐나다 밖에 배포하면 **법인이 어디 있든** 미국 수출 규정을 따릅니다. 앱이 암호화를 "사용·접근·포함·구현·통합"하면 암호화 소프트웨어 수출로 봅니다. `ITSAppUsesNonExemptEncryption`은 "앱(링크한 제3자 라이브러리 포함)이 암호화를 안 쓰거나, 서류 제출 의무가 면제된 형태만 쓰면 NO"입니다. (Complying with Encryption Export Regulations)

### 8.3 앱이 쓰는 암호 기능 목록

| # | 어디서 | 무엇을 | 목적 | 분류 근거 |
|---|---|---|---|---|
| 1 | 봉인 서명 (`desktop/` seal, `node-forge`, `@signpdf/*`) | RSA-2048 서명, SHA-256, CMS/PAdES, 자체 서명 X.509 | **디지털 서명, 무결성, 인증** | EAR 5A002.a Technical Note 1의 "데이터 기밀성용 암호" **제외 항목** a(인증), b(디지털 서명), c(데이터 무결성), d(부인 방지) |
| 2 | 봉인 확인 | 서명·해시 검증 | 무결성·인증 | 위와 같음 |
| 3 | 봉인 신원 백업·가져오기 (PKCS#12) | 비밀번호 기반으로 **개인 키를 암호화**해 .p12에 담음 | 서명 키의 보관·이동 | 제외 항목 g "a~f 기능을 돕는 **키 관리**". 임의 파일을 암호화하는 기능은 없음 |
| 4 | 봉인 키 보관 (`safeStorage`) | macOS 키체인 | 키 보관 | **Apple 운영체제가 제공하는 암호화** (Apple 표 첫 줄: 서류 불필요) |
| 5 | 원본 확인 (`hashBytes()`, `crypto.subtle.digest("SHA-256")`) | 해시 | 파일이 바뀌었는지 비교 | 해시만, 암호화 아님 (무결성) |
| 6 | PDF 열기 (pdf.js) | 비밀번호가 걸린 PDF를 **읽기 위한 복호화**(PDF 표준 RC4/AES) | 문서 보기 | 복호화만 하고 암호화 기능은 없음. pdf-lib는 PDF를 암호화하지 않음 `⚠ 확인 필요`(비밀번호 PDF를 실제로 여는지) |
| 7 | Electron/Chromium 런타임 | BoringSSL(TLS), WebCrypto 등 표준 알고리즘이 **포함**됨 (Electron 가이드가 AES, RSA, ECDSA, SHA 등을 나열) | 앱 기능으로 쓰지 않음 | 앱은 네트워크를 쓰지 않고(CSP), MAS 빌드는 `network.client`가 없어 TLS 연결이 일어날 수 없음. 페이지는 WebCrypto로 암호화하지 않음(해시만) |

BIS 원문(Technical Note 1 to 5A002.a): "데이터 기밀성용 암호"란 디지털 기법으로 다음을 **제외한** 암호 기능을 수행하는 것: a. 인증, b. 디지털 서명, c. 데이터 무결성, d. 부인 방지, e. DRM, f. 오락·방송·의료기록용 암호화/복호화, g. a~f를 돕는 키 관리. → 이 앱의 암호 기능(1~5)은 모두 제외 항목에 들어가므로 5A002.a(통제 대상 암호)에 해당하지 않는다는 것이 핵심 논리입니다.

### 8.4 App Store Connect 질문 흐름 (예상)

`ITSAppUsesNonExemptEncryption=NO`를 넣으면 빌드마다 묻지 않습니다. 넣지 않으면 빌드가 "Missing Compliance(규정 준수 정보 누락)"에 머물러 TestFlight·심사로 넘어가지 않습니다.

질문 문구는 로그인해야 보이므로 공개 문서로 확인하지 못했습니다(`⚠ 확인 필요`). 알려진 흐름과 답:

| 질문 (요지) | 답 |
|---|---|
| 앱이 암호화를 사용하나요? (OS의 표준 암호화만 써도 "예") | **예** |
| EAR Category 5 Part 2의 면제에 해당하나요? (예: 인증·디지털 서명·파일 복호화로 한정, 의료, 은행, 저작권 보호 등) | **예** — 인증·디지털 서명·무결성으로 한정 |
| (위에서 "아니요"일 때만) 독자 알고리즘 / OS 밖의 표준 알고리즘 사용 여부, 프랑스 배포 여부 | 해당 없음 |

Apple 서류 표(Export compliance documentation for encryption): OS 암호화만 → 서류 없음 / OS 밖 표준 알고리즘 → 프랑스에 배포하면 프랑스 신고서 / 독자 알고리즘 → CCATS + 프랑스 신고서. 이 표는 **면제되지 않는(non-exempt) 암호화**에 대한 것이라, 면제 판단이 맞으면 해당하지 않습니다. 프랑스(ANSSI)의 주 통제 대상은 보안 저장, 보안 통신, 보안 백신 앱이고 은행·의료 앱은 면제라고 Apple이 적고 있습니다.

연말 자가 분류 보고서(self-classification report): Apple 문서는 "면제 형태를 써도 연말 보고서가 필요할 수 있다"고 적습니다. 2021-03-29 BIS 규칙 개정으로 대부분의 mass-market 품목(§740.17(b)(1))은 보고 의무가 없어졌다는 것이 로펌 해설들의 설명입니다. 이 앱처럼 기밀성 암호가 없으면 애초에 5A002/ENC 대상이 아니라는 판단이 우선입니다. **법무가 최종 확인**합니다.

### 8.5 나중에 바뀌는 경우

- **RFC 3161 타임스탬프를 붙일 때**: 타임스탬프 자체는 무결성·인증이라 제외 항목이지만, HTTPS로 서버에 붙으면 Chromium의 TLS(운영체제 암호화가 아님)를 쓰게 됩니다. 다시 판단합니다. 많은 TSA가 HTTP로도 응답하고 응답 자체가 서명되어 있으므로, **HTTP로 받으면 TLS 없이** 같은 기능을 낼 수 있습니다(`⚠ 확인 필요`: 사용할 TSA의 정책).
- 사용자가 PDF에 **비밀번호를 걸어 암호화하는 기능**을 넣으면 "데이터 기밀성용 암호"가 되어 면제 판단이 바뀝니다. 그 기능은 넣기 전에 법무 검토가 필요합니다.

---

## 9. 연령 등급 질문지

2026-01-31까지 새 질문지에 답해야 했고(Upcoming requirements), 등급은 4+, 9+, 13+, 16+, 18+입니다. 레퍼런스 저장소에 따르면 2026-11-16부터 "위치 공유", "데이트·관계" 질문이 추가되었습니다(`⚠ 확인 필요`: 화면에서 확인).

| 질문 묶음 | 항목 | 답 |
|---|---|---|
| 앱 내 제어 | 자녀 보호 기능, 연령 확인 | 없음 |
| 기능 (Capabilities) | **제한 없는 웹 접근** | **없음** — 앱 안에 웹 브라우저가 없음. 외부 링크는 기본 브라우저로 넘김 (있다고 답하면 16+, 한국 15+) |
| | 사용자 생성 콘텐츠, 소셜 미디어, 메시지·채팅, 위치 공유, 광고 | 모두 없음 |
| 성숙한 주제 | 비속어, 공포, 술·담배·약물, 데이트·관계 | 없음 |
| 의료·건강 | 의료 정보, 건강 주제 | 없음 |
| 성적 내용·노출 | 전부 | 없음 |
| 폭력 | 전부 | 없음 |
| 확률형 활동 | 도박, 모의 도박, 콘테스트, 확률형 아이템 | 없음 |
| **결과** | | **4+** (한국 표시: 전체 이용가) |

---

## 10. 심사 메모 (App Review Information › Notes)

연락처: 회사 담당자 이름, 이메일, **국제 형식 전화번호(+82 …)**(레퍼런스 저장소에 따르면 2026-08부터 국제 형식 필수, `⚠ 확인 필요`). 로그인 정보: "필요 없음".

```
Thank you for reviewing <App Name>.

No account or sign-in is needed, and the app works fully offline. It does not use the network.

Quick test with the built-in example (about 1 minute):
1. Launch the app. On the Library screen, click "Try an example document".
2. In the right-hand "Signatures & stamps" panel, click a sample signature or stamp, or drag it onto the page. Drag the corner to resize, the top handle to rotate.
3. Click "Save to file". Choose a location in the standard macOS save panel. A new PDF is created; the original is not changed.
4. Optional: File > Open (or drop any PDF on the window, or use Finder > Open With) to try your own PDF.
[conditional] 5. In the save dialog, turn on "Seal and save". The first time, the app asks for a sealer name to create a signing identity, stored in the macOS keychain. Then use "Verify seal…" on the saved PDF: it shows "Seal intact". Any later edit to that file shows as "Modified after sealing".

Notes on App Sandbox:
- The app only reads and writes files the user picks in the open/save panels (com.apple.security.files.user-selected.read-write) and keeps security-scoped bookmarks (com.apple.security.files.bookmarks.app-scope) so it can tell the user, in later sessions, whether an original PDF was moved or changed.
- com.apple.security.files.downloads.read-write: the Downloads folder is the default save location when no folder has been chosen yet.
- The app has no network entitlement and collects no data.

Language: English and Korean (View > Language).
"Seal" is a tamper-evident PDF digital signature (PAdES) with a self-signed certificate. It does not claim any legal certification.
```

(한국어 요약: 계정 없음, 오프라인. 예시 문서로 1분 테스트, 저장은 표준 저장 패널, 봉인은 조건부, 각 entitlement를 쓰는 이유, 봉인은 법적 인증을 주장하지 않음.)

- 메뉴 이름(View > Language, File > Open, "Try an example document", "Save to file")은 영어 UI 작업이 끝난 뒤 실제 라벨로 맞춥니다.
- `downloads.read-write`를 빼면 해당 줄도 뺍니다.

---

## 11. URL 제안

| 용도 | 제안 | 메모 |
|---|---|---|
| 지원 URL (필수) | `https://<회사 도메인>/<앱>/support` 또는 GitHub Pages `https://falcons-eyes.github.io/pdf-editor/support/` | **회사 이메일(또는 주소·전화)이 페이지에 보여야** 함 (Platform version information, 1.5). GitHub Issues 링크만으로는 부족할 수 있음. 한국어·영어 |
| 개인정보 처리방침 URL (필수) | `https://<회사 도메인>/<앱>/privacy` 또는 `https://falcons-eyes.github.io/pdf-editor/privacy/` | 초안: [privacy-policy.md](privacy-policy.md). 앱 안(도움말 메뉴)에도 같은 링크 (5.1.1(i)) |
| 마케팅 URL (선택) | 저장소 README 또는 회사 제품 페이지 | Windows 다운로드 링크가 있는 페이지는 스토어 메타데이터에 직접 연결하지 않는 편이 안전 (2.3.10 관점, `⚠ 확인 필요`) |

GitHub Pages는 조직 저장소(`falcons-eyes/pdf-editor`)의 `docs/` 또는 `gh-pages`에서 켤 수 있습니다. 회사가 GitHub 조직을 소유하는지, 법인 이름으로 페이지에 연락처를 적을지 `[결정]`.

---

## 12. 스크린샷·아이콘

- **스크린샷**: 2880×1800(권장, Retina) 또는 1440×900, 16:10, PNG, **알파 채널 없이** 내보내기(미리보기 앱 › 내보내기에서 "알파" 끄기, 또는 `sips -s format jpeg in.png --out out.jpg`로 JPEG 변환. 확인: `sips -g hasAlpha out.png` → `no`). 한국어판·영어판 각각. 최대 10장. 실제 macOS 앱 창(신호등 버튼, 메뉴 막대)을 쓰고 가짜 데이터(`docs/tools/seed-page.js`)를 씁니다(자세한 계획은 [featuring-assets.md](featuring-assets.md)).
  권장 순서: ① 계약서에 서명·도장을 놓은 편집 화면 ② 서명 그리기 ③ 도장 배경 지우기 ④ 보관함(상태 표시) ⑤ 저장 패널과 `_서명.pdf` ⑥ 봉인 확인 `[조건부]`.
- **아이콘**: macOS 앱 아이콘은 빌드 안의 `.icns`에서 가져옵니다. `desktop/build/icon.icns`에는 16~512@2x(1024px)까지 모두 있습니다(로컬 `iconutil`로 확인). macOS 아이콘은 모양이 있는 투명 배경이 정상입니다(스크린샷의 "투명 금지"와 다름). macOS 26부터 시스템이 Liquid Glass 스타일 아이콘(Icon Composer)을 권하고, 규격에 맞지 않는 옛 아이콘은 둥근 사각형 틀에 넣어 보여 줄 수 있습니다(`⚠ 확인 필요`). 레퍼런스 저장소의 "1024px, 알파 없음" 규칙은 **iOS 기준**입니다.
- 미리보기 영상(선택): 1920×1080, 15~30초 ([featuring-assets.md](featuring-assets.md) 참고).

---

## 13. "서명·전자서명" 표현 주의 (법무 검토용)

| 쓰지 않을 표현 | 이유 | 대신 |
|---|---|---|
| "법적 효력이 있는 전자서명", "공인 전자서명", "인증된 서명" | 한국 「전자서명법」(2020 전부개정)은 공인인증 제도를 없앴지만, 평가·인정받은 인증사업자 제도가 있음. 이 앱은 자체 서명 인증서라 그런 인증과 무관. 확인할 수 없는 주장은 2.3.1/2.3.7 위반 소지 | "서명·도장 이미지를 PDF에 넣기", "위·변조를 확인할 수 있는 디지털 서명(PAdES)" |
| "eIDAS 적격 전자서명", "DocuSign/Adobe Sign 대체" | 적격 서명은 적격 인증서·장치가 필요. 남의 상표 | "계약서에 서명·도장을 넣어 새 PDF로 저장" |
| "위조 불가능", "수정할 수 없는 PDF" | 설계 문서(`docs/design/seal-and-language.md`)대로 봉인은 수정을 막지 못하고 드러나게 할 뿐 | "고치면 바로 티가 나는 PDF", "수정되면 '봉인 뒤 수정됨'으로 표시" |
| "보안 인증", "암호화된 PDF" | 암호화 기능 없음. 수출 규정 판단과도 충돌 | 쓰지 않음 |

- 기능 이름 "서명"은 대부분 **서명 이미지를 얹는 것**을 뜻합니다. 법적 의미의 전자서명과 헷갈리지 않게, 설명의 "알아 두세요" 단락을 유지합니다.
- 최종 문구는 법무가 한국·미국·EU 출시 국가 기준으로 확인합니다.

---

## 출처

- App information (이름·부제·개인정보 처리방침 URL·카테고리·Bundle ID) — https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
- Platform version information (프로모션 텍스트·설명·키워드·지원 URL) — https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- Screenshot specifications — https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- App privacy details — https://developer.apple.com/app-store/app-privacy-details/
- Age ratings values and definitions — https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions
- Overview of export compliance — https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/
- Export compliance documentation for encryption — https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption
- Determine and upload app encryption documentation — https://developer.apple.com/help/app-store-connect/manage-app-information/determine-and-upload-app-encryption-documentation
- Complying with Encryption Export Regulations — https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations
- BIS, Cryptography for data confidentiality (Technical Note 1 to 5A002.a) — https://www.bis.gov/learn-support/encryption-controls/cryptography-for-data-confidentiality
- 2021 BIS 규칙 해설(예: Wilson Sonsini) — https://www.wsgr.com/en/insights/us-department-of-commerces-bureau-of-industry-and-security-relaxes-several-classification-and-reporting-requirements-for-encryption-items.html
- Upcoming requirements (연령 등급, DSA trader, quarantine) — https://developer.apple.com/news/upcoming-requirements/
- App Review Guidelines (1.5, 2.3.1, 2.3.7, 2.3.10, 4.1, 5.1.1, 5.2) — https://developer.apple.com/app-store/review/guidelines/
- Electron Mac App Store Submission Guide (암호 알고리즘 목록) — https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide
