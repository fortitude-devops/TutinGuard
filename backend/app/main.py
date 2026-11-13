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

import csv
import io

from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from sqlalchemy import delete, func, select
from starlette.concurrency import run_in_threadpool

from . import auth as A
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
    A.seed_users(s)
    if SEED_FILE.exists() and s.scalar(select(func.count()).select_from(M.Site)) == 0:
        data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
        resp = s.scalar(select(M.User).where(M.User.role == "responsible"))
        s.add(M.Site(id=data["site_id"], name=data["name"], address=data.get("address", ""), alert_type=data.get("alert_type", 3),
                     kind=data.get("kind", "office"), responsible_id=resp.id if resp else None))
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


APP_BUILD = "0.3.0"
app = FastAPI(title="TutinGuard API", version=APP_BUILD, lifespan=lifespan)


@app.middleware("http")
async def no_cache_pages(request, call_next):
    """Страницы /sim и /monitor не кэшируются браузером — после обновления сразу видна новая версия."""
    resp = await call_next(request)
    path = request.url.path
    if path.startswith(("/sim", "/monitor", "/app")) and "/vendor/" not in path and "/sounds/" not in path:
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
async def ws_ui(ws: WebSocket, token: str = ""):
    if await run_in_threadpool(A.user_by_token, token) is None:
        await ws.close(code=4401)
        return
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


# ---------------- auth ----------------
@app.post("/api/auth/login")
async def auth_login(body: S.LoginIn):
    res = await run_in_threadpool(A.login, body.username, body.password)
    if res is None:
        raise HTTPException(401, "Неверный логин или пароль")
    return res


