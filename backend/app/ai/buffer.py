"""In-memory per-zone minute buffers fed by telemetry, so the forecast never scans the readings table."""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime

import numpy as np

from .features import SERIES, VALUE_KEYS, WINDOW

# (site_id, zone_id) -> series -> minute -> max value in that minute
_BUF: dict[tuple[str, str], dict[str, dict[int, float]]] = defaultdict(lambda: defaultdict(dict))
_END: dict[tuple[str, str], int] = {}


def add(site_id: str, zone_id: str | None, when: datetime, values: dict) -> None:
    if not zone_id or not values:
        return
    key = (site_id, zone_id)
    minute = int(math.floor(when.timestamp() / 60))
    buf = _BUF[key]
    for s in SERIES:
        v = values.get(VALUE_KEYS[s])
        if v is None or isinstance(v, bool):
            continue
        cur = buf[s].get(minute)
        buf[s][minute] = float(v) if cur is None else max(cur, float(v))
    end = max(_END.get(key, minute), minute)
    _END[key] = end
    for s in SERIES:  # prune old minutes
        old = [m for m in buf[s] if m < end - WINDOW - 5]
        for m in old:
            del buf[s][m]


def reset(site_id: str) -> None:
    for key in [k for k in _BUF if k[0] == site_id]:
        _BUF.pop(key, None)
        _END.pop(key, None)


def grid(site_id: str, zone_id: str) -> tuple[dict, int] | None:
    key = (site_id, zone_id)
    if key not in _END:
        return None
    end, buf = _END[key], _BUF[key]
    out = {}
    for s in SERIES:
        if not buf[s]:
            out[s] = None
            continue
        arr = np.full(WINDOW, np.nan)
        last = math.nan
        first = min(buf[s])
        for i in range(WINDOW):
            m = end - WINDOW + 1 + i
            v = buf[s].get(m)
            if v is not None:
                last = v
            arr[i] = last if m >= first else math.nan
        out[s] = arr
    return out, end
