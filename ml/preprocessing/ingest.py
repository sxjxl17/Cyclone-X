"""Validate raw files and build the observation metadata table (nothing is dropped silently)."""
import pandas as pd

from ml.preprocessing.readers import IngestError, get_reader
from ml.preprocessing.schema import OBS_COLUMNS
from ml.utils.config import resolve_path
from ml.utils.io import sha256_file, write_json
from ml.utils.progress import progress


def ingest(cfg):
    raw_dir, meta_dir = resolve_path(cfg, "raw_dir"), resolve_path(cfg, "metadata_dir")
    if not raw_dir.exists():
        raise FileNotFoundError(f"{raw_dir} does not exist. See docs/DATA_ACCESS.md for how to obtain the data.")
    files = sorted(p for p in raw_dir.glob(cfg["ingest"]["file_glob"]) if p.is_file())
    if not files:
        raise FileNotFoundError(f"No files matching {cfg['ingest']['file_glob']} in {raw_dir}. See docs/DATA_ACCESS.md.")
    reader = get_reader(cfg)
    rows, seen_sha, seen_key = [], {}, {}
    for p in progress(files, desc="ingest"):
        rel = p.relative_to(raw_dir).as_posix()
        row = {c: None for c in OBS_COLUMNS}
        row.update(file_path=rel, file_size_bytes=p.stat().st_size, status="ok", reject_reason="", synthetic=False)
        sha = sha256_file(p)
        row["file_sha256"] = sha
        if sha in seen_sha:
            row.update(status="duplicate_file", reject_reason=f"identical to {seen_sha[sha]}")
            rows.append(row); continue
        seen_sha[sha] = rel
        try:
            obs = reader.read(p)
        except IngestError as e:
            row.update(status="rejected", reject_reason=str(e)); rows.append(row); continue
        key = (obs.event_id, obs.timestamp.isoformat())
        h, w = next(iter(obs.channels.values())).shape
        row.update(source=obs.source, event_id=obs.event_id, cyclone_name=obs.name, basin=obs.basin,
                   timestamp_utc=obs.timestamp.isoformat(), lat=obs.lat, lon=obs.lon,
                   wind_kt=obs.wind_kt, pressure_hpa=obs.pressure_hpa,
                   channels_present="|".join(sorted(obs.channels)), height=h, width=w,
                   resolution_km=obs.resolution_km, units_json=str(obs.units), synthetic=obs.synthetic,
                   notes=" ; ".join(obs.notes))
        if key in seen_key:
            row.update(status="duplicate_event_time", reject_reason=f"same event+time as {seen_key[key]}")
        else:
            seen_key[key] = rel
        rows.append(row)
    df = pd.DataFrame(rows, columns=OBS_COLUMNS)
    ok = df[df.status == "ok"]
    if ok.synthetic.any() and not ok.synthetic.all():
        raise RuntimeError("real and synthetic observations are mixed - refusing")
    meta_dir.mkdir(parents=True, exist_ok=True)
    df.to_csv(meta_dir / "observations.csv", index=False)
    report = {
        "n_files": len(files), "status_counts": df.status.value_counts().to_dict(),
        "reject_reasons": df[df.status != "ok"].reject_reason.value_counts().to_dict(),
        "n_ok": int(len(ok)), "n_events_ok": int(ok.event_id.nunique()),
        "time_range": [ok.timestamp_utc.min(), ok.timestamp_utc.max()] if len(ok) else None,
        "is_synthetic": bool(len(ok) and ok.synthetic.all()),
        "missing_label_wind": int(ok.wind_kt.isna().sum()),
    }
    write_json(report, meta_dir / "ingest_report.json")
    return df, report
