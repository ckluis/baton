#!/usr/bin/env python3
"""Assemble baton v8 index.html from these parts + generated SVG + inlined anime.js.

Usage: python3 previews/_v8-src/build.py v8.html"""
import math, re, sys, pathlib

HERE = pathlib.Path(__file__).parent
OUT = pathlib.Path(sys.argv[1])
ANIME = (HERE / 'anime.min.js').read_text()

def f(x): return f'{x:.1f}'.rstrip('0').rstrip('.')

def polar(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)

# ---------------------------------------------------------------- hero
def hero_svg():
    W, H = 640, 520
    o = [f'<svg viewBox="0 0 {W} {H}" id="sv-hero" aria-hidden="true">',
         '<defs><radialGradient id="hg-root"><stop offset="0" stop-color="#faff69"/><stop offset="1" stop-color="#faff69" stop-opacity="0"/></radialGradient>',
         '<filter id="hg-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>']
    # left: the workflow
    o.append('<rect x="20" y="20" width="250" height="416" rx="16" fill="#0e0e14" stroke="#25252e"/>')
    o.append('<text x="38" y="48" class="t-mono t-mute2" font-size="10" letter-spacing="1.4">WORKFLOW · csv-import-units</text>')
    groups = [('BUILD', 78, [('build:parser', 'sonnet-5-5', 'ok'), ('build:importer', 'sonnet-5-5', 'ok'), ('build:cli', 'sonnet-5-5', 'ok')]),
              ('VERIFY', 216, [('verify:parser', 'opus-5-5', 'on'), ('verify:importer', 'opus-5-5', 'on')]),
              ('FIX', 316, [('fix:round1', 'sonnet-5-5', 'q')]),
              ('RUN', 372, [('run:bench', 'haiku-5-5', 'q')])]
    chips = []
    for label, y, items in groups:
        o.append(f'<text x="38" y="{y}" class="t-mono t-mute2" font-size="9.5" letter-spacing="1.4">{label}</text>')
        for i, (nm, mdl, st) in enumerate(items):
            cy = y + 10 + i * 36
            col = {'ok': '#4ade80', 'on': '#5eead4', 'q': '#5b5b66'}[st]
            fill = 'none' if st == 'q' else col
            cls = ' class="pulse"' if st == 'on' else ''
            o.append(f'<g class="hchip" data-st="{st}"><rect x="34" y="{cy}" width="222" height="28" rx="8" fill="#17171f" stroke="#26262f"/>'
                     f'<circle cx="49" cy="{cy+14}" r="4" fill="{fill}" stroke="{col}" stroke-width="1.4"{cls}/>'
                     f'<text x="61" y="{cy+18}" font-size="12" class="{"t-ink" if st != "q" else "t-mute"}">{nm}</text>'
                     f'<text x="246" y="{cy+18}" text-anchor="end" font-size="9.5" class="t-mono t-mute2">{mdl}</text></g>')
            chips.append((256, cy + 14, st))
    # right: the memory graph
    cx, cy = 482, 212
    cats = [('user', -112), ('project:shop', -52), ('tech:ts', 8), ('tool:cmux', 68), ('tool:wf', 128)]
    edges, nodes, leaves = [], [], []
    for ci, (nm, ang) in enumerate(cats):
        x, y = polar(cx, cy, 86, ang)
        edges.append(f'<line x1="{f(cx)}" y1="{f(cy)}" x2="{f(x)}" y2="{f(y)}" stroke="#3a3a46" stroke-width="1.3"/>')
        for k, d in enumerate((-15, 0, 15)):
            r = 146 if k != 1 else 138
            lx, ly = polar(cx, cy, r, ang + d)
            lx = min(lx, 626)
            edges.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(lx)}" y2="{f(ly)}" stroke="#2c2c36" stroke-width="1"/>')
            leaves.append((lx, ly, ci, k))
        nodes.append(f'<g class="hcat" data-i="{ci}"><circle cx="{f(x)}" cy="{f(y)}" r="11" fill="#1a1a10" stroke="#faff69" stroke-width="1.6"/>'
                     f'<text x="{f(x)}" y="{f(y+25)}" text-anchor="middle" class="t-mono t-mute" font-size="9.5">{nm}</text></g>')
    # cross links between neighbouring catalogs' outer leaves
    for i in range(len(cats) - 1):
        a = [l for l in leaves if l[2] == i and l[3] == 2][0]
        b = [l for l in leaves if l[2] == i + 1 and l[3] == 0][0]
        edges.append(f'<line x1="{f(a[0])}" y1="{f(a[1])}" x2="{f(b[0])}" y2="{f(b[1])}" stroke="#3a3a46" stroke-width="1" stroke-dasharray="2 4"/>')
    o.append('<g>' + ''.join(edges) + '</g>')
    for lx, ly, ci, k in leaves:
        o.append(f'<circle class="hleaf" data-c="{ci}" cx="{f(lx)}" cy="{f(ly)}" r="4.5" fill="#2a2a35" stroke="#4a4a58"/>')
    o.append(''.join(nodes))
    o.append(f'<circle cx="{cx}" cy="{cy}" r="46" fill="url(#hg-root)" opacity=".35" class="pulse"/>'
             f'<circle cx="{cx}" cy="{cy}" r="21" fill="#faff69"/>'
             f'<text x="{cx}" y="{cy+4}" text-anchor="middle" font-size="10" font-weight="800" fill="#0a0a0a" class="t-mono">root</text>')
    o.append('<text x="330" y="48" class="t-mono t-mute2" font-size="10" letter-spacing="1.4">MEMORY · catalogs → nodes</text>')
    # connectors chip -> root (writes) and root -> chip (reads)
    o.append('<g fill="none">')
    for i, (x, y, st) in enumerate(chips):
        d = f'M{x} {y} C 330 {y}, 380 {cy}, {cx-22} {cy}'
        o.append(f'<path id="hc{i}" d="{d}" stroke="#faff69" stroke-opacity=".16" stroke-width="1.2"/>')
    o.append('</g><g id="hg-particles">')
    for i in range(8):
        o.append(f'<circle r="2.6" fill="{"#faff69" if i % 2 == 0 else "#5eead4"}" cx="-10" cy="-10" filter="url(#hg-blur)" class="hp"/>'
                 f'<circle r="1.6" fill="#fff" cx="-10" cy="-10" class="hp2"/>')
    o.append('</g>')
    # bottom band
    o.append('<g transform="translate(20,452)"><rect width="600" height="48" rx="12" fill="#0e0e13" stroke="#25252e"/>'
             '<text x="16" y="30" class="t-mono" font-size="11.5" fill="#faff69">baton</text>'
             '<text x="66" y="30" class="t-mono t-body" font-size="10.5">◉ <tspan class="t-ink" font-weight="700">csv-import-units</tspan> <tspan id="hb-n">9</tspan>/14 · ETA 38m · $<tspan id="hb-usd">3.84</tspan></text>'
             '<text x="584" y="30" text-anchor="end" class="t-mono" font-size="10.5" fill="#4ade80">✓ opus-5-5 · sonnet-5-5 · haiku-5-5</text></g>')
    o.append('</svg>')
    return '\n'.join(o)

