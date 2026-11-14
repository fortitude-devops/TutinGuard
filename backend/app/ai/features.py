"""Features for the fire-risk forecast. The same code is used for training (synthetic minute series)
and for live prediction (sensor readings resampled to one value per minute)."""
from __future__ import annotations

import math
import warnings

import numpy as np

SERIES = ("temp", "smoke", "co", "lel")
WINDOW = 150          # minutes of history the model looks at
HORIZON = 60          # predict "ignition within the next 60 minutes"
ZONE_TYPES = {"kitchen": 0, "server": 1, "office": 2, "openspace": 2, "meeting": 2, "hall": 3, "storage": 4,
              # other buildings map onto the trained types
              "food": 0, "laundry": 0, "classroom": 2, "ward": 2, "shop": 2, "room": 2, "wc": 3}
# what counts as "above background" for persistence features
PERSIST_THR = {"temp": 1.0, "smoke": 0.01, "co": 5.0, "lel": 2.0}
VALUE_KEYS = {"temp": "temp_c", "smoke": "obscuration_db_m", "co": "co_ppm", "lel": "lel_pct"}

PER_SERIES = ("last", "rise120", "slope15", "slope60", "slope120", "accel", "max30", "std30", "persist60")
FEATURES = [f"{s}_{f}" for s in SERIES for f in PER_SERIES] + ["history_min", "zone_type"]


def _slope(y: np.ndarray, w: int) -> float:
    """Least-squares slope over the last w minutes, in units per hour (NaN-tolerant)."""
    seg = y[-w:]
    m = ~np.isnan(seg)
    if m.sum() < max(5, w // 4):
        return math.nan
    x = np.arange(len(seg), dtype=float)[m]
    v = seg[m]
    x -= x.mean()
    d = float((x * x).sum())
    return float((x * (v - v.mean())).sum() / d * 60.0) if d > 0 else math.nan


def series_features(y: np.ndarray | None, name: str) -> list[float]:
    if y is None or np.all(np.isnan(y)):
        return [math.nan] * len(PER_SERIES)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        last = float(np.nanmean(y[-3:]))
        recent = y[-120:]
        base = float(np.nanpercentile(recent, 10)) if np.any(~np.isnan(recent)) else math.nan
        s15, s60, s120 = _slope(y, 15), _slope(y, 60), _slope(y, 120)
        tail30 = y[-30:]
        max30 = float(np.nanmax(tail30)) if np.any(~np.isnan(tail30)) else math.nan
        std30 = float(np.nanstd(tail30)) if np.sum(~np.isnan(tail30)) >= 3 else math.nan
        tail60 = y[-60:]
        valid = ~np.isnan(tail60)
        persist = float(np.mean(tail60[valid] > base + PERSIST_THR[name])) if valid.sum() >= 5 and not math.isnan(base) else math.nan
    accel = s15 - s60 if not (math.isnan(s15) or math.isnan(s60)) else math.nan
    return [last, last - base, s15, s60, s120, accel, max30, std30, persist]


def make_features(grid: dict[str, np.ndarray | None], zone_type: str) -> list[float]:
    """grid: per-series arrays of length WINDOW (one value per minute, NaN where unknown); last element = now."""
    out: list[float] = []
    hist = 0
    for s in SERIES:
        y = grid.get(s)
        out += series_features(y, s)
        if y is not None:
            hist = max(hist, int(np.sum(~np.isnan(y))))
    out += [float(hist), float(ZONE_TYPES.get(zone_type, 2))]
    return out


def resample(points: list[tuple[float, dict]], end_minute: float) -> dict[str, np.ndarray | None]:
    """points: (minute_timestamp, values) from all sensors of a zone. Returns per-minute max per series,
    forward-filled, covering [end_minute - WINDOW + 1, end_minute]."""
    grid: dict[str, np.ndarray | None] = {}
    start = end_minute - WINDOW + 1
    for s in SERIES:
        key = VALUE_KEYS[s]
        arr = np.full(WINDOW, np.nan)
        seen = False
        for t, vals in points:
            v = vals.get(key) if vals else None
            if v is None or isinstance(v, bool):
                continue
            i = int(math.floor(t - start))
            if 0 <= i < WINDOW:
                arr[i] = float(v) if np.isnan(arr[i]) else max(arr[i], float(v))
                seen = True
        if not seen:
            grid[s] = None
            continue
        last = math.nan
        for i in range(WINDOW):  # forward fill gaps (telemetry can be sparser than 1/min)
            if np.isnan(arr[i]):
                arr[i] = last
            else:
                last = arr[i]
        grid[s] = arr
    return grid
