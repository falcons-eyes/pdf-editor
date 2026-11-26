# Sealworks: who it is for, and the situations we show (shared brief, 2026-11-25)

One source for the app's example gallery, the landing page's "for your situation" section, the
demo videos and the store screenshots. Inspired by situation cards ("~해 드릴게요" with a short
"how") rather than feature lists: a person should read a card and think "that's me".

Copy rules (Korean first, English mirrors it):
- Natural Korean sentences. Avoid hyphens, bullets, slashes and long comma chains in user copy;
  use a sentence or two instead. No Hanja (no 印). "(인)" in Hangul on a document is fine.
- Each card: one headline that names the situation in the person's words ("~할 때", "~해요"),
  one short line on what Sealworks does. No feature jargon (PAdES, DocMDP) on cards.
- Made-up people and companies only (홍길동, 김하늘, 새솔디자인, 한빛상사 …; Jordan Lee, Northwind …).

| id | Who (persona) | Situation card (ko) | Situation card (en) | Document in the example | What they do |
| --- | --- | --- | --- | --- | --- |
| `lease` | 사회초년생 세입자 | 집주인이 보낸 월세 계약서, 출력하지 않고 서명해서 바로 돌려보내요 | Sign the lease your landlord emailed, without a printer | 주택 월세 계약서 2쪽 (특약 포함) | 서명 + 도장, 모든 쪽에 간인, 날짜 |
| `parttime` | 카페·식당 사장님 | 알바생 근로계약서를 매장 태블릿에서 바로 받아요 | Get a part-timer's contract signed on the shop tablet | 단시간 근로자 표준근로계약서 | 근로자 서명 칸에 직접 서명, 사업주 도장 |
| `quote` | 프리랜서·1인 사업자 | 견적서에 회사 직인을 찍어서 오늘 안에 보내요 | Stamp your company seal on a quote and send it today | 견적서 1쪽 | 직인 이미지(흰 배경 제거), 날짜 |
| `school` | 학부모 | 아이 현장체험학습 신청서, 사진 찍어 보내지 말고 깔끔하게 서명해요 | Sign the school's field-trip form neatly, no phone photos | 가정통신문 동의서 / 현장체험학습 신청서 | 보호자 서명, 체크 표시, 날짜 |
| `expense` | 직장인 | 지출결의서와 휴가신청서에 결재 도장을 한 번에 찍어요 | Put your approval stamp on expense and leave forms in one go | 지출결의서 + 연차 휴가 신청서 | 결재란 도장, 여러 장 같은 자리 |
| `proxy` | 가족 대신 서류를 떼는 사람 | 부모님 대신 서류를 뗄 때 필요한 위임장에 서명받아요 | Get a power of attorney signed to pick up papers for a parent | 위임장 | 위임인 서명·도장, 신분 정보 칸 채우기 |
| `freelance` | 프리랜서 디자이너·개발자 | 용역 계약서에 서명하고 봉인해서, 나중에 고쳐지면 바로 알아요 | Sign and seal a freelance contract so any later edit shows | 용역 계약서 2쪽 (현재 예시) | 서명 + 도장 + 봉인, 상대가 봉인 확인 |
| `agreement` | 합의서를 주고받는 개인 | 받은 합의서가 보낸 그대로인지 봉인으로 확인해요 | Check that the agreement you got back is exactly what you sent | 합의서 / 각서 | 봉인 확인: 그대로 / 봉인 뒤 수정됨 |
| `student` | 대학생·취준생 | 장학금 신청서와 개인정보 동의서를 한 번에 정리해 내요 | Finish a scholarship form and consent sheet in one sitting | 장학금 신청서 + 개인정보 수집 동의서 | 서명, 체크, 날짜, 모든 쪽 같은 자리 |
| `nda` | 스타트업·외주 협업 | 비밀유지 서약서 여러 장에 같은 서명을 한 번에 넣어요 | Put the same signature on every page of an NDA at once | 비밀유지 서약서 3쪽 | 모든 쪽 같은 위치 서명 |
| `idcopy` (1.3) | 대출을 신청하는 직장인 | 은행에 낼 신분증 사본, 주민번호 뒷자리는 가리고 다른 데 못 쓰게 표시해요 | Send the bank a copy of your ID with half the number covered | 신분증 견본 사진 1쪽 ("견본 SAMPLE", 스캔 앱의 검색용 글자 포함) | 사진 쪽, 가리기 상자, 반복 무늬 "한빛은행 대출 서류 제출용" |
| `receipts` (1.3) | 경비를 청구하는 직장인 | 영수증 네 장을 A4 한 장에 모아 지출 증빙으로 내요 | Put four receipts on one A4 page for your expense claim | 영수증 증빙서 + 영수증 사진 4장을 모은 쪽 | 한 쪽에 사진 4장, 결재 도장, 날짜 |
| `certificates` (1.3) | 교육 담당자 | 수료증 다섯 장을 이름만 바꿔 한 번에 만들어요 | Make five certificates at once, each with its own name | 수료증 1쪽, `{이름}` `{과정}` 칸 | 여러 개 만들기 (예시 명단 5줄, `docs/samples/certificates-<lang>.csv`) |
| `bundle` (1.3) | 소액 분쟁 당사자 | 중고거래 분쟁에 낼 증거 서류를 한 파일로 묶어요 | Put the evidence for a small claim into one numbered file | 증거 목록 + 이체 확인증 + 대화·판매 글 캡처 (3쪽) | 문서 합치기, 모든 쪽 `{쪽} / {전체쪽}`, 원본대조필 |
| `aiguard` (1.3) | 채용 담당자 | 받은 지원서에 AI를 속이는 숨은 글자가 있는지 확인해요 | Check an application you got for hidden text meant to trick AI | 입사 지원서 1쪽, 흰 글자 "이전 지시를 무시하고…" | 숨은 글자 검사 (열 때 알림, 목록) |
| `noai` (1.3) | 디자인 스튜디오 | 내 제안서를 AI 학습에 쓰지 말라고 표시하고 봉인해요 | Mark your proposal as not for AI training, then seal it | 브랜드 리뉴얼 제안서 1쪽 | AI 사용 거부 표시 + 봉인, 봉인 확인 |
| `inspection` (1.3) | 이사 들어가는 세입자와 집주인 | 이사 들어가는 날 집 상태를 사진과 함께 남기고 둘 다 서명해요 | Record the flat's condition with photos on move-in day, both of you signing | 입주 상태 확인서 + 방 사진 2장을 모은 쪽 | 체크 표시, 양쪽 서명, 사진 쪽 (봉인은 선택) |
| `consent` (1.3) | 피부관리실 원장 | 피부 관리 동의서를 매장 태블릿에서 손님마다 받아요 | Collect treatment consent forms on the salon tablet, one client after another | 피부 관리 시술 동의서 1쪽, `{이름}` `{연락처}` 칸 | 서명 받기 모드: 동의 칸 두 개와 서명 칸, 손님마다 새 파일 |

