"""Login and roles. Passwords: PBKDF2-SHA256; sessions: random bearer tokens stored in the DB.

Roles (кейс: дежурный оператор, ответственный сотрудник, техник) + admin:
  operator     — принимает тревоги, назначает, закрывает, вызывает пожарных (DEMO), управляет оповещением
  responsible  — то же + реестр объектов, зон и датчиков, проверки
  technician   — задачи на ремонт и плановые проверки
  admin        — всё
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import timedelta

from fastapi import Depends, Header, HTTPException, Query
from sqlalchemy import select

from . import db as M
from .db import SessionLocal, utcnow

TOKEN_TTL_HOURS = int(os.getenv("TOKEN_TTL_HOURS", "72"))
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "demo")

ROLE_RU = {"operator": "Дежурный оператор", "responsible": "Ответственный сотрудник", "technician": "Техник", "admin": "Администратор",
           "dispatcher": "Диспетчер ЦОУ (город)"}

INCIDENT_ROLES = ("operator", "responsible", "admin")
REGISTRY_ROLES = ("responsible", "admin")
SERVICE_ROLES = ("technician", "responsible", "admin")


def hash_password(pw: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(8)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 120_000)
    return f"pbkdf2${salt}${dk.hex()}"


def check_password(pw: str, stored: str | None) -> bool:
    if not stored or not stored.startswith("pbkdf2$"):
        return False
    _, salt, _ = stored.split("$", 2)
    return hmac.compare_digest(hash_password(pw, salt), stored)


def user_dict(u: M.User) -> dict:
    return {"id": u.id, "name": u.name, "role": u.role, "role_ru": ROLE_RU.get(u.role, u.role), "phone": u.phone,
            "username": u.username, "active": u.active}


def login(username: str, password: str) -> dict | None:
    with SessionLocal() as s:
        u = s.scalar(select(M.User).where(M.User.username == username.strip().lower(), M.User.active.is_(True)))
        if u is None or not check_password(password, u.password_hash):
            return None
        tok = secrets.token_urlsafe(32)
        s.add(M.AuthToken(token=tok, user_id=u.id))
        s.commit()
        return {"token": tok, "user": user_dict(u)}


def logout(token: str):
    with SessionLocal() as s:
        t = s.get(M.AuthToken, token)
        if t:
            s.delete(t)
            s.commit()


def user_by_token(token: str | None) -> dict | None:
    if not token:
        return None
    with SessionLocal() as s:
        t = s.get(M.AuthToken, token)
        if t is None:
            return None
        from .logic import aware
        if aware(t.last_used) < utcnow() - timedelta(hours=TOKEN_TTL_HOURS):
            s.delete(t)
            s.commit()
            return None
        u = s.get(M.User, t.user_id)
        if u is None or not u.active:
            return None
        if (utcnow() - aware(t.last_used)).total_seconds() > 60:
            t.last_used = utcnow()
            s.commit()
        return user_dict(u)


def _token_from(authorization: str | None, token_q: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return token_q


def current_user(authorization: str | None = Header(None), token: str | None = Query(None, include_in_schema=False)) -> dict:
    u = user_by_token(_token_from(authorization, token))
    if u is None:
        raise HTTPException(401, "Нужно войти в систему")
    return u


def require(*roles: str):
    def dep(u: dict = Depends(current_user)) -> dict:
        if roles and u["role"] not in roles:
            raise HTTPException(403, f"Недостаточно прав: нужна роль {', '.join(ROLE_RU.get(r, r) for r in roles)}")
        return u
    return dep


def actor_name(u: dict) -> str:
    return f"{u['name']} ({ROLE_RU.get(u['role'], u['role']).lower()})"


DEMO_USERS = [
    ("operator", "Айдана Серікқызы", "operator", "+7 700 000 00 01"),
    ("responsible", "Марат Жумабеков", "responsible", "+7 700 000 00 02"),
    ("technician", "Саят Оспанов", "technician", "+7 700 000 00 03"),
    ("dispatcher", "Ержан Абдуллаев", "dispatcher", "+7 700 000 00 04"),
    ("admin", "Администратор системы", "admin", ""),
]


def seed_users(s):
    """Demo accounts (password DEMO_PASSWORD, default 'demo'). Older databases get usernames added in place."""
    existing = s.scalars(select(M.User)).all()
    by_role = {}
    for u in existing:
        by_role.setdefault(u.role, u)
    for username, name, role, phone in DEMO_USERS:
        u = s.scalar(select(M.User).where(M.User.username == username))
        if u is not None and not check_password(DEMO_PASSWORD, u.password_hash):
            u.password_hash = hash_password(DEMO_PASSWORD)  # DEMO_PASSWORD in .env is the source of truth for demo accounts
        if u is None:
            u = by_role.get(role) if by_role.get(role) is not None and by_role[role].username is None else None
            if u is None:
                u = M.User(name=name, role=role, phone=phone)
                s.add(u)
            u.username, u.name = username, name
            u.password_hash = hash_password(DEMO_PASSWORD)
            u.active = True
    s.commit()
