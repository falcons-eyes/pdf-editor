# PDF Editor (PDF Overlay Editor) for macOS

PDF 위에 서명·도장 같은 이미지(PNG/JPG)를 올려 위치와 크기를 맞춘 뒤 새 PDF로 저장하는 앱입니다.
현재 버전은 `pdf_overlay_editor_v3.py` (앱 버전 3.1)입니다. `pdf_overlay_editor_v2.py`는 이전 버전입니다.

## 기능

- PDF 열기: 메뉴·버튼(⌘O), 창에 드래그 앤 드롭, Finder의 "다음으로 열기"
- 페이지마다 여러 개의 오버레이 이미지 배치 (이미지도 드래그 앤 드롭 가능)
- 마우스로 이동, 네 모서리 핸들로 크기 조절
- 속성 패널: X/Y/W/H 직접 입력, 투명도, 90° 단위 회전, 크기 비율
- 실행 취소/다시 실행 (⌘Z / ⌘⇧Z) — 이동·크기·속성 변경·추가·삭제 모두
- 선택한 오버레이를 다음 페이지로 복제 (⌘D)
- 확대/축소, 너비 맞춤, 페이지 맞춤, 썸네일 사이드바, 다크 모드
- 최근 파일 목록 (`~/.pdf_overlay_editor/config.json`)
- 원본은 건드리지 않고 `_edited.pdf`로 새로 저장 (원본 덮어쓰기는 막혀 있음)

## 단축키

| 키 | 동작 |
|---|---|
| ⌘O / ⌘⇧O | PDF 열기 / 오버레이 이미지 추가 |
| ⌘S | PDF 내보내기 |
| ⌘Z / ⌘⇧Z | 실행 취소 / 다시 실행 |
| ⌫ | 선택한 오버레이 삭제 (입력칸에서는 글자 지우기) |
| ⌘D | 다음 페이지로 복제 |
| ← / → | 이전 / 다음 페이지 |
| ⌘+ / ⌘- / ⌘1 / ⌘2 / ⌘3 | 확대 / 축소 / 실제 크기 / 너비 맞춤 / 페이지 맞춤 |
| ⌘\ | 사이드바 토글 |

## 소스에서 실행

Tk가 포함된 Python 3이 필요합니다 (python.org 설치본 권장. Homebrew Python은 `python-tk`를 따로 설치해야 함).

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python pdf_overlay_editor_v3.py
```

## 앱 빌드

```bash
./build.sh
```

- `.venv-build` 가상환경을 만들어 `requirements.txt`만 설치하고 PyInstaller로 빌드합니다.
  (전역/conda 환경에서 빌드하면 torch 등이 딸려 들어가 앱이 500MB를 넘습니다.)
- 결과: `dist/PDF Editor.app`, `PDF_Editor.dmg`
- 다른 Python을 쓰려면 `PYTHON=/path/to/python3 ./build.sh` (venv를 새로 만들려면 `.venv-build` 삭제)
- 버전은 `build.sh`의 `VERSION` 값입니다.
- `setup.py`(py2app)는 예전 방식으로, 지금 빌드에는 쓰이지 않습니다.

## 제한 사항

- 임시(ad-hoc) 서명이라 이 Mac에서는 그대로 실행되지만, DMG를 다른 Mac으로 옮기면 Gatekeeper 경고가 뜹니다
  (Apple Developer ID 서명과 공증이 필요).
- Tk 8.6 한계로 Retina 화면에서 편집 화면의 PDF가 약간 흐릿하게 보일 수 있습니다. 저장되는 PDF 품질과는 무관합니다.
- 회전은 90° 단위만 지원합니다.
- 오버레이 정보는 작업 중에만 유지되고 프로젝트 파일로 저장되지 않습니다.

## 추천 이미지

- 배경이 투명한 PNG
- 검은색 또는 짙은 파란색 서명 이미지
- 너무 크지 않은 적당한 해상도
