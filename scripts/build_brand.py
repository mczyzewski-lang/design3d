#!/usr/bin/env python3
"""Generuje logo design3d i linii „design3d schody” / „design3d ogrodzenia” (SVG, napisy zamienione na krzywe z fontu Inter).
Użycie: PYTHONPATH=<fonttools> python3 scripts/build_brand.py  → configurator/public/brand/*.svg
Font: Inter / Inter Display (SIL Open Font License) — /usr/share/fonts/opentype/inter."""
import math, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = 'configurator/public/brand'
FONT_DIR = '/usr/share/fonts/opentype/inter'
INK, OAK, OAK_LIGHT, MUTED, PAPER = '#141311', '#8a5a2b', '#c89f6d', '#77726a', '#f7f5f1'
# linia „ogrodzenia”: ten sam układ, akcent szałwiowy (zieleń ogrodu) zamiast dębu na znaku
SAGE, SAGE_LIGHT = '#4f7a5a', '#a9c3a0'
os.makedirs(OUT, exist_ok=True)

# ---------- znaki (64×64) ----------
def iso(x, y, z, s, cx, cy):
    return (cx + (x - z) * 0.866 * s, cy + (x + z) * 0.5 * s - y * s)

def poly(pts, fill):
    return f'<path d="M{" L".join(f"{x:.2f} {y:.2f}" for x, y in pts)} Z" fill="{fill}"/>'

def cube_mark():
    s = 21
    P = lambda x, y, z: iso(x, y, z, s, 0, 0)
    # sześcian 1×1×1: x,z ∈ [-.5,.5], y ∈ [0,1]; wycentrowany po obrysie
    a, b = -0.5, 0.5
    top = [P(a, 1, a), P(b, 1, a), P(b, 1, b), P(a, 1, b)]
    right = [P(b, 1, a), P(b, 0, a), P(b, 0, b), P(b, 1, b)]   # ściana +x
    left = [P(a, 1, b), P(b, 1, b), P(b, 0, b), P(a, 0, b)]    # ściana +z
    pts = top + right + left
    dx = 32 - (min(p[0] for p in pts) + max(p[0] for p in pts)) / 2
    dy = 32 - (min(p[1] for p in pts) + max(p[1] for p in pts)) / 2
    mv = lambda f: [(x + dx, y + dy) for x, y in f]
    return [poly(mv(left), '#ffffff'), poly(mv(right), '#d9d3c9'), poly(mv(top), OAK_LIGHT)]

def stairs_mark():
    # 3 stopnie wznoszące się w głąb (w stronę −x), szerokość biegu W wzdłuż z
    s, W = 9.4, 1.55
    faces = []
    n = 3
    def P(x, y, z): return iso(x, y, z, s, 0, 0)
    side = [(0, 0)]
    for i in range(n):
        side += [(-i, i + 1), (-(i + 1), i + 1)]
    side += [(-n, 0)]
    pts_all = []
    for i in range(n):
        x0, x1, h = -(i + 1), -i, i + 1
        faces.append(('riser', [P(x1, h - 1 if i else 0, 0), P(x1, h, 0), P(x1, h, W), P(x1, h - 1 if i else 0, W)]))
        faces.append(('tread', [P(x0, h, 0), P(x1, h, 0), P(x1, h, W), P(x0, h, W)]))
    faces.append(('side', [P(x, y, W) for x, y in side]))
    for _, f in faces: pts_all += f
    minx = min(p[0] for p in pts_all); maxx = max(p[0] for p in pts_all)
    miny = min(p[1] for p in pts_all); maxy = max(p[1] for p in pts_all)
    dx = 32 - (minx + maxx) / 2; dy = 32 - (miny + maxy) / 2
    col = {'riser': '#ffffff', 'tread': OAK_LIGHT, 'side': '#d9d3c9'}
    order = ['side'] + [k for k in ('riser', 'tread')]
    out = []
    # kolejność: bok, potem stopnie od najwyższego (z tyłu) do najniższego
    out.append(poly([(x + dx, y + dy) for x, y in faces[-1][1]], col['side']))
    for i in reversed(range(n)):
        for kind, f in faces[2 * i: 2 * i + 2]:
            out.append(poly([(x + dx, y + dy) for x, y in f], col[kind]))
    return out

