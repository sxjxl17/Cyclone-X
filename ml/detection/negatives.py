"""Negative (no-cyclone) sample eligibility. We never invent negatives: a candidate window is accepted ONLY
if a real best-track table proves no tracked system (ANY intensity, incl. depressions/disturbances listed in the
track source) is within `min_dist_km` of the whole window within +-`time_window_h`. No track table => refuse."""
import numpy as np
import pandas as pd

from ml.detection.geo import haversine_km

REQUIRED_TRACK_COLS = ("timestamp_utc", "lat", "lon")


class NegativeError(RuntimeError):
    pass


def load_tracks(df):
    if df is None or len(df) == 0:
        raise NegativeError("no best-track table supplied: negatives cannot be verified, refusing to create any")
    miss = [c for c in REQUIRED_TRACK_COLS if c not in df.columns]
    if miss:
        raise NegativeError(f"track table missing columns {miss}")
    t = df.copy()
    t["t"] = pd.to_datetime(t.timestamp_utc, utc=True, format="ISO8601")
    return t.reset_index(drop=True)


def min_track_distance_km(lat, lon, when, tracks, time_window_h):
    """Distance (km) from (lat, lon) to the nearest track fix within +-time_window_h of `when`; inf if none."""
    when = pd.Timestamp(when)
    when = when.tz_localize("UTC") if when.tzinfo is None else when.tz_convert("UTC")
    near = tracks[(tracks.t - when).abs() <= pd.Timedelta(hours=time_window_h)]
    if near.empty:
        return float("inf")
    return float(np.min(haversine_km(lat, lon, near.lat.values, near.lon.values)))


def window_is_negative(centre_lat, centre_lon, when, tracks, min_dist_km, time_window_h, window_radius_km=0.0):
    """True only if the nearest tracked system is farther than min_dist_km + window_radius_km."""
    d = min_track_distance_km(centre_lat, centre_lon, when, tracks, time_window_h)
    return d >= (min_dist_km + window_radius_km), d


def sample_negative_centres(lat_axis, lon_axis, when, tracks, n, rng, min_dist_km=1000.0, time_window_h=24.0,
                            window_radius_km=0.0, max_tries=2000):
    """Random window centres inside a scene (axes in degrees) that pass the track-exclusion test.
    Returns list of dicts(lat, lon, min_track_dist_km); may return fewer than n (never relaxes the rule)."""
    out, tries = [], 0
    while len(out) < n and tries < max_tries:
        tries += 1
        la, lo = float(rng.choice(lat_axis)), float(rng.choice(lon_axis))
        ok, d = window_is_negative(la, lo, when, tracks, min_dist_km, time_window_h, window_radius_km)
        if ok:
            out.append({"lat": la, "lon": lo, "min_track_dist_km": d})
    return out
