"""Readers that turn one raw file into a RawObservation.

NetCDFReader  - real HURSAT-B1 style netCDF (variable names are CONFIG-DRIVEN and must be
                verified with scripts/inspect_netcdf.py; nothing is silently guessed).
NPZFixtureReader - TEST ONLY synthetic fixture; refused unless allow_synthetic=true.
"""
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

MS_TO_KT = 1.943844


class IngestError(Exception):
    """A file could not be turned into a trustworthy observation."""


@dataclass
class RawObservation:
    source: str
    event_id: str
    name: str
    basin: str
    timestamp: pd.Timestamp
    lat: float
    lon: float
    wind_kt: float
    pressure_hpa: float
    channels: dict
    units: dict
    resolution_km: float
    synthetic: bool = False
    notes: list = field(default_factory=list)
    grid: dict = None  # optional {lat0, lon0, dlat_row, dlon_col, shape}: raw-grid geolocation (None if unknown)


def _scalar(ds, names):
    for n in names:
        if n in ds.variables:
            v = np.ravel(ds[n].values)
            if v.size and np.isfinite(v[0]):
                return float(v[0]), n, ds[n].attrs.get("units")
        elif n in ds.attrs:
            try:
                return float(ds.attrs[n]), n, None
            except (TypeError, ValueError):
                pass
    return None, None, None


class NetCDFReader:
    def __init__(self, cfg):
        self.cfg = cfg
        self.icfg = cfg["ingest"]

    def read(self, path):
        try:
            import xarray as xr
        except ImportError as e:
            raise RuntimeError("xarray + netCDF4 are required to read real data (pip install -r requirements.txt)") from e
        path = Path(path)
        try:
            ds = xr.open_dataset(path)
        except Exception as e:  # corrupted / not netCDF
            raise IngestError(f"unreadable: {type(e).__name__}: {e}")
        try:
            return self._read(ds, path)
        finally:
            ds.close()

    def _read(self, ds, path):
        ic, notes = self.icfg, []
        m = re.match(ic["event_id_regex"], path.name)
        if not m:
            raise IngestError("event_id_not_parsed_from_filename (edit ingest.event_id_regex after inspecting real filenames)")
        event_id, name = m.group("event_id"), (m.groupdict().get("name") or "")
        # timestamp
        ts = None
        for n in ic["variables"]["time"]:
            if n in ds.variables:
                try:
                    ts = pd.Timestamp(np.ravel(ds[n].values)[0])
                except Exception:
                    ts = None
                break
        if ts is None or pd.isna(ts):
            raise IngestError("timestamp_missing_or_undecodable")
        # storm centre
        lat, lat_n, _ = _scalar(ds, ic["variables"]["storm_lat"])
        lon, lon_n, _ = _scalar(ds, ic["variables"]["storm_lon"])
        if lat is None or lon is None:
            glat, glon = None, None
            for n in ic["variables"]["grid_lat"]:
                if n in ds.variables:
                    v = np.ravel(ds[n].values); glat = float(v[len(v) // 2])
            for n in ic["variables"]["grid_lon"]:
                if n in ds.variables:
                    v = np.ravel(ds[n].values); glon = float(v[len(v) // 2])
            if glat is None or glon is None:
                raise IngestError("storm_location_missing")
            lat, lon = glat, glon
            notes.append("lat/lon = centre of storm-centred grid (documented product property)")
        # labels: wind (unit-checked), pressure
        wind, wind_n, wunit = _scalar(ds, ic["variables"]["wind"])
        if wind is not None:
            u = (str(wunit).lower().replace(" ", "") if wunit else "")
            if u in ("m/s", "ms-1", "ms^-1", "m.s-1"):
                wind *= MS_TO_KT; notes.append("wind converted m/s->kt")
            elif u in ("kt", "kts", "knot", "knots"):
                pass
            elif u == "":
                notes.append(f"wind units absent; ASSUMED {ic['wind_units_assumed']}")
            else:
                raise IngestError(f"wind_units_unrecognised:{wunit}")
        pres, _, _ = _scalar(ds, ic["variables"]["pressure"])
        basin = "unknown"
        for n in ic["variables"].get("basin", []):
            if n in ds.attrs:
                basin = str(ds.attrs[n]); break
        # channels
        chans, units = {}, {}
        for key, cands in ic["variables"]["channels"].items():
            for n in cands:
                if n in ds.variables:
                    a = np.squeeze(ds[n].values).astype(np.float32)
                    if a.ndim == 2:
                        chans[key] = a
                        units[key] = ds[n].attrs.get("units")
                    break
        if not chans:
            raise IngestError("no_configured_channel_found")
        grid = None
        try:  # raw-grid geolocation from 1-D regular lat/lon axes, if the file has them (never guessed)
            la = next((np.ravel(ds[n].values).astype(float) for n in ic["variables"]["grid_lat"] if n in ds.variables), None)
            lo = next((np.ravel(ds[n].values).astype(float) for n in ic["variables"]["grid_lon"] if n in ds.variables), None)
            ch0 = next(iter(chans.values()))
            if la is not None and lo is not None and la.size == ch0.shape[0] and lo.size == ch0.shape[1] and la.size > 1:
                dl, dn = np.diff(la), np.diff(lo)
                dn = (dn + 180.0) % 360.0 - 180.0
                if np.allclose(dl, dl[0], rtol=1e-3, atol=1e-6) and np.allclose(dn, dn[0], rtol=1e-3, atol=1e-6):
                    grid = {"lat0": float(la[0]), "lon0": float(lo[0]), "dlat_row": float(dl[0]),
                            "dlon_col": float(dn[0]), "shape": [int(la.size), int(lo.size)]}
        except Exception:
            grid = None
        return RawObservation("HURSAT-B1", event_id, name, basin, ts, lat, lon,
                              wind if wind is not None else float("nan"),
                              pres if pres is not None else float("nan"),
                              chans, units, float(ic["resolution_km"]), False, notes, grid)


class NPZFixtureReader:
    """TEST ONLY. Reads synthetic fixtures written by scripts/make_synthetic_fixture.py."""

    def __init__(self, cfg):
        if not cfg["allow_synthetic"]:
            raise RuntimeError("synthetic fixtures are refused unless allow_synthetic=true")
        self.cfg = cfg

    def read(self, path):
        try:
            z = np.load(path, allow_pickle=False)
            meta = json.loads(str(z["meta_json"]))
            chans = {k: z[k].astype(np.float32) for k in z.files if k != "meta_json"}
        except Exception as e:
            raise IngestError(f"unreadable: {type(e).__name__}: {e}")
        if meta.get("synthetic") is not True:
            raise IngestError("npz_fixture_not_marked_synthetic")
        return RawObservation("SYNTHETIC_TEST_ONLY", meta["event_id"], meta["name"], meta["basin"],
                              pd.Timestamp(meta["timestamp"]), meta["lat"], meta["lon"],
                              meta["wind_kt"], meta["pressure_hpa"], chans,
                              {k: "K (synthetic)" for k in chans}, 8.0, True,
                              ["SYNTHETIC TEST FIXTURE - NOT REAL DATA"], meta.get("grid"))


def get_reader(cfg):
    r = cfg["ingest"]["reader"]
    if r == "netcdf":
        return NetCDFReader(cfg)
    if r == "npz_fixture":
        return NPZFixtureReader(cfg)
    raise ValueError(f"unknown reader {r}")
