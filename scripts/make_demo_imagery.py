"""
Generates the DEMO satellite overlays used by CycloneX (transparent PNGs).

These are synthetic stand-ins for real INSAT-3DR / Himawari / HURSAT products so the
prototype can run offline. Replace the files in public/imagery/ (or plug a new provider
into src/lib/imagery.js) to use real data. Run:  python scripts/make_demo_imagery.py
Requires: numpy, scipy, pillow
"""
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates, gaussian_filter
import os, math

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "imagery")
sm = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))
lerp = lambda a, b, t: a + (b - a) * t

def pnoise(h, w, exp, seed):
    """Spectral 1/f^exp noise, normalised to 0..1 (cloud-like fractal texture)."""
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(h)[:, None]; fx = np.fft.fftfreq(w)[None, :]
    f = np.sqrt(fx ** 2 + fy ** 2); f[0, 0] = 1
    spec = (rng.normal(size=(h, w)) + 1j * rng.normal(size=(h, w))) / f ** exp
    spec[0, 0] = 0
    a = np.real(np.fft.ifft2(spec))
    lo, hi = np.percentile(a, [1, 99])
    return np.clip((a - lo) / (hi - lo), 0, 1)

def ramp(v, stops):
    """Piecewise-linear colour ramp. stops = [(value, (r,g,b)), ...]"""
    xs = [s[0] for s in stops]
    return np.stack([np.interp(v, xs, [s[1][c] for s in stops]) for c in range(3)], -1)

STAGE = {  # eye radius, core size, shield amplitude, band count, overall strength, swirl
    "developing": dict(eye=0.0, core=0.15, amp=0.85, nb=3, swirl=0.30, env=0.88),
    "mature": dict(eye=0.075, core=0.23, amp=1.0, nb=3, swirl=0.38, env=1.0),
    "decayed": dict(eye=0.0, core=0.10, amp=0.58, nb=2, swirl=0.25, env=0.80),
}

def storm(n, stage, seed=11):
    P = STAGE[stage]
    y, x = np.mgrid[-1:1:n * 1j, -1:1:n * 1j]
    r = np.hypot(x, y); th = np.arctan2(y, x)
    base = pnoise(n, n, 1.9, seed); fine = pnoise(n, n, 1.05, seed + 1); warp = pnoise(n, n, 1.8, seed + 2)
    sw = P["swirl"] * 6.0 / (r + 0.22)                       # radius-dependent rotation -> spiral-sheared texture
    xs = x * np.cos(sw) - y * np.sin(sw); ys = x * np.sin(sw) + y * np.cos(sw)
    q = lambda f_: map_coordinates(f_, [(ys + 1) / 2 * (n - 1), (xs + 1) / 2 * (n - 1)], order=1, mode="reflect")
    tex, tex2 = q(base), q(fine)
    asym = 1 + 0.38 * np.cos(th - math.pi / 4)               # larger cloud shield to the south-east
    re = r / asym
    env = sm(1.0, 0.22, re * (1.0 / P["env"]))
    core = np.exp(-(r / P["core"]) ** 2)
    eye = P["eye"]; wall = eye * 1.7
    ring = np.exp(-((r - wall) / 0.05) ** 2) * (0.65 + 0.35 * np.cos(2 * th + 3 * warp)) if eye else 0
    bands = (0.5 + 0.5 * np.cos(P["nb"] * (th - 2.4 * np.log(r + 0.05)) + 5.5 * (warp - 0.5))) ** 3.2
    bands = bands * sm(0.95, 0.15, re) * sm(0.05, 0.2, r)
    # radial outflow cirrus streaks on the downwind (south-east) side
    cir = map_coordinates(pnoise(n, n, 1.4, seed + 3), [r * n * 0.10 + 0, (th + math.pi) / (2 * math.pi) * n * 0.9], order=1, mode="wrap")
    cirrus = cir * sm(0.3, 0.95, r) * (0.5 + 0.5 * np.cos(th - math.pi / 4)) * sm(1.0, 0.7, r)
    T = P["amp"] * (1.0 * core * (0.75 + 0.25 * tex) + 0.85 * ring + 0.72 * bands * (0.5 + 0.5 * tex) + 0.85 * env * (0.25 + 0.75 * tex)) + 0.22 * cirrus * P["amp"] + 0.16 * (tex2 - 0.5)
    cells = np.clip((tex2 - 0.38) * 2.4, 0, 1)
    T = T * (0.62 + 0.38 * cells) + 0.10 * cells * (core + bands)
    T = np.clip((T - 0.12) * 1.45, 0, 1)
    if eye:
        T = T * (0.06 + 0.94 * sm(eye * 0.65, eye * 1.25, r + 0.014 * (tex - 0.5)))
    edge = sm(1.0, 0.80, r)
    return T, tex, tex2, r, th, edge

