"""Synthetic training data: 6-hour minute-by-minute episodes for one zone.

Negative episodes: normal background + everyday nuisances (cooking, kettle steam, heaters, dust,
server load, a smoker) — these must NOT raise the forecast.
Positive episodes: slow precursors that end in ignition — an overheating socket/cable, smouldering
material, a battery in thermal runaway, a slow gas leak.

All data here is synthetic and labelled as such; signal levels are chosen to match the simulator and
typical ranges of point detectors (smoke in dB/m, temperature °C, CO ppm, CH4 % LEL)."""
from __future__ import annotations

import numpy as np

T = 360  # minutes per episode
ZONES = ("kitchen", "server", "office", "openspace", "meeting", "hall")


def _bump(t, start, rise, hold, fall, amp):
    """Trapezoid pulse: ramps up over `rise` min, holds, decays exponentially over `fall`."""
    y = np.zeros_like(t, dtype=float)
    a = (t >= start) & (t < start + rise)
    y[a] = (t[a] - start) / max(rise, 1)
    b = (t >= start + rise) & (t < start + rise + hold)
    y[b] = 1
    c = t >= start + rise + hold
    y[c] = np.exp(-(t[c] - start - rise - hold) / max(fall, 1))
    return amp * y


def episode(rng: np.random.Generator, positive: bool | None = None) -> dict:
    zone = rng.choice(ZONES, p=[.24, .16, .2, .2, .1, .1])
    t = np.arange(T, dtype=float)
    if positive is None:
        positive = rng.random() < .42
    temp = 19 + rng.random() * 7 + 1.2 * np.sin(2 * np.pi * (t / T * .6 + rng.random()))  # slow daily drift
    smoke = np.full(T, rng.random() * .004)
    co = np.full(T, rng.random() * 3)
    lel = np.zeros(T)
    kinds = []

    # ---- everyday nuisances (in both classes) ----
    n_nuis = rng.integers(0, 5)
    for _ in range(n_nuis):
        s = rng.integers(0, T - 20)
        opts = ["kettle", "dust", "heater", "smoker", "sun"]
        if zone == "kitchen":
            opts += ["cooking", "cooking", "cooking"]
        if zone == "server":
            opts += ["load", "load"]
        k = rng.choice(opts)
        kinds.append(k)
        if k == "cooking":
            d = rng.integers(10, 40)
            temp += _bump(t, s, 5, d, 12, rng.uniform(2, 8))
            puffs = (rng.random(T) < .25) & (t >= s) & (t < s + d)
            smoke += np.convolve(puffs * rng.uniform(.02, .14), np.ones(3) / 3, "same")
            co += _bump(t, s, 3, d, 8, rng.uniform(4, 40))  # gas stove
        elif k == "kettle":
            smoke += _bump(t, s, 1, rng.integers(1, 4), 2, rng.uniform(.03, .2))
        elif k == "dust":
            smoke += _bump(t, s, 5, rng.integers(15, 60), 10, rng.uniform(.008, .04))
        elif k == "heater":
            temp += _bump(t, s, rng.integers(20, 60), rng.integers(60, 200), 30, rng.uniform(2, 5))
        elif k == "smoker":
            d = rng.integers(4, 10)
            smoke += _bump(t, s, 2, d, 4, rng.uniform(.01, .05))
            co += _bump(t, s, 2, d, 6, rng.uniform(3, 10))
        elif k == "sun":
            temp += _bump(t, s, 90, 60, 90, rng.uniform(1, 3))
        elif k == "load":
            temp += _bump(t, s, 15, rng.integers(30, 150), 20, rng.uniform(2, 4))

    # ---- slow precursor that ends in ignition ----
    ignition = None
    if positive:
        options = ["socket", "smoulder"]
        if zone == "server":
            options = ["battery", "battery", "socket"]
        if zone == "kitchen":
            options += ["gas", "gas"]
        k = rng.choice(options)
        kinds.append("PRE_" + k)
        dur = rng.integers(40, 241)
        t0 = rng.integers(0, T - 30)
        ignition = int(t0 + dur)
        x = np.clip((t - t0) / dur, 0, None)
        x[t < t0] = 0
        x = np.minimum(x, 1.0)
        strength = rng.uniform(.4, 1.3)  # some precursors are subtle
        if k == "socket":  # overheating plug/cable: accelerating heat, intermittent smoke traces, CO creep
            temp += strength * rng.uniform(4, 15) * x ** rng.uniform(1.5, 3)
            traces = (rng.random(T) < (.05 + .5 * x)) * x * strength * rng.uniform(.015, .045)
            smoke += np.convolve(traces, np.ones(4) / 4, "same")
            co += strength * rng.uniform(8, 45) * x ** 2
        elif k == "smoulder":  # paper/fabric smouldering: CO-rich, slow smoke creep, little heat
            smoke += strength * rng.uniform(.03, .1) * x ** 1.5
            co += strength * rng.uniform(25, 140) * x ** 1.6
            temp += strength * rng.uniform(.5, 2.5) * x
        elif k == "battery":  # UPS battery thermal runaway: strong accelerating heat, late outgassing
            temp += strength * rng.uniform(8, 25) * (np.exp(3 * x) - 1) / (np.e ** 3 - 1)
            smoke += strength * rng.uniform(.005, .03) * x ** 4
            lel += strength * rng.uniform(1, 6) * x ** 3  # hydrogen
        elif k == "gas":  # slow leak: methane builds up near the ceiling
            lel += strength * rng.uniform(10, 40) * x ** rng.uniform(1, 2)

    # ---- sensor noise, quantisation, missing sensors ----
    temp = np.round(temp + rng.normal(0, .12, T), 1)
    smoke = np.round(np.clip(smoke + rng.normal(0, .0015, T), 0, None), 3)
    co = np.round(np.clip(co + rng.normal(0, 1.2, T), 0, None))
    lel = np.round(np.clip(lel + rng.normal(0, .15, T), 0, None), 1)
    has_temp = zone in ("kitchen", "server") or rng.random() < .7
    has_co = zone == "kitchen" or rng.random() < .55
    has_lel = zone == "kitchen" or (zone == "server" and rng.random() < .3)
    nan = np.full(T, np.nan)
    return {"zone": str(zone), "ignition": ignition, "kinds": kinds,
            "temp": temp if has_temp else nan, "smoke": smoke,
            "co": co if has_co else nan, "lel": lel if has_lel else nan}