# ---------------------------------------------------------------- memory section
def mem_svg():
    W, H = 640, 540
    cx, cy = 360, 222
    HALO = ' style="paint-order:stroke;stroke:#0d0d12;stroke-width:5px;stroke-linejoin:round"'
    o = [f'<svg viewBox="0 0 {W} {H}" id="sv-mem" aria-hidden="true">',
         '<defs><radialGradient id="mg-root"><stop offset="0" stop-color="#faff69" stop-opacity=".7"/><stop offset="1" stop-color="#faff69" stop-opacity="0"/></radialGradient></defs>']
    cats = [('user', -162, True, 16), ('project:shop', -100, True, 20), ('tech:typescript', -36, True, 16),
            ('tool:cmux', 22, True, 18), ('tech:rust', 92, False, 18), ('project:tinker', 148, False, 18)]
    leafnames = {1: ['session', 'env', 'how-to-test', 'rulings'], 0: ['decision tables', 'PRs → main', 'fan-outs'],
                 2: ['streams', 'tsconfig', 'vitest'], 3: ['screenshot', 'tabs not splits'], 4: ['target dir', 'ENOSPC'], 5: ['PII keys', 'RLS']}
    edges, top, labels = [], [], []
    target = None
    catpos = {}
    for ci, (nm, ang, on, spread) in enumerate(cats):
        x, y = polar(cx, cy, 100, ang)
        catpos[ci] = (x, y)
        op = '' if on else ' opacity=".34"'
        edges.append(f'<line x1="{cx}" y1="{cy}" x2="{f(x)}" y2="{f(y)}" stroke="#3a3a46" stroke-width="1.4"{op}/>')
        names = leafnames[ci]
        n = len(names)
        for k, ln in enumerate(names):
            d = (k - (n - 1) / 2) * spread
            lx, ly = polar(cx, cy, 166, ang + d)
            edges.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(lx)}" y2="{f(ly)}" stroke="#2c2c36" stroke-width="1"{op}/>')
            isT = (ci == 1 and ln == 'how-to-test')
            if isT: target = (lx, ly)
            fill = '#faff69' if isT else '#2a2a35'
            stroke = '#faff69' if isT else '#4a4a58'
            idattr = ' id="mq-leaf"' if isT else ''
            top.append(f'<circle{idattr} class="mleaf" cx="{f(lx)}" cy="{f(ly)}" r="{6 if isT else 4.5}" fill="{fill}" stroke="{stroke}"{op}/>')
            tx, ty = polar(cx, cy, 182, ang + d)
            c = math.cos(math.radians(ang + d))
            anchor = 'start' if c > 0.3 else ('end' if c < -0.3 else 'middle')
            if anchor == 'middle': ty += -4 if ty < cy else 10
            cls = 't-ink' if isT else 't-mute2'
            lid = ' id="mq-leaflabel"' if isT else ''
            labels.append(f'<text{lid} x="{f(tx)}" y="{f(ty+3)}" text-anchor="{anchor}" font-size="{11 if isT else 9.5}" class="t-mono {cls}"{op}{HALO}>{ln}</text>')
        col = '#faff69' if on else '#4a4a58'
        cid = ' id="mq-proj"' if ci == 1 else ''
        top.append(f'<g{op}><circle{cid} cx="{f(x)}" cy="{f(y)}" r="13" fill="{"#1a1a10" if on else "#141419"}" stroke="{col}" stroke-width="1.8"/></g>')
        s_ = math.sin(math.radians(ang))
        lab_y = y + (28 if s_ > 0.2 else -20)
        lab_x = x + (0 if abs(s_) > 0.2 else (24 if math.cos(math.radians(ang)) > 0 else -24))
        anc = 'middle' if abs(s_) > 0.2 else ('start' if math.cos(math.radians(ang)) > 0 else 'end')
        labels.append(f'<text x="{f(lab_x)}" y="{f(lab_y)}" text-anchor="{anc}" font-size="10.5" class="t-mono {"t-body" if on else "t-mute2"}"{op}{HALO}>{nm}</text>')
    o.append('<g>' + ''.join(edges) + '</g>')
    px, py = catpos[1]
    chip_x, chip_y = 24, 462
    o.append(f'<path id="mq-e1" d="M{chip_x+230} {chip_y} C 318 {chip_y}, 318 {cy+90}, {cx-8} {cy+21}" fill="none" stroke="#faff69" stroke-width="2.2"/>')
    o.append(f'<path id="mq-e2" d="M{cx} {cy} L{f(px)} {f(py)}" fill="none" stroke="#faff69" stroke-width="2.6"/>')
    o.append(f'<path id="mq-e3" d="M{f(px)} {f(py)} L{f(target[0])} {f(target[1])}" fill="none" stroke="#faff69" stroke-width="2.6"/>')
    o.append(''.join(top))
    o.append(f'<circle cx="{cx}" cy="{cy}" r="52" fill="url(#mg-root)" class="pulse"/><circle cx="{cx}" cy="{cy}" r="22" fill="#faff69"/>'
             f'<text x="{cx}" y="{cy+4}" text-anchor="middle" font-size="10" font-weight="800" fill="#0a0a0a" class="t-mono">root</text>')
    o.append(''.join(labels))
    o.append(f'<g transform="translate({chip_x},{chip_y-22})"><rect width="230" height="44" rx="10" fill="#141419" stroke="#2a2a35"/>'
             '<text x="14" y="18" class="t-mono" fill="#a78bfa" font-size="10">wf · verify:importer asks</text>'
             '<text x="14" y="35" class="t-ink" font-size="12.5">"how is e2e run here?"</text></g>')
    o.append(f'<g id="mq-ans" transform="translate({chip_x},{chip_y+32})"><rect width="270" height="30" rx="8" fill="#18180f" stroke="#faff69"/>'
             '<text x="12" y="20" class="t-mono" fill="#faff69" font-size="11">→ npm run e2e · needs pg on :5433</text></g>')
    o.append(f'<g transform="translate(330,{chip_y+6})"><text x="0" y="0" class="t-mono t-mute2" font-size="10" letter-spacing="1.2">LOADED FOR THIS ANSWER</text>'
             '<rect x="0" y="12" width="286" height="10" rx="5" fill="#1d1d25"/>'
             '<rect x="285" y="9" width="2" height="16" fill="#f87171"/>'
             '<rect id="mq-bar" x="0" y="12" width="98" height="10" rx="5" fill="#faff69"/>'
             '<text x="0" y="44" class="t-mono t-ink" font-size="11.5"><tspan id="mq-tok">1.2k</tspan> <tspan class="t-mute">tokens · flat MEMORY.md</tspan> <tspan fill="#f87171">3.5k</tspan></text></g>')
    o.append('</svg>')
    return '\n'.join(o)

