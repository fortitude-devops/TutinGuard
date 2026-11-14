"""Data-quality guard and server-side detection ("edge" devices such as the ESP32 stand).

Lessons from the Zenodo multi-sensor recordings (research/compare_datasets.py):
  * right after a reconnect a sensor can report garbage (a single 1001 ppm smoke spike after a 10 h gap) -> WARM-UP:
    alarms from a device that has just come back are treated as unconfirmed for WARMUP_S seconds;
  * physically impossible values occur (LPG 1 158 225 ppm) -> RANGE CHECK: such values are dropped and reported once;
  * baselines drift over days (CO 0.9 -> 0.7 ppm, CNG -45 %) -> ADAPTIVE BASELINE: thresholds of server-side detection
    are relative to a slow moving average learned while the device is quiet.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

WARMUP_S = int(os.getenv("WARMUP_S", "120"))
INVALID_REPORT_S = 300

# plausible physical ranges of every value we know
RANGES: dict[str, tuple[float, float]] = {
    # generous on purpose: a real fire can push readings far past normal; only physically impossible values are dropped
    "temp_c": (-50, 1200), "co_ppm": (0, 50000), "lel_pct": (0, 200), "obscuration_db_m": (0, 100), "ror_c_min": (-200, 1000),
    "dust_pct": (0, 100), "smoke_raw": (0, 4095), "gas_raw": (0, 4095), "humidity": (0, 100), "smoke_ppm": (0, 10000),
}
BASE_KEYS = ("temp_c", "co_ppm", "lel_pct", "smoke_raw", "gas_raw")
ALPHA = 0.02  # EWMA weight per quiet sample (2 s cadence -> ~100 s time constant)


def _now():
    return datetime.now(timezone.utc)


class Quality:
    def __init__(self):
        self.warm: dict[str, datetime] = {}
        self.base: dict[tuple[str, str], float] = {}
        self.invalid: dict[str, int] = {}
        self.invalid_reported: dict[str, datetime] = {}
        self.temp_hist: dict[str, list[tuple[datetime, float]]] = {}

    # ---- warm-up ----
    def start_warmup(self, dev: str):
        self.warm[dev] = _now() + timedelta(seconds=WARMUP_S)

    def in_warmup(self, dev: str) -> bool:
        t = self.warm.get(dev)
        return bool(t and t > _now())

    # ---- range check + baseline ----
    def clean(self, dev: str, values: dict, state: str) -> tuple[dict, dict]:
        good, bad = {}, {}
        for k, v in (values or {}).items():
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                good[k] = v
                continue
            lo, hi = RANGES.get(k, (float("-inf"), float("inf")))
            if v != v or v < lo or v > hi:  # NaN or out of range
                bad[k] = v
                continue
            good[k] = v
            if k in BASE_KEYS and state in ("normal", "") and not self.in_warmup(dev):
                b = self.base.get((dev, k))
                self.base[(dev, k)] = v if b is None else b + ALPHA * (v - b)
        if bad:
            self.invalid[dev] = self.invalid.get(dev, 0) + 1
        return good, bad

    def should_report_invalid(self, dev: str) -> bool:
        last = self.invalid_reported.get(dev)
        if last and (_now() - last).total_seconds() < INVALID_REPORT_S:
            return False
        self.invalid_reported[dev] = _now()
        return True

    def baseline(self, dev: str, key: str) -> float | None:
        return self.base.get((dev, key))

    def info(self, dev: str) -> dict:
        left = 0
        if self.in_warmup(dev):
            left = round((self.warm[dev] - _now()).total_seconds())
        return {"warmup_s": left, "invalid_values": self.invalid.get(dev, 0),
                "baseline": {k: round(v, 3) for (d, k), v in self.base.items() if d == dev}}

    # ---- server-side detection for raw devices (ESP32 stand) ----
    def evaluate(self, dev: str, values: dict, prev_state: str) -> str:
        """Returns normal / pre_alarm / alarm from raw readings, with hysteresis. Thresholds are relative to the learned baseline."""
        now = _now()
        level = 0
        smoke = values.get("smoke_raw")
        if isinstance(smoke, (int, float)):
            b = self.baseline(dev, "smoke_raw") or smoke
            if smoke > max(b * 1.8, b + 600):
                level = 2
            elif smoke > max(b * 1.35, b + 250):
                level = max(level, 1)
        gas = values.get("gas_raw")
        if isinstance(gas, (int, float)):
            b = self.baseline(dev, "gas_raw") or gas
            if gas > max(b * 1.8, b + 600):
                level = 2
        t = values.get("temp_c")
        if isinstance(t, (int, float)):
            h = [(ts, v) for ts, v in self.temp_hist.get(dev, []) if (now - ts).total_seconds() <= 60] + [(now, t)]
            self.temp_hist[dev] = h
            ror = (t - h[0][1]) / max(1 / 60, (now - h[0][0]).total_seconds() / 60) if len(h) > 1 and (now - h[0][0]).total_seconds() >= 15 else 0
            if t >= 57 or ror >= 10:
                level = 2
            elif t >= 45 or ror >= 5:
                level = max(level, 1)
        if values.get("flame") in (1, True):
            level = 2
        new = ("normal", "pre_alarm", "alarm")[level]
        # hysteresis: leave alarm only when clearly back to normal
        if prev_state == "alarm" and new == "pre_alarm":
            return "alarm"
        return new


Q = Quality()
