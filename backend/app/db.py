"""Database models (SQLAlchemy 2.0). PostgreSQL in Docker; SQLite also works for quick local runs."""
from __future__ import annotations

import os
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tutinguard.db")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


TS = DateTime(timezone=True)


class Base(DeclarativeBase):
    pass


class Site(Base):
    __tablename__ = "sites"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(300), default="")
    alert_type: Mapped[int] = mapped_column(Integer, default=3)
    session_started_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)  # last simulator hello/reset
    session_id: Mapped[str | None] = mapped_column(String(40), nullable=True)        # simulator session (page load / reset)
    kind: Mapped[str] = mapped_column(String(40), default="office")                   # office | school | mall | warehouse ...
    floors: Mapped[int] = mapped_column(Integer, default=1)
    responsible_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(TS, nullable=True, default=utcnow)
    city: Mapped[str] = mapped_column(String(60), default="")
    district: Mapped[str] = mapped_column(String(80), default="")
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    passport: Mapped[dict | None] = mapped_column(JSON, nullable=True)   # pre-incident plan: entrances, hydrants, shut-offs, hazards


class Zone(Base):
    __tablename__ = "zones"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    site_id: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(200))
    floor: Mapped[int] = mapped_column(Integer, default=1)
    type: Mapped[str] = mapped_column(String(40), default="room")
    max_people: Mapped[int] = mapped_column(Integer, default=0)
    polygon: Mapped[list | None] = mapped_column(JSON, nullable=True)


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    site_id: Mapped[str] = mapped_column(String(64), index=True)
    zone_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    device_type: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(String(120), default="")
    pos: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    state: Mapped[str] = mapped_column(String(20), default="normal")
    last_seen: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    last_values: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    installed: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_check: Mapped[date | None] = mapped_column(Date, nullable=True)
    suspicious: Mapped[bool] = mapped_column(Boolean, default=False)
    false_alarms: Mapped[int] = mapped_column(Integer, default=0)


class Reading(Base):
    __tablename__ = "readings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    ts: Mapped[datetime] = mapped_column(TS, index=True, default=utcnow)
    values: Mapped[dict] = mapped_column(JSON)
    state: Mapped[str] = mapped_column(String(20), default="normal")
    vts: Mapped[datetime | None] = mapped_column(TS, index=True, nullable=True)  # sensor/simulation time (may run faster)


class Event(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(64), default="")
    ts: Mapped[datetime] = mapped_column(TS, index=True, default=utcnow)
    site_id: Mapped[str] = mapped_column(String(64), index=True)
    zone_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    event: Mapped[str] = mapped_column(String(32))
    category: Mapped[str] = mapped_column(String(32), default="")
    prev_state: Mapped[str | None] = mapped_column(String(20), nullable=True)
    state: Mapped[str | None] = mapped_column(String(20), nullable=True)
    value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="auto")


class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    site_id: Mapped[str] = mapped_column(String(64), index=True)
    zone_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    kind: Mapped[str] = mapped_column(String(20))            # fire | gas | fault | offline
    level: Mapped[str] = mapped_column(String(20))           # attention | fire | gas | fault
    status: Mapped[str] = mapped_column(String(20), default="new")  # new | acknowledged | assigned | checking | closed
    repeat_count: Mapped[int] = mapped_column(Integer, default=0)
    device_ids: Mapped[list] = mapped_column(JSON, default=list)
    opened_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    level_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    ack_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    result: Mapped[str | None] = mapped_column(String(32), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    assignee_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    escalated: Mapped[bool] = mapped_column(Boolean, default=False)
    # DEMO fire-brigade dispatch (no real call is ever made)
    brigade_status: Mapped[str | None] = mapped_column(String(20), nullable=True)  # called | en_route | arrived | attack | extinguished
    brigade_called_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    brigade_arrived_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    brigade_done_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    brigade_eta_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    brigade_travel_s: Mapped[int | None] = mapped_column(Integer, nullable=True)  # simulated travel time


class IncidentLog(Base):
    __tablename__ = "incident_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incident_id: Mapped[int] = mapped_column(Integer, index=True)
    ts: Mapped[datetime] = mapped_column(TS, default=utcnow)
    actor: Mapped[str] = mapped_column(String(80), default="system")
    action: Mapped[str] = mapped_column(String(40))
    comment: Mapped[str] = mapped_column(Text, default="")


class Occupant(Base):
    __tablename__ = "occupants"
    occupant_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    site_id: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(80), default="")
    zone_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="idle")
    injury: Mapped[str] = mapped_column(String(20), default="none")
    fed_co: Mapped[float] = mapped_column(Float, default=0)
    fed_heat: Mapped[float] = mapped_column(Float, default=0)
    pos: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    exposure: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class RepairTask(Base):
    __tablename__ = "repair_tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    reason: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    technician_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comment: Mapped[str] = mapped_column(Text, default="")


class Inspection(Base):
    __tablename__ = "inspections"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    due_date: Mapped[date] = mapped_column(Date)
    done_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    technician_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    result: Mapped[str] = mapped_column(String(200), default="")


