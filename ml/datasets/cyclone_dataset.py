"""Per-observation classification dataset. Normalisation uses TRAIN-only statistics."""
import numpy as np

from ml.utils.config import resolve_path
from ml.utils.io import read_index, read_json

try:
    from torch.utils.data import Dataset as _Base
except ImportError:  # keeps non-torch tooling/tests importable
    _Base = object


class CycloneDataset(_Base):
    def __init__(self, cfg, split, augment=False):
        self.proc = resolve_path(cfg, "processed_dir")
        splits = read_json(resolve_path(cfg, "splits_dir") / "event_splits.json")
        stats = read_json(self.proc / "normalization_stats.json")
        idx = read_index(self.proc / "processed_index.csv")
        self.df = idx[idx.event_id.isin(set(splits[split]))].reset_index(drop=True)
        self.mean = np.asarray(stats["mean"], np.float32)[:, None, None]
        self.std = np.maximum(np.asarray(stats["std"], np.float32), 1e-6)[:, None, None]
        self.augment, self.rng = augment, np.random.RandomState(cfg["seed"])
        self.num_classes = len(cfg["task"]["class_names"])
        self.in_channels = len(cfg["data"]["channels"])

    def __len__(self):
        return len(self.df)

    def __getitem__(self, i):
        r = self.df.iloc[i]
        x = np.load(self.proc / r.array_path).astype(np.float32)
        x = (x - self.mean) / self.std
        x = np.nan_to_num(x, nan=0.0)  # NaN -> train mean (0 after normalisation); documented
        if self.augment:  # 90-degree rotations only: flips would reverse the cyclonic sense
            x = np.ascontiguousarray(np.rot90(x, self.rng.randint(4), axes=(1, 2)))
        return x, int(r.class_idx), r.obs_id

    def class_counts(self):
        return np.bincount(self.df.class_idx.values, minlength=self.num_classes)
