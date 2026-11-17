// TutinGuard 3D scene: icons, theme and language for the HUD (shared settings with the operator app via localStorage).
(function () {
  const get = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const LANG = ['ru', 'kk', 'en'].includes(get('tg-lang', 'ru')) ? get('tg-lang', 'ru') : 'ru';
  const THEME = get('tg-theme', 'dark') === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = THEME;
  document.documentElement.lang = LANG;

  // Lucide-style stroke icons (24×24)
  const P = {
    truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    volume: '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.8"/>',
    mute: '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    walls: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 15h18"/>',
    top: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-14.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>', walk: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    table: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18"/>',
    list: '<path d="M3 12h.01M3 18h.01M3 6h.01M8 12h13M8 18h13M8 6h13"/>', x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    grid: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  };
  const icon = (n, s = 16) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
  const LOGO = '<svg width="26" height="26" viewBox="0 0 48 48" aria-hidden="true"><defs><mask id="tglm" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48"><rect width="48" height="48" fill="#fff"/><g transform="translate(24 24.5) scale(.74) translate(-24 -23.5)"><path d="M24 5 C26 12 34 16 34 27 C34 35.5 29.5 42 24 42 C18.5 42 14 35.5 14 27.5 C14 22 17 19 19 15 C20 19 21.5 21 23 21.5 C22 15 22.5 9 24 5 Z" fill="#000"/><g fill="#fff"><path d="M17 31 H20.5 V43 H17 Z"/><path d="M22 23 L25.5 21 V43 H22 Z"/><path d="M27 28 L30.5 30 V43 H27 Z"/></g></g></mask></defs><path d="M24 3 C30 3 36 4.5 41 7 V22 C41 33 33.5 40.5 24 45 C14.5 40.5 7 33 7 22 V7 C12 4.5 18 3 24 3 Z" fill="var(--bad)" mask="url(#tglm)"/></svg>';

  // HUD strings (scene logs stay in Russian: they are the panel's journal)
  const D = {
    kk: {
      'Объект': 'Нысан', 'Симуляция. Все данные тестовые.': 'Симуляция. Барлық деректер сынақ.', 'Сервер TutinGuard': 'TutinGuard сервері',
      'Пожарные (DEMO)': 'Өрт сөндірушілер (DEMO)', 'Источники опасности': 'Қауіп көздері', 'Управление': 'Басқару', 'Показания': 'Көрсеткіштер', 'Журнал': 'Журнал', 'Люди': 'Адамдар', 'Эвакуация': 'Эвакуация',
      'Сброс': 'Қалпына келтіру', 'Низкие стены': 'Аласа қабырғалар', 'Полные стены': 'Толық қабырғалар', 'Вид сверху': 'Жоғарыдан көрініс',
      'Вызвать пожарных (DEMO)': 'Өрт сөндірушілерді шақыру (DEMO)', 'Звук': 'Дыбыс', 'Оповещение (сирены) работает': 'Хабарлау (сиреналар) жұмыс істейді',
      'Скорость времени': 'Уақыт жылдамдығы', 'Показания по зонам': 'Аймақтар бойынша көрсеткіштер', 'Журнал событий': 'Оқиғалар журналы',
      'Люди (FED — доза дыма и тепла)': 'Адамдар (FED — түтін мен жылу дозасы)', 'норма': 'қалыпты', 'внимание': 'назар', 'тревога': 'дабыл',
      'нет связи': 'байланыс жоқ', 'источник опасности': 'қауіп көзі', 'Зона': 'Аймақ', 'Дым': 'Түтін', 'Загрузка сцены…': 'Сахна жүктелуде…',
      'Норма': 'Қалыпты', 'Внимание': 'Назар', 'ПОЖАР': 'ӨРТ', 'ГАЗ': 'ГАЗ', 'Неисправность': 'Ақаулық', 'подключено': 'қосылған', 'автономно': 'автономды',
      'подключение…': 'қосылуда…', 'нет связи ': 'байланыс жоқ ', 'нажмите, чтобы остановить': 'тоқтату үшін басыңыз', 'Тема': 'Тақырып', 'Язык': 'Тіл',
      'Пульт оператора': 'Оператор пульті', 'Пульт': 'Пульт',
      'Клик по комнате — приблизить. Клик по красной цифре — запустить источник. Клик по датчику — оборвать или вернуть связь. Колесо мыши — зум.':
        'Бөлмені басу — жақындату. Қызыл санды басу — көзді іске қосу. Датчикті басу — байланысты үзу не қайтару. Тышқан дөңгелегі — масштаб.',
    },
    en: {
      'Объект': 'Site', 'Симуляция. Все данные тестовые.': 'Simulation. All data is test data.', 'Сервер TutinGuard': 'TutinGuard server',
      'Пожарные (DEMO)': 'Fire brigade (DEMO)', 'Источники опасности': 'Hazards', 'Управление': 'Controls', 'Показания': 'Readings', 'Журнал': 'Log', 'Люди': 'People', 'Эвакуация': 'Evacuate',
      'Сброс': 'Reset', 'Низкие стены': 'Low walls', 'Полные стены': 'Full walls', 'Вид сверху': 'Top view',
      'Вызвать пожарных (DEMO)': 'Call fire brigade (DEMO)', 'Звук': 'Sound', 'Оповещение (сирены) работает': 'Alarm sounders enabled',
      'Скорость времени': 'Time speed', 'Показания по зонам': 'Readings by zone', 'Журнал событий': 'Event log',
      'Люди (FED — доза дыма и тепла)': 'People (FED — smoke and heat dose)', 'норма': 'normal', 'внимание': 'warning', 'тревога': 'alarm',
      'нет связи': 'offline', 'источник опасности': 'hazard', 'Зона': 'Zone', 'Дым': 'Smoke', 'Загрузка сцены…': 'Loading scene…',
      'Норма': 'Normal', 'Внимание': 'Warning', 'ПОЖАР': 'FIRE', 'ГАЗ': 'GAS', 'Неисправность': 'Fault', 'подключено': 'connected', 'автономно': 'standalone',
      'подключение…': 'connecting…', 'нет связи ': 'offline ', 'нажмите, чтобы остановить': 'click to stop', 'Тема': 'Theme', 'Язык': 'Language',
      'Пульт оператора': 'Operator console', 'Пульт': 'Console',
      'Клик по комнате — приблизить. Клик по красной цифре — запустить источник. Клик по датчику — оборвать или вернуть связь. Колесо мыши — зум.':
        'Click a room to zoom in. Click a red number to start a hazard. Click a detector to cut or restore its link. Mouse wheel zooms.',
    },
  };
  const t = (s) => (D[LANG] && D[LANG][s]) || s;
  function apply(root) {
    (root || document).querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n || el.textContent.trim()); });
    (root || document).querySelectorAll('[data-icon]').forEach((el) => { if (!el.querySelector('svg.ic')) el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); });
  }
  function setTheme(th) { put('tg-theme', th); document.documentElement.dataset.theme = th; window.dispatchEvent(new CustomEvent('tg-theme', { detail: th })); }
  function setLang(l) { put('tg-lang', l); location.reload(); }
  window.TGUI = { LANG, get theme() { return document.documentElement.dataset.theme; }, icon, LOGO, t, apply, setTheme, setLang };
})();
