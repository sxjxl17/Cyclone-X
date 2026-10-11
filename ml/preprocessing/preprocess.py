
import warnings

import numpy as np
import pandas as pd

from ml.preprocessing.readers import get_reader
from ml.preprocessing.schema import wind_to_class
from ml.utils.config import resolve_path
from ml.utils.io import read_index, sha256_array, write_json
from ml.utils.progress import progress

TRANSFORMS = [
    "label_from_wind_bins", "centre_crop", "physical_range_mask_to_nan",
    "quality_filter(nan_frac,constant)", "block_mean_downsample(nan-aware)",
]


def center_crop(a, size):
    h, w = a.shape
    if h < size or w < size:
        raise ValueError("image smaller than crop_size")
    t, l = (h - size) // 2, (w - size) // 2
    return a[t:t + size, l:l + size]


def block_mean(a, f):
    if f == 1:
        return a
    h, w = a.shape
    if h % f or w % f:
        raise ValueError("crop_size must be divisible by downsample_factor")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return np.nanmean(a.reshape(h // f, f, w // f, f), axis=(1, 3))


def process_observation(channels, wind_kt, cfg, require_label=True):
    """Pure function -> (array[C,H,W] or None, reject_reason or None, info).
    require_label=False (inference / detection negatives) skips ONLY the wind-label step; every other
    transformation is identical, which guarantees train/inference preprocessing consistency."""
    d = cfg["data"]
    cls = wind_to_class(wind_kt, cfg["task"]["wind_bins_kt"]) if require_label else -1
    if require_label and cls < 0:
        return None, "no_label", {}
    out, nan_fracs = [], {}
    for n in d["channels"]:
        if n not in channels:
            return None, f"missing_channel:{n}", {}
        a = np.asarray(channels[n], dtype=np.float32).copy()
        if a.ndim != 2:
            return None, "bad_ndim", {}
        try:
            a = center_crop(a, d["crop_size"])
        except ValueError:
            return None, "image_too_small", {}
        a[~np.isfinite(a)] = np.nan
        rng = (d.get("valid_ranges") or {}).get(n)
        if rng:
            bad = np.isfinite(a) & ((a < rng[0]) | (a > rng[1]))
            if bad.mean() > d["max_out_of_range_frac"]:
                return None, f"out_of_physical_range:{n}", {}
            a[bad] = np.nan
        nf = float(np.mean(np.isnan(a)))
        if nf > d["max_nan_frac"]:
            return None, f"too_many_nan:{n}", {}
        if np.nanstd(a) == 0:
            return None, f"constant_image:{n}", {}
        nan_fracs[n] = nf
        out.append(block_mean(a, d["downsample_factor"]))
    return np.stack(out).astype(np.float32), None, {"nan_frac": max(nan_fracs.values()), "class_idx": cls}


def preprocess(cfg):
    raw_dir, meta_dir, proc = (resolve_path(cfg, k) for k in ("raw_dir", "metadata_dir", "processed_dir"))
    obs = read_index(meta_dir / "observations.csv")
    obs = obs[obs.status == "ok"].reset_index(drop=True)
    if obs.empty:
        raise RuntimeError("no valid observations - run scripts/ingest_data.py first")
    reader, names = get_reader(cfg), cfg["task"]["class_names"]
    (proc / "arrays").mkdir(parents=True, exist_ok=True)
    kept, rejected, seen_img = [], [], {}
    for r in progress(list(obs.itertuples(index=False)), desc="preprocess"):
        ts = pd.Timestamp(r.timestamp_utc)
        obs_id = f"{r.event_id}_{ts:%Y%m%dT%H%M%S}_{r.file_sha256[:8]}"
        o = reader.read(raw_dir / r.file_path)
        arr, why, info = process_observation(o.channels, o.wind_kt, cfg)
        if arr is None:
            rejected.append({"obs_id": obs_id, "file_path": r.file_path, "reason": why}); continue
        h = sha256_array(arr)
        if h in seen_img:
            rejected.append({"obs_id": obs_id, "file_path": r.file_path, "reason": f"duplicate_image of {seen_img[h]}"}); continue
        seen_img[h] = obs_id
        rel = f"arrays/{obs_id}.npy"
        np.save(proc / rel, arr)
        kept.append({
            "obs_id": obs_id, "event_id": r.event_id, "cyclone_name": r.cyclone_name, "basin": r.basin,
            "timestamp_utc": r.timestamp_utc, "input_timestamp": r.timestamp_utc, "label_timestamp": r.timestamp_utc,
            "lat": r.lat, "lon": r.lon, "wind_kt": r.wind_kt, "pressure_hpa": r.pressure_hpa,
            "class_idx": info["class_idx"], "class_name": names[info["class_idx"]],
            "array_path": rel, "array_sha256": h, "file_sha256": r.file_sha256,
            "nan_frac": info["nan_frac"], "source": r.source, "synthetic": bool(r.synthetic),
        })
    idx = pd.DataFrame(kept)
    pd.DataFrame(rejected, columns=["obs_id", "file_path", "reason"]).to_csv(proc / "rejected.csv", index=False)
    if idx.empty:
        raise RuntimeError("every observation was rejected - see rejected.csv")
    idx.to_csv(proc / "processed_index.csv", index=False)
    manifest = {
        "is_synthetic": bool(idx.synthetic.all()), "sources": sorted(idx.source.unique()),
        "n_samples": int(len(idx)), "n_events": int(idx.event_id.nunique()),
        "n_rejected": len(rejected), "reject_reasons": pd.Series([x["reason"].split(":")[0] for x in rejected]).value_counts().to_dict(),
        "class_counts": idx.class_name.value_counts().to_dict(), "channels": cfg["data"]["channels"],
        "transforms": TRANSFORMS, "data_params": cfg["data"], "wind_bins_kt": cfg["task"]["wind_bins_kt"],
    }
    write_json(manifest, proc / "dataset_manifest.json")
    return idx, manifest
