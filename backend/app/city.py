"""City monitoring centre (demo: Kyzylorda): connected objects on a map, fire registry with a full timeline for the
fire protocol, analytics, and an optional local LLM (Ollama) that drafts protocol text and answers questions.

All history generated here is SYNTHETIC demo data (flag `demo=True`) — it only shows what the centre would look like."""
from __future__ import annotations

import json
import math
import os
import random
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import db as M
from .db import utcnow

CITY = os.getenv("CITY_NAME", "Кызылорда")
CENTER = (44.8488, 65.4823)
OLLAMA_URL = os.getenv("OLLAMA_URL", "").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b-instruct")

KIND_RU = {"residential": "Жилой дом", "school": "Школа", "kindergarten": "Детский сад", "hospital": "Больница", "mall": "ТРЦ / магазин",
           "office": "Офис", "dorm": "Общежитие", "warehouse": "Склад", "industrial": "Предприятие", "vehicle": "Транспорт",
           "open": "Открытая территория (камыш, трава)", "cafe": "Кафе / ресторан"}
CAUSE_RU = {"electrical": "Неисправность электросети", "smoking": "Неосторожное обращение с огнём (курение)", "heater": "Нарушение правил эксплуатации обогревателей / печей",
            "cooking": "Приготовление пищи без присмотра", "battery": "Аккумуляторы (самокаты, повербанки)", "children": "Детская шалость с огнём",
            "arson": "Поджог", "grass": "Пал сухой травы / камыша", "gas": "Газовое оборудование", "unknown": "Причина устанавливается"}
DETECT_RU = {"auto": "Автоматически (TutinGuard)", "call": "Звонок очевидца 101/112", "patrol": "Обнаружено патрулём"}

# demo geography: districts are coarse sectors around the centre (not official boundaries)
DISTRICTS = [("Центр", 44.851, 65.505, .012), ("Северный", 44.875, 65.500, .014), ("Южный", 44.832, 65.505, .012),
             ("Западный", 44.846, 65.455, .014), ("Восточный", 44.853, 65.548, .013), ("Левобережье", 44.818, 65.470, .016)]
STATIONS = [("ПЧ-1", "Пожарная часть №1 (демо)", 44.852, 65.500), ("ПЧ-2", "Пожарная часть №2 (демо)", 44.874, 65.488),
            ("ПЧ-3", "Пожарная часть №3 (демо)", 44.825, 65.478), ("ПЧ-4", "Пожарная часть №4 (демо)", 44.851, 65.545)]
