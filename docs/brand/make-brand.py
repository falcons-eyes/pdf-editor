"""Writes the Sealworks master artwork (docs/brand/*.svg and site/assets/logo-mark.svg).

The SVGs are the source of truth; this script only exists so the geometry (the wax-seal outline, the
bite the seal takes out of the page, the outlined wordmark) can be rebuilt exactly. Edit the numbers
here, run it, then run the raster generators (see docs/brand/README.md).

    python3 docs/brand/make-brand.py      (needs fontTools: pip install fonttools;
                                            the wordmark font comes from desktop/node_modules/@fontsource)
"""
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BRAND = os.path.join(ROOT, "docs", "brand")

INK_TOP, INK_BOTTOM = "#3d60e6", "#1a31a0"   # tile gradient (ink blue #2446c7 sits in the middle)
INK = "#2446c7"
SEAL_TOP, SEAL_BOTTOM = "#e2463b", "#b2241e"  # wax gradient (seal red #c3302a sits in the middle)
SEAL = "#c3302a"
PRESS_TOP, PRESS_BOTTOM = "#a81d18", "#d43a30"
TEXT = "#141c3d"


def f(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


# ---- the wax seal: a disc with nine soft lobes (a pressed blob of wax), as a smooth cubic path ----
def wax_points(R, n=54):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        r = R * (1 + 0.032 * math.cos(9 * a) + 0.008 * math.sin(4 * a + 0.7))
        pts.append((r * math.cos(a), r * math.sin(a)))
    return pts


def smooth_closed(pts, cx=0, cy=0, k=1.0):
    """Catmull-Rom through the points, as cubic Beziers."""
    P = [(cx + x * k, cy + y * k) for x, y in pts]
    n = len(P)
    d = f"M{f(P[0][0])} {f(P[0][1])}"
    for i in range(n):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % n], P[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}"
    return d + "Z"


WAX = wax_points(100)
WAX_MAX = max(math.hypot(x, y) for x, y in WAX)
# the signature that ends in a check: a pen swash that runs into the tick (seal units, r = 100)
SWASH = "M-59 9C-45-9-31-5-27 5C-23 16-16 23-7 32L54-36"

# ---- icon geometry on the 1024 tile ----
TILE_R = 230
PX0, PY0, PX1, PY1, FOLD, PR = 196, 150, 656, 800, 120, 34   # the page
SCX, SCY, SR = 672, 704, 196                                  # the seal
GAP = 30                                                      # clear band between seal and page


def page_paths(x0=PX0, y0=PY0, x1=PX1, y1=PY1, fold=FOLD, rr=PR):
    body = (f"M{x0+rr} {y0}H{x1-fold}L{x1} {y0+fold}V{y1-rr}a{rr} {rr} 0 0 1-{rr} {rr}H{x0+rr}"
            f"a{rr} {rr} 0 0 1-{rr}-{rr}V{y0+rr}a{rr} {rr} 0 0 1 {rr}-{rr}Z")
    flap = f"M{x1-fold} {y0}V{y0+fold-rr}a{rr} {rr} 0 0 0 {rr} {rr}H{x1}Z"
    return body, flap


PAGE, FLAP = page_paths()
LINES = "M266 300H470M266 390H560M266 480H420"
SEAL_OUTLINE = smooth_closed(WAX, SCX, SCY, SR / 100)
SEAL_CUT = smooth_closed(WAX, SCX, SCY, (SR + GAP) / 100)


def seal_group(cx, cy, r, pressed=True, sw=18, flat=False):
    k = r / 100
    body = smooth_closed(WAX, 0, 0, 1)
    fill = SEAL if flat else "url(#sw-seal)"
    out = f'<g transform="translate({f(cx)} {f(cy)}) scale({k:.4f})"><path d="{body}" fill="{fill}"/>'
    if pressed and not flat:
        out += ('<circle r="76" fill="url(#sw-press)"/>'
                '<circle r="76" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="3"/>')
    elif pressed:
        out += '<circle r="76" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="4"/>'
    out += (f'<path d="{SWASH}" fill="none" stroke="#fff" stroke-width="{sw}" '
            'stroke-linecap="round" stroke-linejoin="round"/></g>')
    return out


