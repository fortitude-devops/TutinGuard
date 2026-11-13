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


class Ack(Msg):
    type: Literal["ack"]
    command_id: str
    ok: bool = True


IngestMsg = TypeAdapter(Annotated[Union[Hello, Telemetry, Event, Heartbeat, Occupant, Ack], Field(discriminator="type")])


# ---- REST bodies ----
class IncidentAction(BaseModel):
    actor: str = "operator"
    assignee_id: int | None = None
    result: Literal["confirmed_fire", "false_alarm", "test", "device_fault", "gas_leak", "checked_ok", "risk_cleared"] | None = None
    comment: str = ""


class CommandIn(BaseModel):
    site_id: str = "office-01"
    action: Literal["siren_on", "siren_off", "evacuation_on", "unlock_exits", "reset_device", "run_test", "reset_all"]
    zones: list[str] = []
    device_id: str | None = None
    actor: str = "operator"


class CloseTask(BaseModel):
    actor: str = "technician"
    comment: str = ""