# connected TutinGuard objects; the first five are the 3D scenes
OBJECTS = [
    ("office-01", "Офис IT-компании (демо)", "office", "Центр", 44.8503, 65.5021, "г. Кызылорда, ул. Тестовая, 1 (тестовые данные)"),
    ("kzo-school-12", "Школа-лицей №12 (демо)", "school", "Северный", 44.8712, 65.4968, "г. Кызылорда, Северный р-н (демо)"),
    ("kzo-hospital-1", "Городская больница №1 · терапия (демо)", "hospital", "Центр", 44.8461, 65.5112, "г. Кызылорда, Центр (демо)"),
    ("kzo-mall-1", "ТРЦ «Сырдария» (демо)", "mall", "Восточный", 44.8545, 65.5392, "г. Кызылорда, Восточный р-н (демо)"),
    ("kzo-dorm-3", "Общежитие №3 (демо)", "dorm", "Западный", 44.8448, 65.4602, "г. Кызылорда, Западный р-н (демо)"),
    ("kzo-school-7", "Школа №7 (демо)", "school", "Южный", 44.8335, 65.5004, ""), ("kzo-kg-5", "Детский сад «Балапан» (демо)", "kindergarten", "Северный", 44.8790, 65.5080, ""),
    ("kzo-kg-11", "Детский сад №11 (демо)", "kindergarten", "Левобережье", 44.8172, 65.4655, ""), ("kzo-hosp-child", "Детская больница (демо)", "hospital", "Западный", 44.8490, 65.4510, ""),
    ("kzo-college", "Колледж (демо)", "school", "Восточный", 44.8580, 65.5520, ""), ("kzo-dorm-1", "Общежитие №1 (демо)", "dorm", "Южный", 44.8302, 65.5110, ""),
    ("kzo-market", "Рынок (демо)", "mall", "Центр", 44.8475, 65.4950, ""), ("kzo-wh-2", "Склад ТОО (демо)", "warehouse", "Левобережье", 44.8120, 65.4810, ""),
]
CAUSE_SOURCES = {
    "electrical": ["короткое замыкание в электропроводке", "перегрузка удлинителя", "неисправная розетка", "электрощит"],
    "smoking": ["окурок на диване", "окурок в мусоропроводе", "сигарета на кровати"],
    "heater": ["самодельный обогреватель", "масляный радиатор у шторы", "печь в частном доме"],
    "cooking": ["сковорода с маслом на плите", "фритюр на кухне кафе", "забытая кастрюля"],
    "battery": ["зарядка электросамоката", "повербанк", "аккумулятор ноутбука"],
    "children": ["спички", "зажигалка"], "arson": ["поджог двери", "поджог мусорного контейнера"],
    "grass": ["пал камыша у реки", "сухая трава на пустыре"], "gas": ["утечка газа у плиты", "газовый баллон"], "unknown": ["устанавливается"],
}
ROOMS = {"residential": ["кухня", "жилая комната", "балкон", "подвал"], "school": ["кабинет информатики", "столовая", "туалет", "спортзал"],
         "kindergarten": ["пищеблок", "группа"], "hospital": ["палата", "процедурная", "подсобка"], "mall": ["фудкорт", "склад", "магазин"],
         "office": ["серверная", "кухня", "опенспейс"], "dorm": ["комната", "общая кухня", "прачечная"], "warehouse": ["стеллажный склад"],
         "industrial": ["цех"], "vehicle": ["моторный отсек"], "open": ["прибрежная полоса"], "cafe": ["кухня"]}


def _dist_km(a, b):
    return math.hypot((a[0] - b[0]) * 111.0, (a[1] - b[1]) * 111.0 * math.cos(math.radians(a[0])))


def seed_city(s: Session):
    """Coordinates for connected objects, fire stations and two years of synthetic fire history (once)."""
    if s.scalar(select(func.count()).select_from(M.FireStation)) == 0:
        for sid, name, lat, lon in STATIONS:
            s.add(M.FireStation(id=sid, name=name, city=CITY, lat=lat, lon=lon))
    for sid, name, kind, dist, lat, lon, addr in OBJECTS:
        site = s.get(M.Site, sid)
        if site is None:
            site = M.Site(id=sid, name=name, kind=kind, address=addr or f"г. {CITY}, {dist} р-н (демо)")
            s.add(site)
        if site.lat is None:
            site.lat, site.lon, site.city, site.district = lat, lon, CITY, dist
            if sid == "office-01":
                site.address = addr
        if site.passport is None and sid in PASSPORTS:
            site.passport = PASSPORTS[sid]
    s.flush()
    if s.scalar(select(func.count()).select_from(M.FireRecord)) == 0:
        _seed_history(s)
    s.commit()


