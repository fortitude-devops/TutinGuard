"""Business rules. All functions are synchronous and take a DB session; they return a list of
outgoing messages: ("ui", payload) goes to every operator screen, ("sim", payload) to simulators."""
from __future__ import annotations

import os
import secrets
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import city as C
from . import db as M
from . import schemas as S
from .ai import buffer as AIBUF
from .quality import Q, RANGES as QRANGES, WARMUP_S
from .db import utcnow

OFFLINE_SECONDS = int(os.getenv("OFFLINE_SECONDS", "30"))
ESCALATE_SECONDS = int(os.getenv("ESCALATE_SECONDS", "60"))
FALSE_ALARM_LIMIT = int(os.getenv("FALSE_ALARM_LIMIT", "3"))
BRIGADE_ETA_S = int(os.getenv("BRIGADE_ETA_S", "45"))   # simulated travel time of the DEMO fire brigade (sim seconds)
AUTO_DISPATCH = os.getenv("AUTO_DISPATCH", "confirmed")  # confirmed | escalation | off
BRIGADE_RU = {"called": "вызвана (DEMO)", "en_route": "в пути", "arrived": "прибыла", "attack": "тушение",
              "extinguished": "пожар ликвидирован", "returning": "убывает"}

FIRE_CATEGORIES = {"smoke", "heat", "flame", "multi", "manual"}
GAS_CATEGORIES = {"gas", "co", "gas_lel", "gas_co"}
OPEN = ("new", "acknowledged", "assigned", "checking")

Out = list[tuple[str, dict]]


# ---------------- serializers ----------------
def iso(d):
    return aware(d).isoformat() if isinstance(d, datetime) else (d.isoformat() if d else None)


def aware(d):
    """SQLite returns naive datetimes; treat them as UTC so both databases behave the same."""
    return d.replace(tzinfo=timezone.utc) if d is not None and d.tzinfo is None else d


def secs(a, b) -> float:
    return (aware(a) - aware(b)).total_seconds()


def dev_dict(d: M.Device) -> dict:
    return {"device_id": d.id, "site_id": d.site_id, "zone_id": d.zone_id, "device_type": d.device_type, "model": d.model,
            "pos": d.pos, "state": d.state, "last_seen": iso(d.last_seen), "last_values": d.last_values,
            "next_check": iso(d.next_check), "suspicious": d.suspicious, "false_alarms": d.false_alarms, "quality": Q.info(d.id)}


def inc_dict(i: M.Incident, logs: list[M.IncidentLog] | None = None) -> dict:
    r = {"id": i.id, "site_id": i.site_id, "zone_id": i.zone_id, "kind": i.kind, "level": i.level, "status": i.status,
         "repeat_count": i.repeat_count, "device_ids": i.device_ids, "opened_at": iso(i.opened_at), "level_at": iso(i.level_at),
         "ack_at": iso(i.ack_at), "closed_at": iso(i.closed_at), "result": i.result, "comment": i.comment,
         "assignee_id": i.assignee_id, "escalated": i.escalated,
         "reaction_s": round(secs(i.ack_at, i.opened_at), 1) if i.ack_at else None,
         "brigade": None if not i.brigade_status else {
             "status": i.brigade_status, "status_ru": BRIGADE_RU.get(i.brigade_status, i.brigade_status),
             "called_at": iso(i.brigade_called_at), "arrived_at": iso(i.brigade_arrived_at), "done_at": iso(i.brigade_done_at),
             "eta_s": i.brigade_eta_s, "demo": True,
             "travel_s": i.brigade_travel_s if i.brigade_travel_s is not None else (round(secs(i.brigade_arrived_at, i.brigade_called_at)) if i.brigade_arrived_at and i.brigade_called_at else None)}}
    if logs is not None:
        r["log"] = [{"ts": iso(l.ts), "actor": l.actor, "action": l.action, "comment": l.comment} for l in logs]
    return r


def ev_dict(e: M.Event) -> dict:
    return {"id": e.id, "ts": iso(e.ts), "site_id": e.site_id, "zone_id": e.zone_id, "device_id": e.device_id, "event": e.event,
            "category": e.category, "prev_state": e.prev_state, "state": e.state, "value": e.value, "source": e.source}


def task_dict(t: M.RepairTask) -> dict:
    return {"id": t.id, "device_id": t.device_id, "reason": t.reason, "status": t.status, "created_at": iso(t.created_at),
            "closed_at": iso(t.closed_at), "technician_id": t.technician_id, "comment": t.comment}


def occ_dict(o: M.Occupant) -> dict:
    return {"occupant_id": o.occupant_id, "name": o.name, "zone_id": o.zone_id, "status": o.status, "injury": o.injury,
            "fed_co": o.fed_co, "fed_heat": o.fed_heat, "pos": o.pos, "exposure": o.exposure, "updated_at": iso(o.updated_at)}


