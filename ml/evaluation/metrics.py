import numpy as np


def classification_metrics(y_true, y_pred, class_names):
    from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
    labels = list(range(len(class_names)))
    y_true, y_pred = np.asarray(y_true), np.asarray(y_pred)
    p, r, f, s = precision_recall_fscore_support(y_true, y_pred, labels=labels, zero_division=0)
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    present = s > 0
    mean = lambda v: float(v[present].mean()) if present.any() else 0.0
    return {
        "n_samples": int(len(y_true)),
        "accuracy": float(accuracy_score(y_true, y_pred)) if len(y_true) else None,
        "macro_f1": mean(f), "macro_precision": mean(p), "macro_recall": mean(r),
        "macro_note": "macro averages use only classes with support>0 in y_true",
        "classes_without_support": [n for n, k in zip(class_names, present) if not k],
        "per_class": {n: {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]), "support": int(s[i])}
                      for i, n in enumerate(class_names)},
        "labels": list(class_names), "confusion_matrix": cm.tolist(),
    }
 
