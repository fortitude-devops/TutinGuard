"""Compare two public fire-sensor datasets and check what they are good for in TutinGuard.

  data/kaggle_smoke.csv        Kaggle "Smoke Detection Dataset" (smoke_detection_iot.csv, 62 630 rows, 1 Hz)
  data/zenodo/*.xlsx           Zenodo record 6616632 (SB112 smart building: smoke, co, flame, lpg, cng sensors)

Run:  pip install pandas openpyxl scikit-learn  &&  python research/compare_datasets.py
"""
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import train_test_split

D = Path(__file__).parent / "data"


def kaggle():
    p = D / "kaggle_smoke.csv"
    if not p.exists():
        print("Kaggle file not found:", p)
        return
    df = pd.read_csv(p)
    df["run"] = (df["CNT"].diff().fillna(1) != 1).cumsum()
    feat = ["Temperature[C]", "Humidity[%]", "TVOC[ppb]", "eCO2[ppm]", "Raw H2", "Raw Ethanol", "Pressure[hPa]",
            "PM1.0", "PM2.5", "NC0.5", "NC1.0", "NC2.5"]
    X, y = df[feat].values, df["Fire Alarm"].values
    print(f"== Kaggle Smoke Detection: {len(df)} rows, {df['run'].nunique()} recording runs, alarm share {y.mean():.1%}")
    print(df.groupby("run").agg(rows=("UTC", "size"), alarm=("Fire Alarm", "mean"), temp=("Temperature[C]", "mean"),
                                hum=("Humidity[%]", "mean"), pm25_max=("PM2.5", "max")).round(2).to_string())
    for r in sorted(df.run.unique()):
        s = df[df.run == r].sort_values("CNT")["Fire Alarm"].values
        print(f"   run {r}: label changes {np.count_nonzero(np.diff(s))} time(s)")
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=.25, random_state=0, stratify=y)
    rf = RandomForestClassifier(200, n_jobs=-1, random_state=0).fit(Xtr, ytr)
    p = rf.predict_proba(Xte)[:, 1]
    print(f"   random split:   accuracy {accuracy_score(yte, p > .5):.4f}, ROC-AUC {roc_auc_score(yte, p):.4f}")
    top = sorted(zip(rf.feature_importances_, feat), reverse=True)[:4]
    print("   top features:", ", ".join(f"{f} ({v:.2f})" for v, f in top))
    # runs 0/1 and 3/4 are the same recordings with shifted temperature -> group them as one session
    sess = df["run"].map({0: "A", 1: "A", 2: "B", 3: "C", 4: "C"}).fillna("X")
    for g in sorted(sess.unique()):
        tr, te = sess != g, sess == g
        p = RandomForestClassifier(200, n_jobs=-1, random_state=0).fit(X[tr], y[tr]).predict_proba(X[te])[:, 1]
        print(f"   hold out session {g}: rows {te.sum()}, accuracy {accuracy_score(y[te], p > .5):.3f}")


def zenodo():
    files = sorted((D / "zenodo").glob("*.xlsx"))
    if not files:
        print("\n== Zenodo SB112: put the 5 xlsx files into", D / "zenodo")
        return
    print(f"\n== Zenodo SB112: {len(files)} files")
    for f in files:
        x = pd.ExcelFile(f)
        d = pd.concat([pd.read_excel(x, sh) for sh in x.sheet_names])   # one sheet per day
        d["t"] = pd.to_datetime(d["time"], utc=True, format="mixed").dt.tz_convert("Europe/Athens")
        d = d.sort_values("t").reset_index(drop=True)
        v, step = d["data_value"], d["t"].diff().dt.total_seconds()
        idle, test = d[d.t.dt.day < 11], d[d.t.dt.day == 11]
        mu, sd = idle.data_value.mean(), idle.data_value.std()
        thr = mu + 6 * sd
        print(f"-- {f.name}: {len(d)} rows, unit {d['unit'].iloc[0]}, step ~{step.median():.0f} s, "
              f"gaps > 10 min: {int((step > 600).sum())} (longest {step.max() / 3600:.1f} h)")
        print(d.groupby(d.t.dt.date)["data_value"].agg(["count", "mean", "std", "max"]).round(3).to_string())
        ev = test[test.data_value > thr]
        print(f"   idle mean {mu:.3f}, sd {sd:.3f}; above idle+6σ: idle days {int((idle.data_value > thr).sum())}, test day {len(ev)}"
              + (f"; test peak {ev.data_value.max():.1f} (×{ev.data_value.max() / mu:.0f} of baseline) at {ev.t.iloc[ev.data_value.argmax()]:%H:%M:%S}" if len(ev) else ""))

if __name__ == "__main__":
    kaggle()
    zenodo()
