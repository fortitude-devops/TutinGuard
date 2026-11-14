export type Role = 'operator' | 'responsible' | 'technician' | 'dispatcher' | 'admin';
export interface User { id: number; name: string; username?: string; role: Role; role_ru: string; }
export interface Zone { zone_id: string; site_id: string; name: string; floor: number; type: string; max_people: number; polygon: [number, number][] | null; }
export interface Device {
  device_id: string; site_id: string; zone_id: string | null; device_type: string; model?: string; state: string;
  pos?: { x: number; y: number; z?: number } | null; last_values?: Record<string, number | boolean>; last_seen?: string | null;
  next_check?: string | null; false_alarms?: number; suspicious?: boolean;
  quality?: { warmup_s: number; invalid_values: number; baseline: Record<string, number> };
}
export interface Passport { entrances: string[]; hydrants: string[]; shutoffs: string[]; hazards: string[]; vulnerable: string[]; contacts: string[]; notes: string; }
export interface SiteSummary {
  site_id: string; name: string; address: string; kind: string; floors: number; alert_type: number; zones_count: number; devices_count: number;
  devices_offline: number; devices_alarm: number; open_incidents: number; responsible?: User | null; responsible_id?: number | null;
  passport?: Passport | null; city?: string; district?: string; lat?: number | null; lon?: number | null;
}
export interface Site extends SiteSummary { zones: Zone[]; devices: Device[]; }
export interface LogEntry { ts: string; action: string; comment: string; actor: string; }
export interface Brigade { status: string; status_ru: string; called_at?: string; arrived_at?: string; done_at?: string; travel_s?: number | null; eta_s?: number | null; }
export interface Incident {
  id: number; site_id: string; zone_id: string | null; kind: string; level: string; status: string; opened_at: string; closed_at?: string | null;
  device_ids?: string[]; repeat_count: number; assignee_id?: number | null; escalated?: boolean; reaction_s?: number | null; result?: string | null;
  comment?: string | null; log?: LogEntry[]; brigade?: Brigade | null;
}
export interface EventRow { id?: number; ts: string; site_id?: string; device_id?: string | null; zone_id?: string | null; event: string; }
export interface Occupant { occupant_id: string; name: string; status: string; zone_id?: string | null; pos?: { x: number; z: number } | null; fed_co: number; fed_heat: number; injury?: string; }
export interface Task { id: number; device_id: string; zone_id?: string | null; site_id?: string | null; reason: string; status: string; created_at: string; closed_at?: string | null; technician_id?: number | null; comment?: string; }
export interface Inspection { id: number; device_id: string; device_type?: string; zone_id?: string | null; site_id?: string | null; due_date: string; done_at?: string | null; overdue?: boolean; result?: string; }
export interface Risk { zone_id: string; prob: number; level: string; reasons?: string[]; }