GRADS = f'''<linearGradient id="sw-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{INK_TOP}"/><stop offset="1" stop-color="{INK_BOTTOM}"/></linearGradient>
<radialGradient id="sw-glow" cx=".3" cy="0" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="sw-paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#eef1fb"/></linearGradient>
<linearGradient id="sw-seal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{SEAL_TOP}"/><stop offset="1" stop-color="{SEAL_BOTTOM}"/></linearGradient>
<linearGradient id="sw-press" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{PRESS_TOP}"/><stop offset="1" stop-color="{PRESS_BOTTOM}"/></linearGradient>
<filter id="sw-shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="18"/><feOffset dy="14"/><feComponentTransfer><feFuncA type="linear" slope=".28"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<mask id="sw-bite" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/><path d="{SEAL_CUT}" fill="#000"/></mask>'''


def icon_svg(small=False):
    """The app icon, full bleed on a 1024 tile. small=True: the 16-32 px cut (no text lines, no shadows,
    no pressed ring, a bolder tick and a bigger seal)."""
    if small:
        cx, cy, r, gap = 668, 700, 232, 34
        page, flap = page_paths(176, 128, 636, 812, 150, 40)
        cut = smooth_closed(WAX, cx, cy, (r + gap) / 100)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">\n<title>Sealworks</title>\n<defs>\n{GRADS}\n'
                f'<mask id="sw-bite-s" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/><path d="{cut}" fill="#000"/></mask>\n</defs>\n'
                f'<rect width="1024" height="1024" rx="{TILE_R}" fill="url(#sw-tile)"/>\n'
                f'<g mask="url(#sw-bite-s)"><path d="{page}" fill="#fff"/><path d="{flap}" fill="#c3cdf1"/></g>\n'
                f'{seal_group(cx, cy, r, pressed=False, sw=24)}\n</svg>\n')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">\n<title>Sealworks</title>\n<defs>\n{GRADS}\n</defs>\n'
            f'<rect width="1024" height="1024" rx="{TILE_R}" fill="url(#sw-tile)"/>\n'
            f'<rect width="1024" height="1024" rx="{TILE_R}" fill="url(#sw-glow)"/>\n'
            f'<g filter="url(#sw-shadow)"><g mask="url(#sw-bite)"><path d="{PAGE}" fill="url(#sw-paper)"/><path d="{FLAP}" fill="#c3cdf1"/>\n'
            f'<path d="{LINES}" stroke="#d4dbf3" stroke-width="40" stroke-linecap="round"/></g></g>\n'
            f'<g filter="url(#sw-shadow)">{seal_group(SCX, SCY, SR)}</g>\n</svg>\n')


# the bare symbol (page + seal, no tile): page in currentColor (ink blue by default), seal in seal red
MX0, MY0 = PX0 - 4, PY0 - 4
MX1 = math.ceil(SCX + SR / 100 * WAX_MAX) + 4
MY1 = math.ceil(SCY + SR / 100 * WAX_MAX) + 4
MARK_VB = f"{MX0} {MY0} {MX1-MX0} {MY1-MY0}"


