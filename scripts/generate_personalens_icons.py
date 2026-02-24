import math, struct, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'apps' / 'mobile' / 'assets'


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)


def save_png(path: Path, w: int, h: int, rgba: bytearray):
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)
        raw.extend(rgba[y*stride:(y+1)*stride])
    compressed = zlib.compress(bytes(raw), level=9)
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', compressed)
    png += chunk(b'IEND', b'')
    path.write_bytes(png)


def make_canvas(w, h, bg=(0, 0, 0, 0)):
    r, g, b, a = bg
    px = bytearray(w * h * 4)
    for i in range(0, len(px), 4):
        px[i] = r
        px[i+1] = g
        px[i+2] = b
        px[i+3] = a
    return px


def blend(px, w, h, x, y, color):
    if x < 0 or y < 0 or x >= w or y >= h:
        return
    sr, sg, sb, sa = color
    if sa <= 0:
        return
    i = (y * w + x) * 4
    dr, dg, db, da = px[i], px[i+1], px[i+2], px[i+3]
    sa_f = sa / 255.0
    da_f = da / 255.0
    out_a = sa_f + da_f * (1 - sa_f)
    if out_a <= 0:
        px[i:i+4] = bytes((0, 0, 0, 0))
        return
    def comp(sc, dc):
        return int(round((sc * sa_f + dc * da_f * (1 - sa_f)) / out_a))
    px[i] = comp(sr, dr)
    px[i+1] = comp(sg, dg)
    px[i+2] = comp(sb, db)
    px[i+3] = int(round(out_a * 255))


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(4))


def fill_linear_gradient(px, w, h, c_tl, c_br):
    for y in range(h):
        ty = y / max(1, h - 1)
        for x in range(w):
            tx = x / max(1, w - 1)
            t = max(0.0, min(1.0, (tx * 0.6 + ty * 0.9) / 1.5))
            c = mix(c_tl, c_br, t)
            i = (y * w + x) * 4
            px[i:i+4] = bytes(c)


def draw_soft_circle(px, w, h, cx, cy, r, color, feather=1.5):
    x0 = max(0, int(cx - r - feather - 1))
    x1 = min(w - 1, int(cx + r + feather + 1))
    y0 = max(0, int(cy - r - feather - 1))
    y1 = min(h - 1, int(cy + r + feather + 1))
    cr, cg, cb, ca = color
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            a = 0.0
            if d <= r - feather:
                a = 1.0
            elif d <= r + feather:
                a = max(0.0, min(1.0, (r + feather - d) / (2 * feather)))
            if a > 0:
                blend(px, w, h, x, y, (cr, cg, cb, int(ca * a)))


def draw_ring(px, w, h, cx, cy, r, thickness, color, feather=1.5):
    outer = r + thickness / 2
    inner = max(0.0, r - thickness / 2)
    x0 = max(0, int(cx - outer - feather - 1))
    x1 = min(w - 1, int(cx + outer + feather + 1))
    y0 = max(0, int(cy - outer - feather - 1))
    y1 = min(h - 1, int(cy + outer + feather + 1))
    cr, cg, cb, ca = color
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            a = 0.0
            if inner + feather <= d <= outer - feather:
                a = 1.0
            elif inner - feather <= d <= outer + feather:
                # edge fade for both inner and outer boundaries
                a_out = 1.0 if d <= outer - feather else max(0.0, min(1.0, (outer + feather - d) / (2 * feather)))
                a_in = 1.0 if d >= inner + feather else max(0.0, min(1.0, (d - (inner - feather)) / (2 * feather)))
                a = min(a_out, a_in)
            if a > 0:
                blend(px, w, h, x, y, (cr, cg, cb, int(ca * a)))


def draw_diag_glow(px, w, h, x0, y0, x1, y1, width, color, feather=3.0):
    # distance to segment
    cr, cg, cb, ca = color
    minx = max(0, int(min(x0, x1) - width - feather - 2))
    maxx = min(w - 1, int(max(x0, x1) + width + feather + 2))
    miny = max(0, int(min(y0, y1) - width - feather - 2))
    maxy = min(h - 1, int(max(y0, y1) + width + feather + 2))
    vx, vy = x1 - x0, y1 - y0
    vlen2 = vx*vx + vy*vy + 1e-6
    for y in range(miny, maxy + 1):
        for x in range(minx, maxx + 1):
            px0 = x + 0.5 - x0
            py0 = y + 0.5 - y0
            t = max(0.0, min(1.0, (px0*vx + py0*vy) / vlen2))
            qx = x0 + vx*t
            qy = y0 + vy*t
            d = math.hypot(x + 0.5 - qx, y + 0.5 - qy)
            if d <= width + feather:
                if d <= width:
                    a = 1.0
                else:
                    a = max(0.0, min(1.0, (width + feather - d) / feather))
                blend(px, w, h, x, y, (cr, cg, cb, int(ca * a)))


