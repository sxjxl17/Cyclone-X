"""Standard observation / event metadata schema and label definition."""
import numpy as np

OBS_COLUMNS = [
    "source", "event_id", "cyclone_name", "basin", "timestamp_utc", "lat", "lon",
    "wind_kt", "pressure_hpa", "channels_present", "height", "width", "resolution_km",
    "units_json", "file_path", "file_size_bytes", "file_sha256", "synthetic",
    "status", "reject_reason", "notes",
]


def wind_to_class(wind_kt, bins):
    """Class index from max sustained wind (kt). bins ascending: x<bins[0] -> 0.
    Returns -1 when the wind value is missing (we never fabricate a label)."""
    if wind_kt is None or not np.isfinite(wind_kt):
        return -1
    return int(np.digitize([wind_kt], bins)[0])
