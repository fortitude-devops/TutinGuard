"""Self-check after `docker compose up`:  docker compose exec backend python -m app.smoke_test
Sends a short fake sequence over the ingest WebSocket and checks the API reacts correctly.
Uses test zone 'meet' of the demo site and closes the incident it creates."""
import asyncio
import json
import os
import sys
from datetime import datetime, timezone

import httpx
import websockets

BASE = os.getenv("SMOKE_BASE", "http://localhost:8000")
TOKEN = os.getenv("INGEST_TOKEN", "")
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "demo")


def now():
    return datetime.now(timezone.utc).isoformat()


def msg(**kw):
    return json.dumps({"schema": "1.0", "ts": now(), "site_id": "office-01", "simulated": True, **kw})


async def main() -> int:
    ok = True

    def check(cond, text):
        nonlocal ok
        print(("  OK   " if cond else "  FAIL ") + text)
        ok &= bool(cond)

    async with httpx.AsyncClient(base_url=BASE, timeout=10) as c:
        h = {}
        for attempt in range(30):  # the backend needs a few seconds after `docker compose up`
            try:
                h = (await c.get("/api/health")).json()
                break
            except httpx.TransportError:
                if attempt == 0:
                    print("  ...  жду, пока бэкенд запустится")
                await asyncio.sleep(2)
        check(h.get("status") == "ok", f"API отвечает, объектов в БД: {h.get('sites')}")
        if not h:
            print("\nБэкенд не ответил за 60 с. Посмотрите `docker compose logs backend`"
                  " (чаще всего — неверный POSTGRES_PASSWORD или старая база: `docker compose down -v`).")
            return 1
        check((await c.get("/api/incidents")).status_code == 401, "без входа API закрыто (401)")
        r = await c.post("/api/auth/login", json={"username": "operator", "password": DEMO_PASSWORD})
        check(r.status_code == 200, "вход оператора (operator / пароль из DEMO_PASSWORD)")
        if r.status_code != 200:
            return 1
        c.headers["Authorization"] = "Bearer " + r.json()["token"]
        r = await c.post("/api/auth/login", json={"username": "technician", "password": DEMO_PASSWORD})
        tech = {"Authorization": "Bearer " + r.json()["token"]} if r.status_code == 200 else {}
        check((await c.get("/api/site")).status_code == 200, "демо-объект office-01 загружен")
        card = await c.get("/api/ai/model")
        check(card.status_code == 200, "AI-модель прогноза загружена" + (
            f" (ROC-AUC {card.json()['test']['roc_auc']}, упреждение ~{card.json()['test']['median_lead_min']} мин)" if card.status_code == 200 else ""))
        before = {i["id"] for i in (await c.get("/api/incidents")).json()}

        ws_url = BASE.replace("http", "ws", 1) + "/ws/ingest" + (f"?token={TOKEN}" if TOKEN else "")
        async with websockets.connect(ws_url) as ws:
            for dev in ("SMK-MT-01", "SMK-MT-02"):
                await ws.send(msg(type="telemetry", device_id=dev, zone_id="meet", device_type="smoke", seq=1,
                                  values={"obscuration_db_m": 0.17}, state="alarm"))
                await ws.send(msg(type="event", event_id="smoke-" + dev, device_id=dev, zone_id="meet", event="alarm",
                                  category="smoke", prev_state="normal", state="alarm", value={"obscuration_db_m": 0.17}))
            await ws.send(json.dumps({"type": "telemetry", "site_id": "x"}))  # deliberately invalid
            reply = json.loads(await asyncio.wait_for(ws.recv(), 5))
            check(reply.get("type") == "error", "некорректное сообщение отклонено с ошибкой")
        await asyncio.sleep(1)

        incs = [i for i in (await c.get("/api/incidents")).json() if i["id"] not in before and i["zone_id"] == "meet"]
        check(len(incs) == 1, "создан один инцидент на два датчика (повтор не дублирует)")
        if incs:
            i = incs[0]
            check(i["level"] == "fire", "пожар подтверждён двумя извещателями")
            r = await c.post(f"/api/incidents/{i['id']}/ack", json={"actor": "smoke-test"})
            check(r.status_code == 200 and r.json()["status"] == "acknowledged", "оператор принял инцидент")
            r = await c.post(f"/api/incidents/{i['id']}/close", headers=tech, json={"result": "test"})
            check(r.status_code == 403, "техник не может закрыть пожарный инцидент (роли работают)")
            r = await c.post(f"/api/incidents/{i['id']}/dispatch", json={})
            check(r.status_code == 200 and (r.json().get("brigade") or {}).get("status") == "called",
                  "вызов пожарных сформирован (DEMO, реальный вызов не отправляется)")
            r = await c.post(f"/api/incidents/{i['id']}/close", json={"actor": "smoke-test", "result": "test", "comment": "самопроверка"})
            check(r.status_code == 200 and r.json()["status"] == "closed", "инцидент закрыт с результатом «тест»")
        # Состояние датчика может уже перезаписать открытая 3D-сцена, поэтому проверяем журнал событий
        evs = (await c.get("/api/events", params={"device_id": "SMK-MT-01", "limit": 50})).json()
        check(any(e.get("event_id") == "smoke-SMK-MT-01" or (e.get("event") == "alarm" and e.get("category") == "smoke") for e in evs),
              "сработка датчика сохранена в журнале БД")
        if h.get("simulators"):
            print(f"  i    подключено 3D-сцен: {h['simulators']} — они шлют свои данные, это нормально")
        async with websockets.connect(ws_url) as ws:  # put the sensors back to normal
            for dev in ("SMK-MT-01", "SMK-MT-02"):
                await ws.send(msg(type="event", device_id=dev, zone_id="meet", event="restore", category="smoke", state="normal"))
            await asyncio.sleep(0.5)
    print("\nИТОГ: " + ("всё работает" if ok else "есть ошибки — смотрите FAIL выше и `docker compose logs backend`"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