def _seed_history(s: Session, years: float = 2.0):
    rnd = random.Random(2026)
    now = utcnow().replace(minute=0, second=0, microsecond=0)
    start = now - timedelta(days=int(365 * years))
    kinds = [("residential", 46), ("open", 18), ("vehicle", 8), ("mall", 4), ("cafe", 4), ("warehouse", 4), ("industrial", 3), ("dorm", 3),
             ("school", 2), ("office", 3), ("hospital", 1), ("kindergarten", 1)]
    by_kind_cause = {"open": [("grass", 85), ("arson", 10), ("smoking", 5)], "vehicle": [("electrical", 60), ("arson", 25), ("unknown", 15)],
                     "cafe": [("cooking", 60), ("electrical", 30), ("gas", 10)]}
    default_causes = [("electrical", 34), ("smoking", 18), ("heater", 14), ("cooking", 12), ("battery", 6), ("children", 4), ("arson", 5), ("gas", 3), ("unknown", 4)]
    pick = lambda pairs: rnd.choices([p[0] for p in pairs], [p[1] for p in pairs])[0]
    stations = [(st[0], (st[2], st[3])) for st in STATIONS]
    obj_kind = {o[0]: o for o in OBJECTS}
    n = int(330 * years)
    for _ in range(n):
        day = start + timedelta(days=rnd.random() * (now - start).days)
        m = day.month
        kind = pick(kinds)
        if kind == "open" and m in (12, 1, 2):
            kind = "residential"
        causes = by_kind_cause.get(kind, default_causes)
        cause = pick(causes)
        if cause == "heater" and m in (5, 6, 7, 8):
            cause = "electrical"
        if cause == "grass" and m not in (3, 4, 5, 9, 10, 11, 8):
            cause = "electrical"
        hour = int(rnd.choices(range(24), [2, 2, 2, 2, 1, 1, 2, 3, 4, 4, 5, 5, 6, 6, 6, 6, 7, 8, 9, 9, 8, 6, 4, 3])[0])
        call = day.replace(hour=hour, minute=rnd.randint(0, 59))
        dname, dlat, dlon, r = rnd.choice(DISTRICTS) if kind != "open" else rnd.choice([DISTRICTS[5], DISTRICTS[3], DISTRICTS[4]])
        lat, lon = dlat + rnd.gauss(0, r * .7), dlon + rnd.gauss(0, r * 1.2)
        site_id, name, addr = None, KIND_RU[kind], f"г. {CITY}, {dname} р-н (демо)"
        connected = [o for o in OBJECTS if o[2] == kind or (kind == "dorm" and o[2] == "dorm")]
        if connected and rnd.random() < .35:  # some fires happened in connected objects
            o = rnd.choice(connected)
            site_id, name, dname, lat, lon = o[0], o[1], o[3], o[4] + rnd.gauss(0, .0003), o[5] + rnd.gauss(0, .0003)
            addr = o[6] or addr
        detection = "auto" if site_id else ("patrol" if kind == "open" and rnd.random() < .3 else "call")
        # detection delay: automatic systems call in about a minute, people notice smoke much later
        ign_to_call = rnd.uniform(.6, 2.5) if detection == "auto" else (rnd.uniform(4, 25) if cause not in ("smoking", "heater") else rnd.uniform(8, 50))
        sid, sp = min(stations, key=lambda st: _dist_km(st[1], (lat, lon)))
        km = _dist_km(sp, (lat, lon))
        travel = 1.2 + km * rnd.uniform(1.6, 2.4) + (rnd.uniform(1, 4) if hour in (8, 9, 17, 18, 19) else 0) + (rnd.uniform(0, 3) if m in (12, 1, 2) else 0)
        dispatch = rnd.uniform(.5, 1.5)
        severity = (ign_to_call + travel) / 12 * (1.5 if cause in ("smoking", "heater") else 1) * (.4 if kind == "open" else 1)
        localize = rnd.uniform(4, 15) * (1 + min(severity, 2.5) * .35)
        extinguish = localize + rnd.uniform(5, 35) * (1 + min(severity, 2.5) * .3)
        area = round(max(1, rnd.lognormvariate(1.6, .9) * (1 + severity)), 1) if kind != "open" else round(rnd.lognormvariate(5, 1), 0)
        injured = sum(rnd.random() < min(.5, .04 * severity) for _ in range(3)) if kind not in ("open", "vehicle") else 0
        deaths = 1 if kind == "residential" and severity > 2.2 and rnd.random() < .12 else 0
        evac = rnd.randint(0, 6) if kind == "residential" else rnd.randint(5, 120) if kind in ("school", "mall", "hospital", "dorm", "kindergarten", "office") else 0
        rec = M.FireRecord(
            city=CITY, district=dname, site_id=site_id, object_name=name, object_kind=kind, address=addr, lat=round(lat, 5), lon=round(lon, 5),
            room=rnd.choice(ROOMS.get(kind, ["помещение"])), cause=cause, source=rnd.choice(CAUSE_SOURCES[cause]), detection=detection,
            ignition_at=call - timedelta(minutes=ign_to_call), detected_at=call - timedelta(minutes=min(ign_to_call, rnd.uniform(.2, 1.0) if detection == "auto" else ign_to_call * .5)),
            call_at=call, dispatched_at=call + timedelta(minutes=dispatch), arrived_at=call + timedelta(minutes=dispatch + travel),
            localized_at=call + timedelta(minutes=dispatch + travel + localize), extinguished_at=call + timedelta(minutes=dispatch + travel + extinguish),
            station_id=sid, units=1 + (severity > 1.5) + (area > 80), area_m2=area, evacuated=evac, rescued=rnd.randint(0, 2) if severity > 1.8 and kind == "residential" else 0,
            injured=injured, deaths=deaths, damage_kzt=int(area * rnd.uniform(40_000, 160_000)) if kind != "open" else int(area * 50), status="closed", demo=True)
        s.add(rec)