def mark_svg():
    # the folded corner: the page body is drawn without it, the flap sits beside it at lower opacity
    body = (f"M{PX0+PR} {PY0}H{PX1-FOLD-18}V{PY0+FOLD-PR+18}a{PR} {PR} 0 0 0 {PR} {PR}H{PX1}V{PY1-PR}"
            f"a{PR} {PR} 0 0 1-{PR} {PR}H{PX0+PR}a{PR} {PR} 0 0 1-{PR}-{PR}V{PY0+PR}a{PR} {PR} 0 0 1 {PR}-{PR}Z")
    flap = f"M{PX1-FOLD} {PY0}L{PX1} {PY0+FOLD}H{PX1-FOLD+PR}a{PR} {PR} 0 0 1-{PR}-{PR}Z"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{MARK_VB}" color="{INK}">\n<title>Sealworks</title>\n'
            f'<defs><mask id="sw-mark-bite" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/>'
            f'<path d="{SEAL_CUT}" fill="#000"/><path d="{LINES}" stroke="#000" stroke-width="40" stroke-linecap="round"/></mask></defs>\n'
            f'<g mask="url(#sw-mark-bite)" fill="currentColor"><path d="{body}"/><path d="{flap}" fill-opacity=".45"/></g>\n'
            f'{seal_group(SCX, SCY, SR, pressed=True, flat=True)}\n</svg>\n')


def mono_svg():
    """One colour (currentColor): the page with its lines and the seal's tick knocked out. For stamps,
    embossing, Android's themed icon and anywhere only one ink is available."""
    k = SR / 100
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{MARK_VB}">\n<title>Sealworks</title>\n'
            f'<defs><mask id="sw-mono" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/>'
            f'<path d="{SEAL_CUT}" fill="#000"/><path d="{LINES}" stroke="#000" stroke-width="40" stroke-linecap="round"/></mask>'
            f'<mask id="sw-mono-tick" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/>'
            f'<path transform="translate({SCX} {SCY}) scale({k:.4f})" d="{SWASH}" fill="none" stroke="#000" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/></mask></defs>\n'
            f'<g fill="currentColor"><path mask="url(#sw-mono)" d="{PAGE}"/><path mask="url(#sw-mono-tick)" d="{SEAL_OUTLINE}"/></g>\n</svg>\n')


def seal_svg():
    r = WAX_MAX + 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{f(-r)} {f(-r)} {f(2*r)} {f(2*r)}">\n<title>Sealworks seal</title>\n'
            f'{seal_group(0, 0, 100, pressed=True, flat=True)}\n</svg>\n')


# ---- wordmark: "Sealworks" in IBM Plex Sans SemiBold, outlined ----
def wordmark(text="Sealworks", weight=600, tracking=-12):
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    path = os.path.join(ROOT, "..", "..", "..", "desktop", "node_modules", "@fontsource", "ibm-plex-sans-kr", "files",
                        f"ibm-plex-sans-kr-latin-{weight}-normal.woff")
    for cand in (os.path.join(ROOT, "desktop", "node_modules", "@fontsource", "ibm-plex-sans-kr", "files",
                              f"ibm-plex-sans-kr-latin-{weight}-normal.woff"), path):
        if os.path.exists(cand):
            path = cand
            break
    font = TTFont(path)
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    cap = getattr(font["OS/2"], "sCapHeight", 0) or 0.7 * upm
    x = 0
    ds = []
    for ch in text:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        ds.append(pen.getCommands())
        x += gs[g].width + tracking
    return " ".join(ds), x - tracking, cap, upm


