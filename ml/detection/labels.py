
import json

import numpy as np
import pandas as pd

from ml.detection.config import det_paths
from ml.detection.geo import GridMapping
from ml.utils.config import REPO_ROOT, resolve_path
from ml.utils.io import read_index, read_json, write_json
from ml.utils.progress import progress

NEG_REQUIRED = ("obs_id", "scene_id", "timestamp_utc", "lat", "lon", "array_path", "array_sha256", "source",
                "min_track_dist_km", "negative_verified_against")
INDEX_COLS = ["obs_id", "group_id", "event_id", "kind", "label", "timestamp_utc", "lat", "lon", "source", "basin", "wind_kt",
              "array_path", "array_sha256", "file_sha256", "nan_frac", "centre_row", "centre_col", "centre_source",
              "geo_json", "min_track_dist_km", "negative_verified_against", "synthetic"]


class DetectionDataError(RuntimeError):
    pass


def build_geo_sidecar(cfg, pos):
    """Per-positive raw-grid geolocation by re-reading the raw file (additive; Step 1 outputs untouched).
    Returns {obs_id: mapping-dict or None}. None => geographic output unavailable for that sample."""
    from ml.preprocessing.readers import get_reader
    raw = resolve_path(cfg, "raw_dir")
    obs = read_index(resolve_path(cfg, "metadata_dir") / "observations.csv")
    sha2path = dict(zip(obs.file_sha256, obs.file_path))
    reader, d, out = get_reader(cfg), cfg["data"], {}
    for r in progress(list(pos.itertuples(index=False)), desc="geo-sidecar"):
        o = reader.read(raw / sha2path[r.file_sha256])
        ch0 = next(iter(o.channels.values()))
        m = GridMapping.from_raw_grid(o.grid, ch0.shape, d["crop_size"], d["downsample_factor"])
        out[r.obs_id] = None if m is None else m.__dict__.copy()
    return out


def positives_from_step1(cfg, geo=None):
    proc = resolve_path(cfg, "processed_dir")
    idx = read_index(proc / "processed_index.csv")
    size = cfg["data"]["crop_size"] // cfg["data"]["downsample_factor"]
    rows = []
    for r in idx.itertuples(index=False):
        gj = (geo or {}).get(r.obs_id)
        if gj:
            m = GridMapping(**gj)
            cr, cc = (float(v) for v in m.geo_to_pixel(r.lat, r.lon)); src = "grid_mapping"
        else:
            cr = cc = (size - 1) / 2.0; src = "assumed_storm_centred_grid_centre"
        rows.append({"obs_id": r.obs_id, "group_id": r.event_id, "event_id": r.event_id, "kind": "positive", "label": 1,
                     "timestamp_utc": r.timestamp_utc, "lat": r.lat, "lon": r.lon, "source": r.source, "basin": r.basin,
                     "wind_kt": r.wind_kt, "array_path": r.array_path, "array_sha256": r.array_sha256,
                     "file_sha256": r.file_sha256, "nan_frac": r.nan_frac, "centre_row": cr, "centre_col": cc,
                     "centre_source": src, "geo_json": json.dumps(gj) if gj else "", "min_track_dist_km": np.nan,
                     "negative_verified_against": "", "synthetic": bool(r.synthetic)})
    return pd.DataFrame(rows)


