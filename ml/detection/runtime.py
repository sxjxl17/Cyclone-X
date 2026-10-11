"""Model (re)loading shared by evaluation, error analysis and inference."""
from pathlib import Path

import torch

from ml.models.detector import build_detector
from ml.utils.io import read_json


def device():
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_checkpoint(path, dev):
    try:
        return torch.load(path, map_location=dev, weights_only=False)
    except TypeError:
        return torch.load(path, map_location=dev)


def load_model_dir(model_dir):
    """model_dir contains best.pt + model_metadata.json -> (model.eval(), metadata, device)."""
    model_dir = Path(model_dir)
    md = read_json(model_dir / "model_metadata.json")
    dev = device()
    ck = load_checkpoint(model_dir / "best.pt", dev)
    a = md["architecture"]
    model = build_detector(a["model"], len(md["input_channels"]), a["model_cfg"], localize=a["localize"]).to(dev)
    model.load_state_dict(ck["model_state"]); model.eval()
    return model, md, dev
