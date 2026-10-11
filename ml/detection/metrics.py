
import numpy as np
import pandas as pd


def _safe(f, *a):
    try:
        return float(f(*a))
    except ValueError:
        return None


def detection_metrics(y, score, thr):
    from sklearn.metrics import average_precision_score, f1_score, roc_auc_score
    y = np.asarray(y).astype(int); s = np.asarray(score, float); p = (s >= thr).astype(int)
    tp = int(((p == 1) & (y == 1)).sum()); fp = int(((p == 1) & (y == 0)).sum())
    tn = int(((p == 0) & (y == 0)).sum()); fn = int(((p == 0) & (y == 1)).sum())
    div = lambda a, b: (a / b) if b else None
    prec, rec = div(tp, tp + fp), div(tp, tp + fn)
    both = len(set(y.tolist())) == 2
    return {"threshold": float(thr), "n": int(len(y)), "n_pos": int(y.sum()), "n_neg": int((1 - y).sum()),
            "tp": tp, "fp": fp, "tn": tn, "fn": fn, "precision": prec, "recall": rec,
            "specificity": div(tn, tn + fp), "false_negative_rate": div(fn, tp + fn),
            "false_positive_rate": div(fp, fp + tn),
            "f1": f1_score(y, p, zero_division=0) if len(y) else None,
            "macro_f1": float(f1_score(y, p, average="macro", labels=[0, 1], zero_division=0)) if len(y) else None,
            "accuracy": div(tp + tn, len(y)), "confusion_matrix": [[tn, fp], [fn, tp]],
            "confusion_matrix_layout": "[[TN, FP], [FN, TP]] (rows=true 0/1, cols=pred 0/1)",
            "roc_auc": _safe(roc_auc_score, y, s) if both else None,
            "pr_auc": _safe(average_precision_score, y, s) if both else None,
            "pr_auc_chance_level": float(y.mean()) if len(y) else None}


def threshold_sweep(y, score, thresholds=None):
    th = np.round(np.arange(0.05, 0.951, 0.05), 2) if thresholds is None else thresholds
    rows = []
    for t in th:
        m = detection_metrics(y, score, t)
        rows.append({k: m[k] for k in ("threshold", "precision", "recall", "f1", "tp", "fp", "fn", "tn")})
    return rows


def select_threshold(y_val, s_val, policy="recall_at_least", target_recall=0.95, beta=2.0):
    """Chosen on VALIDATION only. policy recall_at_least: highest-precision threshold with recall>=target
    (missing a developing system is costlier than an extra candidate); if infeasible, falls back to best F-beta."""
    y = np.asarray(y_val).astype(int); s = np.asarray(s_val, float)
    if len(set(y.tolist())) < 2:
        raise ValueError("validation set must contain both classes to select a threshold")
    cands = np.unique(s)
    best, fb_best = None, None
    for t in cands:
        p = s >= t
        tp, fp, fn = int((p & (y == 1)).sum()), int((p & (y == 0)).sum()), int((~p & (y == 1)).sum())
        prec = tp / (tp + fp) if tp + fp else 0.0; rec = tp / (tp + fn) if tp + fn else 0.0
        fbeta = (1 + beta ** 2) * prec * rec / (beta ** 2 * prec + rec) if (prec + rec) else 0.0
        if rec >= target_recall and (best is None or (prec, t) > (best[0], best[1])):
            best = (prec, float(t), rec)
        if fb_best is None or fbeta > fb_best[0]:
            fb_best = (fbeta, float(t), prec, rec)
    if policy == "recall_at_least" and best is not None:
        return {"threshold": best[1], "policy": policy, "target_recall": target_recall, "target_met": True,
                "val_precision": best[0], "val_recall": best[2]}
    return {"threshold": fb_best[1], "policy": f"f{beta:g}_fallback", "target_recall": target_recall,
            "target_met": False, "val_precision": fb_best[2], "val_recall": fb_best[3]}


def event_level_table(group_ids, y, score, thr):
    df = pd.DataFrame({"group_id": group_ids, "y": np.asarray(y).astype(int), "score": np.asarray(score, float)})
    df["pred"] = (df.score >= thr).astype(int)
    rows = []
    for g, d in df.groupby("group_id", sort=True):
        tp = int(((d.pred == 1) & (d.y == 1)).sum()); fn = int(((d.pred == 0) & (d.y == 1)).sum())
        fp = int(((d.pred == 1) & (d.y == 0)).sum()); tn = int(((d.pred == 0) & (d.y == 0)).sum())
        rows.append({"group_id": g, "n_obs": len(d), "n_positive_obs": int(d.y.sum()), "n_negative_obs": int((1 - d.y).sum()),
                     "detections": tp, "missed_detections": fn, "false_detections": fp, "true_negatives": tn,
                     "recall": tp / (tp + fn) if tp + fn else None, "precision": tp / (tp + fp) if tp + fp else None,
                     "event_detected_at_least_once": bool(tp > 0) if (tp + fn) else None})
    return pd.DataFrame(rows)


def localization_metrics(pred_xy, true_xy, win_px, baseline_xy=None, km_errors=None):
    """pred/true: [N,2] normalised (x,y) in the model window; positives only. Errors reported in window pixels
    (IMAGE coordinates). km_errors (great-circle) is passed only when a real GridMapping existed."""
    p, t = np.asarray(pred_xy, float), np.asarray(true_xy, float)
    if len(p) == 0:
        return {"n": 0, "note": "no positive samples"}
    d = (p - t) * win_px
    e = np.hypot(d[:, 0], d[:, 1])
    out = {"n": int(len(p)), "unit": "pixels in the model input window (IMAGE coordinates, not geographic)",
           "window_px": int(win_px), "mean_abs_x_px": float(np.abs(d[:, 0]).mean()), "mean_abs_y_px": float(np.abs(d[:, 1]).mean()),
           "mean_euclid_px": float(e.mean()), "median_euclid_px": float(np.median(e)), "p90_euclid_px": float(np.percentile(e, 90)),
           "mean_euclid_norm": float(e.mean() / win_px)}
    if baseline_xy is not None:
        b = (np.asarray(baseline_xy, float)[None, :] - t) * win_px
        be = np.hypot(b[:, 0], b[:, 1])
        out.update({"baseline_predict_train_mean_mean_euclid_px": float(be.mean()),
                    "baseline_predict_train_mean_median_euclid_px": float(np.median(be))})
    if km_errors is not None:
        k = np.asarray(km_errors, float)
        out.update({"geo_available": True, "mean_geo_km": float(k.mean()), "median_geo_km": float(np.median(k)),
                    "p90_geo_km": float(np.percentile(k, 90))})
    else:
        out["geo_available"] = False
        out["geo_note"] = "no verified raw-grid geolocation for these samples: geographic error NOT reported"
    return out
