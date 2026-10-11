
from dataclasses import dataclass, asdict

import numpy as np

EARTH_R_KM = 6371.0088


def wrap_lon_diff(d):
    return (np.asarray(d, float) + 180.0) % 360.0 - 180.0


def wrap_lon(lon):
    return (np.asarray(lon, float) + 180.0) % 360.0 - 180.0


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp, dl = p2 - p1, np.radians(wrap_lon_diff(np.asarray(lon2, float) - np.asarray(lon1, float)))
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * EARTH_R_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


@dataclass
class GridMapping:
    """Regular lat/lon raw grid -> centre crop -> block-mean downsample -> model window.
    Pixel-centre convention: integer index p is the CENTRE of pixel p.
      raw_index = crop_off + factor*(proc_index + win_off) + (factor-1)/2
    lat = lat0 + raw_row*dlat_row ; lon = lon0 + raw_col*dlon_col (equirectangular; fine for ~15 deg windows)."""
    lat0: float
    lon0: float
    dlat_row: float
    dlon_col: float
    crop_top: int = 0
    crop_left: int = 0
    factor: int = 1
    win_top: int = 0
    win_left: int = 0

    def _raw(self, row, col):
        f = self.factor
        return (self.crop_top + f * (np.asarray(row, float) + self.win_top) + (f - 1) / 2.0,
                self.crop_left + f * (np.asarray(col, float) + self.win_left) + (f - 1) / 2.0)

    def pixel_to_geo(self, row, col):
        r, c = self._raw(row, col)
        return self.lat0 + r * self.dlat_row, wrap_lon(self.lon0 + c * self.dlon_col)

    def geo_to_pixel(self, lat, lon):
        f = self.factor
        r = (np.asarray(lat, float) - self.lat0) / self.dlat_row
        c = wrap_lon_diff(np.asarray(lon, float) - self.lon0) / self.dlon_col
        return ((r - self.crop_top - (f - 1) / 2.0) / f - self.win_top,
                (c - self.crop_left - (f - 1) / 2.0) / f - self.win_left)

    def with_window(self, top, left):
        d = asdict(self); d["win_top"], d["win_left"] = int(top), int(left)
        return GridMapping(**d)

    def km_per_pixel(self, lat=None):
        lat = self.lat0 if lat is None else lat
        return float(self.factor * np.hypot(abs(self.dlat_row) * 111.19,
                                            abs(self.dlon_col) * 111.19 * np.cos(np.radians(lat))) / np.sqrt(2))

    @classmethod
    def from_raw_grid(cls, grid, raw_shape, crop_size, factor):
        """grid = RawObservation.grid dict (None -> returns None: geolocation unavailable)."""
        if not grid:
            return None
        h, w = raw_shape
        return cls(grid["lat0"], grid["lon0"], grid["dlat_row"], grid["dlon_col"],
                   (h - crop_size) // 2, (w - crop_size) // 2, int(factor))


def geo_errors_km(pred_rc, true_rc, mappings):
    """Great-circle error per sample. mappings: list of GridMapping (one per sample, window-aware).
    Returns None if any mapping is missing (we never report geographic error without a real mapping)."""
    if any(m is None for m in mappings):
        return None
    out = []
    for (pr, pc), (tr, tc), m in zip(pred_rc, true_rc, mappings):
        la1, lo1 = m.pixel_to_geo(pr, pc); la2, lo2 = m.pixel_to_geo(tr, tc)
        out.append(float(haversine_km(la1, lo1, la2, lo2)))
    return np.asarray(out)