def shade(T):
    s = gaussian_filter(T, 1.6); gy, gx = np.gradient(s)
    return np.clip(0.5 - 9 * (gx * 0.55 + gy * 0.8), 0, 1)

def render(band, T, tex, tex2, r, th, edge):
    if band == "visible":
        a = sm(0.05, 0.50, T) ** 0.8 * 0.97 * edge
        lum = 0.40 + 0.42 * sm(0, 1.0, T) ** 0.9 + 0.55 * (shade(T) - 0.5) * (0.4 + 0.6 * sm(0, 0.5, T))
        lum = np.clip(lum, 0, 1)
        rgb = ramp(lum, [(0, (112, 124, 142)), (0.55, (196, 204, 214)), (1, (252, 252, 253))])
    elif band == "infrared":
        h = np.clip(T ** 1.12 + 0.09 * (tex2 - 0.5) * T, 0, 1)
        g = 28 + 227 * h ** 0.85
        rgb = np.stack([g, g, g], -1)
        tc = -85 * h + 25 * (1 - h)                          # brightness temperature, deg C
        col = ramp(-tc, [(0, (0, 0, 0)), (50, (0, 0, 0)), (62, (150, 205, 222)), (72, (232, 220, 140)), (80, (228, 160, 90)), (86, (204, 100, 98))])
        k = (sm(58, 72, -tc) * 0.30)[..., None]
        rgb = rgb * (1 - k) + col * k
        a = sm(0.07, 0.32, h) * 0.97 * edge
    else:  # water vapour: moisture field with filaments and a dry slot
        m = 0.6 * gaussian_filter(T, 7) + 0.4 * gaussian_filter(T, 2.5)
        dry = sm(0.4, 0.95, r) * (0.5 + 0.5 * np.cos(th + 2.3)) * 0.55
        v = np.clip(0.10 + 1.15 * m + 0.62 * (tex - 0.5) * sm(1.0, 0.15, r) + 0.2 * (tex2 - 0.5) - dry, 0, 1)
        rgb = ramp(v, [(0, (26, 40, 54)), (0.35, (58, 100, 124)), (0.65, (150, 192, 208)), (1, (238, 247, 250))])
        a = (0.50 + 0.42 * v) * edge
    return np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 1) * 255]).astype(np.uint8)

def merc(lat): return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
def region(band, w=1200, seed=5):
    """Regional cloud / moisture field, georeferenced to lon 58..106, lat 2..38 (Web Mercator pixels)."""
    y0, y1 = merc(38), merc(2); h = int(w * (y0 - y1) / math.radians(48))
    X, Y = np.meshgrid(np.linspace(58, 106, w), np.linspace(y0, y1, h))
    lat = np.degrees(2 * np.arctan(np.exp(Y)) - math.pi / 2); lon = X
    m = np.full_like(lon, 0.32)
    for bx, by, s, k in [(88, 14, 12, 1), (68, 14, 10, .7), (91, 25, 6, .9), (75, 14, 5, .9), (85, 28, 10, .6), (100, 17, 8, .8), (80, 7, 8, .7), (71, 27, 7, -.5), (90, 33, 10, -.4)]:
        m += k * np.exp(-(((lon - bx) / s) ** 2 + ((lat - by) / (s * .8)) ** 2))
    n1 = pnoise(h, w, 1.5, seed); n2 = pnoise(h, w, 1.1, seed + 1)
    d = np.clip((0.7 * n1 + 0.3 * n2 - 0.44) * 3.0 * m, 0, 1)
    if band == "visible":
        lum = np.clip(0.62 + 0.38 * d + 0.25 * (shade(d) - 0.5), 0, 1)
        rgb = ramp(lum, [(0, (130, 140, 156)), (0.6, (205, 212, 222)), (1, (252, 252, 253))]); a = sm(0.04, 0.4, d) * 0.80
    elif band == "infrared":
        g = 30 + 215 * d ** 0.9; rgb = np.stack([g, g, g], -1); a = sm(0.05, 0.35, d) * 0.88
    else:
        v = np.clip(0.18 + 0.75 * gaussian_filter(d, 2.0) + 0.3 * (n1 - 0.5), 0, 1)
        rgb = ramp(v, [(0, (26, 40, 54)), (0.35, (58, 100, 124)), (0.65, (150, 192, 208)), (1, (238, 247, 250))]); a = 0.34 + 0.34 * v
    return np.dstack([rgb, np.clip(a, 0, 1) * 255]).astype(np.uint8)

if __name__ == "__main__":
    for st in STAGE:
        f = storm(768, st)
        for band in ("visible", "infrared", "vapour"):
            Image.fromarray(render(band, *f), "RGBA").save(f"{OUT}/cyclone/{st}_{band}.png", optimize=True)
            print("cyclone", st, band)
    for band in ("visible", "infrared", "vapour"):
        Image.fromarray(region(band), "RGBA").save(f"{OUT}/region/{band}.png", optimize=True); print("region", band)


