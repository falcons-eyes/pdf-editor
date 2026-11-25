# Security policy

[English](#english) · [한국어](#한국어)

## English

### Supported versions

Security fixes go into the latest release of Sealworks. Older versions don't get fixes, so please update to the [latest release](https://github.com/falcons-eyes/pdf-editor/releases/latest).

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Older releases | No |

### Reporting a vulnerability

Please report security problems privately. Don't open a public issue.

- **Email:** support@falconoon.com, with "Security" in the subject.
- **GitHub:** if the repository's [Security tab](https://github.com/falcons-eyes/pdf-editor/security) shows **Report a vulnerability**, you can use that private form instead.

Helpful details: the Sealworks version and system, what an attacker could do, steps or a sample file to reproduce it (made-up documents only, please), and whether you'd like to be credited.

We'll confirm we got your report, keep you updated while we work on it, and tell you when a fix is released. Please give us reasonable time to fix the problem before you talk about it publicly. Test only on your own devices, files and keys.

Examples of what we want to hear about: a crafted PDF or image that makes Sealworks run code or read files it shouldn't, a way to make **Verify seal** show **Seal intact** for a changed file, or a way to read someone's seal key without their permission (including from a `.p12` backup without its password).

---

## 한국어

### 지원하는 버전

보안 수정은 Sealworks 최신 릴리스에만 들어갑니다. 이전 버전은 고치지 않으니 [최신 릴리스](https://github.com/falcons-eyes/pdf-editor/releases/latest)로 업데이트해 주세요.

| 버전 | 지원 |
| --- | --- |
| 최신 릴리스 | 예 |
| 이전 릴리스 | 아니요 |

### 취약점 신고

보안 문제는 비공개로 알려 주세요. 공개 이슈에는 올리지 마세요.

- **이메일:** support@falconoon.com, 제목에 "Security" 또는 "보안"을 넣어 주세요.
- **GitHub:** 저장소의 [Security 탭](https://github.com/falcons-eyes/pdf-editor/security)에 **Report a vulnerability**가 보이면 그 비공개 양식을 써도 됩니다.

알려 주시면 좋은 것: Sealworks 버전과 시스템, 공격자가 할 수 있는 일, 재현 방법이나 예시 파일(가상의 문서만), 이름을 밝혀 감사를 표해도 되는지.

신고를 받았다고 알려 드리고, 처리하는 동안 진행 상황을 전하고, 수정이 나오면 알려 드립니다. 공개하기 전에 고칠 시간을 충분히 주세요. 시험은 본인의 기기, 파일, 키로만 해 주세요.

이런 문제를 알려 주시면 좋습니다: 조작한 PDF나 이미지로 Sealworks가 코드를 실행하거나 읽으면 안 되는 파일을 읽게 만드는 것, 고친 파일을 **봉인 확인**이 "봉인 그대로"로 보여 주게 만드는 것, 허락 없이 다른 사람의 봉인 키를 읽어 내는 것(`.p12` 백업을 암호 없이 여는 것 포함).
