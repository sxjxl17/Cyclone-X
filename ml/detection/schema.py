"""Standard prediction record + model metadata. Scores are raw sigmoid model scores, NOT calibrated confidence."""
import time

PRED_KEYS = ("event_id", "timestamp", "source", "prediction", "probability", "probability_is_calibrated",
             "threshold", "location", "location_image", "model_version", "created_at")


def utc_now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def make_prediction_record(event_id, timestamp, source, score, threshold, centre_xy_norm=None, win_px=None,
                           lat=None, lon=None, model_version="", synthetic=False):
    if not (0.0 <= float(score) <= 1.0):
        raise ValueError("score must be in [0,1]")
    is_cyc = bool(float(score) >= float(threshold))
    loc_img = None
    if centre_xy_norm is not None and is_cyc:
        x, y = (float(v) for v in centre_xy_norm)
        loc_img = {"x_norm": x, "y_norm": y, "x_px": x * win_px - 0.5 if win_px else None,
                   "y_px": y * win_px - 0.5 if win_px else None, "window_px": win_px}
    loc = {"latitude": None if lat is None else float(lat), "longitude": None if lon is None else float(lon)}
    rec = {"event_id": event_id, "timestamp": None if timestamp is None else str(timestamp), "source": source,
           "prediction": "cyclone" if is_cyc else "no_cyclone", "probability": float(score),
           "probability_is_calibrated": False, "threshold": float(threshold),
           "location": loc if (is_cyc and lat is not None) else {"latitude": None, "longitude": None},
           "location_image": loc_img, "model_version": model_version, "created_at": utc_now()}
    if synthetic:
        rec["synthetic"] = True
    validate_prediction_record(rec)
    return rec


def validate_prediction_record(rec):
    missing = [k for k in PRED_KEYS if k not in rec]
    if missing:
        raise ValueError(f"prediction record missing keys: {missing}")
    if rec["prediction"] not in ("cyclone", "no_cyclone"):
        raise ValueError("prediction must be 'cyclone' or 'no_cyclone'")
    if not isinstance(rec["probability"], float) or not 0 <= rec["probability"] <= 1:
        raise ValueError("probability must be a float in [0,1]")
    if rec["probability_is_calibrated"] is not False:
        raise ValueError("probabilities are uncalibrated model scores; probability_is_calibrated must be False")
    if set(rec["location"]) != {"latitude", "longitude"}:
        raise ValueError("location must have exactly latitude/longitude")
    if rec["prediction"] == "no_cyclone" and (rec["location"]["latitude"] is not None or rec["location_image"] is not None):
        raise ValueError("no_cyclone prediction must not carry a location")
    return True


METADATA_KEYS = ("model_name", "model_version", "experiment", "architecture", "training_dataset_version", "train_event_ids",
                 "val_event_ids", "test_event_ids", "input_channels", "preprocessing_version", "hyperparameters",
                 "training_date", "evaluation_metrics", "checkpoint_path", "operating_threshold", "synthetic")


def validate_model_metadata(md):
    missing = [k for k in METADATA_KEYS if k not in md]
    if missing:
        raise ValueError(f"model metadata missing keys: {missing}")
    return True
