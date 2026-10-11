"""Event-wise (never image-wise) train/val/test split + train-only normalisation statistics."""
import numpy as np
import pandas as pd

from ml.utils.config import resolve_path
from ml.utils.io import read_index, write_json
from ml.utils.progress import progress


def _assign(events, rng, s):
    ev = list(events)
    rng.shuffle(ev)
    n = len(ev)
    n_test = max(1, int(round(s["test_frac"] * n)))
    n_val = max(1, int(round(s["val_frac"] * n)))
    if n - n_test - n_val < 1:
        raise ValueError(f"need at least 3 events, got {n}")
    return {"test": sorted(ev[:n_test]), "val": sorted(ev[n_test:n_test + n_val]), "train": sorted(ev[n_test + n_val:])}


def make_event_splits(index, cfg, seed=None):
    s = cfg["splits"]
    seed = cfg["seed"] if seed is None else seed
    events = sorted(index.event_id.astype(str).unique())
    all_classes = set(index.class_idx.unique())
    chosen, attempt_used, note = None, None, ""
    for attempt in range(s["max_attempts"]):
        cand = _assign(events, np.random.RandomState(seed + attempt), s)
        ok = all(set(index[index.event_id.isin(cand[k])].class_idx) >= all_classes for k in cand) if s["require_all_classes_per_split"] else True
        if chosen is None:
            chosen, attempt_used = cand, attempt
        if ok:
            chosen, attempt_used = cand, attempt
            break
    else:
        note = "WARNING: no split found where every split contains every class; using attempt 0"
        chosen, attempt_used = _assign(events, np.random.RandomState(seed), s), 0
    names = cfg["task"]["class_names"]
    counts = {k: index[index.event_id.isin(v)].class_name.value_counts().reindex(names, fill_value=0).to_dict() for k, v in chosen.items()}
    return {"seed": seed, "attempt": attempt_used, "note": note, **chosen,
            "n_events": {k: len(chosen[k]) for k in ("train", "val", "test")},
            "n_samples": {k: int(index.event_id.isin(chosen[k]).sum()) for k in ("train", "val", "test")},
            "class_counts": counts}


def compute_train_stats(index, splits, cfg):
    proc = resolve_path(cfg, "processed_dir")
    tr = index[index.event_id.isin(splits["train"])]
    C = len(cfg["data"]["channels"])
    s, ss, n = np.zeros(C), np.zeros(C), np.zeros(C)
    for p in progress(tr.array_path.tolist(), desc="norm-stats(train only)"):
        a = np.load(proc / p).astype(np.float64)
        m = np.isfinite(a)
        for c in range(C):
            v = a[c][m[c]]
            s[c] += v.sum(); ss[c] += (v ** 2).sum(); n[c] += v.size
    mean = s / n
    std = np.sqrt(np.maximum(ss / n - mean ** 2, 0.0))
    return {"computed_from_split": "train", "event_ids": sorted(splits["train"]), "n_samples": int(len(tr)),
            "channels": cfg["data"]["channels"], "mean": mean.tolist(), "std": std.tolist()}


def create_splits(cfg):
    proc, sdir = resolve_path(cfg, "processed_dir"), resolve_path(cfg, "splits_dir")
    idx = read_index(proc / "processed_index.csv")
    splits = make_event_splits(idx, cfg)
    write_json(splits, sdir / "event_splits.json")
    assign = {e: k for k in ("train", "val", "test") for e in splits[k]}
    out = idx[["obs_id", "event_id"]].copy()
    out["split"] = out.event_id.map(assign)
    out.to_csv(sdir / "split_assignments.csv", index=False)
    stats = compute_train_stats(idx, splits, cfg)
    write_json(stats, proc / "normalization_stats.json")
    return splits, stats
