
import hashlib

import numpy as np


def to_norm(row, col, win):
    return (np.asarray(col, float) + 0.5) / win, (np.asarray(row, float) + 0.5) / win   # (x, y)


def from_norm(x, y, win):
    return np.asarray(y, float) * win - 0.5, np.asarray(x, float) * win - 0.5            # (row, col)


def centred_origin(proc_size, win):
    return (proc_size - win) // 2


def deterministic_shift(obs_id, seed, max_shift):
    """Seeded per-observation shift (dy, dx) in [-max_shift, max_shift]; identical on every call."""
    h = int(hashlib.sha256(f"{seed}:{obs_id}".encode()).hexdigest(), 16)
    span = 2 * max_shift + 1
    return (h % span) - max_shift, ((h // span) % span) - max_shift


def window_origin(proc_size, win, shift):
    o = centred_origin(proc_size, win)
    top, left = o + shift[0], o + shift[1]
    if top < 0 or left < 0 or top + win > proc_size or left + win > proc_size:
        raise ValueError("window shift leaves the processed image")
    return top, left


def crop(x, top, left, win):
    return x[..., top:top + win, left:left + win]


def rot90_rc(row, col, k, win):
    """Where pixel (row, col) lands after np.rot90(x, k, axes=(-2,-1)) on a win x win image."""
    r, c = float(row), float(col)
    for _ in range(k % 4):
        r, c = (win - 1) - c, r
    return r, c


def augment(x, centre_rc, rng, brightness_sigma=0.05):
    """x [C,win,win] normalised; centre_rc (row,col) in window px or None (negatives)."""
    k = int(rng.randint(4))
    x = np.ascontiguousarray(np.rot90(x, k, axes=(1, 2)))
    if centre_rc is not None:
        centre_rc = rot90_rc(centre_rc[0], centre_rc[1], k, x.shape[-1])
    if brightness_sigma:
        x = x + rng.normal(0.0, brightness_sigma, size=(x.shape[0], 1, 1)).astype(x.dtype)
    return x, centre_rc
