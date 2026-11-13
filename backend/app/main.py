"""TutinGuard backend: receives simulator data over WebSocket, stores it in PostgreSQL,
turns it into incidents and pushes live updates to operator screens."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import date, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from sqlalchemy import delete, func, select
from starlette.concurrency import run_in_threadpool

from . import db as M
from . import logic as L
from . import schemas as S
from .ai import predictor as AI
from .db import SessionLocal, utcnow

log = logging.getLogger("tutinguard")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")

INGEST_TOKEN = os.getenv("INGEST_TOKEN", "")
STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parents[2] / "frontend"))
SEED_FILE = Path(os.getenv("SEED_FILE", Path(__file__).resolve().parent.parent / "seed" / "site.json"))
READINGS_KEEP_HOURS = int(os.getenv("READINGS_KEEP_HOURS", "24"))


# ---------------- WebSocket hub ----------------
class Hub:
    def __init__(self):
        self.ui: set[WebSocket] = set()
        self.sim: set[WebSocket] = set()
        self.stats = {"received": 0, "invalid": 0}

    async def _send(self, pool: set[WebSocket], payload: dict):
        data = json.dumps(payload, ensure_ascii=False, default=str)
        dead = []
        for ws in list(pool):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            pool.discard(ws)

    async def dispatch(self, out: L.Out):
        for target, payload in out:
            await self._send(self.ui if target == "ui" else self.sim, payload)

    async def status(self):
        await self._send(self.ui, {"type": "sim_status", "data": {"connected": len(self.sim), **self.stats}})


hub = Hub()
predictor = None  # loaded at startup
db_lock = asyncio.Lock()  # one writer at a time keeps the rules deterministic


async def run_db(fn, *args):
    async with db_lock:
        def work():
            with SessionLocal() as s:
                return fn(s, *args)
        return await run_in_threadpool(work)


# ---------------- startup: tables + seed ----------------
def seed(s):
    if s.scalar(select(func.count()).select_from(M.User)) == 0:
        s.add_all([M.User(name="Айдана (дежурный оператор)", role="operator", phone="+7 700 000 00 01"),
                   M.User(name="Марат (ответственный объекта)", role="responsible", phone="+7 700 000 00 02"),
                   M.User(name="Саят (техник)", role="technician", phone="+7 700 000 00 03")])
    if SEED_FILE.exists() and s.scalar(select(func.count()).select_from(M.Site)) == 0:
        data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
        s.add(M.Site(id=data["site_id"], name=data["name"], address=data.get("address", ""), alert_type=data.get("alert_type", 3)))
        for z in data["zones"]:
            s.add(M.Zone(id=z["zone_id"], site_id=data["site_id"], name=z["name"], floor=z.get("floor", 1), type=z.get("type", "room"),
                         max_people=z.get("max_people", 0), polygon=z.get("polygon")))
        today = date.today()
        for i, d in enumerate(data["devices"]):
            nc = date.fromisoformat(d["next_check"]) if d.get("next_check") else today + timedelta(days=30 + i)
            s.add(M.Device(id=d["device_id"], site_id=data["site_id"], zone_id=d["zone_id"], device_type=d["device_type"],
                           model=d.get("model", ""), pos=d.get("pos"), installed=date.fromisoformat(d["installed"]) if d.get("installed") else None,
                           next_check=nc))
            # demo data: two inspections already overdue, the rest planned
            s.add(M.Inspection(device_id=d["device_id"], due_date=today - timedelta(days=5) if i in (3, 9) else nc))
        log.info("Seeded site %s with %d devices (test data)", data["site_id"], len(data["devices"]))
    s.commit()


async def background():
    tick = 0
    while True:
        await asyncio.sleep(5)
        tick += 1
        try:
            await hub.dispatch(await run_db(L.check_offline))
            await hub.dispatch(await run_db(L.check_escalation))
            await hub.dispatch(await run_db(L.ai_tick, predictor))  # AI forecast every 5 s (in-memory buffers, cheap)
            if tick % 120 == 0:  # every 10 minutes
                def prune(s):
                    cut = utcnow() - timedelta(hours=READINGS_KEEP_HOURS)
                    s.execute(delete(M.Reading).where(M.Reading.ts < cut))
                    s.execute(delete(M.Risk).where(M.Risk.ts < cut))
                    s.commit()
                await run_db(prune)
        except Exception:
            log.exception("background check failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    for attempt in range(30):  # wait for Postgres on cold start
        try:
            M.Base.metadata.create_all(M.engine)
            M.ensure_columns()
            break
        except Exception as e:
            log.warning("DB not ready (%s), retry %d", e.__class__.__name__, attempt + 1)
            await asyncio.sleep(2)
    await run_db(seed)
    global predictor
    predictor = await run_in_threadpool(AI.load)
    task = asyncio.create_task(background())
    yield
    task.cancel()


APP_BUILD = "0.2.0-ai"
app = FastAPI(title="TutinGuard API", version=APP_BUILD, lifespan=lifespan)


@app.middleware("http")
async def no_cache_pages(request, call_next):
    """Страницы /sim и /monitor не кэшируются браузером — после обновления сразу видна новая версия."""
    resp = await call_next(request)
    path = request.url.path
    if path.startswith(("/sim", "/monitor")) and "/vendor/" not in path:
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp


# ---------------- WebSockets ----------------
@app.websocket("/ws/ingest")
async def ws_ingest(ws: WebSocket, token: str = ""):
    if INGEST_TOKEN and token != INGEST_TOKEN:
        await ws.close(code=4401)
        return
    await ws.accept()
    hub.sim.add(ws)
    log.info("simulator connected (%d)", len(hub.sim))
    await hub.status()
    try:
        while True:
            raw = await ws.receive_text()
            hub.stats["received"] += 1
            try:
                msg = S.IngestMsg.validate_json(raw)
            except ValidationError as e:
                hub.stats["invalid"] += 1
                await ws.send_text(json.dumps({"type": "error", "error": "invalid message", "details": e.errors(include_url=False)[:3]},
                                              default=str, ensure_ascii=False))
                continue
            await hub.dispatch(await run_db(L.handle_message, msg))
    except WebSocketDisconnect:
        pass
    finally:
        hub.sim.discard(ws)
        log.info("simulator disconnected (%d)", len(hub.sim))
        await hub.status()


@app.websocket("/ws/ui")
async def ws_ui(ws: WebSocket):
    await ws.accept()
    hub.ui.add(ws)
    await ws.send_text(json.dumps({"type": "sim_status", "data": {"connected": len(hub.sim), **hub.stats}}))
    try:
        while True:
            await ws.receive_text()  # UI only listens; pings are ignored
    except WebSocketDisconnect:
        pass
    finally:
        hub.ui.discard(ws)


# ---------------- REST API ----------------
@app.get("/api/health")
async def health():
    ok = await run_db(lambda s: s.scalar(select(func.count()).select_from(M.Site)))
    return {"status": "ok", "build": APP_BUILD, "ai_model": predictor is not None, "sites": ok, "simulators": len(hub.sim), "ui_clients": len(hub.ui), **hub.stats}


@app.get("/api/site")
async def get_site(site_id: str = "office-01"):
    def f(s):
        site = s.get(M.Site, site_id)
        if site is None:
            raise HTTPException(404, "site not found")
        zones = s.scalars(select(M.Zone).where(M.Zone.site_id == site_id)).all()
        devs = s.scalars(select(M.Device).where(M.Device.site_id == site_id).order_by(M.Device.id)).all()
        return {"site_id": site.id, "name": site.name, "address": site.address, "alert_type": site.alert_type,
                "zones": [{"zone_id": z.id, "name": z.name, "floor": z.floor, "type": z.type, "polygon": z.polygon} for z in zones],
                "devices": [L.dev_dict(d) for d in devs]}
    return await run_db(f)


@app.get("/api/devices")
async def get_devices(state: str | None = None, site_id: str = "office-01"):
    def f(s):
        st = select(M.Device).where(M.Device.site_id == site_id)
        if state:
            st = st.where(M.Device.state == state)
        return [L.dev_dict(d) for d in s.scalars(st.order_by(M.Device.id)).all()]
    return await run_db(f)


@app.get("/api/readings/{device_id}")
async def get_readings(device_id: str, minutes: int = Query(15, le=1440)):
    def f(s):
        rows = s.scalars(select(M.Reading).where(M.Reading.device_id == device_id, M.Reading.ts > utcnow() - timedelta(minutes=minutes))
                         .order_by(M.Reading.ts)).all()
        return [{"ts": L.iso(r.ts), "values": r.values, "state": r.state} for r in rows]
    return await run_db(f)


@app.get("/api/incidents")
async def get_incidents(status: str = "open", limit: int = 50):
    def f(s):
        st = select(M.Incident)
        if status == "open":
            st = st.where(M.Incident.status.in_(L.OPEN))
        elif status != "all":
            st = st.where(M.Incident.status == status)
        incs = s.scalars(st.order_by(M.Incident.id.desc()).limit(limit)).all()
        out = []
        for i in incs:
            logs = s.scalars(select(M.IncidentLog).where(M.IncidentLog.incident_id == i.id).order_by(M.IncidentLog.id)).all()
            out.append(L.inc_dict(i, logs))
        return out
    return await run_db(f)


@app.post("/api/incidents/{inc_id}/{action}")
async def act_incident(inc_id: int, action: str, body: S.IncidentAction):
    try:
        data, out = await run_db(L.incident_action, inc_id, action, body)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    await hub.dispatch(out)
    return data


@app.get("/api/incidents/{inc_id}/call-card")
async def call_card(inc_id: int):
    def f(s):
        inc = s.get(M.Incident, inc_id)
        if inc is None:
            raise HTTPException(404, "incident not found")
        return L.call_card(s, inc)
    return await run_db(f)


@app.get("/api/events")
async def get_events(limit: int = Query(100, le=1000), device_id: str | None = None):
    def f(s):
        st = select(M.Event)
        if device_id:
            st = st.where(M.Event.device_id == device_id)
        return [L.ev_dict(e) for e in s.scalars(st.order_by(M.Event.id.desc()).limit(limit)).all()]
    return await run_db(f)


@app.get("/api/occupants")
async def get_occupants():
    return await run_db(lambda s: [L.occ_dict(o) for o in s.scalars(select(M.Occupant).order_by(M.Occupant.occupant_id)).all()])


@app.get("/api/users")
async def get_users():
    return await run_db(lambda s: [{"id": u.id, "name": u.name, "role": u.role, "phone": u.phone} for u in s.scalars(select(M.User)).all()])


@app.get("/api/repair-tasks")
async def get_tasks(status: str = "open"):
    def f(s):
        st = select(M.RepairTask)
        if status != "all":
            st = st.where(M.RepairTask.status == status)
        return [L.task_dict(t) for t in s.scalars(st.order_by(M.RepairTask.id.desc())).all()]
    return await run_db(f)


@app.post("/api/repair-tasks/{task_id}/close")
async def close_task(task_id: int, body: S.CloseTask):
    def f(s):
        t = s.get(M.RepairTask, task_id)
        if t is None:
            raise HTTPException(404, "task not found")
        t.status, t.closed_at, t.comment = "closed", utcnow(), body.comment
        d = s.get(M.Device, t.device_id)
        if d and t.reason.startswith("Частые"):
            d.suspicious, d.false_alarms = False, 0
        s.commit()
        out = [("ui", {"type": "repair_task", "data": L.task_dict(t)})] + ([("ui", {"type": "device", "data": L.dev_dict(d)})] if d else [])
        return L.task_dict(t), out
    data, out = await run_db(f)
    await hub.dispatch(out)
    return data


@app.get("/api/inspections")
async def get_inspections():
    return await run_db(lambda s: [L.insp_dict(x) for x in s.scalars(select(M.Inspection).order_by(M.Inspection.due_date)).all()])


@app.post("/api/inspections/{insp_id}/done")
async def done_inspection(insp_id: int, body: S.CloseTask):
    def f(s):
        x = s.get(M.Inspection, insp_id)
        if x is None:
            raise HTTPException(404, "inspection not found")
        x.done_at, x.result = utcnow(), body.comment or "Проверено, исправно"
        nxt = M.Inspection(device_id=x.device_id, due_date=date.today() + timedelta(days=90))
        s.add(nxt)
        d = s.get(M.Device, x.device_id)
        if d:
            d.next_check = nxt.due_date
        s.commit()
        return L.insp_dict(x)
    data = await run_db(f)
    await hub.dispatch([("ui", {"type": "inspection", "data": data})])
    return data


@app.post("/api/commands")
async def post_command(cmd: S.CommandIn):
    def f(s):
        out = L.send_command(s, cmd)
        s.commit()
        return out
    out = await run_db(f)
    await hub.dispatch(out)
    return {"sent_to_simulators": len(hub.sim), **out[0][1]}


@app.get("/api/stats")
async def stats():
    def f(s):
        devs = s.scalars(select(M.Device)).all()
        closed = s.scalars(select(M.Incident).where(M.Incident.status == "closed", M.Incident.kind.in_(("fire", "gas")))).all()
        acked = s.scalars(select(M.Incident).where(M.Incident.ack_at.is_not(None))).all()
        react = [L.secs(i.ack_at, i.opened_at) for i in acked]
        overdue = s.scalar(select(func.count()).select_from(M.Inspection).where(M.Inspection.done_at.is_(None), M.Inspection.due_date < date.today()))
        return {
            "devices_total": len(devs),
            "devices_online_pct": round(100 * sum(d.state != "offline" for d in devs) / len(devs), 1) if devs else 0,
            "open_incidents": s.scalar(select(func.count()).select_from(M.Incident).where(M.Incident.status.in_(L.OPEN))),
            "avg_reaction_s": round(sum(react) / len(react), 1) if react else None,
            "false_alarm_pct": round(100 * sum(i.result == "false_alarm" for i in closed) / len(closed), 1) if closed else None,
            "open_repair_tasks": s.scalar(select(func.count()).select_from(M.RepairTask).where(M.RepairTask.status == "open")),
            "overdue_inspections": overdue,
            "forecasts_confirmed": s.scalar(select(func.count()).select_from(M.Forecast).where(M.Forecast.status == "confirmed")),
            "forecast_median_lead_min": (lambda v: sorted(v)[len(v) // 2] if v else None)(
                [x for x in s.scalars(select(M.Forecast.lead_min).where(M.Forecast.lead_min.is_not(None))).all()]),
            "simulators": len(hub.sim),
        }
    return await run_db(f)


# ---------------- AI forecast ----------------
@app.get("/api/ai/model")
async def ai_model():
    if predictor is None:
        raise HTTPException(503, "AI model is not loaded (run `python -m app.ai.train`)")
    return predictor.public_card()


@app.get("/api/risk")
async def get_risk(site_id: str = "office-01"):
    return {"site_id": site_id, "enabled": predictor is not None, "zones": L.LATEST_RISK.get(site_id, [])}


@app.get("/api/risk/history")
async def risk_history(zone_id: str, minutes: int = Query(60, le=1440), site_id: str = "office-01"):
    def f(s):
        rows = s.scalars(select(M.Risk).where(M.Risk.site_id == site_id, M.Risk.zone_id == zone_id,
                                              M.Risk.ts > utcnow() - timedelta(minutes=minutes)).order_by(M.Risk.ts)).all()
        return [{"ts": L.iso(r.ts), "vts": L.iso(r.vts), "prob": r.prob, "level": r.level} for r in rows]
    return await run_db(f)


@app.get("/api/forecasts")
async def forecasts(limit: int = 50):
    def f(s):
        rows = s.scalars(select(M.Forecast).order_by(M.Forecast.id.desc()).limit(limit)).all()
        return [{"id": r.id, "incident_id": r.incident_id, "zone_id": r.zone_id, "opened_vts": L.iso(r.opened_vts),
                 "prob_max": r.prob_max, "reasons": r.reasons, "status": r.status, "lead_min": r.lead_min} for r in rows]
    return await run_db(f)


# ---------------- static pages ----------------
@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse("/monitor/")

for name in ("sim", "monitor"):
    if (STATIC_DIR / name).is_dir():
        app.mount(f"/{name}", StaticFiles(directory=STATIC_DIR / name, html=True), name=name)
