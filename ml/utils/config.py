"""Config loading, validation and reproducibility helpers."""
import hashlib
import json
import os
import random
from pathlib import Path

import numpy as np
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
SYNTH_TAG = "synthetic_test_only"


class ConfigError(ValueError):
    pass


def load_config(path):
    path = Path(path)
    if not path.is_absolute() and not path.exists():
        path = REPO_ROOT / path
    with open(path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    cfg["_config_path"] = str(path)
    validate_config(cfg)
    return cfg


def validate_config(cfg):
    for key in ("seed", "allow_synthetic", "task", "paths", "ingest", "data", "splits", "model", "train"):
        if key not in cfg:
            raise ConfigError(f"missing config section: {key}")
    names, bins = cfg["task"]["class_names"], cfg["task"]["wind_bins_kt"]
    if len(bins) != len(names) - 1 or list(bins) != sorted(bins):
        raise ConfigError("wind_bins_kt must be ascending and have len(class_names)-1 entries")
    s = cfg["splits"]
    if abs(s["train_frac"] + s["val_frac"] + s["test_frac"] - 1.0) > 1e-6:
        raise ConfigError("split fractions must sum to 1")
    chans = cfg["data"]["channels"]
    if not chans:
        raise ConfigError("data.channels is empty")
    unknown = set(chans) - set(cfg["ingest"]["variables"]["channels"])
    if unknown:
        raise ConfigError(f"data.channels not declared in ingest.variables.channels: {sorted(unknown)}")
    synth = [SYNTH_TAG in str(v).replace("\\", "/") for v in cfg["paths"].values()]
    if cfg["allow_synthetic"] and not all(synth):
        raise ConfigError(f"allow_synthetic=true requires EVERY path to contain '{SYNTH_TAG}'")
    if not cfg["allow_synthetic"] and any(synth):
        raise ConfigError(f"paths containing '{SYNTH_TAG}' are only allowed when allow_synthetic=true")


def resolve_path(cfg, key):
    p = Path(cfg["paths"][key])
    return p if p.is_absolute() else REPO_ROOT / p


def config_hash(cfg):
    clean = {k: v for k, v in cfg.items() if not k.startswith("_")}
    return hashlib.sha256(json.dumps(clean, sort_keys=True, default=str).encode()).hexdigest()[:12]


def seed_everything(seed):
    random.seed(seed)
    np.random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    try:
        import torch
        torch.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
    except ImportError:
        pass
