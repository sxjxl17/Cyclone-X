
import torch
import torch.nn.functional as F


def grad_cam(model, x):
    """x [1,C,H,W] -> (cam [H,W] in 0..1 upsampled, score float). Target = the 'cyclone' logit."""
    model.eval()
    store = {}
    layer = model.target_layer()
    h1 = layer.register_forward_hook(lambda m, i, o: store.__setitem__("a", o))
    try:
        x = x.clone().requires_grad_(True)
        out = model(x)
        logit = out["logit"].sum()
        a = store["a"]
        g = torch.autograd.grad(logit, a)[0]
    finally:
        h1.remove()
    w = g.mean(dim=(2, 3), keepdim=True)
    cam = F.relu((w * a).sum(1, keepdim=True))
    cam = F.interpolate(cam, size=x.shape[-2:], mode="bilinear", align_corners=False)[0, 0].detach()
    cam = (cam - cam.min()) / (cam.max() - cam.min() + 1e-8)
    return cam.cpu().numpy(), float(torch.sigmoid(out["logit"]).item())
