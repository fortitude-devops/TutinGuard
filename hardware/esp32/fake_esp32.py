"""Pretends to be the ESP32 stand (no hardware needed): python hardware/esp32/fake_esp32.py --server http://localhost:8000
Keys while running: s — smoke for 30 s, h — heat for 20 s, x — impossible value (range check), q — quit."""
import argparse, json, random, sys, threading, time, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument("--server", default="http://localhost:8000")
ap.add_argument("--site", default="office-01")
ap.add_argument("--device", default="ESP-01")
ap.add_argument("--token", default="")
ap.add_argument("--script", default="", help="non-interactive: e.g. 'wait10,smoke20,wait20'")
a = ap.parse_args()
state = {"smoke_until": 0, "smoke_from": 0, "heat_until": 0, "bad": False}


def send(values, seq):
    body = json.dumps({"site_id": a.site, "device_id": a.device, "device_type": "multi", "model": "ESP32 + MQ-2 + DS18B20", "seq": seq, "values": values}).encode()
    req = urllib.request.Request(a.server + "/api/ingest", body, {"Content-Type": "application/json", "X-Ingest-Token": a.token})
    try:
        return urllib.request.urlopen(req, timeout=5).status
    except Exception as e:  # noqa: BLE001
        return str(e)


def loop():
    seq, base, temp = 0, 820.0, 23.0
    while True:
        seq += 1
        now = time.time()
        smoke = base + random.gauss(0, 12)
        if now < state["smoke_until"]:
            smoke = base + 2200 * min(1, (now - state["smoke_from"]) / 6)
        temp += ((60 if now < state["heat_until"] else 23) - temp) * 0.25
        values = {"smoke_raw": round(smoke), "temp_c": round(temp, 1)}
        if state["bad"]:
            values["smoke_raw"], state["bad"] = 65000, False
        print(values, "->", send(values, seq), flush=True)
        time.sleep(2)


threading.Thread(target=loop, daemon=True).start()
if a.script:
    for step in a.script.split(","):
        n = int("".join(c for c in step if c.isdigit()) or 0)
        if step.startswith("smoke"): state["smoke_from"], state["smoke_until"] = time.time(), time.time() + n
        if step.startswith("heat"): state["heat_until"] = time.time() + n
        if step.startswith("bad"): state["bad"] = True
        time.sleep(n or 2)
    sys.exit(0)
for line in sys.stdin:
    c = line.strip()[:1]
    if c == "s": state["smoke_from"], state["smoke_until"] = time.time(), time.time() + 30
    elif c == "h": state["heat_until"] = time.time() + 20
    elif c == "x": state["bad"] = True
    elif c == "q": break
