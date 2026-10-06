"""Sello de la Notaría 41 de Quito, calcado sobre la imagen original (perfil de Facebook, 184 px).

Medidas tomadas del original y escaladas a un lienzo de 600: centro (88.5, 91) px -> (300, 300), factor 291/85.5.
Fuentes incrustadas (subconjuntos woff2): Arimo Bold (OFL) y UnifrakturMaguntia (OFL).
"""
import base64, math, os, sys

OUT, FONTS = sys.argv[1], sys.argv[2]
K, CX, CY = 291 / 85.5, 88.5, 91.0
P = lambda x, y: (300 + (x - CX) * K, 300 + (y - CY) * K)   # px del original -> unidades
b64 = lambda f: base64.b64encode(open(os.path.join(FONTS, f), "rb").read()).decode()
CSS = ("@font-face{font-family:S41;font-weight:700;src:url(data:font/woff2;base64,%s) format('woff2')}"
       "@font-face{font-family:F41;src:url(data:font/woff2;base64,%s) format('woff2')}") % (b64("arimo-sub.woff2"), b64("fraktur-sub.woff2"))


def pt(r, a):
    return 300 + r * math.cos(math.radians(a)), 300 + r * math.sin(math.radians(a))


def arc(r, a0, a1, sweep):
    am = (a0 + a1) / 2
    (x0, y0), (xm, ym), (x1, y1) = pt(r, a0), pt(r, am), pt(r, a1)
    return f"M{x0:.1f},{y0:.1f} A{r},{r} 0 0 {sweep} {xm:.1f},{ym:.1f} A{r},{r} 0 0 {sweep} {x1:.1f},{y1:.1f}"


def rosette(x, y, c):
    s = [f'<g transform="translate({x:.1f},{y:.1f})" fill="none" stroke="{c}" stroke-width="1.8">',
         '<circle r="20"/>']
    for i in range(12):
        s.append(f'<ellipse cx="0" cy="-13" rx="4" ry="6.5" transform="rotate({i*30})"/>')
    s.append(f'<circle r="5.5" fill="{c}" stroke="none"/></g>')
    return "".join(s)


def star(x, y, r, c):
    pts = []
    for i in range(10):
        rr = r if i % 2 == 0 else r * .42
        a = math.radians(-90 + i * 36)
        pts.append(f"{x + rr*math.cos(a):.1f},{y + rr*math.sin(a):.1f}")
    return f'<polygon points="{" ".join(pts)}" fill="{c}"/>'


def bez(p0, p1, p2, p3, t):
    u = 1 - t
    return tuple(u**3*a + 3*u*u*t*b + 3*u*t*t*c + t**3*d for a, b, c, d in zip(p0, p1, p2, p3))


def laurel(side, c):
    """Rama: de la base (bajo el escudo, cruzando al otro lado) hasta la punta superior."""
    m = (lambda p: p) if side < 0 else (lambda p: (600 - p[0], p[1]))
    # tramo principal: punta (arriba) -> cruce bajo el escudo
    A = [m(P(52, 52)), m(P(36, 82)), m(P(40, 118)), m(P(92, 122))]
    tail = [m(P(92, 122)), m(P(98, 122.5)), m(P(102, 124)), m(P(104, 126))]
    s = []
    d = "M%.1f,%.1f C%.1f,%.1f %.1f,%.1f %.1f,%.1f C%.1f,%.1f %.1f,%.1f %.1f,%.1f" % (*A[0], *A[1], *A[2], *A[3], *tail[1], *tail[2], *tail[3])
    s.append(f'<path d="{d}" fill="none" stroke="{c}" stroke-width="4.2" stroke-linecap="round"/>')
    n = 13
    for i in range(n):
        t = 0.04 + 0.78 * i / (n - 1)               # 0 = punta, 1 = base
        x, y = bez(*A, t)
        x2, y2 = bez(*A, t - 0.01)
        ang = math.degrees(math.atan2(y2 - y, x2 - x))   # dirección hacia la punta
        size = 0.7 + 0.5 * t
        for off in (34, -34):
            a = ang + off
            L, W = 38 * size, 11 * size
            ox, oy = x + math.cos(math.radians(a)) * L * .55, y + math.sin(math.radians(a)) * L * .55
            s.append(f'<ellipse cx="{ox:.1f}" cy="{oy:.1f}" rx="{L/2:.1f}" ry="{W/2:.1f}" transform="rotate({a:.1f} {ox:.1f} {oy:.1f})" fill="{c}"/>')
    x, y = A[0]
    x2, y2 = bez(*A, 0.03)
    a = math.degrees(math.atan2(y - y2, x - x2))
    s.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="11" ry="4.2" transform="rotate({a:.1f} {x:.1f} {y:.1f})" fill="{c}"/>')
    return "".join(s)


