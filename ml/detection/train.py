
import time

import numpy as np
import pandas as pd

from ml.detection import metrics as M
from ml.detection.config import det_paths
from ml.detection.geo import geo_errors_km
from ml.detection.labels import check_detection_leakage
from ml.detection.schema import validate_model_metadata
from ml.utils.config import config_hash, resolve_path, seed_everything
from ml.utils.io import read_index, read_json, write_json


def _predict(model, ds, bs, dev):
    import torch
    from torch.utils.data import DataLoader
    model.eval(); S, C = [], []
    with torch.no_grad():
        for x, _, _, _, _ in DataLoader(ds, batch_size=bs, shuffle=False):
            o = model(x.to(dev)); S += torch.sigmoid(o["logit"]).cpu().tolist()
            if o["centre"] is not None:
                C += o["centre"].cpu().numpy().tolist()
    return np.asarray(S), (np.asarray(C) if C else None)


def _epoch_loss(model, ds, bs, dev, pos_weight, lam):
    import torch
    from torch.utils.data import DataLoader
    model.eval(); tot, n = 0.0, 0
    bce = torch.nn.BCEWithLogitsLoss(pos_weight=torch.tensor(pos_weight, device=dev))
    with torch.no_grad():
        for x, y, c, m, _ in DataLoader(ds, batch_size=bs, shuffle=False):
            x, y, c, m = x.to(dev), y.to(dev), c.to(dev), m.to(dev)
            o = model(x); l = bce(o["logit"], y)
            if o["centre"] is not None and m.sum() > 0:
                l = l + lam * (torch.nn.functional.smooth_l1_loss(o["centre"], c, reduction="none").sum(1) * m).sum() / m.sum()
            tot += l.item() * len(y); n += len(y)
    return tot / max(n, 1)