def negatives_from_index(neg_df, min_dist_km, synthetic):
    miss = [c for c in NEG_REQUIRED if c not in neg_df.columns]
    if miss:
        raise DetectionDataError(f"negatives index missing columns {miss}")
    n = neg_df.copy()
    if n["negative_verified_against"].fillna("").astype(str).str.strip().eq("").any():
        raise DetectionDataError("every negative must name the best-track source it was verified against")
    if (n.min_track_dist_km.astype(float) < min_dist_km).any():
        raise DetectionDataError(f"negatives closer than {min_dist_km} km to a tracked system are not allowed")
    src_ev = n["source_event_id"].fillna("").astype(str) if "source_event_id" in n.columns else pd.Series([""] * len(n), index=n.index)
    src_ev = src_ev.where(~src_ev.isin(["", "nan", "None"]), "")
    n["group_id"] = np.where(src_ev != "", src_ev, "NEGSCENE_" + n.scene_id.astype(str))
    n["event_id"] = "NEG"; n["kind"] = "negative"; n["label"] = 0
    for c, v in (("basin", "unknown"), ("wind_kt", np.nan), ("file_sha256", ""), ("nan_frac", np.nan), ("geo_json", ""),
                 ("centre_row", np.nan), ("centre_col", np.nan), ("centre_source", "none")):
        if c not in n.columns:
            n[c] = v
    n["synthetic"] = bool(synthetic) if "synthetic" not in n.columns else n["synthetic"].astype(bool)
    return n[INDEX_COLS]


def assign_detection_splits(index, event_splits, seed):
    """Positives follow the Step-1 event split. Negatives inherit the split of their source cyclone event if it has one;
    otherwise each negative scene group is assigned (seeded) with the same proportions."""
    split_of = {e: k for k in ("train", "val", "test") for e in event_splits[k]}
    unseen_pos = set(index[index.kind == "positive"].group_id) - set(split_of)
    if unseen_pos:
        raise DetectionDataError(f"positive events missing from Step-1 split: {sorted(unseen_pos)[:5]}")
    free = sorted(set(index.group_id) - set(split_of))
    rng = np.random.RandomState(seed); rng.shuffle(free)
    n = len(free); n_te, n_va = int(round(0.15 * n)), int(round(0.15 * n))
    for i, g in enumerate(free):
        split_of[g] = "test" if i < n_te else "val" if i < n_te + n_va else "train"
    sp = {k: sorted(g for g in set(index.group_id) if split_of[g] == k) for k in ("train", "val", "test")}
    sp["train_cyclone_ids"] = sorted(g for g in sp["train"] if g in set(index[index.kind == "positive"].group_id))
    sp["val_cyclone_ids"] = sorted(g for g in sp["val"] if g in set(index[index.kind == "positive"].group_id))
    sp["test_cyclone_ids"] = sorted(g for g in sp["test"] if g in set(index[index.kind == "positive"].group_id))
    sp["seed"] = seed
    return sp


def class_statistics(index, splits):
    out = {"overall": {}, "by_split": {}}
    def block(d):
        pos, neg = int((d.label == 1).sum()), int((d.label == 0).sum())
        return {"n_positive": pos, "n_negative": neg, "pos_to_neg_ratio": (pos / neg) if neg else None,
                "unique_groups_positive": int(d[d.label == 1].group_id.nunique()),
                "unique_groups_negative": int(d[d.label == 0].group_id.nunique())}
    out["overall"] = block(index)
    for k in ("train", "val", "test"):
        out["by_split"][k] = block(index[index.group_id.isin(splits[k])])
    return out


def compute_detection_norm_stats(index, splits, cfg):
    proc = resolve_path(cfg, "processed_dir")
    tr = index[index.group_id.isin(splits["train"])]
    C = len(cfg["data"]["channels"]); s, ss, n = np.zeros(C), np.zeros(C), np.zeros(C)
    for p in progress(tr.array_path.tolist(), desc="norm-stats(detection train only)"):
        a = np.load(proc / p).astype(np.float64); m = np.isfinite(a)
        for c in range(C):
            v = a[c][m[c]]; s[c] += v.sum(); ss[c] += (v ** 2).sum(); n[c] += v.size
    mean = s / n
    return {"computed_from_split": "train", "group_ids": sorted(splits["train"]), "n_samples": int(len(tr)),
            "channels": cfg["data"]["channels"], "mean": mean.tolist(),
            "std": np.sqrt(np.maximum(ss / n - mean ** 2, 0.0)).tolist()}