def logo_svg(dark=False):
    d, width, cap, upm = wordmark()
    mw, mh = MX1 - MX0, MY1 - MY0
    H = 200                        # symbol height in the lockup
    ms = H / mh
    ws = (H * 0.5) / cap           # cap height = half the symbol height
    gap = H * 0.30
    wx = mw * ms + gap
    base = H * 0.5 + cap * ws / 2  # caps centred on the symbol
    W = wx + width * ws
    page = "#ffffff" if dark else INK
    text = "#ffffff" if dark else TEXT
    body = (f"M{PX0+PR} {PY0}H{PX1-FOLD-18}V{PY0+FOLD-PR+18}a{PR} {PR} 0 0 0 {PR} {PR}H{PX1}V{PY1-PR}"
            f"a{PR} {PR} 0 0 1-{PR} {PR}H{PX0+PR}a{PR} {PR} 0 0 1-{PR}-{PR}V{PY0+PR}a{PR} {PR} 0 0 1 {PR}-{PR}Z")
    flap = f"M{PX1-FOLD} {PY0}L{PX1} {PY0+FOLD}H{PX1-FOLD+PR}a{PR} {PR} 0 0 1-{PR}-{PR}Z"
    uid = "d" if dark else "l"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {math.ceil(W)} {H}">\n<title>Sealworks</title>\n'
            f'<defs><mask id="sw-logo-{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/>'
            f'<path d="{SEAL_CUT}" fill="#000"/><path d="{LINES}" stroke="#000" stroke-width="40" stroke-linecap="round"/></mask></defs>\n'
            f'<g transform="scale({ms:.5f}) translate({-MX0} {-MY0})">'
            f'<g mask="url(#sw-logo-{uid})" fill="{page}"><path d="{body}"/><path d="{flap}" fill-opacity=".45"/></g>'
            f'{seal_group(SCX, SCY, SR, pressed=True, flat=True)}</g>\n'
            f'<path transform="translate({wx:.2f} {base:.2f}) scale({ws:.5f})" fill="{text}" d="{d}"/>\n</svg>\n')


def write(rel, s):
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as fh:
        fh.write(s)
    print("wrote", rel)


def preview():
    """docs/brand/preview.png: the icon at 1024/180/64/32/16 px (16-32 from the small cut) and the
    horizontal logo, on light and dark. Needs rsvg-convert and Pillow."""
    import io
    import subprocess
    from PIL import Image

    def render(name, w=None, h=None):
        args = ["rsvg-convert"] + (["-w", str(w)] if w else []) + (["-h", str(h)] if h else [])
        out = subprocess.run(args + [os.path.join(BRAND, name)], check=True, capture_output=True).stdout
        return Image.open(io.BytesIO(out)).convert("RGBA")

    sizes = [(1024, "sealworks-icon.svg"), (180, "sealworks-icon.svg"), (64, "sealworks-icon.svg"),
             (32, "sealworks-icon-small.svg"), (16, "sealworks-icon-small.svg")]
    pad, gap = 64, 48
    W = pad * 2 + sum(s for s, _ in sizes) + gap * (len(sizes) - 1)
    band = 1024 + pad * 2
    logo_h = 120
    H = (band + logo_h + pad) * 2
    sheet = Image.new("RGBA", (W, H))
    for i, (bg, logo) in enumerate(((("#f5f5f2"), "sealworks-logo-horizontal.svg"), ("#1c1d22", "sealworks-logo-horizontal-dark.svg"))):
        y0 = i * (band + logo_h + pad)
        sheet.paste(Image.new("RGBA", (W, band + logo_h + pad), bg), (0, y0))
        x = pad
        for s, name in sizes:
            sheet.alpha_composite(render(name, s, s), (x, y0 + pad + (1024 - s) // 2 if s < 1024 else y0 + pad))
            x += s + gap
        lg = render(logo, h=logo_h)
        sheet.alpha_composite(lg, (pad, y0 + band))
    sheet.convert("RGB").save(os.path.join(BRAND, "preview.png"), optimize=True)
    print("wrote docs/brand/preview.png")


if __name__ == "__main__":
    import sys
    if "--preview" in sys.argv:
        preview()
        sys.exit()
    write("docs/brand/sealworks-icon.svg", icon_svg())
    write("docs/brand/sealworks-icon-small.svg", icon_svg(small=True))
    write("docs/brand/sealworks-mark.svg", mark_svg())
    write("docs/brand/sealworks-mark-mono.svg", mono_svg())
    write("docs/brand/sealworks-seal.svg", seal_svg())
    write("docs/brand/sealworks-logo-horizontal.svg", logo_svg())
    write("docs/brand/sealworks-logo-horizontal-dark.svg", logo_svg(dark=True))
    write("site/assets/logo-mark.svg", mark_svg())
    write("site/assets/seal-mark.svg", seal_svg())