def escudo(main, accent, paper):
    (l, t), (r, _), (_, sb), (_, pb) = P(61.5, 40.5), P(115, 0), P(0, 107.5), P(0, 113)
    sh = f"M{l:.1f},{t:.1f} H{r:.1f} V{sb-6:.1f} Q{r:.1f},{sb:.1f} {r-10:.1f},{sb:.1f} H312 L300,{pb:.1f} L288,{sb:.1f} H{l+10:.1f} Q{l:.1f},{sb:.1f} {l:.1f},{sb-6:.1f} Z"
    def line(a, b):
        (x0, y0), (x1, y1) = P(*a), P(*b)
        dx, dy = x1 - x0, y1 - y0
        return f'<line x1="{x0-dx:.1f}" y1="{y0-dy:.1f}" x2="{x1+dx:.1f}" y2="{y1+dy:.1f}" stroke="{main}" stroke-width="2.6"/>'
    ang = math.degrees(math.atan2(83 - 40, 113 - 78))   # inclinación de la banda
    n1x, n1y = P(71.5, 46.5)
    n2x, n2y = P(73.0, 64.5)
    bx, by = P(92, 44)
    bw, bh = 18 * K, 12 * K
    book = (f'<g transform="translate({bx:.1f},{by:.1f})" stroke="{main}" stroke-width="2.2" stroke-linejoin="round" fill="{paper}">'
            f'<path d="M2,6 Q{bw*.25:.1f},2 {bw/2:.1f},6 V{bh-4:.1f} Q{bw*.25:.1f},{bh-8:.1f} 2,{bh-4:.1f} Z"/>'
            f'<path d="M{bw-2:.1f},6 Q{bw*.75:.1f},2 {bw/2:.1f},6 V{bh-4:.1f} Q{bw*.75:.1f},{bh-8:.1f} {bw-2:.1f},{bh-4:.1f} Z"/>'
            + "".join(f'<path d="M7,{y:.1f} H{bw/2-5:.1f} M{bw/2+5:.1f},{y:.1f} H{bw-7:.1f}" stroke-width="1.5"/>' for y in (12, 18, 24, 30))
            + f'<path d="M0,{bh:.1f} H{bw:.1f}" stroke-width="2.6"/></g>')
    x41, y41 = P(63.5, 103)
    return (f'<clipPath id="e"><path d="{sh}"/></clipPath><path d="{sh}" fill="{paper}"/>'
            f'<g clip-path="url(#e)">{line((78, 40), (113, 83))}{line((61.5, 64), (101, 108))}</g>'
            f'<path d="{sh}" fill="none" stroke="{main}" stroke-width="4.5" stroke-linejoin="round"/>'
            f'<text transform="translate({n1x:.1f},{n1y:.1f}) rotate({ang:.1f})" font-family="F41" font-size="36" fill="{main}" textLength="212" lengthAdjust="spacingAndGlyphs">Nihil Prius</text>'
            f'<text transform="translate({n2x:.1f},{n2y:.1f}) rotate({ang:.1f})" font-family="F41" font-size="36" fill="{main}" textLength="78" lengthAdjust="spacingAndGlyphs">Fide</text>'
            f'{book}'
            f'<text x="{x41:.1f}" y="{y41:.1f}" font-family="S41" font-weight="700" font-size="72" fill="{main}" textLength="66" lengthAdjust="spacingAndGlyphs">41</text>')


def sello(main, accent, paper):
    o = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img" '
         'aria-label="Sello Dr. Dobri Albornoz Donoso, Notario Cuadragésimo Primero, Quito - Ecuador">',
         f'<defs><style>{CSS}</style>'
         f'<path id="a1" d="{arc(241, 183, 357, 1)}"/>'
         f'<path id="a2" d="{arc(272, 176, 4, 0)}"/>'
         f'<path id="a3" d="{arc(205, 150, 30, 0)}"/></defs>']
    if paper != "none":
        o.append(f'<circle cx="300" cy="300" r="291" fill="{paper}"/>')
    o.append(f'<circle cx="300" cy="300" r="288" fill="none" stroke="{main}" stroke-width="6"/>')
    o.append(f'<circle cx="300" cy="300" r="221" fill="none" stroke="{main}" stroke-width="3.5"/>')
    tx = f'fill="{main}" font-family="S41" font-weight="700"'
    o.append(f'<text {tx} font-size="43"><textPath href="#a1" startOffset="50%" text-anchor="middle" textLength="700" lengthAdjust="spacing">DR. DOBRI ALBORNOZ DONOSO</textPath></text>')
    o.append(f'<text {tx} font-size="43"><textPath href="#a2" startOffset="50%" text-anchor="middle" textLength="790" lengthAdjust="spacing">NOTARIO CUADRAGESIMO PRIMERO</textPath></text>')
    o.append(f'<text {tx} font-size="39"><textPath href="#a3" startOffset="50%" text-anchor="middle" textLength="364" lengthAdjust="spacing">QUITO - ECUADOR</textPath></text>')
    o.append(rosette(*pt(256, 180), accent))
    o.append(rosette(*pt(256, 0), accent))
    o.append(star(*pt(190, 154), 9, accent))
    o.append(star(*pt(191, 26), 9, accent))
    o.append(laurel(-1, main))
    o.append(laurel(1, main))
    o.append(escudo(main, accent, paper))
    o.append("</svg>")
    return "".join(o)


VERDE, ORO = sys.argv[3] if len(sys.argv) > 3 else "#1B4D3E", sys.argv[4] if len(sys.argv) > 4 else "#B08D57"
variants = {
    "logo-notaria41.svg": sello(VERDE, ORO, "#FFFFFF"),
    "logo-notaria41-verde.svg": sello(VERDE, VERDE, "#FFFFFF"),
    "logo-notaria41-blanco.svg": sello("#FFFFFF", "#E2C27A", "none"),
    "logo-notaria41-negro.svg": sello("#111111", "#111111", "#FFFFFF"),
    "calco-rojo.svg": sello("#E00000", "#E00000", "none"),
}
os.makedirs(OUT, exist_ok=True)
for k, v in variants.items():
    open(os.path.join(OUT, k), "w").write(v)
print("ok")