def fence_mark():
    # odcinek ogrodzenia sztachetowego: 2 słupki, 2 rygle, 4 sztachety ze skośnymi główkami; izometria jak w schodach
    s = 8.6
    def P(x, y, z): return iso(x, y, z, s, 0, 0)
    D = 0.42   # grubość elementów (głębokość wzdłuż z)
    items = []  # (głębokość do sortowania, kolor, ściany)
    def box(x0, x1, y0, y1, z0, z1, top_col, front_col, side_col, peak=0.0):
        front = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P((x0 + x1) / 2, y1 + peak, z1), P(x0, y1, z1)] if peak else [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]
        side = [P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0)]
        if peak:
            top = [P(x0, y1, z0), P((x0 + x1) / 2, y1 + peak, z0), P((x0 + x1) / 2, y1 + peak, z1), P(x0, y1, z1)]
            top2 = [P((x0 + x1) / 2, y1 + peak, z0), P(x1, y1, z0), P(x1, y1, z1), P((x0 + x1) / 2, y1 + peak, z1)]
            return [(top_col, top), ('#86a67e', top2), (side_col, side), (front_col, front)]
        top = [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)]
        return [(side_col, side), (top_col, top), (front_col, front)]
    W, H = 4.6, 3.3
    parts = []
    # rygle (za sztachetami)
    for y in (0.75, 2.25):
        parts.append((0, box(0, W, y, y + 0.4, -D, 0, '#d9d3c9', '#bdb5a8', '#a8a097')))
    # słupki
    for x in (0, W - 0.7):
        parts.append((1 + x / 10, box(x, x + 0.7, 0, H + 0.2, -D * 1.3, D * 0.15, SAGE_LIGHT, '#ffffff', '#d9d3c9')))
    # sztachety (przed ryglami)
    n, pw = 3, 0.78; gap = (W - 0.7 * 2 - n * pw) / (n + 1)
    for i in range(n):
        x = 0.7 + gap * (i + 1) + pw * i
        parts.append((1 + x / 10 + 0.001, box(x, x + pw, 0.25, H - 0.35, 0, D, SAGE_LIGHT, '#ffffff', '#d9d3c9', peak=0.42)))
    pts = [pt for _, fs in parts for _, f in fs for pt in f]
    dx = 32 - (min(p[0] for p in pts) + max(p[0] for p in pts)) / 2
    dy = 32 - (min(p[1] for p in pts) + max(p[1] for p in pts)) / 2
    out = []
    for _, fs in sorted(parts, key=lambda t: t[0]):
        for col, f in fs:
            out.append(poly([(x + dx, y + dy) for x, y in f], col))
    return out

def mark_svg(shapes, size=64, bg=INK, rx=14):
    return f'<rect width="64" height="64" rx="{rx}" fill="{bg}"/>' + ''.join(shapes)

# ---------- napisy jako krzywe ----------
_fonts = {}
def font(name):
    if name not in _fonts:
        _fonts[name] = TTFont(f'{FONT_DIR}/{name}.otf')
    return _fonts[name]

def text_path(txt, fontname, size, x, y, tracking=0.0):
    f = font(fontname)
    gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f['head'].unitsPerEm
    hmtx = f['hmtx']; sc = size / upm
    d = []
    cx = x
    for ch in txt:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (sc, 0, 0, -sc, cx, y)))
        d.append(pen.getCommands())
        cx += hmtx[g][0] * sc + tracking * size
    return ' '.join(d), cx - tracking * size

def wordmark(x, baseline, size, dark=False, sub=None):
    ink = '#ffffff' if dark else INK
    oak = OAK_LIGHT if dark else OAK
    muted = '#bdb5a8' if dark else MUTED
    d1, x1 = text_path('design', 'InterDisplay-SemiBold', size, x, baseline, -0.02)
    d2, x2 = text_path('3d', 'InterDisplay-Bold', size, x1 + size * 0.01, baseline, -0.02)
    parts = [f'<path d="{d1}" fill="{ink}"/>', f'<path d="{d2}" fill="{oak}"/>']
    end = x2
    if sub:
        gap = size * 0.42
        bar_x = x2 + gap
        parts.append(f'<rect x="{bar_x:.2f}" y="{baseline - size * 0.72:.2f}" width="{size * 0.055:.2f}" height="{size * 0.86:.2f}" rx="{size * 0.03:.2f}" fill="{muted}" opacity="0.6"/>')
        d3, x3 = text_path(sub, 'InterDisplay-Medium', size, bar_x + gap, baseline, -0.01)
        parts.append(f'<path d="{d3}" fill="{muted if not dark else "#e8e2d8"}"/>')
        end = x3
    return ''.join(parts), end

def logo(mark_shapes, name, sub=None, dark=False):
    H, size = 64, 34
    word, end = wordmark(64 + 16, 44, size, dark, sub)
    W = math.ceil(end + 2)
    # na ciemnym tle znak zostaje ciemny, z delikatnym jasnym obrysem
    outline = '<rect x="0.75" y="0.75" width="62.5" height="62.5" rx="13.3" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="1.5"/>' if dark else ''
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="design3d{" " + sub if sub else ""}">'
           f'{mark_svg(mark_shapes)}{outline}{word}</svg>')
    open(f'{OUT}/{name}.svg', 'w').write(svg)
    return W

def mark_file(shapes, name, rx=14):
    open(f'{OUT}/{name}.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">{mark_svg(shapes, rx=rx)}</svg>')

cube, stairs = cube_mark(), stairs_mark()
mark_file(cube, 'design3d-mark')
mark_file(stairs, 'schody-mark')
w1 = logo(cube, 'design3d-logo')
w2 = logo(stairs, 'design3d-schody-logo', sub='schody')
w3 = logo(cube, 'design3d-logo-inverse', dark=True)
w4 = logo(stairs, 'design3d-schody-logo-inverse', sub='schody', dark=True)
# sam napis (bez znaku) do wąskich miejsc
word, end = wordmark(0, 44, 34, False, 'schody')
open(f'{OUT}/design3d-schody-wordmark.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {math.ceil(end + 2)} 64" width="{math.ceil(end + 2)}" height="64">{word}</svg>')
fence = fence_mark()
mark_file(fence, 'ogrodzenia-mark')
w5 = logo(fence, 'design3d-ogrodzenia-logo', sub='ogrodzenia')
w6 = logo(fence, 'design3d-ogrodzenia-logo-inverse', sub='ogrodzenia', dark=True)
print('OK', w1, w2, w3, w4, w5, w6)
