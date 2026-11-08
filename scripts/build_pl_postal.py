#!/usr/bin/env python3
"""Buduje src/studio/geo/pl-postal.tsv.gz z eksportu GeoNames (PL.zip z repozytorium
zauberware/postal-codes-json-xml-csv, plik data/PL.zip; dane © GeoNames, CC BY 4.0).

Użycie: python3 scripts/build_pl_postal.py ścieżka/do/PL.zip
Format wyjścia (TSV, gzip): kod_bez_myślnika  szer.  dł.  miejscowość — jeden wiersz na kod
(współrzędne uśrednione, miejscowość najczęstsza w obrębie kodu)."""
import collections, csv, gzip, io, sys, zipfile

src = sys.argv[1]
rows = list(csv.DictReader(io.TextIOWrapper(zipfile.ZipFile(src).open('zipcodes.pl.csv'), 'utf-8')))
by = collections.defaultdict(list)
for r in rows:
    code = r['zipcode'].replace('-', '')
    if len(code) == 5 and code.isdigit() and r['latitude'] and r['longitude']:
        by[code].append(r)
import math
def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))

pts = {}
for code, v in by.items():
    lat = sum(float(x['latitude']) for x in v) / len(v)
    lon = sum(float(x['longitude']) for x in v) / len(v)
    place = collections.Counter(x['place'] for x in v).most_common(1)[0][0]
    pts[code] = (lat, lon, place)
# błędy źródła: kod daleko od mediany swojej grupy XX-X (> 3× typowy rozrzut, min. 15 km; grupy ≥ 5 kodów) — pomijamy,
# w aplikacji zastąpi go najbliższy numerycznie kod z tej samej grupy
groups = collections.defaultdict(list)
for code, p in pts.items(): groups[code[:3]].append((code, p))
drop = set()
for g, lst in groups.items():
    if len(lst) < 5: continue
    la = sorted(p[0] for _, p in lst); lo = sorted(p[1] for _, p in lst)
    med = (la[len(la) // 2], lo[len(lo) // 2])
    dists = sorted(km(med, p[:2]) for _, p in lst)
    limit = max(15.0, 3 * dists[len(dists) // 2])  # miasto: mały rozrzut → ostry próg; wieś: łagodniejszy
    drop |= {c for c, p in lst if km(med, p[:2]) > limit}
out = io.StringIO()
for code in sorted(pts):
    if code in drop: continue
    lat, lon, place = pts[code]
    out.write(f"{code}\t{lat:.4f}\t{lon:.4f}\t{place}\n")
dst = 'src/studio/geo/pl-postal.tsv.gz'
with gzip.open(dst, 'wt', encoding='utf-8', compresslevel=9) as f:
    f.write(out.getvalue())
print(f'{len(pts) - len(drop)} kodów (pominięto {len(drop)} odstających) → {dst}')