def check_detection_leakage(index, splits, stats=None):
    """Raises DetectionDataError on any fatal leakage."""
    bad = []
    for a, b in (("train", "val"), ("train", "test"), ("val", "test")):
        both = set(splits[a]) & set(splits[b])
        if both:
            bad.append(f"groups in both {a} and {b}: {sorted(both)[:5]}")
    split_of = {g: k for k in ("train", "val", "test") for g in splits[k]}
    un = set(index.group_id) - set(split_of)
    if un:
        bad.append(f"{len(un)} groups unassigned")
    d = index.assign(split=index.group_id.map(split_of))
    dup = d[d.duplicated("array_sha256", keep=False)].groupby("array_sha256").split.nunique().gt(1).sum()
    if dup:
        bad.append(f"{int(dup)} identical images appear in more than one split")
    if d.obs_id.duplicated().any():
        bad.append("duplicate obs_id")
    pos_groups, neg_scene_split = set(d[d.kind == "positive"].group_id), d[d.kind == "negative"]
    for sc, g in neg_scene_split.groupby("group_id").split.nunique().items():
        if g > 1:
            bad.append(f"negative group {sc} spans several splits")
    if stats is not None:
        if stats.get("computed_from_split") != "train" or set(stats["group_ids"]) != set(splits["train"]):
            bad.append("normalisation stats were not computed from the train groups only")
    if bad:
        raise DetectionDataError("DETECTION DATA LEAKAGE:\n  - " + "\n  - ".join(bad))
    return True


def build_detection_dataset(cfg, with_geo=True):
    from pathlib import Path
    P, dc = det_paths(cfg), cfg["detection"]
    pos_idx = read_index(P["proc"] / "processed_index.csv")
    geo = build_geo_sidecar(cfg, pos_idx) if with_geo else None
    pos = positives_from_step1(cfg, geo)
    mode = dc["mode"]; neg_path = Path(dc["negatives_index"])
    neg_path = neg_path if neg_path.is_absolute() else REPO_ROOT / neg_path
    if mode == "detection":
        if not neg_path.exists():
            raise DetectionDataError(
                f"detection mode needs a verified negatives index at {neg_path}. HURSAT-B1 has no genuine negatives; "
                "build them from scenes + a best-track table (see docs/STEP2.md), or set detection.mode=localization_only.")
        neg = negatives_from_index(pd.read_csv(neg_path, dtype={"scene_id": str, "source_event_id": str, "obs_id": str}),
                                   dc["min_negative_track_dist_km"], bool(pos.synthetic.all()))
        index = pd.concat([pos, neg], ignore_index=True)
    else:
        index = pos
    es = read_json(det_paths(cfg)["splits"].parent / "event_splits.json")
    splits = assign_detection_splits(index, es, cfg["seed"])
    check_detection_leakage(index, splits)
    stats = compute_detection_norm_stats(index, splits, cfg)
    check_detection_leakage(index, splits, stats)
    index.to_csv(P["index"], index=False); write_json(splits, P["splits"]); write_json(stats, P["stats"])
    man = {"dataset_version": dc["dataset_version"], "mode": mode, "synthetic": bool(index.synthetic.all()),
           "channels": cfg["data"]["channels"], "class_statistics": class_statistics(index, splits),
           "positive_definition": "Step-1 HURSAT-B1 storm-centred observation of a tracked tropical cyclone (every record is a TC fix, any intensity)",
           "negative_definition": (f"window >= {dc['min_negative_track_dist_km']} km from every best-track fix within the time window; "
                                   "verification source recorded per sample" if mode == "detection" else "none (localization_only)"),
           "centre_sources": index[index.label == 1].centre_source.value_counts().to_dict(),
           "balancing": "class-weighted loss (pos_weight) computed from TRAIN counts only; no image duplication"}
    write_json(man, P["manifest"])
    return index, splits, man
