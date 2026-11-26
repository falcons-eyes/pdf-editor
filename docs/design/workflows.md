# Sealworks 1.3: from "sign a PDF" to "do the paperwork" (design brief, 2026-11-26)

Sealworks already does one thing well: put things on a PDF exactly where they belong and seal the
result. 1.3 turns that into a small set of **building blocks** that each serve many situations,
rather than one feature per situation. Every block works the same in the desktop app (Mac, Windows)
and the Android app, offline, through the one page `web/pdf-editor.html`.

## Rules carried over (lessons from 1.0 to 1.2)

1. **One page, every platform.** Desktop and Android run the same `web/pdf-editor.html`. A block has
   to work by touch on a phone, by mouse on a Mac, and through the `desktop` object's existing
   calls (`fs`, `dialog`, `seal`). No new native code unless it can't be avoided.
2. **Files go through the write allowlist.** The desktop main process only writes where the
   person picked (`desktop/src/writeguard.js`). A block that writes many files asks for **one
   folder** with `dialog.open({kind: "folder"})` and writes new files inside it. It never overwrites
   anything it didn't create in this run.
3. **Offline, always.** No network, no AI service, no telemetry. The Android app has no internet
   permission, and that stays so.
4. **Say exactly what a feature does, no more.** The seal shows edits, it doesn't prevent them; it
   isn't a legal e-signature. The same honesty applies to everything new (see "AI reading" below):
   a cover box isn't redaction, and nothing can stop a camera or a vision model from reading pixels.
5. **The original is never changed.** Page tools and redaction work on the Library's copy and on
   the saved output, never on the file the person opened.
6. **Examples explain features.** Each block appears in at least one example in the gallery
   (`docs/design/scenarios.md`), with made-up people and data, and in the demo media made by
   `docs/tools/render.sh`.
7. **Store builds are frozen while in review.** 1.2.0 is in Apple and Google review. This work is
   1.3.0. Nothing on the website or README announces it until it ships. The site deploys from
   `main`, so marketing copy waits.

## The building blocks

### 1. Pages: put the documents together (쪽 정리)
Add pages from another PDF or from images (a photo of an ID card, receipts), reorder by drag,
rotate, delete, and save a range as its own file. An image becomes an A4 page, fitted with a margin.
**Several images on one page** ("receipts sheet": 2, 4 or 6 per A4 page) for expense proof.
Placed items follow their page when pages move; deleting a page removes its items (undo brings
both back).
Uses: contract + ID copy in one file, receipts proof sheet, splitting off the signed page, fixing a
sideways scan.

### 2. Stamps that know where they are (도장 프리셋과 변수)
- **Repeated watermark**: one line of text tiled diagonally over the whole page, light and
  semi-transparent. Presets: "제출용: [누구에게], [날짜], 다른 용도 사용 금지" (For [whom] only), "사본 / COPY",
  "대외비 / CONFIDENTIAL".
- **Certified copy stamp (원본대조필)**: a boxed stamp with "원본과 상이 없음", the date and the person.
- **Variables in any text stamp**: `{page}`, `{pages}`, `{date}`, `{name}` and other `{field}`s.
  "Put on every page" fills `{page}` per page, so page numbers and document numbers come free.
Uses: ID and bank-book copies with "for this purpose only", certified copies, numbering an
evidence bundle, "page 2 of 5".

### 3. Cover and remove (가리기)
A cover box drawn over a resident number, an account number or a face. On save, every page that
has a cover box is **rebuilt as an image** with the box burned in. The text, the vector content and
everything under the box are really gone, not just hidden. The rest of the document keeps its
text. The save dialog says which pages became images and why.
Same machinery, whole document: the **text-free copy** (see AI reading).
Uses: an ID copy without the back half of the resident number, a bank statement without balances,
a contract sent to a third party without the price.

### 4. Forms that fill themselves (서식과 여러 개 만들기)
- **Save as form**: the current layout of placed items, with text items that hold `{fields}`, is
  saved as a form (a name, the page size and a fingerprint of the page text, the items). Opening a
  document that matches a form offers to place it.
