
from pathlib import Path

import numpy as np

from ml.detection import windows as W
from ml.detection.geo import GridMapping
from ml.detection.schema import make_prediction_record
from ml.preprocessing.preprocess import process_observation


def preprocess_raw_channels(channels, cfg):
    """channels: dict name -> 2-D raw array. Returns processed [C,H,W] (un-normalised, kelvin) or raises."""
    arr, why, _ = process_observation(channels, None, cfg, require_label=False)
    if arr is None:
        raise ValueError(f"input rejected by the training preprocessing: {why}")
    return arr


def normalise_and_window(arr, md):
    """arr: processed [C_all,H,W] with the dataset's channel order -> [C_sel,win,win] float32 (centred window)."""
    pre = md["preprocessing"]; all_ch = pre["data"]["channels"]
    x = arr[[all_ch.index(c) for c in md["input_channels"]]]
    mean = np.asarray(pre["norm_mean"], np.float32)[:, None, None]; std = np.maximum(np.asarray(pre["norm_std"], np.float32), 1e-6)[:, None, None]
    x = np.nan_to_num((x - mean) / std, nan=0.0)
    win, proc = md["architecture"]["window_px"], x.shape[-1]
    o = W.centred_origin(proc, win)
    return np.ascontiguousarray(W.crop(x, o, o, win)).astype(np.float32), (o, o)


def run_model(model, dev, x):
    import torch
    with torch.no_grad():
        o = model(torch.from_numpy(x)[None].to(dev))
    score = float(torch.sigmoid(o["logit"])[0].item())
    c = None if o["centre"] is None else o["centre"][0].cpu().numpy().tolist()
    return score, c


def detect_file(path, cfg, model_dir):
    from ml.detection.runtime import load_model_dir
    from ml.preprocessing.readers import get_reader
    model, md, dev = load_model_dir(model_dir)
    path = Path(path); event_id = ts = source = None; mapping = None; synthetic = bool(md["synthetic"])
    if path.suffix == ".npy":      # already a processed-style raw-unit array [C,H,W] in dataset channel order
        arr = np.load(path).astype(np.float32); source = "npy"
        if arr.ndim != 3 or arr.shape[0] != len(md["preprocessing"]["data"]["channels"]):
            raise ValueError(f"expected [C,H,W] with C={len(md['preprocessing']['data']['channels'])}, got {arr.shape}")
    else:
        o = get_reader(cfg).read(path)
        arr = preprocess_raw_channels(o.channels, {**cfg, "data": md["preprocessing"]["data"]})
        event_id, ts, source = o.event_id, o.timestamp.isoformat(), o.source
        ch0 = next(iter(o.channels.values()))
        mapping = GridMapping.from_raw_grid(o.grid, ch0.shape, md["preprocessing"]["data"]["crop_size"], md["preprocessing"]["data"]["downsample_factor"])
    x, (top, left) = normalise_and_window(arr, md)
    score, c = run_model(model, dev, x)
    lat = lon = None
    if c is not None and mapping is not None:
        r, cc = W.from_norm(c[0], c[1], md["architecture"]["window_px"])
        lat, lon = (float(v) for v in mapping.with_window(top, left).pixel_to_geo(r, cc))
    thr = md["operating_threshold"] if md["operating_threshold"] is not None else 0.5
    rec = make_prediction_record(event_id, ts, source, score, thr, c, md["architecture"]["window_px"], lat, lon, md["model_version"], synthetic)
    rec["score_note"] = "uncalibrated model score, not a calibrated probability"
    return rec, x, md
