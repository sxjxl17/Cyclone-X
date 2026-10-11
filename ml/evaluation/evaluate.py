from ml.evaluation.leakage import run_all_checks
from ml.evaluation.metrics import classification_metrics
from ml.utils.config import config_hash, resolve_path
from ml.utils.io import write_json
from ml.utils.plotting import plot_confusion
 

def evaluate_model(cfg, split="test", checkpoint=None):
    import numpy as np
    import torch
    from torch.utils.data import DataLoader
    from ml.datasets.cyclone_dataset import CycloneDataset
    from ml.models.baseline_cnn import build_model
    from ml.training.trainer import check_dataset_matches_config

    run_all_checks(cfg, fail=True)
    manifest = check_dataset_matches_config(cfg)
    out = resolve_path(cfg, "output_dir")
    ckpt_path = checkpoint or out / "best.pt"
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    try:
        ck = torch.load(ckpt_path, map_location=device, weights_only=False)
    except TypeError:
        ck = torch.load(ckpt_path, map_location=device)
    if ck.get("synthetic") != manifest["is_synthetic"]:
        raise RuntimeError("checkpoint and dataset disagree on synthetic status")
    model = build_model(cfg).to(device); model.load_state_dict(ck["model_state"]); model.eval()
    ds = CycloneDataset(cfg, split)
    yt, yp = [], []
    with torch.no_grad():
        for x, y, _ in DataLoader(ds, batch_size=cfg["train"]["batch_size"], shuffle=False):
            yp += model(x.to(device)).argmax(1).cpu().tolist(); yt += y.tolist()
    names = cfg["task"]["class_names"]
    m = classification_metrics(yt, yp, names)
    m.update({"split": split, "n_events": int(ds.df.event_id.nunique()), "checkpoint_epoch": ck["epoch"],
              "config_hash": config_hash(cfg), "synthetic": bool(manifest["is_synthetic"]),
              "interpretation": ("NOT SCIENTIFICALLY VALID - synthetic test fixture, pipeline check only"
                                 if manifest["is_synthetic"] else
                                 "single event-wise split, no confidence intervals; few events => high variance")})
    write_json(m, out / f"metrics_{split}.json")
    np.save(out / f"confusion_matrix_{split}.npy", np.asarray(m["confusion_matrix"]))
    plot_confusion(m["confusion_matrix"], names, out / f"confusion_matrix_{split}.png", f"{split} confusion matrix")
    return m