def insp_dict(x: M.Inspection) -> dict:
    return {"id": x.id, "device_id": x.device_id, "due_date": iso(x.due_date), "done_at": iso(x.done_at),
            "result": x.result, "overdue": x.done_at is None and x.due_date < date.today()}


# ---------------- helpers ----------------
def log_incident(s: Session, inc: M.Incident, action: str, comment: str = "", actor: str = "system"):
    s.add(M.IncidentLog(incident_id=inc.id, actor=actor, action=action, comment=comment))


def add_event(s: Session, site_id: str, event: str, *, device_id=None, zone_id=None, category="", state=None,
              prev_state=None, value=None, source="server", event_id="") -> M.Event:
    e = M.Event(event_id=event_id or secrets.token_hex(4), site_id=site_id, zone_id=zone_id, device_id=device_id, event=event,
                category=category, state=state, prev_state=prev_state, value=value, source=source)
    s.add(e)
    s.flush()
    return e


def open_task(s: Session, device_id: str, reason: str) -> M.RepairTask | None:
    exists = s.scalar(select(M.RepairTask).where(M.RepairTask.device_id == device_id, M.RepairTask.status == "open",
                                                 M.RepairTask.reason == reason))
    if exists:
        return None
    t = M.RepairTask(device_id=device_id, reason=reason)
    s.add(t)
    s.flush()
    return t


def get_device(s: Session, site_id: str, device_id: str, zone_id=None, device_type="unknown", model="") -> M.Device:
    d = s.get(M.Device, device_id)
    if d is None:  # auto-register unknown devices so data is never lost
        d = M.Device(id=device_id, site_id=site_id, zone_id=zone_id, device_type=device_type, model=model, state="normal")
        s.add(d)
        s.flush()
    return d


def restore_link(s: Session, d: M.Device, new_state: str, out: Out, warm: bool = True):
    d.state = new_state if new_state != "offline" else "normal"
    if warm:  # a physical sensor needs time after power/link loss; a simulated one does not
        Q.start_warmup(d.id)
    e = add_event(s, d.site_id, "link_restored", device_id=d.id, zone_id=d.zone_id, category=d.device_type,
                  state=d.state, prev_state="offline")
    out += [("ui", {"type": "device", "data": dev_dict(d)}), ("ui", {"type": "event", "data": ev_dict(e)})]
    s.flush()
    # the link came back by itself: close the auto-created repair task and, once the whole zone is back, the incident
    for t in s.scalars(select(M.RepairTask).where(M.RepairTask.device_id == d.id, M.RepairTask.status == "open",
                                                  M.RepairTask.reason.like("Нет связи%"))).all():
        t.status, t.closed_at, t.comment = "closed", utcnow(), "связь восстановилась автоматически"
        out.append(("ui", {"type": "repair_task", "data": task_dict(t)}))
    inc = s.scalar(select(M.Incident).where(M.Incident.zone_id == d.zone_id, M.Incident.kind == "offline",
                                            M.Incident.status.in_(OPEN)))
    if inc and all((s.get(M.Device, i) or d).state != "offline" for i in inc.device_ids or []):
        inc.status, inc.result, inc.closed_at = "closed", "link_restored", utcnow()
        log_incident(s, inc, "auto_close", "связь со всеми устройствами зоны восстановлена")
        out.append(("ui", {"type": "incident", "data": inc_dict(inc, _logs(s, inc))}))


