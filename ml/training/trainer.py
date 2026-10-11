import time

import numpy as np

from ml.evaluation.leakage import run_all_checks
from ml.evaluation.metrics import classification_metrics
from ml.utils.config import config_hash, resolve_path, seed_everything
from ml.utils.io import read_json, write_json
from ml.utils.plotting import plot_history


def check_dataset_matches_config(cfg):
    man = read_json(resolve_path(cfg, "processed_dir") / "dataset_manifest.json")
    if man["is_synthetic"] and not cfg["allow_synthetic"]:
        raise RuntimeError("processed data is SYNTHETIC but config is a real-data config - refusing to train")
    if cfg["allow_synthetic"] and not man["is_synthetic"]:
        raise RuntimeError("config allows synthetic but processed data is not synthetic")
    return man


def run_epoch_eval(model, loader, crit, device):
    import torch
    model.eval(); tot, n, yt, yp = 0.0, 0, [], []
    with torch.no_grad():
        for x, y, _ in loader:
            x, y = x.to(device), y.to(device)
            out = model(x)
            tot += crit(out, y).item() * len(y); n += len(y)
            yt += y.cpu().tolist(); yp += out.argmax(1).cpu().tolist()
    return tot / max(n, 1), yt, yp


def train_model(cfg):
    import torch
    from torch.utils.data import DataLoader
    from ml.datasets.cyclone_dataset import CycloneDataset
    from ml.models.baseline_cnn import build_model

    seed_everything(cfg["seed"])
    report = run_all_checks(cfg, fail=True)  
    manifest = check_dataset_matches_config(cfg)
    out = resolve_path(cfg, "output_dir"); out.mkdir(parents=True, exist_ok=True)
    t = cfg["train"]; names = cfg["task"]["class_names"]
    train_ds = CycloneDataset(cfg, "train", augment=t["augment_rot90"])
    val_ds = CycloneDataset(cfg, "val")
    g = torch.Generator().manual_seed(cfg["seed"])
    tl = DataLoader(train_ds, batch_size=t["batch_size"], shuffle=True, generator=g, num_workers=t["num_workers"])
    vl = DataLoader(val_ds, batch_size=t["batch_size"], shuffle=False, num_workers=t["num_workers"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = build_model(cfg).to(device)
    counts = train_ds.class_counts().astype(np.float64)
    w = np.where(counts > 0, counts.sum() / (len(counts) * np.maximum(counts, 1)), 0.0)
    crit = torch.nn.CrossEntropyLoss(weight=torch.tensor(w, dtype=torch.float32, device=device))
    opt = torch.optim.AdamW(model.parameters(), lr=t["lr"], weight_decay=t["weight_decay"])
    best, bad, history = (-1.0, 1e9), 0, []
    for epoch in range(1, t["epochs"] + 1):
        model.train(); tot, n = 0.0, 0
        for x, y, _ in tl:
            x, y = x.to(device), y.to(device)
            opt.zero_grad(); loss = crit(model(x), y); loss.backward(); opt.step()
            tot += loss.item() * len(y); n += len(y)
        vloss, yt, yp = run_epoch_eval(model, vl, crit, device)
        m = classification_metrics(yt, yp, names)
        history.append({"epoch": epoch, "train_loss": tot / n, "val_loss": vloss,
                        "val_macro_f1": m["macro_f1"], "val_accuracy": m["accuracy"]})
        print(f"epoch {epoch:03d} train_loss={tot/n:.4f} val_loss={vloss:.4f} val_macroF1={m['macro_f1']:.4f}")
        score = (m["macro_f1"], -vloss)
        if score > (best[0], -best[1]):
            best, bad = (m["macro_f1"], vloss), 0
            torch.save({"model_state": model.state_dict(), "class_names": names, "epoch": epoch,
                        "val_macro_f1": m["macro_f1"], "config_hash": config_hash(cfg),
                        "synthetic": bool(manifest["is_synthetic"]), "channels": cfg["data"]["channels"]},
                       out / "best.pt")
        else:
            bad += 1
            if bad >= t["early_stopping_patience"]:
                print("early stopping"); break
    write_json(history, out / "history.json")
    plot_history(history, out)
    write_json({"config_hash": config_hash(cfg), "seed": cfg["seed"], "device": str(device),
                "torch": torch.__version__, "synthetic": bool(manifest["is_synthetic"]),
                "n_train": len(train_ds), "n_val": len(val_ds), "best_val_macro_f1": best[0],
                "leakage_report": report, "finished": time.strftime("%Y-%m-%d %H:%M:%S")}, out / "run_info.json")
    return history
