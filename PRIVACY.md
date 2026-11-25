# Sealworks Privacy Policy · Sealworks 개인정보 처리방침

[English](#english) · [한국어](#한국어)

---

## English

**Sealworks Privacy Policy**

Effective date: 2026-11-25

Falcon Eyes Inc. (주식회사 팔콘아이즈, "we") publishes Sealworks (the "app"), an app for macOS, Windows and Android that places signatures, stamps and images on PDFs and can seal them. This policy explains how the app handles your information. It covers every version of the app: the Mac App Store version, the Android app on Google Play, and the macOS (DMG) and Windows versions downloaded from GitHub.

### 1. Information we collect

**We do not collect any personal information through the app.**

- The app has no account or sign-in.
- The app does not use the network. The Android app does not even ask for internet access. Your PDFs, images, signatures and stamps never leave your device.
- The app does not send usage data, analytics, crash reports or advertising identifiers to us or to anyone else.
- The app contains no third-party analytics, advertising or crash-reporting tools.

### 2. Information stored only on your device

To work, the app keeps the following **only on your device**. It is never sent to us, and we cannot see it.

| Information | Why |
|---|---|
| Copies of PDFs you open, page thumbnails, where you placed signatures and stamps | So you can continue in the Library |
| Signature and stamp images you add | To reuse them in later documents |
| Location, size, modification time and a content hash of originals and saved files | To tell you when a file was moved or changed outside the app |
| Access permissions for files and folders you chose (Mac App Store version only, as security-scoped bookmarks) | To check the same files the next time you open the app |
| Documents you picked in the system file picker or opened from another app, and the access Android granted for them (Android only) | To open the same documents again from the Library |
| Preferences (language, window size and similar) | To keep your settings |
| Sealer details you enter (your name, and optionally an organization) and your seal key | To seal (digitally sign) PDFs |

Where it is kept:

| Version | Folder |
|---|---|
| macOS, downloaded from GitHub | `~/Library/Application Support/PDF Editor` |
| Windows | `%APPDATA%\PDF Editor` |
| Mac App Store | the app's container, `~/Library/Containers/com.falconoon.sealworks/` |
| Android (Google Play) | the app's private storage on your phone or tablet, which other apps cannot read |

The folder name "PDF Editor" comes from the app's earlier name.

**Your seal key.** The private key used for sealing is created on your device and stays there. It is stored in the folder above, encrypted with a key protected by the macOS Keychain, by Windows (DPAPI) or by the Android Keystore. The app never sends it anywhere. If you choose `Back up…`, the app writes a password-protected `.p12` file to a place you pick; what you do with that file is up to you.

**Deleting it.** You can remove documents and signatures in the app. To remove everything, quit the app and delete the folder above. Removing the app does not delete this folder by itself. On macOS you can also remove the app's Keychain item in Keychain Access. On Android, uninstalling the app removes its storage, and you can also clear it in Settings › Apps › Sealworks › Storage.

**Android backup.** If Google backup is on, Android backs up only the app's language setting to your Google account. Your documents, signatures, stamps and seal key are left out. When you move to a new phone with Android's own cable or Wi-Fi transfer, your Library comes along but the seal key does not; use a .p12 backup to move it.

The app reads only files you choose, drop onto it or share to it from another app, and writes new files only where you choose.

### 3. Information inside sealed PDFs

When you use "Seal and save", the sealer details you entered (your name, and the organization if you gave one), the certificate and its fingerprint, and the time of sealing are written **into that PDF**. Anyone who receives the file can see them. This information is not sent to us.

### 4. Sharing

Because we collect no personal information, we do not share or sell any, and no one processes it on our behalf.

- **Mac App Store version:** Apple processes information when you download, install or update the app, under Apple's privacy policy. If you agreed in your Mac's settings to share analytics with app developers, Apple may give us aggregated crash reports and usage statistics. These come from Apple, not from the app.
- **Google Play version:** Google processes information when you download, install or update the app, under Google's privacy policy. If you agreed on your device to share usage and diagnostics, Google may give us aggregated crash reports and statistics (Android vitals). These come from Google, not from the app.
- **GitHub downloads:** GitHub processes information when you download a release or post an issue, under GitHub's privacy statement.

### 5. External links

Links in the app (for example Privacy policy, Support and the GitHub source code link) open in your default web browser. Those websites have their own policies.

### 6. Children

The app can be used by anyone, and it collects no personal information from anyone, including children.

### 7. Your choices and rights

We hold no personal information about you, so there is nothing for us to access, correct or delete. You can delete the information stored on your device at any time, as described in section 2.

### 8. Changes

If this policy changes, we will publish the new version here with a new effective date. If a future version of the app ever sends information off your device (for example, an optional trusted timestamp for seals), we will tell you in the app before that feature is turned on, and list here what is sent and where.

### 9. Contact

- Publisher: Falcon Eyes Inc. (주식회사 팔콘아이즈)
- Contact: [support@falconoon.com](mailto:support@falconoon.com). For bug reports you can also use [GitHub Issues](https://github.com/falcons-eyes/pdf-editor/issues); issues are public, so please don't include personal information or documents.
- Privacy contact: Falcon Eyes Inc. support ([support@falconoon.com](mailto:support@falconoon.com)).

---

## 한국어

**Sealworks(씰웍스) 개인정보 처리방침**

시행일: 2026-11-25

주식회사 팔콘아이즈(Falcon Eyes Inc., 이하 "회사")는 PDF에 서명·도장·이미지를 넣고 봉인할 수 있는 macOS·Windows·Android용 앱 Sealworks(이하 "앱")를 제공합니다. 이 방침은 앱이 이용자의 정보를 어떻게 다루는지 설명합니다. Mac App Store판, Google Play의 Android 앱, GitHub에서 받는 macOS(DMG)·Windows판에 모두 적용됩니다.

### 1. 수집하는 개인정보

**회사는 앱을 통해 어떠한 개인정보도 수집하지 않습니다.**

- 앱에는 회원 가입이나 로그인이 없습니다.
- 앱은 인터넷을 쓰지 않습니다. Android 앱은 인터넷 접근 권한 자체를 요청하지 않습니다. PDF, 이미지, 서명, 도장은 이용자의 기기 밖으로 나가지 않습니다.
- 앱은 사용 기록, 분석 정보, 오류 보고, 광고 식별자를 회사나 제3자에게 보내지 않습니다.
- 앱에는 분석, 광고, 오류 수집용 제3자 도구가 들어 있지 않습니다.

### 2. 내 기기에만 저장되는 정보

앱이 동작하려면 다음 정보를 **이용자의 기기 안에서만** 저장합니다. 이 정보는 회사로 전송되지 않으며 회사는 이를 볼 수 없습니다.

| 정보 | 목적 |
|---|---|
| 연 PDF의 사본, 쪽 썸네일, 놓아 둔 서명·도장의 위치 | 보관함에서 이어서 작업하기 |
| 등록한 서명·도장 이미지 | 다음 문서에서 다시 쓰기 |
| 원본·저장 파일의 위치, 크기, 수정 시각, 내용 해시 | 파일이 앱 밖에서 옮겨지거나 바뀌었는지 알려 주기 |
| 이용자가 고른 파일·폴더에 대한 접근 권한 정보(Mac App Store판만, 보안 북마크) | 다음 실행에서도 같은 파일을 확인하기 |
| 시스템 파일 선택기에서 고르거나 다른 앱에서 연 문서 목록과, Android가 그 문서에 준 접근 권한 정보(Android만) | 보관함에서 같은 문서를 다시 열기 |
| 화면 설정(언어, 창 크기 등) | 설정 유지 |
| 이용자가 입력한 봉인하는 사람 정보(이름, 선택적으로 소속)와 봉인 키 | PDF 봉인(디지털 서명) |

저장 위치:

| 판 | 폴더 |
|---|---|
| GitHub에서 받은 macOS판 | `~/Library/Application Support/PDF Editor` |
| Windows판 | `%APPDATA%\PDF Editor` |
| Mac App Store판 | 앱 컨테이너 `~/Library/Containers/com.falconoon.sealworks/` |
| Android판(Google Play) | 휴대폰·태블릿 안의 앱 전용 저장공간(다른 앱은 읽을 수 없음) |

폴더 이름 "PDF Editor"는 앱의 예전 이름에서 온 것입니다.

**봉인 키.** 봉인에 쓰는 개인 키는 이용자의 기기에서 만들어지고 그 기기에만 있습니다. 위 폴더 안에, macOS 키체인, Windows(DPAPI), Android 키 저장소(Keystore)가 지키는 키로 암호화해서 저장합니다. 앱은 이 키를 어디로도 보내지 않습니다. `백업…`을 고르면 이용자가 고른 곳에 암호를 건 `.p12` 파일을 만듭니다. 이 파일의 관리는 이용자에게 달려 있습니다.

**지우는 방법.** 문서와 서명은 앱 안에서 지울 수 있습니다. 모두 지우려면 앱을 닫고 위 폴더를 지웁니다. 앱을 삭제해도 이 폴더는 저절로 지워지지 않습니다. macOS에서는 "키체인 접근" 앱에서 이 앱의 키체인 항목도 지울 수 있습니다. Android에서는 앱을 삭제하면 앱 저장공간도 함께 지워지며, 설정 › 애플리케이션 › Sealworks › 저장공간에서 직접 지울 수도 있습니다.

**Android 백업.** Google 백업이 켜져 있으면 Android는 이 앱의 언어 설정만 이용자의 Google 계정에 백업합니다. 문서, 서명, 도장, 봉인 키는 백업에서 빠집니다. Android 자체의 케이블이나 Wi-Fi 이전 기능으로 새 휴대폰으로 옮기면 보관함은 함께 옮겨지지만 봉인 키는 옮겨지지 않습니다. 봉인 키는 .p12 백업으로 옮기세요.

앱은 이용자가 직접 고르거나 끌어다 놓은 파일, 다른 앱에서 공유한 파일만 읽고, 이용자가 고른 위치에만 새 파일을 저장합니다.

### 3. 봉인한 PDF에 들어가는 정보

"봉인해서 저장"을 쓰면, 이용자가 입력한 봉인하는 사람 정보(이름, 입력했다면 소속), 인증서와 그 지문, 봉인 시각이 **그 PDF 파일 안에** 들어갑니다. 파일을 받는 사람도 이 정보를 볼 수 있습니다. 이 정보는 회사로 전송되지 않습니다.

### 4. 제3자 제공 및 처리 위탁

회사는 개인정보를 수집하지 않으므로 제3자에게 제공하거나 판매하지 않으며, 처리를 맡기지도 않습니다.

- **Mac App Store판:** 앱을 받고, 설치하고, 업데이트할 때 Apple이 처리하는 정보에는 Apple의 개인정보 처리방침이 적용됩니다. 이용자가 Mac 설정에서 "앱 개발자와 공유"에 동의했다면, Apple이 회사에 집계된 오류 보고와 사용 통계를 줄 수 있습니다. 이 정보는 앱이 아니라 Apple에서 옵니다.
- **Google Play판:** 앱을 받고, 설치하고, 업데이트할 때 Google이 처리하는 정보에는 Google의 개인정보 처리방침이 적용됩니다. 이용자가 기기에서 사용 및 진단 정보 공유에 동의했다면, Google이 회사에 집계된 오류 보고와 통계(Android vitals)를 줄 수 있습니다. 이 정보는 앱이 아니라 Google에서 옵니다.
- **GitHub에서 받는 판:** 릴리스를 받거나 이슈를 올릴 때 GitHub가 처리하는 정보에는 GitHub의 개인정보 처리방침이 적용됩니다.

### 5. 외부 링크

앱 안의 링크(예: 개인정보 처리방침, 지원·문의, GitHub 소스 코드)를 누르면 이용자의 기본 웹 브라우저가 열립니다. 그 웹사이트에는 해당 사이트의 방침이 적용됩니다.

### 6. 아동

앱은 연령과 관계없이 사용할 수 있으며, 아동을 포함한 누구의 개인정보도 수집하지 않습니다.

### 7. 이용자의 권리

회사는 이용자의 개인정보를 보관하지 않으므로 열람·정정·삭제를 요청할 대상 정보가 없습니다. 내 기기에 저장된 정보는 2항의 방법으로 언제든 직접 지울 수 있습니다.

### 8. 방침의 변경

이 방침이 바뀌면 이 페이지에 새 시행일과 함께 게시합니다. 앞으로 앱이 정보를 기기 밖으로 보내게 되는 경우(예: 봉인 시각을 외부 타임스탬프 서버에서 받는 선택 기능)에는 그 기능을 켜기 전에 앱 안에서 알리고, 무엇을 어디로 보내는지 이 방침에 적습니다.

### 9. 문의처

- 회사: 주식회사 팔콘아이즈 (Falcon Eyes Inc.)
- 문의: [support@falconoon.com](mailto:support@falconoon.com). 버그 제보는 [GitHub Issues](https://github.com/falcons-eyes/pdf-editor/issues)도 됩니다. 이슈는 누구나 볼 수 있으니 개인정보나 문서는 올리지 마세요.
- 개인정보 보호책임자: 주식회사 팔콘아이즈 고객지원 담당 ([support@falconoon.com](mailto:support@falconoon.com))
<!-- 「개인정보 보호법」 제30조·시행령 제31조: 책임자 성명·부서·전화번호를 정하면 이 줄에 추가합니다. -->