# ---------------- incidents ----------------
def raise_incident(s: Session, site_id: str, zone_id: str | None, kind: str, device_id: str, category: str, out: Out,
                   vts=None, suspect: bool = False):
    inc = s.scalar(select(M.Incident).where(M.Incident.site_id == site_id, M.Incident.zone_id == zone_id,
                                            M.Incident.kind == kind, M.Incident.status.in_(OPEN), _not_finished()))
    if inc is None and kind == "fire":
        # smoke spreading from an ongoing fire is the same event: attach it to the first (origin) incident on the site
        origin = s.scalar(select(M.Incident).where(M.Incident.site_id == site_id, M.Incident.kind == "fire", M.Incident.status.in_(OPEN),
                                                   M.Incident.opened_at > utcnow() - timedelta(minutes=60), _not_finished()).order_by(M.Incident.id))
        if origin is not None:
            z = s.get(M.Zone, zone_id) if zone_id else None
            ids = list(origin.device_ids or [])
            if device_id not in ids:
                ids.append(device_id)
                origin.device_ids = ids
            origin.repeat_count += 1
            log_incident(s, origin, "spread", f"сигнал из зоны «{z.name if z else zone_id}»: {device_id} — распространение дыма")
            if origin.level == "attention" and len(ids) >= 2:
                origin.level, origin.level_at = "fire", utcnow()
                log_incident(s, origin, "confirmed", f"подтверждено {len(ids)} извещателями (в т.ч. в соседних зонах)")
                _city(s, origin, out)
                if AUTO_DISPATCH == "confirmed" and not origin.brigade_status:
                    out += dispatch_brigade(s, origin, "автоматически (пожар подтверждён)")
            out.append(("ui", {"type": "incident", "data": inc_dict(origin, _logs(s, origin))}))
            return origin
    if inc is None:
        level = "gas" if kind == "gas" else ("fire" if category == "manual" else "attention")
        if kind in ("fault", "offline"):
            level = "fault"
        if suspect and level == "gas":
            level = "attention"
        inc = M.Incident(site_id=site_id, zone_id=zone_id, kind=kind, level=level, device_ids=[device_id])
        s.add(inc)
        s.flush()
        log_incident(s, inc, "created", f"{category or kind}: {device_id}")
        if suspect:
            log_incident(s, inc, "warmup", f"{device_id} только что восстановил связь (прогрев {WARMUP_S} с): сигнал считается неподтверждённым — нужен второй датчик или повторный сигнал")
        if level == "fire":
            log_incident(s, inc, "confirmed", "ручной извещатель")
            _city(s, inc, out)
        if kind in ("fire", "gas"):
            confirm_forecast(s, site_id, zone_id, inc, vts or utcnow(), out)
    else:
        ids = list(inc.device_ids or [])
        inc.repeat_count += 1
        if kind == "gas" and inc.level == "attention" and not suspect:
            inc.level, inc.level_at = "gas", utcnow()
            log_incident(s, inc, "confirmed", f"утечка подтверждена: {device_id}")
        if device_id not in ids:
            ids.append(device_id)
            inc.device_ids = ids
        log_incident(s, inc, "repeat", f"повторный сигнал: {device_id} (#{inc.repeat_count})")
        if kind == "fire" and inc.level == "attention" and (len(ids) >= 2 or category == "manual"):
            inc.level = "fire"
            inc.level_at = utcnow()
            log_incident(s, inc, "confirmed", f"подтверждено {len(ids)} извещателями" if category != "manual" else "ручной извещатель")
            if AUTO_DISPATCH == "confirmed" and not inc.brigade_status:
                out += dispatch_brigade(s, inc, "автоматически (пожар подтверждён)")
            _city(s, inc, out)
    out.append(("ui", {"type": "incident", "data": inc_dict(inc, _logs(s, inc))}))
    return inc


