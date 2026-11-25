# 피처링 요청용 자료: 데모 영상과 스크린샷

[featuring.md](featuring.md)의 **추가 자료(Supplemental Materials, URL 최대 5개)**에 넣을 자료와, 제품 페이지의 **앱 미리보기·스크린샷** 계획입니다.

## 1. 지금 저장소에 있는 것

| 파일 | 상태 | Apple 자료로 쓸 수 있나 |
|---|---|---|
| `docs/images/demo.gif` | 1200×750, 15fps, 18초. 한국어 UI. `docs/tools/demo.cjs`로 **브라우저(dev_server)에서** 찍었습니다. 커서와 창 버튼은 녹화용으로 페이지 안에 그린 가짜입니다 | 스토리보드 참고용으로만 씁니다. 피처링 링크나 앱 미리보기로는 맞지 않습니다 |
| 영어판·한국어판 데모 GIF | 다른 작업에서 만드는 중 | 같은 방식이면 위와 같습니다. 컷 구성과 문서 시나리오는 그대로 가져다 쓰면 됩니다 |
| `docs/images/hero.png`, `features.png`, `steps.png`, `social.png` 등 | README용 합성 이미지입니다 | 언론 자료 묶음에 넣을 수는 있습니다. 제품 페이지 스크린샷으로는 다시 찍어야 합니다 |
| `docs/tools/seed-page.js` | 누가 봐도 가짜인 문서와 도장을 만듭니다 (`용역계약서_가나다.pdf` 등) | **그대로 활용합니다.** 실제 고객 데이터가 화면에 나오지 않게 해 줍니다 |

### Apple용으로 바꿔야 할 것

1. **실제 macOS 앱 창을 찍습니다.** Mac App Store 빌드(또는 `npm run pack`으로 만든 `.app`)를 열고, 진짜 신호등 버튼, 메뉴 막대, 네이티브 열기 대화상자와 Finder가 보이게 합니다. 가짜 커서는 넣지 말고 **실제 macOS 커서**를 씁니다. QuickTime이나 `screencapture`에서 마우스 클릭 표시를 켜면 됩니다.
2. **해상도:** 1920×1080(16:9) 이상으로 찍습니다. 앱 미리보기 규격은 정확히 1920×1080, 가로 방향, **최대 30fps**입니다.
3. **형식:** MP4/H.264(High Profile, Level 4.0, 10~12Mbps), AAC 256kbps 스테레오.
4. **길이:** **15~30초.** 앱 미리보기도 15~30초라서, 한 파일을 피처링 링크와 제품 페이지에 같이 쓸 수 있습니다.
5. **올리는 곳:** YouTube **미등록(unlisted)** 링크, 또는 GitHub Release의 첨부 MP4. 로그인 없이 열리는지 시크릿 창에서 확인하세요.
6. **데이터 격리:** `PDFE_HOME_OVERRIDE=<임시 폴더>`로 앱을 실행합니다(`desktop/README.md` 참고). 그러면 실제 보관함이 아닌 빈 저장소에서 시작합니다. 그 폴더의 `Documents`에 가짜 PDF만 넣어 두세요.
7. **화면 정리:** 녹화할 때는 바탕화면 아이콘, 알림, 메뉴 막대의 다른 앱 아이콘, 실제 이름이 들어간 Finder 사이드바를 숨깁니다. Apple 마케팅 가이드라인도 "가상의 데이터, 최신 OS"를 요구합니다.

## 2. 영상 대본 (25초 내외)

공통: 음성 내레이션 없이 화면 자막만 씁니다. 자막은 화면 아래쪽에 짧게, 컷마다 최대 한 줄입니다. 배경음은 없거나 아주 작게 둡니다. 앱 미리보기에서도 소리는 꺼진 상태로 재생되는 경우가 많습니다.

### English version

