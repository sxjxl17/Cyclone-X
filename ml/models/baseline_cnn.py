import torch.nn as nn


def _block(i, o):
    return nn.Sequential(
        nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True),
        nn.Conv2d(o, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True),
        nn.MaxPool2d(2))


class BaselineCNN(nn.Module):
    """[conv-BN-ReLU x2 -> maxpool] x4 -> global avg pool -> dropout -> linear."""

    def __init__(self, in_channels, num_classes, widths=(16, 32, 64, 128), dropout=0.3):
        super().__init__()
        layers, c = [], in_channels
        for w in widths:
            layers.append(_block(c, w)); c = w
        self.features = nn.Sequential(*layers)
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.head = nn.Sequential(nn.Flatten(), nn.Dropout(dropout), nn.Linear(c, num_classes))

    def forward(self, x):
        return self.head(self.pool(self.features(x)))


def build_model(cfg):
    m = cfg["model"]
    if m["name"] != "baseline_cnn":
        raise ValueError(f"unknown model {m['name']}")
    return BaselineCNN(len(cfg["data"]["channels"]), len(cfg["task"]["class_names"]),
                       tuple(m["widths"]), m["dropout"])