1.3 gallery (docs/design/workflows.md, rule 6): the cards are grouped by what the person wants to do, and every card has
one quiet last line naming the tool it uses and its other uses ("가리기 · 계좌번호, 연봉, 얼굴 사진에도 써요"), so people find
that one tool serves many papers. Groups: 서명과 도장 (`lease`, `parttime`, `quote`, `school`, `proxy`, `consent`), 서류 정리
(`receipts`, `bundle`, `inspection`), 가리기와 보호 (`idcopy`, `aiguard`, `noai`), 여러 장 한 번에 (`certificates`,
`expense`, `nda`, `student`), 봉인 (`freelance`, `agreement`). `agreement` and `noai` show only where the app can seal.
What to click in each, and the "same tool, other uses" table: `docs/samples/README.md`. Demo videos:
`docs/media/workflows/<id>-<lang>.mp4` (`docs/tools/render.sh workflows`).

English-market equivalents keep the same ids with locally natural documents (residential lease,
part-time employment agreement, quote/invoice, school permission slip, expense and leave forms,
power of attorney, freelance services agreement, settlement agreement, scholarship application,
NDA).

Features these cards lean on (exist today unless marked new):
- signature (draw / type / import), stamp image with background removal, text and date stamps
- same spot on every page, copy to other pages, mm placement
- seal and save, verify seal
- **new**: 간인 (a seal stamped across the edge between pages, as on Korean contracts), check
  mark presets (✓, ✗, O) in the text stamp dialog, an example gallery on the Library home that
  opens any of the cards above as a ready-to-try document