class Command(Base):
    __tablename__ = "commands"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    ts: Mapped[datetime] = mapped_column(TS, default=utcnow)
    site_id: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    actor: Mapped[str] = mapped_column(String(80), default="system")
    acked: Mapped[bool] = mapped_column(Boolean, default=False)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(20))  # operator | responsible | technician | admin
    phone: Mapped[str] = mapped_column(String(32), default="")
    username: Mapped[str | None] = mapped_column(String(40), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class AuthToken(Base):
    __tablename__ = "auth_tokens"
    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    last_used: Mapped[datetime] = mapped_column(TS, default=utcnow)


class Risk(Base):
    """AI forecast history: one row per zone per evaluation."""
    __tablename__ = "risk"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(TS, index=True, default=utcnow)
    vts: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    site_id: Mapped[str] = mapped_column(String(64), index=True)
    zone_id: Mapped[str] = mapped_column(String(64), index=True)
    prob: Mapped[float] = mapped_column(Float)
    level: Mapped[str] = mapped_column(String(20))
    reasons: Mapped[list | None] = mapped_column(JSON, nullable=True)


class Forecast(Base):
    """An AI forecast that crossed the threshold; links to its 'risk' incident and records whether a fire followed."""
    __tablename__ = "forecasts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incident_id: Mapped[int] = mapped_column(Integer, index=True)
    site_id: Mapped[str] = mapped_column(String(64))
    zone_id: Mapped[str] = mapped_column(String(64), index=True)
    opened_vts: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    prob_max: Mapped[float] = mapped_column(Float, default=0)
    reasons: Mapped[list | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | confirmed | cleared | closed
    lead_min: Mapped[float | None] = mapped_column(Float, nullable=True)


class FireStation(Base):
    """Fire stations (demo): used to estimate travel distance and to group response times."""
    __tablename__ = "fire_stations"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    city: Mapped[str] = mapped_column(String(60), default="")
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)


class FireRecord(Base):
    """One fire for the city registry and the fire protocol: timeline, cause, consequences."""
    __tablename__ = "fire_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    city: Mapped[str] = mapped_column(String(60), index=True, default="")
    district: Mapped[str] = mapped_column(String(80), index=True, default="")
    site_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)   # connected TutinGuard object
    incident_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    object_name: Mapped[str] = mapped_column(String(200), default="")
    object_kind: Mapped[str] = mapped_column(String(40), index=True, default="residential")
    address: Mapped[str] = mapped_column(String(300), default="")
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    room: Mapped[str] = mapped_column(String(120), default="")
    cause: Mapped[str] = mapped_column(String(40), index=True, default="unknown")
    source: Mapped[str] = mapped_column(String(200), default="")
    detection: Mapped[str] = mapped_column(String(20), default="call")    # auto (TutinGuard) | call | patrol
    ignition_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    detected_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    call_at: Mapped[datetime] = mapped_column(TS, index=True)
    dispatched_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    arrived_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    localized_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    extinguished_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    station_id: Mapped[str] = mapped_column(String(20), default="")
    units: Mapped[int] = mapped_column(Integer, default=1)
    area_m2: Mapped[float] = mapped_column(Float, default=0)
    evacuated: Mapped[int] = mapped_column(Integer, default=0)
    rescued: Mapped[int] = mapped_column(Integer, default=0)
    injured: Mapped[int] = mapped_column(Integer, default=0)
    deaths: Mapped[int] = mapped_column(Integer, default=0)
    damage_kzt: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="closed")      # active | closed
    demo: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    protocol_text: Mapped[str | None] = mapped_column(Text, nullable=True)


def ensure_columns() -> None:
    """Tiny forward-only migration: add columns introduced after the first release to existing tables."""
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    T, S40, I, B = "TIMESTAMP WITH TIME ZONE", "VARCHAR(40)", "INTEGER", "BOOLEAN"
    wanted = {"sites": [("session_started_at", T), ("session_id", S40), ("kind", S40 + " DEFAULT 'office'"),
                        ("floors", I + " DEFAULT 1"), ("responsible_id", I), ("created_at", T),
                        ("city", "VARCHAR(60) DEFAULT ''"), ("district", "VARCHAR(80) DEFAULT ''"), ("lat", "FLOAT"), ("lon", "FLOAT"), ("passport", "JSON")],
              "readings": [("vts", T)],
              "incidents": [("brigade_status", "VARCHAR(20)"), ("brigade_called_at", T), ("brigade_arrived_at", T),
                            ("brigade_done_at", T), ("brigade_eta_s", I), ("brigade_travel_s", I)],
              "users": [("username", S40), ("password_hash", "VARCHAR(200)"), ("active", B + " DEFAULT TRUE")]}
    with engine.begin() as conn:
        for table, cols in wanted.items():
            if not insp.has_table(table):
                continue
            have = {c["name"] for c in insp.get_columns(table)}
            for name, sqltype in cols:
                if name not in have:
                    if engine.dialect.name == "sqlite":
                        sqltype = sqltype.replace("TIMESTAMP WITH TIME ZONE", "DATETIME").replace("TRUE", "1")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sqltype}"))
