
import json
from pathlib import Path

import numpy as np
import pandas as pd

D = 0.07 


def _clutter(h, w, rng, n=None, frontal=False, comma=False):
    y, x = np.mgrid[:h, :w].astype(np.float32)
    c = np.zeros((h, w), np.float32)
    for _ in range(rng.randint(4, 10) if n is None else n):
        cy, cx, s, a = rng.uniform(0, h), rng.uniform(0, w), rng.uniform(8, 28), rng.uniform(0.25, 0.7)
        ang = rng.uniform(0, np.pi); e = rng.uniform(1.0, 2.5)
        u = (x - cx) * np.cos(ang) + (y - cy) * np.sin(ang); v = -(x - cx) * np.sin(ang) + (y - cy) * np.cos(ang)
        c += a * np.exp(-((u / (s * e)) ** 2 + (v / s) ** 2))
    if frontal:                      
        ang = rng.uniform(0, np.pi); d = (x - w / 2) * np.sin(ang) - (y - h / 2) * np.cos(ang)
        c += 0.55 * np.exp(-(d / rng.uniform(6, 14)) ** 2) * (0.6 + 0.4 * np.sin((x + y) / rng.uniform(15, 40)))
    if comma:                         
        cy, cx = rng.uniform(0.3, 0.7) * h, rng.uniform(0.3, 0.7) * w
        r, th = np.hypot(x - cx, y - cy), np.arctan2(y - cy, x - cx)
        c += 0.6 * np.exp(-((r - 40 - 20 * np.cos(th)) / 14) ** 2) * (np.cos(th / 2) ** 2)
    return c


def _cyclone(h, w, cy, cx, wind, rng):
    y, x = np.mgrid[:h, :w].astype(np.float32)
    r, th = np.hypot(x - cx, y - cy) + 1e-3, np.arctan2(y - cy, x - cx)
    r0 = 14 + 0.18 * wind                                   # CDO radius (px) grows with intensity
    cdo = np.exp(-(r / r0) ** 2) * (0.55 + 0.4 * min(wind, 120) / 120)
    arms = 0.45 * np.exp(-r / (45 + 0.3 * wind)) * (0.5 + 0.5 * np.sin(2.0 * th - np.log(r / 6) * (3.0 + rng.uniform(-.5, .5)) + rng.uniform(0, 6.28))) ** 2
    c = cdo + arms * min(1.0, 0.35 + wind / 80)
    if wind >= 64:                                          # eye
        c -= 0.8 * np.exp(-(r / (3 + 0.04 * wind)) ** 2) * c.max()
    return np.clip(c, 0, 1)


def render_channels(cloud, rng):
    """cloud in [0,1] -> {'vis','irwin','irwvp'} float32 (shared physical driver)."""
    n = lambda s: rng.normal(0, s, cloud.shape).astype(np.float32)
    cl = np.clip(cloud, 0, 1.2)
    ir = 292.0 - 95.0 * cl ** 1.2 + n(1.2)
    wv = 252.0 - 22.0 * cl + 3.0 * np.convolve(rng.normal(0, 1, cloud.shape[1]), np.ones(25) / 25, "same")[None, :] + n(0.8)
    vis = np.clip(0.10 + 0.8 * cl ** 0.9 + n(0.02), 0, 1)
    return {"vis": vis.astype(np.float32), "irwin": ir.astype(np.float32), "irwvp": wv.astype(np.float32)}


def storm_scene(size, wind, rng, centre_jitter_px=6):
    """HURSAT-like storm-centred grid: returns (channels, (centre_row, centre_col) raw px)."""
    cy, cx = size / 2 + rng.randint(-centre_jitter_px, centre_jitter_px + 1), size / 2 + rng.randint(-centre_jitter_px, centre_jitter_px + 1)
    cloud = _cyclone(size, size, cy, cx, wind, rng) + _clutter(size, size, rng, n=rng.randint(2, 6))
    return render_channels(np.clip(cloud, 0, 1.2), rng), (cy, cx)


def clutter_scene(h, w, rng):
    cloud = _clutter(h, w, rng, frontal=rng.rand() < 0.6, comma=rng.rand() < 0.5)
    return render_channels(np.clip(cloud, 0, 1.2), rng)


def generate_positive_fixture(raw_dir, seed=0, n_events=16, n_obs=8, size=301):
    raw_dir = Path(raw_dir)
    if "synthetic_test_only" not in raw_dir.as_posix():
        raise RuntimeError("synthetic data may only be written under a 'synthetic_test_only' path")
    raw_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.RandomState(seed); t0 = pd.Timestamp("2005-06-01T00:00:00Z"); fixes = []
    for e in range(n_events):
        eid, w0, slope = f"SYN{e:02d}", rng.uniform(25, 75), rng.uniform(5, 14)
        lat0, lon0 = rng.uniform(8, 25), rng.uniform(60, 95)
        for k in range(n_obs):
            wind = float(np.clip(w0 + slope * k - (3 * k * k if k > 5 else 0), 20, 140)); ts = t0 + pd.Timedelta(days=30 * e, hours=3 * k)
            lat, lon = lat0 + 0.3 * k, lon0 + 0.4 * k
            ch, (cy, cx) = storm_scene(size, wind, rng)
           
            grid = {"lat0": lat + cy * D, "lon0": lon - cx * D, "dlat_row": -D, "dlon_col": D, "shape": [size, size]}
            meta = {"synthetic": True, "event_id": eid, "name": f"SYNTH{e}", "basin": "SYN-A" if e % 2 == 0 else "SYN-B",
                    "timestamp": ts.isoformat(), "lat": lat, "lon": lon, "wind_kt": wind, "pressure_hpa": 1010 - 0.45 * wind, "grid": grid}
            np.savez_compressed(raw_dir / f"{eid}_{k:02d}.npz", meta_json=np.array(json.dumps(meta)), **{c: v.astype(np.float16) for c, v in ch.items()})
            fixes.append({"timestamp_utc": ts.isoformat(), "lat": lat, "lon": lon, "event_id": eid})
    return pd.DataFrame(fixes)
