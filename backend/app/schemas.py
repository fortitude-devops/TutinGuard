"""Message contract v1.0 (see project doc, section 5). Unknown extra fields are allowed and ignored."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


class Msg(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)
    schema_: str = Field("1.0", alias="schema")
    ts: datetime | None = None
    site_id: str
    simulated: bool = True


class DeviceInfo(BaseModel):
    model_config = ConfigDict(extra="allow")
    device_id: str
    zone_id: str | None = None
    device_type: str
    model: str = ""
    pos: dict[str, float] | None = None


class Hello(Msg):
    type: Literal["hello"]
    role: str = "simulator"
    site_name: str | None = None
    session_id: str | None = None   # new id on page load / reset → previous session's incidents are closed
    zones: list[dict[str, Any]] = []
    devices: list[DeviceInfo] = []


class Telemetry(Msg):
    type: Literal["telemetry"]
    device_id: str
    zone_id: str | None = None
    device_type: str
    model: str = ""
    seq: int = 0
    values: dict[str, Any] = {}
    state: str = "normal"


class Event(Msg):
    type: Literal["event"]
    event_id: str = ""
    device_id: str
    zone_id: str | None = None
    event: Literal["pre_alarm", "alarm", "restore", "fault", "fault_cleared", "service_needed",
                   "manual_call", "test", "tamper"]
    category: str = ""
    prev_state: str | None = None
    state: str = "normal"
    value: dict[str, Any] | None = None
    threshold: dict[str, Any] | None = None
    source: str = "auto"


class HeartbeatItem(BaseModel):
    device_id: str
    seq: int = 0


class Heartbeat(Msg):
    type: Literal["heartbeat"]
    devices: list[HeartbeatItem] = []


class Occupant(Msg):
    type: Literal["occupant"]
    occupant_id: str
    name: str = ""
    zone_id: str | None = None
    pos: dict[str, float] | None = None
    status: Literal["idle", "alerted", "evacuating", "trapped", "evacuated", "incapacitated"] = "idle"
    exposure: dict[str, float] | None = None
    fed_co: float = 0
    fed_heat: float = 0
    injury: Literal["none", "light", "moderate", "severe", "critical"] = "none"


class Brigade(Msg):
    """DEMO fire brigade progress reported by the simulator (the call itself is never sent anywhere)."""
    type: Literal["brigade"]
    status: Literal["en_route", "arrived", "attack", "extinguished", "returning"]
    incident_id: int | None = None
    zone_id: str | None = None
    elapsed_s: float | None = None   # simulation seconds since the call


class Ack(Msg):
    type: Literal["ack"]
    command_id: str
    ok: bool = True


IngestMsg = TypeAdapter(Annotated[Union[Hello, Telemetry, Event, Heartbeat, Occupant, Brigade, Ack], Field(discriminator="type")])


# ---- REST bodies ----
class IncidentAction(BaseModel):
    actor: str = "operator"
    assignee_id: int | None = None
    result: Literal["confirmed_fire", "false_alarm", "test", "device_fault", "gas_leak", "checked_ok", "risk_cleared"] | None = None
    comment: str = ""


class CommandIn(BaseModel):
    site_id: str = "office-01"
    action: Literal["siren_on", "siren_off", "evacuation_on", "unlock_exits", "reset_device", "run_test", "reset_all",
                    "dispatch_brigade"]
    zones: list[str] = []
    device_id: str | None = None
    incident_id: int | None = None
    eta_s: int | None = None
    actor: str = "operator"


class CloseTask(BaseModel):
    actor: str = "technician"
    comment: str = ""


class LoginIn(BaseModel):
    username: str
    password: str


class SiteIn(BaseModel):
    site_id: str | None = Field(None, pattern=r"^[a-z0-9][a-z0-9\-_]{1,40}$")
    name: str = Field(min_length=2, max_length=200)
    address: str = ""
    kind: str = "office"
    floors: int = Field(1, ge=1, le=200)
    alert_type: int = Field(3, ge=1, le=5)
    responsible_id: int | None = None


class SitePatch(BaseModel):
    name: str | None = None
    address: str | None = None
    kind: str | None = None
    floors: int | None = Field(None, ge=1, le=200)
    alert_type: int | None = Field(None, ge=1, le=5)
    responsible_id: int | None = None


class ZoneIn(BaseModel):
    zone_id: str | None = Field(None, pattern=r"^[a-z0-9][a-z0-9\-_]{0,40}$")
    name: str = Field(min_length=1, max_length=200)
    type: str = "room"
    floor: int = 1
    max_people: int = 0
    polygon: list[list[float]] | None = None


class ZonePatch(BaseModel):
    name: str | None = None
    type: str | None = None
    floor: int | None = None
    max_people: int | None = None
    polygon: list[list[float]] | None = None


DEVICE_TYPES = Literal["smoke", "heat", "multi", "flame", "gas_lel", "gas_co", "manual", "panel"]


class DeviceIn(BaseModel):
    device_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9\-_]{1,40}$")
    site_id: str
    zone_id: str | None = None
    device_type: DEVICE_TYPES
    model: str = ""
    pos: dict[str, float] | None = None
    installed: str | None = None


class DevicePatch(BaseModel):
    zone_id: str | None = None
    device_type: DEVICE_TYPES | None = None
    model: str | None = None
    pos: dict[str, float] | None = None


class TaskIn(BaseModel):
    device_id: str
    reason: str = Field(min_length=2, max_length=200)
    technician_id: int | None = None


class TaskPatch(BaseModel):
    technician_id: int | None = None
    comment: str | None = None


class InspectionIn(BaseModel):
    device_id: str
    due_date: str
    technician_id: int | None = None