def draw_rounded_rect_stroke(px, w, h, x, y, rw, rh, radius, thickness, color):
    # simple approximation using rings/lines by sampling signed distance to rounded rect
    cr, cg, cb, ca = color
    x0 = max(0, int(x - thickness - 2))
    x1 = min(w - 1, int(x + rw + thickness + 2))
    y0 = max(0, int(y - thickness - 2))
    y1 = min(h - 1, int(y + rh + thickness + 2))
    cx = x + rw/2
    cy = y + rh/2
    hx = rw/2 - radius
    hy = rh/2 - radius
    for py in range(y0, y1 + 1):
        for pxl in range(x0, x1 + 1):
            qx = abs((pxl + 0.5) - cx) - hx
            qy = abs((py + 0.5) - cy) - hy
            qx2 = max(qx, 0.0)
            qy2 = max(qy, 0.0)
            dist = math.hypot(qx2, qy2) + min(max(qx, qy), 0.0) - radius
            ad = abs(dist)
            if ad <= thickness:
                a = max(0.0, 1.0 - ad / max(1.0, thickness))
                blend(px, w, h, pxl, py, (cr, cg, cb, int(ca * a)))


def draw_personalens_icon(px, w, h, transparent_bg=False):
    if not transparent_bg:
        fill_linear_gradient(px, w, h, (8, 14, 37, 255), (34, 107, 255, 255))
        draw_soft_circle(px, w, h, w*0.22, h*0.18, w*0.22, (0, 255, 245, 45), feather=w*0.06)
        draw_soft_circle(px, w, h, w*0.78, h*0.22, w*0.28, (255, 46, 145, 55), feather=w*0.08)
        draw_soft_circle(px, w, h, w*0.65, h*0.78, w*0.32, (110, 80, 255, 48), feather=w*0.1)
        draw_diag_glow(px, w, h, w*0.12, h*0.82, w*0.84, h*0.18, w*0.018, (255, 255, 255, 35), feather=w*0.03)
        draw_rounded_rect_stroke(px, w, h, w*0.08, h*0.08, w*0.84, h*0.84, w*0.12, w*0.010, (255,255,255,70))

    cx, cy = w * 0.5, h * 0.5
    base_r = w * (0.25 if transparent_bg else 0.24)
    # glow stack
    draw_soft_circle(px, w, h, cx, cy, base_r*1.18, (0, 220, 255, 42 if transparent_bg else 60), feather=base_r*0.18)
    draw_soft_circle(px, w, h, cx, cy, base_r*0.98, (255, 57, 168, 25 if transparent_bg else 36), feather=base_r*0.14)
    # lens body
    draw_ring(px, w, h, cx, cy, base_r*0.95, base_r*0.22, (255, 255, 255, 235 if transparent_bg else 220), feather=2.2)
    draw_ring(px, w, h, cx, cy, base_r*0.70, base_r*0.10, (130, 240, 255, 220), feather=2.0)
    draw_ring(px, w, h, cx, cy, base_r*0.52, base_r*0.06, (255, 120, 220, 190), feather=1.6)
    draw_soft_circle(px, w, h, cx, cy, base_r*0.43, (16, 22, 42, 235), feather=2.0)
    draw_soft_circle(px, w, h, cx, cy, base_r*0.28, (40, 205, 255, 70), feather=base_r*0.10)
    draw_soft_circle(px, w, h, cx + base_r*0.17, cy - base_r*0.17, base_r*0.12, (255,255,255,185), feather=base_r*0.04)
    draw_soft_circle(px, w, h, cx - base_r*0.22, cy + base_r*0.18, base_r*0.06, (255, 64, 153, 130), feather=base_r*0.03)

    # orbit accents
    for ang, rr, size, col in [
        (-35, base_r*1.18, base_r*0.055, (0,245,255,210)),
        (18, base_r*1.27, base_r*0.04, (255,255,255,180)),
        (142, base_r*1.10, base_r*0.045, (255,70,170,180)),
    ]:
        rad = math.radians(ang)
        draw_soft_circle(px, w, h, cx + math.cos(rad)*rr, cy + math.sin(rad)*rr, size, col, feather=size*0.4)

    # subtle 'P' cue arc / stem in the center for brand recall
    draw_diag_glow(px, w, h, cx - base_r*0.08, cy + base_r*0.26, cx - base_r*0.08, cy - base_r*0.20, base_r*0.025, (255,255,255,180), feather=base_r*0.03)
    draw_ring(px, w, h, cx + base_r*0.02, cy - base_r*0.06, base_r*0.20, base_r*0.05, (255,255,255,170), feather=1.4)


def generate(size, transparent=False):
    px = make_canvas(size, size, (0, 0, 0, 0) if transparent else (0, 0, 0, 255))
    draw_personalens_icon(px, size, size, transparent_bg=transparent)
    return px


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    tmp_dir = ASSETS / ".generated_tmp"
    tmp_dir.mkdir(exist_ok=True)
    save_png(tmp_dir / 'icon-256.png', 256, 256, generate(256, transparent=False))
    save_png(tmp_dir / 'adaptive-256.png', 256, 256, generate(256, transparent=True))
    save_png(tmp_dir / 'splash-256.png', 256, 256, generate(256, transparent=True))
    save_png(ASSETS / 'favicon.png', 48, 48, generate(48, transparent=False))
    print('generated base icons in', tmp_dir)


if __name__ == '__main__':
    main()