def world(band, W=4096, seed=21):
    """Global cloud / moisture field, lon -180..180, lat -75..75 (Web Mercator pixels, wraps in longitude)."""
    y0, y1 = merc(75), merc(-75); h = int(W * (y0 - y1) / (2 * math.pi))
    lon = np.linspace(-180, 180, W, dtype=np.float32)[None, :]
    Y = np.linspace(y0, y1, h, dtype=np.float32)[:, None]
    lat = np.degrees(2 * np.arctan(np.exp(Y)) - math.pi / 2).astype(np.float32)
    g = lambda x, s: np.exp(-((x / s) ** 2))
    warp = pnoise(h, W, 1.7, seed + 7).astype(np.float32)
    latw = lat + 24 * (warp - 0.5)                         # wiggle the climate belts so they do not look like stripes
    m = 0.4 + 0.8 * g(latw - 6, 10) + 0.8 * g(latw - 50, 15) + 0.8 * g(latw + 50, 15) - 0.35 * (g(latw - 24, 8) + g(latw + 24, 8))
    for bx, by, s_, k in [(-62, -4, 18, .8), (22, 0, 15, .7), (115, -2, 16, .8), (80, 18, 16, .8), (88, 14, 10, .7), (-75, 8, 10, .5), (10, 24, 20, -.45), (46, 24, 10, -.45), (71, 27, 6, -.35), (134, -25, 14, -.45), (90, 33, 10, -.35), (-110, 30, 12, -.35)]:
        m = m + k * g(np.hypot((lon - bx) * np.cos(np.radians(by)), lat - by), s_)
    m = np.clip(m, 0.12, 1.8)
    syn = pnoise(h, W, 1.3, seed).astype(np.float32); mid = pnoise(h, W, 0.95, seed + 1).astype(np.float32); fine = pnoise(h, W, 0.6, seed + 2).astype(np.float32)
    f = 0.62 * syn + 0.30 * mid + 0.08 * fine
    d = np.clip((f - 0.50) * 3.6 * m + 0.05, 0, 1); d = gaussian_filter(d, 1.4)
    n1 = syn
    if band == "visible":
        lum = np.clip(0.62 + 0.38 * d + 0.25 * (shade(d) - 0.5), 0, 1)
        rgb = ramp(lum, [(0, (130, 140, 156)), (0.6, (205, 212, 222)), (1, (252, 252, 253))]); a = sm(0.04, 0.4, d) * 0.80
    elif band == "infrared":
        gg = 30 + 215 * d ** 0.9; rgb = np.stack([gg, gg, gg], -1); a = sm(0.05, 0.35, d) * 0.88
    else:
        v = np.clip(0.18 + 0.75 * gaussian_filter(d, 2.0) + 0.3 * (n1 - 0.5), 0, 1)
        rgb = ramp(v, [(0, (26, 40, 54)), (0.35, (58, 100, 124)), (0.65, (150, 192, 208)), (1, (238, 247, 250))]); a = 0.34 + 0.34 * v
    return np.dstack([rgb, np.clip(a, 0, 1) * 255]).astype(np.uint8)

def make_world():
    os.makedirs(f"{OUT}/world", exist_ok=True)
    for band in ("visible", "infrared", "vapour"):
        Image.fromarray(world(band), "RGBA").save(f"{OUT}/world/{band}.webp", "WEBP", quality=80, method=4); print("world", band)


def radar_render(T, tex, tex2, r, th, edge):
    """Rain-intensity style colouring (green > yellow > orange > red > magenta) with a soft glow, for the home page map."""
    Z = np.clip(T ** 2.4 * 1.08 - 0.02 + 0.08 * (tex2 - 0.5), 0, 1)
    rgb = ramp(Z, [(0, (0, 0, 0)), (0.18, (40, 150, 90)), (0.32, (70, 200, 90)), (0.46, (210, 230, 70)), (0.58, (255, 200, 50)), (0.70, (255, 140, 40)), (0.82, (250, 60, 60)), (0.92, (240, 40, 200)), (1.0, (150, 110, 255))])
    a = sm(0.16, 0.34, Z) * 0.92 * edge
    ga = np.clip(gaussian_filter(a, 14) * 1.6, 0, 0.7)
    grgb = np.stack([gaussian_filter(rgb[..., c] * a, 14) for c in range(3)], -1) / np.maximum(gaussian_filter(a, 14)[..., None], 1e-3)
    oa = a + ga * (1 - a)
    orgb = (rgb * a[..., None] + grgb * (ga * (1 - a))[..., None]) / np.maximum(oa[..., None], 1e-3)
    return np.dstack([np.clip(orgb, 0, 255), np.clip(oa, 0, 1) * 255]).astype(np.uint8)

def make_radar():
    for st in STAGE:
        Image.fromarray(radar_render(*storm(768, st)), "RGBA").save(f"{OUT}/cyclone/radar_{st}.png", optimize=True); print("radar", st)