def handle_message(s: Session, msg) -> Out:
    out: Out = []
    now = utcnow()
    if isinstance(msg, S.Hello):
        site = s.get(M.Site, msg.site_id)
        if site is None:
            site = M.Site(id=msg.site_id, name=msg.site_name or msg.site_id, kind=(msg.model_extra or {}).get("site_kind") or "office")
            s.add(site)
        new_session = not msg.session_id or msg.session_id != site.session_id
        if new_session:
            if site.session_id and msg.session_id:
                # the simulator was reloaded or reset: the previous run's incidents are history now
                for inc in s.scalars(select(M.Incident).where(M.Incident.site_id == msg.site_id, M.Incident.status.in_(OPEN))).all():
                    inc.status, inc.result, inc.closed_at = "closed", "test", now
                    inc.comment = "закрыт автоматически: симуляция перезапущена"
                    log_incident(s, inc, "auto_close", "симуляция перезапущена (новая сессия)")
                    out.append(("ui", {"type": "incident", "data": inc_dict(inc, _logs(s, inc))}))
                s.query(M.Occupant).filter(M.Occupant.site_id == msg.site_id).delete()
            site.session_started_at = now
            site.session_id = msg.session_id
            AIBUF.reset(msg.site_id)  # new simulator session: forget the previous minute history
            LATEST_RISK.pop(msg.site_id, None)
            for k in [k for k in list(_HIGH) + list(_LOW) if k[0] == msg.site_id]:
                _HIGH.pop(k, None)
                _LOW.pop(k, None)
        for z in msg.zones:
            if not z.get("zone_id"):
                continue
            zz = s.get(M.Zone, z["zone_id"])
            if zz is None:
                s.add(M.Zone(id=z["zone_id"], site_id=msg.site_id, name=z.get("name", z["zone_id"]), polygon=z.get("polygon"),
                             type=z.get("type") or "room"))
            elif z.get("type") and zz.type == "room":
                zz.type = z["type"]
        for di in msg.devices:
            d = get_device(s, msg.site_id, di.device_id, di.zone_id, di.device_type, di.model)
            d.zone_id, d.device_type, d.model, d.pos = di.zone_id or d.zone_id, di.device_type, di.model or d.model, di.pos or d.pos
        add_event(s, msg.site_id, "sim_connected", category="link", source="sim")
        out.append(("ui", {"type": "site_changed", "data": {"site_id": msg.site_id}}))

    elif isinstance(msg, S.Telemetry):
        d = get_device(s, msg.site_id, msg.device_id, msg.zone_id, msg.device_type, msg.model)
        was_offline = d.state == "offline"
        edge = bool((msg.model_extra or {}).get("raw")) or (d.model or "").lower().startswith("esp32")
        values, bad = Q.clean(d.id, msg.values, d.state if edge else msg.state)
        if bad and Q.should_report_invalid(d.id):
            e = add_event(s, msg.site_id, "invalid_value", device_id=d.id, zone_id=d.zone_id, category=d.device_type, state=d.state,
                          value={k: {"value": v, "range": list(QRANGES.get(k, ()))} for k, v in bad.items()}, source="quality")
            out.append(("ui", {"type": "event", "data": ev_dict(e)}))
        merged = {**(d.last_values or {}), **values} if bad else values
        d.last_seen, d.last_values, d.seq = now, merged, msg.seq
        vts = aware(msg.ts) or now
        state = Q.evaluate(d.id, values, d.state if d.state != "offline" else "normal") if edge else msg.state
        s.add(M.Reading(device_id=d.id, ts=now, vts=vts, values=values, state=state))
        if not Q.in_warmup(d.id):
            AIBUF.add(msg.site_id, d.zone_id, vts, values)
        if was_offline:
            restore_link(s, d, state, out, warm=not msg.simulated)
        elif edge and state != d.state:
            ev = {"alarm": "alarm", "pre_alarm": "pre_alarm", "normal": "restore"}[state]
            out += handle_message(s, S.Event(type="event", ts=msg.ts, site_id=msg.site_id, device_id=d.id, zone_id=d.zone_id, event=ev,
                                             category=d.device_type, prev_state=d.state, state=state, value=values, source="edge"))
        elif state != d.state:
            d.state = state
            out.append(("ui", {"type": "device", "data": dev_dict(d)}))
        out.append(("ui", {"type": "telemetry", "data": {"device_id": d.id, "zone_id": d.zone_id, "values": msg.values,
                                                         "state": d.state, "ts": iso(now)}}))

    elif isinstance(msg, S.Heartbeat):
        for item in msg.devices:
            d = s.get(M.Device, item.device_id)
            if d is None:
                continue
            was_offline = d.state == "offline"
            d.last_seen = now
            if was_offline:
                restore_link(s, d, "normal", out, warm=not msg.simulated)

    elif isinstance(msg, S.Event) and msg.event == "fire_confirmed":
        # the fire panel confirmed the fire itself (2 detectors, call point or re-query of a single detector)
        reason = (msg.value or {}).get("reason", "прибор")
        inc = s.scalar(select(M.Incident).where(M.Incident.site_id == msg.site_id, M.Incident.kind == "fire", M.Incident.status.in_(OPEN),
                                                _not_finished()).order_by(M.Incident.id))
        if inc is None:
            inc = raise_incident(s, msg.site_id, msg.zone_id, "fire", msg.device_id, "smoke", out, vts=aware(msg.ts) or now)
        if inc.level != "fire":
            inc.level, inc.level_at = "fire", utcnow()
            log_incident(s, inc, "confirmed", f"подтверждено прибором: {reason}")
            _city(s, inc, out)
        if AUTO_DISPATCH == "confirmed" and not inc.brigade_status and inc.status in OPEN:
            out += dispatch_brigade(s, inc, "автоматически (пожар подтверждён прибором)")
        else:
            out.append(("ui", {"type": "incident", "data": inc_dict(inc, _logs(s, inc))}))
        e = add_event(s, msg.site_id, "fire_confirmed", device_id=msg.device_id, zone_id=msg.zone_id, category="panel", state="alarm",
                      value=msg.value, source="panel", event_id=msg.event_id)
        out.append(("ui", {"type": "event", "data": ev_dict(e)}))

    elif isinstance(msg, S.Event):
        d = get_device(s, msg.site_id, msg.device_id, msg.zone_id, msg.category or "unknown")
        prev = d.state
        d.state, d.last_seen = msg.state, now
        e = add_event(s, msg.site_id, msg.event, device_id=d.id, zone_id=d.zone_id, category=msg.category, state=msg.state,
                      prev_state=msg.prev_state or prev, value=msg.value, source=msg.source, event_id=msg.event_id)
        out += [("ui", {"type": "event", "data": ev_dict(e)}), ("ui", {"type": "device", "data": dev_dict(d)})]
        cat = (msg.category or d.device_type or "").lower()
        if msg.event in ("alarm", "manual_call"):
            kind = "gas" if cat in GAS_CATEGORIES else "fire"
            warm = msg.event == "alarm" and Q.in_warmup(d.id)
            raise_incident(s, msg.site_id, d.zone_id, kind, d.id, "manual" if msg.event == "manual_call" else cat, out,
                           vts=aware(msg.ts) or now, suspect=warm)
        elif msg.event in ("fault", "tamper", "service_needed"):
            raise_incident(s, msg.site_id, d.zone_id, "fault", d.id, msg.event, out)
            t = open_task(s, d.id, {"fault": "Неисправность", "tamper": "Датчик снят с крепления",
                                    "service_needed": "Требуется обслуживание (запылённость)"}[msg.event])
            if t:
                out.append(("ui", {"type": "repair_task", "data": task_dict(t)}))

    elif isinstance(msg, S.Occupant):
        o = s.get(M.Occupant, msg.occupant_id)
        if o is None:
            o = M.Occupant(occupant_id=msg.occupant_id, site_id=msg.site_id)
            s.add(o)
        changed = (o.status, o.injury) != (msg.status, msg.injury)
        o.name, o.zone_id, o.status, o.injury = msg.name or o.name, msg.zone_id, msg.status, msg.injury
        o.fed_co, o.fed_heat, o.pos, o.exposure, o.updated_at = msg.fed_co, msg.fed_heat, msg.pos, msg.exposure, now
        out.append(("ui", {"type": "occupant", "data": occ_dict(o), "changed": changed}))

    elif isinstance(msg, S.Brigade):
        inc = s.get(M.Incident, msg.incident_id) if msg.incident_id else None
        if inc is None:  # brigade started from the scene itself (offline mode / scene button): attach to the open fire
            inc = s.scalar(select(M.Incident).where(M.Incident.site_id == msg.site_id, M.Incident.kind == "fire",
                                                    M.Incident.status.in_(OPEN)).order_by(M.Incident.id.desc()))
            if inc is not None and not inc.brigade_called_at:
                inc.brigade_called_at = now
                log_incident(s, inc, "brigade_called", "Пожарные вызваны из симулятора (DEMO — реальный вызов не отправляется)", "симулятор")
        if inc is not None:
            inc.brigade_status = msg.status
            text = {"en_route": "Пожарная бригада выехала (DEMO)", "arrived": "Пожарная бригада прибыла на объект (DEMO)",
                    "attack": "Бригада начала тушение (DEMO)", "extinguished": "Пожар ликвидирован бригадой (DEMO)",
                    "returning": "Бригада убывает с объекта (DEMO)"}[msg.status]
            if msg.status == "arrived":
                inc.brigade_arrived_at = now
                if msg.elapsed_s is not None:
                    inc.brigade_travel_s = round(msg.elapsed_s)
                    text += f": прибытие через {round(msg.elapsed_s)} с после вызова (время симуляции)"
                elif inc.brigade_called_at:
                    text += f": прибытие через {round(secs(now, inc.brigade_called_at))} с после вызова"
            if msg.status == "extinguished":
                inc.brigade_done_at = now
            log_incident(s, inc, "brigade_" + msg.status, text, "пожарная бригада")
            _city(s, inc, out, (msg.model_extra or {}).get("source"), (msg.model_extra or {}).get("cause"))
            e = add_event(s, msg.site_id, "brigade_" + msg.status, zone_id=inc.zone_id, category="brigade", source="sim")
            out += [("ui", {"type": "incident", "data": inc_dict(inc, _logs(s, inc))}), ("ui", {"type": "event", "data": ev_dict(e)})]

    elif isinstance(msg, S.Ack):
        c = s.get(M.Command, msg.command_id)
        if c:
            c.acked = msg.ok
            out.append(("ui", {"type": "command_ack", "data": {"command_id": c.id, "action": c.action, "ok": msg.ok}}))
    s.commit()
    return out