# ---------------------------------------------------------------- resume ticks
def resume_ticks():
    o = []
    for i in range(14):
        x = 40 + i * 560 / 13
        done = i < 9
        o.append(f'<g class="rt" data-i="{i}"><circle cx="{f(x)}" cy="120" r="{7 if done else 6}" fill="{"#0a0a0a" if done else "#121217"}" stroke="{"#4ade80" if done else "#3a3a46"}" stroke-width="2"/>'
                 f'<text x="{f(x)}" y="152" text-anchor="middle" class="t-mono {"t-body" if done else "t-mute2"}" font-size="10">{i+1}</text></g>')
    return '<g id="r-ticks">' + ''.join(o) + '</g>'

# ---------------------------------------------------------------- meter chips
CALLS = ['Read', 'Grep', 'Read', 'Glob', 'Bash', 'Edit', 'Bash', 'Read', 'Edit', 'Bash', 'Write', 'Bash', 'Grep',
         'Edit', 'Bash', 'Bash', 'Edit', 'Read', 'Bash', 'Edit', 'Bash', 'Write', 'Bash', 'Edit', 'Bash',
         'Read', 'Bash', 'Edit', 'Bash', 'Edit', 'Bash', 'Bash', 'Edit', 'Bash']
def meter_chips():
    o = []
    counted = 0
    for i, c in enumerate(CALLS):
        col, row = i % 9, i // 9
        x, y = 24 + col * 66, 62 + row * 46
        cnt = c in ('Bash', 'Edit', 'Write')
        if cnt: counted += 1
        if counted > 25: break
        fill = '#26260f' if cnt else '#16161c'
        stroke = '#faff69' if cnt else '#2a2a35'
        tc = '#faff69' if cnt else '#6b6b76'
        o.append(f'<g class="mc" data-c="{1 if cnt else 0}" transform="translate({x},{y})"><rect width="58" height="32" rx="8" fill="{fill}" stroke="{stroke}"/>'
                 f'<text x="29" y="20.5" text-anchor="middle" fill="{tc}">{c}</text></g>')
    return ''.join(o)

parts = [HERE / n for n in ('01-head.html', '02-top.html', '03-values-a.html', '04-values-b.html', '05-bottom.html')]
html = ''.join(p.read_text() for p in parts)
html = html.replace('{{HERO_SVG}}', hero_svg())
html = html.replace('{{MEM_SVG}}', mem_svg())
html = html.replace('<g id="r-ticks"></g>', resume_ticks())
html = html.replace('{{METER_CHIPS}}', meter_chips())
js = (HERE / '06-script.js').read_text()
assert '</script' not in ANIME
html += '<script>\n' + ANIME + '\n</script>\n<script>\n' + js + '\n</script>\n</body>\n</html>\n'
left = re.findall(r'\{\{[A-Z_]+\}\}', html)
assert not left, left
dup = re.findall(r'<[a-zA-Z][^>]*\sclass="[^"]*"[^>]*\sclass="', html)
assert not dup, dup[:3]
ids = re.findall(r'\sid="([^"]+)"', html)
d = {i for i in ids if ids.count(i) > 1}
assert not d, d
OUT.write_text(html)
print('wrote', OUT, len(html), 'bytes')
