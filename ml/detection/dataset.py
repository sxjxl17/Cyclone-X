
import json

import numpy as np

from ml.detection import windows as W
from ml.detection.config import det_paths
from ml.detection.geo import GridMapping
from ml.utils.io import read_index, read_json

try:
    from torch.utils.data import Dataset as _Base
except ImportError:
    _Base = object


class DetectionDataset(_Base):
    def __init__(self, cfg, split, channels, train=False):
        P, dc = det_paths(cfg), cfg["detection"]
        idx, splits, stats = read_index(P["index"]), read_json(P["splits"]), read_json(P["stats"])
        self.cfg, self.P, self.train, self.split = cfg, P, train, split
        self.df = idx[idx.group_id.isin(set(splits[split]))].reset_index(drop=True)
        miss = [c for c in channels if c not in stats["channels"]]
        if miss:
            raise ValueError(f"channels {miss} are not present in the processed dataset {stats['channels']}")
        self.channels, ci = list(channels), [stats["channels"].index(c) for c in channels]
        self.ci = ci
        self.mean = np.asarray(stats["mean"], np.float32)[ci][:, None, None]
        self.std = np.maximum(np.asarray(stats["std"], np.float32)[ci], 1e-6)[:, None, None]
        self.win, self.max_shift = int(dc["window_px"]), int(dc["max_shift_px"])
        self.proc_size = cfg["data"]["crop_size"] // cfg["data"]["downsample_factor"]
        self.rot90, self.bsig, self.seed = bool(dc["rot90"]), float(dc["brightness_sigma"]), int(cfg["seed"])
        self.rng = np.random.RandomState(self.seed)

    def __len__(self):
        return len(self.df)

    def eval_origin(self, i):
        return W.window_origin(self.proc_size, self.win, W.deterministic_shift(self.df.obs_id.iloc[i], self.seed, self.max_shift))

    def mapping(self, i):
        g = self.df.geo_json.iloc[i]
        return GridMapping(**json.loads(g)) if isinstance(g, str) and g else None

    def __getitem__(self, i):
        r = self.df.iloc[i]
        x = np.load(self.P["proc"] / r.array_path).astype(np.float32)[self.ci]
        x = np.nan_to_num((x - self.mean) / self.std, nan=0.0)
        if self.train:
            shift = (self.rng.randint(-self.max_shift, self.max_shift + 1), self.rng.randint(-self.max_shift, self.max_shift + 1))
            top, left = W.window_origin(self.proc_size, self.win, shift)
        else:
            top, left = self.eval_origin(i)
        x = np.ascontiguousarray(W.crop(x, top, left, self.win))
        c_rc, mask = None, 0.0
        if r.label == 1 and np.isfinite(r.centre_row):
            rr, cc = r.centre_row - top, r.centre_col - left
            if 0 <= rr <= self.win - 1 and 0 <= cc <= self.win - 1:
                c_rc, mask = (rr, cc), 1.0
        if self.train:
            x, c_rc = W.augment(x, c_rc, self.rng, self.bsig) if self.rot90 else (x, c_rc)
        cx, cy = W.to_norm(*c_rc, self.win) if c_rc is not None else (0.0, 0.0)
        return x.astype(np.float32), np.float32(r.label), np.asarray([cx, cy], np.float32), np.float32(mask), r.obs_id

    def centre_targets(self):
        """Eval-window centre targets (norm x,y) of all localizable positives (used for the mean-centre baseline)."""
        out = []
        for i in range(len(self)):
            r = self.df.iloc[i]
            if r.label == 1 and np.isfinite(r.centre_row):
                top, left = self.eval_origin(i)
                out.append(W.to_norm(r.centre_row - top, r.centre_col - left, self.win))
        return np.asarray(out, float).reshape(-1, 2)
