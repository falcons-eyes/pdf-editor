# Mac App Store 피처링 요청 (Featuring Nominations) 패키지

PDF Editor를 Mac App Store(조직 개발자 계정)에 낼 때, App Store Connect의 **피처링 요청**으로 Apple 에디터 팀에 알리기 위한 준비물입니다.
영상·스크린샷 같은 자료는 [featuring-assets.md](featuring-assets.md)에 따로 정리했습니다.

- 확인 기준일: 2026-11-25. Apple 공식 문서(아래 [출처](#출처))를 직접 읽어 확인했습니다.
- App Store Connect 화면에는 로그인하지 않았습니다. 그래서 **실제 화면의 한국어 메뉴 이름**과 **화면 입력란의 글자 수 제한**은 공식 문서(CSV 템플릿 포함) 기준이고, 화면에서 한 번 더 확인해야 합니다. 이런 항목은 `⚠ 확인 필요`로 표시했습니다.
- 표시 `[조건부]`: 지금 코드에는 아직 없거나 확인되지 않은 내용입니다. 해당 작업을 끝낸 뒤에만 문구에 남기세요.

---

## 1. 공식 절차 (확인됨)

### 누가 할 수 있나

역할이 **Account Holder, Admin, App Manager, Marketing** 중 하나여야 합니다. 조직 계정이니 마케팅 담당자에게 Marketing 역할을 주면 됩니다.
Apple이 이 앱을 검토하게 되면 **Admin · App Manager · Marketing 역할 팀원에게 이메일로 홍보용 아트워크를 요청**할 수 있습니다. 그러니 이 역할의 메일함을 누군가 꼭 확인하게 해 두세요.

### 경로

App Store Connect › **앱** › PDF Editor 선택 › 사이드바 **피처링(Featuring)** › **피처링 요청(Nominations)** › `+` › **피처링 요청 생성(Create Nomination)**
(처음이면 **시작하기(Get Started)** › **피처링 요청 생성**)

> ⚠ 확인 필요: Threads 글에는 메뉴가 `추천` › `추천 신청` › `추천 신청 생성(+)`으로 나옵니다. Apple 한국어 도움말에는 `피처링` › `피처링 요청` › `피처링 요청 생성`으로 나옵니다. 화면 번역과 도움말 번역이 다를 수 있으니, 둘 중 보이는 이름을 고르면 됩니다.

### 단계와 입력란

| 단계 | 영문 UI | 한국어(도움말 기준) | 제한 · 메모 |
|---|---|---|---|
| 1 | Name Your Nomination | 피처링 요청 이름 지정 | 필수. 내부 관리용. **최대 60자** (CSV 템플릿 기준) |
| 2 | Choose a Type | 유형 선택 | `App Launch`(앱 출시: 신규 앱 출시 또는 **사전 주문**) / `App Enhancements`(앱 개선: 새 기능, 기능 향상, 중요한 업데이트) / `New Content`(새로운 콘텐츠: 새 콘텐츠, 프로모션, 이벤트). **제출한 뒤에는 유형을 바꿀 수 없음** |
| 3 | Description | (설명) | 목적, 우선순위, 업데이트의 구체적인 내용과 새 기능의 목표를 적으라고 안내합니다. **최대 1,000자** (CSV 템플릿 기준. ⚠ 화면 제한도 같은지 확인 필요) |
| 4 | Choose a Publish Date | 게시일 선택 | `Day`(날짜) 또는 `Range`(기간). **내 기기의 시간대 기준**. 도움말 권장은 **최소 3주 전** |
| 5 | Additional Information | 추가 정보 | 아래 표 |
| 6 | Save as Draft / Submit Nomination | 임시 저장 / 피처링 요청 제출 | 임시 저장하면 `Drafts`(초안)로 갑니다. 제출하면 `Submitted`로 갑니다 |

추가 정보:

| 입력란 | 내용 |
|---|---|
| Related apps (관련 앱) | 같은 계정의 앱, 모두 합쳐 최대 10개. 제출한 뒤에는 바꿀 수 없음 |
| Platforms (플랫폼) | `macOS` 선택. CSV 값: `iOS (iPhone)`, `iOS (iPad)`, `macOS`, `tvOS`, `watchOS`, `visionOS` |
| Relevant Countries or Regions (관련 국가 또는 지역) | 앱을 내놓은 나라가 미리 선택되어 있고, 고칠 수 있음. CSV는 3글자 ISO 코드 |
| Localizations (현지화) | 앱의 현지화가 미리 선택되어 있음 |
| In-App Events (앱 내 이벤트) | **iPhone·iPad 앱만 가능.** Mac 앱은 해당 없음 |
| Supplemental Materials (추가 자료) | **URL 최대 5개.** 문서, 파일, 아트 애셋, **TestFlight 공개 링크**를 넣을 수 있음. 데모 영상 링크는 여기에 넣습니다 |
| Helpful Details (도움이 되는 세부사항) | 자유 입력. 접근성, 포용성, 우선순위, 팀이나 앱만의 특징. **최대 500자** (CSV 템플릿 기준) |
| (CSV에만 보이는 질문) | 일부 나라에서 먼저 출시하는지(Yes/No), 사전 주문이 있는지(Yes/No), 새 앱 내 이벤트를 낼 예정인지(Yes/No). ⚠ 화면에서 어떻게 묻는지는 확인 필요 |

관리:

- 대시보드는 `Drafts` / `Submitted` / `Archived` 세 칸입니다.
- 제출한 요청도 고칠 수 있습니다. 단, **유형과 관련 앱은 바꿀 수 없습니다.** 출시일이 밀리면 게시일을 고쳐 다시 제출하세요.
- `Duplicate`(복제)를 하면 게시일, 플랫폼, 먼저 출시할 시장, 추가 자료는 복사되지 않습니다.
- `Archive`(보관)한 요청은 되살리거나 고칠 수 없습니다. 제출한 요청을 지우려면 먼저 보관해야 하고, 지우면 되돌릴 수 없습니다.
- CSV로 한 번에 최대 50개를 올릴 수 있습니다. CSV로 올린 요청은 **바로 제출**되고, 초안으로 남길 수 없습니다. 우리는 한 건씩 화면에서 만드는 편이 안전합니다.

### 미리 알아둘 점 (확인됨)

- **Mac 앱도 대상입니다.** 플랫폼 목록에 `macOS`가 있습니다.
- **출시 전에도 낼 수 있습니다.** `App Launch`는 출시 또는 사전 주문을 알리는 유형입니다. 다만 앱을 고르는 화면에서 시작하므로 **App Store Connect에 앱 레코드가 있어야** 합니다.
- **빌드 업로드, TestFlight, 심사 중 상태가 꼭 필요하다는 말은 공식 문서에 없습니다.** 대신 추가 자료에 TestFlight 공개 링크를 넣을 수 있다고 안내하니, Mac용 TestFlight 공개 링크를 주면 에디터가 직접 써 볼 수 있어 유리합니다. (추정)
- **얼마나 미리 내나:** 「Getting featured」 페이지에는 "최소 2주 전, 더 넓은 기회를 원하면 최대 3개월 전"이라고 되어 있습니다. 도움말과 CSV 템플릿에는 "최소 3주"라고 되어 있습니다. **3주를 마지노선으로 잡고, 4~8주 전에 내는 것**을 권장합니다.
- **결과를 알려 주나:** 뽑히지 않으면 따로 알려 주지 않습니다(문서에 안내가 없음). App of the Day 같은 일부 Today 배치에 오르면 App Store Connect 앱으로 알림이 옵니다. 검토 대상이 되면 위 역할에게 아트워크 요청 메일이 올 수 있습니다.
- **체크리스트는 없습니다.** 에디터가 보는 요소는 사용자 경험, UI 디자인, 혁신(새 기술로 고유한 문제 해결), 독창성, **접근성**, **현지화**(여러 언어의 품질과 문화적 적합성), **제품 페이지**(스크린샷, 앱 미리보기, 설명, 평점과 리뷰)입니다.

### Threads 글과 비교

| Threads 글 | 실제 | 판정 |
|---|---|---|
| 무료, 출시·업데이트 일정을 에디터에게 알리는 메뉴 | 맞음 | ✅ |
| 경로: 앱 선택 › 추천 › 추천 신청 › 생성(+) | 구조는 맞음. 공식 한국어 이름은 `피처링` › `피처링 요청` | ✅ (이름은 ⚠) |
| 유형 3개: 새로운 앱 출시 / 앱 개선 사항 / 인앱 콘텐츠 | 공식 이름은 `앱 출시` / `앱 개선` / `새로운 콘텐츠`. 새로운 콘텐츠에는 이벤트뿐 아니라 **프로모션(오퍼)**도 들어감. 앱 출시에는 **사전 주문**도 들어감 | 대체로 맞음 |
| 이미 출시한 앱이면 '앱 개선 사항' | 큰 기능 업데이트라면 맞음. 시즌 콘텐츠나 할인은 '새로운 콘텐츠' | 보완 |
| 날짜: 최소 2주 전, 3~4주 전이 좋음 | 최소 2주(소개 페이지) 또는 **최소 3주**(도움말). **최대 3개월 전** 권장 | 보완: 3주 이상 |
| 설명: 영어 먼저, 한국어 아래 | 형식 규정은 없음. 합리적인 방법. 다만 **둘 합쳐 1,000자 안**에 들어가야 함 | 보완 |
| 국가: 지원 언어에 맞춰 | 앱을 내놓은 나라가 미리 선택되어 있음. 현지화 입력란이 따로 있음 | 보완 |
| 추가 정보: 사용 기술 + 15~30초 데모 영상 링크 | 실제 입력란은 **추가 자료(URL 5개)**와 **도움이 되는 세부사항(500자)** 두 개. 15~30초는 공식 **앱 미리보기 길이와 같음** | 보완 |
| 뽑혀도 따로 연락 안 옴 | 일부 Today 배치는 앱 알림이 옴. 검토 중이면 아트워크 요청 메일이 올 수 있음 | ⚠ 일부 틀림 |
| (언급 없음) | 역할 제한, 제출 뒤 유형 변경 불가, CSV 일괄 등록, 이름 60자 | 누락 |

---

## 2. 함께 쓸 수 있는 무료 홍보 도구

| 도구 | Mac 앱 | 메모 |
|---|---|---|
| **Promotional Text** (프로모션 텍스트) | ⚠ 표시 위치 확인 필요 | 170자. 설명 위에 나옵니다. **새 버전을 제출하지 않아도 언제든 바꿀 수 있습니다.** 공식 문서에는 "iOS 11 이상" 표시만 명시되어 있으니 Mac 제품 페이지에 어떻게 보이는지 출시 후 확인하세요 |
| **Custom Product Pages** (맞춤형 제품 페이지) | ✖ (공식 안내는 iPhone·iPad뿐) | 최대 70개, 스크린샷·미리보기·프로모션 텍스트·키워드·딥링크. Mac 지원은 공식 문서에 없음 |
| **Product Page Optimization** (A/B 테스트) | ✖ (공식 안내는 iOS·iPadOS 15 이상뿐) | 대안 최대 3개, 최대 90일 |
| **In-App Events** (앱 내 이벤트) | ✖ | 피처링 도움말에 "iPhone 및 iPad 앱만"으로 명시. 이름 30자, 짧은 설명 50자, 긴 설명 120자, 최대 31일 |
| **사전 주문** (Pre-order) | ✅ | 모든 Apple 플랫폼의 무료·유료 앱. 출시일은 게시 후 2~180일 뒤. **빌드가 App Review 승인을 받아야** 사전 주문을 열 수 있음. App Launch 요청과 같이 쓰기 좋음 |
| **App Store Marketing Tools** | ✅ | `toolbox.marketingtools.apple.com`에서 **Download on the Mac App Store** 배지(50개 언어), 아이콘, **QR 코드**, 임베드 코드, **짧은 링크**를 만듭니다 |
| **Accessibility Nutrition Labels** (손쉬운 사용 레이블) | ✅ (macOS 26 이상에서 표시) | 제품 페이지에 손쉬운 사용 기능을 신고합니다. 지금은 선택이지만 나중에 필수가 됩니다. Mac에서는 Larger Text 항목이 없습니다. "접근성" 기준에 바로 연결되니 출시 전에 정직하게 채우세요 |
| **앱 미리보기 · 스크린샷** | ✅ | 미리보기는 언어마다 최대 3개, 스크린샷은 최대 10장. 규격은 [featuring-assets.md](featuring-assets.md) |

배지와 마케팅 문구 규칙(요약):

- Apple이 준 배지 그대로 씁니다. 바꾸거나 기울이거나 움직이면 안 됩니다. "App Store"는 번역하지 않습니다.
- Mac 앱에는 **Mac App Store** 배지를 씁니다.
- "available on the Mac App Store"처럼 씁니다. Apple과 관계가 있는 것처럼 보이면 안 됩니다.
- 마케팅 문구에 macOS 같은 OS 이름을 쓰지 말라는 규정이 있습니다.
- "Featured by Apple / Apple 추천" 같은 표현은 규정에 따로 언급이 없습니다. 연관 암시 금지 규정에 걸릴 수 있으니 **실제로 피처링된 경우에도 조심**하세요. (⚠ 해석)

**언론·에디터 연락:** Apple은 개발자용 에디터 연락처나 언론 창구를 공개하지 않습니다. 공식 경로는 피처링 요청 하나입니다. 에디터에게 개인 메일을 보내거나 SNS로 연락하지 마세요. 연락은 Apple이 역할 기반 메일로 먼저 합니다.

---

## 3. 앱이 가진 것과 부족한 것 (피처링 기준에 맞춰)

### 피치에 쓸 수 있는 사실 (코드·문서로 확인함)

- PDF에 직접 그린 서명, 도장 이미지, 글자·날짜 도장을 끌어다 놓고, 크기·회전·불투명도·잉크 색을 바꿉니다. mm 단위로 위치를 정할 수 있고 맞춤선이 나옵니다.
- 종이에 찍은 **도장 사진의 흰 배경을 자동으로 지웁니다**. 한국 계약 문화(서명 + 도장, `(인)`)에 맞춘 기능이라 **현지화와 독창성**을 보여 주기 좋습니다.
- 여러 쪽에 복사하거나 `모든 쪽의 같은 위치에 넣기`가 됩니다. 서명·도장 목록은 저장되어 다음 문서에서 다시 씁니다.
- **보관함**이 자동 저장하고 문서 상태(`저장 전` / `파일 저장됨` / `확인 필요`)를 보여 줍니다. Finder에서 원본을 옮기거나 이름을 바꾸거나 고치면 알려 줍니다.
- **원본은 바꾸지 않습니다.** 저장하면 `<이름>_서명.pdf`라는 새 파일이 생깁니다.
- 인터넷 없이 동작합니다. 업로드, 계정, 사용 기록 수집이 없습니다. 무료이고 MIT 오픈소스입니다.
- 시스템 **다크 모드**(`prefers-color-scheme`, `nativeTheme`)와 **동작 줄이기**(`prefers-reduced-motion`)를 따릅니다. macOS 메뉴 막대와 네이티브 열기 대화상자, 단축키(⌘O, ⌘S, ⌘Z, ⌘D, 화살표로 미세 이동)가 있습니다.
- **v1.1 (작업 중, `docs/design/seal-and-language.md`):**
  - 한국어·영어 화면 전환. 처음에는 시스템 언어를 따르고, 메뉴와 대화상자도 같이 바뀝니다.
  - **봉인해서 저장(Seal):** PAdES B-B, SHA-256, DocMDP P=1 인증 서명입니다. 키는 Electron `safeStorage`(macOS 키체인)로 암호화해 둡니다. 네트워크를 쓰지 않습니다.
  - **봉인 확인:** 상태를 `봉인 그대로` / `봉인 뒤 수정됨` / `봉인이 올바르지 않음`으로 보여 줍니다.
  - **주의:** 자체 서명 인증서라서 Acrobat에서는 서명자가 "확인되지 않음"으로 나옵니다. **법적 효력이 있는 공인·적격 전자서명이라고 쓰면 안 됩니다.** "위변조를 드러내는 봉인(tamper-evident)"이라고만 씁니다.

### 피처링 전에 고칠 것 (권장 사항. 코드는 바꾸지 않았음)

**상위 3개**

1. **Mac App Store용 빌드부터 만들어야 합니다. 지금 빌드는 그대로 낼 수 없습니다.**
   - 지금은 ad-hoc 서명 DMG이고, `hardenedRuntime: false`이며, arm64용과 x64용이 따로 있습니다.
   - Mac App Store에 내려면 **App Sandbox가 필수**입니다(App Review Guidelines 2.4.5). electron-builder `mas` 타깃, Apple Distribution 인증서, 프로비저닝 프로파일, entitlements를 준비하세요. Apple Silicon과 Intel을 모두 지원하려면 **universal** 빌드 하나로 올리는 편이 좋습니다.
   - 샌드박스에서는 다음 기능을 고쳐야 할 가능성이 큽니다.
     - (a) 원본 옆에 `_서명.pdf`를 바로 쓰는 저장. 저장 대화상자를 쓰거나 사용자가 고른 폴더 권한이 필요합니다.
     - (b) 보관함이 원본 경로를 다시 열고 Finder 변경을 감지하는 기능. **보안 범위 북마크(security-scoped bookmark)**가 필요합니다.
     - (c) 앱 안의 파일 탐색기(`fb-list`)로 아무 폴더나 읽는 기능.
     - (d) 데이터 위치가 `~/Library/Containers/<bundle id>/…`로 바뀌는 점. README에 적힌 경로와 달라집니다.
     - (e) 샌드박스에서 `safeStorage`와 키체인이 동작하는지. 실제로 확인해야 합니다.
   - 2.4.5의 다른 조건도 지켜야 합니다. (ii) Xcode 도구로 패키징한 단일 앱 번들이어야 하고, (vii) 업데이트는 Mac App Store로만 해야 합니다. 지금 코드에는 자체 업데이트 기능이 없어서 괜찮습니다. 다만 Mac App Store판에서는 "새 버전은 GitHub에서 받으세요" 같은 안내를 빼야 합니다.
   - 앱 레코드를 만들기 전에 정할 것:
     - **번들 ID**: 지금은 `io.github.falcons-eyes.pdf-editor`입니다. 조직 도메인으로 바꿀지 정하세요. 업로드한 뒤에는 바꿀 수 없습니다.
     - **앱 이름**: "PDF Editor"는 흔한 이름이라 이미 쓰이고 있을 가능성이 큽니다. App Store 이름은 겹칠 수 없고 30자까지입니다. 에디터 눈에 띄려면 고유한 이름이 낫습니다. (⚠ App Store Connect에서 이름을 예약해 보고 확인 필요)
2. **접근성을 보강해야 합니다.** 접근성은 공식 기준에 들어 있고, 손쉬운 사용 레이블로 제품 페이지에 그대로 드러납니다.
   - 페이지에 놓은 항목(`.ov`)이 `role="img"`이고 `tabindex`가 없습니다. 그래서 **키보드나 VoiceOver만으로는 항목을 고르거나 옮길 수 없을 가능성**이 큽니다. 화살표 이동은 항목을 고른 뒤에만 동작합니다.
   - 서명 패드 `<canvas>`에는 레이블이 없습니다. 대안인 글자 도장이 있다는 점을 안내하면 좋습니다.
   - 아이콘 버튼 레이블, 포커스 순서, 대비를 VoiceOver와 Voice Control로 직접 점검하세요.
   - 점검한 뒤 **VoiceOver / Voice Control / Dark Interface / Reduced Motion / Sufficient Contrast / Differentiate Without Color Alone** 중 실제로 되는 것만 신고하세요.
3. **제품 페이지와 영어·한국어 현지화를 완성해야 합니다.**
   - v1.0의 메뉴(`desktop/src/main.js`)와 README 영어 섹션("The UI is Korean")은 한국어 전용입니다. 그러니 **Mac App Store 첫 빌드는 v1.1의 한국어·영어 전환이 들어간 버전**으로 내는 것을 권장합니다.
   - 제품 페이지 메타데이터, 스크린샷, 앱 미리보기를 영어와 한국어 두 벌로 준비하세요.
   - 개인정보 레이블은 **Data Not Collected**로 냅니다. 실제로 네트워크를 쓰는 곳이 GitHub 링크(`openExternal`)뿐인지 확인하세요.
   - 데모 영상은 실제 macOS 앱 창으로 다시 찍어야 합니다. 지금 GIF는 브라우저에서 찍었고 커서와 창 버튼이 가짜입니다. ([featuring-assets.md](featuring-assets.md))

**그 밖에**

- **"웹 래퍼"로 보이지 않게 하세요.** Electron 앱이라 에디터는 네이티브 느낌을 봅니다. 다음을 점검하세요: 창 제목 막대와 신호등 버튼 위치, 메뉴 구성(파일/편집/보기/윈도우/도움말), ⌘, 설정, 저장 대화상자, 드래그앤드롭, Finder의 "다음으로 열기", 키체인 사용 안내.
  - App Review Guidelines 4.2(최소 기능)는 앱이 오프라인에서 완전히 동작하므로 문제될 가능성이 낮습니다. (추정)
- **Apple Silicon 성능:** 큰 PDF(100쪽 이상)를 열 때 반응 속도와 메모리를 확인하세요.
- **도움말 메뉴의 GitHub 링크:** 앱 안에서 외부 결제를 유도하지 않으니 문제없습니다. 다만 "지원 URL"과 "개인정보 처리방침 URL"이 필요합니다. 처리방침 문서는 아직 없으니 준비하세요.
- 평점과 리뷰도 제품 페이지 기준에 들어갑니다. 출시 직후 실제 사용자에게 리뷰를 부탁하는 것은 정상적인 방법입니다. 다만 대가를 주는 리뷰는 금지입니다.

---

## 4. 붙여넣을 피처링 요청 초안

> 글자 수는 붙여넣을 본문만 센 값입니다(Python `len`, 줄바꿈 포함). `[조건부]` 문장은 해당 작업을 끝냈을 때만 남기세요. 버전 번호는 실제 출시 버전으로 바꾸세요.

### 4-1. 앱 출시 (App Launch): Mac App Store 첫 출시

- **이름 (60자 이내):** `PDF Editor 1.1 – Mac App Store launch (KO/EN)`
- **유형:** `App Launch` (앱 출시). 사전 주문을 열면 `Does this app include a pre-order? = Yes`
- **게시일:** `Day` = 목표 출시일 **T**. 날짜가 확실하지 않으면 `Range` = T ~ T+7일. **T보다 4~8주 전에 제출하고, 늦어도 3주 전**까지는 냅니다.
- **플랫폼:** `macOS`
- **현지화:** `ko`, `en-US` (앱 메타데이터를 낸 언어만)
- **관련 국가 또는 지역:** 아래 [국가 선택](#국가-선택) 참고

**Description (741자 / 1,000자):**

```text
PDF Editor is a free, open-source Mac app for signing PDFs without printing, scanning or uploading. Drop a PDF, place a drawn signature, a stamp photo (white paper background removed automatically) or a text/date stamp, and save a new copy. The original is never modified.

New on the Mac App Store: English and Korean UI, a Library that autosaves every document and notices when a file is moved or edited in Finder, and a reusable signature library. Fully offline: no account, no upload, no tracking.

PDF Editor는 출력·스캔·업로드 없이 PDF에 서명하는 무료 오픈소스 Mac 앱입니다. 직접 그린 서명, 도장 사진(흰 배경 자동 제거), 글자·날짜 도장을 놓고 새 파일로 저장합니다. 원본은 바꾸지 않습니다.

Mac App Store 첫 출시: 한국어·영어 화면, 문서를 자동 저장하고 Finder에서 옮기거나 고친 것을 알려 주는 보관함, 다시 쓰는 서명 목록. 인터넷 없이 동작하며 계정·업로드·추적이 없습니다.
```

> 봉인(Seal)도 첫 출시 빌드에 들어간다면, 두 번째 문단 끝에 이 문장을 덧붙이세요(+약 110자): `New: Seal and save adds a PAdES digital signature so any later edit shows; the key stays in the macOS Keychain.` 한국어 문단 끝에도 `봉인해서 저장: PDF 전자서명(PAdES)으로 나중에 고친 흔적이 드러나고, 키는 macOS 키체인에 둡니다.`를 붙입니다. 이때 4-2는 다음 큰 업데이트용으로 아껴 둡니다.

**Helpful Details (422자 / 500자):**

```text
Made in Korea for a real habit: Korean contracts still need a signature and a dojang (seal stamp). PDF Editor turns a phone photo of a paper stamp into a clean transparent stamp. Privacy by design: works fully offline, no account, no analytics (App Privacy: Data Not Collected). Follows Dark Mode and Reduce Motion, native macOS menus, keyboard shortcuts. Universal (Apple Silicon + Intel). MIT-licensed; source on GitHub.
```

- `[조건부]` `Data Not Collected`: 개인정보 레이블을 그렇게 냈을 때만 남깁니다.
- `[조건부]` `Universal (Apple Silicon + Intel)`: universal 빌드로 냈을 때만 남깁니다.
- VoiceOver를 보강했다면 `VoiceOver labels and full keyboard control for placing signatures.`를 덧붙입니다. 500자를 넘지 않게 다른 문장을 줄이세요.

**Supplemental Materials (최대 5개):**

1. 데모 영상, 영어판 (YouTube 미등록 링크 또는 GitHub Release 첨부 MP4)
2. 데모 영상, 한국어판
3. Mac TestFlight 공개 링크 `[조건부]`
4. 언론용 자료 묶음: 스크린샷, 아이콘, 한 줄 소개. GitHub의 `docs/images` 폴더나 Release 첨부 ZIP
5. GitHub 저장소 `https://github.com/falcons-eyes/pdf-editor`

### 4-2. 앱 개선 (App Enhancements): 봉인(Seal) 업데이트

- **이름:** `PDF Editor 1.2 – Seal (tamper-evident PDF signatures)`
- **유형:** `App Enhancements` (앱 개선)
- **게시일:** 이 업데이트를 내놓을 날 **U**. **U보다 4~6주 전에 제출하고, 늦어도 3주 전**까지는 냅니다. 출시 요청과 시기가 겹치지 않게, 첫 출시 뒤 최소 몇 주는 띄우는 것을 권장합니다.
- **플랫폼 · 현지화 · 국가:** 4-1과 같음

**Description (747자 / 1,000자):**

```text
PDF Editor signs PDFs on your Mac with no printing, scanning or uploading. This update adds Seal and save: an optional PDF digital signature (PAdES, DocMDP "no changes") over the final file, so any later edit shows as "Modified after sealing" in the app and in PDF readers. Verify seal checks any PDF dropped in. The sealing key is created on your Mac and protected by the macOS Keychain; it never leaves the device and nothing goes online. It is tamper evidence, not a certified e-signature.

PDF Editor는 출력·스캔·업로드 없이 Mac에서 PDF에 서명하는 앱입니다. 이번 업데이트는 '봉인해서 저장'을 더합니다. 완성된 파일에 PDF 전자서명(PAdES, DocMDP '변경 불가')을 넣어, 나중에 고치면 앱과 PDF 뷰어에서 '봉인 뒤 수정됨'으로 바로 드러납니다. '봉인 확인'으로 받은 PDF도 검사합니다. 봉인 키는 내 Mac에서 만들어 키체인으로 보호하며 밖으로 나가지 않습니다. 공인 전자서명이 아니라 위변조 확인용입니다.
```

> 한국어·영어 전환이 첫 출시에 들어가지 않았다면, 이 요청의 이름을 `… – Seal + English UI`로 바꾸고 다음 문장을 덧붙이세요: `The whole app, menus and dialogs are now in English as well as Korean, following the system language.` / `앱 전체와 메뉴·대화상자를 한국어와 영어로 쓸 수 있고, 시스템 언어를 따릅니다.`

**Helpful Details (422자 / 500자):**

```text
Why it matters: people email signed PDFs and have no easy way to show the file was not changed afterwards. Seal gives that with standard PDF signatures any reader can check, without a server or subscription. The key is kept encrypted with the macOS Keychain. Honest UI: the app says a self-made certificate shows as "signer not verified" in Acrobat. English and Korean UI, Dark Mode, offline, no data collected. Free, MIT.
```

**Supplemental Materials:** 봉인 데모 영상(영어/한국어), TestFlight 공개 링크 `[조건부]`, 봉인 확인 화면 스크린샷, `docs/design/seal-and-language.md`의 공개용 요약(선택).

### 국가 선택

- **권장: 출시하는 모든 나라를 선택된 채로 둡니다.** 기본값이 앱을 내놓은 나라 전체이고, 영어 화면은 어디서나 쓸 수 있으며, 무료 앱이라 줄일 이유가 없습니다.
- 그래도 우선순위를 밝히고 싶으면, Description이나 Helpful Details에 "Priority markets: Korea, then English-speaking regions"를 한 줄로 적습니다.
- 꼭 좁혀야 한다면 다음을 남깁니다. 이유: 한국어 현지화가 있고 도장 문화가 맞는 시장, 그리고 영어 현지화가 있는 주요 시장.
  - **KOR**(대한민국)
  - **USA, GBR, CAN, AUS, NZL, IRL**, 그리고 영어권 업무 시장인 **SGP**
- 일본(JPN)과 대만(TWN)도 인감·도장 문화가 있지만 일본어·중국어 현지화가 없습니다. 지금은 빼는 편이 정직합니다. 일본어 현지화를 더하면 좋은 후보입니다.

---

## 5. 일정과 체크리스트

T = Mac App Store 목표 출시일. 출시 날짜를 직접 정하려면 App Store Connect에서 **"이 버전을 수동으로 출시"**를 고르세요.

| 언제 | 할 일 |
|---|---|
| T-10~8주 | ☐ 번들 ID와 앱 이름 정하기 → App Store Connect에 앱 레코드 만들기(이름 예약) ☐ Marketing 역할 담당자 지정 ☐ `mas` 샌드박스 universal 빌드 만들고 TestFlight(Mac) 내부 테스트 ☐ 위 "고칠 것" 1~3 진행 |
| T-8~6주 | ☐ 제품 페이지 영어·한국어(이름 30자, 부제 30자, 프로모션 텍스트 170자, 설명 4,000자, 키워드 100바이트) ☐ 스크린샷, 앱 미리보기 ☐ 개인정보 레이블, 손쉬운 사용 레이블 ☐ 지원 URL, 개인정보 처리방침 URL ☐ 데모 영상 링크 2개 올리기 |
| **T-8~4주 (늦어도 T-3주)** | ☐ **피처링 요청 4-1 제출**. 우선 임시 저장해서 팀이 같이 검토한 뒤 제출 ☐ TestFlight 공개 링크를 추가 자료에 넣기 |
| T-3~2주 | ☐ App Review에 제출하고 "수동 출시" 선택. 첫 심사는 리젝 위험이 있으니 여유를 두세요 ☐ (선택) 승인되면 사전 주문을 열고, 요청의 사전 주문 항목을 Yes로 고치기 ☐ 출시일이 바뀌면 **요청의 게시일을 고쳐 다시 제출** |
| T | ☐ 출시 ☐ 프로모션 텍스트를 출시 문구로 바꾸기 ☐ Marketing Tools에서 Mac App Store 배지, QR 코드, 짧은 링크를 받아 README와 GitHub Release에 넣기 ☐ 역할 메일함을 매일 확인(아트워크 요청 대비) |
| T+0~4주 | 아래 비Apple 채널 홍보 ☐ 리뷰와 평점 응대 ☐ 다음 개선 업데이트(봉인)의 일정 U를 정하고, **U-6~4주에 4-2 제출** |

### 출시 후 홍보 (Apple 밖, 비공식 채널)

> Apple 공식 경로가 아닙니다. 피처링 여부와 상관없고, 각 커뮤니티의 홍보 규칙을 따르세요. 회사·개인 연락처는 꼭 필요한 곳에만 넣습니다.

- **국내:** GeekNews(Show GN), 디스콰이엇, OKKY, Threads `1인개발` 같은 주제 피드, 맥 사용자 커뮤니티(클리앙 맥당 등), 회사 블로그·브런치. 한국어 데모 GIF를 함께 올립니다.
- **해외:** Product Hunt(화요일~목요일 출시 권장, 일반론), Hacker News "Show HN"(오픈소스와 오프라인을 강조), Reddit r/macapps, AlternativeTo, MacUpdate.
- **GitHub:** Release 노트, README 상단에 Mac App Store 배지 넣기. 배지 사용 규정을 지키세요.
- **문구 주의:** "Apple 추천", "Featured by Apple"은 실제로 피처링되었을 때만, 사실 그대로 조심해서 씁니다. 공인 전자서명이라는 표현은 쓰지 않습니다.

---

## 출처

- Apple Developer, [Getting featured on the App Store](https://developer.apple.com/app-store/getting-featured/) ([한국어](https://developer.apple.com/kr/app-store/getting-featured/))
- App Store Connect Help, [Nominate your app for featuring](https://developer.apple.com/help/app-store-connect/manage-featuring-nominations/nominate-your-app-for-featuring/) ([한국어](https://developer.apple.com/kr/help/app-store-connect/manage-featuring-nominations/nominate-your-app-for-featuring/))
- App Store Connect Help, [Nominations template](https://developer.apple.com/help/app-store-connect/reference/nominations/nominations-template) (글자 수 제한, CSV 값)
- [In-App Events](https://developer.apple.com/app-store/in-app-events/), [Custom product pages](https://developer.apple.com/app-store/custom-product-pages/), [Product page optimization](https://developer.apple.com/app-store/product-page-optimization/), [Pre-orders](https://developer.apple.com/app-store/pre-orders/)
- App Store Connect Help, [Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information) (프로모션 텍스트 170자, 설명 4,000자, 키워드 100바이트)
- App Store Connect Help, [Accessibility Nutrition Labels overview](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels)
- [App Store Marketing Guidelines](https://developer.apple.com/app-store/marketing/guidelines/), [App Store Marketing Tools](https://toolbox.marketingtools.apple.com/app-store/)
- [App Store promotional artwork guidelines](https://help.apple.com/asc/appspromoart/#/itc4425c5252) (에디터가 아트워크를 요청할 때)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) 2.4.5(Mac App Store: (i) 샌드박스, (ii) Xcode 기술로 패키징·단일 번들, (vii) 업데이트는 Mac App Store로만)와 4.2(최소 기능: 다시 포장한 웹사이트 이상이어야 함)
- Threads 글 스크린샷 2장(사용자 제공): 참고 정보로만 사용했습니다.
