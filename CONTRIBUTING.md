# Contributing to Sealworks

[English](#english) · [한국어](#한국어)

## English

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

### Issues

- Report bugs and suggest features in [GitHub Issues](https://github.com/falcons-eyes/pdf-editor/issues).
- For a bug, tell us your system (macOS or Windows version), the Sealworks version, what you did, what you expected and what happened. Please don't attach real contracts or personal documents. A made-up PDF that shows the problem is best.
- Security problems don't belong in public issues. See [SECURITY.md](SECURITY.md).

### Pull requests

- For anything larger than a small fix, open an issue first so we can agree on the approach.
- Keep each pull request to one topic.
- Sealworks works offline and never uploads files. Changes must keep it that way: no network calls, analytics or remote resources.
- Text shown in the app comes in Korean and English. Add or change both.
- Run the tests before you submit: `cd desktop && npm ci && npm test`.

### Permission to make changes for a contribution

The [LICENSE](LICENSE) (PolyForm Strict License 1.0.0) doesn't allow changes to Sealworks, and the [additional permissions](LICENSE-PERMISSIONS.md) cover only using and sharing the official app. As a further permission, Falcon Eyes Inc. lets you copy and change Sealworks, in a fork or on your own computer, and publish that fork on GitHub, **only to prepare, test and submit contributions to this repository**. This permission doesn't let you use, share or publish a changed version for any other purpose, and it ends for a fork you no longer use for that.

### Your contribution and its license

By submitting a contribution (code, documentation, images, translations or anything else) to this repository, through a pull request or any other way:

1. **You grant Falcon Eyes Inc. a license.** You give Falcon Eyes Inc. (주식회사 팔콘아이즈) a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, copy, change, publish, distribute and sublicense your contribution, and to license it to others under any terms, including commercial licenses and distribution through app stores. This also covers any patent claims of yours that your contribution would infringe.
2. **You confirm you have the right.** The contribution is your own work, or you otherwise have the right to submit it under these terms. If your employer or anyone else has rights in it, they have agreed.
3. **You keep your copyright.** This is a license, not a transfer. You can still use your own contribution however you like.
4. **No obligations either way.** We don't have to accept or use your contribution. You don't have to support it. It is provided as is, without warranty.

If you can't agree to this, please don't open a pull request. Open an issue describing the change instead.

---

## 한국어

도와주셔서 고맙습니다. 버그 신고, 제안, 풀 리퀘스트 모두 환영합니다.

### 이슈

- 버그 신고와 기능 제안은 [GitHub Issues](https://github.com/falcons-eyes/pdf-editor/issues)에 남겨 주세요.
- 버그라면 사용하는 시스템(macOS 또는 Windows 버전), Sealworks 버전, 무엇을 했는지, 무엇을 기대했고 실제로 어떻게 됐는지 알려 주세요. 실제 계약서나 개인 문서는 올리지 마세요. 문제가 드러나는 가상의 PDF가 가장 좋습니다.
- 보안 문제는 공개 이슈에 올리지 마세요. [SECURITY.md](SECURITY.md#한국어)를 보세요.

### 풀 리퀘스트

- 작은 수정보다 큰 변경이라면, 먼저 이슈를 열어 방향을 맞춰 주세요.
- 풀 리퀘스트 하나에는 주제 하나만 담아 주세요.
- Sealworks는 인터넷 없이 동작하고 파일을 어디에도 올리지 않습니다. 변경도 이 약속을 지켜야 합니다. 네트워크 호출, 사용 기록 수집, 외부 리소스를 넣지 마세요.
- 앱에 나오는 글은 한국어와 영어 두 가지입니다. 둘 다 추가하거나 고쳐 주세요.
- 보내기 전에 테스트를 돌려 주세요: `cd desktop && npm ci && npm test`.

### 기여를 위해 고칠 수 있는 권한

[LICENSE](LICENSE)(PolyForm Strict License 1.0.0)는 Sealworks를 고치는 것을 허락하지 않고, [추가 권한](LICENSE-PERMISSIONS.md#한국어)도 공식 앱을 쓰고 나눠 주는 것만 다룹니다. 팔콘아이즈는 이에 더해, **이 저장소에 기여를 준비·시험·제출하는 목적으로만** Sealworks를 포크나 내 컴퓨터에 복사해 고치고, 그 포크를 GitHub에 공개하는 것을 허락합니다. 이 허락으로 고친 버전을 다른 목적으로 쓰거나 나눠 주거나 공개할 수는 없으며, 더 이상 기여에 쓰지 않는 포크에는 적용되지 않습니다.

### 기여물과 라이선스

이 저장소에 기여물(코드, 문서, 이미지, 번역 등 무엇이든)을 풀 리퀘스트나 다른 방법으로 보내면 다음에 동의하는 것입니다.

1. **팔콘아이즈에 라이선스를 줍니다.** 주식회사 팔콘아이즈(Falcon Eyes Inc.)에 기여물을 쓰고, 복제하고, 고치고, 공개하고, 배포하고, 재허락할 수 있는 영구적이고 전 세계적이며 비독점적이고 무상이며 철회할 수 없는 라이선스를 줍니다. 여기에는 상업 라이선스와 앱 스토어 배포를 포함해 어떤 조건으로든 다른 사람에게 라이선스할 권리가 포함됩니다. 기여물이 침해하게 될 기여자 본인의 특허 청구항에도 적용됩니다.
2. **권리가 있음을 확인합니다.** 기여물은 직접 만든 것이거나, 이 조건으로 보낼 권리가 있는 것입니다. 회사나 다른 사람이 그 기여물에 권리를 가지고 있다면 그쪽도 동의했습니다.
3. **저작권은 기여자에게 남습니다.** 이것은 라이선스이지 양도가 아닙니다. 기여자는 자신의 기여물을 계속 원하는 대로 쓸 수 있습니다.
4. **서로 의무는 없습니다.** 우리는 기여물을 받아들이거나 써야 할 의무가 없고, 기여자도 기여물을 지원할 의무가 없습니다. 기여물은 보증 없이 있는 그대로 제공됩니다.

동의하기 어렵다면 풀 리퀘스트 대신 원하는 변경을 설명하는 이슈를 열어 주세요.

이 문서의 한국어와 영어 내용이 다르면 영어가 우선합니다.