| 시간 | 화면 | 자막 |
|---|---|---|
| 0:00–0:03 | Finder에서 `Service_Agreement_Sample.pdf`를 PDF Editor 아이콘(Dock)으로 끌어다 놓기 → 앱이 열림 | **Sign PDFs on your Mac.** |
| 0:03–0:08 | 오른쪽 `Signatures & Stamps`에서 그려 둔 서명을 서명란으로 끌어 놓기 → 모서리를 끌어 크기 조절, 위쪽 동그라미로 살짝 회전 | Drag your signature into place. |
| 0:08–0:13 | 종이 도장 사진(PNG/JPG)을 붙여넣기(⌘V) → `Remove white paper background`가 켜지며 배경이 사라짐 → 이름 옆에 놓기 | Stamp photos lose their paper background. |
| 0:13–0:17 | 글자·날짜 도장으로 오늘 날짜 넣기 → `Apply to every page` | Dates, initials, every page at once. |
| 0:17–0:22 | ⌘S → 저장 대화상자에서 `Seal and save` 체크 `[조건부: 봉인 기능이 들어간 빌드]` → Finder에 `…_signed.pdf`가 원본 옆에 생김. 원본은 그대로 | A new file. Your original is untouched. |
| 0:22–0:26 | 보관함(Library) 홈: 문서 타일과 상태 칩. 다크 모드로 전환 1초(선택) | Works offline. No account. No upload. |
| 0:26–0:28 | 앱 아이콘과 이름 | **PDF Editor** · Free on the Mac App Store |

> 저장 파일 이름의 접미사(`_서명` / 영어 UI에서의 이름)는 v1.1 영어 UI에서 실제로 무엇으로 나오는지 확인한 뒤 자막과 맞추세요.
> 앱 미리보기에서는 마지막 컷의 "Free on the Mac App Store" 같은 가격·스토어 문구를 빼는 편이 안전합니다. 앱 미리보기는 앱 화면 위주여야 하고, 가격 표시는 나라마다 다를 수 있기 때문입니다. 피처링 링크용 영상에는 넣어도 됩니다.

### 한국어판

| 시간 | 화면 | 자막 |
|---|---|---|
| 0:00–0:03 | Finder에서 `용역계약서_가나다.pdf`를 Dock의 PDF Editor로 끌어다 놓기 | **Mac에서 바로 PDF에 서명하세요.** |
| 0:03–0:08 | `서명 · 도장` 목록에서 서명을 서명란에 놓고, 크기와 각도 맞추기 | 서명을 끌어다 놓으면 끝. |
| 0:08–0:13 | 도장 사진 붙여넣기(⌘V) → `흰 종이 배경 지우기` → `(인)` 자리에 놓기 | 도장 사진도 배경 없이 깔끔하게. |
| 0:13–0:17 | 글자·날짜 도장 → `모든 쪽의 같은 위치에 넣기` | 날짜, 이름, 모든 쪽에 한 번에. |
| 0:17–0:22 | ⌘S → `봉인해서 저장` `[조건부]` → Finder에 `용역계약서_가나다_서명.pdf` | 원본은 그대로, 새 파일로 저장. |
| 0:22–0:26 | 보관함 홈과 상태 칩(`파일 저장됨`). 다크 모드(선택) | 인터넷 없이. 계정도, 업로드도 없이. |
| 0:26–0:28 | 앱 아이콘과 이름 | **PDF Editor** · 무료 |

### 봉인(Seal) 업데이트용 짧은 영상 (15~20초, 앱 개선 요청용)

1. 봉인해서 저장 (0~5초)
2. 저장한 PDF를 미리보기 앱에서 한 글자 고치고 저장 (5~10초). macOS 미리보기로 고치면 서명 뒤에 바이트가 덧붙거나 파일이 다시 쓰입니다. 어떻게 나오는지 실제로 해 보고 컷을 정하세요.
3. PDF Editor 창에 끌어다 놓기 → `봉인 확인` → **`봉인 뒤 수정됨` / `Modified after sealing`** 상태가 보임 (10~15초)
4. 자막: "Any later edit shows." / "고치면 바로 티가 납니다."

자막에 "법적 효력", "공인 인증" 같은 말은 쓰지 않습니다.

## 3. 녹화와 변환

### 녹화 (macOS)