@app.post("/api/auth/logout")
async def auth_logout(authorization: str | None = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        await run_in_threadpool(A.logout, authorization[7:].strip())
    return {"ok": True}


@app.get("/api/auth/me")
async def auth_me(u: dict = Depends(A.current_user)):
    return u


@app.get("/api/auth/demo-accounts")
async def demo_accounts():
    """Shown on the login screen of the demo build."""
    return [{"username": un, "name": n, "role": r, "role_ru": A.ROLE_RU[r]} for un, n, r, _ in A.DEMO_USERS]


USER = Depends(A.current_user)
INC_ROLE = Depends(A.require(*A.INCIDENT_ROLES))
REG_ROLE = Depends(A.require(*A.REGISTRY_ROLES))
SRV_ROLE = Depends(A.require(*A.SERVICE_ROLES))


# ---------------- objects (sites), zones, devices ----------------
def site_dict(s, site: M.Site, full: bool = False) -> dict:
    zones = s.scalars(select(M.Zone).where(M.Zone.site_id == site.id).order_by(M.Zone.id)).all()
    devs = s.scalars(select(M.Device).where(M.Device.site_id == site.id).order_by(M.Device.id)).all()
    resp = s.get(M.User, site.responsible_id) if site.responsible_id else None
    d = {"site_id": site.id, "name": site.name, "address": site.address, "alert_type": site.alert_type, "kind": site.kind,
         "floors": site.floors, "responsible": A.user_dict(resp) if resp else None, "responsible_id": site.responsible_id,
         "session_started_at": L.iso(site.session_started_at),
         "zones_count": len(zones), "devices_count": len(devs),
         "devices_offline": sum(x.state == "offline" for x in devs), "devices_alarm": sum(x.state == "alarm" for x in devs),
         "open_incidents": s.scalar(select(func.count()).select_from(M.Incident).where(M.Incident.site_id == site.id,
                                                                                    M.Incident.status.in_(L.OPEN)))}
    if full:
        d["zones"] = [zone_dict(z) for z in zones]
        d["devices"] = [L.dev_dict(x) for x in devs]
    return d


def zone_dict(z: M.Zone) -> dict:
    return {"zone_id": z.id, "site_id": z.site_id, "name": z.name, "floor": z.floor, "type": z.type,
            "max_people": z.max_people, "polygon": z.polygon}


def _get(s, model, key, what):
    obj = s.get(model, key)
    if obj is None:
        raise HTTPException(404, f"{what} не найден(а): {key}")
    return obj


@app.get("/api/sites")
async def list_sites(u: dict = USER):
    return await run_db(lambda s: [site_dict(s, x) for x in s.scalars(select(M.Site).order_by(M.Site.id)).all()])


@app.get("/api/site")
@app.get("/api/sites/{site_id}")
async def get_site(site_id: str = "office-01", u: dict = USER):
    return await run_db(lambda s: site_dict(s, _get(s, M.Site, site_id, "объект"), full=True))


def _slug(text: str, taken) -> str:
    import re
    tr = str.maketrans("абвгдеёжзийклмнопрстуфхцчшщъыьэюяәғқңөұүһі", "abvgdeezziiklmnoprstufhccss_y_euaagqnouuhi")
    base = re.sub(r"[^a-z0-9]+", "-", text.lower().translate(tr)).strip("-")[:30] or "obj"
    cand, n = base, 2
    while taken(cand):
        cand, n = f"{base}-{n}", n + 1
    return cand


@app.post("/api/sites", status_code=201)
async def create_site(body: S.SiteIn, u: dict = REG_ROLE):
    def f(s):
        sid = body.site_id or _slug(body.name, lambda c: s.get(M.Site, c) is not None)
        if s.get(M.Site, sid):
            raise HTTPException(409, "объект с таким id уже есть")
        site = M.Site(id=sid, name=body.name, address=body.address, kind=body.kind, floors=body.floors,
                      alert_type=body.alert_type, responsible_id=body.responsible_id)
        s.add(site)
        s.commit()
        return site_dict(s, site, True)
    data = await run_db(f)
    await hub.dispatch([("ui", {"type": "site_changed", "data": {"site_id": data["site_id"]}})])
    return data


@app.patch("/api/sites/{site_id}")
async def patch_site(site_id: str, body: S.SitePatch, u: dict = REG_ROLE):
    def f(s):
        site = _get(s, M.Site, site_id, "объект")
        for k, v in body.model_dump(exclude_unset=True).items():
            setattr(site, k, v)
        s.commit()
        return site_dict(s, site, True)
    data = await run_db(f)
    await hub.dispatch([("ui", {"type": "site_changed", "data": {"site_id": site_id}})])
    return data


@app.delete("/api/sites/{site_id}")
async def delete_site(site_id: str, u: dict = Depends(A.require("admin"))):
    def f(s):
        site = _get(s, M.Site, site_id, "объект")
        if s.scalar(select(func.count()).select_from(M.Incident).where(M.Incident.site_id == site_id, M.Incident.status.in_(L.OPEN))):
            raise HTTPException(409, "у объекта есть открытые инциденты")
        s.execute(delete(M.Device).where(M.Device.site_id == site_id))
        s.execute(delete(M.Zone).where(M.Zone.site_id == site_id))
        s.delete(site)
        s.commit()
        return {"deleted": site_id}
    data = await run_db(f)
    await hub.dispatch([("ui", {"type": "site_changed", "data": {"site_id": site_id}})])
    return data


@app.post("/api/sites/{site_id}/zones", status_code=201)
async def create_zone(site_id: str, body: S.ZoneIn, u: dict = REG_ROLE):
    def f(s):
        _get(s, M.Site, site_id, "объект")
        zid = body.zone_id or _slug(body.name, lambda c: s.get(M.Zone, c) is not None)
        if s.get(M.Zone, zid):
            raise HTTPException(409, "зона с таким id уже есть")
        z = M.Zone(id=zid, site_id=site_id, name=body.name, type=body.type, floor=body.floor, max_people=body.max_people,
                   polygon=body.polygon)
        s.add(z)
        s.commit()
        return zone_dict(z)
    data = await run_db(f)
    await hub.dispatch([("ui", {"type": "site_changed", "data": {"site_id": site_id}})])
    return data


@app.patch("/api/zones/{zone_id}")
async def patch_zone(zone_id: str, body: S.ZonePatch, u: dict = REG_ROLE):
    def f(s):
        z = _get(s, M.Zone, zone_id, "зона")
        for k, v in body.model_dump(exclude_unset=True).items():
            setattr(z, k, v)
        s.commit()
        return zone_dict(z)
    data = await run_db(f)
    await hub.dispatch([("ui", {"type": "site_changed", "data": {"site_id": data["site_id"]}})])
    return data


@app.delete("/api/zones/{zone_id}")
async def delete_zone(zone_id: str, u: dict = REG_ROLE):
    def f(s):
        z = _get(s, M.Zone, zone_id, "зона")
        for d in s.scalars(select(M.Device).where(M.Device.zone_id == zone_id)).all():
            d.zone_id = None
        site_id = z.site_id
        s.delete(z)
        s.commit()
        return {"deleted": zone_id, "site_id": site_id}
    data = await run_db(f)
    await hub.dispatch([("ui", {"type": "site_changed", "data": {"site_id": data["site_id"]}})])
    return data


@app.get("/api/devices")
async def get_devices(state: str | None = None, site_id: str = "office-01", u: dict = USER):
    def f(s):
        st = select(M.Device).where(M.Device.site_id == site_id)
        if state:
            st = st.where(M.Device.state == state)
        return [L.dev_dict(d) for d in s.scalars(st.order_by(M.Device.id)).all()]
    return await run_db(f)


@app.post("/api/devices", status_code=201)
async def create_device(body: S.DeviceIn, u: dict = REG_ROLE):
    def f(s):
        _get(s, M.Site, body.site_id, "объект")
        if s.get(M.Device, body.device_id):
            raise HTTPException(409, "устройство с таким id уже есть")
        d = M.Device(id=body.device_id, site_id=body.site_id, zone_id=body.zone_id, device_type=body.device_type, model=body.model,
                     pos=body.pos, installed=date.fromisoformat(body.installed) if body.installed else date.today(),
                     next_check=date.today() + timedelta(days=90))
        s.add(d)
        s.add(M.Inspection(device_id=d.id, due_date=d.next_check))
        s.commit()
        return L.dev_dict(d)
    data = await run_db(f)
    await hub.dispatch([("ui", {"type": "device", "data": data}), ("ui", {"type": "site_changed", "data": {"site_id": body.site_id}})])
    return data


@app.patch("/api/devices/{device_id}")
async def patch_device(device_id: str, body: S.DevicePatch, u: dict = REG_ROLE):
    def f(s):
        d = _get(s, M.Device, device_id, "устройство")
        for k, v in body.model_dump(exclude_unset=True).items():
            setattr(d, k, v)
        s.commit()
        return L.dev_dict(d)
    data = await run_db(f)
    await hub.dispatch([("ui", {"type": "device", "data": data})])
    return data


@app.delete("/api/devices/{device_id}")
async def delete_device(device_id: str, u: dict = REG_ROLE):
    def f(s):
        d = _get(s, M.Device, device_id, "устройство")
        site_id = d.site_id
        s.execute(delete(M.Inspection).where(M.Inspection.device_id == device_id, M.Inspection.done_at.is_(None)))
        s.delete(d)
        s.commit()
        return {"deleted": device_id, "site_id": site_id}
    data = await run_db(f)
    await hub.dispatch([("ui", {"type": "site_changed", "data": {"site_id": data["site_id"]}})])
    return data


@app.get("/api/readings/{device_id}")
async def get_readings(device_id: str, minutes: int = Query(15, le=1440), u: dict = USER):
    def f(s):
        rows = s.scalars(select(M.Reading).where(M.Reading.device_id == device_id, M.Reading.ts > utcnow() - timedelta(minutes=minutes))
                         .order_by(M.Reading.ts)).all()
        step = max(1, len(rows) // 300)  # at most ~300 points for charts
        return [{"ts": L.iso(r.ts), "vts": L.iso(r.vts), "values": r.values, "state": r.state} for r in rows[::step]]
    return await run_db(f)


# ---------------- incidents ----------------
@app.get("/api/incidents")
async def get_incidents(status: str = "open", limit: int = Query(50, le=500), site_id: str | None = None, u: dict = USER):
    def f(s):
        st = select(M.Incident)
        if site_id:
            st = st.where(M.Incident.site_id == site_id)
        if status == "open":
            st = st.where(M.Incident.status.in_(L.OPEN))
        elif status != "all":
            st = st.where(M.Incident.status == status)
        return [L.inc_dict(i, L._logs(s, i)) for i in s.scalars(st.order_by(M.Incident.id.desc()).limit(limit)).all()]
    return await run_db(f)


@app.get("/api/incidents/{inc_id}")
async def get_incident(inc_id: int, u: dict = USER):
    def f(s):
        i = _get(s, M.Incident, inc_id, "инцидент")
        d = L.inc_dict(i, L._logs(s, i))
        d["call_card"] = L.call_card(s, i) if i.kind in ("fire", "gas") else None
        return d
    return await run_db(f)


@app.post("/api/incidents/{inc_id}/{action}")
async def act_incident(inc_id: int, action: str, body: S.IncidentAction, u: dict = INC_ROLE):
    body.actor = A.actor_name(u)
    try:
        data, out = await run_db(L.incident_action, inc_id, action, body)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    await hub.dispatch(out)
    return data


@app.get("/api/incidents/{inc_id}/call-card")
async def call_card(inc_id: int, u: dict = USER):
    return await run_db(lambda s: L.call_card(s, _get(s, M.Incident, inc_id, "инцидент")))


@app.get("/api/events")
async def get_events(limit: int = Query(100, le=1000), device_id: str | None = None, site_id: str | None = None, u: dict = USER):
    def f(s):
        st = select(M.Event)
        if device_id:
            st = st.where(M.Event.device_id == device_id)
        if site_id:
            st = st.where(M.Event.site_id == site_id)
        return [L.ev_dict(e) for e in s.scalars(st.order_by(M.Event.id.desc()).limit(limit)).all()]
    return await run_db(f)


@app.get("/api/occupants")
async def get_occupants(site_id: str = "office-01", u: dict = USER):
    return await run_db(lambda s: [L.occ_dict(o) for o in s.scalars(select(M.Occupant).where(M.Occupant.site_id == site_id)
                                                                     .order_by(M.Occupant.occupant_id)).all()])


@app.get("/api/users")
async def get_users(u: dict = USER):
    return await run_db(lambda s: [A.user_dict(x) for x in s.scalars(select(M.User).where(M.User.active.is_(True)).order_by(M.User.id)).all()])


# ---------------- technician: repair tasks & inspections ----------------
def task_full(s, t: M.RepairTask) -> dict:
    d = L.task_dict(t)
    dev = s.get(M.Device, t.device_id)
    d["zone_id"] = dev.zone_id if dev else None
    d["site_id"] = dev.site_id if dev else None
    return d


@app.get("/api/repair-tasks")
async def get_tasks(status: str = "open", u: dict = USER):
    def f(s):
        st = select(M.RepairTask)
        if status != "all":
            st = st.where(M.RepairTask.status == status)
        return [task_full(s, t) for t in s.scalars(st.order_by(M.RepairTask.id.desc()).limit(300)).all()]
    return await run_db(f)


@app.post("/api/repair-tasks", status_code=201)
async def create_task(body: S.TaskIn, u: dict = USER):
    def f(s):
        _get(s, M.Device, body.device_id, "устройство")
        t = M.RepairTask(device_id=body.device_id, reason=body.reason, technician_id=body.technician_id,
                         comment=f"создал(а): {A.actor_name(u)}")
        s.add(t)
        s.commit()
        return task_full(s, t)
    data = await run_db(f)
    await hub.dispatch([("ui", {"type": "repair_task", "data": data})])
    return data


@app.patch("/api/repair-tasks/{task_id}")
async def patch_task(task_id: int, body: S.TaskPatch, u: dict = SRV_ROLE):
    def f(s):
        t = _get(s, M.RepairTask, task_id, "задача")
        if body.technician_id is not None:
            t.technician_id = body.technician_id
        if body.comment is not None:
            t.comment = body.comment
        s.commit()
        return task_full(s, t)
    data = await run_db(f)
    await hub.dispatch([("ui", {"type": "repair_task", "data": data})])
    return data


@app.post("/api/repair-tasks/{task_id}/close")
async def close_task(task_id: int, body: S.CloseTask, u: dict = SRV_ROLE):
    def f(s):
        t = _get(s, M.RepairTask, task_id, "задача")
        t.status, t.closed_at = "closed", utcnow()
        t.comment = (body.comment or "выполнено") + f" — {A.actor_name(u)}"
        t.technician_id = t.technician_id or u["id"]
        d = s.get(M.Device, t.device_id)
        if d and t.reason.startswith("Частые"):
            d.suspicious, d.false_alarms = False, 0
        s.commit()
        out = [("ui", {"type": "repair_task", "data": task_full(s, t)})] + ([("ui", {"type": "device", "data": L.dev_dict(d)})] if d else [])
        return task_full(s, t), out
    data, out = await run_db(f)
    await hub.dispatch(out)
    return data


def insp_full(s, x: M.Inspection) -> dict:
    d = L.insp_dict(x)
    dev = s.get(M.Device, x.device_id)
    d.update(zone_id=dev.zone_id if dev else None, site_id=dev.site_id if dev else None,
             device_type=dev.device_type if dev else None, technician_id=x.technician_id)
    return d


@app.get("/api/inspections")
async def get_inspections(status: str = "planned", u: dict = USER):
    def f(s):
        st = select(M.Inspection)
        if status == "planned":
            st = st.where(M.Inspection.done_at.is_(None))
        elif status == "done":
            st = st.where(M.Inspection.done_at.is_not(None))
        return [insp_full(s, x) for x in s.scalars(st.order_by(M.Inspection.due_date).limit(500)).all()]
    return await run_db(f)


@app.post("/api/inspections", status_code=201)
async def create_inspection(body: S.InspectionIn, u: dict = SRV_ROLE):
    def f(s):
        d = _get(s, M.Device, body.device_id, "устройство")
        x = M.Inspection(device_id=d.id, due_date=date.fromisoformat(body.due_date), technician_id=body.technician_id)
        s.add(x)
        s.commit()
        return insp_full(s, x)
    data = await run_db(f)
    await hub.dispatch([("ui", {"type": "inspection", "data": data})])
    return data


@app.post("/api/inspections/{insp_id}/done")
async def done_inspection(insp_id: int, body: S.CloseTask, u: dict = SRV_ROLE):
    def f(s):
        x = _get(s, M.Inspection, insp_id, "проверка")
        x.done_at, x.result = utcnow(), (body.comment or "Проверено, исправно") + f" — {A.actor_name(u)}"
        x.technician_id = x.technician_id or u["id"]
        nxt = M.Inspection(device_id=x.device_id, due_date=date.today() + timedelta(days=90))
        s.add(nxt)
        d = s.get(M.Device, x.device_id)
        if d:
            d.next_check = nxt.due_date
        s.commit()
        return insp_full(s, x)
    data = await run_db(f)
    await hub.dispatch([("ui", {"type": "inspection", "data": data})])
    return data


# ---------------- commands to the site (alerting system) ----------------
@app.post("/api/commands")
async def post_command(cmd: S.CommandIn, u: dict = INC_ROLE):
    if cmd.action == "dispatch_brigade":
        raise HTTPException(400, "вызов пожарных — через инцидент: POST /api/incidents/{id}/dispatch")
    cmd.actor = A.actor_name(u)

    def f(s):
        out = L.send_command(s, cmd)
        s.commit()
        return out
    out = await run_db(f)
    await hub.dispatch(out)
    return {"sent_to_simulators": len(hub.sim), **out[0][1]}


# ---------------- statistics & reports ----------------
@app.get("/api/stats")
async def stats(site_id: str | None = None, u: dict = USER):
    def f(s):
        dq = select(M.Device) if not site_id else select(M.Device).where(M.Device.site_id == site_id)
        devs = s.scalars(dq).all()
        iq = select(M.Incident) if not site_id else select(M.Incident).where(M.Incident.site_id == site_id)
        incs = s.scalars(iq).all()
        closed = [i for i in incs if i.status == "closed" and i.kind in ("fire", "gas") and i.result != "test"]
        react = [L.secs(i.ack_at, i.opened_at) for i in incs if i.ack_at]
        overdue = s.scalar(select(func.count()).select_from(M.Inspection).where(M.Inspection.done_at.is_(None), M.Inspection.due_date < date.today()))
        travel = [L.secs(i.brigade_arrived_at, i.brigade_called_at) for i in incs if i.brigade_arrived_at and i.brigade_called_at]
        return {
            "devices_total": len(devs),
            "devices_online_pct": round(100 * sum(d.state != "offline" for d in devs) / len(devs), 1) if devs else 0,
            "devices_offline": sum(d.state == "offline" for d in devs),
            "devices_alarm": sum(d.state == "alarm" for d in devs),
            "open_incidents": sum(i.status in L.OPEN for i in incs),
            "avg_reaction_s": round(sum(react) / len(react), 1) if react else None,
            "false_alarm_pct": round(100 * sum(i.result == "false_alarm" for i in closed) / len(closed), 1) if closed else None,
            "open_repair_tasks": s.scalar(select(func.count()).select_from(M.RepairTask).where(M.RepairTask.status == "open")),
            "overdue_inspections": overdue,
            "forecasts_confirmed": s.scalar(select(func.count()).select_from(M.Forecast).where(M.Forecast.status == "confirmed")),
            "forecast_median_lead_min": (lambda v: sorted(v)[len(v) // 2] if v else None)(
                [x for x in s.scalars(select(M.Forecast.lead_min).where(M.Forecast.lead_min.is_not(None))).all()]),
            "brigade_calls": sum(1 for i in incs if i.brigade_called_at),
            "brigade_avg_travel_s": round(sum(travel) / len(travel)) if travel else None,
            "simulators": len(hub.sim),
        }
    return await run_db(f)


@app.get("/api/reports/summary")
async def report_summary(days: int = Query(7, ge=1, le=365), site_id: str | None = None, u: dict = USER):
    def f(s):
        since = utcnow() - timedelta(days=days)
        q = select(M.Incident).where(M.Incident.opened_at >= since)
        if site_id:
            q = q.where(M.Incident.site_id == site_id)
        incs = s.scalars(q).all()
        by = lambda key: {k: sum(1 for i in incs if key(i) == k) for k in sorted({key(i) for i in incs if key(i)})}
        per_day: dict[str, int] = {}
        for i in incs:
            k = L.aware(i.opened_at).date().isoformat()
            per_day[k] = per_day.get(k, 0) + 1
        devs = s.scalars(select(M.Device).where(M.Device.false_alarms > 0).order_by(M.Device.false_alarms.desc()).limit(10)).all()
        react = sorted(L.secs(i.ack_at, i.opened_at) for i in incs if i.ack_at)
        return {"days": days, "total": len(incs), "by_kind": by(lambda i: i.kind), "by_result": by(lambda i: i.result),
                "by_zone": by(lambda i: i.zone_id), "per_day": per_day,
                "reaction_median_s": react[len(react) // 2] if react else None,
                "reaction_p90_s": react[int(len(react) * .9)] if react else None,
                "escalated": sum(i.escalated for i in incs), "brigade_calls": sum(1 for i in incs if i.brigade_called_at),
                "noisy_devices": [{"device_id": d.id, "zone_id": d.zone_id, "false_alarms": d.false_alarms, "suspicious": d.suspicious} for d in devs]}
    return await run_db(f)


def _csv(rows: list[list], header: list[str], name: str):
    buf = io.StringIO()
    buf.write("﻿")  # Excel opens UTF-8 correctly
    w = csv.writer(buf, delimiter=";")
    w.writerow(header)
    w.writerows(rows)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.get("/api/export/incidents.csv")
async def export_incidents(days: int = 30, u: dict = USER):
    def f(s):
        since = utcnow() - timedelta(days=days)
        incs = s.scalars(select(M.Incident).where(M.Incident.opened_at >= since).order_by(M.Incident.id)).all()
        return [[i.id, i.site_id, i.zone_id, i.kind, i.level, i.status, L.iso(i.opened_at), L.iso(i.ack_at), L.iso(i.closed_at),
                 round(L.secs(i.ack_at, i.opened_at)) if i.ack_at else "", i.result or "", i.repeat_count, ",".join(i.device_ids or []),
                 "да" if i.escalated else "", i.brigade_status or "", i.comment or ""] for i in incs]
    rows = await run_db(f)
    return _csv(rows, ["id", "объект", "зона", "тип", "уровень", "статус", "открыт", "принят", "закрыт", "реакция_с", "результат",
                       "повторов", "датчики", "эскалация", "бригада_DEMO", "комментарий"], "tutinguard_incidents.csv")


@app.get("/api/export/journal.csv")
async def export_journal(days: int = 30, u: dict = USER):
    def f(s):
        since = utcnow() - timedelta(days=days)
        rows = s.scalars(select(M.IncidentLog).where(M.IncidentLog.ts >= since).order_by(M.IncidentLog.id)).all()
        return [[r.incident_id, L.iso(r.ts), r.actor, r.action, r.comment] for r in rows]
    rows = await run_db(f)
    return _csv(rows, ["инцидент", "время", "кто", "действие", "комментарий"], "tutinguard_journal.csv")


# ---------------- AI forecast ----------------
@app.get("/api/ai/model")
async def ai_model():
    if predictor is None:
        raise HTTPException(503, "AI model is not loaded (run `python -m app.ai.train`)")
    return predictor.public_card()


@app.get("/api/risk")
async def get_risk(site_id: str = "office-01", u: dict = USER):
    return {"site_id": site_id, "enabled": predictor is not None, "zones": L.LATEST_RISK.get(site_id, [])}


@app.get("/api/risk/history")
async def risk_history(zone_id: str, minutes: int = Query(60, le=1440), site_id: str = "office-01", u: dict = USER):
    def f(s):
        rows = s.scalars(select(M.Risk).where(M.Risk.site_id == site_id, M.Risk.zone_id == zone_id,
                                              M.Risk.ts > utcnow() - timedelta(minutes=minutes)).order_by(M.Risk.ts)).all()
        step = max(1, len(rows) // 300)
        return [{"ts": L.iso(r.ts), "vts": L.iso(r.vts), "prob": r.prob, "level": r.level} for r in rows[::step]]
    return await run_db(f)


@app.get("/api/forecasts")
async def forecasts(limit: int = 50, u: dict = USER):
    def f(s):
        rows = s.scalars(select(M.Forecast).order_by(M.Forecast.id.desc()).limit(limit)).all()
        return [{"id": r.id, "incident_id": r.incident_id, "zone_id": r.zone_id, "opened_vts": L.iso(r.opened_vts),
                 "prob_max": r.prob_max, "reasons": r.reasons, "status": r.status, "lead_min": r.lead_min} for r in rows]
    return await run_db(f)


# ---------------- static pages ----------------
@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse("/app/")


@app.get("/monitor", include_in_schema=False)
@app.get("/monitor/", include_in_schema=False)
async def old_monitor():
    return RedirectResponse("/app/")

for name in ("sim", "app"):
    if (STATIC_DIR / name).is_dir():
        app.mount(f"/{name}", StaticFiles(directory=STATIC_DIR / name, html=True), name=name)
