#!/usr/bin/env python3
"""Independent check of a sealed PDF with pyHanko (optional; not part of `npm test` or CI).

Setup (outside the repo):

    python3 -m venv /tmp/pyhanko-venv
    /tmp/pyhanko-venv/bin/pip install pyhanko pyhanko-certvalidator

Run (the smoke test leaves test/out/sealed-<platform>.pdf and sealed-<platform>-cert.pem):

    /tmp/pyhanko-venv/bin/python desktop/test/validate_pyhanko.py \
        desktop/test/out/sealed-darwin.pdf --trust desktop/test/out/sealed-darwin-cert.pem

For each signature it prints pyHanko's verdict (integrity, validity, trust with the given root,
coverage, DocMDP level, modification level) and the PAdES baseline level read from the
signature itself (B-B: ETSI.CAdES.detached + signing-certificate(-v2), no signing-time attribute;
B-T: plus a signature timestamp; B-LT: plus a DSS; B-LTA: plus a document timestamp).
Revocation is not checked (self-signed seals have none). Exit status 0 when every signature is
intact and valid, and trusted when --trust is given.
"""
import argparse
import json
import sys

from pyhanko.keys import load_cert_from_pemder
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko_certvalidator import ValidationContext

SIGNING_TIME = "signing_time"
SIGNING_CERT = ("signing_certificate", "signing_certificate_v2")


def pades_level(reader, emb):
    sig = emb.sig_object
    if str(sig.get("/SubFilter")) != "/ETSI.CAdES.detached":
        return "not PAdES (SubFilter %s)" % sig.get("/SubFilter")
    attrs = {a["type"].native for a in emb.signer_info["signed_attrs"]}
    if SIGNING_TIME in attrs:
        return "not baseline (signing-time attribute present)"
    if not attrs.intersection(SIGNING_CERT):
        return "not baseline (no signing-certificate attribute)"
    unsigned = emb.signer_info["unsigned_attrs"]
    has_ts = unsigned.native is not None and any(
        a["type"].native == "signature_time_stamp_token" for a in unsigned
    )
    level = "B-T" if has_ts else "B-B"
    if "/DSS" in reader.root:
        level = "B-LT" if has_ts else "B-B + DSS"
    if any(s.sig_object.get("/Type") == "/DocTimeStamp" for s in reader.embedded_signatures):
        level = "B-LTA"
    return level


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("pdf")
    ap.add_argument("--trust", help="PEM/DER certificate to use as the trust root")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()

    roots = [load_cert_from_pemder(args.trust)] if args.trust else []
    ok = True
    out = []
    with open(args.pdf, "rb") as f:
        reader = PdfFileReader(f)
        sigs = reader.embedded_signatures
        if not sigs:
            print("no signatures")
            return 1
        for emb in sigs:
            vc = ValidationContext(trust_roots=roots, allow_fetching=False, revocation_mode="soft-fail")
            st = validate_pdf_signature(emb, vc)
            mod = st.modification_level
            r = {
                "field": emb.field_name,
                "signer": st.signing_cert.subject.human_friendly,
                "intact": st.intact,
                "valid": st.valid,
                "trusted": st.trusted,
                "coverage": st.coverage.name if st.coverage else None,
                "docmdp_level": emb.docmdp_level.name if emb.docmdp_level else None,
                "docmdp_ok": st.docmdp_ok,
                "modification_level": mod.name if mod else None,
                "pades": pades_level(reader, emb),
                "md_algorithm": st.md_algorithm,
                "bottom_line": st.bottom_line,
            }
            out.append(r)
            ok = ok and st.intact and st.valid and (st.trusted or not roots)
            if not args.json:
                print(st.pretty_print_details())
                print("PAdES level: %s" % r["pades"])
                print("-" * 60)
    if args.json:
        json.dump(out, sys.stdout, indent=2, default=str)
        print()
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
