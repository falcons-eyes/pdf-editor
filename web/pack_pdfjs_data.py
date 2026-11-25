"""Pack pdf.js CMaps and standard fonts into JSON for the artifact.

The artifact host serves only web file types, so the binary .bcmap / .pfb
files pdf.js loads on demand are shipped as base64 inside two JSON files.
The page reads them through its own CMapReaderFactory / StandardFontDataFactory.

    python3 web/pack_pdfjs_data.py <path to an extracted pdfjs-dist 3.11.174 package>

Only Korean CMaps are kept (Adobe-Korea1, KSC*, UniKS*); add prefixes to
CMAP_PREFIXES if other CJK documents must render without embedded fonts.
"""

import base64
import json
import pathlib
import sys

CMAP_PREFIXES = ("Adobe-Korea1-", "KSC", "UniKS-")
OUT = pathlib.Path(__file__).resolve().parent / "vendor" / "pdfjs"


def pack(files):
    return {f.name: base64.b64encode(f.read_bytes()).decode("ascii") for f in sorted(files)}


def main(pkg: pathlib.Path):
    cmaps = [f for f in (pkg / "cmaps").glob("*.bcmap") if f.name.startswith(CMAP_PREFIXES)]
    cmap_data = {k.removesuffix(".bcmap"): v for k, v in pack(cmaps).items()}
    fonts = [f for f in (pkg / "standard_fonts").iterdir() if f.suffix in (".pfb", ".ttf")]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "cmaps-ko.json").write_text(json.dumps(cmap_data, separators=(",", ":")))
    (OUT / "standard-fonts.json").write_text(json.dumps(pack(fonts), separators=(",", ":")))
    licenses = {
        "LICENSE": "LICENSE.txt",  # pdf.js (Apache-2.0)
        "cmaps/LICENSE": "LICENSE_CMAPS.txt",  # Adobe CMaps (BSD-3-Clause)
        "standard_fonts/LICENSE_FOXIT": "LICENSE_FOXIT.txt",
        "standard_fonts/LICENSE_LIBERATION": "LICENSE_LIBERATION.txt",
    }
    for name, out in licenses.items():
        src = pkg / name
        if src.exists():
            (OUT / out).write_text(src.read_text())
    print(f"{len(cmap_data)} CMaps, {len(fonts)} fonts -> {OUT}")


if __name__ == "__main__":
    main(pathlib.Path(sys.argv[1]))