def run_experiment(cfg, exp, out_root=None):
    import torch
    from torch.utils.data import DataLoader
    from ml.detection.dataset import DetectionDataset
    from ml.models.detector import build_detector

    dc, tc, P = cfg["detection"], cfg["detection"]["train"], det_paths(cfg)
    seed_everything(cfg["seed"])
    idx, splits, stats = read_index(P["index"]), read_json(P["splits"]), read_json(P["stats"])
    check_detection_leakage(idx, splits, stats)                         
    man = read_json(P["manifest"])
    if man["synthetic"] != bool(cfg["allow_synthetic"]):
        raise RuntimeError("detection dataset synthetic status disagrees with config - refusing to train")
    localization_only = dc["mode"] == "localization_only"
    out = (out_root or resolve_path({"paths": {"o": dc["output_dir"]}}, "o")) / exp["name"]
    out.mkdir(parents=True, exist_ok=True)
    ch = exp["channels"]
    tr, va, te = (DetectionDataset(cfg, s, ch, train=(s == "train")) for s in ("train", "val", "test"))
    tr_eval = DetectionDataset(cfg, "train", ch, train=False)
    npos, nneg = int((tr.df.label == 1).sum()), int((tr.df.label == 0).sum())
    pos_weight = float(nneg / npos) if (npos and nneg) else 1.0
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    localize = exp["model"] == "detector"
    mcfg = {**dc["model"]}
    model = build_detector(exp["model"], len(ch), mcfg, localize=localize).to(dev)
    g = torch.Generator().manual_seed(cfg["seed"])
    tl = DataLoader(tr, batch_size=tc["batch_size"], shuffle=True, generator=g, num_workers=tc["num_workers"])
    opt = torch.optim.AdamW(model.parameters(), lr=tc["lr"], weight_decay=tc["weight_decay"])
    sched = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, factor=0.5, patience=3) if tc["scheduler"] == "plateau" else None
    bce = torch.nn.BCEWithLogitsLoss(pos_weight=torch.tensor(pos_weight, device=dev))
    lam, best, bad, hist = dc["loc_loss_weight"], None, 0, []
    bs = tc["batch_size"]
    for ep in range(1, tc["epochs"] + 1):
        model.train(); tot, n = 0.0, 0
        for x, y, c, m, _ in tl:
            x, y, c, m = x.to(dev), y.to(dev), c.to(dev), m.to(dev)
            opt.zero_grad(); o = model(x); loss = bce(o["logit"], y)
            if o["centre"] is not None and m.sum() > 0:
                loss = loss + lam * (torch.nn.functional.smooth_l1_loss(o["centre"], c, reduction="none").sum(1) * m).sum() / m.sum()
            loss.backward(); opt.step(); tot += loss.item() * len(y); n += len(y)
        vloss = _epoch_loss(model, va, bs, dev, pos_weight, lam)
        s, c_ = _predict(model, va, bs, dev)
        yv = va.df.label.values
        if localization_only:
            tgt = va.centre_targets()
            crit = -float(np.median(np.hypot(*((c_ - tgt) * va.win).T))) if (c_ is not None and len(tgt) == len(c_)) else -vloss
        else:
            crit = M.detection_metrics(yv, s, 0.5)["pr_auc"]
            crit = -vloss if crit is None else crit
        if sched:
            sched.step(vloss)
        hist.append({"epoch": ep, "train_loss": tot / n, "val_loss": vloss, "val_selection_metric": crit})
        print(f"[{exp['name']}] ep {ep:03d} train={tot/n:.4f} val={vloss:.4f} sel({'-med_loc_px' if localization_only else 'val PR-AUC'})={crit:.4f}")
        if best is None or (crit, -vloss) > (best[0], -best[1]):
            best, bad = (crit, vloss, ep), 0
            torch.save({"model_state": model.state_dict(), "epoch": ep}, out / "best.pt")
        else:
            bad += 1
            if bad >= tc["patience"]:
                print("early stopping"); break
    write_json(hist, out / "history.json")
    # ---- final evaluation with the BEST (validation-selected) checkpoint ----
    ck = torch.load(out / "best.pt", map_location=dev)
    model.load_state_dict(ck["model_state"]); model.eval()
    results = {"experiment": exp["name"], "synthetic": man["synthetic"], "best_epoch": best[2], "selection_metric": "val PR-AUC" if not localization_only else "val median localization px (lower better)"}
    sv, cv = _predict(model, va, bs, dev); st, ct = _predict(model, te, bs, dev)
    yv, yt = va.df.label.values, te.df.label.values
    thr_info, event_tbl = None, None
    if not localization_only:
        thr_info = M.select_threshold(yv, sv, dc["threshold_policy"]["name"], dc["threshold_policy"]["target_recall"])
        thr = thr_info["threshold"]
        results.update({"threshold_selection(val)": thr_info, "test_at_operating_threshold": M.detection_metrics(yt, st, thr),
                        "test_at_0.5(reference only)": M.detection_metrics(yt, st, 0.5),
                        "val_at_operating_threshold": M.detection_metrics(yv, sv, thr),
                        "val_threshold_sweep": M.threshold_sweep(yv, sv), "test_threshold_sweep(reported, not used for selection)": M.threshold_sweep(yt, st)})
        event_tbl = M.event_level_table(te.df.group_id.values, yt, st, thr)
        event_tbl.to_csv(out / "event_level_test.csv", index=False)
        pd.DataFrame({"obs_id": te.df.obs_id, "group_id": te.df.group_id, "label": yt, "score": st, "pred": (st >= thr).astype(int)}).to_csv(out / "predictions_test.csv", index=False)
        pd.DataFrame({"obs_id": va.df.obs_id, "group_id": va.df.group_id, "label": yv, "score": sv}).to_csv(out / "predictions_val.csv", index=False)
        results["event_level_summary"] = {"n_events_with_positives": int((event_tbl.n_positive_obs > 0).sum()),
                                          "events_detected_at_least_once": int(event_tbl.event_detected_at_least_once.fillna(False).sum()),
                                          "events_fully_missed": int(((event_tbl.n_positive_obs > 0) & (event_tbl.detections == 0)).sum())}
    if ct is not None:
        loc_ok = [(i, r) for i, r in enumerate(te.df.itertuples()) if r.label == 1 and np.isfinite(r.centre_row)]
        sel = [i for i, _ in loc_ok]
        true_xy, pred_xy = [], ct[sel]
        for i in sel:
            r = te.df.iloc[i]; top, left = te.eval_origin(i)
            true_xy.append(np.ravel(__import__("ml.detection.windows", fromlist=["x"]).to_norm(r.centre_row - top, r.centre_col - left, te.win)))
        base = tr_eval.centre_targets().mean(0) if len(tr_eval.centre_targets()) else None
        kms = None
        maps = [te.mapping(i) for i in sel]
        if sel and all(m is not None for m in maps):
            from ml.detection.windows import from_norm
            pr = [from_norm(*p, te.win) for p in pred_xy]; tr_ = [from_norm(*t, te.win) for t in true_xy]
            wm = [m.with_window(*te.eval_origin(i)) for m, i in zip(maps, sel)]
            kms = geo_errors_km(pr, tr_, wm)
        results["localization_test"] = M.localization_metrics(pred_xy, np.asarray(true_xy), te.win, base, kms)
        results["localization_test"]["centre_source_counts"] = te.df[te.df.label == 1].centre_source.value_counts().to_dict()
    # ---- versioning ----
    version = f"{exp['name']}-{dc['dataset_version']}-{config_hash(cfg)[:8]}"
    md = {"model_name": exp["name"], "model_version": version, "experiment": exp, "architecture": {"model": exp["model"], "model_cfg": mcfg, "localize": localize, "window_px": dc["window_px"]},
          "training_dataset_version": dc["dataset_version"], "train_event_ids": splits["train_cyclone_ids"], "val_event_ids": splits["val_cyclone_ids"],
          "test_event_ids": splits["test_cyclone_ids"], "input_channels": ch, "preprocessing_version": dc["preprocessing_version"],
          "preprocessing": {"data": cfg["data"], "norm_mean": [stats["mean"][stats["channels"].index(c)] for c in ch],
                            "norm_std": [stats["std"][stats["channels"].index(c)] for c in ch]},
          "hyperparameters": {**tc, "seed": cfg["seed"], "pos_weight": pos_weight, "loc_loss_weight": lam, "augmentation": ["window_shift", "rot90" if dc["rot90"] else None, f"brightness_offset_sigma={dc['brightness_sigma']}"]},
          "training_date": time.strftime("%Y-%m-%d %H:%M:%S"), "evaluation_metrics": {k: v for k, v in results.items() if k.startswith(("test_at_op", "localization", "event_level"))},
          "checkpoint_path": str(out / "best.pt"), "operating_threshold": None if thr_info is None else thr_info["threshold"],
          "threshold_selection": thr_info, "probability_is_calibrated": False, "synthetic": man["synthetic"],
          "interpretation": "NOT SCIENTIFIC - synthetic fixture" if man["synthetic"] else "single event-wise split; few events => high variance; scores uncalibrated"}
    validate_model_metadata(md)
    write_json(md, out / "model_metadata.json"); write_json(results, out / "metrics.json")
    return results