- **Make many**: a form + a list → one PDF per row. The list is typed or pasted in a small table
  (pasting from a spreadsheet works; the first row names the fields). Output goes into one picked
  folder, named from a pattern like `{name}_수료증.pdf`. Optionally sealed, one by one.
- **Same on many**: a form + several PDFs → each gets the same items in the same places.
Uses: certificates of completion, participation letters, the monthly expense form, approving a
folder of payslips.

### 5. Sign here, next person (서명 받기 모드)
A full-screen, touch-first mode for a shop or clinic tablet, built on a form: it shows the document
and asks for each signature (and check box) in turn, then saves (and seals) to the picked folder,
clears, and waits for the next person. Leaving the mode needs a long press and a confirmation.
Nothing from the previous person stays on screen.
Uses: gym membership terms, salon treatment consent, academy enrolment, part-timer contracts,
move-in condition reports with photos.

### 6. Seal you can trust further (봉인 확장)
- **People I trust (믿는 사람)**: from Verify, save a seal's fingerprint under a name. Later
  verifies show "Sealed by Kim Haneul (trusted)" instead of asking you to compare fingerprints.
- **Seal and stamp log (사용 기록)**: every sealed save is logged locally: when, which file, which
  stamps and signatures were on it, and the output's hash. It can be exported as CSV. A company stamp
  can be marked "log every use" for a 직인 사용 대장.
- **AI reading notice** and **hidden text check**: see below.
- Later (not 1.3): **approval chain** (several seals in a row, each one adding to the file without
  breaking the earlier ones). Today's seal is a DocMDP P=1 certification that forbids any later change. A chain needs
  approval signatures over incremental updates, a change to `desktop/src/pdfsig.js` best made after
  the store reviews settle.

## AI reading: what we do, and what we deliberately don't

The wish behind it: "My document shouldn't be fed to an AI, and if someone does, I want it to fail
or to be provable." Three honest pieces:

1. **Text-free copy (글자 없는 사본).** Save a copy where every page is an image: no text layer, so
   copy-paste, search and the many "chat with your PDF" tools that read the text layer get nothing.
   What it can't stop: a vision model or OCR can read pixels. The dialog says so in one sentence,
   and that screen readers can't read the copy either (send it only where that's fine).
2. **"No AI" notice, bound to the seal (AI 사용 거부 표시).** The saved PDF carries a
   machine-readable reservation in its XMP metadata (W3C TDMRep `tdm:reservation` = 1, plus the
   IPTC/PLUS `DataMining` value "prohibited for AI/ML training") and, if the person wants, a small
   visible line at the foot of each page. When the file is sealed, the seal covers the notice, so
   anyone who strips it breaks the seal. Verify shows "No-AI notice: present, covered by the seal".
   This is a rights reservation, the kind EU text-and-data-mining rules recognise. It is not a
   technical lock, and the copy never pretends otherwise.
3. **Hidden text check (숨은 글자 검사).** Verify, and opening any PDF, look for text a person can't
   see but a machine reads: invisible render mode, white or near-background colour, tiny text, text
   outside the page or under an image. Such text is how "AI traps" get into résumés, contracts and
   reports ("ignore previous instructions…"). Sealworks lists where it is and what it says. A
   sealed file from Sealworks never contains any, and Verify can say so.

**Not doing: hiding instructions for AI inside the PDF** (prompt injection, invisible
"don't summarise this" text). It would attack the recipient's own tools. Screen readers would read
it aloud to blind readers. Mail and security scanners flag it as malicious. And it is exactly what
the hidden text check above warns people about. Adversarial noise against vision models isn't
reliable enough to promise, so we don't.

## Order of work

1. Pages (block 1) and Cover and remove + text-free copy (block 3): both change how the base
   document and the build step work.
2. Seal extensions, AI notice and hidden text check (block 6): mostly Verify, the sealer and one
   hook in the build step. Runs in parallel with step 1.
3. Stamp presets and variables (block 2), then forms and make-many (block 4).
4. Sign here mode (block 5).
5. Examples: new gallery entries and sample data for each block, demo videos, then tests on desktop
   and the Android emulator. Version 1.3.0.
