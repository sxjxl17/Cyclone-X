"""Data-leakage guards. Fatal problems raise LeakageError (we fail loudly, never continue)."""
import pandas as pd

from ml.utils.config import resolve_path
from ml.utils.io import read_index, read_json

LABEL_LIKE = ("wind", "pressure", "lat", "lon", "category", "class", "stage", "label", "intensity")


class LeakageError(RuntimeError):
    pass


def check_event_overlap(splits):
    issues = []
    for a, b in (("train", "val"), ("train", "test"), ("val", "test")):
        both = set(splits[a]) & set(splits[b])
        if both:
            issues.append(("FATAL", f"events in both {a} and {b}: {sorted(both)}"))
    return issues


def check_duplicates(index, splits):
    issues = []
    assign = {e: k for k in ("train", "val", "test") for e in splits[k]}
    d = index.assign(split=index.event_id.map(assign))
    for col, what in (("file_sha256", "duplicate raw files"), ("array_sha256", "duplicate images")):
        dup = d[d.duplicated(col, keep=False)]
        if len(dup):
            cross = dup.groupby(col).split.nunique().gt(1).sum()
            issues.append(("FATAL", f"{what}: {dup[col].nunique()} hash(es) repeated ({cross} across splits)"))
    unassigned = d.split.isna().sum()
    if unassigned:
        issues.append(("FATAL", f"{unassigned} samples belong to events missing from the split file"))
    return issues


def check_temporal_overlap(index, splits, policy="warn"):
    """Concurrent storms in the same basin split across train/test are flagged."""
    issues = []
    g = index.assign(t=pd.to_datetime(index.timestamp_utc, utc=True, format="ISO8601")).groupby("event_id").agg(
        t0=("t", "min"), t1=("t", "max"), basin=("basin", "first"))
    sev = "FATAL" if policy == "fail" else "WARN"
    for other in ("val", "test"):
        for a in splits["train"]:
            for b in splits[other]:
                if a not in g.index or b not in g.index:
                    continue
                x, y = g.loc[a], g.loc[b]
                same = x.basin == y.basin or "unknown" in (x.basin, y.basin)
                if same and x.t0 <= y.t1 and y.t0 <= x.t1:
                    issues.append((sev, f"train event {a} overlaps in time/basin with {other} event {b}"))
    return issues


def check_future_inputs(index):
    t_in = pd.to_datetime(index.input_timestamp, utc=True, format="ISO8601")
    t_lab = pd.to_datetime(index.label_timestamp, utc=True, format="ISO8601")
    bad = int((t_in > t_lab).sum())
    return [("FATAL", f"{bad} samples have input newer than their label time")] if bad else []


def check_normalization(stats, splits):
    issues = []
    if stats.get("computed_from_split") != "train":
        issues.append(("FATAL", "normalisation stats not computed from the train split"))
    ev = set(stats.get("event_ids", []))
    if ev != set(splits["train"]):
        issues.append(("FATAL", "normalisation stats event ids differ from train events"))
    if ev & (set(splits["val"]) | set(splits["test"])):
        issues.append(("FATAL", "val/test events were used for normalisation statistics"))
    return issues


def check_label_feature_leakage(cfg):
    issues = []
    for ch in cfg["data"]["channels"]:
        if any(tok in ch.lower() for tok in LABEL_LIKE):
            issues.append(("FATAL", f"input channel '{ch}' looks like a label/metadata variable"))
    return issues


def run_all_checks(cfg, fail=True):
    proc, sdir = resolve_path(cfg, "processed_dir"), resolve_path(cfg, "splits_dir")
    idx = read_index(proc / "processed_index.csv")
    splits = read_json(sdir / "event_splits.json")
    stats = read_json(proc / "normalization_stats.json")
    issues = (check_event_overlap(splits) + check_duplicates(idx, splits)
              + check_temporal_overlap(idx, splits, cfg["splits"].get("temporal_overlap_policy", "warn"))
              + check_future_inputs(idx) + check_normalization(stats, splits) + check_label_feature_leakage(cfg))
    fatal = [m for s, m in issues if s == "FATAL"]
    if fail and fatal:
        raise LeakageError("DATA LEAKAGE DETECTED:\n  - " + "\n  - ".join(fatal))
    return {"fatal": fatal, "warnings": [m for s, m in issues if s == "WARN"], "ok": not fatal}