# ---------------- live incidents → fire registry ----------------
def record_from_incident(s: Session, inc: M.Incident, logs) -> M.FireRecord | None:
    """When a real (simulated) fire in a connected object is confirmed and handled, put it into the city registry."""
    if inc.kind != "fire" or inc.level != "fire":
        return None
    rec = s.scalar(select(M.FireRecord).where(M.FireRecord.incident_id == inc.id))
    site = s.get(M.Site, inc.site_id)
    zone = s.get(M.Zone, inc.zone_id) if inc.zone_id else None
    if rec is None:
        rec = M.FireRecord(incident_id=inc.id, site_id=inc.site_id, call_at=inc.opened_at, demo=False, cause="unknown", source="устанавливается",
                           detection="auto", status="active")
        s.add(rec)
    rec.city = (site.city if site else "") or CITY
    rec.district = site.district if site else ""
    rec.object_name = site.name if site else inc.site_id
    rec.object_kind = {"residential": "dorm"}.get(site.kind, site.kind) if site else "office"
    rec.address, rec.lat, rec.lon = (site.address if site else ""), (site.lat if site else None), (site.lon if site else None)
    rec.room = zone.name if zone else ""
    first = next((l.ts for l in logs if l.action == "created"), inc.opened_at)
    rec.detected_at = first
    rec.ignition_at = rec.ignition_at or first
    for l in logs:  # the forecast tells how early the problem was visible
        if l.action == "ai_forecast" and "за " in l.comment:
            try:
                mins = float(l.comment.split("за ")[1].split(" мин")[0])
                rec.ignition_at = first - timedelta(minutes=mins)
                rec.notes = (rec.notes + " " if rec.notes else "") + f"AI-прогноз предупредил за {mins:.0f} мин до срабатывания датчиков."
            except Exception:
                pass
    rec.call_at = inc.brigade_called_at or inc.opened_at
    rec.dispatched_at = inc.brigade_called_at
    rec.arrived_at = inc.brigade_arrived_at
    rec.localized_at = inc.brigade_done_at
    rec.extinguished_at = inc.brigade_done_at or (inc.closed_at if inc.result == "confirmed_fire" else None)
    rec.station_id = rec.station_id or "ПЧ-1"
    rec.status = "closed" if inc.status == "closed" or inc.brigade_status == "extinguished" else "active"
    occ = s.scalars(select(M.Occupant).where(M.Occupant.site_id == inc.site_id)).all()
    rec.evacuated = sum(o.status == "evacuated" for o in occ)
    rec.injured = sum(o.injury not in ("none", "") for o in occ)
    if inc.comment:
        rec.notes = (rec.notes or "") + (" " if rec.notes else "") + inc.comment
    return rec


# ---------------- serializers & analytics ----------------
def _iso(d):
    from .logic import iso
    return iso(d)