# ---------------- periodic checks ----------------
def check_offline(s: Session) -> Out:
    out: Out = []
    limit = utcnow() - timedelta(seconds=OFFLINE_SECONDS)
    devs = s.scalars(select(M.Device).where(M.Device.last_seen.is_not(None), M.Device.last_seen < limit,
                                            M.Device.state != "offline")).all()
    for d in devs:
        prev, d.state = d.state, "offline"
        e = add_event(s, d.site_id, "offline", device_id=d.id, zone_id=d.zone_id, category=d.device_type, state="offline",
                      prev_state=prev, value={"silent_s": OFFLINE_SECONDS})
        raise_incident(s, d.site_id, d.zone_id, "offline", d.id, "offline", out)
        t = open_task(s, d.id, f"Нет связи более {OFFLINE_SECONDS} с")
        out += [("ui", {"type": "device", "data": dev_dict(d)}), ("ui", {"type": "event", "data": ev_dict(e)})]
        if t:
            out.append(("ui", {"type": "repair_task", "data": task_dict(t)}))
    s.commit()
    return out


REQUERY_S = int(os.getenv("REQUERY_S", "60"))


def check_requery(s: Session) -> Out:
    """Server-side re-query (for devices without their own fire panel, e.g. the ESP32 stand): a single detector that keeps
    the alarm for REQUERY_S seconds after warm-up confirms the fire — steam and vape aerosol settle much sooner."""
    out: Out = []
    for inc in s.scalars(select(M.Incident).where(M.Incident.kind == "fire", M.Incident.level == "attention", M.Incident.status.in_(OPEN))).all():
        if secs(utcnow(), inc.opened_at) < REQUERY_S:
            continue
        devs = [s.get(M.Device, i) for i in inc.device_ids or []]
        live = [d for d in devs if d and d.state == "alarm" and not Q.in_warmup(d.id)]
        if not live:
            continue
        inc.level, inc.level_at = "fire", utcnow()
        log_incident(s, inc, "confirmed", f"перезапрос: {live[0].id} держит тревогу дольше {REQUERY_S} с")
        _city(s, inc, out)
        if AUTO_DISPATCH == "confirmed" and not inc.brigade_status:
            out += dispatch_brigade(s, inc, "автоматически (пожар подтверждён перезапросом)")
        else:
            out.append(("ui", {"type": "incident", "data": inc_dict(inc, _logs(s, inc))}))
    s.commit()
    return out