- 화면 해상도를 1920×1080 영역이 깔끔하게 나오는 배율로 맞춥니다. 레티나 화면이면 3840×2160으로 찍고 줄이는 편이 선명합니다.
- 앱 창 크기를 16:9 영역에 맞춥니다. 예: 창을 1760×990 정도로 두고 주변 여백까지 1920×1080으로 찍습니다.
- QuickTime Player › 파일 › 새로운 화면 기록 › **선택 부분 기록**을 씁니다. 옵션에서 "마우스 클릭 보기"를 켭니다.
- 터미널에서 찍을 수도 있습니다: `screencapture -v -k -R0,0,1920,1080 ~/Desktop/pdfe-raw.mov`. `-k`는 클릭 표시이고, 녹화를 멈추려면 Ctrl-C를 누릅니다. ⚠ 옵션은 macOS 버전마다 다를 수 있으니 `man screencapture`로 확인하세요.
- 데이터 격리 예시:

  ```sh
  DEMO_HOME="$(mktemp -d)"; mkdir -p "$DEMO_HOME/Documents"
  # 가상의 PDF만 $DEMO_HOME/Documents 에 복사한 뒤
  PDFE_HOME_OVERRIDE="$DEMO_HOME" "/Applications/PDF Editor.app/Contents/MacOS/PDF Editor"
  ```

  Mac App Store 샌드박스 빌드에서도 이 환경 변수가 먹는지는 ⚠ 확인이 필요합니다. 먹지 않으면 녹화 전용 macOS 사용자 계정을 만들어 찍으세요.

### 변환: 앱 미리보기 규격 MP4 (1920×1080, 30fps, H.264, 무음 AAC 스테레오)

```sh
# in: 녹화 원본(.mov), 시작 2초부터 28초 길이로 자름. 비율이 다르면 여백(밝은 회색)으로 채움
ffmpeg -ss 2 -t 28 -i pdfe-raw.mov \
  -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 \
  -filter_complex "[0:v]fps=30,scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xF2F3F5,setsar=1,format=yuv420p[v]" \
  -map "[v]" -map 1:a -shortest \
  -c:v libx264 -profile:v high -level:v 4.0 -preset slow -b:v 11M -maxrate 12M -bufsize 24M \
  -c:a aac -b:a 256k -ar 48000 -ac 2 \
  -movflags +faststart PDF-Editor-preview-en-1080p.mp4

# 확인: 1920x1080, 30fps, 15~30초, h264 High, aac stereo
ffprobe -v error -show_entries stream=codec_name,profile,width,height,r_frame_rate,channels:format=duration -of compact PDF-Editor-preview-en-1080p.mp4
```

- 배경음을 넣으려면 `anullsrc` 줄 대신 `-i music.m4a`를 쓰고, `-map 1:a`는 그대로 둡니다.
- 레티나 원본(3840×2160)도 같은 명령으로 1920×1080으로 줄어듭니다.
- 자막은 편집기(iMovie, Final Cut 등)에서 넣은 뒤 위 명령으로 다시 뽑는 편이 쉽습니다. ffmpeg `drawtext`로도 넣을 수 있지만 한글 글꼴 경로를 지정해야 합니다.
- README용 GIF가 필요하면 같은 MP4에서 만듭니다: `ffmpeg -i in.mp4 -vf "fps=15,scale=1200:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" out.gif`

## 4. 제품 페이지 스크린샷 (Mac)

- 규격: 16:10 비율의 **1280×800, 1440×900, 2560×1600, 2880×1800** 중 하나. 언어마다 최대 10장. ⚠ 기억에 근거한 값이니 업로드 화면에서 확인하세요. 앱 미리보기 규격(1920×1080)은 Apple 문서로 확인했습니다.
- 권장 구성은 5장이며, 영어·한국어 각각 만듭니다.
  1. 편집 화면: 서명과 도장을 놓은 계약서. 가장 중요한 한 장입니다.
  2. 도장 배경 지우기 전후 (`seal-bg-off` / `seal-bg-on` 장면)
  3. 보관함과 상태 칩
  4. 저장 대화상자와 원본 보존 안내
  5. 봉인 확인 결과 `[조건부]`, 또는 다크 모드 편집 화면
- 이미지 위에 짧은 제목을 얹는 것은 흔한 방식입니다. 다만 화면 대부분은 실제 앱 UI여야 합니다.

## 5. 에디터가 아트워크를 요청할 때

검토 대상이 되면 Admin · App Manager · Marketing 역할에게 메일이 옵니다. [App Store promotional artwork guidelines](https://help.apple.com/asc/appspromoart/#/itc4425c5252)에 맞춘 자료를 요구할 수 있으니, 미리 아래를 준비해 두면 빨리 답할 수 있습니다.

- 앱 아이콘 원본: 레이어가 있는 고해상도 파일. `desktop/build/icon.png`의 원본과 `npm run icon` 소스
- 글자를 넣지 않은 키 비주얼 배경
- 로고타입
