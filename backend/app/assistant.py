"""AI assistant for every role: builds a compact, role-aware snapshot of the object and asks the local LLM (Ollama).

Without an LLM it still answers with a rule-based digest built from the same facts, so the chat never goes silent.
No data leaves the server: the LLM runs locally.
"""
from __future__ import annotations

import json
import os
import urllib.request
from datetime import date, timedelta

from sqlalchemy import select

from . import city as C
from . import db as M
from . import logic as L
from .db import utcnow

ROLE_RU = {"operator": "дежурный оператор пульта", "responsible": "ответственный за пожарную безопасность объекта",
           "technician": "техник по обслуживанию пожарной сигнализации", "admin": "администратор системы",
           "dispatcher": "диспетчер городского центра ЦОУ ДЧС"}
ROLE_TASK = {
    "operator": "Помогай быстро и безопасно действовать при тревоге: давай пошаговые действия, коротко, по делу.",
    "responsible": "Помогай оценивать состояние объекта, готовить сводки руководству и планировать меры безопасности.",
    "technician": "Помогай находить неисправные и подозрительные датчики, расставлять приоритеты обслуживания и объяснять возможные причины.",
    "admin": "Отвечай на вопросы о состоянии объекта и работе системы.",
    "dispatcher": "Помогай диспетчеру оценить обстановку на объекте и подготовить данные для выезда бригады.",
}
STATUS_RU = {"new": "новый, не принят", "acknowledged": "принят", "assigned": "назначен", "checking": "проверка на месте", "closed": "закрыт"}
LEVEL_RU = {"fire": "ПОЖАР", "gas": "УТЕЧКА ГАЗА", "attention": "внимание", "forecast": "ИИ-прогноз риска", "fault": "неисправность"}
DSTATE_RU = {"pre_alarm": "внимание", "alarm": "ТРЕВОГА", "offline": "нет связи", "fault": "неисправен", "test": "тест", "disabled": "отключён"}
BRIGADE_RU = {"called": "вызвана (DEMO)", "en_route": "в пути", "arrived": "прибыла", "attack": "тушение", "extinguished": "пожар ликвидирован",
              "returning": "убывает"}


def _mins(a, b=None) -> int:
    b = b or utcnow()
    return max(0, round((b - L.aware(a)).total_seconds() / 60)) if a else 0


def build_context(s, site_id: str, role: str, incident_id: int | None = None) -> dict:
    site = s.get(M.Site, site_id)
    if site is None:
        raise KeyError("site not found")
    zones = {z.id: z for z in s.scalars(select(M.Zone).where(M.Zone.site_id == site_id)).all()}
    zn = lambda zid: zones[zid].name if zid in zones else (zid or "—")
    devs = s.scalars(select(M.Device).where(M.Device.site_id == site_id)).all()
    incs = s.scalars(select(M.Incident).where(M.Incident.site_id == site_id, M.Incident.status.in_(L.OPEN))
                     .order_by(M.Incident.id.desc()).limit(8)).all()
    people = s.scalars(select(M.Occupant).where(M.Occupant.site_id == site_id)).all()
    risk = sorted(L.LATEST_RISK.get(site_id, []), key=lambda r: -r.get("prob", 0))[:4]

    lines = [f"Объект: {site.name}, адрес: {site.address or '—'}, тип: {site.kind}, этажей: {site.floors}. Местное время: {(utcnow() + timedelta(hours=5)):%H:%M}."]
    focus = s.get(M.Incident, incident_id) if incident_id else None
    if focus is not None and focus not in incs:
        incs = [focus] + list(incs)
    if incs:
        lines.append("Открытые инциденты:")
        for i in incs:
            row = (f"- №{i.id}: {LEVEL_RU.get(i.level, i.level)}, зона «{zn(i.zone_id)}», статус: {STATUS_RU.get(i.status, i.status)}, "
                   f"открыт {_mins(i.opened_at)} мин назад, датчики: {', '.join(i.device_ids or []) or '—'}")
            if i.brigade_status:
                row += f", бригада: {BRIGADE_RU.get(i.brigade_status, i.brigade_status)}"
            if i.escalated:
                row += ", ЭСКАЛАЦИЯ (не принят вовремя)"
            lines.append(row)
        if focus is not None:
            logs = L._logs(s, focus)[-6:]
            if logs:
                lines.append(f"Хронология инцидента №{focus.id}: " + "; ".join(f"{l.action}" + (f" ({l.comment})" if l.comment else "") for l in logs))
    else:
        lines.append("Открытых инцидентов нет.")

    bad = [d for d in devs if d.state not in ("normal",)]
    sus = [d for d in devs if d.suspicious or (d.false_alarms or 0) >= 2]
    lines.append(f"Датчиков всего: {len(devs)}, не в норме: {len(bad)}.")
    for d in bad[:10]:
        seen = f", нет данных {_mins(d.last_seen)} мин" if d.state == "offline" and d.last_seen else ""
        lines.append(f"- {d.id} ({d.device_type}) в «{zn(d.zone_id)}»: {DSTATE_RU.get(d.state, d.state)}{seen}")
    if sus:
        lines.append("Подозрительные датчики (ложные срабатывания/странные значения): " +
                     ", ".join(f"{d.id} в «{zn(d.zone_id)}» (ложных: {d.false_alarms or 0})" for d in sus[:6]))

    if risk:
        lines.append("ИИ-прогноз риска возгорания на 60 мин (топ зон): " + "; ".join(
            f"«{r.get('zone') or zn(r.get('zone_id'))}» {round(r.get('prob', 0) * 100)}% ({r.get('level')})"
            + (f", признаки: {', '.join(map(str, (r.get('reasons') or [])[:3]))}" if r.get("reasons") else "") for r in risk))

    if people:
        cnt = {}
        for o in people:
            cnt[o.status] = cnt.get(o.status, 0) + 1
        hurt = [o for o in people if o.injury not in ("none", None)]
        lines.append(f"Люди на объекте: {len(people)}; по статусам: " + ", ".join(f"{L_PS.get(k, k)} {v}" for k, v in cnt.items())
                     + (f"; пострадавшие: {', '.join(f'{o.name} ({o.injury})' for o in hurt[:5])}" if hurt else "; пострадавших нет"))

    if role in ("technician", "responsible", "admin"):
        tasks = s.scalars(select(M.RepairTask).where(M.RepairTask.status == "open")).all()
        tasks = [t for t in tasks if any(d.id == t.device_id for d in devs)]
        today = date.today()
        overdue = [x for x in s.scalars(select(M.Inspection).where(M.Inspection.done_at.is_(None))).all()
                   if any(d.id == x.device_id for d in devs) and x.due_date and x.due_date < today]
        lines.append(f"Открытых задач на ремонт: {len(tasks)}" + (": " + "; ".join(f"{t.device_id} — {t.reason}" for t in tasks[:6]) if tasks else "")
                     + f". Просроченных проверок: {len(overdue)}" + (": " + ", ".join(x.device_id for x in overdue[:8]) if overdue else "") + ".")

    pp = site.passport or {}
    if pp and role in ("operator", "dispatcher", "responsible", "admin"):
        lab = {"entrances": "Входы", "hydrants": "Гидранты", "shutoffs": "Отключение", "hazards": "Опасности", "notes": "Примечания"}
        for k, title in lab.items():
            v = pp.get(k)
            if v:
                lines.append(f"{title}: " + ("; ".join(map(str, v)) if isinstance(v, list) else str(v))[:300])

    return {"site": site.name, "facts": "\n".join(lines), "open": len(incs), "bad": len(bad),
            "fire": any(i.level in ("fire", "gas") for i in incs)}


