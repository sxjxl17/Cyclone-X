
import json
import shutil
from pathlib import Path

import numpy as np
import pandas as pd

BANNER = "SYNTHETIC TEST FIXTURE - NOT REAL DATA - PIPELINE CHECK ONLY"


def _image(wind, size, rng, channel):
    y, x = np.mgrid[:size, :size] - size / 2.0
    r, th = np.hypot(x, y), np.arctan2(y, x)
    r0, amp = 20 + 0.8 * wind, 30 + 0.6 * wind
    base = 290.0 if channel == "irwin" else 250.0
    k = 1.0 if channel == "irwin" else 0.5
    img = base - k * amp * np.exp(-(r / r0) ** 2) + 4 * np.sin(2 * th + r / 12.0) * np.exp(-r / 90.0)
    return (img + rng.normal(0, 1.5, img.shape)).astype(np.float16)


def generate_fixture(raw_dir, seed=0, n_events=14, n_obs=8, size=232):
    raw_dir = Path(raw_dir)
    if "synthetic_test_only" not in raw_dir.as_posix():
        raise RuntimeError("synthetic fixtures may only be written under a 'synthetic_test_only' path")
    if raw_dir.exists():
        shutil.rmtree(raw_dir)
    raw_dir.mkdir(parents=True)
    rng = np.random.RandomState(seed)
    t_start = pd.Timestamp("2000-01-01T00:00:00Z")
    files = []
    for e in range(n_events):
        eid = f"SYN{e:02d}"
        w0, slope = rng.uniform(20, 70), rng.uniform(8, 16)
        lat0, lon0 = rng.uniform(8, 25), rng.uniform(60, 95)
        for k in range(n_obs):
            wind = float(np.clip(w0 + slope * k, 15, 150))
            ts = t_start + pd.Timedelta(days=40 * e) + pd.Timedelta(hours=3 * k)
            meta = {"synthetic": True, "banner": BANNER, "event_id": eid, "name": f"SYNTH{e}",
                    "basin": "SYN-A" if e % 2 == 0 else "SYN-B", "timestamp": ts.isoformat(),
                    "lat": lat0 + 0.3 * k, "lon": lon0 + 0.4 * k, "wind_kt": wind,
                    "pressure_hpa": 1010 - 0.45 * wind}
            arrs = {c: _image(wind, size, rng, c) for c in ("irwin", "irwvp")}
            files.append((f"{eid}_{k:02d}.npz", meta, arrs))
   
    f = files
    nan_big = f[3][2]["irwin"].astype(np.float16).copy(); nan_big[:100, :] = np.nan
    f[3][2]["irwin"] = nan_big                                      
    nan_small = f[10][2]["irwin"].copy(); nan_small[:5, :20] = np.nan
    f[10][2]["irwin"] = nan_small                                    
    f[20][1]["wind_kt"] = float("nan")                               
    del f[30][2]["irwvp"]                                            
    for name, meta, arrs in files:
        np.savez_compressed(raw_dir / name, meta_json=np.array(json.dumps(meta, allow_nan=True)), **arrs)
    shutil.copy(raw_dir / files[5][0], raw_dir / "ZZ_DUPLICATE_OF_SYN00_05.npz")      
    (raw_dir / "ZZ_CORRUPT.npz").write_bytes(b"this is not an npz file")             
    return raw_dir
