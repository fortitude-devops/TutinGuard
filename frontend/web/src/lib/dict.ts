import type { Role } from './types';
export type Tone = 'fire' | 'warn' | 'ok' | 'info' | 'gas' | 'off' | 'ai';
export const KIND: Record<string, string> = { fire: 'Пожар', gas: 'Утечка газа', fault: 'Неисправность', offline: 'Нет связи', risk: 'AI-прогноз' };
export const LEVEL: Record<string, [string, Tone]> = { fire: ['Пожар', 'fire'], gas: ['Газ', 'gas'], attention: ['Внимание', 'warn'], forecast: ['Риск возгорания', 'ai'], fault: ['Неисправность', 'off'] };
export const STATUS: Record<string, [string, Tone]> = { new: ['Новый', 'fire'], acknowledged: ['Принят', 'warn'], assigned: ['Назначен', 'info'], checking: ['Проверка на месте', 'info'], closed: ['Закрыт', 'off'] };
export const RESULT: Record<string, string> = { confirmed_fire: 'Пожар подтверждён', false_alarm: 'Ложное срабатывание', checked_ok: 'Проверено, причина устранена', test: 'Тест / учения', device_fault: 'Неисправность датчика', gas_leak: 'Утечка газа подтверждена', risk_cleared: 'Риск снят', forecast_confirmed: 'Прогноз подтвердился', link_restored: 'Связь восстановлена' };
export const DSTATE: Record<string, [string, Tone]> = { normal: ['Норма', 'ok'], pre_alarm: ['Внимание', 'warn'], alarm: ['Тревога', 'fire'], offline: ['Нет связи', 'off'], fault: ['Неисправен', 'warn'], test: ['Тест', 'info'], disabled: ['Отключён', 'off'] };
export const DTYPE: Record<string, string> = { smoke: 'Дымовой', heat: 'Тепловой', multi: 'Мультисенсор', flame: 'Пламени', gas_lel: 'Газ CH₄', gas_co: 'Угарный газ CO', manual: 'Ручной (ИПР)', panel: 'Прибор (ППКП)' };
export const ZTYPE: Record<string, string> = { openspace: 'Опенспейс', meeting: 'Переговорная', office: 'Кабинет', server: 'Серверная', kitchen: 'Кухня', hall: 'Холл / коридор', room: 'Помещение', storage: 'Склад', classroom: 'Класс', stairs: 'Лестница', ward: 'Палата', shop: 'Магазин', food: 'Фуд-корт', laundry: 'Прачечная', wc: 'Санузел' };
export const SKIND: Record<string, string> = { office: 'Офис', school: 'Школа', mall: 'ТРЦ', warehouse: 'Склад', hospital: 'Больница', residential: 'Жилой дом', dorm: 'Общежитие', kindergarten: 'Детский сад', other: 'Другое' };
export const ACTION: Record<string, string> = { created: 'Создан', repeat: 'Повторный сигнал', confirmed: 'Подтверждён', ack: 'Принят', assign: 'Назначен', checking: 'Проверка на месте', close: 'Закрыт', escalated: 'Автоэскалация', auto_close: 'Закрыт автоматически', forecast: 'AI-прогноз', ai_forecast: 'AI предупредил', brigade_called: 'Вызов 101 (DEMO)', brigade_en_route: 'Бригада в пути', brigade_arrived: 'Бригада прибыла', brigade_attack: 'Тушение', brigade_extinguished: 'Ликвидирован', brigade_returning: 'Бригада убывает', spread: 'Распространение', warmup: 'Прогрев датчика' };
export const PSTATUS: Record<string, string> = { idle: 'на месте', alerted: 'оповещён', evacuating: 'эвакуируется', evacuated: 'эвакуирован', incapacitated: 'нужна помощь', trapped: 'заблокирован', returning: 'возвращается на место' };
export const INJ: Record<string, string> = { none: '', light: 'лёгкое', moderate: 'среднее', severe: 'тяжёлое', critical: 'критическое' };
export const EVRU: Record<string, [string, Tone]> = {
  alarm: ['Тревога', 'fire'], pre_alarm: ['Внимание', 'warn'], restore: ['Норма', 'ok'], offline: ['Нет связи', 'off'], link_restored: ['Связь восстановлена', 'ok'],
  fault: ['Неисправность', 'warn'], fault_cleared: ['Исправен', 'ok'], sim_connected: ['Симулятор подключился', 'info'], manual_call: ['Ручной вызов', 'fire'],
  fire_confirmed: ['Пожар подтверждён прибором', 'fire'], invalid_value: ['Недостоверное значение отброшено', 'warn'], brigade_en_route: ['Бригада в пути', 'warn'], brigade_arrived: ['Бригада прибыла', 'warn'],
  brigade_attack: ['Тушение', 'warn'], brigade_extinguished: ['Пожар ликвидирован', 'ok'], brigade_returning: ['Бригада убывает', 'info'],
};
export const CMD_RU: Record<string, string> = { siren_on: 'включить сирены', siren_off: 'выключить сирены', evacuation_on: 'эвакуация', unlock_exits: 'разблокировать выходы', reset_device: 'сброс датчика', run_test: 'тест оповещения', reset_all: 'сброс симуляции', dispatch_brigade: 'направить бригаду (DEMO)', demo_scenario: 'презентация: запуск сценария' };
export const CAUSE_COL: Record<string, string> = { electrical: '#f59e0b', smoking: '#ef4444', heater: '#fb7185', cooking: '#f97316', battery: '#a855f7', children: '#22d3ee', arson: '#dc2626', grass: '#84cc16', gas: '#8b5cf6', unknown: '#94a3b8' };
export const SCENE_OF: Record<string, string> = { 'office-01': 'office', 'kzo-school-12': 'school', 'kzo-hospital-1': 'hospital', 'kzo-mall-1': 'mall', 'kzo-dorm-3': 'dorm' };
export const OPEN = ['new', 'acknowledged', 'assigned', 'checking'];

export type View = 'city' | 'overview' | 'incidents' | 'plan' | 'devices' | 'service' | 'ai' | 'journal' | 'reports' | 'registry';
export const ROLE_NAV: Record<Role, View[]> = {
  operator: ['overview', 'incidents', 'plan', 'devices', 'ai', 'journal', 'reports'],
  responsible: ['overview', 'incidents', 'plan', 'devices', 'service', 'ai', 'journal', 'reports', 'registry'],
  technician: ['service', 'devices', 'plan', 'journal'],
  admin: ['city', 'overview', 'incidents', 'plan', 'devices', 'service', 'ai', 'journal', 'reports', 'registry'],
  dispatcher: ['city', 'overview', 'incidents', 'plan', 'journal'],
};
export const VIEW_TITLE: Record<View, string> = { city: 'Город', overview: 'Обзор', incidents: 'Инциденты', plan: 'План объекта', devices: 'Устройства', service: 'Обслуживание', ai: 'AI-прогноз', journal: 'Журнал', reports: 'Отчёты', registry: 'Объекты' };
export const VIEW_SUB: Partial<Record<View, string>> = { city: 'Центр мониторинга г. Кызылорда', registry: 'Объекты, зоны, датчики и паспорт объекта' };
const CAN = { incident: ['operator', 'responsible', 'admin'], registry: ['responsible', 'admin'], service: ['technician', 'responsible', 'admin'], city: ['dispatcher', 'admin', 'responsible', 'operator'] } as const;
export const can = (what: keyof typeof CAN, role?: Role) => !!role && (CAN[what] as readonly string[]).includes(role);
export const toneVar = (t: Tone) => (t === 'ai' ? 'var(--accent)' : `var(--${t})`);
