"""Loads the trained model and turns a zone's recent sensor history into a forecast with human-readable reasons."""
from __future__ import annotations

import json
import logging
import math
from pathlib import Path

import joblib
import numpy as np

from .features import FEATURES, HORIZON, make_features

log = logging.getLogger("tutinguard.ai")
MODEL_DIR = Path(__file__).resolve().parents[2] / "models"

# feature -> (template, minimum absolute value worth mentioning)
REASONS = {
    "temp_slope60": ("температура растёт {v:+.1f} °C/ч за последний час", 0.8),
    "temp_slope120": ("температура растёт {v:+.1f} °C/ч уже 2 часа", 0.6),
    "temp_slope15": ("температура быстро растёт: {v:+.1f} °C/ч", 2.0),
    "temp_accel": ("рост температуры ускоряется", 1.0),
    "temp_rise120": ("температура на {v:.1f} °C выше фона", 1.5),
    "smoke_persist60": ("следы дыма держатся {m:.0f} мин из последних 60", 0.15),
    "smoke_max30": ("слабый дым {v:.3f} дБ/м — ниже порога датчика", 0.012),
    "smoke_last": ("слабый дым {v:.3f} дБ/м — ниже порога датчика", 0.012),
    "smoke_slope60": ("задымлённость медленно растёт", 0.01),
    "smoke_rise120": ("дыма больше, чем обычно для этой зоны", 0.01),
    "co_last": ("угарный газ {v:.0f} ppm", 8),
    "co_rise120": ("угарный газ вырос на {v:.0f} ppm", 6),
    "co_slope60": ("CO растёт {v:+.0f} ppm/ч", 5),
    "co_persist60": ("угарный газ выше фона {m:.0f} мин из 60", 0.3),
    "lel_last": ("метан {v:.1f}% НКПР", 2),
    "lel_slope60": ("концентрация газа растёт {v:+.1f}% НКПР/ч", 2),
    "lel_rise120": ("газ накапливается: +{v:.1f}% НКПР", 2),
}
ADVICE = {
    "kitchen": "Проверьте газовую плиту и вентиляцию, не включайте электроприборы до проверки.",
    "server": "Проверьте ИБП и аккумуляторы, температуру стоек и кондиционер.",
}
DEFAULT_ADVICE = "Проверьте розетки, удлинители и обогреватели в зоне, отключите подозрительную нагрузку."


class Predictor:
    def __init__(self, model_dir: Path = MODEL_DIR):
        self.model = joblib.load(model_dir / "risk_model.joblib")
        self.card = json.loads((model_dir / "model_card.json").read_text(encoding="utf-8"))
        self.threshold = float(self.card["threshold"])
        n = self.card["normal"]
        self.p50, self.p95, self.p99 = (np.array(n[k], dtype=float) for k in ("p50", "p95", "p99"))
        log.info("AI model loaded: %s (test ROC-AUC %s)", self.card["version"], self.card["test"]["roc_auc"])

    def level(self, p: float) -> str:
        return "high" if p >= self.threshold else "elevated" if p >= self.threshold / 2 else "low"

    def explain(self, x: list[float]) -> list[str]:
        scored = []
        for i, name in enumerate(FEATURES):
            if name not in REASONS:
                continue
            v = x[i]
            tpl, minimum = REASONS[name]
            if v is None or math.isnan(v) or math.isnan(self.p95[i]) or v <= max(self.p95[i], minimum):
                continue
            if name in ("smoke_last", "smoke_max30") and v >= 0.05:
                tpl = "дым {v:.3f} дБ/м"  # already at detector level — not a "hidden" sign any more
            spread = abs(self.p99[i] - self.p50[i]) or 1e-6
            scored.append(((v - self.p95[i]) / spread, tpl.format(v=v, m=v * 60)))
        seen, out = set(), []
        for _, text in sorted(scored, reverse=True):
            key = text.split(" ")[0] + text.split(" ")[1]
            if key not in seen:
                seen.add(key)
                out.append(text)
        return out[:3]

    def predict(self, grid: dict, zone_type: str) -> dict:
        x = make_features(grid, zone_type)
        history = int(x[FEATURES.index("history_min")])
        p = float(self.model.predict_proba(np.array([x]))[0, 1])
        level = self.level(p)
        return {"prob": round(p, 3), "level": level, "history_min": history, "horizon_min": HORIZON,
                "reasons": self.explain(x) if level != "low" else [],
                "advice": ADVICE.get(zone_type, DEFAULT_ADVICE) if level == "high" else None}

    def public_card(self) -> dict:
        return {k: v for k, v in self.card.items() if k != "normal"}


def load() -> Predictor | None:
    try:
        return Predictor()
    except FileNotFoundError:
        log.warning("AI model not found in %s — run `python -m app.ai.train`. Forecasts are disabled.", MODEL_DIR)
        return None
