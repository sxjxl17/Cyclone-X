"""Detection config = Step-1 config + a `detection:` section (defaults below). Paths follow the same
synthetic-isolation rule as Step 1."""
import copy

from ml.utils.config import SYNTH_TAG, ConfigError, load_config, resolve_path

DEFAULTS = {
    "mode": "detection",                  # detection | localization_only (positives only; used when no verified negatives exist)
    "window_px": 96,                      # model input window cut from the processed (e.g. 112 px) array
    "max_shift_px": 8,                    # random shift (train) / seeded deterministic shift (val/test) of the window
    "negatives_index": "ml/data/metadata/negatives_index.csv",
    "min_negative_track_dist_km": 1000.0, # a negative must be >= this far from ANY tracked system (recorded per sample)
    "dataset_version": "det-v1",
    "preprocessing_version": "step1-preproc-v1",
    "output_dir": "outputs/detection",
    "loc_loss_weight": 5.0, "brightness_sigma": 0.05, "rot90": True,
    "threshold_policy": {"name": "recall_at_least", "target_recall": 0.95},
    "train": {"epochs": 40, "batch_size": 32, "lr": 3e-4, "weight_decay": 1e-4, "patience": 8,
              "scheduler": "plateau", "num_workers": 0},
    "model": {"widths": [16, 32, 64, 128], "dropout": 0.3},
    "experiments": [
        {"name": "step1_cnn_baseline_ir", "model": "baseline", "channels": ["irwin"]},
        {"name": "detector_ir", "model": "detector", "channels": ["irwin"]},
        {"name": "detector_ir_wv", "model": "detector", "channels": ["irwin", "irwvp"]},
        {"name": "detector_vis_ir_wv", "model": "detector", "channels": ["vis", "irwin", "irwvp"]},
    ],
}


def _merge(a, b):
    out = copy.deepcopy(a)
    for k, v in (b or {}).items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def with_detection(cfg):
    cfg = copy.deepcopy(cfg)
    cfg["detection"] = _merge(DEFAULTS, cfg.get("detection"))
    d = cfg["detection"]
    if d["mode"] not in ("detection", "localization_only"):
        raise ConfigError("detection.mode must be detection|localization_only")
    synth = [SYNTH_TAG in str(d[k]).replace("\\", "/") for k in ("negatives_index", "output_dir")]
    if cfg["allow_synthetic"] != all(synth) or (not cfg["allow_synthetic"] and any(synth)):
        raise ConfigError(f"detection paths must contain '{SYNTH_TAG}' iff allow_synthetic=true")
    return cfg


def load_detection_config(path):
    return with_detection(load_config(path))


def det_paths(cfg):
    proc, sdir = resolve_path(cfg, "processed_dir"), resolve_path(cfg, "splits_dir")
    return {"proc": proc, "index": proc / "detection_index.csv", "manifest": proc / "detection_manifest.json",
            "stats": proc / "detection_norm_stats.json", "splits": sdir / "detection_splits.json"}
