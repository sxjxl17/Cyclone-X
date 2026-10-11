"""Detection (+ localization) CNNs. Trained FROM SCRATCH on purpose: ImageNet-pretrained RGB filters do not map to
1-3 aligned brightness-temperature channels, and with few cyclone events a large backbone mainly overfits.
Channel count is a constructor argument, so IR-only / IR+WV / VIS+IR+WV models are the same code.
Output of forward(): {"logit": [B], "centre": [B,2] (x,y normalised to the input window) or None}."""
import torch
import torch.nn as nn
import torch.nn.functional as F

from ml.models.baseline_cnn import BaselineCNN, _block


class DetectorNet(nn.Module):
    """3 pooling stages (stride 8) so a spatial map survives; localization = soft-argmax of a 1-channel heat map
    (translation-equivariant, differentiable); detection = avg+max pooled features -> linear."""

    def __init__(self, in_channels, widths=(16, 32, 64, 128), dropout=0.3, localize=True):
        super().__init__()
        blocks, c = [], in_channels
        for i, w in enumerate(widths):
            blk = _block(c, w)
            if i == len(widths) - 1:
                blk = nn.Sequential(*list(blk.children())[:-1])   # drop final maxpool -> stride 2**(len-1)
            blocks.append(blk); c = w
        self.features = nn.Sequential(*blocks)
        self.drop = nn.Dropout(dropout)
        self.cls = nn.Linear(2 * c, 1)
        self.heat = nn.Conv2d(c, 1, 1) if localize else None

    def target_layer(self):
        return self.features[-1]

    def forward(self, x):
        f = self.features(x)
        pooled = torch.cat([F.adaptive_avg_pool2d(f, 1).flatten(1), F.adaptive_max_pool2d(f, 1).flatten(1)], 1)
        logit = self.cls(self.drop(pooled)).squeeze(1)
        centre = None
        if self.heat is not None:
            B, _, H, W = f.shape
            p = F.softmax(self.heat(f).flatten(1), dim=1).view(B, 1, H, W)
            xs = (torch.arange(W, device=x.device, dtype=x.dtype) + 0.5) / W
            ys = (torch.arange(H, device=x.device, dtype=x.dtype) + 0.5) / H
            centre = torch.stack([(p.sum(2) * xs).sum(-1).squeeze(1), (p.sum(3) * ys).sum(-1).squeeze(1)], 1)
        return {"logit": logit, "centre": centre}


class BaselineBinary(nn.Module):
    """Step-1 BaselineCNN architecture with a single-logit head (classification only; the Step-1 baseline reference)."""

    def __init__(self, in_channels, widths=(16, 32, 64, 128), dropout=0.3):
        super().__init__()
        self.net = BaselineCNN(in_channels, 1, tuple(widths), dropout)
        self.features = self.net.features

    def target_layer(self):
        return self.net.features[-1]

    def forward(self, x):
        return {"logit": self.net(x).squeeze(1), "centre": None}


def build_detector(name, in_channels, model_cfg, localize=True):
    if name == "detector":
        return DetectorNet(in_channels, tuple(model_cfg["widths"]), model_cfg["dropout"], localize)
    if name == "baseline":
        return BaselineBinary(in_channels, tuple(model_cfg["widths"]), model_cfg["dropout"])
    raise ValueError(f"unknown detector model {name}")