L_PS = {"idle": "на месте", "alerted": "оповещены", "evacuating": "эвакуируются", "evacuated": "эвакуированы",
        "incapacitated": "нужна помощь", "trapped": "заблокированы", "returning": "возвращаются"}


def build_prompt(role: str, ctx: dict, question: str, history: list[dict]) -> str:
    hist = "".join(f"{'Пользователь' if m.get('role') == 'user' else 'Ассистент'}: {str(m.get('text', ''))[:400]}\n" for m in history[-6:])
    return (f"Ты — ИИ-помощник системы пожарной безопасности TutinGuard. Собеседник: {ROLE_RU.get(role, role)}. {ROLE_TASK.get(role, '')}\n"
            "Правила: опирайся ТОЛЬКО на данные ниже и общие нормы пожарной безопасности; не выдумывай датчики, людей и цифры. "
            "Если данных не хватает — скажи об этом. Отвечай на языке вопроса, кратко (до 8 строк), можно списком. "
            "Реальный вызов 101 система в демо не отправляет — при пожаре напоминай позвонить в 101/112 самостоятельно.\n\n"
            f"ДАННЫЕ ОБЪЕКТА (актуально сейчас):\n{ctx['facts']}\n\n{hist}Пользователь: {question}\nАссистент:")


def fallback(role: str, ctx: dict, question: str) -> str:
    head = ("Локальная LLM сейчас недоступна — вот сводка по данным системы:\n")
    tip = {"operator": "При пожаре: примите тревогу, проверьте зону, при подтверждении — эвакуация и звонок 101.",
           "technician": "Начните с датчиков без связи и с просроченными проверками.",
           "responsible": "Проверьте открытые инциденты и просроченные проверки."}.get(role, "")
    return head + ctx["facts"] + ("\n\n" + tip if tip else "")


def stream(role: str, ctx: dict, question: str, history: list[dict]):
    """Yields text chunks. Falls back to the digest if Ollama is not configured or fails."""
    if not C.OLLAMA_URL:
        yield fallback(role, ctx, question)
        return
    body = json.dumps({"model": C.OLLAMA_MODEL, "prompt": build_prompt(role, ctx, question, history), "stream": True, "keep_alive": "60m",
                       "options": {"temperature": .2, "num_predict": int(os.getenv("OLLAMA_MAX_TOKENS", "350"))}}).encode()
    sent = False
    try:
        req = urllib.request.Request(C.OLLAMA_URL + "/api/generate", data=body, headers={"content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as r:
            for line in r:
                if not line.strip():
                    continue
                part = json.loads(line)
                if part.get("response"):
                    sent = True
                    yield part["response"]
                if part.get("done"):
                    break
    except Exception:
        if not sent:
            yield fallback(role, ctx, question)
        else:
            yield "\n\n[ответ прерван]"
