"""Train the fire-risk forecast model on synthetic episodes and save it with an honest model card.

    python -m app.ai.train            # ~1–2 min on a laptop, also run during `docker build`
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import average_precision_score, roc_auc_score

from . import synth
from .features import FEATURES, HORIZON, SERIES, WINDOW, make_features

MODEL_DIR = Path(__file__).resolve().parents[2] / "models"
STEP = 5          # evaluate every 5 minutes inside an episode
THRESHOLD = 0.4   # "high risk" (chosen on held-out episodes: ~77% warned, ~0.1 false/zone/day)
PERSIST = 2       # consecutive high evaluations needed to raise a forecast


def build(n_episodes: int, seed: int):
    rng = np.random.default_rng(seed)
    X, y, ep_id, minute, ign = [], [], [], [], []
    for e in range(n_episodes):
        ep = synth.episode(rng)
        start = int(rng.integers(0, 60))  # the system may have been switched on recently
        for t in range(start + 10, synth.T, STEP):
            if ep["ignition"] is not None and t >= ep["ignition"]:
                break  # after ignition ordinary detectors take over
            lo = max(start, t - WINDOW + 1)
            grid = {}
            for s in SERIES:
                arr = np.full(WINDOW, np.nan)
                seg = ep[s][lo:t + 1]
                arr[WINDOW - len(seg):] = seg
                grid[s] = arr
            X.append(make_features(grid, ep["zone"]))
            y.append(int(ep["ignition"] is not None and ep["ignition"] - t <= HORIZON))
            ep_id.append(e)
            minute.append(t)
            ign.append(-1 if ep["ignition"] is None else ep["ignition"])
    return np.array(X), np.array(y), np.array(ep_id), np.array(minute), np.array(ign)


def episode_metrics(p, ep_id, minute, ign):
    """Per-episode view: did we warn before ignition, how early, how many false forecasts."""
    leads, caught, pos_eps, false_eps, neg_eps = [], 0, 0, 0, 0
    for e in np.unique(ep_id):
        m = ep_id == e
        pe, te, ie = p[m], minute[m], ign[m][0]
        high = pe >= THRESHOLD
        run, alert_t = 0, None
        for h, tt in zip(high, te):
            run = run + 1 if h else 0
            if run >= PERSIST:
                alert_t = tt
                break
        if ie >= 0:
            pos_eps += 1
            if alert_t is not None:
                caught += 1
                leads.append(ie - alert_t)
        else:
            neg_eps += 1
            false_eps += alert_t is not None
    hours = neg_eps * synth.T / 60
    return {
        "precursor_episodes": pos_eps,
        "warned_before_ignition_pct": round(100 * caught / max(pos_eps, 1), 1),
        "median_lead_min": float(np.median(leads)) if leads else None,
        "p25_lead_min": float(np.percentile(leads, 25)) if leads else None,
        "normal_episodes": neg_eps,
        "false_forecasts_per_zone_per_day": round(false_eps / max(hours, 1) * 24, 2),
    }


def main():
    t0 = time.time()
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    Xtr, ytr, *_ = build(2400, seed=1)
    Xte, yte, ep_te, min_te, ign_te = build(800, seed=2)
    model = HistGradientBoostingClassifier(max_iter=350, learning_rate=.06, max_leaf_nodes=31, min_samples_leaf=40,
                                           l2_regularization=1.0, early_stopping=False, random_state=0)
    model.fit(Xtr, ytr)
    p = model.predict_proba(Xte)[:, 1]
    neg = Xtr[ytr == 0]
    with np.errstate(all="ignore"):
        normal = {"p50": np.nanpercentile(neg, 50, axis=0).tolist(), "p95": np.nanpercentile(neg, 95, axis=0).tolist(),
                  "p99": np.nanpercentile(neg, 99, axis=0).tolist()}
    card = {
        "name": "TutinGuard fire-risk forecast",
        "version": datetime.now(timezone.utc).strftime("%Y%m%d"),
        "task": f"probability that a fire starts in the zone within the next {HORIZON} minutes",
        "model": "HistGradientBoostingClassifier (scikit-learn)",
        "features": FEATURES,
        "window_min": WINDOW, "horizon_min": HORIZON, "threshold": THRESHOLD, "persist_evals": PERSIST,
        "data": "SYNTHETIC: generated 6-hour episodes (normal background, cooking, kettle steam, heaters, dust, "
                "server load, smokers; precursors: overheating socket/cable, smouldering, battery thermal runaway, "
                "slow gas leak). Not validated on real fires.",
        "train": {"episodes": 2400, "samples": int(len(ytr)), "positive_share": round(float(ytr.mean()), 3)},
        "test": {"episodes": 800, "samples": int(len(yte)),
                 "roc_auc": round(float(roc_auc_score(yte, p)), 3),
                 "pr_auc": round(float(average_precision_score(yte, p)), 3),
                 **episode_metrics(p, ep_te, min_te, ign_te)},
        "trained_in_s": round(time.time() - t0, 1),
        "normal": normal,
    }
    joblib.dump(model, MODEL_DIR / "risk_model.joblib")
    (MODEL_DIR / "model_card.json").write_text(json.dumps(card, ensure_ascii=False, indent=1))
    print(json.dumps({k: v for k, v in card.items() if k not in ("normal", "features")}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