def _mins(a, b):
    from .logic import secs
    return round(secs(a, b) / 60, 1) if a and b else None


def fire_dict(r: M.FireRecord, full: bool = False) -> dict:
    d = {"id": r.id, "district": r.district, "site_id": r.site_id, "incident_id": r.incident_id, "object_name": r.object_name, "object_kind": r.object_kind,
         "kind_ru": KIND_RU.get(r.object_kind, r.object_kind), "lat": r.lat, "lon": r.lon, "cause": r.cause, "cause_ru": CAUSE_RU.get(r.cause, r.cause),
         "detection": r.detection, "call_at": _iso(r.call_at), "status": r.status, "demo": r.demo,
         "response_min": _mins(r.arrived_at, r.call_at), "detect_delay_min": _mins(r.call_at, r.ignition_at), "injured": r.injured, "deaths": r.deaths, "area_m2": r.area_m2}
    if full:
        d.update(address=r.address, room=r.room, source=r.source, detection_ru=DETECT_RU.get(r.detection, r.detection), station_id=r.station_id, units=r.units,
                 evacuated=r.evacuated, rescued=r.rescued, damage_kzt=r.damage_kzt, notes=r.notes, protocol_text=r.protocol_text, city=r.city,
                 timeline=[{"key": k, "label": lbl, "ts": _iso(v)} for k, lbl, v in [
                     ("ignition_at", "Возникновение (оценка)", r.ignition_at), ("detected_at", "Обнаружение", r.detected_at), ("call_at", "Сообщение в 101", r.call_at),
                     ("dispatched_at", "Выезд подразделения", r.dispatched_at), ("arrived_at", "Прибытие на место", r.arrived_at),
                     ("localized_at", "Локализация", r.localized_at), ("extinguished_at", "Ликвидация", r.extinguished_at)]],
                 durations={"detect_to_call_min": _mins(r.call_at, r.detected_at), "call_to_arrival_min": _mins(r.arrived_at, r.call_at),
                            "arrival_to_localize_min": _mins(r.localized_at, r.arrived_at), "total_min": _mins(r.extinguished_at, r.ignition_at)})
    return d


