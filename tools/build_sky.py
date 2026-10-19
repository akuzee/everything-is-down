#!/usr/bin/env python3
"""Build the inline star catalogue and constellation figures for ar/index.html.

Stars: the Hipparcos main catalogue (ESA 1997, CDS I/239), every star with
V <= 6.0 plus any fainter star a constellation figure needs. Positions are ICRS
at epoch J1991.25; proper motion is applied to 2026.0 (the app precesses to the
current date at run time). Quantized to 0.005 deg, sorted by RA, delta-coded
and written as base-41 varints in the coastline alphabet:

    per star:  dRA (0.005 deg units)  Dec+90 (0.005 deg units)  magIdx*8 + colour
    magIdx = round((V + 1.5) * 10), colour = B-V class 0..7 (blue .. red)

Figures: Stellarium's "modern" sky culture (CC BY-SA 4.0), whose lines are
chains of HIP ids. Each becomes a chain of indices into the star list:

    CONST_DATA = 'Name!chain~chain#Name!chain...'     ('!' and '#' lie outside the alphabet)

Sources:
  https://cdsarc.cds.unistra.fr/ftp/I/239/hip_main.dat
  https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/modern/index.json

Usage: python3 build_sky.py <hip_main.dat> <stellarium modern index.json> <outdir>
Writes: <outdir>/sky_encoded.txt, <outdir>/sky_reference.json
"""
import json, math, os, sys

MAG_LIMIT = 6.0
EPOCH_TO = 2026.0
HIP_EPOCH = 1991.25
Q = 0.005                      # degrees per unit

CHARSET = ''.join(chr(c) for c in range(40, 127) if c not in (60, 62, 92, 96))
assert len(CHARSET) == 83
SEP = CHARSET[82]
assert SEP == '~'
BV_EDGES = [-0.1, 0.1, 0.35, 0.6, 0.85, 1.2, 1.6]     # class boundaries, blue -> red


def encode_uint(v, out):
    digits = []
    while True:
        digits.append(v % 41)
        v //= 41
        if v == 0:
            break
    digits.reverse()
    for d in digits[:-1]:
        out.append(CHARSET[41 + d])
    out.append(CHARSET[digits[-1]])


def decode_uints(s):
    """Reference decoder for sequences of non-negative varints split by SEP."""
    seqs, cur, acc = [], [], 0
    for ch in s:
        c = CHARSET.index(ch)
        if c == 82:
            seqs.append(cur); cur = []
        elif c >= 41:
            acc = acc * 41 + (c - 41)
        else:
            cur.append(acc * 41 + c); acc = 0
    seqs.append(cur)
    return seqs


def colour_class(bv):
    if bv is None:
        return 2
    for i, e in enumerate(BV_EDGES):
        if bv < e:
            return i
    return len(BV_EDGES)


def read_hipparcos(path):
    stars = {}
    for line in open(path, encoding='latin-1'):
        f = line.split('|')
        try:
            hip = int(f[1]); v = float(f[5]); ra = float(f[8]); de = float(f[9])
        except ValueError:
            continue            # no astrometric solution
        try:
            pm_ra, pm_de = float(f[12]), float(f[13])
        except ValueError:
            pm_ra = pm_de = 0.0
        try:
            bv = float(f[37])
        except ValueError:
            bv = None
        dt = EPOCH_TO - HIP_EPOCH
        de2 = de + pm_de / 3.6e6 * dt
        ra2 = ra + pm_ra / 3.6e6 * dt / max(math.cos(math.radians(de)), 1e-6)
        stars[hip] = (ra2 % 360.0, max(-90.0, min(90.0, de2)), v, bv)
    return stars


def main():
    hip_path, sky_path, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
    hip = read_hipparcos(hip_path)
    sky = json.load(open(sky_path))

    figures = []
    needed = set()
    for c in sky['constellations']:
        name = (c.get('common_name') or {}).get('native') or (c.get('common_name') or {}).get('english')
        chains = [list(ch) for ch in c['lines'] if len(ch) >= 2]
        for ch in chains:
            needed.update(ch)
        figures.append((name, chains))
    missing = [h for h in needed if h not in hip]
    assert not missing, 'figure stars missing from Hipparcos: %r' % missing

    chosen = [(h,) + hip[h] for h in hip if hip[h][2] <= MAG_LIMIT or h in needed]

    quant = []
    for h, ra, de, v, bv in chosen:
        ra_u = int(round(ra / Q)) % int(round(360 / Q))
        de_u = int(round((de + 90) / Q))
        mag_i = max(0, min(85, int(round((v + 1.5) * 10))))
        quant.append((ra_u, de_u, mag_i * 8 + colour_class(bv), h))
    quant.sort()

    index_of = {h: i for i, (_, _, _, h) in enumerate(quant)}
    out = []
    prev = 0
    for ra_u, de_u, mc, _ in quant:
        encode_uint(ra_u - prev, out); prev = ra_u
        encode_uint(de_u, out)
        encode_uint(mc, out)
    star_data = ''.join(out)

    parts = []
    for name, chains in figures:
        assert not set(name) & set('!#\'\\') and name.strip() == name, name
        enc = []
        for k, ch in enumerate(chains):
            if k:
                enc.append(SEP)
            for h in ch:
                encode_uint(index_of[h], enc)
        parts.append(name + '!' + ''.join(enc))
    const_data = '#'.join(parts)

    # round-trip
    flat = decode_uints(star_data)
    assert len(flat) == 1 and len(flat[0]) == 3 * len(quant)
    acc = 0
    for i, (ra_u, de_u, mc, _) in enumerate(quant):
        acc += flat[0][3 * i]
        assert (acc, flat[0][3 * i + 1], flat[0][3 * i + 2]) == (ra_u, de_u, mc)
    ref_figs = []
    for part, (name, chains) in zip(const_data.split('#'), figures):
        n, enc = part.split('!', 1)
        assert n == name
        dec = decode_uints(enc)
        assert dec == [[index_of[h] for h in ch] for ch in chains]
        ref_figs.append({'n': name, 'c': dec})

    assert all(ch in CHARSET for ch in star_data)
    for part in const_data.split('#'):
        assert all(ch in CHARSET for ch in part.split('!', 1)[1])

    nfaint = sum(1 for q in quant if hip[q[3]][2] > MAG_LIMIT)
    print('stars encoded      : %d (%d fainter than %.1f, kept for figures)' % (len(quant), nfaint, MAG_LIMIT))
    print('figures            : %d constellations, %d chains, %d segments' %
          (len(figures), sum(len(c) for _, c in figures), sum(len(ch) - 1 for _, c in figures for ch in c)))
    print('STAR_DATA size     : %d chars' % len(star_data))
    print('CONST_DATA size    : %d chars' % len(const_data))

    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, 'sky_encoded.txt'), 'w') as f:
        f.write(star_data + '\n' + const_data + '\n')
    with open(os.path.join(outdir, 'sky_reference.json'), 'w') as f:
        json.dump({'q': Q, 'stars': [[a, b, c] for a, b, c, _ in quant], 'figures': ref_figs}, f)


if __name__ == '__main__':
    main()