def check_escalation(s: Session) -> Out:
    out: Out = []
    limit = utcnow() - timedelta(seconds=ESCALATE_SECONDS)
    incs = s.scalars(select(M.Incident).where(M.Incident.status == "new", M.Incident.escalated.is_(False),
                                              M.Incident.level.in_(("fire", "gas")), M.Incident.level_at < limit)).all()
    for inc in incs:
        inc.escalated = True
        log_incident(s, inc, "escalated",
                     f"Не принято оператором за {ESCALATE_SECONDS} с: включены сирены и эвакуация.")
        for action in ("siren_on", "evacuation_on"):
            out += send_command(s, S.CommandIn(site_id=inc.site_id, action=action, actor="автоэскалация"))
        if inc.level == "fire" and AUTO_DISPATCH != "off" and not inc.brigade_status:
            out += dispatch_brigade(s, inc, "автоэскалация")
        else:
            out.append(("ui", {"type": "incident", "data": inc_dict(inc, _logs(s, inc))}))
    s.commit()
    return out


def _not_finished():
    """A fire the brigade has already put out is history: a new fire on the same site is a new incident."""
    from sqlalchemy import or_
    return or_(M.Incident.brigade_status.is_(None), M.Incident.brigade_status.not_in(("extinguished", "returning")))


def _city(s: Session, inc: M.Incident, out: Out, source: str | None = None, cause: str | None = None):
    """Keep the city fire registry in sync with a confirmed fire in a connected object."""
    try:
        s.flush()
        rec = C.record_from_incident(s, inc, _logs(s, inc))
        if rec is not None and source:
            rec.source = source
        if rec is not None and cause in C.CAUSE_RU:
            rec.cause = cause
        if rec is not None:
            s.flush()
            out.append(("ui", {"type": "city_fire", "data": C.fire_dict(rec)}))
    except Exception:  # the registry must never break alarm handling
        import logging
        logging.getLogger("tutinguard").exception("city registry update failed")


def _logs(s: Session, inc: M.Incident):
    return s.scalars(select(M.IncidentLog).where(M.IncidentLog.incident_id == inc.id).order_by(M.IncidentLog.id)).all()


def dispatch_brigade(s: Session, inc: M.Incident, actor: str) -> Out:
    """DEMO: build the 101 call card and send the virtual brigade to the simulator. Nothing leaves this system."""
    if inc.kind != "fire":
        raise ValueError("пожарную бригаду вызывают только по пожару")
    if inc.brigade_status:
        raise ValueError("бригада уже вызвана")
    now = utcnow()
    inc.brigade_status, inc.brigade_called_at, inc.brigade_eta_s = "called", now, BRIGADE_ETA_S
    card = call_card(s, inc)
    log_incident(s, inc, "brigade_called", "Вызов 101 сформирован и «передан» (DEMO — реальный вызов не отправляется). " + card["text"], actor)
    out = send_command(s, S.CommandIn(site_id=inc.site_id, action="dispatch_brigade", zones=[inc.zone_id] if inc.zone_id else [],
                                      incident_id=inc.id, eta_s=BRIGADE_ETA_S, actor=actor))
    out.append(("ui", {"type": "call_101_demo", "data": card}))
    out.append(("ui", {"type": "incident", "data": inc_dict(inc, _logs(s, inc))}))
    return out


def call_card(s: Session, inc: M.Incident) -> dict:
    site = s.get(M.Site, inc.site_id)
    zone = s.get(M.Zone, inc.zone_id) if inc.zone_id else None
    people = s.scalars(select(M.Occupant).where(M.Occupant.site_id == inc.site_id)).all()
    inside = [o for o in people if o.status not in ("evacuated",)]
    hurt = [o for o in people if o.injury not in ("none",)]
    return {"demo": True, "incident_id": inc.id, "address": site.address if site else "", "site": site.name if site else inc.site_id,
            "zone": zone.name if zone else inc.zone_id, "floor": zone.floor if zone else None, "kind": inc.kind,
            "people_inside": len(inside), "injured": [{"name": o.name, "injury": o.injury} for o in hurt],
            "text": f"DEMO. Пожар: {site.name if site else inc.site_id}, {site.address if site else ''}, "
                    f"зона «{zone.name if zone else inc.zone_id}». Внутри людей: {len(inside)}. Пострадавших: {len(hurt)}."}


