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
