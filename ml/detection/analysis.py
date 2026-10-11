"""Error analysis (TP/FP/TN/FN examples + data-derived error statistics), Grad-CAM panels, experiment comparison.
All statements in error_summary.json are computed from the actual predictions - no narrative causes are invented."""
import numpy as np
import pandas as pd

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from ml.detection import windows as W
from ml.utils.io import read_json, write_json


def _raw_window(ds, i, ch_idx=0):
    r = ds.df.iloc[i]
    a = np.load(ds.P["proc"] / r.array_path).astype(np.float32)[ds.ci[ch_idx]]
    top, left = ds.eval_origin(i)
    return a[top:top + ds.win, left:left + ds.win], (top, left)


def _pick(df, cat, k):
    d = df[df.cat == cat]
    if cat == "FN": d = d.sort_values("score")                    # most confidently missed first
    elif cat == "FP": d = d.sort_values("score", ascending=False) # most confident false alarms first
    elif cat == "TP": d = d.sort_values("score", ascending=False)
    else: d = d.sort_values("score")
    return d.head(k).index.tolist()


def error_analysis(cfg, model_dir, k=6):
    import torch
    from ml.detection.dataset import DetectionDataset
    from ml.detection.runtime import load_model_dir
    from ml.explain.gradcam import grad_cam
    model, md, dev = load_model_dir(model_dir)
    thr = md["operating_threshold"]
    te = DetectionDataset(cfg, "test", md["input_channels"], train=False)
    pr = pd.read_csv(f"{model_dir}/predictions_test.csv", dtype={"obs_id": str, "group_id": str})
    assert (pr.obs_id.values == te.df.obs_id.values).all()
    df = te.df.copy(); df["score"] = pr.score.values
    df["cat"] = np.select([(df.label == 1) & (df.score >= thr), (df.label == 0) & (df.score >= thr), (df.label == 0), (df.label == 1)], ["TP", "FP", "TN", "FN"], default="UNKNOWN")
    out = {"synthetic": md["synthetic"], "threshold": thr, "counts": df.cat.value_counts().to_dict()}
    pos = df[df.label == 1]
    if len(pos):
        out["positives_by_wind_bin_kt"] = {}
        bins = cfg["task"]["wind_bins_kt"]; names = cfg["task"]["class_names"]
        wc = np.digitize(pos.wind_kt.fillna(-1).values, bins); wc = np.where(pos.wind_kt.isna(), -1, wc)
        for j, nme in enumerate(names):
            m = wc == j
            if m.any():
                out["positives_by_wind_bin_kt"][nme] = {"n": int(m.sum()), "missed": int((pos.cat.values[m] == "FN").sum()), "miss_rate": float((pos.cat.values[m] == "FN").mean()),
                                                         "median_score": float(np.median(pos.score.values[m]))}
        out["nan_frac_median_by_category"] = {c: float(df[df.cat == c].nan_frac.median()) for c in ("TP", "FN") if (df.cat == c).any() and df[df.cat == c].nan_frac.notna().any()}
        out["fn_by_event"] = pos[pos.cat == "FN"].group_id.value_counts().to_dict()
    out["fp_by_group"] = df[df.cat == "FP"].group_id.value_counts().to_dict()
    ex_dir = f"{model_dir}/error_examples"; import os; os.makedirs(ex_dir, exist_ok=True)
    picked = {}
    for cat in ("TP", "FP", "TN", "FN"):
        ids = _pick(df, cat, k); picked[cat] = ids
        if not ids: continue
        fig, ax = plt.subplots(2, len(ids), figsize=(2.6 * len(ids), 5.4), squeeze=False)
        for j, i in enumerate(ids):
            im, (top, left) = _raw_window(te, i); r = df.iloc[i]
            ax[0, j].imshow(im, cmap="gray_r"); ax[0, j].axis("off")
            if r.label == 1 and np.isfinite(r.centre_row):
                ax[0, j].plot(r.centre_col - left, r.centre_row - top, "r+", ms=14)
            ax[0, j].set_title(f"{cat} s={r.score:.2f}\n{r.group_id[:14]}", fontsize=7)
            x, *_ = te[i]
            cam, _ = grad_cam(model, torch.from_numpy(x)[None].to(dev))
            ax[1, j].imshow(im, cmap="gray_r"); ax[1, j].imshow(cam, cmap="jet", alpha=0.45); ax[1, j].axis("off")
            ax[1, j].set_title("Grad-CAM", fontsize=7)
        fig.suptitle(f"{cat} examples (top: first input channel in K, red + = true centre; bottom: Grad-CAM; visual check only)", fontsize=8)
        fig.tight_layout(); fig.savefig(f"{ex_dir}/{cat}.png", dpi=110); plt.close(fig)
    out["example_obs_ids"] = {c: df.iloc[v].obs_id.tolist() for c, v in picked.items()}
    out["note"] = "statistics only; any causal explanation (weak organisation, cloud contamination, ...) must be confirmed by a human looking at the saved examples"
    write_json(out, f"{model_dir}/error_summary.json")
    return out


def compare_experiments(out_root):
    from pathlib import Path
    rows = []
    for d in sorted(Path(out_root).iterdir()):
        f = d / "metrics.json"
        if not f.exists(): continue
        m, md = read_json(f), read_json(d / "model_metadata.json")
        t = m.get("test_at_operating_threshold", {}); l = m.get("localization_test", {})
        rows.append({"model": md["model_name"], "architecture": md["architecture"]["model"], "input": "+".join(md["input_channels"]), "threshold(val)": md["operating_threshold"],
                     "precision": t.get("precision"), "recall": t.get("recall"), "f1": t.get("f1"), "macro_f1": t.get("macro_f1"), "pr_auc": t.get("pr_auc"), "roc_auc": t.get("roc_auc"),
                     "fp": t.get("fp"), "fn": t.get("fn"), "loc_median_px": l.get("median_euclid_px"), "loc_mean_px": l.get("mean_euclid_px"),
                     "loc_baseline_mean_px": l.get("baseline_predict_train_mean_mean_euclid_px"), "median_geo_km": l.get("median_geo_km"),
                     "synthetic": md["synthetic"], "dataset_version": md["training_dataset_version"], "test_events": len(md["test_event_ids"])})
    df = pd.DataFrame(rows)
    df.to_csv(Path(out_root) / "comparison.csv", index=False)
    with open(Path(out_root) / "comparison.md", "w") as f:
        f.write(("**SYNTHETIC - pipeline check only, not science**\n\n" if len(df) and df.synthetic.all() else "") + df.round(4).to_string(index=False))
    return df