def send_command(s: Session, cmd: S.CommandIn) -> Out:
    c = M.Command(id="cmd-" + secrets.token_hex(4), site_id=cmd.site_id, action=cmd.action,
                  payload={"zones": cmd.zones, "device_id": cmd.device_id}, actor=cmd.actor)
    s.add(c)
    s.flush()
    payload = {"type": "command", "schema": "1.0", "ts": iso(c.ts), "command_id": c.id, "site_id": cmd.site_id,
               "action": cmd.action, "zones": cmd.zones, "device_id": cmd.device_id, "by": cmd.actor}
    if cmd.incident_id is not None:
        payload["incident_id"] = cmd.incident_id
    if cmd.eta_s is not None:
        payload["eta_s"] = cmd.eta_s
    return [("sim", payload), ("ui", {"type": "command", "data": payload})]


# ---------------- operator actions ----------------
def incident_action(s: Session, inc_id: int, action: str, body: S.IncidentAction) -> tuple[dict, Out]:
    inc = s.get(M.Incident, inc_id)
    if inc is None:
        raise KeyError("incident not found")
    out: Out = []
    if inc.status == "closed":
        raise ValueError("incident already closed")
    now = utcnow()
    if action == "ack":
        if inc.ack_at is None:
            inc.ack_at = now
        inc.status = "acknowledged"
        log_incident(s, inc, "ack", f"время реакции {round(secs(now, inc.opened_at))} с", body.actor)
    elif action == "assign":
        if body.assignee_id is None:
            raise ValueError("assignee_id is required")
        u = s.get(M.User, body.assignee_id)
        inc.assignee_id = body.assignee_id
        inc.ack_at = inc.ack_at or now
        inc.status = "assigned"
        log_incident(s, inc, "assign", f"назначен: {u.name if u else body.assignee_id}", body.actor)
    elif action == "dispatch":
        inc.ack_at = inc.ack_at or now
        if inc.status == "new":
            inc.status = "acknowledged"
        out += dispatch_brigade(s, inc, body.actor)
    elif action == "checking":
        inc.ack_at = inc.ack_at or now
        inc.status = "checking"
        log_incident(s, inc, "checking", body.comment or "ответственный выехал на место", body.actor)
    elif action == "close":
        if body.result is None:
            raise ValueError("result is required to close an incident")
        inc.ack_at = inc.ack_at or now
        inc.status, inc.result, inc.closed_at, inc.comment = "closed", body.result, now, body.comment
        log_incident(s, inc, "close", f"{body.result}. {body.comment}".strip(), body.actor)
        if inc.kind == "fire":
            _city(s, inc, out)
        if inc.kind == "risk":
            fc = s.scalar(select(M.Forecast).where(M.Forecast.incident_id == inc.id, M.Forecast.status == "open"))
            if fc:
                fc.status = "closed"
        for did in inc.device_ids or []:
            d = s.get(M.Device, did)
            if d is None:
                continue
            if body.result == "false_alarm":
                d.false_alarms += 1
                if d.false_alarms >= FALSE_ALARM_LIMIT and not d.suspicious:
                    d.suspicious = True
                    t = open_task(s, d.id, f"Частые ложные срабатывания ({d.false_alarms})")
                    if t:
                        out.append(("ui", {"type": "repair_task", "data": task_dict(t)}))
            elif body.result == "device_fault":
                t = open_task(s, d.id, "Неисправность по итогам проверки")
                if t:
                    out.append(("ui", {"type": "repair_task", "data": task_dict(t)}))
            out.append(("ui", {"type": "device", "data": dev_dict(d)}))
    else:
        raise ValueError("unknown action")
    s.commit()
    logs = s.scalars(select(M.IncidentLog).where(M.IncidentLog.incident_id == inc.id).order_by(M.IncidentLog.id)).all()
    data = inc_dict(inc, logs)
    out.append(("ui", {"type": "incident", "data": data}))
    return data, out


# ---------------- AI forecast ----------------
LATEST_RISK: dict[str, list[dict]] = {}
_HIGH: dict[tuple, datetime] = {}   # zone -> sensor time when the risk became high
_LOW: dict[tuple, datetime] = {}
FORECAST_MIN = 5       # minutes of sustained high risk before a forecast incident is raised
CLEAR_MIN = 30         # minutes of sustained low risk before it is closed automatically
MIN_HISTORY = 20       # minutes of data needed before forecasting


def confirm_forecast(s: Session, site_id: str, zone_id, fire_inc: M.Incident, vts, out: Out):
    fc = s.scalar(select(M.Forecast).where(M.Forecast.site_id == site_id, M.Forecast.zone_id == zone_id,
                                           M.Forecast.status == "open"))
    if fc is None:
        return
    lead = round(secs(vts, fc.opened_vts) / 60, 1) if fc.opened_vts else None
    fc.status, fc.lead_min = "confirmed", lead
    log_incident(s, fire_inc, "ai_forecast", f"AI-прогноз #{fc.incident_id} предупредил об этой зоне за {lead} мин до тревоги")
    risk = s.get(M.Incident, fc.incident_id)
    if risk and risk.status != "closed":
        risk.status, risk.result, risk.closed_at = "closed", "forecast_confirmed", utcnow()
        log_incident(s, risk, "confirmed", f"прогноз подтвердился: тревога через {lead} мин (инцидент #{fire_inc.id})")
        out.append(("ui", {"type": "incident", "data": inc_dict(risk, _logs(s, risk))}))