def overview(s: Session, days: int, district: str | None = None) -> dict:
    since = utcnow() - timedelta(days=days)
    q = select(M.FireRecord).where(M.FireRecord.call_at >= since)
    if district:
        q = q.where(M.FireRecord.district == district)
    recs = s.scalars(q).all()
    resp = [x for x in (_mins(r.arrived_at, r.call_at) for r in recs) if x is not None]
    det = defaultdict(list)
    for r in recs:
        v = _mins(r.call_at, r.ignition_at)
        if v is not None:
            det[r.detection].append(v)
    med = lambda v: round(sorted(v)[len(v) // 2], 1) if v else None
    by_month = Counter(r.call_at.strftime("%Y-%m") for r in recs)
    heat = [[0] * 24 for _ in range(7)]
    from .logic import aware
    for r in recs:
        t = aware(r.call_at) + timedelta(hours=5)  # local time (UTC+5)
        heat[t.weekday()][t.hour] += 1
    resp_d = defaultdict(list)
    for r in recs:
        v = _mins(r.arrived_at, r.call_at)
        if v is not None:
            resp_d[r.district].append(v)
    sites = s.scalars(select(M.Site).where(M.Site.lat.is_not(None))).all()
    active = s.scalars(select(M.Incident).where(M.Incident.status.in_(("new", "acknowledged", "assigned", "checking")),
                                                 M.Incident.level.in_(("fire", "gas", "attention")))).all()
    return {
        "city": CITY, "days": days, "total": len(recs), "demo_share": round(sum(r.demo for r in recs) / len(recs), 2) if recs else None,
        "injured": sum(r.injured for r in recs), "deaths": sum(r.deaths for r in recs), "evacuated": sum(r.evacuated for r in recs),
        "damage_kzt": sum(r.damage_kzt for r in recs), "area_m2": round(sum(r.area_m2 for r in recs if r.object_kind != "open")),
        "response_median_min": med(resp), "response_p90_min": round(sorted(resp)[int(len(resp) * .9)], 1) if resp else None,
        "late_share": round(sum(v > 10 for v in resp) / len(resp), 2) if resp else None,
        "detect_delay_median": {k: med(v) for k, v in det.items()},
        "by_month": dict(sorted(by_month.items())), "by_cause": dict(Counter(r.cause for r in recs).most_common()),
        "by_kind": dict(Counter(r.object_kind for r in recs).most_common()), "by_district": dict(Counter(r.district for r in recs).most_common()),
        "response_by_district": {k: med(v) for k, v in sorted(resp_d.items(), key=lambda kv: -(med(kv[1]) or 0))},
        "heat_weekday_hour": heat,
        "connected_objects": len(sites), "active_alarms": len(active),
        "labels": {"cause": CAUSE_RU, "kind": KIND_RU, "detection": DETECT_RU},
    }


def objects(s: Session) -> list[dict]:
    out = []
    for site in s.scalars(select(M.Site).where(M.Site.lat.is_not(None)).order_by(M.Site.id)).all():
        incs = s.scalars(select(M.Incident).where(M.Incident.site_id == site.id, M.Incident.status.in_(("new", "acknowledged", "assigned", "checking")))).all()
        devs = s.scalars(select(M.Device).where(M.Device.site_id == site.id)).all()
        level = "fire" if any(i.level == "fire" for i in incs) else "gas" if any(i.level == "gas" for i in incs) else \
            "attention" if any(i.level in ("attention", "forecast") for i in incs) else "fault" if any(d.state == "offline" for d in devs) else "ok"
        brig = next((i.brigade_status for i in incs if i.brigade_status), None)
        out.append({"site_id": site.id, "name": site.name, "kind": site.kind, "kind_ru": KIND_RU.get(site.kind, site.kind), "district": site.district,
                    "address": site.address, "lat": site.lat, "lon": site.lon, "level": level, "open_incidents": len(incs), "devices": len(devs),
                    "devices_offline": sum(d.state == "offline" for d in devs), "brigade": brig,
                    "live": bool(site.session_started_at) and len(devs) > 0})
    return out


# pre-incident plans (what a brigade needs on arrival) — demo data
def _pp(entr, hyd, shut, haz, vul, contacts, notes=""):
    return {"entrances": entr, "hydrants": hyd, "shutoffs": shut, "hazards": haz, "vulnerable": vul, "contacts": contacts, "notes": notes}


PASSPORTS = {
    "office-01": _pp(["Главный вход — с улицы, южный фасад", "Запасной выход — северная стена, через холл"],
                     ["Гидрант — 40 м, угол дома, давление в норме", "Гидрант — 120 м, через дорогу"],
                     ["Электрощит ВРУ — холл у входа", "Газа в здании нет"],
                     ["Серверная: ИБП, свинцово-кислотные АКБ 12 шт.", "Кухня: электроплита, микроволновка"],
                     ["Нет постоянных маломобильных сотрудников"],
                     ["Ответственный: Айгерим Серікова, +7 700 000 00 01 (демо)", "Охрана: пост в холле"]),
    "kzo-school-12": _pp(["Главный вход — южный фасад", "Запасной — западное крыло, лестница", "Вход в столовую — двор"],
                         ["Гидрант — 25 м, у ворот школы", "Гидрант — 150 м, ул. Абая"],
                         ["Электрощит — 1 этаж, у вахты", "Газовый ввод столовой — задвижка у входа во двор"],
                         ["Кабинет химии: реактивы в шкафу под замком", "Столовая: газовые плиты"],
                         ["Начальные классы на 1 этаже — до 120 детей", "1 ученик на коляске — класс 2Б"],
                         ["Директор: +7 700 000 00 12 (демо)", "Вахта: круглосуточно"]),
    "kzo-hospital-1": _pp(["Приёмный покой — восточный фасад, пандус", "Главный вход — южный фасад"],
                          ["Гидрант — 30 м, у приёмного покоя", "Внутренний ПК на каждом этаже"],
                          ["Электрощит — подвал, вход с торца", "Кислородная рампа — задвижка в коридоре у палаты 4"],
                          ["Кислород (медицинский) — разводка по палатам", "Спирт и дезсредства — процедурная"],
                          ["Лежачие пациенты — палаты 2 и 5 (до 6 человек)", "Пациенты на ИВЛ — нет"],
                          ["Дежурный врач: +7 700 000 00 21 (демо)"]),
    "kzo-mall-1": _pp(["Главный вход — южный фасад", "Служебный вход — север, разгрузка", "Эвакуационные выходы — восток и запад"],
                      ["Гидрант — 20 м, парковка", "Гидрант — 80 м, разгрузочная зона", "Спринклерная станция — подвал"],
                      ["ГРЩ — служебный коридор", "Газ фуд-корта — задвижка у служебного входа"],
                      ["Магазин электроники: литий-ионные АКБ на складе", "Фуд-корт: фритюрницы, газ"],
                      ["В выходные — до 800 посетителей", "Детская игровая зона — 2 этаж"],
                      ["Служба эксплуатации: +7 700 000 00 33 (демо)"]),
    "kzo-dorm-3": _pp(["Вход — южный фасад, вахта", "Запасной выход — восточная лестница"],
                      ["Гидрант — 60 м, двор"],
                      ["Электрощит — 1 этаж у вахты", "Газа нет, электроплиты на кухнях этажей"],
                      ["Зарядка электросамокатов в комнатах — частая причина пожаров", "Самодельные обогреватели зимой"],
                      ["Ночью спят до 180 студентов", "1 студент с нарушением слуха — комната 214 (нужно световое оповещение)"],
                      ["Комендант: +7 700 000 00 43 (демо)"]),
}


def hydrants(s: Session):
    """Demo hydrant network around connected objects: status as smart hydrant sensors would report it."""
    rnd = random.Random(77)
    out, n = [], 1
    for sid, name, kind, dist, lat, lon, addr in OBJECTS:
        for k in range(2):
            st = rnd.choices(["ok", "ok", "ok", "ok", "low_pressure", "frozen", "blocked"], k=1)[0]
            out.append({"id": f"ПГ-{n:02d}", "lat": round(lat + rnd.uniform(-.0022, .0022), 5), "lon": round(lon + rnd.uniform(-.003, .003), 5),
                        "status": st, "pressure_bar": {"ok": round(rnd.uniform(2.6, 4.2), 1), "low_pressure": round(rnd.uniform(.6, 1.4), 1),
                                                       "frozen": 0.0, "blocked": round(rnd.uniform(2.5, 3.5), 1)}[st],
                        "near": name, "district": dist})
            n += 1
    return out


def stations(s: Session):
    return [{"id": x.id, "name": x.name, "lat": x.lat, "lon": x.lon} for x in s.scalars(select(M.FireStation)).all()]


# ---------------- protocol text (local LLM or template) ----------------
def _fmt(ts):
    from .logic import aware
    return (aware(ts) + timedelta(hours=5)).strftime("%d.%m.%Y %H:%M") if ts else "—"


def protocol_template(d: dict) -> str:
    tl = {t["key"]: t["ts"] for t in d["timeline"]}
    f = lambda k: _fmt(datetime.fromisoformat(tl[k])) if tl.get(k) else "—"
    du = d["durations"]
    lines = [
        f"ДОНЕСЕНИЕ О ПОЖАРЕ (черновик, DEMO) № {d['id']}",
        "",
        f"1. Объект: {d['object_name']}{'' if d['object_name'] == d['kind_ru'] else ' (' + d['kind_ru'] + ')'}. Адрес: {d['address'] or '—'}. Район: {d['district'] or '—'}.",
        f"2. Место возникновения: {d['room'] or 'устанавливается'}. Предполагаемый источник: {d['source'] or 'устанавливается'}.",
        f"3. Предварительная причина: {d['cause_ru']}.",
        f"4. Способ обнаружения: {d['detection_ru']}.",
        "5. Хронология (время местное):",
        f"   — возникновение (оценка): {f('ignition_at')};",
        f"   — обнаружение: {f('detected_at')};",
        f"   — сообщение в службу 101: {f('call_at')};",
        f"   — выезд подразделения {d['station_id'] or '—'}: {f('dispatched_at')};",
        f"   — прибытие первого подразделения: {f('arrived_at')} (через {du['call_to_arrival_min'] if du['call_to_arrival_min'] is not None else '—'} мин после сообщения);",
        f"   — локализация: {f('localized_at')};",
        f"   — ликвидация открытого горения: {f('extinguished_at')}.",
        f"6. Силы и средства: подразделений — {d['units']}.",
        f"7. Последствия: площадь пожара {d['area_m2']} м²; эвакуировано {d['evacuated']}; спасено {d['rescued']}; пострадало {d['injured']}; погибло {d['deaths']}; "
        f"ориентировочный ущерб {d['damage_kzt']:,} тг.".replace(",", " "),
    ]
    if d.get("notes"):
        lines.append(f"8. Примечания: {d['notes']}")
    lines += ["", "Сведения подлежат проверке дознавателем. Черновик сформирован автоматически по данным системы TutinGuard."]
    if d.get("demo"):
        lines.append("ВНИМАНИЕ: запись из демонстрационного набора данных.")
    return "\n".join(lines)


def llm_available() -> bool:
    if not OLLAMA_URL:
        return False
    try:
        with urllib.request.urlopen(OLLAMA_URL + "/api/tags", timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def llm_generate(prompt: str, timeout: int = 90) -> str | None:
    if not OLLAMA_URL:
        return None
    body = json.dumps({"model": OLLAMA_MODEL, "prompt": prompt, "stream": False, "keep_alive": "60m",
                       "options": {"temperature": .2, "num_predict": int(os.getenv("OLLAMA_MAX_TOKENS", "350"))}}).encode()
    try:
        req = urllib.request.Request(OLLAMA_URL + "/api/generate", data=body, headers={"content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode()).get("response", "").strip() or None
    except Exception:
        return None


def protocol_text(d: dict) -> tuple[str, str]:
    """Returns (text, engine). The template always works; the LLM (if configured) rewrites it into a smooth official text
    strictly from the given facts."""
    draft = protocol_template(d)
    if OLLAMA_URL:
        prompt = ("Ты помогаешь инспектору ДЧС оформить донесение о пожаре. Перепиши черновик официальным деловым языком на русском. "
                  "Используй ТОЛЬКО факты из черновика, ничего не придумывай, не меняй цифры и время. Сохрани нумерацию пунктов.\n\n" + draft)
        out = llm_generate(prompt)
        if out:
            return out, f"LLM ({OLLAMA_MODEL}, локально)"
    return draft, "шаблон"


def ask(question: str, ov: dict) -> tuple[str, str]:
    facts = json.dumps({k: v for k, v in ov.items() if k not in ("heat_weekday_hour", "labels")}, ensure_ascii=False)
    if not OLLAMA_URL:
        return ("Локальная LLM не подключена. Задайте OLLAMA_URL (например http://host.docker.internal:11434) и OLLAMA_MODEL в .env. "
                "Сводка за период: пожаров — {t}, медиана прибытия — {r} мин, основная причина — {c}.".format(
                    t=ov["total"], r=ov["response_median_min"], c=CAUSE_RU.get(next(iter(ov["by_cause"]), "unknown"), "—")), "без LLM")
    prompt = (f"Ты аналитик пожарной безопасности города {CITY}. Ответь кратко (до 6 предложений) на вопрос, опираясь ТОЛЬКО на статистику ниже. "
              f"Если данных не хватает — так и скажи. Помни, что часть данных демонстрационная.\nСтатистика (JSON): {facts}\nВопрос: {question}")
    return (llm_generate(prompt) or "LLM не ответила вовремя."), f"LLM ({OLLAMA_MODEL}, локально)"