def _manage_forecast(s: Session, site_id: str, zone: M.Zone, res: dict, vts_end, threshold: float) -> Out:
    """Open a forecast after the risk stays high for FORECAST_MIN minutes of sensor time; close it after it stays
    low for CLEAR_MIN minutes. Sensor time (not wall time) makes this behave the same at x1 and at x60."""
    out: Out = []
    key = (site_id, zone.id)
    if res["level"] == "high":
        _HIGH.setdefault(key, vts_end)
        _LOW.pop(key, None)
    elif res["prob"] < threshold / 2:
        _LOW.setdefault(key, vts_end)
        _HIGH.pop(key, None)
    else:
        _HIGH.pop(key, None)
        _LOW.pop(key, None)
    high_for = secs(vts_end, _HIGH[key]) / 60 if key in _HIGH else -1
    low_for = secs(vts_end, _LOW[key]) / 60 if key in _LOW else -1
    fc = s.scalar(select(M.Forecast).where(M.Forecast.site_id == site_id, M.Forecast.zone_id == zone.id,
                                           M.Forecast.status == "open"))
    # during an active fire anywhere on the site, smoke drifting into other zones is not a forecast
    burning = s.scalar(select(M.Incident.id).where(M.Incident.site_id == site_id, M.Incident.kind.in_(("fire", "gas")),
                                                M.Incident.status.in_(OPEN)).limit(1))
    if fc is None and high_for >= FORECAST_MIN and burning is None:
        inc = M.Incident(site_id=site_id, zone_id=zone.id, kind="risk", level="forecast", device_ids=[])
        s.add(inc)
        s.flush()
        why = "; ".join(res["reasons"]) or "совокупность слабых признаков"
        log_incident(s, inc, "forecast", f"AI: вероятность возгорания {res['prob']:.0%} в ближайшие {res['horizon_min']} мин. "
                                         f"Признаки: {why}. {res.get('advice') or ''}".strip(), "ai")
        s.add(M.Forecast(incident_id=inc.id, site_id=site_id, zone_id=zone.id, opened_vts=_HIGH[key],
                         prob_max=res["prob"], reasons=res["reasons"]))
        out.append(("ui", {"type": "incident", "data": inc_dict(inc, _logs(s, inc))}))
    elif fc is not None:
        fc.prob_max = max(fc.prob_max, res["prob"])
        if res["reasons"]:
            fc.reasons = res["reasons"]
        if low_for >= CLEAR_MIN:
            fc.status = "cleared"
            inc = s.get(M.Incident, fc.incident_id)
            if inc and inc.status != "closed":
                inc.status, inc.result, inc.closed_at = "closed", "risk_cleared", utcnow()
                log_incident(s, inc, "auto_close", f"признаки исчезли: риск низкий {CLEAR_MIN}+ мин", "ai")
                out.append(("ui", {"type": "incident", "data": inc_dict(inc, _logs(s, inc))}))
    return out


def ai_tick(s: Session, predictor) -> Out:
    out: Out = []
    if predictor is None:
        return out
    for site in s.scalars(select(M.Site)).all():
        snapshot = []
        for zone in s.scalars(select(M.Zone).where(M.Zone.site_id == site.id).order_by(M.Zone.id)).all():
            g = AIBUF.grid(site.id, zone.id)
            if g is None:
                continue
            grid, end = g
            res = predictor.predict(grid, zone.type)
            vts_end = datetime.fromtimestamp(end * 60, timezone.utc)
            if res["history_min"] < MIN_HISTORY:
                res.update(level="low", reasons=[], advice=None, note=f"копим историю ({res['history_min']} из {MIN_HISTORY} мин)")
            res.update(zone_id=zone.id, zone=zone.name, vts=iso(vts_end))
            s.add(M.Risk(site_id=site.id, zone_id=zone.id, vts=vts_end, prob=res["prob"], level=res["level"],
                         reasons=res["reasons"]))
            out += _manage_forecast(s, site.id, zone, res, vts_end, predictor.threshold)
            snapshot.append(res)
        if snapshot:
            LATEST_RISK[site.id] = snapshot
            out.append(("ui", {"type": "risk", "data": {"site_id": site.id, "zones": snapshot}}))
            out.append(("sim", {"type": "risk", "site_id": site.id,
                                "zones": [{"zone_id": r["zone_id"], "prob": r["prob"], "level": r["level"]} for r in snapshot]}))
    s.commit()
    return out
